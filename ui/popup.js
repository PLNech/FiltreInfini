/**
 * Browser action popup for FiltreInfini
 * Shows model loading status and quick actions
 */

// Poll model status from model preloader (if available in manager page)
let statusInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateModelStatus();

  // Poll status every 2 seconds
  statusInterval = setInterval(updateModelStatus, 2000);
});

function setupEventListeners() {
  document.getElementById('open-manager').addEventListener('click', () => {
    browser.tabs.create({
      url: browser.runtime.getURL('ui/manager.html')
    });
    window.close();
  });

  document.getElementById('preload-models').addEventListener('click', async () => {
    const btn = document.getElementById('preload-models');
    btn.disabled = true;
    btn.querySelector('.menu-item-title').textContent = 'Loading...';

    try {
      // Open manager page which will trigger model pre-loading
      await browser.tabs.create({
        url: browser.runtime.getURL('ui/manager.html')
      });
      window.close();
    } catch (error) {
      console.error('[Popup] Failed to open manager:', error);
      btn.disabled = false;
      btn.querySelector('.menu-item-title').textContent = 'Pre-load Models';
    }
  });
}

async function updateModelStatus() {
  try {
    // Try to get status from storage (updated by model-preloader in manager page)
    const status = await browser.storage.local.get('modelStatus');

    if (status.modelStatus) {
      updateModelBadges(status.modelStatus);
    } else {
      // Default: all pending
      updateModelBadges({
        embeddings: { status: 'pending' },
        classification: { status: 'pending' },
        ner: { status: 'pending' }
      });
    }
  } catch (error) {
    console.error('[Popup] Failed to get model status:', error);
  }
}

function updateModelBadges(modelStatus) {
  for (const [modelKey, data] of Object.entries(modelStatus)) {
    const badge = document.getElementById(`status-${modelKey}`);
    if (!badge) continue;

    const status = data.status || 'pending';

    // Remove all status classes
    badge.classList.remove('pending', 'loading', 'downloading', 'ready', 'error');

    // Add current status class
    badge.classList.add(status);

    // Update text
    switch (status) {
      case 'pending':
        badge.textContent = 'Pending';
        break;
      case 'loading':
        badge.textContent = 'Loading...';
        break;
      case 'downloading':
        const progress = data.progress || 0;
        badge.textContent = `${Math.round(progress)}%`;
        break;
      case 'ready':
        badge.textContent = '✓ Ready';
        break;
      case 'error':
        badge.textContent = '✗ Error';
        break;
      default:
        badge.textContent = status;
    }
  }
}

// Cleanup on unload
window.addEventListener('unload', () => {
  if (statusInterval) {
    clearInterval(statusInterval);
  }
});

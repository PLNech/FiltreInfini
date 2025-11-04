/**
 * Settings UI Controller
 */

(async function() {
  // DOM Elements
  const historyEnabledToggle = document.getElementById('history-enabled-toggle');
  const historySettings = document.getElementById('history-settings');
  const historyFeatures = document.getElementById('history-features');
  const exclusionControls = document.getElementById('exclusion-controls');

  const timeRangeSelect = document.getElementById('time-range-select');
  const minVisitsSelect = document.getElementById('min-visits-select');
  const sessionGapSelect = document.getElementById('session-gap-select');

  const featureEnrichToggle = document.getElementById('feature-enrich-toggle');
  const featureReferrerToggle = document.getElementById('feature-referrer-toggle');
  const featureTimelineToggle = document.getElementById('feature-timeline-toggle');
  const featureCooccurrenceToggle = document.getElementById('feature-cooccurrence-toggle');

  const excludeDomainInput = document.getElementById('exclude-domain-input');
  const addExcludeBtn = document.getElementById('add-exclude-btn');
  const excludedDomainsList = document.getElementById('excluded-domains-list');

  const statDomains = document.getElementById('stat-domains');
  const statCooccurrence = document.getElementById('stat-cooccurrence');
  const statSessions = document.getElementById('stat-sessions');
  const statUpdated = document.getElementById('stat-updated');

  const refreshStatsBtn = document.getElementById('refresh-stats-btn');
  const reanalyzeBtn = document.getElementById('reanalyze-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const resetSettingsBtn = document.getElementById('reset-settings-btn');
  const backBtn = document.getElementById('back-btn');

  // Initialize
  let currentSettings = await window.historySettings.get();
  loadSettings(currentSettings);
  loadStorageStats();

  // Event Listeners
  historyEnabledToggle.addEventListener('click', async () => {
    const enabled = !currentSettings.enabled;

    // Update toggle immediately for responsiveness
    historyEnabledToggle.classList.toggle('active', enabled);

    currentSettings = await window.historySettings.set({ enabled });
    updateUI();

    if (enabled) {
      // Trigger initial analysis
      await triggerAnalysis();
    }
  });

  timeRangeSelect.addEventListener('change', async () => {
    currentSettings = await window.historySettings.set({ timeRange: timeRangeSelect.value });
  });

  minVisitsSelect.addEventListener('change', async () => {
    currentSettings = await window.historySettings.set({ minVisitsForStats: parseInt(minVisitsSelect.value, 10) });
  });

  sessionGapSelect.addEventListener('change', async () => {
    currentSettings = await window.historySettings.set({ sessionGapMinutes: parseInt(sessionGapSelect.value, 10) });
  });

  featureEnrichToggle.addEventListener('click', async () => {
    const enrichTabCards = !currentSettings.features.enrichTabCards;
    currentSettings = await window.historySettings.set({
      features: { ...currentSettings.features, enrichTabCards }
    });
    featureEnrichToggle.classList.toggle('active', enrichTabCards);
  });

  featureReferrerToggle.addEventListener('click', async () => {
    const showReferrerChains = !currentSettings.features.showReferrerChains;
    currentSettings = await window.historySettings.set({
      features: { ...currentSettings.features, showReferrerChains }
    });
    featureReferrerToggle.classList.toggle('active', showReferrerChains);
  });

  featureTimelineToggle.addEventListener('click', async () => {
    const enableTimeline = !currentSettings.features.enableTimeline;
    currentSettings = await window.historySettings.set({
      features: { ...currentSettings.features, enableTimeline }
    });
    featureTimelineToggle.classList.toggle('active', enableTimeline);
  });

  featureCooccurrenceToggle.addEventListener('click', async () => {
    const enableCoOccurrence = !currentSettings.features.enableCoOccurrence;
    currentSettings = await window.historySettings.set({
      features: { ...currentSettings.features, enableCoOccurrence }
    });
    featureCooccurrenceToggle.classList.toggle('active', enableCoOccurrence);
  });

  addExcludeBtn.addEventListener('click', async () => {
    const domain = excludeDomainInput.value.trim().toLowerCase();
    if (!domain) return;

    // Validate domain format
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      alert('Invalid domain format. Example: example.com');
      return;
    }

    await window.historySettings.excludeDomain(domain);
    currentSettings = await window.historySettings.get();
    excludeDomainInput.value = '';
    renderExcludedDomains();
  });

  excludeDomainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addExcludeBtn.click();
    }
  });

  refreshStatsBtn.addEventListener('click', loadStorageStats);

  reanalyzeBtn.addEventListener('click', async () => {
    reanalyzeBtn.disabled = true;
    reanalyzeBtn.textContent = '⏳ Analyzing...';

    try {
      await triggerAnalysis();
      await loadStorageStats();
      alert('History analysis complete!');
    } catch (error) {
      console.error('Reanalysis failed:', error);
      alert('Analysis failed: ' + error.message);
    } finally {
      reanalyzeBtn.disabled = false;
      reanalyzeBtn.textContent = '🔬 Reanalyze Now';
    }
  });

  clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete all locally stored history analysis data? This will NOT delete your browser history - only the aggregated statistics we computed. This cannot be undone.')) {
      return;
    }

    try {
      await window.historyStorage.clearAll();
      await loadStorageStats();
      alert('All locally stored history analysis data cleared successfully. Your browser history remains untouched.');
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('Failed to clear data: ' + error.message);
    }
  });

  resetSettingsBtn.addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) {
      return;
    }

    currentSettings = await window.historySettings.reset();
    loadSettings(currentSettings);
    alert('Settings reset to defaults.');
  });

  backBtn.addEventListener('click', () => {
    window.location.href = 'manager.html';
  });

  // Functions
  function loadSettings(settings) {
    currentSettings = settings;

    // Main toggle
    historyEnabledToggle.classList.toggle('active', settings.enabled);

    // Controls
    timeRangeSelect.value = settings.timeRange;
    minVisitsSelect.value = settings.minVisitsForStats;
    sessionGapSelect.value = settings.sessionGapMinutes;

    // Feature toggles
    featureEnrichToggle.classList.toggle('active', settings.features.enrichTabCards);
    featureReferrerToggle.classList.toggle('active', settings.features.showReferrerChains);
    featureTimelineToggle.classList.toggle('active', settings.features.enableTimeline);
    featureCooccurrenceToggle.classList.toggle('active', settings.features.enableCoOccurrence);

    // Excluded domains
    renderExcludedDomains();

    updateUI();
  }

  function updateUI() {
    const enabled = currentSettings.enabled;

    if (enabled) {
      historySettings.classList.remove('disabled-overlay');
      historyFeatures.classList.remove('disabled-overlay');
      exclusionControls.classList.remove('disabled-overlay');
    } else {
      historySettings.classList.add('disabled-overlay');
      historyFeatures.classList.add('disabled-overlay');
      exclusionControls.classList.add('disabled-overlay');
    }
  }

  function renderExcludedDomains() {
    const domains = currentSettings.excludeDomains || [];

    if (domains.length === 0) {
      excludedDomainsList.innerHTML = '<p style="text-align: center; color: #999; margin: 8px 0;">No excluded domains yet</p>';
      return;
    }

    excludedDomainsList.innerHTML = domains.map(domain => `
      <div class="domain-item">
        <span>${domain}</span>
        <button class="domain-item__remove" data-domain="${domain}">×</button>
      </div>
    `).join('');

    // Add remove handlers
    excludedDomainsList.querySelectorAll('.domain-item__remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const domain = btn.dataset.domain;
        await window.historySettings.includeDomain(domain);
        currentSettings = await window.historySettings.get();
        renderExcludedDomains();
      });
    });
  }

  async function loadStorageStats() {
    try {
      const stats = await window.historyStorage.getStats();

      statDomains.textContent = stats.domains.toLocaleString();
      statCooccurrence.textContent = stats.coOccurrences.toLocaleString();
      statSessions.textContent = stats.sessions.toLocaleString();

      if (stats.updatedAt && stats.updatedAt > 0) {
        const date = new Date(stats.updatedAt);
        statUpdated.textContent = date.toLocaleString();
      } else {
        statUpdated.textContent = 'Never';
      }
    } catch (error) {
      console.error('Failed to load storage stats:', error);
      statDomains.textContent = 'Error';
      statCooccurrence.textContent = 'Error';
      statSessions.textContent = 'Error';
      statUpdated.textContent = 'Error';
    }
  }

  async function triggerAnalysis() {
    try {
      await browser.runtime.sendMessage({
        type: 'HISTORY_REANALYZE',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to trigger analysis:', error);
      throw error;
    }
  }
})();

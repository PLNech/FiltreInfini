/**
 * Background Service Worker (Manifest V3)
 * Handles:
 * - Opening the tab manager page when extension icon is clicked
 * - Auto-cleanup of Bin tabs via alarms API
 * - Cleanup of orphaned storage entries
 */

// Open manager page when extension icon is clicked
browser.action.onClicked.addListener(() => {
  browser.tabs.create({
    url: browser.runtime.getURL('ui/manager.html')
  });
});

// Set up periodic cleanup alarm (runs every 6 hours)
browser.runtime.onInstalled.addListener(() => {
  console.log('FiltreInfini installed/updated');

  // Create alarm for periodic cleanup
  browser.alarms.create('cleanup-bin', {
    periodInMinutes: 360 // 6 hours
  });

  console.log('Cleanup alarm created');
});

// Handle alarms
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup-bin') {
    console.log('Running scheduled Bin cleanup...');

    try {
      // Note: We need to create instances here since this is a separate context
      // Import the classes by loading the scripts
      await import('../lib/storage.js');
      await import('../lib/group-manager.js');

      const deletedIds = await groupManager.cleanupBin();
      console.log(`Cleaned up ${deletedIds.length} tabs from Bin`);

      // Also cleanup orphaned storage entries
      const orphanedCount = await groupManager.cleanupOrphanedEntries();
      console.log(`Cleaned up ${orphanedCount} orphaned storage entries`);
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
});

// Handle tab removal - cleanup storage
browser.tabs.onRemoved.addListener(async (tabId) => {
  const key = `tab-${tabId}`;

  try {
    await browser.storage.local.remove(key);
  } catch (error) {
    console.error(`Failed to cleanup storage for tab ${tabId}:`, error);
  }
});

console.log('FiltreInfini background script loaded');

// TODO: Add badge with tab count in Bin?
// TODO: Add notifications when tabs are auto-deleted from Bin?

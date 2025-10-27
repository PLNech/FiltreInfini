/**
 * Background Service Worker (Manifest V3)
 * Handles:
 * - Opening the tab manager page when extension icon is clicked
 * - Auto-cleanup of Bin tabs via alarms API
 * - Cleanup of orphaned storage entries
 * - Background tab discovery (Firefox Android workaround)
 */

/**
 * Progressive Tab Discovery (Firefox Android Workaround)
 *
 * Problem: browser.tabs.query() doesn't return unloaded tabs on Firefox Android
 * Solution: Track tabs progressively as user interacts with them
 *
 * This tracker:
 * - Listens to tab lifecycle events (onActivated, onCreated, onUpdated, onRemoved)
 * - Builds a persistent database of discovered tabs
 * - Provides stats on discovery progress
 * - Merges discovered tabs with currently visible tabs
 */
class ProgressiveTabTracker {
  constructor() {
    this.knownTabs = new Map();
    this.stats = {
      totalDiscovered: 0,
      firstSeen: null,
      lastActivity: null
    };
  }

  async init() {
    // Load known tabs from storage
    await this.loadFromStorage();

    // Set up event listeners
    this.setupListeners();

    // Discover currently visible tabs
    await this.discoverVisibleTabs();

    console.log(`Progressive tab tracker initialized. ${this.knownTabs.size} tabs in database.`);
  }

  async loadFromStorage() {
    const { knownTabs, trackerStats } = await browser.storage.local.get(['knownTabs', 'trackerStats']);

    if (knownTabs) {
      this.knownTabs = new Map(knownTabs);
    }

    if (trackerStats) {
      this.stats = trackerStats;
    } else {
      this.stats.firstSeen = Date.now();
    }
  }

  async saveToStorage() {
    this.stats.lastActivity = Date.now();
    await browser.storage.local.set({
      knownTabs: Array.from(this.knownTabs.entries()),
      trackerStats: this.stats
    });
  }

  setupListeners() {
    // Track when user switches to a tab (most important for Android!)
    browser.tabs.onActivated.addListener(async ({ tabId }) => {
      try {
        const tab = await browser.tabs.get(tabId);
        await this.trackTab(tab, 'activated');
      } catch (error) {
        console.error(`Failed to track activated tab ${tabId}:`, error);
      }
    });

    // Track new tabs
    browser.tabs.onCreated.addListener(async (tab) => {
      await this.trackTab(tab, 'created');
    });

    // Track tab updates (URL changes, title changes)
    browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl) {
        await this.trackTab(tab, 'updated');
      }
    });

    // Clean up removed tabs
    browser.tabs.onRemoved.addListener(async (tabId) => {
      this.knownTabs.delete(tabId);
      await this.saveToStorage();
      console.log(`Tab ${tabId} removed from tracker`);
    });
  }

  async discoverVisibleTabs() {
    // Query whatever tabs ARE visible (works on both desktop and Android)
    try {
      const visibleTabs = await browser.tabs.query({});
      console.log(`Discovered ${visibleTabs.length} visible tabs`);

      for (const tab of visibleTabs) {
        await this.trackTab(tab, 'initial_scan');
      }
    } catch (error) {
      console.error('Failed to discover visible tabs:', error);
    }
  }

  async trackTab(tab, source) {
    // Skip internal browser pages
    if (tab.url && (tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:'))) {
      return;
    }

    const existingTab = this.knownTabs.get(tab.id);
    const now = Date.now();

    this.knownTabs.set(tab.id, {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      lastAccessed: tab.lastAccessed || now,
      firstSeen: existingTab?.firstSeen || now,
      lastUpdated: now,
      source: source
    });

    // Update stats
    if (!existingTab) {
      this.stats.totalDiscovered++;
      if (this.stats.totalDiscovered % 10 === 0) {
        console.log(`Discovered ${this.stats.totalDiscovered} tabs so far...`);
      }
    }

    await this.saveToStorage();
  }

  async getKnownTabs() {
    return Array.from(this.knownTabs.values());
  }

  async getStats() {
    return {
      ...this.stats,
      currentCount: this.knownTabs.size
    };
  }

  async reset() {
    this.knownTabs.clear();
    this.stats = {
      totalDiscovered: 0,
      firstSeen: Date.now(),
      lastActivity: null
    };
    await browser.storage.local.remove(['knownTabs', 'trackerStats']);
    console.log('Progressive tab tracker reset');
  }
}

// Create global tracker instance
const tabTracker = new ProgressiveTabTracker();

// Open manager page when extension icon is clicked
browser.action.onClicked.addListener(() => {
  browser.tabs.create({
    url: browser.runtime.getURL('ui/manager.html')
  });
});

// Set up periodic cleanup alarm (runs every 6 hours)
browser.runtime.onInstalled.addListener(async (details) => {
  console.log('FiltreInfini installed/updated', details);

  // Create alarm for periodic cleanup
  browser.alarms.create('cleanup-bin', {
    periodInMinutes: 360 // 6 hours
  });

  console.log('Cleanup alarm created');

  // Initialize progressive tab tracker
  await tabTracker.init();
});

// Initialize tab tracker on browser startup
browser.runtime.onStartup.addListener(async () => {
  console.log('FiltreInfini starting up...');
  await tabTracker.init();
});

// Handle alarms
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup-bin') {
    console.log('Running scheduled Bin cleanup...');

    try {
      // Note: storage.js and group-manager.js are loaded via manifest.json background.scripts
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

// Handle tab URL changes - clear metadata cache
// When tab URL changes, old metadata is no longer valid
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    console.log(`Tab ${tabId} URL changed, clearing metadata cache`);

    try {
      await metadataStorage.clearMetadata(tabId);
    } catch (error) {
      console.error(`Failed to clear metadata for tab ${tabId}:`, error);
    }
  }
});

console.log('FiltreInfini background script loaded');

// TODO: Add badge with tab count in Bin?
// TODO: Add notifications when tabs are auto-deleted from Bin?

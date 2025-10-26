/**
 * Group Manager - Handles Main/Staging/Bin tab organization
 *
 * Storage format:
 * {
 *   "tab-{tabId}": {
 *     group: "main" | "staging" | "bin",
 *     dateSwiped: timestamp | null
 *   }
 * }
 */

class GroupManager {
  constructor() {
    this.GROUPS = {
      MAIN: 'main',
      STAGING: 'staging',
      BIN: 'bin'
    };
    this.BIN_DELETE_DELAY_DAYS = 2;
  }

  /**
   * Get the group for a specific tab
   * @param {number} tabId - Tab ID
   * @returns {Promise<string>} Group name (defaults to 'main')
   */
  async getGroup(tabId) {
    const key = `tab-${tabId}`;
    const data = await Storage.get(key);
    return data?.group || this.GROUPS.MAIN;
  }

  /**
   * Set the group for a specific tab
   * @param {number} tabId - Tab ID
   * @param {string} group - Group name ('main', 'staging', or 'bin')
   * @returns {Promise<void>}
   */
  async setGroup(tabId, group) {
    const key = `tab-${tabId}`;
    const metadata = {
      group,
      dateSwiped: group === this.GROUPS.BIN ? Date.now() : null
    };
    await Storage.set(key, metadata);
  }

  /**
   * Get all tabs in a specific group
   * @param {string} group - Group name
   * @returns {Promise<Array>} Array of tab objects with group metadata
   */
  async getTabsInGroup(group) {
    const allTabs = await browser.tabs.query({});
    const grouped = [];

    for (let tab of allTabs) {
      const tabGroup = await this.getGroup(tab.id);
      if (tabGroup === group) {
        grouped.push(tab);
      }
    }

    return grouped;
  }

  /**
   * Get counts for all groups
   * @returns {Promise<Object>} Object with counts for each group
   */
  async getGroupCounts() {
    const allTabs = await browser.tabs.query({});
    const counts = {
      total: allTabs.length,
      main: 0,
      staging: 0,
      bin: 0
    };

    for (let tab of allTabs) {
      const group = await this.getGroup(tab.id);
      counts[group]++;
    }

    return counts;
  }

  /**
   * Auto-delete tabs from Bin that are older than BIN_DELETE_DELAY_DAYS
   * Called by background script via alarms API
   * @returns {Promise<Array>} Array of deleted tab IDs
   */
  async cleanupBin() {
    const binTabs = await this.getTabsInGroup(this.GROUPS.BIN);
    const cutoff = Date.now() - (this.BIN_DELETE_DELAY_DAYS * 24 * 60 * 60 * 1000);
    const deletedIds = [];

    for (let tab of binTabs) {
      const key = `tab-${tab.id}`;
      const metadata = await Storage.get(key);

      if (metadata && metadata.dateSwiped && metadata.dateSwiped < cutoff) {
        try {
          await browser.tabs.remove(tab.id);
          await Storage.remove(key);
          deletedIds.push(tab.id);
        } catch (error) {
          console.error(`Failed to delete tab ${tab.id}:`, error);
        }
      }
    }

    return deletedIds;
  }

  /**
   * Clean up storage for tabs that no longer exist
   * @returns {Promise<number>} Number of orphaned entries cleaned
   */
  async cleanupOrphanedEntries() {
    const allTabs = await browser.tabs.query({});
    const existingTabIds = new Set(allTabs.map(tab => tab.id));
    const allData = await Storage.getAll();
    let cleanedCount = 0;

    for (let key in allData) {
      if (key.startsWith('tab-')) {
        const tabId = parseInt(key.split('-')[1]);
        if (!existingTabIds.has(tabId)) {
          await Storage.remove(key);
          cleanedCount++;
        }
      }
    }

    return cleanedCount;
  }
}

// Export singleton instance
const groupManager = new GroupManager();

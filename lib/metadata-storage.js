/**
 * Metadata Storage Manager
 * Handles caching and retrieval of tab metadata
 *
 * Storage format (extensible):
 * tab-{tabId}: {
 *   group, dateSwiped,  // Existing fields
 *   metadata: {
 *     fetchedAt: timestamp,
 *     version: 1,  // Schema version for migrations
 *
 *     // Basic (v1)
 *     httpCode: 200 | 404 | 500 | null,
 *     og: { title, description, image, type, siteName },
 *     meta: { description, keywords, author },
 *     content: { wordCount, readingTimeMinutes, language },
 *
 *     // Future iterations (not implemented yet):
 *     // nlp: { topics, entities, sentiment } - v2
 *     // summary: { oneSentence, oneParagraph } - v3
 *     // rawText: string (first 5000 chars) - v2
 *   }
 * }
 */

class MetadataStorage {
  /**
   * Get metadata for a tab
   * @param {number} tabId - Tab ID
   * @returns {Promise<Object|null>} Metadata or null if not cached
   */
  async getMetadata(tabId) {
    const key = `tab-${tabId}`;
    const data = await Storage.get(key);

    if (!data || !data.metadata) {
      return null;
    }

    return data.metadata;
  }

  /**
   * Check if metadata exists and is valid
   * @param {number} tabId - Tab ID
   * @returns {Promise<boolean>} True if cached metadata exists
   */
  async hasMetadata(tabId) {
    const metadata = await this.getMetadata(tabId);
    return metadata !== null && metadata.fetchedAt !== undefined;
  }

  /**
   * Save metadata for a tab
   * @param {number} tabId - Tab ID
   * @param {Object} metadata - Metadata object
   */
  async setMetadata(tabId, metadata) {
    const key = `tab-${tabId}`;
    const existingData = await Storage.get(key) || {};

    // Merge with existing data
    const updatedData = {
      ...existingData,
      metadata: {
        ...metadata,
        fetchedAt: Date.now()
      }
    };

    await Storage.set(key, updatedData);
  }

  /**
   * Clear metadata for a tab (e.g., on URL change)
   * @param {number} tabId - Tab ID
   */
  async clearMetadata(tabId) {
    const key = `tab-${tabId}`;
    const existingData = await Storage.get(key);

    if (existingData) {
      delete existingData.metadata;
      await Storage.set(key, existingData);
    }
  }

  /**
   * Get metadata for multiple tabs (batch)
   * @param {Array<number>} tabIds - Array of tab IDs
   * @returns {Promise<Object>} Map of tabId -> metadata
   */
  async getBatchMetadata(tabIds) {
    const results = {};

    for (const tabId of tabIds) {
      results[tabId] = await this.getMetadata(tabId);
    }

    return results;
  }

  /**
   * Get tabs missing metadata
   * @param {Array<Object>} tabs - Array of tab objects
   * @returns {Promise<Array<Object>>} Tabs without metadata
   */
  async getTabsNeedingMetadata(tabs) {
    const needsMetadata = [];

    for (const tab of tabs) {
      const hasCache = await this.hasMetadata(tab.id);
      if (!hasCache) {
        needsMetadata.push(tab);
      }
    }

    return needsMetadata;
  }

  /**
   * Purge metadata for closed tabs
   * Call this periodically to clean up storage
   */
  async purgeClosedTabs() {
    const allKeys = await Storage.getAll();
    const openTabs = await browser.tabs.query({});
    const openTabIds = new Set(openTabs.map(t => t.id));

    let purgedCount = 0;

    for (const key in allKeys) {
      if (key.startsWith('tab-')) {
        const tabId = parseInt(key.replace('tab-', ''));
        if (!openTabIds.has(tabId)) {
          await Storage.remove(key);
          purgedCount++;
        }
      }
    }

    console.log(`Purged metadata for ${purgedCount} closed tabs`);
    return purgedCount;
  }
}

// Export singleton instance
const metadataStorage = new MetadataStorage();

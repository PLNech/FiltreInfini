/**
 * Metadata Manager
 * Orchestrates metadata extraction and caching
 *
 * Design principles:
 * - Lazy loading: only fetch when needed
 * - Cache-first: never re-fetch unless forced
 * - Batch-friendly: can fetch multiple tabs efficiently
 * - Extensible: easy to add new metadata types
 */

class MetadataManager {
  constructor() {
    this.fetchQueue = [];
    this.isFetching = false;
    this.BATCH_SIZE = 5;  // Fetch max 5 tabs at once
    this.THROTTLE_MS = 100;  // Wait 100ms between batches
  }

  /**
   * Get metadata for a single tab
   * @param {number} tabId - Tab ID
   * @param {boolean} forceRefresh - Force re-fetch even if cached
   * @returns {Promise<Object|null>} Metadata or null
   */
  async getMetadata(tabId, forceRefresh = false) {
    // Check cache first
    if (!forceRefresh) {
      const cached = await metadataStorage.getMetadata(tabId);
      if (cached) {
        return cached;
      }
    }

    // Fetch fresh metadata
    return await this.fetchMetadata(tabId);
  }

  /**
   * Fetch metadata for a tab by injecting content script
   * @param {number} tabId - Tab ID
   * @returns {Promise<Object|null>} Metadata or null
   */
  async fetchMetadata(tabId) {
    try {
      // Send message to content script
      const response = await browser.tabs.sendMessage(tabId, {
        action: 'extractMetadata'
      });

      if (response && response.success) {
        // Cache the metadata
        await metadataStorage.setMetadata(tabId, response.metadata);
        return response.metadata;
      }

      return null;
    } catch (error) {
      // Content script not injected - try manual injection
      console.log(`Content script not loaded for tab ${tabId}, attempting manual injection...`);

      try {
        // Manually inject the content script
        await browser.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content-scripts/metadata-extractor.js']
        });

        // Wait a bit for script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Try again
        const response = await browser.tabs.sendMessage(tabId, {
          action: 'extractMetadata'
        });

        if (response && response.success) {
          await metadataStorage.setMetadata(tabId, response.metadata);
          return response.metadata;
        }
      } catch (injectError) {
        console.warn(`Failed to inject content script for tab ${tabId}:`, injectError.message);
        throw new Error(`Cannot access this tab (${injectError.message})`);
      }

      return null;
    }
  }

  /**
   * Get metadata for multiple tabs (batch)
   * @param {Array<number>} tabIds - Array of tab IDs
   * @param {boolean} forceRefresh - Force re-fetch
   * @returns {Promise<Object>} Map of tabId -> metadata
   */
  async getBatchMetadata(tabIds, forceRefresh = false) {
    const results = {};

    // Check cache for each tab
    for (const tabId of tabIds) {
      if (!forceRefresh) {
        const cached = await metadataStorage.getMetadata(tabId);
        if (cached) {
          results[tabId] = cached;
          continue;
        }
      }

      // Add to fetch queue
      this.fetchQueue.push(tabId);
    }

    // Process fetch queue in batches
    await this.processFetchQueue();

    // Collect results
    for (const tabId of tabIds) {
      if (!results[tabId]) {
        results[tabId] = await metadataStorage.getMetadata(tabId);
      }
    }

    return results;
  }

  /**
   * Process the fetch queue in batches with throttling
   */
  async processFetchQueue() {
    if (this.isFetching || this.fetchQueue.length === 0) {
      return;
    }

    this.isFetching = true;

    while (this.fetchQueue.length > 0) {
      // Take next batch
      const batch = this.fetchQueue.splice(0, this.BATCH_SIZE);

      // Fetch in parallel
      await Promise.all(
        batch.map(tabId => this.fetchMetadata(tabId))
      );

      // Throttle between batches
      if (this.fetchQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.THROTTLE_MS));
      }
    }

    this.isFetching = false;
  }

  /**
   * Prefetch metadata for visible tabs
   * Call this on idle to populate cache
   * @param {Array<Object>} tabs - Array of tab objects
   */
  async prefetchMetadata(tabs) {
    // Get tabs that need metadata
    const needsMetadata = await metadataStorage.getTabsNeedingMetadata(tabs);

    if (needsMetadata.length === 0) {
      console.log('All tabs have cached metadata');
      return;
    }

    console.log(`Prefetching metadata for ${needsMetadata.length} tabs`);

    const tabIds = needsMetadata.map(t => t.id);
    await this.getBatchMetadata(tabIds);
  }

  /**
   * Clear metadata cache for a tab
   * Call when tab URL changes
   * @param {number} tabId - Tab ID
   */
  async clearMetadata(tabId) {
    await metadataStorage.clearMetadata(tabId);
  }

  /**
   * Check if tab has HTTP error (404, 500, etc)
   * @param {number} tabId - Tab ID
   * @returns {Promise<boolean>} True if error detected
   */
  async hasBrokenTab(tabId) {
    const metadata = await this.getMetadata(tabId);
    if (!metadata || !metadata.httpCode) {
      return false;
    }

    return metadata.httpCode >= 400;
  }

  /**
   * Get reading time for a tab
   * @param {number} tabId - Tab ID
   * @returns {Promise<number|null>} Reading time in minutes
   */
  async getReadingTime(tabId) {
    const metadata = await this.getMetadata(tabId);
    return metadata?.content?.readingTimeMinutes || null;
  }
}

// Export singleton instance
const metadataManager = new MetadataManager();

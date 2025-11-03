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
      console.log(`[Metadata] Content script not loaded for tab ${tabId}, attempting manual injection...`);

      // Try 3 different injection methods (Firefox MV3 compatibility)
      const methods = [
        // Method 1: Chrome MV3 style (browser.scripting)
        async () => {
          console.log('[Metadata] Trying method 1: browser.scripting.executeScript');
          if (browser.scripting && browser.scripting.executeScript) {
            await browser.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content-scripts/metadata-extractor.js']
            });
            return 'browser.scripting.executeScript';
          }
          throw new Error('browser.scripting not available');
        },

        // Method 2: Firefox MV2 style (tabs.executeScript)
        async () => {
          console.log('[Metadata] Trying method 2: browser.tabs.executeScript');
          if (browser.tabs.executeScript) {
            await browser.tabs.executeScript(tabId, {
              file: 'content-scripts/metadata-extractor.js'
            });
            return 'browser.tabs.executeScript';
          }
          throw new Error('browser.tabs.executeScript not available');
        },

        // Method 3: Give up gracefully
        async () => {
          throw new Error('No injection method available');
        }
      ];

      let successMethod = null;

      for (const method of methods) {
        try {
          successMethod = await method();
          console.log(`[Metadata] ✓ Success with: ${successMethod}`);
          break;
        } catch (methodError) {
          console.log(`[Metadata] ✗ Method failed: ${methodError.message}`);
        }
      }

      if (!successMethod) {
        throw new Error('Cannot inject content script (no compatible API found)');
      }

      // Wait a bit for script to initialize
      await new Promise(resolve => setTimeout(resolve, 150));

      // Try again
      try {
        const response = await browser.tabs.sendMessage(tabId, {
          action: 'extractMetadata'
        });

        if (response && response.success) {
          await metadataStorage.setMetadata(tabId, response.metadata);
          return response.metadata;
        }
      } catch (retryError) {
        console.warn(`[Metadata] Failed to fetch after injection:`, retryError.message);
        throw new Error('Tab not accessible or blocked');
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
   * Fetch metadata directly from URL (for synced tabs without tab access)
   * @param {string} url - URL to fetch
   * @param {string} tabId - Pseudo tab ID for caching (e.g., synced-device-url)
   * @returns {Promise<Object|null>} Metadata or null
   */
  async fetchMetadataFromUrl(url, tabId) {
    try {
      console.log(`[Metadata] Fetching directly from URL: ${url}`);

      // Fetch HTML
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FiltreInfini/0.1.1)',
        },
        // Don't follow redirects indefinitely
        redirect: 'follow',
      });

      if (!response.ok) {
        console.warn(`[Metadata] HTTP ${response.status} for ${url}`);
        const metadata = {
          httpCode: response.status,
          error: `HTTP ${response.status}`,
        };
        await metadataStorage.setMetadata(tabId, metadata);
        return metadata;
      }

      const html = await response.text();
      const metadata = this.parseHtmlMetadata(html, url);
      metadata.httpCode = response.status;

      // Cache it
      await metadataStorage.setMetadata(tabId, metadata);
      return metadata;
    } catch (error) {
      console.warn(`[Metadata] Failed to fetch ${url}:`, error.message);
      const metadata = {
        error: error.message,
        httpCode: 0,
      };
      await metadataStorage.setMetadata(tabId, metadata);
      return metadata;
    }
  }

  /**
   * Parse HTML to extract metadata
   * @param {string} html - HTML content
   * @param {string} url - Original URL
   * @returns {Object} Extracted metadata
   */
  parseHtmlMetadata(html, url) {
    const metadata = {
      og: {},
      content: {},
    };

    // Extract Open Graph tags
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (ogTitleMatch) metadata.og.title = ogTitleMatch[1];

    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
    if (ogDescMatch) metadata.og.description = ogDescMatch[1];

    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImageMatch) metadata.og.image = ogImageMatch[1];

    const ogTypeMatch = html.match(/<meta\s+property=["']og:type["']\s+content=["']([^"']+)["']/i);
    if (ogTypeMatch) metadata.og.type = ogTypeMatch[1];

    // Extract standard meta tags
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    if (descMatch && !metadata.og.description) metadata.og.description = descMatch[1];

    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && !metadata.og.title) metadata.og.title = titleMatch[1];

    // Estimate reading time from content length
    const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textContent.split(/\s+/).length;
    metadata.content.readingTimeMinutes = Math.max(1, Math.round(wordCount / 200)); // 200 words per minute

    return metadata;
  }

  /**
   * Prefetch metadata for visible tabs
   * Call this on idle to populate cache
   * @param {Array<Object>} tabs - Array of tab objects (local or synced)
   */
  async prefetchMetadata(tabs) {
    // Get tabs that need metadata
    const needsMetadata = await metadataStorage.getTabsNeedingMetadata(tabs);

    if (needsMetadata.length === 0) {
      console.log('All tabs have cached metadata');
      return;
    }

    console.log(`Prefetching metadata for ${needsMetadata.length} tabs`);

    // Separate local vs synced tabs
    const localTabs = needsMetadata.filter(t => t.source === 'local');
    const syncedTabs = needsMetadata.filter(t => t.source === 'synced');

    // Fetch local tabs via content scripts
    if (localTabs.length > 0) {
      const tabIds = localTabs.map(t => t.id);
      await this.getBatchMetadata(tabIds);
    }

    // Fetch synced tabs via direct URL fetch
    if (syncedTabs.length > 0) {
      console.log(`[Metadata] Fetching ${syncedTabs.length} synced tabs via direct URL`);
      for (const tab of syncedTabs) {
        try {
          await this.fetchMetadataFromUrl(tab.url, tab.id);
        } catch (error) {
          console.warn(`[Metadata] Failed to fetch synced tab ${tab.id}:`, error);
        }
      }
    }
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

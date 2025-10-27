/**
 * Tab Query Engine
 * Executes queries against browser tabs using parsed filters
 */

class TabQuery {
  /**
   * Find tabs matching domain pattern
   * Supports wildcards: *example* or example.com
   * @param {string} pattern - Domain pattern to match
   * @returns {Promise<Array>} Matching tabs
   */
  async findByDomain(pattern) {
    // Remove protocol if present
    pattern = pattern.replace(/^https?:\/\//, '');

    const allTabs = await browser.tabs.query({});

    return allTabs.filter(tab => {
      try {
        const url = new URL(tab.url);
        const hostname = url.hostname;

        // Exact match
        if (hostname === pattern) {
          return true;
        }

        // Wildcard matching
        if (pattern.includes('*')) {
          const regex = new RegExp(
            '^' + pattern.replace(/\*/g, '.*') + '$'
          );
          return regex.test(hostname);
        }

        // Substring match
        return hostname.includes(pattern);
      } catch (error) {
        // Invalid URL (about:, file:, etc.)
        return false;
      }
    });
  }

  /**
   * Find tabs older than specified days
   * @param {number} olderThanDays - Number of days
   * @returns {Promise<Array>} Matching tabs
   */
  async findByAge(olderThanDays) {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const allTabs = await browser.tabs.query({});

    return allTabs.filter(tab => {
      // TODO: Verify tab.lastAccessed exists and is accurate in tests
      return tab.lastAccessed && tab.lastAccessed < cutoff;
    });
  }

  /**
   * Find tabs by title search
   * @param {string} searchTerm - Term to search for
   * @returns {Promise<Array>} Matching tabs
   */
  async findByTitle(searchTerm) {
    const allTabs = await browser.tabs.query({});
    const lowerSearch = searchTerm.toLowerCase();

    return allTabs.filter(tab =>
      tab.title.toLowerCase().includes(lowerSearch)
    );
  }

  /**
   * Find tabs by URL pattern
   * @param {string} pattern - URL pattern (can include wildcards)
   * @returns {Promise<Array>} Matching tabs
   */
  async findByUrl(pattern) {
    const allTabs = await browser.tabs.query({});

    return allTabs.filter(tab => {
      // Support wildcards
      if (pattern.includes('*')) {
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*') + '$'
        );
        return regex.test(tab.url);
      }

      // Substring match
      return tab.url.includes(pattern);
    });
  }

  /**
   * Execute query with multiple filters
   * Combines all filters with AND logic
   * @param {Object} filters - Parsed filters from QueryParser
   * @returns {Promise<Array>} Matching tabs
   */
  async executeQuery(filters) {
    let results = await browser.tabs.query({});

    // Apply domain filter
    if (filters.domain) {
      const domainTabs = await this.findByDomain(filters.domain);
      const domainIds = new Set(domainTabs.map(t => t.id));
      results = results.filter(tab => domainIds.has(tab.id));
    }

    // Apply age filter
    if (filters.age) {
      const { operator, days } = filters.age;
      results = results.filter(tab => {
        const tabAge = this.calculateAge(tab);

        switch (operator) {
          case '>':
            return tabAge > days;
          case '>=':
            return tabAge >= days;
          case '<':
            return tabAge < days;
          case '<=':
            return tabAge <= days;
          case '=':
            // For "age=today", match tabs accessed today (age 0)
            if (days === 0) {
              return tabAge === 0;
            }
            // For other cases, exact match
            return tabAge === days;
          default:
            return true;
        }
      });
    }

    // Apply title filter
    if (filters.title) {
      results = results.filter(tab =>
        tab.title.toLowerCase().includes(filters.title.toLowerCase())
      );
    }

    // Apply URL filter
    if (filters.url) {
      const urlTabs = await this.findByUrl(filters.url);
      const urlIds = new Set(urlTabs.map(t => t.id));
      results = results.filter(tab => urlIds.has(tab.id));
    }

    // Apply free text search with ranking (title > description > url)
    if (filters.text) {
      const lowerText = filters.text.toLowerCase();

      // Score each tab based on where the match occurs
      const scoredResults = await Promise.all(results.map(async (tab) => {
        let score = 0;
        const titleMatch = tab.title.toLowerCase().includes(lowerText);
        const urlMatch = tab.url.toLowerCase().includes(lowerText);

        // Get metadata to check description
        const metadata = await metadataStorage.getMetadata(tab.id);
        const descMatch = metadata && (
          (metadata.og?.description && metadata.og.description.toLowerCase().includes(lowerText)) ||
          (metadata.meta?.description && metadata.meta.description.toLowerCase().includes(lowerText))
        );

        // Ranking: title (100) > description (50) > url (10)
        if (titleMatch) score += 100;
        if (descMatch) score += 50;
        if (urlMatch) score += 10;

        return { tab, score };
      }));

      // Filter out tabs with no matches and sort by score
      results = scoredResults
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.tab);
    }

    return results;
  }

  /**
   * Check if a tab is internal (browser pages that can't be accessed)
   * @param {Object} tab - Tab object
   * @returns {boolean} True if internal
   */
  isInternalTab(tab) {
    const url = tab.url || '';
    const internalPrefixes = [
      'about:',
      'moz-extension:',
      'chrome:',
      'chrome-extension:',
      'edge:',
      'browser:',
      'view-source:'
    ];

    return internalPrefixes.some(prefix => url.startsWith(prefix));
  }

  /**
   * Get all tabs with computed metadata
   * Merges currently visible tabs with progressively tracked tabs (Android workaround)
   * @param {boolean} includeInternal - Include internal tabs (default: false)
   * @returns {Promise<Array>} All tabs with age, domain, etc.
   */
  async getAllTabsWithMetadata(includeInternal = false) {
    // Get currently visible tabs (limited on Android)
    const visibleTabs = await browser.tabs.query({});

    // Get tracked tabs from background script (progressive discovery)
    let knownTabs = [];
    try {
      const { knownTabs: stored } = await browser.storage.local.get('knownTabs');
      if (stored) {
        knownTabs = new Map(stored);
      }
    } catch (error) {
      console.warn('Failed to load tracked tabs:', error);
    }

    // Merge: prefer visible tabs (most up-to-date), fallback to tracked data
    const tabsById = new Map();

    // First, add all visible tabs
    visibleTabs.forEach(tab => {
      tabsById.set(tab.id, tab);
    });

    // Then, add tracked tabs that aren't currently visible
    // These are tabs the user cycled through before but aren't loaded now
    if (knownTabs.size > 0) {
      for (const [tabId, trackedTab] of knownTabs.entries()) {
        if (!tabsById.has(tabId)) {
          // Convert tracked tab format to browser tab format
          tabsById.set(tabId, {
            id: trackedTab.id,
            url: trackedTab.url,
            title: trackedTab.title,
            favIconUrl: trackedTab.favIconUrl,
            lastAccessed: trackedTab.lastAccessed,
            // Mark as tracked (not currently visible)
            _tracked: true,
            _trackedSource: trackedTab.source
          });
        }
      }
    }

    const allTabs = Array.from(tabsById.values());

    // Filter out internal tabs by default
    const filteredTabs = includeInternal
      ? allTabs
      : allTabs.filter(tab => !this.isInternalTab(tab));

    return filteredTabs.map(tab => {
      const age = this.calculateAge(tab);
      const domain = this.extractDomain(tab.url);

      return {
        ...tab,
        age,
        domain,
        ageFormatted: this.formatAge(age),
        isInternal: this.isInternalTab(tab)
      };
    });
  }

  /**
   * Calculate tab age in days
   * @param {Object} tab - Tab object
   * @returns {number} Age in days
   */
  calculateAge(tab) {
    if (!tab.lastAccessed) {
      return 0;
    }
    const ageMs = Date.now() - tab.lastAccessed;
    return Math.floor(ageMs / (24 * 60 * 60 * 1000));
  }

  /**
   * Format age for display
   * @param {number} days - Age in days
   * @returns {string} Formatted age string
   */
  formatAge(days) {
    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return '1 day';
    } else if (days < 7) {
      return `${days} days`;
    } else if (days < 30) {
      const weeks = Math.floor(days / 7);
      return weeks === 1 ? '1 week' : `${weeks} weeks`;
    } else if (days < 365) {
      const months = Math.floor(days / 30);
      return months === 1 ? '1 month' : `${months} months`;
    } else {
      const years = Math.floor(days / 365);
      return years === 1 ? '1 year' : `${years} years`;
    }
  }

  /**
   * Extract domain from URL
   * @param {string} url - Tab URL
   * @returns {string} Domain or 'unknown'
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Search tab content (requires content scripts)
   * TODO: Phase 2 - Implement with content scripts
   * @param {string} searchTerm - Term to search for in page content
   * @returns {Promise<Array>} Matching tabs
   */
  async findByContent(searchTerm) {
    throw new Error('Content search not implemented yet - requires content scripts');
  }
}

// Export singleton instance
const tabQuery = new TabQuery();

/**
 * History Enricher - Enrich tabs with history context
 *
 * Adds history badges to tab cards:
 * - Visit count (e.g., "156 visits")
 * - Last visit (e.g., "Last: 2h ago")
 * - Safe-to-close indicator (e.g., "✓ In history")
 * - Category badge (e.g., "Tech", "Shopping")
 */

class HistoryEnricher {
  constructor() {
    this.storage = null;
    this.settings = null;
    this.initialized = false;
  }

  /**
   * Initialize enricher
   */
  async init() {
    if (this.initialized) return;

    this.storage = typeof window !== 'undefined' ? window.historyStorage : historyStorage;
    this.settings = typeof window !== 'undefined' ? window.historySettings : historySettings;

    await this.storage.init();
    this.initialized = true;
  }

  /**
   * Enrich a single tab with history context
   *
   * @param {Object} tab - Browser tab object
   * @returns {Object} Enriched tab with history data
   */
  async enrichTab(tab) {
    await this.init();

    const settings = await this.settings.get();
    if (!settings.enabled || !settings.features.enrichTabCards) {
      return { ...tab, history: null };
    }

    try {
      const url = new URL(tab.url);
      const domain = url.hostname.toLowerCase();

      // Get domain stats from storage
      const domainStats = await this.storage.getDomainStats(domain);

      if (!domainStats) {
        return {
          ...tab,
          history: {
            domain,
            isNew: true,
            visitCount: 0,
            category: 'other',
            safeToClose: false
          }
        };
      }

      // Calculate enrichment data
      const enrichment = {
        domain,
        isNew: false,
        visitCount: domainStats.visitCount || 0,
        firstVisit: domainStats.firstVisit,
        lastVisit: domainStats.lastVisit,
        category: domainStats.category || 'other',

        // Safe-to-close: has been visited before and exists in history
        safeToClose: domainStats.visitCount >= 3,

        // Time since last visit
        timeSinceLastVisit: domainStats.lastVisit ? Date.now() - domainStats.lastVisit : null,

        // Time patterns (when user typically visits this domain)
        timePatterns: domainStats.timePatterns || { morning: 0, afternoon: 0, evening: 0, night: 0 },

        // Confidence level (based on visit count)
        confidence: this.calculateConfidence(domainStats.visitCount)
      };

      return {
        ...tab,
        history: enrichment
      };
    } catch (error) {
      console.error('[HistoryEnricher] Failed to enrich tab:', error);
      return { ...tab, history: null };
    }
  }

  /**
   * Enrich multiple tabs in batch (optimized)
   *
   * @param {Array} tabs - Array of browser tab objects
   * @returns {Array} Array of enriched tabs
   */
  async enrichBatch(tabs) {
    await this.init();

    const settings = await this.settings.get();
    if (!settings.enabled || !settings.features.enrichTabCards) {
      return tabs.map(tab => ({ ...tab, history: null }));
    }

    try {
      // Extract unique domains
      const domains = new Set();
      const tabDomainMap = new Map();

      for (const tab of tabs) {
        try {
          const url = new URL(tab.url);
          const domain = url.hostname.toLowerCase();
          domains.add(domain);
          tabDomainMap.set(tab.id, domain);
        } catch (error) {
          // Skip invalid URLs
          continue;
        }
      }

      // Batch fetch domain stats (single IndexedDB transaction)
      const domainStatsMap = await this.storage.getBatchDomainStats(Array.from(domains));

      // Enrich tabs
      const enrichedTabs = tabs.map(tab => {
        const domain = tabDomainMap.get(tab.id);
        if (!domain) {
          return { ...tab, history: null };
        }

        const domainStats = domainStatsMap.get(domain);

        if (!domainStats) {
          return {
            ...tab,
            history: {
              domain,
              isNew: true,
              visitCount: 0,
              category: 'other',
              safeToClose: false
            }
          };
        }

        // Calculate enrichment
        const enrichment = {
          domain,
          isNew: false,
          visitCount: domainStats.visitCount || 0,
          firstVisit: domainStats.firstVisit,
          lastVisit: domainStats.lastVisit,
          category: domainStats.category || 'other',
          safeToClose: domainStats.visitCount >= 3,
          timeSinceLastVisit: domainStats.lastVisit ? Date.now() - domainStats.lastVisit : null,
          timePatterns: domainStats.timePatterns || { morning: 0, afternoon: 0, evening: 0, night: 0 },
          confidence: this.calculateConfidence(domainStats.visitCount)
        };

        return {
          ...tab,
          history: enrichment
        };
      });

      return enrichedTabs;
    } catch (error) {
      console.error('[HistoryEnricher] Batch enrichment failed:', error);
      return tabs.map(tab => ({ ...tab, history: null }));
    }
  }

  /**
   * Calculate confidence level based on visit count
   *
   * @param {number} visitCount - Number of visits
   * @returns {string} Confidence level: 'high', 'medium', 'low', or 'none'
   */
  calculateConfidence(visitCount) {
    if (visitCount >= 20) return 'high';
    if (visitCount >= 5) return 'medium';
    if (visitCount >= 1) return 'low';
    return 'none';
  }

  /**
   * Format time ago string (e.g., "2h ago", "3d ago")
   *
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {string} Formatted time ago string
   */
  formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';

    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years}y ago`;
    if (months > 0) return `${months}mo ago`;
    if (weeks > 0) return `${weeks}w ago`;
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  /**
   * Format visit count (e.g., "156", "1.2k", "3.5k")
   *
   * @param {number} count - Visit count
   * @returns {string} Formatted count
   */
  formatVisitCount(count) {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  }

  /**
   * Get badge color based on category
   *
   * @param {string} category - Domain category
   * @returns {string} CSS color class
   */
  getCategoryColor(category) {
    const colors = {
      adult: 'badge-red',
      gambling: 'badge-orange',
      gaming: 'badge-purple',
      social: 'badge-blue',
      video: 'badge-pink',
      music: 'badge-green',
      news: 'badge-gray',
      shopping: 'badge-yellow',
      finance: 'badge-teal',
      health: 'badge-cyan',
      learning: 'badge-indigo',
      tech: 'badge-slate',
      business: 'badge-brown',
      sports: 'badge-lime',
      travel: 'badge-sky',
      food: 'badge-amber',
      entertainment: 'badge-rose',
      arts: 'badge-violet',
      home: 'badge-emerald',
      family: 'badge-fuchsia',
      pets: 'badge-orange',
      religion: 'badge-stone',
      science: 'badge-blue',
      government: 'badge-red',
      realestate: 'badge-yellow',
      automotive: 'badge-gray',
      blog: 'badge-purple',
      reference: 'badge-blue',
      productivity: 'badge-green',
      security: 'badge-red',
      other: 'badge-gray'
    };

    return colors[category] || 'badge-gray';
  }

  /**
   * Get badge icon based on category
   *
   * @param {string} category - Domain category
   * @returns {string} Icon emoji
   */
  getCategoryIcon(category) {
    const icons = {
      adult: '🔞',
      gambling: '🎰',
      gaming: '🎮',
      social: '💬',
      video: '🎬',
      music: '🎵',
      news: '📰',
      shopping: '🛒',
      finance: '💰',
      health: '⚕️',
      learning: '📚',
      tech: '💻',
      business: '💼',
      sports: '⚽',
      travel: '✈️',
      food: '🍔',
      entertainment: '🎭',
      arts: '🎨',
      home: '🏠',
      family: '👨‍👩‍👧',
      pets: '🐾',
      religion: '⛪',
      science: '🔬',
      government: '🏛️',
      realestate: '🏡',
      automotive: '🚗',
      blog: '📝',
      reference: '📖',
      productivity: '✅',
      security: '🔒',
      other: '🌐'
    };

    return icons[category] || '🌐';
  }
}

// Export singleton
if (typeof window !== 'undefined') {
  window.historyEnricher = new HistoryEnricher();
}
const historyEnricher = typeof window !== 'undefined' ? window.historyEnricher : new HistoryEnricher();

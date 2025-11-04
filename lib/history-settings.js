/**
 * History Settings Manager
 * Handles user preferences for history integration with privacy controls
 */

const DEFAULT_SETTINGS = {
  enabled: false, // Opt-in (user must explicitly enable)
  timeRange: '90d', // 7d, 30d, 90d, 1y, all
  excludeDomains: [],
  excludePrivateBrowsing: true,
  features: {
    enrichTabCards: true,
    showReferrerChains: true,
    enableTimeline: true,
    enableDomainCharts: true,
    enableCoOccurrence: true
  },
  sessionGapMinutes: 30,
  minVisitsForStats: 3, // K-anonymity threshold
  retention: {
    detailed: 7, // Days to keep detailed stats
    aggregated: 90, // Days to keep aggregated data
    summary: Infinity // Keep summaries forever
  }
};

class HistorySettings {
  constructor() {
    this.STORAGE_KEY = 'history-settings';
    this.listeners = new Set();
  }

  /**
   * Get current settings (merged with defaults)
   */
  async get() {
    try {
      const stored = await browser.storage.local.get(this.STORAGE_KEY);
      return { ...DEFAULT_SETTINGS, ...stored[this.STORAGE_KEY] };
    } catch (error) {
      console.error('[HistorySettings] Error loading settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Update settings and trigger reanalysis if needed
   */
  async set(updates) {
    try {
      const current = await this.get();
      const updated = { ...current, ...updates };

      await browser.storage.local.set({ [this.STORAGE_KEY]: updated });

      // Trigger reanalysis if critical settings changed
      const needsReanalysis =
        (updates.timeRange && updates.timeRange !== current.timeRange) ||
        (updates.excludeDomains && JSON.stringify(updates.excludeDomains) !== JSON.stringify(current.excludeDomains)) ||
        (updates.enabled === true && current.enabled === false);

      if (needsReanalysis) {
        await this.triggerReanalysis();
      }

      // Notify listeners
      this.notifyListeners(updated);

      return updated;
    } catch (error) {
      console.error('[HistorySettings] Error saving settings:', error);
      throw error;
    }
  }

  /**
   * Reset to defaults
   */
  async reset() {
    try {
      await browser.storage.local.set({ [this.STORAGE_KEY]: DEFAULT_SETTINGS });
      this.notifyListeners(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[HistorySettings] Error resetting settings:', error);
      throw error;
    }
  }

  /**
   * Check if history integration is enabled
   */
  async isEnabled() {
    const settings = await this.get();
    return settings.enabled;
  }

  /**
   * Get excluded domains list
   */
  async getExcludedDomains() {
    const settings = await this.get();
    return settings.excludeDomains || [];
  }

  /**
   * Add domain to exclusion list
   */
  async excludeDomain(domain) {
    const settings = await this.get();
    const excludeDomains = new Set(settings.excludeDomains || []);
    excludeDomains.add(domain);
    return await this.set({ excludeDomains: Array.from(excludeDomains) });
  }

  /**
   * Remove domain from exclusion list
   */
  async includeDomain(domain) {
    const settings = await this.get();
    const excludeDomains = (settings.excludeDomains || []).filter(d => d !== domain);
    return await this.set({ excludeDomains });
  }

  /**
   * Get time range in milliseconds
   */
  async getTimeRangeMs() {
    const settings = await this.get();
    return this.parseTimeRange(settings.timeRange);
  }

  /**
   * Parse time range string to milliseconds
   */
  parseTimeRange(rangeStr) {
    if (rangeStr === 'all') return Infinity;

    const match = rangeStr.match(/^(\d+)([dhmy])$/);
    if (!match) return 90 * 24 * 60 * 60 * 1000; // Default 90 days

    const [, amount, unit] = match;
    const num = parseInt(amount, 10);

    switch (unit) {
      case 'd': return num * 24 * 60 * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'm': return num * 30 * 24 * 60 * 60 * 1000; // Month approximation
      case 'y': return num * 365 * 24 * 60 * 60 * 1000;
      default: return 90 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Trigger history reanalysis
   */
  async triggerReanalysis() {
    try {
      // Send message to background script to trigger analysis
      await browser.runtime.sendMessage({
        type: 'HISTORY_REANALYZE',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[HistorySettings] Error triggering reanalysis:', error);
    }
  }

  /**
   * Add settings change listener
   */
  addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * Remove settings change listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of settings change
   */
  notifyListeners(settings) {
    for (const callback of this.listeners) {
      try {
        callback(settings);
      } catch (error) {
        console.error('[HistorySettings] Error in listener:', error);
      }
    }
  }

  /**
   * Export settings as JSON
   */
  async export() {
    const settings = await this.get();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * Import settings from JSON
   */
  async import(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      // Validate structure
      if (typeof imported !== 'object') {
        throw new Error('Invalid settings format');
      }
      return await this.set(imported);
    } catch (error) {
      console.error('[HistorySettings] Error importing settings:', error);
      throw error;
    }
  }
}

// Export singleton instance (available globally for extension pages)
if (typeof window !== 'undefined') {
  window.historySettings = new HistorySettings();
}
// Also make available in background context
const historySettings = typeof window !== 'undefined' ? window.historySettings : new HistorySettings();

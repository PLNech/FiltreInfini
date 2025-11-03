/**
 * Parser for Firefox Sync tab export data
 * Parses JSON from SyncedTabs._internal.getTabClients()
 */
class SyncParser {
  /**
   * Parse synced tabs JSON and extract timestamp from filename
   * @param {Object} syncedData - Parsed JSON from Firefox Sync export
   * @param {string} filename - Original filename (e.g., "synced-tabs-1762162517587.json")
   * @returns {Object} Parsed data with tabs and metadata
   */
  parse(syncedData, filename) {
    const syncExportDate = this.extractTimestamp(filename);
    const allTabs = [];

    // syncedData is an array of devices
    for (const device of syncedData) {
      const deviceName = device.name || 'Unknown Device';
      const deviceId = device.id;
      const deviceType = device.clientType || device.type;

      // Parse tabs for this device
      for (const tab of device.tabs || []) {
        // Skip file:// URLs and other non-http(s) URLs except about:
        if (!tab.url.startsWith('http://') &&
            !tab.url.startsWith('https://') &&
            !tab.url.startsWith('about:')) {
          continue;
        }

        const domain = this.extractDomain(tab.url);
        const ageDays = this.calculateTabAge(tab.lastUsed);
        const ageFormatted = this.formatAge(ageDays);
        const isInternal = this.isInternalUrl(tab.url);

        allTabs.push({
          // Core tab data
          title: tab.title,
          url: tab.url,
          icon: tab.icon,

          // Extracted fields (for UI compatibility)
          domain: domain,
          ageDays: ageDays,
          ageFormatted: ageFormatted,
          isInternal: isInternal,

          // Sync metadata
          source: 'synced',
          deviceName: deviceName,
          deviceId: deviceId,
          deviceType: deviceType,
          syncExportDate: syncExportDate,

          // Tab state
          lastUsed: tab.lastUsed,
          lastAccessed: tab.lastUsed * 1000, // Convert to milliseconds for compatibility
          inactive: tab.inactive || false,

          // Generate pseudo-ID for tracking
          id: `synced-${deviceId}-${btoa(tab.url).substring(0, 16)}`, // Use base64 of URL for stable IDs
        });
      }
    }

    return {
      tabs: allTabs,
      syncExportDate: syncExportDate,
      deviceCount: syncedData.length,
      totalTabs: allTabs.length,
    };
  }

  /**
   * Extract timestamp from synced-tabs filename
   * @param {string} filename - e.g., "synced-tabs-1762162517587.json"
   * @returns {number} Unix timestamp in milliseconds
   */
  extractTimestamp(filename) {
    const match = filename.match(/synced-tabs-(\d+)\.json/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    // Fallback to current time if can't parse
    return Date.now();
  }

  /**
   * Format sync date for display
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Formatted date string
   */
  formatSyncDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
      return 'Today';
    } else if (daysDiff === 1) {
      return 'Yesterday';
    } else if (daysDiff < 7) {
      return `${daysDiff} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Calculate age of a tab in days
   * @param {number} lastUsed - Unix timestamp in seconds
   * @returns {number} Age in days
   */
  calculateTabAge(lastUsed) {
    const now = Date.now();
    const lastUsedMs = lastUsed * 1000; // Convert to milliseconds
    const ageDays = Math.floor((now - lastUsedMs) / (1000 * 60 * 60 * 24));
    return ageDays;
  }

  /**
   * Extract domain from URL
   * @param {string} url - Full URL
   * @returns {string} Domain name
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname || urlObj.protocol.replace(':', '');
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Format age in human-readable format
   * @param {number} days - Age in days
   * @returns {string} Formatted age string
   */
  formatAge(days) {
    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days}d ago`;
    } else if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks}w ago`;
    } else if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months}mo ago`;
    } else {
      const years = Math.floor(days / 365);
      return `${years}y ago`;
    }
  }

  /**
   * Check if URL is internal (browser pages)
   * @param {string} url - URL to check
   * @returns {boolean} True if internal
   */
  isInternalUrl(url) {
    return url.startsWith('about:') ||
           url.startsWith('moz-extension:') ||
           url.startsWith('chrome:') ||
           url.startsWith('view-source:');
  }
}

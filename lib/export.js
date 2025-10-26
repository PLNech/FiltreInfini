/**
 * Export functionality - CSV export for tab data
 */

const TabExport = {
  /**
   * Export tabs to CSV format
   * @param {Array} tabs - Array of tabs to export
   * @param {GroupManager} groupManager - Group manager instance
   * @returns {Promise<string>} CSV content
   */
  async toCSV(tabs, groupManager) {
    const header = 'Title,URL,Domain,Last Accessed,Age (days),Group\n';

    const rows = await Promise.all(tabs.map(async (tab) => {
      const group = await groupManager.getGroup(tab.id);
      const age = tabQuery.calculateAge(tab);
      const domain = tabQuery.extractDomain(tab.url);
      const lastAccessed = tab.lastAccessed
        ? new Date(tab.lastAccessed).toISOString()
        : 'Unknown';

      return [
        this.escapeCSV(tab.title),
        this.escapeCSV(tab.url),
        this.escapeCSV(domain),
        this.escapeCSV(lastAccessed),
        age,
        this.escapeCSV(group)
      ].join(',');
    }));

    return header + rows.join('\n');
  },

  /**
   * Escape CSV field
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeCSV(str) {
    const stringValue = String(str);

    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  },

  /**
   * Download CSV file
   * @param {string} csvContent - CSV content
   * @param {string} filename - Filename (optional)
   */
  async download(csvContent, filename = null) {
    const timestamp = new Date().toISOString().split('T')[0];
    const finalFilename = filename || `filtre-infini-tabs-${timestamp}.csv`;

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    // Use downloads API if available (better for extensions)
    if (browser.downloads) {
      const url = URL.createObjectURL(blob);
      await browser.downloads.download({
        url: url,
        filename: finalFilename,
        saveAs: true
      });
      // Clean up after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      // Fallback: trigger download via anchor element
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  },

  /**
   * Export current view to CSV and trigger download
   * @param {Array} tabs - Tabs to export
   * @param {GroupManager} groupManager - Group manager instance
   */
  async exportAndDownload(tabs, groupManager) {
    const csv = await this.toCSV(tabs, groupManager);
    await this.download(csv);
  }
};

// TODO: Phase 4 - Add JSON export format
// TODO: Phase 4 - Add HTML report format with statistics

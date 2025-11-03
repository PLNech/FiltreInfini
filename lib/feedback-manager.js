/**
 * Feedback Manager - User feedback collection for ML improvements
 *
 * Provides console API for users to report classification accuracy:
 * - window.feedback.add(isPositive, message, suggestedCategory)
 * - window.feedback.dump() - Pretty-print all feedback
 * - window.feedback.export() - Download as JSON
 *
 * Feedback is stored in storage.local for persistence and future model improvements.
 *
 * @see PLAN-ML.md Week 3 Step 9
 */

// Storage is loaded via script tag in browser context
// In Node.js test context, it will be required by the test runner

class FeedbackManager {
  constructor() {
    this.feedbacks = [];
    this.storageKey = 'ml_feedbacks';
    this.loaded = false;
  }

  /**
   * Initialize - load existing feedback from storage
   * @returns {Promise<void>}
   */
  async init() {
    if (this.loaded) return;

    try {
      if (Storage) {
        const stored = await Storage.get(this.storageKey);
        if (stored && Array.isArray(stored)) {
          this.feedbacks = stored;
          console.log(`[Feedback] Loaded ${this.feedbacks.length} feedback entries`);
        }
      }
    } catch (error) {
      console.error('[Feedback] Failed to load from storage:', error);
    }

    this.loaded = true;
  }

  /**
   * Add feedback for a tab classification
   * @param {boolean} isPositive - True for positive feedback, false for negative
   * @param {string} message - User's free-form feedback message
   * @param {string|null} suggestedCategory - User's suggested category (optional)
   * @param {Object|null} tab - Tab snapshot (optional, for context)
   * @returns {Promise<void>}
   */
  async add(isPositive, message, suggestedCategory = null, tab = null) {
    await this.init();

    const feedback = {
      id: this.generateId(),
      isPositive,
      message: message || '',
      suggestedCategory,
      timestamp: Date.now(),
      date: new Date().toISOString(),
      tab: tab ? {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        domain: tab.domain,
        mlClassifications: tab.mlClassifications || null
      } : null
    };

    this.feedbacks.push(feedback);
    await this.save();

    console.log(
      `[Feedback] ${isPositive ? '✅' : '❌'} Added: "${message}"` +
      (suggestedCategory ? ` → Suggested: ${suggestedCategory}` : '')
    );

    return feedback;
  }

  /**
   * Generate unique feedback ID
   * @returns {string}
   */
  generateId() {
    return `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save feedback to storage
   * @returns {Promise<void>}
   */
  async save() {
    try {
      if (Storage) {
        await Storage.set(this.storageKey, this.feedbacks);
      }
    } catch (error) {
      console.error('[Feedback] Failed to save to storage:', error);
    }
  }

  /**
   * Dump all feedback as pretty table
   * @returns {Array<Object>}
   */
  dump() {
    if (this.feedbacks.length === 0) {
      console.log('[Feedback] No feedback entries yet');
      return [];
    }

    // Prepare data for console.table
    const tableData = this.feedbacks.map(f => ({
      ID: f.id.split('-')[1], // Short ID
      Type: f.isPositive ? '✅ Positive' : '❌ Negative',
      Message: f.message.substring(0, 50) + (f.message.length > 50 ? '...' : ''),
      Suggested: f.suggestedCategory || '-',
      Domain: f.tab ? f.tab.domain : '-',
      Date: new Date(f.timestamp).toLocaleString()
    }));

    console.table(tableData);
    console.log(`[Feedback] Total: ${this.feedbacks.length} entries`);

    return this.feedbacks;
  }

  /**
   * Export feedback as JSON file download
   * @returns {void}
   */
  export() {
    if (this.feedbacks.length === 0) {
      console.warn('[Feedback] No feedback to export');
      return;
    }

    const json = JSON.stringify(this.feedbacks, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const filename = `ml-feedback-${Date.now()}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);

    console.log(`[Feedback] Exported ${this.feedbacks.length} entries to ${filename}`);
  }

  /**
   * Get feedback statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      total: this.feedbacks.length,
      positive: 0,
      negative: 0,
      withSuggestions: 0,
      byDomain: {},
      recent: 0 // Last 24 hours
    };

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const f of this.feedbacks) {
      if (f.isPositive) stats.positive++;
      else stats.negative++;

      if (f.suggestedCategory) stats.withSuggestions++;

      if (f.timestamp > oneDayAgo) stats.recent++;

      if (f.tab && f.tab.domain) {
        stats.byDomain[f.tab.domain] = (stats.byDomain[f.tab.domain] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Get feedback for a specific tab
   * @param {string} tabId - Tab ID
   * @returns {Array<Object>}
   */
  getByTab(tabId) {
    return this.feedbacks.filter(f => f.tab && f.tab.id === tabId);
  }

  /**
   * Get feedback by domain
   * @param {string} domain - Domain name
   * @returns {Array<Object>}
   */
  getByDomain(domain) {
    return this.feedbacks.filter(f => f.tab && f.tab.domain === domain);
  }

  /**
   * Clear all feedback
   * @returns {Promise<void>}
   */
  async clear() {
    this.feedbacks = [];
    await this.save();
    console.log('[Feedback] All feedback cleared');
  }

  /**
   * Delete specific feedback by ID
   * @param {string} feedbackId - Feedback ID
   * @returns {Promise<boolean>}
   */
  async delete(feedbackId) {
    const index = this.feedbacks.findIndex(f => f.id === feedbackId);
    if (index === -1) {
      console.warn(`[Feedback] ID not found: ${feedbackId}`);
      return false;
    }

    this.feedbacks.splice(index, 1);
    await this.save();
    console.log(`[Feedback] Deleted: ${feedbackId}`);
    return true;
  }

  /**
   * Show help message
   */
  help() {
    console.log(`
🔍 ML Feedback Console API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:
  window.feedback.add(isPositive, message, suggestedCategory?, tab?)
  window.feedback.dump()         // Show all feedback as table
  window.feedback.export()       // Download as JSON
  window.feedback.getStats()     // Get statistics
  window.feedback.clear()        // Clear all feedback
  window.feedback.help()         // Show this help

Examples:
  feedback.add(true, "Perfect tech classification!")
  feedback.add(false, "Should be 'reference' not 'to-read'", "reference")
  feedback.add(false, "Wrong category", "shopping", currentTab)

  feedback.dump()                // Pretty table
  feedback.getStats()            // { total: 15, positive: 10, negative: 5, ... }
  feedback.export()              // Downloads ml-feedback-<timestamp>.json
    `);
  }
}

// Create singleton instance
const feedbackManager = new FeedbackManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = feedbackManager;
  module.exports.FeedbackManager = FeedbackManager;
}

// Expose to window for console API (browser context)
if (typeof window !== 'undefined') {
  window.feedback = feedbackManager;
  console.log('[Feedback] Console API available: window.feedback');
  console.log('[Feedback] Type "feedback.help()" for usage');
}

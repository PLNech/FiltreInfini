/**
 * Context Features Extractor - Session-based tab context
 *
 * Extracts contextual features from tab sessions to improve ML classification:
 * - Co-occurring domains (what tabs are open together)
 * - Domain clustering (frequency patterns)
 * - Temporal patterns (age distribution)
 * - Domain knowledge hints (category/type from curated list)
 *
 * Phase 1: No browser history access
 * TODO-PHASE-N: Integrate places.sqlite for deeper context
 */

// DomainKnowledge is loaded via script tag in browser context
// In Node.js test context, it will be required by the test runner

class ContextFeatures {
  /**
   * Extract session context from array of tabs
   * @param {Array} tabs - Array of tab objects with domain, lastUsed properties
   * @returns {Object} Session context features
   */
  static extractSessionContext(tabs) {
    if (!tabs || tabs.length === 0) {
      return {
        totalTabs: 0,
        coOccurringDomains: [],
        domainClusters: {},
        sessionAge: 0,
        temporalPattern: {
          allRecent: false,
          hasStaleTabs: false,
          ageSpread: 0
        }
      };
    }

    const domains = this.extractDomains(tabs);
    const domainClusters = this.getDomainClusters(tabs);
    const temporalPattern = this.calculateTemporalPattern(tabs);
    const sessionAge = this.calculateSessionAge(tabs);

    return {
      totalTabs: tabs.length,
      coOccurringDomains: domains,
      domainClusters: domainClusters,
      sessionAge: sessionAge,
      temporalPattern: temporalPattern
    };
  }

  /**
   * Extract unique domains from tabs
   * @param {Array} tabs
   * @returns {Array<string>} Unique domains
   */
  static extractDomains(tabs) {
    const domains = new Set();
    for (const tab of tabs) {
      if (tab.domain) {
        domains.add(tab.domain);
      }
    }
    return Array.from(domains);
  }

  /**
   * Group tabs by domain and count occurrences
   * @param {Array} tabs
   * @returns {Object} Map of domain -> count
   */
  static getDomainClusters(tabs) {
    const clusters = {};
    for (const tab of tabs) {
      if (tab.domain) {
        clusters[tab.domain] = (clusters[tab.domain] || 0) + 1;
      }
    }
    return clusters;
  }

  /**
   * Calculate temporal patterns across tabs
   * @param {Array} tabs
   * @returns {Object} Temporal pattern features
   */
  static calculateTemporalPattern(tabs) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;

    const ages = tabs
      .map(t => {
        const lastUsed = t.lastUsed || t.lastAccessed;
        if (!lastUsed) return null;
        // Handle both seconds (sync) and milliseconds (local) timestamps
        const timestamp = lastUsed < 10000000000 ? lastUsed * 1000 : lastUsed;
        return now - timestamp;
      })
      .filter(age => age !== null);

    if (ages.length === 0) {
      return {
        allRecent: false,
        hasStaleTabs: false,
        ageSpread: 0
      };
    }

    const minAge = Math.min(...ages);
    const maxAge = Math.max(...ages);

    return {
      allRecent: maxAge < oneDay,
      hasStaleTabs: maxAge > sevenDays,
      ageSpread: maxAge - minAge
    };
  }

  /**
   * Calculate session age (time since oldest tab)
   * @param {Array} tabs
   * @returns {number} Age in milliseconds
   */
  static calculateSessionAge(tabs) {
    const now = Date.now();
    const timestamps = tabs
      .map(t => {
        const lastUsed = t.lastUsed || t.lastAccessed;
        if (!lastUsed) return null;
        // Handle both seconds (sync) and milliseconds (local) timestamps
        return lastUsed < 10000000000 ? lastUsed * 1000 : lastUsed;
      })
      .filter(ts => ts !== null);

    if (timestamps.length === 0) return 0;

    const oldestTimestamp = Math.min(...timestamps);
    return now - oldestTimestamp;
  }

  /**
   * Apply heuristic boosting to classification scores based on context
   * @param {Object} scores - Raw ML scores (intent, status, contentType)
   * @param {Object} context - Session context features
   * @param {Object} tab - Individual tab being classified
   * @returns {Object} Boosted scores
   */
  static applyHeuristics(scores, context, tab) {
    const boosted = JSON.parse(JSON.stringify(scores)); // Deep clone

    // 0. Learned patterns from Pass 1 (highest priority for Pass 2)
    if (context?.learnedPatterns && tab.domain) {
      const patterns = context.learnedPatterns;
      const domainMapping = patterns.domainMappings[tab.domain];

      if (domainMapping) {
        // Apply learned domain mappings with strong boost
        ['intent', 'status', 'contentType'].forEach(dimension => {
          const learned = domainMapping[dimension];
          if (learned && learned.dominant && learned.confidence > 0.5) {
            // Strong boost for high-confidence learned patterns
            this.boostLabel(boosted[dimension], learned.dominant, learned.confidence * 0.3);

            // Moderate boost for alternatives
            if (learned.alternatives) {
              learned.alternatives.forEach(alt => {
                if (alt.confidence > 0.3) {
                  this.boostLabel(boosted[dimension], alt.label, alt.confidence * 0.15);
                }
              });
            }
          }
        });
      }

      // Apply temporal pattern boosting based on tab age
      const tabAge = this.getTabAge(tab);
      const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
      const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
      const SIX_MONTHS = 6 * ONE_MONTH;

      let ageBucket;
      if (tabAge < ONE_WEEK) ageBucket = 'recent';
      else if (tabAge < ONE_MONTH) ageBucket = 'active';
      else if (tabAge < SIX_MONTHS) ageBucket = 'stale';
      else ageBucket = 'old';

      const temporalPattern = patterns.temporalPatterns[ageBucket];
      if (temporalPattern) {
        // Apply light boost based on temporal patterns
        ['intent', 'status', 'contentType'].forEach(dimension => {
          if (temporalPattern[dimension]) {
            const entries = Object.entries(temporalPattern[dimension]);
            entries.sort((a, b) => b[1] - a[1]);
            if (entries.length > 0) {
              const [dominantLabel, count] = entries[0];
              const confidence = count / patterns.stats.totalTabs;
              if (confidence > 0.1) {
                this.boostLabel(boosted[dimension], dominantLabel, confidence * 0.15);
              }
            }
          }
        });
      }
    }

    // 1. Domain knowledge hints (curated knowledge base)
    if (DomainKnowledge && tab.domain) {
      const hints = DomainKnowledge.getHints(tab.domain);
      if (hints) {
        // Boost content type
        if (hints.contentType === 'communication') {
          this.boostLabel(boosted.contentType, 'communication', 0.2);
        } else if (hints.contentType === 'search') {
          this.boostLabel(boosted.contentType, 'search', 0.2);
        } else if (hints.contentType === 'content') {
          this.boostLabel(boosted.contentType, 'content', 0.15);
        }

        // Boost intent
        if (hints.commonIntent === 'transactional') {
          this.boostLabel(boosted.intent, 'transactional', 0.15);
        } else if (hints.commonIntent === 'informational') {
          this.boostLabel(boosted.intent, 'informational', 0.15);
        } else if (hints.commonIntent === 'navigational') {
          this.boostLabel(boosted.intent, 'navigational', 0.15);
        }
      }
    }

    // 2. Temporal decay: old tabs -> boost 'reference' or 'maybe'
    const tabAge = this.getTabAge(tab);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (tabAge > sevenDays) {
      this.boostLabel(boosted.status, 'reference', 0.1);
      this.boostLabel(boosted.status, 'maybe', 0.1);
    }

    // 3. Communication sites (fallback if not in knowledge base)
    if (this.isCommunicationDomain(tab.domain)) {
      this.boostLabel(boosted.contentType, 'communication', 0.15);
    }

    // 4. Search patterns (fallback if not in knowledge base)
    if (this.isSearchDomain(tab.domain)) {
      this.boostLabel(boosted.contentType, 'search', 0.15);
      this.boostLabel(boosted.intent, 'informational', 0.1);
    }

    // 5. Inactive flag
    if (tab.inactive) {
      this.boostLabel(boosted.status, 'maybe', 0.1);
      this.boostLabel(boosted.status, 'to-do', -0.1); // Reduce to-do
    }

    // 6. Domain clustering: high co-occurrence -> similar classification
    // (This would require comparing with other tabs in same domain cluster)
    // TODO: Implement cross-tab similarity boosting

    return boosted;
  }

  /**
   * Get tab age in milliseconds
   * @param {Object} tab
   * @returns {number}
   */
  static getTabAge(tab) {
    const now = Date.now();
    const lastUsed = tab.lastUsed || tab.lastAccessed;
    if (!lastUsed) return 0;
    const timestamp = lastUsed < 10000000000 ? lastUsed * 1000 : lastUsed;
    return now - timestamp;
  }

  /**
   * Check if domain is a communication site
   * @param {string} domain
   * @returns {boolean}
   */
  static isCommunicationDomain(domain) {
    const commDomains = [
      'gmail.com', 'mail.google.com', 'outlook.com', 'mail.yahoo.com',
      'slack.com', 'discord.com', 'teams.microsoft.com',
      'telegram.org', 'whatsapp.com', 'messenger.com'
    ];
    return commDomains.some(d => domain.includes(d));
  }

  /**
   * Check if domain is a search engine
   * @param {string} domain
   * @returns {boolean}
   */
  static isSearchDomain(domain) {
    const searchDomains = [
      'google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com',
      'baidu.com', 'yandex.com', 'search.brave.com'
    ];
    return searchDomains.some(d => domain.includes(d));
  }

  /**
   * Boost a specific label's score
   * @param {Object} dimension - Classification dimension (intent/status/contentType)
   * @param {string} label - Label to boost
   * @param {number} amount - Boost amount (can be negative)
   */
  static boostLabel(dimension, label, amount) {
    if (!dimension || !dimension.labels) return;

    const index = dimension.labels.indexOf(label);
    if (index === -1) return;

    dimension.scores[index] = Math.max(0, Math.min(1, dimension.scores[index] + amount));

    // Recalculate topK
    const scored = dimension.labels.map((l, i) => ({
      label: l,
      score: dimension.scores[i]
    }));
    scored.sort((a, b) => b.score - a.score);
    dimension.topK = scored.filter(s => s.score > 0.3).slice(0, 3);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContextFeatures;
}

// Export for browser (global window object)
if (typeof window !== 'undefined') {
  window.ContextFeatures = ContextFeatures;
}

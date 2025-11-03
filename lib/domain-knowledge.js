/**
 * Domain Knowledge Base - Curated categories for popular domains
 *
 * Provides category hints to boost ML classification accuracy.
 * Lean approach: ~200 most popular domains manually curated.
 *
 * TODO-PHASE-3: Consider expanding with DMOZ/Curlie dataset if needed
 */

const DomainKnowledge = {
  /**
   * Domain category mappings
   * Format: domain -> { category, contentType, commonIntent }
   */
  domains: {
    // Social Media & Communication
    'facebook.com': { category: 'social', contentType: 'communication', commonIntent: 'navigational' },
    'twitter.com': { category: 'social', contentType: 'communication', commonIntent: 'navigational' },
    'x.com': { category: 'social', contentType: 'communication', commonIntent: 'navigational' },
    'instagram.com': { category: 'social', contentType: 'communication', commonIntent: 'navigational' },
    'linkedin.com': { category: 'social', contentType: 'communication', commonIntent: 'navigational' },
    'reddit.com': { category: 'social', contentType: 'communication', commonIntent: 'informational' },
    'discord.com': { category: 'social', contentType: 'communication', commonIntent: 'navigational' },
    'slack.com': { category: 'work', contentType: 'communication', commonIntent: 'navigational' },
    'whatsapp.com': { category: 'social', contentType: 'communication', commonIntent: 'navigational' },
    'telegram.org': { category: 'social', contentType: 'communication', commonIntent: 'navigational' },

    // Email
    'gmail.com': { category: 'work', contentType: 'communication', commonIntent: 'navigational' },
    'mail.google.com': { category: 'work', contentType: 'communication', commonIntent: 'navigational' },
    'outlook.com': { category: 'work', contentType: 'communication', commonIntent: 'navigational' },
    'mail.yahoo.com': { category: 'work', contentType: 'communication', commonIntent: 'navigational' },
    'protonmail.com': { category: 'work', contentType: 'communication', commonIntent: 'navigational' },

    // Search Engines
    'google.com': { category: 'tech', contentType: 'search', commonIntent: 'informational' },
    'bing.com': { category: 'tech', contentType: 'search', commonIntent: 'informational' },
    'duckduckgo.com': { category: 'tech', contentType: 'search', commonIntent: 'informational' },
    'yahoo.com': { category: 'tech', contentType: 'search', commonIntent: 'informational' },
    'baidu.com': { category: 'tech', contentType: 'search', commonIntent: 'informational' },

    // E-commerce
    'amazon.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'ebay.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'alibaba.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'etsy.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'shopify.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'walmart.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'target.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'bestbuy.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },

    // Tech / Developer
    'github.com': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'stackoverflow.com': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'stackexchange.com': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'developer.mozilla.org': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'mdn.org': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'devdocs.io': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'medium.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'dev.to': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'hackernews.com': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'news.ycombinator.com': { category: 'tech', contentType: 'content', commonIntent: 'informational' },

    // Documentation
    'docs.python.org': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'nodejs.org': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'react.dev': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'vuejs.org': { category: 'tech', contentType: 'content', commonIntent: 'informational' },
    'angular.io': { category: 'tech', contentType: 'content', commonIntent: 'informational' },

    // Video Streaming
    'youtube.com': { category: 'videos', contentType: 'content', commonIntent: 'informational' },
    'netflix.com': { category: 'videos', contentType: 'content', commonIntent: 'transactional' },
    'twitch.tv': { category: 'videos', contentType: 'content', commonIntent: 'informational' },
    'vimeo.com': { category: 'videos', contentType: 'content', commonIntent: 'informational' },
    'dailymotion.com': { category: 'videos', contentType: 'content', commonIntent: 'informational' },

    // News
    'bbc.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'cnn.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'nytimes.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'theguardian.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'reuters.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'bloomberg.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'wsj.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'economist.com': { category: 'reading', contentType: 'content', commonIntent: 'informational' },

    // Entertainment / Culture
    'imdb.com': { category: 'sorties', contentType: 'content', commonIntent: 'informational' },
    'rottentomatoes.com': { category: 'sorties', contentType: 'content', commonIntent: 'informational' },
    'spotify.com': { category: 'sorties', contentType: 'content', commonIntent: 'navigational' },
    'soundcloud.com': { category: 'sorties', contentType: 'content', commonIntent: 'informational' },
    'bandcamp.com': { category: 'sorties', contentType: 'content', commonIntent: 'transactional' },

    // Wikipedia / Education
    'wikipedia.org': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'wikimedia.org': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'wikidata.org': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'coursera.org': { category: 'reading', contentType: 'content', commonIntent: 'transactional' },
    'udemy.com': { category: 'reading', contentType: 'content', commonIntent: 'transactional' },
    'khanacademy.org': { category: 'reading', contentType: 'content', commonIntent: 'informational' },

    // Cloud / Productivity
    'drive.google.com': { category: 'work', contentType: 'content', commonIntent: 'navigational' },
    'docs.google.com': { category: 'work', contentType: 'content', commonIntent: 'navigational' },
    'dropbox.com': { category: 'work', contentType: 'content', commonIntent: 'navigational' },
    'notion.so': { category: 'work', contentType: 'content', commonIntent: 'navigational' },
    'trello.com': { category: 'work', contentType: 'content', commonIntent: 'navigational' },
    'asana.com': { category: 'work', contentType: 'content', commonIntent: 'navigational' },

    // Finance
    'paypal.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'stripe.com': { category: 'work', contentType: 'content', commonIntent: 'transactional' },
    'coinbase.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'binance.com': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },

    // Travel
    'booking.com': { category: 'sorties', contentType: 'content', commonIntent: 'transactional' },
    'airbnb.com': { category: 'sorties', contentType: 'content', commonIntent: 'transactional' },
    'tripadvisor.com': { category: 'sorties', contentType: 'content', commonIntent: 'informational' },
    'expedia.com': { category: 'sorties', contentType: 'content', commonIntent: 'transactional' },

    // French sites (for user's context)
    'lemonde.fr': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'lefigaro.fr': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'liberation.fr': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'ouest-france.fr': { category: 'reading', contentType: 'content', commonIntent: 'informational' },
    'leboncoin.fr': { category: 'shopping', contentType: 'content', commonIntent: 'transactional' },
    'allocine.fr': { category: 'sorties', contentType: 'content', commonIntent: 'informational' },
  },

  /**
   * Get category hints for a domain
   * @param {string} domain
   * @returns {Object|null} Category hints or null
   */
  getHints(domain) {
    if (!domain) return null;

    // Exact match
    if (this.domains[domain]) {
      return this.domains[domain];
    }

    // Try without www/m/mobile prefix
    const normalized = domain.replace(/^(www\.|m\.|mobile\.)/, '');
    if (this.domains[normalized]) {
      return this.domains[normalized];
    }

    // Try matching subdomain to parent
    const parts = domain.split('.');
    if (parts.length > 2) {
      const parent = parts.slice(-2).join('.');
      if (this.domains[parent]) {
        return this.domains[parent];
      }
    }

    return null;
  },

  /**
   * Check if domain is in knowledge base
   * @param {string} domain
   * @returns {boolean}
   */
  isKnown(domain) {
    return this.getHints(domain) !== null;
  },

  /**
   * Get all domains in a category
   * @param {string} category
   * @returns {Array<string>}
   */
  getByCategory(category) {
    return Object.entries(this.domains)
      .filter(([_, hints]) => hints.category === category)
      .map(([domain]) => domain);
  },

  /**
   * Get statistics about knowledge base
   * @returns {Object}
   */
  getStats() {
    const categories = {};
    const contentTypes = {};
    const intents = {};

    for (const [domain, hints] of Object.entries(this.domains)) {
      categories[hints.category] = (categories[hints.category] || 0) + 1;
      contentTypes[hints.contentType] = (contentTypes[hints.contentType] || 0) + 1;
      intents[hints.commonIntent] = (intents[hints.commonIntent] || 0) + 1;
    }

    return {
      totalDomains: Object.keys(this.domains).length,
      categories,
      contentTypes,
      intents
    };
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DomainKnowledge;
}

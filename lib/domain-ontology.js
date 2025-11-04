/**
 * Domain Ontology - 100k+ categorized domains
 * Fetches from GitHub releases, caches in storage.local
 * Provides rich categorization: gaming, adult, productivity, learning, entertainment, etc.
 */

class DomainOntology {
  constructor() {
    this.cache = null;
    this.RELEASE_URL = 'https://github.com/PLNech/FiltreInfini/releases/latest/download/domains-100k.json';
    this.CACHE_KEY = 'domain-ontology-cache';
    this.VERSION_KEY = 'domain-ontology-version';
    this.CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Fallback for most common sites (embedded)
    this.FALLBACK = {
      // Gaming
      'steam.com': 'gaming',
      'epicgames.com': 'gaming',
      'twitch.tv': 'gaming',
      'ign.com': 'gaming',
      'gamespot.com': 'gaming',
      'roblox.com': 'gaming',
      'minecraft.net': 'gaming',

      // Adult
      'pornhub.com': 'adult',
      'xvideos.com': 'adult',
      'xnxx.com': 'adult',
      'redtube.com': 'adult',
      'youporn.com': 'adult',

      // Productivity
      'notion.so': 'productivity',
      'asana.com': 'productivity',
      'trello.com': 'productivity',
      'monday.com': 'productivity',
      'airtable.com': 'productivity',
      'clickup.com': 'productivity',
      'todoist.com': 'productivity',

      // Learning
      'coursera.org': 'learning',
      'udemy.com': 'learning',
      'khanacademy.org': 'learning',
      'edx.org': 'learning',
      'skillshare.com': 'learning',
      'pluralsight.com': 'learning',
      'codecademy.com': 'learning',

      // Entertainment
      'netflix.com': 'entertainment',
      'spotify.com': 'entertainment',
      'hulu.com': 'entertainment',
      'disneyplus.com': 'entertainment',
      'primevideo.com': 'entertainment',

      // Finance
      'paypal.com': 'finance',
      'venmo.com': 'finance',
      'chase.com': 'finance',
      'bankofamerica.com': 'finance',
      'wellsfargo.com': 'finance',
      'coinbase.com': 'finance',
      'robinhood.com': 'finance',

      // Health
      'webmd.com': 'health',
      'mayoclinic.org': 'health',
      'healthline.com': 'health',

      // Sports
      'espn.com': 'sports',
      'nfl.com': 'sports',
      'nba.com': 'sports',
      'mlb.com': 'sports',

      // Travel
      'booking.com': 'travel',
      'airbnb.com': 'travel',
      'tripadvisor.com': 'travel',
      'expedia.com': 'travel'
    };
  }

  /**
   * Initialize ontology - load from cache or fetch
   */
  async init() {
    console.log('[Ontology] Initializing...');

    // Try cache first
    const cached = await this.loadFromCache();

    if (cached && !this.isCacheExpired(cached.timestamp)) {
      this.cache = cached.categories;
      console.log(`[Ontology] Loaded from cache (${Object.keys(this.cache).length} domains)`);
      return;
    }

    // Cache miss or expired - fetch from GitHub
    console.log('[Ontology] Cache miss/expired, fetching from GitHub releases...');
    await this.fetchFromGitHub();
  }

  /**
   * Load from storage.local cache
   */
  async loadFromCache() {
    try {
      const stored = await browser.storage.local.get([this.CACHE_KEY, this.VERSION_KEY]);

      if (stored[this.CACHE_KEY]) {
        return {
          categories: stored[this.CACHE_KEY],
          version: stored[this.VERSION_KEY],
          timestamp: stored[this.VERSION_KEY]?.timestamp || 0
        };
      }
    } catch (error) {
      console.error('[Ontology] Failed to load from cache:', error);
    }

    return null;
  }

  /**
   * Check if cache is expired
   */
  isCacheExpired(timestamp) {
    if (!timestamp) return true;
    return (Date.now() - timestamp) > this.CACHE_DURATION_MS;
  }

  /**
   * Fetch from GitHub releases
   */
  async fetchFromGitHub() {
    try {
      const response = await fetch(this.RELEASE_URL);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate structure
      if (!data.categories || typeof data.categories !== 'object') {
        throw new Error('Invalid ontology format');
      }

      // Cache it
      const version = {
        version: data.version || 'unknown',
        timestamp: Date.now(),
        count: Object.keys(data.categories).length
      };

      await browser.storage.local.set({
        [this.CACHE_KEY]: data.categories,
        [this.VERSION_KEY]: version
      });

      this.cache = data.categories;
      console.log(`[Ontology] Fetched and cached ${version.count} domains (v${version.version})`);

    } catch (error) {
      console.error('[Ontology] Failed to fetch from GitHub, using fallback:', error);
      this.cache = this.FALLBACK;
    }
  }

  /**
   * Get category for a domain
   */
  getCategory(domain) {
    if (!domain) return 'other';

    const lowerDomain = domain.toLowerCase();

    // Try cache first
    if (this.cache && this.cache[lowerDomain]) {
      return this.cache[lowerDomain];
    }

    // Try fallback
    if (this.FALLBACK[lowerDomain]) {
      return this.FALLBACK[lowerDomain];
    }

    // Try removing www prefix
    const withoutWww = lowerDomain.replace(/^www\./, '');
    if (this.cache && this.cache[withoutWww]) {
      return this.cache[withoutWww];
    }

    return 'other';
  }

  /**
   * Get multiple categories at once (batch operation)
   */
  getBatchCategories(domains) {
    const results = {};
    for (const domain of domains) {
      results[domain] = this.getCategory(domain);
    }
    return results;
  }

  /**
   * Check if ontology is ready
   */
  isReady() {
    return this.cache !== null;
  }

  /**
   * Force refresh from GitHub
   */
  async refresh() {
    console.log('[Ontology] Forcing refresh...');
    await this.fetchFromGitHub();
  }

  /**
   * Get cache info
   */
  async getCacheInfo() {
    const stored = await browser.storage.local.get([this.VERSION_KEY]);
    const version = stored[this.VERSION_KEY];

    return {
      version: version?.version || 'none',
      timestamp: version?.timestamp || 0,
      count: version?.count || 0,
      age: version?.timestamp ? Date.now() - version?.timestamp : null,
      isExpired: version?.timestamp ? this.isCacheExpired(version.timestamp) : true
    };
  }

  /**
   * Clear cache
   */
  async clearCache() {
    await browser.storage.local.remove([this.CACHE_KEY, this.VERSION_KEY]);
    this.cache = this.FALLBACK;
    console.log('[Ontology] Cache cleared');
  }
}

// Export singleton
if (typeof window !== 'undefined') {
  window.domainOntology = new DomainOntology();
}
const domainOntology = typeof window !== 'undefined' ? window.domainOntology : new DomainOntology();

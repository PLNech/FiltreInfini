/**
 * History Storage - IndexedDB wrapper for rich browsing insights
 * Stores patterns, domain stats, sessions, habits
 * Note: User sees full URLs/titles in UI - we just avoid Claude seeing data
 */

const DB_NAME = 'FiltreInfini-History';
const DB_VERSION = 2;  // Bumped for new stores

const STORES = {
  DOMAIN_STATS: 'domainStats',
  PATTERNS: 'patterns',  // Rich pattern data (Substack blogs, GitHub repos, etc.)
  CO_OCCURRENCE: 'coOccurrence',
  SESSION_SUMMARIES: 'sessionSummaries',
  BROWSING_HABITS: 'browsingHabits'  // Detected habits and insights
};

class HistoryStorage {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Initialize IndexedDB connection
   */
  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store 1: Domain Statistics
        if (!db.objectStoreNames.contains(STORES.DOMAIN_STATS)) {
          const domainStore = db.createObjectStore(STORES.DOMAIN_STATS, { keyPath: 'domain' });
          domainStore.createIndex('visitCount', 'visitCount', { unique: false });
          domainStore.createIndex('lastVisit', 'lastVisit', { unique: false });
          domainStore.createIndex('firstVisit', 'firstVisit', { unique: false });
        }

        // Store 2: Patterns (rich pattern detection)
        if (!db.objectStoreNames.contains(STORES.PATTERNS)) {
          const patternStore = db.createObjectStore(STORES.PATTERNS, { keyPath: 'key' });
          patternStore.createIndex('type', 'type', { unique: false });
          patternStore.createIndex('platform', 'platform', { unique: false });
          patternStore.createIndex('category', 'category', { unique: false });
          patternStore.createIndex('visitCount', 'visitCount', { unique: false });
          patternStore.createIndex('lastVisit', 'lastVisit', { unique: false });
          patternStore.createIndex('domain', 'domain', { unique: false });
        }

        // Store 3: Co-occurrence (domains visited together)
        if (!db.objectStoreNames.contains(STORES.CO_OCCURRENCE)) {
          const coOccurrenceStore = db.createObjectStore(STORES.CO_OCCURRENCE, { keyPath: 'pair' });
          coOccurrenceStore.createIndex('count', 'count', { unique: false });
          coOccurrenceStore.createIndex('lastSeen', 'lastSeen', { unique: false });
        }

        // Store 4: Session Summaries
        if (!db.objectStoreNames.contains(STORES.SESSION_SUMMARIES)) {
          const sessionStore = db.createObjectStore(STORES.SESSION_SUMMARIES, { keyPath: 'sessionId' });
          sessionStore.createIndex('startTime', 'startTime', { unique: false });
          sessionStore.createIndex('endTime', 'endTime', { unique: false });
        }

        // Store 5: Browsing Habits
        if (!db.objectStoreNames.contains(STORES.BROWSING_HABITS)) {
          const habitsStore = db.createObjectStore(STORES.BROWSING_HABITS, { keyPath: 'id' });
          habitsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Save or update domain statistics
   * @param {string} domain - Domain name
   * @param {Object} stats - Statistics object
   */
  async saveDomainStats(domain, stats) {
    await this.init();
    const tx = this.db.transaction([STORES.DOMAIN_STATS], 'readwrite');
    const store = tx.objectStore(STORES.DOMAIN_STATS);

    const data = {
      domain,
      visitCount: stats.visitCount || 0,
      lastVisit: stats.lastVisit || Date.now(),
      firstVisit: stats.firstVisit || Date.now(),
      timePatterns: stats.timePatterns || { morning: 0, afternoon: 0, evening: 0, night: 0 },
      avgSessionDuration: stats.avgSessionDuration || 0,
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get domain statistics
   * @param {string} domain - Domain name
   */
  async getDomainStats(domain) {
    await this.init();
    const tx = this.db.transaction([STORES.DOMAIN_STATS], 'readonly');
    const store = tx.objectStore(STORES.DOMAIN_STATS);

    return new Promise((resolve, reject) => {
      const request = store.get(domain);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get multiple domain statistics at once
   * @param {string[]} domains - Array of domain names
   */
  async getBatchDomainStats(domains) {
    await this.init();
    const tx = this.db.transaction([STORES.DOMAIN_STATS], 'readonly');
    const store = tx.objectStore(STORES.DOMAIN_STATS);

    const results = await Promise.all(
      domains.map(domain => new Promise((resolve) => {
        const request = store.get(domain);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      }))
    );

    return results.filter(r => r !== null);
  }

  /**
   * Get all domain statistics
   */
  async getAllDomainStats() {
    await this.init();
    const tx = this.db.transaction([STORES.DOMAIN_STATS], 'readonly');
    const store = tx.objectStore(STORES.DOMAIN_STATS);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get top N most visited domains
   * @param {number} limit - Number of results
   */
  async getTopDomains(limit = 10) {
    await this.init();
    const tx = this.db.transaction([STORES.DOMAIN_STATS], 'readonly');
    const store = tx.objectStore(STORES.DOMAIN_STATS);
    const index = store.index('visitCount');

    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save pattern data (rich patterns like Substack blogs, GitHub repos, etc.)
   * @param {Object} pattern - Pattern object
   */
  async savePattern(pattern) {
    await this.init();
    const tx = this.db.transaction([STORES.PATTERNS], 'readwrite');
    const store = tx.objectStore(STORES.PATTERNS);

    return new Promise((resolve, reject) => {
      const request = store.put(pattern);
      request.onsuccess = () => resolve(pattern);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get pattern by key
   * @param {string} key - Pattern key
   */
  async getPattern(key) {
    await this.init();
    const tx = this.db.transaction([STORES.PATTERNS], 'readonly');
    const store = tx.objectStore(STORES.PATTERNS);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get patterns by type
   * @param {string} type - Pattern type (e.g., 'substack_blog', 'github_repo')
   * @param {number} limit - Max results
   */
  async getPatternsByType(type, limit = 100) {
    await this.init();
    const tx = this.db.transaction([STORES.PATTERNS], 'readonly');
    const store = tx.objectStore(STORES.PATTERNS);
    const index = store.index('type');

    return new Promise((resolve, reject) => {
      const request = index.getAll(type, limit);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all patterns
   */
  async getAllPatterns() {
    await this.init();
    const tx = this.db.transaction([STORES.PATTERNS], 'readonly');
    const store = tx.objectStore(STORES.PATTERNS);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get top patterns by visit count
   * @param {number} limit - Number of results
   */
  async getTopPatterns(limit = 20) {
    await this.init();
    const tx = this.db.transaction([STORES.PATTERNS], 'readonly');
    const store = tx.objectStore(STORES.PATTERNS);
    const index = store.index('visitCount');

    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save browsing habits
   * @param {Object} habits - Habits object
   */
  async saveHabits(habits) {
    await this.init();
    const tx = this.db.transaction([STORES.BROWSING_HABITS], 'readwrite');
    const store = tx.objectStore(STORES.BROWSING_HABITS);

    const data = {
      id: 'current',
      timestamp: Date.now(),
      ...habits
    };

    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get browsing habits
   */
  async getHabits() {
    await this.init();
    const tx = this.db.transaction([STORES.BROWSING_HABITS], 'readonly');
    const store = tx.objectStore(STORES.BROWSING_HABITS);

    return new Promise((resolve, reject) => {
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save co-occurrence data (domains visited together)
   * @param {string} domain1 - First domain
   * @param {string} domain2 - Second domain
   * @param {number} count - Co-occurrence count
   */
  async saveCoOccurrence(domain1, domain2, count) {
    await this.init();
    const tx = this.db.transaction([STORES.CO_OCCURRENCE], 'readwrite');
    const store = tx.objectStore(STORES.CO_OCCURRENCE);

    // Sort domains to create consistent key
    const [d1, d2] = [domain1, domain2].sort();
    const pair = `${d1}::${d2}`;

    const data = {
      pair,
      domain1: d1,
      domain2: d2,
      count,
      lastSeen: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get co-occurrence data for a domain
   * @param {string} domain - Domain name
   * @param {number} limit - Max results
   */
  async getCoOccurrences(domain, limit = 10) {
    await this.init();
    const tx = this.db.transaction([STORES.CO_OCCURRENCE], 'readonly');
    const store = tx.objectStore(STORES.CO_OCCURRENCE);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result
          .filter(item => item.domain1 === domain || item.domain2 === domain)
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save session summary
   * @param {Object} session - Session data
   */
  async saveSession(session) {
    await this.init();
    const tx = this.db.transaction([STORES.SESSION_SUMMARIES], 'readwrite');
    const store = tx.objectStore(STORES.SESSION_SUMMARIES);

    const data = {
      sessionId: session.sessionId || `session-${Date.now()}-${Math.random()}`,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
      domains: session.domains, // Array of domains visited
      tabCount: session.tabCount || 0,
      createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get recent sessions
   * @param {number} limit - Number of sessions
   */
  async getRecentSessions(limit = 10) {
    await this.init();
    const tx = this.db.transaction([STORES.SESSION_SUMMARIES], 'readonly');
    const store = tx.objectStore(STORES.SESSION_SUMMARIES);
    const index = store.index('startTime');

    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data (privacy control)
   */
  async clearAll() {
    await this.init();
    const tx = this.db.transaction(
      [STORES.DOMAIN_STATS, STORES.PATTERNS, STORES.CO_OCCURRENCE, STORES.SESSION_SUMMARIES, STORES.BROWSING_HABITS],
      'readwrite'
    );

    const clearPromises = [
      this.clearStore(tx, STORES.DOMAIN_STATS),
      this.clearStore(tx, STORES.PATTERNS),
      this.clearStore(tx, STORES.CO_OCCURRENCE),
      this.clearStore(tx, STORES.SESSION_SUMMARIES),
      this.clearStore(tx, STORES.BROWSING_HABITS)
    ];

    await Promise.all(clearPromises);
  }

  /**
   * Clear a specific store
   */
  clearStore(tx, storeName) {
    return new Promise((resolve, reject) => {
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete domains from storage (privacy control)
   * @param {string[]} domains - Domains to delete
   */
  async deleteDomains(domains) {
    await this.init();
    const tx = this.db.transaction([STORES.DOMAIN_STATS], 'readwrite');
    const store = tx.objectStore(STORES.DOMAIN_STATS);

    const deletePromises = domains.map(domain => new Promise((resolve) => {
      const request = store.delete(domain);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve(); // Continue on error
    }));

    await Promise.all(deletePromises);
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    await this.init();

    const [domainCount, patternCount, coOccurrenceCount, sessionCount] = await Promise.all([
      this.getStoreCount(STORES.DOMAIN_STATS),
      this.getStoreCount(STORES.PATTERNS),
      this.getStoreCount(STORES.CO_OCCURRENCE),
      this.getStoreCount(STORES.SESSION_SUMMARIES)
    ]);

    return {
      domains: domainCount,
      patterns: patternCount,
      coOccurrences: coOccurrenceCount,
      sessions: sessionCount,
      updatedAt: Date.now()
    };
  }

  /**
   * Get count of items in a store
   */
  async getStoreCount(storeName) {
    const tx = this.db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Export singleton instance (available globally for extension pages)
if (typeof window !== 'undefined') {
  window.historyStorage = new HistoryStorage();
}
// Also make available in background context
const historyStorage = typeof window !== 'undefined' ? window.historyStorage : new HistoryStorage();

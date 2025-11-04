/**
 * IndexedDB Storage for Rich Tab Analytics
 *
 * Provides structured storage for:
 * - Tab metadata with classification & entities
 * - Full-text page content (compressed)
 * - Named entities with tab references
 * - Semantic embeddings for similarity
 *
 * Design goals:
 * - Fast queries with indexes
 * - Scalable to 10,000+ tabs
 * - Offline-first (import from analysis JSON)
 * - Separation of hot/cold data (embeddings separate)
 */

class IndexedDBStorage {
  constructor() {
    this.dbName = 'filtre-infini-db';
    this.version = 1;
    this.db = null;
  }

  /**
   * Initialize database connection with schema
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('[IndexedDB] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log(`[IndexedDB] Database opened successfully (v${this.version})`);
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log(`[IndexedDB] Upgrading database from v${event.oldVersion} to v${event.newVersion}`);

        // Store 1: tabs (core metadata + classification + entities summary)
        if (!db.objectStoreNames.contains('tabs')) {
          const tabStore = db.createObjectStore('tabs', { keyPath: 'tabId' });

          // Indexes for fast queries
          tabStore.createIndex('domain', 'domain', { unique: false });
          tabStore.createIndex('lastUsed', 'lastUsed', { unique: false });
          tabStore.createIndex('intent', 'classification.intent.label', { unique: false });
          tabStore.createIndex('status', 'classification.status.label', { unique: false });
          tabStore.createIndex('contentType', 'classification.contentType.label', { unique: false });

          console.log('[IndexedDB] Created "tabs" store with indexes');
        }

        // Store 2: content (full page text, compressed)
        if (!db.objectStoreNames.contains('content')) {
          const contentStore = db.createObjectStore('content', { keyPath: 'tabId' });
          contentStore.createIndex('wordCount', 'wordCount', { unique: false });

          console.log('[IndexedDB] Created "content" store');
        }

        // Store 3: entities (named entities with tab references)
        if (!db.objectStoreNames.contains('entities')) {
          const entityStore = db.createObjectStore('entities', {
            keyPath: 'entityId',
            autoIncrement: true
          });

          entityStore.createIndex('name', 'name', { unique: false });
          entityStore.createIndex('type', 'type', { unique: false });

          console.log('[IndexedDB] Created "entities" store');
        }

        // Store 4: embeddings (semantic vectors for similarity)
        if (!db.objectStoreNames.contains('embeddings')) {
          const embeddingStore = db.createObjectStore('embeddings', { keyPath: 'tabId' });

          console.log('[IndexedDB] Created "embeddings" store');
        }
      };
    });
  }

  /**
   * Save tab data to tabs store
   * @param {Object} tab - Tab object with classification, entities, etc.
   * @returns {Promise<void>}
   */
  async saveTab(tab) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readwrite');
      const store = tx.objectStore('tabs');

      const request = store.put(tab);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save multiple tabs in batch
   * @param {Array<Object>} tabs - Array of tab objects
   * @param {Function} onProgress - Progress callback (current, total)
   * @returns {Promise<void>}
   */
  async saveTabs(tabs, onProgress = null) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readwrite');
      const store = tx.objectStore('tabs');

      let completed = 0;
      const total = tabs.length;

      for (const tab of tabs) {
        const request = store.put(tab);

        request.onsuccess = () => {
          completed++;
          if (onProgress) {
            onProgress(completed, total);
          }
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Failed to save tab ${tab.tabId}:`, request.error);
        };
      }

      tx.oncomplete = () => {
        console.log(`[IndexedDB] Saved ${completed}/${total} tabs`);
        resolve();
      };

      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get a single tab by ID
   * @param {string} tabId - Tab ID
   * @returns {Promise<Object|null>}
   */
  async getTab(tabId) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const store = tx.objectStore('tabs');
      const request = store.get(tabId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all tabs
   * @returns {Promise<Array<Object>>}
   */
  async getAllTabs() {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const store = tx.objectStore('tabs');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query tabs by domain
   * @param {string} domain - Domain name
   * @returns {Promise<Array<Object>>}
   */
  async queryByDomain(domain) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const store = tx.objectStore('tabs');
      const index = store.index('domain');
      const request = index.getAll(domain);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query tabs by classification
   * @param {string} field - 'intent', 'status', or 'contentType'
   * @param {string} value - Label value
   * @returns {Promise<Array<Object>>}
   */
  async queryByClassification(field, value) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const store = tx.objectStore('tabs');
      const index = store.index(field);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save full-text content for a tab
   * @param {string} tabId - Tab ID
   * @param {string} fullText - Full page text (will be compressed)
   * @param {number} wordCount - Word count
   * @param {string} language - Detected language
   * @returns {Promise<void>}
   */
  async saveContent(tabId, fullText, wordCount, language = 'en') {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('content', 'readwrite');
      const store = tx.objectStore('content');

      const request = store.put({
        tabId,
        fullText,  // TODO: Add compression in Phase 2.2
        wordCount,
        language,
        savedAt: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get content for a tab
   * @param {string} tabId - Tab ID
   * @returns {Promise<Object|null>}
   */
  async getContent(tabId) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('content', 'readonly');
      const store = tx.objectStore('content');
      const request = store.get(tabId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Search tabs by content (full-text search)
   * @param {string} query - Search query
   * @param {number} limit - Max results (default 100)
   * @returns {Promise<Array<Object>>} Tabs with matching content + snippets
   */
  async searchContent(query, limit = 100) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['tabs', 'content'], 'readonly');
      const contentStore = tx.objectStore('content');
      const tabStore = tx.objectStore('tabs');

      const results = [];
      const queryLower = query.toLowerCase();

      const request = contentStore.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor && results.length < limit) {
          const content = cursor.value;
          const fullText = content.fullText || '';
          const fullTextLower = fullText.toLowerCase();

          // Simple substring search (can be enhanced with tokenization)
          if (fullTextLower.includes(queryLower)) {
            // Find snippet around match
            const matchIndex = fullTextLower.indexOf(queryLower);
            const snippetStart = Math.max(0, matchIndex - 50);
            const snippetEnd = Math.min(fullText.length, matchIndex + query.length + 50);
            const snippet = fullText.slice(snippetStart, snippetEnd);

            // Get corresponding tab
            const tabRequest = tabStore.get(content.tabId);
            tabRequest.onsuccess = () => {
              if (tabRequest.result) {
                results.push({
                  ...tabRequest.result,
                  snippet: '...' + snippet + '...',
                  matchIndex
                });
              }
            };
          }

          cursor.continue();
        } else {
          // Finished or reached limit
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save entity with tab references
   * @param {string} name - Entity name
   * @param {string} type - Entity type (person, organization, location, misc)
   * @param {Array<string>} tabIds - Tab IDs where entity appears
   * @returns {Promise<number>} Entity ID
   */
  async saveEntity(name, type, tabIds) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('entities', 'readwrite');
      const store = tx.objectStore('entities');

      // Check if entity already exists
      const index = store.index('name');
      const checkRequest = index.get(name);

      checkRequest.onsuccess = () => {
        const existing = checkRequest.result;

        if (existing) {
          // Update existing entity
          existing.tabIds = [...new Set([...existing.tabIds, ...tabIds])];
          existing.mentions = existing.tabIds.length;

          const updateRequest = store.put(existing);
          updateRequest.onsuccess = () => resolve(existing.entityId);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          // Create new entity
          const addRequest = store.add({
            name,
            type,
            tabIds: [...new Set(tabIds)],
            mentions: tabIds.length
          });

          addRequest.onsuccess = () => resolve(addRequest.result);
          addRequest.onerror = () => reject(addRequest.error);
        }
      };

      checkRequest.onerror = () => reject(checkRequest.error);
    });
  }

  /**
   * Search tabs by entity name
   * @param {string} entityName - Entity name
   * @returns {Promise<Array<Object>>} Tabs mentioning entity
   */
  async searchEntities(entityName) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['entities', 'tabs'], 'readonly');
      const entityStore = tx.objectStore('entities');
      const tabStore = tx.objectStore('tabs');

      const index = entityStore.index('name');
      const request = index.get(entityName);

      request.onsuccess = () => {
        const entity = request.result;

        if (!entity || !entity.tabIds) {
          resolve([]);
          return;
        }

        // Get all tabs for this entity
        const tabs = [];
        let pending = entity.tabIds.length;

        for (const tabId of entity.tabIds) {
          const tabRequest = tabStore.get(tabId);

          tabRequest.onsuccess = () => {
            if (tabRequest.result) {
              tabs.push(tabRequest.result);
            }

            pending--;
            if (pending === 0) {
              resolve(tabs);
            }
          };

          tabRequest.onerror = () => {
            pending--;
            if (pending === 0) {
              resolve(tabs);
            }
          };
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save embedding vector
   * @param {string} tabId - Tab ID
   * @param {Float32Array} vector - Embedding vector
   * @returns {Promise<void>}
   */
  async saveEmbedding(tabId, vector) {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('embeddings', 'readwrite');
      const store = tx.objectStore('embeddings');

      const request = store.put({
        tabId,
        vector,
        computedAt: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Import analysis JSON file into IndexedDB
   * @param {Object} analysisData - Parsed analysis JSON
   * @param {Function} onProgress - Progress callback (phase, current, total)
   * @returns {Promise<Object>} Import statistics
   */
  async importFromAnalysisFile(analysisData, onProgress = null) {
    console.log('[IndexedDB] Starting import from analysis file...');

    const stats = {
      tabs: 0,
      content: 0,
      entities: 0,
      embeddings: 0,
      errors: []
    };

    if (!analysisData || !analysisData.tabs) {
      throw new Error('Invalid analysis data: missing tabs array');
    }

    const tabs = analysisData.tabs;
    const totalTabs = tabs.length;

    // Phase 1: Import tabs
    if (onProgress) onProgress('tabs', 0, totalTabs);

    try {
      await this.saveTabs(tabs, (current, total) => {
        stats.tabs = current;
        if (onProgress) onProgress('tabs', current, total);
      });
    } catch (error) {
      stats.errors.push(`Tab import failed: ${error.message}`);
    }

    // Phase 2: Import content (if available)
    if (onProgress) onProgress('content', 0, totalTabs);

    let contentCount = 0;
    for (const tab of tabs) {
      if (tab.fullText) {
        try {
          await this.saveContent(
            tab.tabId || tab.id,
            tab.fullText,
            tab.wordCount || 0,
            tab.language || 'en'
          );
          contentCount++;
          stats.content = contentCount;
          if (onProgress) onProgress('content', contentCount, totalTabs);
        } catch (error) {
          stats.errors.push(`Content import failed for tab ${tab.tabId}: ${error.message}`);
        }
      }
    }

    // Phase 3: Import entities
    if (onProgress) onProgress('entities', 0, totalTabs);

    const entityMap = new Map(); // name -> { type, tabIds }

    for (const tab of tabs) {
      if (tab.entities) {
        const tabId = tab.tabId || tab.id;

        // Collect all entities
        ['people', 'organizations', 'locations', 'misc'].forEach(type => {
          const entities = tab.entities[type] || [];
          entities.forEach(entity => {
            const name = entity.word || entity.text || entity;
            if (!entityMap.has(name)) {
              entityMap.set(name, { type: type.slice(0, -1), tabIds: [] });
            }
            entityMap.get(name).tabIds.push(tabId);
          });
        });
      }
    }

    let entityCount = 0;
    const totalEntities = entityMap.size;

    for (const [name, data] of entityMap.entries()) {
      try {
        await this.saveEntity(name, data.type, data.tabIds);
        entityCount++;
        stats.entities = entityCount;
        if (onProgress) onProgress('entities', entityCount, totalEntities);
      } catch (error) {
        stats.errors.push(`Entity import failed for ${name}: ${error.message}`);
      }
    }

    // Phase 4: Import embeddings
    if (onProgress) onProgress('embeddings', 0, totalTabs);

    let embeddingCount = 0;
    for (const tab of tabs) {
      if (tab.embedding) {
        try {
          const vector = new Float32Array(tab.embedding);
          await this.saveEmbedding(tab.tabId || tab.id, vector);
          embeddingCount++;
          stats.embeddings = embeddingCount;
          if (onProgress) onProgress('embeddings', embeddingCount, totalTabs);
        } catch (error) {
          stats.errors.push(`Embedding import failed for tab ${tab.tabId}: ${error.message}`);
        }
      }
    }

    console.log('[IndexedDB] Import complete:', stats);
    return stats;
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['tabs', 'content', 'entities', 'embeddings'], 'readonly');

      const stats = {
        tabs: 0,
        content: 0,
        entities: 0,
        embeddings: 0
      };

      let pending = 4;

      const checkComplete = () => {
        pending--;
        if (pending === 0) {
          resolve(stats);
        }
      };

      tx.objectStore('tabs').count().onsuccess = (e) => {
        stats.tabs = e.target.result;
        checkComplete();
      };

      tx.objectStore('content').count().onsuccess = (e) => {
        stats.content = e.target.result;
        checkComplete();
      };

      tx.objectStore('entities').count().onsuccess = (e) => {
        stats.entities = e.target.result;
        checkComplete();
      };

      tx.objectStore('embeddings').count().onsuccess = (e) => {
        stats.embeddings = e.target.result;
        checkComplete();
      };

      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Clear all data (use with caution)
   * @returns {Promise<void>}
   */
  async clearAll() {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['tabs', 'content', 'entities', 'embeddings'], 'readwrite');

      tx.objectStore('tabs').clear();
      tx.objectStore('content').clear();
      tx.objectStore('entities').clear();
      tx.objectStore('embeddings').clear();

      tx.oncomplete = () => {
        console.log('[IndexedDB] All data cleared');
        resolve();
      };

      tx.onerror = () => reject(tx.error);
    });
  }
}

// Export singleton instance
const indexedDBStorage = new IndexedDBStorage();

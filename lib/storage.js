/**
 * Storage wrapper for browser.storage.local
 * Provides consistent interface for persisting tab metadata
 */

const Storage = {
  /**
   * Get data for a specific key
   * @param {string} key - Storage key
   * @returns {Promise<any>} Stored data or null
   */
  async get(key) {
    const result = await browser.storage.local.get(key);
    return result[key] || null;
  },

  /**
   * Set data for a specific key
   * @param {string} key - Storage key
   * @param {any} value - Data to store
   * @returns {Promise<void>}
   */
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },

  /**
   * Remove data for a specific key
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async remove(key) {
    await browser.storage.local.remove(key);
  },

  /**
   * Get all stored data
   * @returns {Promise<Object>} All stored data
   */
  async getAll() {
    return await browser.storage.local.get(null);
  },

  /**
   * Clear all stored data
   * @returns {Promise<void>}
   */
  async clear() {
    await browser.storage.local.clear();
  }
};

import { describe, it, expect, beforeAll } from 'vitest';
import ContextFeatures from '../../lib/context-features.js';

// Mock DomainKnowledge globally for browser context simulation
global.DomainKnowledge = {
  getHints: (domain) => {
    // Return null by default (will be overridden in specific tests)
    return null;
  }
};

describe('ContextFeatures', () => {
  describe('extractSessionContext', () => {
    it('should handle empty tab array', () => {
      const context = ContextFeatures.extractSessionContext([]);

      expect(context.totalTabs).toBe(0);
      expect(context.coOccurringDomains).toEqual([]);
      expect(context.domainClusters).toEqual({});
      expect(context.sessionAge).toBe(0);
      expect(context.temporalPattern.allRecent).toBe(false);
    });

    it('should extract context from multiple tabs', () => {
      const now = Date.now();
      const tabs = [
        { domain: 'github.com', lastUsed: now - 1000 },
        { domain: 'github.com', lastUsed: now - 2000 },
        { domain: 'stackoverflow.com', lastUsed: now - 5000 },
        { domain: 'mdn.org', lastUsed: now - 10000 }
      ];

      const context = ContextFeatures.extractSessionContext(tabs);

      expect(context.totalTabs).toBe(4);
      expect(context.coOccurringDomains).toContain('github.com');
      expect(context.coOccurringDomains).toContain('stackoverflow.com');
      expect(context.coOccurringDomains).toContain('mdn.org');
      expect(context.domainClusters['github.com']).toBe(2);
      expect(context.domainClusters['stackoverflow.com']).toBe(1);
    });
  });

  describe('extractDomains', () => {
    it('should extract unique domains', () => {
      const tabs = [
        { domain: 'github.com' },
        { domain: 'github.com' },
        { domain: 'stackoverflow.com' }
      ];

      const domains = ContextFeatures.extractDomains(tabs);

      expect(domains).toHaveLength(2);
      expect(domains).toContain('github.com');
      expect(domains).toContain('stackoverflow.com');
    });

    it('should handle tabs without domain', () => {
      const tabs = [
        { domain: 'github.com' },
        { url: 'about:blank' },
        { domain: 'mdn.org' }
      ];

      const domains = ContextFeatures.extractDomains(tabs);

      expect(domains).toHaveLength(2);
      expect(domains).toContain('github.com');
      expect(domains).toContain('mdn.org');
    });
  });

  describe('getDomainClusters', () => {
    it('should count tabs per domain', () => {
      const tabs = [
        { domain: 'github.com' },
        { domain: 'github.com' },
        { domain: 'github.com' },
        { domain: 'stackoverflow.com' },
        { domain: 'mdn.org' }
      ];

      const clusters = ContextFeatures.getDomainClusters(tabs);

      expect(clusters['github.com']).toBe(3);
      expect(clusters['stackoverflow.com']).toBe(1);
      expect(clusters['mdn.org']).toBe(1);
    });

    it('should handle empty array', () => {
      const clusters = ContextFeatures.getDomainClusters([]);
      expect(clusters).toEqual({});
    });
  });

  describe('calculateTemporalPattern', () => {
    it('should detect all recent tabs', () => {
      const now = Date.now();
      const tabs = [
        { lastUsed: now - 1000 },
        { lastUsed: now - 2000 },
        { lastUsed: now - 5000 }
      ];

      const pattern = ContextFeatures.calculateTemporalPattern(tabs);

      expect(pattern.allRecent).toBe(true);
      expect(pattern.hasStaleTabs).toBe(false);
      expect(pattern.ageSpread).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('should detect stale tabs', () => {
      const now = Date.now();
      const sevenDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
      const tabs = [
        { lastUsed: now - 1000 },
        { lastUsed: sevenDaysAgo }
      ];

      const pattern = ContextFeatures.calculateTemporalPattern(tabs);

      expect(pattern.allRecent).toBe(false);
      expect(pattern.hasStaleTabs).toBe(true);
      expect(pattern.ageSpread).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
    });

    it('should handle sync timestamps (seconds)', () => {
      const now = Date.now();
      const nowInSeconds = Math.floor(now / 1000);
      const tabs = [
        { lastUsed: nowInSeconds - 100 }, // 100 seconds ago
        { lastUsed: nowInSeconds - 200 }
      ];

      const pattern = ContextFeatures.calculateTemporalPattern(tabs);

      expect(pattern.allRecent).toBe(true);
      expect(pattern.ageSpread).toBeGreaterThan(0);
    });

    it('should handle missing lastUsed', () => {
      const tabs = [
        { title: 'Tab without timestamp' },
        { lastUsed: Date.now() }
      ];

      const pattern = ContextFeatures.calculateTemporalPattern(tabs);

      expect(pattern).toBeDefined();
      expect(pattern.allRecent).toBeDefined();
    });
  });

  describe('calculateSessionAge', () => {
    it('should calculate age from oldest tab', () => {
      const now = Date.now();
      const tabs = [
        { lastUsed: now - 1000 },
        { lastUsed: now - 10000 },
        { lastUsed: now - 5000 }
      ];

      const age = ContextFeatures.calculateSessionAge(tabs);

      expect(age).toBeGreaterThanOrEqual(10000);
      expect(age).toBeLessThan(11000);
    });

    it('should handle sync timestamps (seconds)', () => {
      const now = Date.now();
      const nowInSeconds = Math.floor(now / 1000);
      const tabs = [
        { lastUsed: nowInSeconds - 3600 } // 1 hour ago
      ];

      const age = ContextFeatures.calculateSessionAge(tabs);

      expect(age).toBeGreaterThanOrEqual(3600 * 1000);
      expect(age).toBeLessThan(3700 * 1000);
    });

    it('should return 0 for empty array', () => {
      const age = ContextFeatures.calculateSessionAge([]);
      expect(age).toBe(0);
    });
  });

  describe('applyHeuristics', () => {
    it('should boost reference for old tabs', () => {
      const now = Date.now();
      const sevenDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
      const tab = {
        domain: 'example.com',
        lastUsed: sevenDaysAgo,
        inactive: false
      };

      const scores = {
        intent: { labels: ['informational'], scores: [0.5], topK: [] },
        status: { labels: ['to-read', 'reference', 'maybe'], scores: [0.6, 0.3, 0.1], topK: [] },
        contentType: { labels: ['content'], scores: [0.7], topK: [] }
      };

      const boosted = ContextFeatures.applyHeuristics(scores, {}, tab);

      expect(boosted.status.scores[1]).toBeGreaterThan(scores.status.scores[1]); // reference boosted
    });

    it('should boost communication for known domains', () => {
      const tab = {
        domain: 'gmail.com',
        lastUsed: Date.now(),
        inactive: false
      };

      const scores = {
        intent: { labels: ['informational'], scores: [0.5], topK: [] },
        status: { labels: ['to-read'], scores: [0.6], topK: [] },
        contentType: { labels: ['content', 'communication', 'search'], scores: [0.5, 0.3, 0.2], topK: [] }
      };

      const boosted = ContextFeatures.applyHeuristics(scores, {}, tab);

      expect(boosted.contentType.scores[1]).toBeGreaterThan(scores.contentType.scores[1]); // communication boosted
    });

    it('should boost search for search engines', () => {
      const tab = {
        domain: 'google.com',
        lastUsed: Date.now(),
        inactive: false
      };

      const scores = {
        intent: { labels: ['informational', 'navigational'], scores: [0.5, 0.3], topK: [] },
        status: { labels: ['to-read'], scores: [0.6], topK: [] },
        contentType: { labels: ['content', 'communication', 'search'], scores: [0.4, 0.3, 0.3], topK: [] }
      };

      const boosted = ContextFeatures.applyHeuristics(scores, {}, tab);

      expect(boosted.contentType.scores[2]).toBeGreaterThan(scores.contentType.scores[2]); // search boosted
      expect(boosted.intent.scores[0]).toBeGreaterThan(scores.intent.scores[0]); // informational boosted
    });

    it('should adjust scores for inactive tabs', () => {
      const tab = {
        domain: 'example.com',
        lastUsed: Date.now(),
        inactive: true
      };

      const scores = {
        intent: { labels: ['informational'], scores: [0.5], topK: [] },
        status: { labels: ['to-read', 'to-do', 'maybe'], scores: [0.5, 0.4, 0.1], topK: [] },
        contentType: { labels: ['content'], scores: [0.7], topK: [] }
      };

      const boosted = ContextFeatures.applyHeuristics(scores, {}, tab);

      expect(boosted.status.scores[2]).toBeGreaterThan(scores.status.scores[2]); // maybe boosted
      expect(boosted.status.scores[1]).toBeLessThan(scores.status.scores[1]); // to-do reduced
    });
  });

  describe('helper methods', () => {
    it('should detect communication domains', () => {
      expect(ContextFeatures.isCommunicationDomain('gmail.com')).toBe(true);
      expect(ContextFeatures.isCommunicationDomain('slack.com')).toBe(true);
      expect(ContextFeatures.isCommunicationDomain('github.com')).toBe(false);
    });

    it('should detect search domains', () => {
      expect(ContextFeatures.isSearchDomain('google.com')).toBe(true);
      expect(ContextFeatures.isSearchDomain('duckduckgo.com')).toBe(true);
      expect(ContextFeatures.isSearchDomain('github.com')).toBe(false);
    });

    it('should calculate tab age correctly', () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const tab = { lastUsed: oneHourAgo };

      const age = ContextFeatures.getTabAge(tab);

      expect(age).toBeGreaterThanOrEqual(60 * 60 * 1000);
      expect(age).toBeLessThan(61 * 60 * 1000);
    });
  });
});

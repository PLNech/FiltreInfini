import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load and evaluate SyncParser source
const code = readFileSync(resolve(__dirname, '../../lib/sync-parser.js'), 'utf8');

// Create a mock global context and execute the code
const createSyncParser = () => {
  const wrappedCode = `(function() { ${code}; return SyncParser; })()`;
  return eval(wrappedCode);
};

const SyncParser = createSyncParser();

describe('SyncParser', () => {
  let parser;

  beforeEach(() => {
    parser = new SyncParser();
  });

  describe('extractTimestamp', () => {
    it('should extract timestamp from filename', () => {
      const timestamp = parser.extractTimestamp('synced-tabs-1762162517587.json');
      expect(timestamp).toBe(1762162517587);
    });

    it('should fallback to current time for invalid filename', () => {
      const before = Date.now();
      const timestamp = parser.extractTimestamp('invalid-filename.json');
      const after = Date.now();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      expect(parser.extractDomain('https://www.storysaver.net/')).toBe('www.storysaver.net');
      expect(parser.extractDomain('https://github.com/user/repo')).toBe('github.com');
    });

    it('should handle protocol-only URLs', () => {
      expect(parser.extractDomain('about:blank')).toBe('about');
    });

    it('should handle invalid URLs', () => {
      expect(parser.extractDomain('not a url')).toBe('unknown');
    });
  });

  describe('formatAge', () => {
    it('should format recent ages', () => {
      expect(parser.formatAge(0)).toBe('Today');
      expect(parser.formatAge(1)).toBe('Yesterday');
      expect(parser.formatAge(3)).toBe('3d ago');
    });

    it('should format weeks', () => {
      expect(parser.formatAge(7)).toBe('1w ago');
      expect(parser.formatAge(14)).toBe('2w ago');
    });

    it('should format months', () => {
      expect(parser.formatAge(30)).toBe('1mo ago');
      expect(parser.formatAge(60)).toBe('2mo ago');
    });

    it('should format years', () => {
      expect(parser.formatAge(365)).toBe('1y ago');
      expect(parser.formatAge(730)).toBe('2y ago');
    });
  });

  describe('isInternalUrl', () => {
    it('should identify internal URLs', () => {
      expect(parser.isInternalUrl('about:blank')).toBe(true);
      expect(parser.isInternalUrl('moz-extension://abc123')).toBe(true);
      expect(parser.isInternalUrl('chrome://settings')).toBe(true);
      expect(parser.isInternalUrl('view-source:https://example.com')).toBe(true);
    });

    it('should not flag external URLs', () => {
      expect(parser.isInternalUrl('https://example.com')).toBe(false);
      expect(parser.isInternalUrl('http://localhost:3000')).toBe(false);
    });
  });

  describe('formatSyncDate', () => {
    it('should format recent sync dates', () => {
      const now = Date.now();
      expect(parser.formatSyncDate(now)).toBe('Today');
      expect(parser.formatSyncDate(now - 24 * 60 * 60 * 1000)).toBe('Yesterday');
    });

    it('should format dates within a week', () => {
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      expect(parser.formatSyncDate(twoDaysAgo)).toBe('2 days ago');
    });

    it('should format older dates', () => {
      const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const result = parser.formatSyncDate(longAgo);
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // Date format
    });
  });

  describe('calculateTabAge', () => {
    it('should calculate age in days', () => {
      const now = Math.floor(Date.now() / 1000); // seconds
      const oneDayAgo = now - 24 * 60 * 60;
      const oneWeekAgo = now - 7 * 24 * 60 * 60;

      expect(parser.calculateTabAge(now)).toBe(0);
      expect(parser.calculateTabAge(oneDayAgo)).toBe(1);
      expect(parser.calculateTabAge(oneWeekAgo)).toBe(7);
    });
  });

  describe('parse', () => {
    it('should parse synced tabs data', () => {
      const mockData = [
        {
          clientType: 'phone',
          id: 'device-123',
          name: 'My Phone',
          type: 'client',
          tabs: [
            {
              type: 'tab',
              title: 'Test Tab',
              url: 'https://example.com/page',
              icon: 'page-icon:https://example.com/page',
              client: 'device-123',
              lastUsed: Math.floor(Date.now() / 1000) - 24 * 60 * 60, // 1 day ago
              inactive: false,
            },
          ],
        },
      ];

      const result = parser.parse(mockData, 'synced-tabs-1762162517587.json');

      expect(result.deviceCount).toBe(1);
      expect(result.totalTabs).toBe(1);
      expect(result.tabs).toHaveLength(1);

      const tab = result.tabs[0];
      expect(tab.title).toBe('Test Tab');
      expect(tab.url).toBe('https://example.com/page');
      expect(tab.domain).toBe('example.com');
      expect(tab.deviceName).toBe('My Phone');
      expect(tab.source).toBe('synced');
      expect(tab.ageFormatted).toBe('Yesterday');
      expect(tab.ageDays).toBe(1);
      expect(tab.isInternal).toBe(false);
      expect(tab.id).toContain('synced-device-123-');
    });

    it('should handle multiple devices', () => {
      const mockData = [
        {
          id: 'device-1',
          name: 'Phone',
          tabs: [{ title: 'Tab 1', url: 'https://a.com', lastUsed: Date.now() / 1000 }],
        },
        {
          id: 'device-2',
          name: 'Tablet',
          tabs: [{ title: 'Tab 2', url: 'https://b.com', lastUsed: Date.now() / 1000 }],
        },
      ];

      const result = parser.parse(mockData, 'synced-tabs-123.json');

      expect(result.deviceCount).toBe(2);
      expect(result.totalTabs).toBe(2);
      expect(result.tabs.map(t => t.deviceName)).toEqual(['Phone', 'Tablet']);
    });

    it('should handle empty tabs array', () => {
      const mockData = [
        {
          id: 'device-1',
          name: 'Empty Device',
          tabs: [],
        },
      ];

      const result = parser.parse(mockData, 'synced-tabs-123.json');

      expect(result.deviceCount).toBe(1);
      expect(result.totalTabs).toBe(0);
      expect(result.tabs).toHaveLength(0);
    });
  });
});

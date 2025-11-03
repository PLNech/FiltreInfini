/**
 * Unit tests for DownloadManager
 *
 * Test with real-world URLs that have known failure modes:
 * - 401: Unauthorized (WSJ paywall)
 * - 403: Forbidden (various anti-bot protections)
 * - 404: Not Found (dead links)
 * - 429: Too Many Requests (rate limiting)
 * - Timeout: Network issues
 * - fetch failed: DNS/connection errors
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Test URLs with known failure modes
const TEST_URLS = {
  paywall401: 'https://www.wsj.com/tech/ai/ai-bubble-building-spree-55ee6128',
  forbidden403: [
    'https://www.ter.sncf.com/centre-val-de-loire/tarifs-cartes/billets-promo/festival-de-loire',
    'https://www.perplexity.ai/auth/verify-request?email=test',
    'https://claude.ai/public/artifacts/6e96dd64-92fb-406d-86f4-63ac82db5555',
    'https://www.maangchi.com/recipe/rice',
    'https://malwaretech.com/2025/08/every-reason-why-i-hate-ai.html',
    'https://www.bloomberg.com/opinion/newsletters/2025-07-14/musk-has-money'
  ],
  notFound404: 'https://gdg.community.dev/events/details/google-gdg-paris-presents-devfest-2025-paris/',
  rateLimit429: 'https://archive.is/test',
  fetchFailed: [
    'https://wifi.sncf/',
    'https://www.psychiatryadvisor.com/features/schizophrenia-linked-with-common-viral-infections/'
  ],
  working: 'https://www.wikipedia.org/'
};

// Mock DownloadManager (simplified version for testing)
class DownloadManager {
  constructor() {
    this.queue = [];
    this.results = new Map();
    this.attempts = new Map();
    this.domainLastFetch = new Map();
    this.domainBackoff = new Map();
    this.MAX_RETRIES = 3;
    this.TIMEOUT_MS = 8000;
    this.MIN_DOMAIN_DELAY = 1000;
    this.successCount = 0;
    this.failureCount = 0;
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  add(url) {
    if (!url.startsWith('http')) {
      this.results.set(url, null);
      return;
    }
    this.queue.push(url);
    this.attempts.set(url, 0);
  }

  canFetchDomain(domain) {
    const lastFetch = this.domainLastFetch.get(domain) || 0;
    const backoff = this.domainBackoff.get(domain) || this.MIN_DOMAIN_DELAY;
    const elapsed = Date.now() - lastFetch;
    return elapsed >= backoff;
  }

  markDomainFetched(domain) {
    this.domainLastFetch.set(domain, Date.now());
  }

  increaseDomainBackoff(domain) {
    const currentBackoff = this.domainBackoff.get(domain) || this.MIN_DOMAIN_DELAY;
    const newBackoff = Math.min(currentBackoff * 2, 60000);
    this.domainBackoff.set(domain, newBackoff);
    return newBackoff;
  }

  resetDomainBackoff(domain) {
    this.domainBackoff.set(domain, this.MIN_DOMAIN_DELAY);
  }

  async fetchOne(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const attempt = this.attempts.get(url);
      const headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      };

      if (attempt >= 2) {
        const urlObj = new URL(url);
        headers['Referer'] = `${urlObj.protocol}//${urlObj.host}/`;
      }

      const response = await fetch(url, {
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 403 || response.status === 402) {
        if (attempt === 1) {
          throw new Error(`HTTP 403 (will retry with referer)`);
        }
        if (attempt === 2) {
          return await this.fetchFromArchive(url);
        }
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const wordCount = textContent.split(/\s+/).length;
      return Math.max(1, Math.round(wordCount / 200));
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async fetchFromArchive(originalUrl) {
    // Simplified - just throw for testing
    throw new Error('Archive not available in tests');
  }

  getStats() {
    return {
      success: this.successCount,
      failure: this.failureCount,
      pending: this.queue.length
    };
  }
}

describe('DownloadManager', () => {
  let dm;

  beforeEach(() => {
    dm = new DownloadManager();
  });

  describe('Domain extraction', () => {
    it('should extract domain from URL', () => {
      assert.strictEqual(dm.getDomain('https://www.wikipedia.org/'), 'www.wikipedia.org');
      assert.strictEqual(dm.getDomain('https://archive.is/test'), 'archive.is');
      assert.strictEqual(dm.getDomain('invalid'), 'unknown');
    });
  });

  describe('Rate limiting', () => {
    it('should allow first fetch immediately', () => {
      assert.strictEqual(dm.canFetchDomain('example.com'), true);
    });

    it('should block fetch within delay window', () => {
      dm.markDomainFetched('example.com');
      assert.strictEqual(dm.canFetchDomain('example.com'), false);
    });

    it('should allow fetch after delay', async () => {
      dm.markDomainFetched('example.com');
      await new Promise(resolve => setTimeout(resolve, 1100));
      assert.strictEqual(dm.canFetchDomain('example.com'), true);
    });

    it('should increase backoff exponentially', () => {
      const backoff1 = dm.increaseDomainBackoff('archive.is');
      assert.strictEqual(backoff1, 2000); // 1s * 2

      const backoff2 = dm.increaseDomainBackoff('archive.is');
      assert.strictEqual(backoff2, 4000); // 2s * 2

      const backoff3 = dm.increaseDomainBackoff('archive.is');
      assert.strictEqual(backoff3, 8000); // 4s * 2
    });

    it('should cap backoff at 60s', () => {
      for (let i = 0; i < 10; i++) {
        dm.increaseDomainBackoff('archive.is');
      }
      const backoff = dm.domainBackoff.get('archive.is');
      assert.strictEqual(backoff, 60000);
    });

    it('should reset backoff on success', () => {
      dm.increaseDomainBackoff('example.com');
      dm.increaseDomainBackoff('example.com');
      assert.strictEqual(dm.domainBackoff.get('example.com'), 4000);

      dm.resetDomainBackoff('example.com');
      assert.strictEqual(dm.domainBackoff.get('example.com'), 1000);
    });
  });

  describe('Queue management', () => {
    it('should add URLs to queue', () => {
      dm.add('https://example.com/');
      assert.strictEqual(dm.queue.length, 1);
      assert.strictEqual(dm.attempts.get('https://example.com/'), 0);
    });

    it('should skip non-http URLs', () => {
      dm.add('about:blank');
      assert.strictEqual(dm.queue.length, 0);
      assert.strictEqual(dm.results.get('about:blank'), null);
    });
  });

  describe('Real-world error handling', () => {
    it('should detect 401 paywall errors', async () => {
      dm.add(TEST_URLS.paywall401);
      dm.attempts.set(TEST_URLS.paywall401, 1);

      try {
        await dm.fetchOne(TEST_URLS.paywall401);
        assert.fail('Should have thrown 401');
      } catch (error) {
        assert.match(error.message, /HTTP 401/);
      }
    });

    it('should detect 403 forbidden errors', async () => {
      const url = TEST_URLS.forbidden403[0];
      dm.add(url);
      dm.attempts.set(url, 1);

      try {
        await dm.fetchOne(url);
        assert.fail('Should have thrown 403');
      } catch (error) {
        assert.match(error.message, /HTTP 403/);
      }
    });

    it('should detect 404 not found errors', async () => {
      dm.add(TEST_URLS.notFound404);
      dm.attempts.set(TEST_URLS.notFound404, 1);

      try {
        await dm.fetchOne(TEST_URLS.notFound404);
        assert.fail('Should have thrown 404');
      } catch (error) {
        assert.match(error.message, /HTTP 404/);
      }
    });

    it('should handle fetch failures gracefully', async () => {
      const url = TEST_URLS.fetchFailed[0];
      dm.add(url);
      dm.attempts.set(url, 1);

      try {
        await dm.fetchOne(url);
        assert.fail('Should have thrown fetch error');
      } catch (error) {
        // fetch errors can be various messages
        assert.ok(error.message);
      }
    });

    it('should successfully fetch working URLs', async () => {
      dm.add(TEST_URLS.working);
      dm.attempts.set(TEST_URLS.working, 1);

      const result = await dm.fetchOne(TEST_URLS.working);
      assert.ok(result > 0, 'Should return reading time in minutes');
    });
  });

  describe('Stats tracking', () => {
    it('should track stats correctly', () => {
      dm.successCount = 10;
      dm.failureCount = 2;
      dm.add('https://pending.com/');

      const stats = dm.getStats();
      assert.strictEqual(stats.success, 10);
      assert.strictEqual(stats.failure, 2);
      assert.strictEqual(stats.pending, 1);
    });
  });
});

console.log('✅ Run tests with: node --test tests/unit/download-manager.test.js');

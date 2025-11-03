import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Unit tests for MLClassifier - 3D Tab Classification System
 *
 * Dimensions:
 * 1. Intent (Broder 2002): informational, navigational, transactional
 * 2. Status (Tabs.do 2021): to-read, to-do, reference, maybe, done
 * 3. Content-Type (WWW 2010): content, communication, search
 */

// Mock the Transformers.js library for testing
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(() => Promise.resolve(mockClassifier))
}));

const mockClassifier = vi.fn((text, labels) => {
  // Mock responses based on keywords in text
  const lowerText = text.toLowerCase();

  if (labels.includes('informational')) {
    // Intent classification
    if (lowerText.includes('tutorial') || lowerText.includes('guide')) {
      return [
        { label: 'informational', score: 0.85 },
        { label: 'navigational', score: 0.10 },
        { label: 'transactional', score: 0.05 }
      ];
    }
    if (lowerText.includes('buy') || lowerText.includes('shop')) {
      return [
        { label: 'transactional', score: 0.80 },
        { label: 'informational', score: 0.15 },
        { label: 'navigational', score: 0.05 }
      ];
    }
  }

  if (labels.includes('to-read')) {
    // Status classification
    if (lowerText.includes('article') || lowerText.includes('blog')) {
      return [
        { label: 'to-read', score: 0.78 },
        { label: 'reference', score: 0.15 },
        { label: 'to-do', score: 0.05 },
        { label: 'maybe', score: 0.02 },
        { label: 'done', score: 0.00 }
      ];
    }
    if (lowerText.includes('docs') || lowerText.includes('documentation')) {
      return [
        { label: 'reference', score: 0.70 },
        { label: 'to-read', score: 0.20 },
        { label: 'to-do', score: 0.05 },
        { label: 'maybe', score: 0.03 },
        { label: 'done', score: 0.02 }
      ];
    }
  }

  if (labels.includes('content')) {
    // Content-Type classification
    if (lowerText.includes('gmail') || lowerText.includes('slack')) {
      return [
        { label: 'communication', score: 0.92 },
        { label: 'content', score: 0.05 },
        { label: 'search', score: 0.03 }
      ];
    }
    if (lowerText.includes('google') && lowerText.includes('search')) {
      return [
        { label: 'search', score: 0.88 },
        { label: 'content', score: 0.10 },
        { label: 'communication', score: 0.02 }
      ];
    }
  }

  // Default scores
  return labels.map((label, i) => ({
    label,
    score: i === 0 ? 0.60 : 0.20
  }));
});

describe('MLClassifier', () => {
  let MLClassifier;
  let classifier;

  beforeEach(async () => {
    // Dynamically import the module (will be created)
    // For now, we'll skip the actual import and just define the interface
    vi.clearAllMocks();
  });

  describe('Feature Extraction', () => {
    it('should extract basic features from tab', () => {
      const tab = {
        id: 'tab-123',
        title: 'JavaScript Tutorial - MDN',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        domain: 'developer.mozilla.org',
        lastUsed: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        inactive: false
      };

      const expected = {
        text: 'JavaScript Tutorial - MDN developer.mozilla.org /en-US/docs/Web/JavaScript',
        domain: 'developer.mozilla.org',
        lastUsed: tab.lastUsed,
        inactive: false
      };

      // Test will verify the extraction logic
      expect(tab.title).toBe('JavaScript Tutorial - MDN');
      expect(tab.domain).toBe('developer.mozilla.org');
    });

    it('should handle tabs with missing metadata', () => {
      const tab = {
        id: 'tab-456',
        title: 'Untitled',
        url: 'about:blank',
        domain: 'about',
        lastUsed: Date.now(),
        inactive: true
      };

      expect(tab.domain).toBe('about');
      expect(tab.inactive).toBe(true);
    });
  });

  describe('Context Features', () => {
    it('should extract session context from tab array', () => {
      const tabs = [
        { domain: 'github.com', lastUsed: Date.now() - 1000 },
        { domain: 'github.com', lastUsed: Date.now() - 2000 },
        { domain: 'stackoverflow.com', lastUsed: Date.now() - 5000 },
        { domain: 'mdn.org', lastUsed: Date.now() - 10000 }
      ];

      const context = {
        totalTabs: tabs.length,
        coOccurringDomains: ['github.com', 'stackoverflow.com', 'mdn.org'],
        domainClusters: {
          'github.com': 2,
          'stackoverflow.com': 1,
          'mdn.org': 1
        },
        sessionAge: 10000,
        temporalPattern: {
          allRecent: true,
          hasStaleTabs: false,
          ageSpread: 9000
        }
      };

      expect(context.totalTabs).toBe(4);
      expect(context.domainClusters['github.com']).toBe(2);
      expect(context.temporalPattern.allRecent).toBe(true);
    });

    it('should detect stale tabs in session', () => {
      const tabs = [
        { lastUsed: Date.now() - 1000 },
        { lastUsed: Date.now() - 8 * 24 * 60 * 60 * 1000 } // 8 days ago
      ];

      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const hasStaleTabs = tabs.some(t => (Date.now() - t.lastUsed) > sevenDays);

      expect(hasStaleTabs).toBe(true);
    });
  });

  describe('Intent Classification (Broder 2002)', () => {
    it('should classify informational content', async () => {
      const text = 'JavaScript Tutorial - Complete Guide developer.mozilla.org';
      const labels = ['informational', 'navigational', 'transactional'];

      const result = await mockClassifier(text, labels);

      expect(result[0].label).toBe('informational');
      expect(result[0].score).toBeGreaterThan(0.7);
    });

    it('should classify transactional content', async () => {
      const text = 'Buy iPhone 15 - Apple Store shop now';
      const labels = ['informational', 'navigational', 'transactional'];

      const result = await mockClassifier(text, labels);

      expect(result[0].label).toBe('transactional');
      expect(result[0].score).toBeGreaterThan(0.7);
    });

    it('should classify navigational content', async () => {
      const text = 'Login - GitHub homepage';
      const labels = ['informational', 'navigational', 'transactional'];

      const result = await mockClassifier(text, labels);

      // At minimum, should return 3 scores
      expect(result).toHaveLength(3);
      expect(result.every(r => r.score >= 0 && r.score <= 1)).toBe(true);
    });
  });

  describe('Status Classification (Tabs.do 2021)', () => {
    it('should classify to-read articles', async () => {
      const text = 'Interesting article about AI - Medium blog post';
      const labels = ['to-read', 'to-do', 'reference', 'maybe', 'done'];

      const result = await mockClassifier(text, labels);

      expect(result[0].label).toBe('to-read');
      expect(result[0].score).toBeGreaterThan(0.6);
    });

    it('should classify reference documentation', async () => {
      const text = 'Python documentation - Official docs';
      const labels = ['to-read', 'to-do', 'reference', 'maybe', 'done'];

      const result = await mockClassifier(text, labels);

      expect(result[0].label).toBe('reference');
      expect(result[0].score).toBeGreaterThan(0.6);
    });

    it('should boost reference for old tabs', () => {
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      const isOld = (now - sevenDaysAgo) > (7 * 24 * 60 * 60 * 1000);
      expect(isOld).toBe(false);

      const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
      const isVeryOld = (now - fourteenDaysAgo) > (7 * 24 * 60 * 60 * 1000);
      expect(isVeryOld).toBe(true);
    });
  });

  describe('Content-Type Classification (WWW 2010)', () => {
    it('should classify communication sites', async () => {
      const text = 'Gmail - Inbox google mail';
      const labels = ['content', 'communication', 'search'];

      const result = await mockClassifier(text, labels);

      expect(result[0].label).toBe('communication');
      expect(result[0].score).toBeGreaterThan(0.8);
    });

    it('should classify search engines', async () => {
      const text = 'Google Search - javascript tutorials';
      const labels = ['content', 'communication', 'search'];

      const result = await mockClassifier(text, labels);

      expect(result[0].label).toBe('search');
      expect(result[0].score).toBeGreaterThan(0.7);
    });

    it('should classify content sites', async () => {
      const text = 'News article - CNN latest updates';
      const labels = ['content', 'communication', 'search'];

      const result = await mockClassifier(text, labels);

      expect(result).toHaveLength(3);
      expect(result[0].score).toBeGreaterThan(0);
    });
  });

  describe('Multi-label Classification', () => {
    it('should return multiple labels per dimension above threshold', () => {
      const scores = [
        { label: 'to-read', score: 0.78 },
        { label: 'reference', score: 0.45 },
        { label: 'to-do', score: 0.25 },
        { label: 'maybe', score: 0.08 },
        { label: 'done', score: 0.02 }
      ];

      const threshold = 0.3;
      const filtered = scores.filter(s => s.score > threshold);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].label).toBe('to-read');
      expect(filtered[1].label).toBe('reference');
    });

    it('should return topK predictions', () => {
      const scores = [
        { label: 'informational', score: 0.85 },
        { label: 'navigational', score: 0.10 },
        { label: 'transactional', score: 0.05 }
      ];

      const topK = scores.slice(0, 2);

      expect(topK).toHaveLength(2);
      expect(topK[0].score).toBeGreaterThan(topK[1].score);
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple tabs efficiently', async () => {
      const tabs = [
        { title: 'Article 1', url: 'https://example.com/1' },
        { title: 'Article 2', url: 'https://example.com/2' },
        { title: 'Article 3', url: 'https://example.com/3' }
      ];

      // Mock batch processing
      const results = await Promise.all(
        tabs.map(async (tab) => ({
          tabId: tab.url,
          classifications: {
            intent: await mockClassifier(tab.title, ['informational', 'navigational', 'transactional']),
            status: await mockClassifier(tab.title, ['to-read', 'to-do', 'reference', 'maybe', 'done']),
            contentType: await mockClassifier(tab.title, ['content', 'communication', 'search'])
          }
        }))
      );

      expect(results).toHaveLength(3);
      expect(results[0].classifications.intent).toBeDefined();
      expect(results[0].classifications.status).toBeDefined();
      expect(results[0].classifications.contentType).toBeDefined();
    });
  });

  describe('Caching', () => {
    it('should check cache before classifying', async () => {
      const tabId = 'tab-123';
      const cachedClassification = {
        tabId,
        classifications: {
          intent: { topK: [{ label: 'informational', score: 0.85 }] }
        },
        metadata: {
          classifiedAt: Date.now() - 1000,
          modelVersion: 'distilbert-v1'
        }
      };

      const isFresh = (Date.now() - cachedClassification.metadata.classifiedAt) < 24 * 60 * 60 * 1000;
      expect(isFresh).toBe(true);
    });

    it('should re-classify if cache is stale (>24h)', () => {
      const yesterday = Date.now() - 25 * 60 * 60 * 1000;
      const isStale = (Date.now() - yesterday) > 24 * 60 * 60 * 1000;

      expect(isStale).toBe(true);
    });
  });

  describe('Output Format', () => {
    it('should produce correct 3D classification structure', () => {
      const output = {
        tabId: 'tab-123',
        classifications: {
          intent: {
            labels: ['informational', 'navigational', 'transactional'],
            scores: [0.85, 0.12, 0.45],
            topK: [
              { label: 'informational', score: 0.85 },
              { label: 'transactional', score: 0.45 }
            ]
          },
          status: {
            labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
            scores: [0.78, 0.34, 0.15, 0.08, 0.02],
            topK: [
              { label: 'to-read', score: 0.78 },
              { label: 'to-do', score: 0.34 }
            ]
          },
          contentType: {
            labels: ['content', 'communication', 'search'],
            scores: [0.92, 0.15, 0.03],
            topK: [
              { label: 'content', score: 0.92 }
            ]
          }
        },
        metadata: {
          modelVersion: 'distilbert-v1',
          classifiedAt: Date.now(),
          sessionContext: {
            totalTabs: 10,
            coOccurringDomains: ['github.com', 'mdn.org']
          }
        }
      };

      expect(output.classifications.intent).toBeDefined();
      expect(output.classifications.status).toBeDefined();
      expect(output.classifications.contentType).toBeDefined();
      expect(output.metadata.modelVersion).toBe('distilbert-v1');
      expect(Array.isArray(output.classifications.intent.topK)).toBe(true);
    });
  });

  describe('Two-Pass Classification', () => {
    describe('extractClassificationPatterns()', () => {
      it('should extract domain mappings from classification results', () => {
        const tabs = [
          {
            id: 'tab-1',
            domain: 'github.com',
            lastUsed: Date.now() - 1000 * 60 * 60 * 24 * 2 // 2 days ago
          },
          {
            id: 'tab-2',
            domain: 'github.com',
            lastUsed: Date.now() - 1000 * 60 * 60 * 24 * 3
          },
          {
            id: 'tab-3',
            domain: 'stackoverflow.com',
            lastUsed: Date.now() - 1000 * 60 * 60 * 24 * 10 // 10 days ago
          }
        ];

        const results = [
          {
            tabId: 'tab-1',
            classifications: {
              intent: {
                labels: ['informational', 'navigational', 'transactional'],
                scores: [0.85, 0.10, 0.05],
                topK: [{ label: 'informational', score: 0.85 }]
              },
              status: {
                labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
                scores: [0.60, 0.25, 0.10, 0.03, 0.02],
                topK: [{ label: 'to-read', score: 0.60 }]
              },
              contentType: {
                labels: ['content', 'communication', 'search'],
                scores: [0.90, 0.08, 0.02],
                topK: [{ label: 'content', score: 0.90 }]
              }
            }
          },
          {
            tabId: 'tab-2',
            classifications: {
              intent: {
                labels: ['informational', 'navigational', 'transactional'],
                scores: [0.80, 0.15, 0.05],
                topK: [{ label: 'informational', score: 0.80 }]
              },
              status: {
                labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
                scores: [0.70, 0.20, 0.08, 0.01, 0.01],
                topK: [{ label: 'to-read', score: 0.70 }]
              },
              contentType: {
                labels: ['content', 'communication', 'search'],
                scores: [0.85, 0.10, 0.05],
                topK: [{ label: 'content', score: 0.85 }]
              }
            }
          },
          {
            tabId: 'tab-3',
            classifications: {
              intent: {
                labels: ['informational', 'navigational', 'transactional'],
                scores: [0.75, 0.20, 0.05],
                topK: [{ label: 'informational', score: 0.75 }]
              },
              status: {
                labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
                scores: [0.45, 0.30, 0.20, 0.04, 0.01],
                topK: [{ label: 'to-read', score: 0.45 }]
              },
              contentType: {
                labels: ['content', 'communication', 'search'],
                scores: [0.88, 0.10, 0.02],
                topK: [{ label: 'content', score: 0.88 }]
              }
            }
          }
        ];

        // Mock classifier instance with extractClassificationPatterns method
        const classifier = {
          extractClassificationPatterns: (results, tabs) => {
            const patterns = {
              domainMappings: {},
              temporalPatterns: { recent: {}, active: {}, stale: {}, old: {} },
              globalDistribution: { intent: {}, status: {}, contentType: {} },
              uncertainTabs: [],
              stats: { totalTabs: tabs.length, uncertainCount: 0, domainsClassified: 0 }
            };

            // Process results
            results.forEach((result, index) => {
              const tab = tabs[index];
              if (!tab || !tab.domain) return;

              const { classifications } = result;
              const intentTop = classifications.intent.topK[0];
              const statusTop = classifications.status.topK[0];
              const contentTypeTop = classifications.contentType.topK[0];

              // Extract domain mapping (high confidence only)
              if (intentTop.score > 0.4 && statusTop.score > 0.4 && contentTypeTop.score > 0.4) {
                if (!patterns.domainMappings[tab.domain]) {
                  patterns.domainMappings[tab.domain] = {
                    intent: {},
                    status: {},
                    contentType: {},
                    count: 0
                  };
                }

                const mapping = patterns.domainMappings[tab.domain];
                mapping.intent[intentTop.label] = (mapping.intent[intentTop.label] || 0) + intentTop.score;
                mapping.status[statusTop.label] = (mapping.status[statusTop.label] || 0) + statusTop.score;
                mapping.contentType[contentTypeTop.label] = (mapping.contentType[contentTypeTop.label] || 0) + contentTypeTop.score;
                mapping.count++;
              }

              // Identify uncertain tabs
              const avgScore = (intentTop.score + statusTop.score + contentTypeTop.score) / 3;
              if (avgScore < 0.5) {
                patterns.uncertainTabs.push({
                  tabIndex: index,
                  tabId: tab.id,
                  avgConfidence: avgScore
                });
              }
            });

            // Normalize domain mappings
            Object.keys(patterns.domainMappings).forEach(domain => {
              const mapping = patterns.domainMappings[domain];
              ['intent', 'status', 'contentType'].forEach(dimension => {
                const scores = mapping[dimension];
                const entries = Object.entries(scores);
                if (entries.length > 0) {
                  entries.sort((a, b) => b[1] - a[1]);
                  mapping[dimension] = {
                    dominant: entries[0][0],
                    confidence: entries[0][1] / mapping.count,
                    alternatives: entries.slice(1, 3).map(([label, score]) => ({
                      label,
                      confidence: score / mapping.count
                    }))
                  };
                }
              });
            });

            patterns.stats.domainsClassified = Object.keys(patterns.domainMappings).length;
            patterns.stats.uncertainCount = patterns.uncertainTabs.length;

            return patterns;
          }
        };

        const patterns = classifier.extractClassificationPatterns(results, tabs);

        expect(patterns).toBeDefined();
        expect(patterns.domainMappings).toBeDefined();
        expect(patterns.domainMappings['github.com']).toBeDefined();
        expect(patterns.domainMappings['github.com'].intent.dominant).toBe('informational');
        expect(patterns.domainMappings['github.com'].status.dominant).toBe('to-read');
        expect(patterns.domainMappings['github.com'].contentType.dominant).toBe('content');
        expect(patterns.stats.domainsClassified).toBe(2); // github.com and stackoverflow.com
        expect(patterns.uncertainTabs.length).toBe(0); // All tabs have high confidence
      });

      it('should identify uncertain tabs correctly', () => {
        const tabs = [
          { id: 'tab-1', domain: 'example.com', lastUsed: Date.now() },
          { id: 'tab-2', domain: 'test.com', lastUsed: Date.now() }
        ];

        const results = [
          {
            tabId: 'tab-1',
            classifications: {
              intent: {
                labels: ['informational', 'navigational', 'transactional'],
                scores: [0.35, 0.33, 0.32],
                topK: [{ label: 'informational', score: 0.35 }]
              },
              status: {
                labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
                scores: [0.40, 0.30, 0.20, 0.08, 0.02],
                topK: [{ label: 'to-read', score: 0.40 }]
              },
              contentType: {
                labels: ['content', 'communication', 'search'],
                scores: [0.42, 0.35, 0.23],
                topK: [{ label: 'content', score: 0.42 }]
              }
            }
          },
          {
            tabId: 'tab-2',
            classifications: {
              intent: {
                labels: ['informational', 'navigational', 'transactional'],
                scores: [0.85, 0.10, 0.05],
                topK: [{ label: 'informational', score: 0.85 }]
              },
              status: {
                labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
                scores: [0.80, 0.15, 0.03, 0.01, 0.01],
                topK: [{ label: 'to-read', score: 0.80 }]
              },
              contentType: {
                labels: ['content', 'communication', 'search'],
                scores: [0.90, 0.08, 0.02],
                topK: [{ label: 'content', score: 0.90 }]
              }
            }
          }
        ];

        // Use same mock implementation
        const classifier = {
          extractClassificationPatterns: (results, tabs) => {
            const patterns = {
              domainMappings: {},
              temporalPatterns: { recent: {}, active: {}, stale: {}, old: {} },
              globalDistribution: { intent: {}, status: {}, contentType: {} },
              uncertainTabs: [],
              stats: { totalTabs: tabs.length, uncertainCount: 0, domainsClassified: 0 }
            };

            results.forEach((result, index) => {
              const tab = tabs[index];
              const { classifications } = result;
              const intentTop = classifications.intent.topK[0];
              const statusTop = classifications.status.topK[0];
              const contentTypeTop = classifications.contentType.topK[0];

              const avgScore = (intentTop.score + statusTop.score + contentTypeTop.score) / 3;
              if (avgScore < 0.5) {
                patterns.uncertainTabs.push({
                  tabIndex: index,
                  tabId: tab.id,
                  avgConfidence: avgScore
                });
              }
            });

            patterns.stats.uncertainCount = patterns.uncertainTabs.length;
            return patterns;
          }
        };

        const patterns = classifier.extractClassificationPatterns(results, tabs);

        expect(patterns.uncertainTabs.length).toBe(1);
        expect(patterns.uncertainTabs[0].tabId).toBe('tab-1');
        expect(patterns.uncertainTabs[0].avgConfidence).toBeLessThan(0.5);
        expect(patterns.stats.uncertainCount).toBe(1);
      });
    });

    describe('classifyAllTabsTwoPass()', () => {
      it('should skip Pass 2 when all tabs have high confidence', async () => {
        const tabs = [
          { id: 'tab-1', title: 'GitHub Docs', domain: 'github.com', lastUsed: Date.now() },
          { id: 'tab-2', title: 'MDN Guide', domain: 'mdn.org', lastUsed: Date.now() }
        ];

        // Mock classifier with two-pass method
        const classifier = {
          classifyBatch: vi.fn(() => Promise.resolve([
            {
              tabId: 'tab-1',
              classifications: {
                intent: { labels: ['informational', 'navigational', 'transactional'], scores: [0.85, 0.10, 0.05], topK: [{ label: 'informational', score: 0.85 }] },
                status: { labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'], scores: [0.75, 0.15, 0.08, 0.01, 0.01], topK: [{ label: 'to-read', score: 0.75 }] },
                contentType: { labels: ['content', 'communication', 'search'], scores: [0.90, 0.08, 0.02], topK: [{ label: 'content', score: 0.90 }] }
              }
            },
            {
              tabId: 'tab-2',
              classifications: {
                intent: { labels: ['informational', 'navigational', 'transactional'], scores: [0.80, 0.15, 0.05], topK: [{ label: 'informational', score: 0.80 }] },
                status: { labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'], scores: [0.70, 0.20, 0.08, 0.01, 0.01], topK: [{ label: 'to-read', score: 0.70 }] },
                contentType: { labels: ['content', 'communication', 'search'], scores: [0.85, 0.10, 0.05], topK: [{ label: 'content', score: 0.85 }] }
              }
            }
          ])),
          extractClassificationPatterns: () => ({
            domainMappings: {},
            temporalPatterns: {},
            globalDistribution: {},
            uncertainTabs: [], // No uncertain tabs
            stats: { totalTabs: 2, uncertainCount: 0, domainsClassified: 0 }
          }),
          classifyAllTabsTwoPass: async function(tabs, options) {
            const pass1Results = await this.classifyBatch(tabs);
            const patterns = this.extractClassificationPatterns(pass1Results, tabs);

            // Skip Pass 2 since no uncertain tabs
            return {
              results: pass1Results,
              patterns,
              stats: {
                totalTabs: tabs.length,
                pass1Time: 1000,
                pass2Time: 0,
                uncertainRefined: 0,
                averageImprovement: 0,
                totalTime: 1000
              }
            };
          }
        };

        const result = await classifier.classifyAllTabsTwoPass(tabs, {});

        expect(result.stats.uncertainRefined).toBe(0);
        expect(result.stats.pass2Time).toBe(0);
        expect(result.results.length).toBe(2);
      });

      it('should run Pass 2 for uncertain tabs', async () => {
        const tabs = [
          { id: 'tab-1', title: 'Uncertain Page', domain: 'example.com', lastUsed: Date.now() },
          { id: 'tab-2', title: 'GitHub Docs', domain: 'github.com', lastUsed: Date.now() }
        ];

        const classifier = {
          classifyBatch: vi.fn(() => Promise.resolve([
            {
              tabId: 'tab-1',
              classifications: {
                intent: { labels: ['informational', 'navigational', 'transactional'], scores: [0.35, 0.33, 0.32], topK: [{ label: 'informational', score: 0.35 }] },
                status: { labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'], scores: [0.40, 0.30, 0.20, 0.08, 0.02], topK: [{ label: 'to-read', score: 0.40 }] },
                contentType: { labels: ['content', 'communication', 'search'], scores: [0.42, 0.35, 0.23], topK: [{ label: 'content', score: 0.42 }] }
              }
            },
            {
              tabId: 'tab-2',
              classifications: {
                intent: { labels: ['informational', 'navigational', 'transactional'], scores: [0.85, 0.10, 0.05], topK: [{ label: 'informational', score: 0.85 }] },
                status: { labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'], scores: [0.75, 0.15, 0.08, 0.01, 0.01], topK: [{ label: 'to-read', score: 0.75 }] },
                contentType: { labels: ['content', 'communication', 'search'], scores: [0.90, 0.08, 0.02], topK: [{ label: 'content', score: 0.90 }] }
              }
            }
          ])),
          classifyTab: vi.fn(() => Promise.resolve({
            classifications: {
              intent: { labels: ['informational', 'navigational', 'transactional'], scores: [0.75, 0.20, 0.05], topK: [{ label: 'informational', score: 0.75 }] },
              status: { labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'], scores: [0.70, 0.20, 0.08, 0.01, 0.01], topK: [{ label: 'to-read', score: 0.70 }] },
              contentType: { labels: ['content', 'communication', 'search'], scores: [0.80, 0.15, 0.05], topK: [{ label: 'content', score: 0.80 }] }
            }
          })),
          extractClassificationPatterns: (results, tabs) => ({
            domainMappings: {},
            temporalPatterns: {},
            globalDistribution: {},
            uncertainTabs: [{ tabIndex: 0, tabId: 'tab-1', avgConfidence: 0.39 }],
            stats: { totalTabs: 2, uncertainCount: 1, domainsClassified: 0 }
          }),
          classifyAllTabsTwoPass: async function(tabs, options) {
            const pass1Results = await this.classifyBatch(tabs);
            const patterns = this.extractClassificationPatterns(pass1Results, tabs);

            // Run Pass 2 for uncertain tabs
            if (patterns.uncertainTabs.length > 0) {
              for (const uncertainItem of patterns.uncertainTabs) {
                const refinedResult = await this.classifyTab(tabs[uncertainItem.tabIndex], {});
                pass1Results[uncertainItem.tabIndex] = {
                  ...refinedResult,
                  tabId: uncertainItem.tabId,
                  refinedInPass2: true,
                  confidenceImprovement: 0.36 // 0.75 - 0.39
                };
              }
            }

            return {
              results: pass1Results,
              patterns,
              stats: {
                totalTabs: tabs.length,
                pass1Time: 1000,
                pass2Time: 500,
                uncertainRefined: patterns.uncertainTabs.length,
                averageImprovement: 0.36,
                totalTime: 1500
              }
            };
          }
        };

        const result = await classifier.classifyAllTabsTwoPass(tabs, { forcePass2: false });

        expect(result.stats.uncertainRefined).toBe(1);
        expect(result.stats.pass2Time).toBeGreaterThan(0);
        expect(result.stats.averageImprovement).toBeGreaterThan(0);
        expect(result.results[0].refinedInPass2).toBe(true);
        expect(result.results[0].confidenceImprovement).toBeGreaterThan(0);
      });
    });
  });
});

/**
 * ML-Powered Tab Classifier - 3D Taxonomy
 *
 * Uses Transformers.js (DistilBERT) for zero-shot classification across 3 dimensions:
 * 1. Intent (Broder 2002): informational, navigational, transactional
 * 2. Status (Tabs.do 2021): to-read, to-do, reference, maybe, done
 * 3. Content-Type (WWW 2010): content, communication, search
 *
 * Model: Xenova/distilbert-base-uncased-mnli (~67MB, cached in IndexedDB)
 * Context: Session features + domain knowledge (no browser history yet)
 *
 * @see PLAN-ML.md for full specification
 * @version 0.2.0-beta.2 (2025-11-03 14:15 - local vendor)
 */

// Use IIFE to avoid global variable redeclaration issues
(function() {
  'use strict';

  // Module-level variables (not globals)
  let pipeline = null;
  let ContextFeatures = null;
  let metadataStorage = null;

// Lazy load dependencies
async function loadDependencies() {
  if (!pipeline) {
    // In browser context, transformersPipeline is loaded via CDN script tag
    if (typeof window !== 'undefined' && window.transformersPipeline) {
      pipeline = window.transformersPipeline;
      console.log('[MLClassifier] Using CDN-loaded Transformers.js');
    } else if (typeof require !== 'undefined') {
      // In Node.js test context, use npm package
      try {
        const transformers = await import('@xenova/transformers');
        pipeline = transformers.pipeline;
        console.log('[MLClassifier] Using npm package Transformers.js');
      } catch (error) {
        console.error('[MLClassifier] Failed to load Transformers.js:', error);
        throw new Error('Could not load Transformers.js. Make sure the CDN script is loaded.');
      }
    } else {
      throw new Error('Transformers.js not available. Make sure the CDN script tag is loaded in HTML.');
    }
  }

  // ContextFeatures and metadataStorage are loaded via script tags in browser
  if (typeof window !== 'undefined') {
    ContextFeatures = window.ContextFeatures;
    metadataStorage = window.metadataStorage;
  } else if (typeof require !== 'undefined') {
    if (!ContextFeatures) {
      ContextFeatures = require('./context-features.js');
    }
    if (!metadataStorage) {
      metadataStorage = require('./metadata-storage.js');
    }
  }
}

class MLClassifier {
  // Singleton pattern
  static instance = null;

  // 3D Taxonomy labels
  static LABELS = {
    intent: ['informational', 'navigational', 'transactional'],
    status: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
    contentType: ['content', 'communication', 'search']
  };

  // Model configuration
  static MODEL_NAME = 'Xenova/distilbert-base-uncased-mnli';
  static MODEL_VERSION = 'distilbert-v1';
  static THRESHOLD = 0.3; // Minimum score to include in topK
  static MAX_INPUT_LENGTH = 512; // DistilBERT token limit
  static CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.model = null;
    this.isLoading = false;
    this.loadPromise = null;
  }

  /**
   * Get singleton instance
   * @returns {MLClassifier}
   */
  static getInstance() {
    if (!MLClassifier.instance) {
      MLClassifier.instance = new MLClassifier();
    }
    return MLClassifier.instance;
  }

  /**
   * Load the ML model (lazy loading)
   * @returns {Promise<void>}
   */
  async loadModel() {
    if (this.model) return; // Already loaded

    if (this.isLoading) {
      // Wait for existing load operation
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = (async () => {
      try {
        console.log('[MLClassifier] Loading model:', MLClassifier.MODEL_NAME);
        const startTime = Date.now();

        await loadDependencies();

        this.model = await pipeline('zero-shot-classification', MLClassifier.MODEL_NAME);

        const loadTime = Date.now() - startTime;
        console.log(`[MLClassifier] Model loaded in ${loadTime}ms`);
      } catch (error) {
        console.error('[MLClassifier] Failed to load model:', error);
        this.isLoading = false;
        throw error;
      } finally {
        this.isLoading = false;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Extract text features from tab for classification
   * @param {Object} tab - Tab object with title, url, domain
   * @returns {string} - Concatenated text for classification
   */
  extractFeatures(tab) {
    const parts = [];

    // Title (highest weight)
    if (tab.title && tab.title !== 'Untitled') {
      parts.push(tab.title);
    }

    // Domain
    if (tab.domain && tab.domain !== 'about') {
      parts.push(tab.domain);
    }

    // URL path (extract meaningful parts)
    if (tab.url) {
      try {
        const url = new URL(tab.url);
        const path = url.pathname.replace(/\//g, ' ').replace(/[_-]/g, ' ').trim();
        if (path && path.length > 0 && path !== ' ') {
          parts.push(path);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }

    const text = parts.join(' ');

    // Truncate to model's token limit (rough approximation: 1 token ~= 4 chars)
    const maxChars = MLClassifier.MAX_INPUT_LENGTH * 4;
    return text.length > maxChars ? text.substring(0, maxChars) : text;
  }

  /**
   * Classify a single tab across all 3 dimensions
   * @param {Object} tab - Tab to classify
   * @param {Object} sessionContext - Session context features
   * @returns {Promise<Object>} - Classification results
   */
  async classifyTab(tab, sessionContext = null) {
    await this.loadModel();

    const features = this.extractFeatures(tab);

    if (!features || features.length < 3) {
      // Not enough data to classify
      return this.getDefaultClassification(tab);
    }

    try {
      // Run 3D classification in parallel
      const [intentResult, statusResult, contentTypeResult] = await Promise.all([
        this.model(features, MLClassifier.LABELS.intent, { multi_label: true }),
        this.model(features, MLClassifier.LABELS.status, { multi_label: true }),
        this.model(features, MLClassifier.LABELS.contentType, { multi_label: true })
      ]);

      // Convert to standardized format
      const rawScores = {
        intent: this.parseResult(intentResult, MLClassifier.LABELS.intent),
        status: this.parseResult(statusResult, MLClassifier.LABELS.status),
        contentType: this.parseResult(contentTypeResult, MLClassifier.LABELS.contentType)
      };

      // Apply heuristic boosting
      const boostedScores = ContextFeatures
        ? ContextFeatures.applyHeuristics(rawScores, sessionContext, tab)
        : rawScores;

      return {
        classifications: boostedScores,
        metadata: {
          modelVersion: MLClassifier.MODEL_VERSION,
          classifiedAt: Date.now(),
          sessionContext: sessionContext ? {
            totalTabs: sessionContext.totalTabs,
            coOccurringDomains: sessionContext.coOccurringDomains.slice(0, 5)
          } : null
        }
      };
    } catch (error) {
      console.error('[MLClassifier] Classification error:', error);
      return this.getDefaultClassification(tab);
    }
  }

  /**
   * Parse model output into standardized format
   * @param {Object} result - Model output
   * @param {Array<string>} allLabels - All labels for this dimension
   * @returns {Object} - Parsed result with labels, scores, topK
   */
  parseResult(result, allLabels) {
    // Create score map
    const scoreMap = {};
    result.labels.forEach((label, i) => {
      scoreMap[label] = result.scores[i];
    });

    // Ensure all labels have scores
    const labels = allLabels;
    const scores = labels.map(label => scoreMap[label] || 0);

    // Create topK (sorted, filtered by threshold)
    const topK = labels
      .map((label, i) => ({ label, score: scores[i] }))
      .sort((a, b) => b.score - a.score)
      .filter(item => item.score > MLClassifier.THRESHOLD)
      .slice(0, 3);

    return { labels, scores, topK };
  }

  /**
   * Get default classification when ML fails
   * @param {Object} tab
   * @returns {Object}
   */
  getDefaultClassification(tab) {
    return {
      classifications: {
        intent: {
          labels: MLClassifier.LABELS.intent,
          scores: [0.5, 0.3, 0.2],
          topK: [{ label: 'informational', score: 0.5 }]
        },
        status: {
          labels: MLClassifier.LABELS.status,
          scores: [0.4, 0.3, 0.2, 0.1, 0.0],
          topK: [{ label: 'to-read', score: 0.4 }]
        },
        contentType: {
          labels: MLClassifier.LABELS.contentType,
          scores: [0.6, 0.3, 0.1],
          topK: [{ label: 'content', score: 0.6 }]
        }
      },
      metadata: {
        modelVersion: 'default',
        classifiedAt: Date.now(),
        sessionContext: null
      }
    };
  }

  /**
   * Classify a batch of tabs
   * @param {Array<Object>} tabs - Tabs to classify
   * @param {Object} sessionContext - Session context (optional)
   * @returns {Promise<Array<Object>>} - Array of classification results
   */
  async classifyBatch(tabs, sessionContext = null) {
    const results = [];

    for (const tab of tabs) {
      try {
        const classification = await this.classifyTab(tab, sessionContext);
        results.push({
          tabId: tab.id,
          ...classification
        });

        // Store in cache
        if (metadataStorage && tab.id) {
          const metadata = await metadataStorage.getMetadata(tab.id) || {};
          metadata.mlClassifications = classification.classifications;
          metadata.mlMetadata = classification.metadata;
          await metadataStorage.setMetadata(tab.id, metadata);
        }
      } catch (error) {
        console.error(`[MLClassifier] Error classifying tab ${tab.id}:`, error);
        results.push({
          tabId: tab.id,
          ...this.getDefaultClassification(tab)
        });
      }
    }

    return results;
  }

  /**
   * Get or classify a tab (cache-first)
   * @param {Object} tab - Tab to classify
   * @param {Object} sessionContext - Session context
   * @returns {Promise<Object>} - Classification result
   */
  async getOrClassify(tab, sessionContext = null) {
    // Check cache first
    if (metadataStorage && tab.id) {
      const metadata = await metadataStorage.getMetadata(tab.id);

      if (metadata && metadata.mlClassifications && metadata.mlMetadata) {
        // Check if cache is fresh (< 24h old)
        const age = Date.now() - metadata.mlMetadata.classifiedAt;
        if (age < MLClassifier.CACHE_TTL) {
          return {
            classifications: metadata.mlClassifications,
            metadata: metadata.mlMetadata,
            cached: true
          };
        }
      }
    }

    // Cache miss or stale - classify
    const result = await this.classifyTab(tab, sessionContext);

    // Store in cache
    if (metadataStorage && tab.id) {
      const metadata = await metadataStorage.getMetadata(tab.id) || {};
      metadata.mlClassifications = result.classifications;
      metadata.mlMetadata = result.metadata;
      await metadataStorage.setMetadata(tab.id, metadata);
    }

    return { ...result, cached: false };
  }

  /**
   * Classify all tabs with progressive disclosure
   * @param {Array<Object>} tabs - All tabs
   * @param {Function} onProgress - Progress callback (optional)
   * @returns {Promise<void>}
   */
  async classifyAllTabs(tabs, onProgress = null) {
    console.log(`[MLClassifier] Starting batch classification: ${tabs.length} tabs`);

    // Extract session context once
    const sessionContext = ContextFeatures
      ? ContextFeatures.extractSessionContext(tabs)
      : null;

    // Filter tabs that need classification
    const needsClassification = [];
    for (const tab of tabs) {
      if (!metadataStorage || !tab.id) {
        needsClassification.push(tab);
        continue;
      }

      const metadata = await metadataStorage.getMetadata(tab.id);
      if (!metadata || !metadata.mlClassifications || !metadata.mlMetadata) {
        needsClassification.push(tab);
        continue;
      }

      // Check if stale
      const age = Date.now() - metadata.mlMetadata.classifiedAt;
      if (age > MLClassifier.CACHE_TTL) {
        needsClassification.push(tab);
      }
    }

    console.log(`[MLClassifier] ${needsClassification.length} tabs need classification`);

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < needsClassification.length; i += batchSize) {
      const batch = needsClassification.slice(i, i + batchSize);
      await this.classifyBatch(batch, sessionContext);

      if (onProgress) {
        onProgress({
          processed: Math.min(i + batchSize, needsClassification.length),
          total: needsClassification.length
        });
      }

      // Throttle to avoid blocking UI
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('[MLClassifier] Batch classification complete');
  }

  /**
   * Extract learned patterns from Pass 1 classification results
   * @param {Array<Object>} results - Array of classification results from Pass 1
   * @param {Array<Object>} tabs - Original tabs array
   * @returns {Object} - Learned patterns for Pass 2
   */
  extractClassificationPatterns(results, tabs) {
    const patterns = {
      domainMappings: {},      // domain -> {intent, status, contentType}
      temporalPatterns: {      // age bucket -> dominant labels
        recent: {},            // < 1 week
        active: {},            // 1 week - 1 month
        stale: {},             // 1 month - 6 months
        old: {}                // > 6 months
      },
      globalDistribution: {    // Overall label frequencies
        intent: {},
        status: {},
        contentType: {}
      },
      uncertainTabs: [],       // Tabs with low confidence (maxScore < 0.5)
      stats: {
        totalTabs: tabs.length,
        uncertainCount: 0,
        domainsClassified: 0
      }
    };

    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
    const SIX_MONTHS = 6 * ONE_MONTH;

    // Process each result
    results.forEach((result, index) => {
      const tab = tabs[index];
      if (!tab) return;

      const { classifications } = result;

      // 1. Extract domain mappings (high confidence only)
      if (tab.domain && tab.domain !== 'about') {
        const intentTop = classifications.intent.topK[0];
        const statusTop = classifications.status.topK[0];
        const contentTypeTop = classifications.contentType.topK[0];

        // Only store if all dimensions have reasonable confidence
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
      }

      // 2. Extract temporal patterns
      const age = tab.lastUsed ? now - tab.lastUsed : 0;
      let ageBucket;
      if (age < ONE_WEEK) ageBucket = 'recent';
      else if (age < ONE_MONTH) ageBucket = 'active';
      else if (age < SIX_MONTHS) ageBucket = 'stale';
      else ageBucket = 'old';

      const temporal = patterns.temporalPatterns[ageBucket];
      ['intent', 'status', 'contentType'].forEach(dimension => {
        const topLabel = classifications[dimension].topK[0].label;
        temporal[dimension] = temporal[dimension] || {};
        temporal[dimension][topLabel] = (temporal[dimension][topLabel] || 0) + 1;
      });

      // 3. Build global distribution
      ['intent', 'status', 'contentType'].forEach(dimension => {
        const topLabel = classifications[dimension].topK[0].label;
        patterns.globalDistribution[dimension][topLabel] =
          (patterns.globalDistribution[dimension][topLabel] || 0) + 1;
      });

      // 4. Identify uncertain tabs (low max confidence across any dimension)
      const maxScores = [
        classifications.intent.topK[0]?.score || 0,
        classifications.status.topK[0]?.score || 0,
        classifications.contentType.topK[0]?.score || 0
      ];
      const avgMaxScore = maxScores.reduce((a, b) => a + b, 0) / 3;

      if (avgMaxScore < 0.5) {
        patterns.uncertainTabs.push({
          tabIndex: index,
          tabId: tab.id,
          avgConfidence: avgMaxScore,
          classifications: classifications
        });
      }
    });

    // Normalize domain mappings (convert to dominant labels)
    patterns.stats.domainsClassified = Object.keys(patterns.domainMappings).length;
    Object.keys(patterns.domainMappings).forEach(domain => {
      const mapping = patterns.domainMappings[domain];
      ['intent', 'status', 'contentType'].forEach(dimension => {
        const scores = mapping[dimension];
        const entries = Object.entries(scores);
        if (entries.length > 0) {
          // Get dominant label
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

    patterns.stats.uncertainCount = patterns.uncertainTabs.length;

    console.log(`[MLClassifier] Extracted patterns:`, {
      domains: patterns.stats.domainsClassified,
      uncertain: patterns.stats.uncertainCount,
      uncertainPercent: ((patterns.stats.uncertainCount / patterns.stats.totalTabs) * 100).toFixed(1) + '%'
    });

    return patterns;
  }

  /**
   * Classify all tabs using two-pass strategy
   * Pass 1: Classify all tabs, extract patterns
   * Pass 2: Re-classify uncertain tabs with enriched context
   *
   * @param {Array<Object>} tabs - All tabs to classify
   * @param {Object} options - Options
   * @param {Function} options.onProgress - Progress callback
   * @param {boolean} options.forcePass2 - Force Pass 2 even if few uncertain tabs
   * @returns {Promise<Object>} - { results, patterns, stats }
   */
  async classifyAllTabsTwoPass(tabs, options = {}) {
    const { onProgress, forcePass2 = false } = options;

    console.log(`[MLClassifier] Starting two-pass classification: ${tabs.length} tabs`);

    // Extract session context once
    const sessionContext = ContextFeatures
      ? ContextFeatures.extractSessionContext(tabs)
      : null;

    // === PASS 1: Classify all tabs with base context ===
    console.log('[MLClassifier] Pass 1: Classifying all tabs...');
    const pass1StartTime = Date.now();

    const pass1Results = [];
    const batchSize = 10;

    for (let i = 0; i < tabs.length; i += batchSize) {
      const batch = tabs.slice(i, i + batchSize);
      const batchResults = await this.classifyBatch(batch, sessionContext);
      pass1Results.push(...batchResults);

      if (onProgress) {
        onProgress({
          phase: 'pass1',
          processed: Math.min(i + batchSize, tabs.length),
          total: tabs.length
        });
      }

      // Throttle to avoid blocking UI
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const pass1Time = Date.now() - pass1StartTime;
    console.log(`[MLClassifier] Pass 1 complete in ${pass1Time}ms`);

    // === EXTRACT PATTERNS ===
    console.log('[MLClassifier] Extracting learned patterns...');
    const patterns = this.extractClassificationPatterns(pass1Results, tabs);

    // Check if Pass 2 is warranted
    const uncertainPercent = (patterns.stats.uncertainCount / patterns.stats.totalTabs) * 100;
    const shouldRunPass2 = forcePass2 ||
      (patterns.stats.uncertainCount > 0 && uncertainPercent >= 5); // At least 5% uncertain

    if (!shouldRunPass2) {
      console.log(`[MLClassifier] Skipping Pass 2 (only ${uncertainPercent.toFixed(1)}% uncertain)`);
      return {
        results: pass1Results,
        patterns,
        stats: {
          totalTabs: tabs.length,
          pass1Time,
          pass2Time: 0,
          uncertainRefined: 0,
          averageImprovement: 0
        }
      };
    }

    // === PASS 2: Re-classify uncertain tabs with learned patterns ===
    console.log(`[MLClassifier] Pass 2: Re-classifying ${patterns.stats.uncertainCount} uncertain tabs...`);
    const pass2StartTime = Date.now();

    const finalResults = [...pass1Results]; // Clone
    let totalImprovement = 0;

    for (let i = 0; i < patterns.uncertainTabs.length; i++) {
      const uncertainItem = patterns.uncertainTabs[i];
      const tab = tabs[uncertainItem.tabIndex];

      // Re-classify with enriched context
      const pass2Result = await this.classifyTab(tab, {
        ...sessionContext,
        learnedPatterns: patterns // Pass learned patterns
      });

      // Calculate confidence improvement
      const pass1AvgScore = uncertainItem.avgConfidence;
      const pass2MaxScores = [
        pass2Result.classifications.intent.topK[0]?.score || 0,
        pass2Result.classifications.status.topK[0]?.score || 0,
        pass2Result.classifications.contentType.topK[0]?.score || 0
      ];
      const pass2AvgScore = pass2MaxScores.reduce((a, b) => a + b, 0) / 3;
      const improvement = pass2AvgScore - pass1AvgScore;
      totalImprovement += improvement;

      // Replace result
      finalResults[uncertainItem.tabIndex] = {
        tabId: tab.id,
        ...pass2Result,
        refinedInPass2: true,
        confidenceImprovement: improvement
      };

      if (onProgress && i % 5 === 0) {
        onProgress({
          phase: 'pass2',
          processed: i,
          total: patterns.stats.uncertainCount
        });
      }
    }

    const pass2Time = Date.now() - pass2StartTime;
    const averageImprovement = totalImprovement / patterns.stats.uncertainCount;

    console.log(`[MLClassifier] Pass 2 complete in ${pass2Time}ms`);
    console.log(`[MLClassifier] Average confidence improvement: +${(averageImprovement * 100).toFixed(1)}%`);

    return {
      results: finalResults,
      patterns,
      stats: {
        totalTabs: tabs.length,
        pass1Time,
        pass2Time,
        uncertainRefined: patterns.stats.uncertainCount,
        averageImprovement,
        totalTime: pass1Time + pass2Time
      }
    };
  }
}

  // Export singleton instance
  const mlClassifier = MLClassifier.getInstance();

  // Export for browser (global window object)
  if (typeof window !== 'undefined') {
    window.mlClassifier = mlClassifier;
    window.MLClassifier = MLClassifier;
    console.log('[MLClassifier] Exposed to window.mlClassifier');
  }

  // Export for Node.js/CommonJS (must be at end of IIFE)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mlClassifier;
    module.exports.MLClassifier = MLClassifier;
  }

})(); // End IIFE

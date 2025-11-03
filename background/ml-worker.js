/**
 * ML Worker - Background Service Worker for ML Classification
 *
 * Handles ML model loading and classification in the background worker
 * to avoid memory/download limits in extension pages.
 *
 * Based on Transformers.js extension example pattern:
 * https://github.com/xenova/transformers.js/tree/main/examples/extension
 */

console.log('[ML Worker] Script loaded - initializing ML classification worker...');

// Import Transformers.js (will be loaded dynamically)
let transformersLib = null;
let pipeline = null;

/**
 * ML Classifier Singleton
 * Loads model once and reuses it for all classifications
 */
class MLClassifierWorker {
  static task = 'zero-shot-classification';
  static model = 'classification';  // Local model directory name
  static instance = null;
  static isLoading = false;
  static loadError = null;

  /**
   * Get or create classifier instance
   * @param {Function} progress_callback - Optional progress callback
   * @returns {Promise<Object>} Pipeline instance
   */
  static async getInstance(progress_callback = null) {
    if (this.instance) {
      return this.instance;
    }

    if (this.isLoading) {
      // Wait for existing load to complete
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.instance) {
            clearInterval(checkInterval);
            resolve(this.instance);
          } else if (this.loadError) {
            clearInterval(checkInterval);
            reject(this.loadError);
          }
        }, 100);
      });
    }

    this.isLoading = true;
    console.log('[ML Worker] Loading model:', this.model);

    try {
      // Dynamically import Transformers.js
      if (!transformersLib) {
        console.log('[ML Worker] Importing Transformers.js from vendor...');
        transformersLib = await import('../lib/vendor/transformers/transformers.min.js');
        pipeline = transformersLib.pipeline;

        // Configure environment for local models
        if (transformersLib.env) {
          transformersLib.env.allowLocalModels = true;
          transformersLib.env.allowRemoteModels = false;
          transformersLib.env.localModelPath = browser.runtime.getURL('lib/vendor/models/');
          transformersLib.env.useBrowserCache = false;
          console.log('[ML Worker] Environment configured for local models:', transformersLib.env.localModelPath);
        }

        console.log('[ML Worker] ✓ Transformers.js loaded');
      }

      // Create pipeline
      console.log('[ML Worker] Creating pipeline...');
      const startTime = Date.now();

      // Progress callback to monitor download
      let lastLoggedProgress = 0;
      const progressCb = progress_callback || ((progress) => {
        if (progress.status === 'progress' && progress.progress) {
          const rounded = Math.floor(progress.progress / 20) * 20;  // Log every 20%
          if (rounded > lastLoggedProgress) {
            console.log(`[ML Worker] Loading: ${progress.file} - ${rounded}%`);
            lastLoggedProgress = rounded;
          }
        } else if (progress.status === 'done') {
          console.log(`[ML Worker] Loaded: ${progress.file}`);
        }
      });

      this.instance = await pipeline(this.task, this.model, { progress_callback: progressCb });
      const loadTime = Date.now() - startTime;

      console.log(`[ML Worker] ✓ Model loaded in ${loadTime}ms`);
      this.isLoading = false;

      return this.instance;
    } catch (error) {
      this.isLoading = false;
      this.loadError = error;
      console.error('[ML Worker] ✗ Failed to load model:', error);
      console.error('[ML Worker] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Classify a single tab
   * @param {Object} tab - Tab to classify
   * @param {Object} sessionContext - Session context
   * @returns {Promise<Object>} Classification result
   */
  static async classifyTab(tab, sessionContext = null) {
    const classifier = await this.getInstance();

    // Extract features
    const features = this.extractFeatures(tab);

    if (!features || features.length < 3) {
      return this.getDefaultClassification(tab);
    }

    try {
      // Run 3D classification in parallel
      const labels = {
        intent: ['informational', 'navigational', 'transactional'],
        status: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
        contentType: ['content', 'communication', 'search']
      };

      const [intentResult, statusResult, contentTypeResult] = await Promise.all([
        classifier(features, labels.intent, { multi_label: true }),
        classifier(features, labels.status, { multi_label: true }),
        classifier(features, labels.contentType, { multi_label: true })
      ]);

      // Convert to standardized format
      const rawScores = {
        intent: this.parseResult(intentResult, labels.intent),
        status: this.parseResult(statusResult, labels.status),
        contentType: this.parseResult(contentTypeResult, labels.contentType)
      };

      // Apply heuristic boosting
      const boostedScores = ContextFeatures
        ? ContextFeatures.applyHeuristics(rawScores, sessionContext, tab)
        : rawScores;

      return {
        classifications: boostedScores,
        metadata: {
          modelVersion: 'distilbert-v1',
          classifiedAt: Date.now(),
          sessionContext: sessionContext ? {
            totalTabs: sessionContext.totalTabs,
            coOccurringDomains: sessionContext.coOccurringDomains?.slice(0, 5) || []
          } : null
        }
      };
    } catch (error) {
      console.error('[ML Worker] Classification error:', error);
      return this.getDefaultClassification(tab);
    }
  }

  static extractFeatures(tab) {
    const parts = [];

    if (tab.title && tab.title !== 'Untitled') {
      parts.push(tab.title);
    }

    if (tab.domain && tab.domain !== 'about') {
      parts.push(tab.domain);
    }

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
    const maxChars = 512 * 4; // Token limit approximation
    return text.length > maxChars ? text.substring(0, maxChars) : text;
  }

  static parseResult(result, allLabels) {
    const scoreMap = {};
    result.labels.forEach((label, i) => {
      scoreMap[label] = result.scores[i];
    });

    const labels = allLabels;
    const scores = labels.map(label => scoreMap[label] || 0);

    const topK = labels
      .map((label, i) => ({ label, score: scores[i] }))
      .sort((a, b) => b.score - a.score)
      .filter(item => item.score > 0.3)
      .slice(0, 3);

    return { labels, scores, topK };
  }

  static getDefaultClassification(tab) {
    return {
      classifications: {
        intent: {
          labels: ['informational', 'navigational', 'transactional'],
          scores: [0.5, 0.3, 0.2],
          topK: [{ label: 'informational', score: 0.5 }]
        },
        status: {
          labels: ['to-read', 'to-do', 'reference', 'maybe', 'done'],
          scores: [0.4, 0.3, 0.2, 0.1, 0.0],
          topK: [{ label: 'to-read', score: 0.4 }]
        },
        contentType: {
          labels: ['content', 'communication', 'search'],
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
}

console.log('[ML Worker] ✓ Ready');

// Export for use in background.js
if (typeof window !== 'undefined') {
  window.MLClassifierWorker = MLClassifierWorker;
}

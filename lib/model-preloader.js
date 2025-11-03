/**
 * Model Pre-loader
 * Loads ML models from local extension files (lib/vendor/models/)
 * Models are pre-downloaded and bundled with the extension
 *
 * Models:
 * 1. Classification: distilbert-base-uncased-mnli (~320MB)
 * 2. NER: bert-base-NER (~515MB)
 * 3. Embeddings: all-MiniLM-L6-v2 (~108MB)
 */

class ModelPreloader {
  constructor() {
    this.models = {
      classification: {
        task: 'zero-shot-classification',
        model: 'classification',  // Local directory name
        size: '~320MB',
        status: 'pending',
        error: null
      },
      ner: {
        task: 'token-classification',
        model: 'ner',  // Local directory name
        size: '~515MB',
        status: 'pending',
        error: null
      },
      embeddings: {
        task: 'feature-extraction',
        model: 'embeddings',  // Local directory name
        size: '~108MB',
        status: 'pending',
        error: null
      }
    };

    this.pipeline = null;
    this.onProgressCallback = null;
  }

  /**
   * Set progress callback for UI updates
   */
  setProgressCallback(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Notify progress
   */
  notifyProgress(modelKey, status, progress = null, error = null) {
    this.models[modelKey].status = status;
    if (progress !== null) {
      this.models[modelKey].progress = progress;
    }
    if (error) {
      this.models[modelKey].error = error;
    }

    // Persist to storage for popup to read
    if (typeof browser !== 'undefined' && browser.storage) {
      browser.storage.local.set({ modelStatus: this.models }).catch(err => {
        console.error('[ModelPreloader] Failed to persist status:', err);
      });
    }

    if (this.onProgressCallback) {
      this.onProgressCallback({
        model: modelKey,
        status: status,
        progress: progress,
        error: error,
        allModels: this.models
      });
    }
  }

  /**
   * Load Transformers.js library
   */
  async loadTransformersLib() {
    if (this.pipeline) {
      return this.pipeline;
    }

    console.log('[ModelPreloader] Loading Transformers.js library...');
    try {
      const module = await import('../lib/vendor/transformers/transformers.min.js');

      // Configure environment for extension context
      if (module.env) {
        console.log('[ModelPreloader] Configuring Transformers.js environment...');

        // Use local models from extension directory
        module.env.allowLocalModels = true;
        module.env.allowRemoteModels = false; // Force local-only
        module.env.localModelPath = browser.runtime.getURL('lib/vendor/models/');
        module.env.useBrowserCache = false; // Don't need cache for local models

        // Configure backends
        module.env.backends = {
          onnx: {
            wasm: {
              numThreads: 1  // Single thread for stability in extension
            }
          }
        };

        console.log('[ModelPreloader] Environment configured:', {
          allowLocalModels: module.env.allowLocalModels,
          allowRemoteModels: module.env.allowRemoteModels,
          localModelPath: module.env.localModelPath
        });
      }

      this.pipeline = module.pipeline;
      console.log('[ModelPreloader] ✓ Transformers.js loaded');
      return this.pipeline;
    } catch (error) {
      console.error('[ModelPreloader] ✗ Failed to load Transformers.js:', error);
      throw error;
    }
  }

  /**
   * Pre-load a single model
   * Downloads and caches the model in IndexedDB
   */
  async preloadModel(modelKey) {
    const modelConfig = this.models[modelKey];
    if (!modelConfig) {
      throw new Error(`Unknown model: ${modelKey}`);
    }

    console.log(`[ModelPreloader] Pre-loading ${modelKey}: ${modelConfig.model}`);
    this.notifyProgress(modelKey, 'loading');

    try {
      // Load library if not already loaded
      const pipeline = await this.loadTransformersLib();

      // Progress callback for download
      let lastLoggedProgress = 0;
      const progressCallback = (progress) => {
        if (progress.status === 'progress' && progress.progress) {
          this.notifyProgress(modelKey, 'downloading', progress.progress);
          // Only log every 10%
          const rounded = Math.floor(progress.progress / 10) * 10;
          if (rounded > lastLoggedProgress) {
            console.log(`[ModelPreloader] ${modelKey}: ${progress.file} - ${rounded}%`);
            lastLoggedProgress = rounded;
          }
        } else if (progress.status === 'done') {
          console.log(`[ModelPreloader] ${modelKey}: ${progress.file} - complete`);
        } else if (progress.status === 'initiate') {
          console.log(`[ModelPreloader] ${modelKey}: Loading ${progress.file}`);
        }
      };

      // Create pipeline - download from HuggingFace and let Transformers.js cache
      const startTime = Date.now();

      console.log(`[ModelPreloader] Loading model: ${modelConfig.model}`);
      console.log(`[ModelPreloader] (loading from local extension files: ${modelConfig.size})`);

      const pipe = await pipeline(
        modelConfig.task,
        modelConfig.model,  // Local model directory name (e.g., 'embeddings', 'classification')
        {
          progress_callback: progressCallback
        }
      );
      const loadTime = Date.now() - startTime;

      console.log(`[ModelPreloader] ✓ ${modelKey} loaded in ${(loadTime / 1000).toFixed(1)}s`);
      this.notifyProgress(modelKey, 'ready', 100);

      return pipe;

    } catch (error) {
      console.error(`[ModelPreloader] ✗ Failed to load ${modelKey}:`, error);
      this.notifyProgress(modelKey, 'error', null, error.message);
      throw error;
    }
  }

  /**
   * Pre-load all models sequentially
   * Returns array of loaded pipelines
   */
  async preloadAllModels() {
    console.log('[ModelPreloader] Pre-loading all models...');
    const results = {};

    for (const [key, config] of Object.entries(this.models)) {
      try {
        results[key] = await this.preloadModel(key);
      } catch (error) {
        console.error(`[ModelPreloader] Skipping ${key} due to error:`, error);
        results[key] = null;
      }
    }

    return results;
  }

  /**
   * Pre-load only lightweight models (embeddings first, then classification)
   * Skips NER for now (too large)
   */
  async preloadLightweightModels() {
    console.log('[ModelPreloader] Pre-loading lightweight models only...');
    const results = {};

    // Load embeddings first (smallest: 23MB)
    try {
      results.embeddings = await this.preloadModel('embeddings');
    } catch (error) {
      console.error('[ModelPreloader] Failed to load embeddings:', error);
      results.embeddings = null;
    }

    // Load classification second (67MB)
    try {
      results.classification = await this.preloadModel('classification');
    } catch (error) {
      console.error('[ModelPreloader] Failed to load classification:', error);
      results.classification = null;
    }

    console.log('[ModelPreloader] Lightweight models pre-loaded');
    return results;
  }

  /**
   * Check which models are already cached
   */
  async checkCachedModels() {
    console.log('[ModelPreloader] Checking cached models...');
    // Transformers.js uses Cache API - check what's already downloaded
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log('[ModelPreloader] Cache names:', cacheNames);

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        console.log(`[ModelPreloader] Cache ${cacheName}:`, keys.length, 'entries');
      }
    }
  }

  /**
   * Get status of all models
   */
  getStatus() {
    return {
      models: this.models,
      hasTransformers: this.pipeline !== null
    };
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.modelPreloader = new ModelPreloader();
}

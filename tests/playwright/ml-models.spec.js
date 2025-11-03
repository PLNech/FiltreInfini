import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * ML Model Loading Tests
 *
 * These tests validate:
 * 1. UI model loading (embeddings + classification)
 * 2. Background worker initialization
 * 3. Classification functionality
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '../..');

/**
 * Helper to create browser context with extension loaded
 */
async function createExtensionContext(browser) {
  // Firefox extension loading
  // Note: Playwright supports Firefox extensions differently than Chrome
  const context = await browser.newContext();

  // TODO: Load extension - Firefox requires different approach
  // For now, we'll test the extension pages directly via file:// URLs
  // or by manually loading the extension and connecting to it

  return context;
}

test.describe('ML Model Loading - UI Context', () => {
  test('should load embeddings model successfully', async ({ page }) => {
    // Navigate to manager page (assuming extension is loaded)
    // For now, we'll test by loading the HTML file directly
    const managerPath = `file://${extensionPath}/ui/manager.html`;

    // Set up console monitoring
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text()
      });
    });

    await page.goto(managerPath);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Check if ModelPreloader is available
    const hasModelPreloader = await page.evaluate(() => {
      return typeof window.modelPreloader !== 'undefined';
    });

    if (!hasModelPreloader) {
      test.skip('ModelPreloader not available in this context');
      return;
    }

    // Test embeddings loading
    const result = await page.evaluate(async () => {
      try {
        const startTime = Date.now();
        const pipe = await window.modelPreloader.preloadModel('embeddings');
        const loadTime = Date.now() - startTime;

        // Test with sample text
        const testText = "Machine learning test";
        const embeddings = await pipe(testText, { pooling: 'mean', normalize: true });

        return {
          success: true,
          loadTime,
          embeddingDimensions: embeddings.data.length,
          hasData: embeddings.data.length > 0
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    // Assertions
    expect(result.success).toBe(true);
    expect(result.embeddingDimensions).toBeGreaterThan(0);
    expect(result.hasData).toBe(true);

    // Check console logs for expected messages
    const logsContainSuccess = consoleMessages.some(msg =>
      msg.text.includes('[ModelPreloader]') && msg.text.includes('loaded')
    );
    expect(logsContainSuccess).toBe(true);
  });

  test('should load classification model successfully', async ({ page }) => {
    const managerPath = `file://${extensionPath}/ui/manager.html`;

    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text()
      });
    });

    await page.goto(managerPath);
    await page.waitForLoadState('domcontentloaded');

    const hasModelPreloader = await page.evaluate(() => {
      return typeof window.modelPreloader !== 'undefined';
    });

    if (!hasModelPreloader) {
      test.skip('ModelPreloader not available in this context');
      return;
    }

    const result = await page.evaluate(async () => {
      try {
        const startTime = Date.now();
        const pipe = await window.modelPreloader.preloadModel('classification');
        const loadTime = Date.now() - startTime;

        // Test with sample classification
        const testText = "This is a tutorial about machine learning";
        const labels = ['educational', 'entertainment', 'news'];
        const classification = await pipe(testText, labels);

        return {
          success: true,
          loadTime,
          hasLabels: classification.labels && classification.labels.length > 0,
          hasScores: classification.scores && classification.scores.length > 0,
          topLabel: classification.labels[0],
          topScore: classification.scores[0]
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasLabels).toBe(true);
    expect(result.hasScores).toBe(true);
    expect(result.topScore).toBeGreaterThan(0);
  });

  test('should report model loading progress', async ({ page }) => {
    const managerPath = `file://${extensionPath}/ui/manager.html`;

    const progressUpdates = [];
    page.on('console', msg => {
      if (msg.text().includes('[ModelPreloader]')) {
        progressUpdates.push(msg.text());
      }
    });

    await page.goto(managerPath);
    await page.waitForLoadState('domcontentloaded');

    const hasModelPreloader = await page.evaluate(() => {
      return typeof window.modelPreloader !== 'undefined';
    });

    if (!hasModelPreloader) {
      test.skip('ModelPreloader not available in this context');
      return;
    }

    await page.evaluate(async () => {
      try {
        await window.modelPreloader.preloadModel('embeddings');
      } catch (error) {
        // Ignore errors, we're just checking progress logging
      }
    });

    // Should have some progress logs
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Should not have excessive duplicate logs (verbose logging bug)
    const hundredPercentLogs = progressUpdates.filter(log => log.includes('100%'));
    expect(hundredPercentLogs.length).toBeLessThan(10); // Should only log once or twice
  });
});

test.describe('ML Model Loading - Background Worker', () => {
  test.skip('should initialize background worker', async ({ page }) => {
    // This test requires the extension to be fully loaded as a Firefox extension
    // We need to connect to the background page/service worker

    // TODO: Figure out how to access Firefox extension background scripts in Playwright
    // Options:
    // 1. Use browser.runtime.getBackgroundPage() if available
    // 2. Use messaging to check worker status
    // 3. Check browser devtools protocol for extension debugging
  });

  test.skip('should load classification model in background worker', async ({ page }) => {
    // TODO: Test background worker model loading
    // Need to:
    // 1. Connect to background script context
    // 2. Call MLClassifierWorker.getInstance()
    // 3. Verify it loads without errors
    // 4. Check loading status in storage
  });

  test.skip('should classify a single tab via background worker', async ({ page }) => {
    // TODO: Test end-to-end classification
    // Need to:
    // 1. Send classification request message to background
    // 2. Wait for response
    // 3. Verify classification result structure
    // 4. Check that classification has scores and labels
  });
});

test.describe('ML Model Loading - Storage Integration', () => {
  test('should persist model status to storage.local', async ({ page }) => {
    const managerPath = `file://${extensionPath}/ui/manager.html`;

    await page.goto(managerPath);
    await page.waitForLoadState('domcontentloaded');

    // Check if browser.storage is available
    const hasStorage = await page.evaluate(() => {
      return typeof browser !== 'undefined' &&
             typeof browser.storage !== 'undefined' &&
             typeof browser.storage.local !== 'undefined';
    });

    if (!hasStorage) {
      test.skip('browser.storage.local not available in this context');
      return;
    }

    // Load a model and check storage
    const result = await page.evaluate(async () => {
      try {
        // Trigger model loading
        await window.modelPreloader.preloadModel('embeddings');

        // Check storage
        const storage = await browser.storage.local.get('modelStatus');

        return {
          success: true,
          hasModelStatus: !!storage.modelStatus,
          embeddingsStatus: storage.modelStatus?.embeddings?.status,
          storageKeys: Object.keys(storage)
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    expect(result.success).toBe(true);
    expect(result.hasModelStatus).toBe(true);
    expect(result.embeddingsStatus).toBe('ready');
  });
});

test.describe('ML Model Loading - Error Handling', () => {
  test('should handle missing model files gracefully', async ({ page }) => {
    const managerPath = `file://${extensionPath}/ui/manager.html`;

    await page.goto(managerPath);
    await page.waitForLoadState('domcontentloaded');

    const hasModelPreloader = await page.evaluate(() => {
      return typeof window.modelPreloader !== 'undefined';
    });

    if (!hasModelPreloader) {
      test.skip('ModelPreloader not available in this context');
      return;
    }

    const result = await page.evaluate(async () => {
      try {
        // Try to load a non-existent model
        await window.modelPreloader.preloadModel('nonexistent');
        return {
          success: true,
          shouldHaveFailed: true
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          hasErrorMessage: error.message.length > 0
        };
      }
    });

    expect(result.success).toBe(false);
    expect(result.hasErrorMessage).toBe(true);
  });

  test('should report model errors to UI', async ({ page }) => {
    const managerPath = `file://${extensionPath}/ui/manager.html`;

    const errorMessages = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errorMessages.push(msg.text());
      }
    });

    await page.goto(managerPath);
    await page.waitForLoadState('domcontentloaded');

    const hasModelPreloader = await page.evaluate(() => {
      return typeof window.modelPreloader !== 'undefined';
    });

    if (!hasModelPreloader) {
      test.skip('ModelPreloader not available in this context');
      return;
    }

    // Trigger an error
    await page.evaluate(async () => {
      try {
        await window.modelPreloader.preloadModel('nonexistent');
      } catch (error) {
        // Expected to fail
      }
    });

    // Should have logged errors
    const hasModelPreloaderError = errorMessages.some(msg =>
      msg.includes('[ModelPreloader]') || msg.includes('Failed to load')
    );

    expect(hasModelPreloaderError).toBe(true);
  });
});

test.describe('ML Model Configuration', () => {
  test('should use local model files (not CDN)', async ({ page }) => {
    const managerPath = `file://${extensionPath}/ui/manager.html`;

    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    await page.goto(managerPath);
    await page.waitForLoadState('domcontentloaded');

    const hasModelPreloader = await page.evaluate(() => {
      return typeof window.modelPreloader !== 'undefined';
    });

    if (!hasModelPreloader) {
      test.skip('ModelPreloader not available in this context');
      return;
    }

    const config = await page.evaluate(async () => {
      // Load Transformers.js and check environment
      const pipeline = await window.modelPreloader.loadTransformersLib();

      // Get a reference to the module (stored in window after import)
      const module = await import('../lib/vendor/transformers/transformers.min.js');

      return {
        allowLocalModels: module.env?.allowLocalModels,
        allowRemoteModels: module.env?.allowRemoteModels,
        localModelPath: module.env?.localModelPath,
        useBrowserCache: module.env?.useBrowserCache
      };
    });

    expect(config.allowLocalModels).toBe(true);
    expect(config.allowRemoteModels).toBe(false);
    expect(config.localModelPath).toContain('lib/vendor/models');

    // Check that logs mention local models
    const mentionsLocalModels = consoleMessages.some(msg =>
      msg.includes('local') && msg.includes('models')
    );
    expect(mentionsLocalModels).toBe(true);
  });
});

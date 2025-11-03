import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Playwright configuration for testing FiltreInfini extension
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false, // Run tests sequentially for extension testing
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for extension testing
  reporter: 'html',
  timeout: 60000, // 60s timeout for model loading tests

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Extension testing notes:
        // - Firefox extensions in Playwright require manual loading
        // - Use web-ext run in parallel and connect to existing instance
        // - Or test extension pages directly via file:// URLs
        launchOptions: {
          firefoxUserPrefs: {
            // Enable extension debugging
            'devtools.chrome.enabled': true,
            'devtools.debugger.remote-enabled': true,
            'devtools.debugger.prompt-connection': false,
            // Disable security for local file testing
            'security.fileuri.strict_origin_policy': false,
          },
        },
      },
    },
  ],

  // For now, we test extension pages directly
  // TODO: Set up proper extension loading with web-ext or Firefox profiles
});

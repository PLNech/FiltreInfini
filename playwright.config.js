import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for testing FiltreInfini extension
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // TODO: Configure extension loading
        // We'll need to set up context with extension path
      },
    },
  ],

  // TODO: Set up web server if needed for hosting test pages
});

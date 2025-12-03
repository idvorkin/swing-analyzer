import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'fs';

const PORT = process.env.E2E_PORT || '5173';
// Detect if running in container (HTTPS) or locally (HTTP)
const isContainer =
  existsSync('/.dockerenv') || process.env.container !== undefined;
const PROTOCOL = isContainer ? 'https' : 'http';
const BASE_URL = `${PROTOCOL}://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e-tests',
  timeout: 60 * 1000, // 60 seconds for tests involving video playback
  expect: {
    timeout: 10 * 1000, // 10 seconds for assertions
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // HTML report with console output
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: BASE_URL,
    // Enhanced artifact capture - full capture in dev, selective in CI
    trace: process.env.CI ? 'retain-on-failure' : 'on',
    video: process.env.CI ? 'retain-on-failure' : 'on',
    screenshot: process.env.CI ? 'only-on-failure' : 'on',
    actionTimeout: 15000,
    // Ignore HTTPS errors for self-signed certs in dev
    ignoreHTTPSErrors: isContainer,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile testing disabled until app is mobile-ready
    // {
    //   name: 'mobile',
    //   use: { ...devices['iPhone 14 Pro'] },
    // },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for server to start
    ignoreHTTPSErrors: isContainer,
  },

  // Output directory for test artifacts
  outputDir: 'test-results/',
});

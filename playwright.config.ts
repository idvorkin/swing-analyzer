import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'fs';

const PORT = process.env.E2E_PORT || '5173';

// Check if Tailscale is running (matches vite.config.ts logic)
function isTailscaleRunning(): boolean {
  try {
    const output = execSync('tailscale status --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const status = JSON.parse(output);
    return !!status.Self?.DNSName;
  } catch {
    return false;
  }
}

// Detect if running in container with Tailscale (HTTPS) - matches vite.config.ts
const isContainer = existsSync('/.dockerenv');
const hasTailscale = isTailscaleRunning();
const useHttps = isContainer && hasTailscale;
const PROTOCOL = useHttps ? 'https' : 'http';
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
  workers: process.env.CI ? 1 : 10,

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
    ignoreHTTPSErrors: useHttps,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Enables video autoplay without user interaction (for file-based video playback)
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
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
    ignoreHTTPSErrors: useHttps,
  },

  // Output directory for test artifacts
  outputDir: 'test-results/',
});

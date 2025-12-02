import { defineConfig, devices } from '@playwright/test';

// Determine if we're in a container with Tailscale (uses HTTPS)
const useHttps = process.env.USE_HTTPS === 'true' || process.env.CI !== 'true';
const protocol = useHttps ? 'https' : 'http';

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
  reporter: [
    ['html', { open: 'never' }],
    ['list'], // Also output to console
  ],

  use: {
    baseURL: `${protocol}://localhost:5173`,
    trace: 'on', // Always record traces for debugging
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    // Useful for debugging
    actionTimeout: 15000,
    // Ignore HTTPS errors for self-signed certs in dev
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: `${protocol}://localhost:5173`,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for server to start
    ignoreHTTPSErrors: true,
  },

  // Output directory for test artifacts
  outputDir: 'test-results/',
});

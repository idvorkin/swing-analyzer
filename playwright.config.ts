import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'fs';

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

// Find a running vite server in the current directory
function findRunningViteServer(): { port: number; https: boolean } | null {
  try {
    const cwd = process.cwd();
    // Use lsof to find listening ports and their PIDs, then check if the process cwd matches
    const lsofOutput = execSync('lsof -i -P -n 2>/dev/null | grep LISTEN || true', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    for (const line of lsofOutput.split('\n')) {
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const pid = parts[1];
      const portMatch = parts[8]?.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);
      if (port < 5000 || port > 6000) continue; // Only check typical vite ports

      // Check if this process is running from our directory
      try {
        const processCwd = execSync(`readlink -f /proc/${pid}/cwd 2>/dev/null`, {
          encoding: 'utf-8',
        }).trim();
        const cmdline = execSync(`cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' '`, {
          encoding: 'utf-8',
        });

        if (processCwd === cwd && cmdline.includes('vite')) {
          // Check if it's HTTPS
          const isHttps =
            execSync(
              `timeout 1 bash -c "echo | openssl s_client -connect localhost:${port} 2>/dev/null | grep -q 'CONNECTED' && echo yes" || true`,
              { encoding: 'utf-8' }
            ).trim() === 'yes';
          return { port, https: isHttps };
        }
      } catch {
        // Process might have exited
      }
    }
  } catch {
    // lsof not available or other error
  }
  return null;
}

// Detect if running in container with Tailscale (HTTPS) - matches vite.config.ts
const isContainer = existsSync('/.dockerenv');
const hasTailscale = isTailscaleRunning();
const useHttps = isContainer && hasTailscale;

// Try to find an already-running vite server for this project
const runningServer = findRunningViteServer();
const PORT = process.env.E2E_PORT || (runningServer?.port.toString() ?? '5173');
const PROTOCOL = runningServer?.https ? 'https' : useHttps ? 'https' : 'http';
const BASE_URL = `${PROTOCOL}://localhost:${PORT}`;

// Log detected server for debugging
if (runningServer) {
  console.log(`[Playwright] Using running vite server at ${BASE_URL}`);
}

export default defineConfig({
  testDir: './e2e-tests',
  timeout: 30 * 1000, // 30 seconds max per test
  expect: {
    timeout: 10 * 1000, // 10 seconds for assertions
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Reduced workers to avoid race conditions with shared IndexedDB state
  // Tests that clear IndexedDB can interfere with tests that seed data
  // Mock detector tests share state across files, so keep parallelism low
  workers: process.env.CI ? 1 : 2,

  // HTML report with console output
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: BASE_URL,
    // Capture artifacts only on failure for speed
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30000,
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

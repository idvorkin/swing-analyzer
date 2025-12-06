/**
 * Extraction Flow E2E Tests
 *
 * Tests the real extraction pipeline with a mock pose detector.
 * Unlike seeded tests, these actually run the extraction code path.
 *
 * Test Modes:
 * - Fast (frameDelayMs=0): Quick tests for CI
 * - Realistic (frameDelayMs=30): Simulates real extraction timing (~33fps)
 *
 * What's Mocked:
 * - Pose detector (returns pre-computed poses)
 *
 * What's Real:
 * - Video loading and seeking
 * - Frame extraction
 * - Pipeline processing (form detection, rep counting)
 * - Skeleton rendering
 * - UI updates
 */

import { expect, test } from '@playwright/test';
import {
  generateTestId,
  setVideoTestId,
  setupMockPoseDetector,
  useShortTestVideo,
  useIgorTestVideo,
} from './helpers';

// Tests can run in parallel - each gets unique cache via test ID
test.describe('Extraction Flow: Mock Detector + Real Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GitHub video URL and serve short local video
    await useShortTestVideo(page);
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    // Set unique test ID for cache isolation - allows parallel test execution
    await setVideoTestId(page, generateTestId());
  });

  // Retry this test as it can be flaky with parallel test runs
  test('extraction runs and counts reps with mock detector (fast)', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'retry', description: 'Flaky with parallel IndexedDB access' });
    // Fast mode: 0ms delay
    await setupMockPoseDetector(page, 'swing-sample', 0);

    // Click Sample - triggers extraction
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to start
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('Extracting');
      },
      { timeout: 10000 }
    );

    // Wait for extraction to complete - check both old (.pose-status-bar) and new (.ready-status) UI
    await page.waitForFunction(
      () => {
        // Old UI used .pose-status-bar for ready state
        const statusEl = document.querySelector('.pose-status-bar');
        if (statusEl?.textContent?.includes('ready') || statusEl?.textContent?.includes('Ready')) {
          return true;
        }
        // New UI shows .ready-status after extraction completes (no .pose-status-bar when ready)
        const readyEl = document.querySelector('.ready-status');
        if (readyEl?.textContent?.includes('Ready')) {
          return true;
        }
        // Or check that extraction progress bar is gone and rep count > 0
        const extractingEl = document.querySelector('.extraction-status');
        const repCounter = document.querySelector('#rep-counter');
        const repCount = parseInt(repCounter?.textContent || '0', 10);
        return !extractingEl && repCount > 0;
      },
      { timeout: 30000 }
    );

    // Wait a moment for UI to settle after extraction
    await page.waitForTimeout(500);

    // Check rep count
    const repCount = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });

    console.log(`Detected ${repCount} reps during extraction`);
    expect(repCount).toBeGreaterThan(0);
  });

  // Realistic timing test - validates mock detector with delays works correctly
  test('extraction with realistic timing simulates user experience', async ({
    page,
  }) => {

    // Enable console logging to see extraction progress
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Extraction]') ||
        text.includes('Mock') ||
        text.includes('reinitializ') ||
        text.includes('Pipeline')
      ) {
        console.log(`[BROWSER] ${text}`);
      }
    });

    // Fast mode with small delay to test timing behavior
    await setupMockPoseDetector(page, 'swing-sample-4reps', 5);

    // Click Sample - triggers extraction
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Track extraction progress
    const startTime = Date.now();

    // Wait for extraction to complete with session recorder debugging
    try {
      await page.waitForFunction(
        () => {
          // Check for ready status anywhere on page
          const pageText = document.body.textContent || '';
          return pageText.includes('Ready') && pageText.includes('reps detected');
        },
        { timeout: 30000 } // 1 minute timeout
      );
    } catch (e) {
      // Dump session recorder state on failure
      const sessionData = await page.evaluate(() => {
        const debug = (window as unknown as { swingDebug?: { getCurrentSession?: () => unknown } }).swingDebug;
        if (debug?.getCurrentSession) {
          const session = debug.getCurrentSession() as { stateChanges?: unknown[]; pipelineSnapshots?: unknown[] };
          return {
            stateChanges: session?.stateChanges?.slice(-20),
            lastSnapshots: session?.pipelineSnapshots?.slice(-5),
          };
        }
        return null;
      });
      console.log('SessionRecorder state on failure:', JSON.stringify(sessionData, null, 2));
      throw e;
    }

    const extractionTime = Date.now() - startTime;
    console.log(`Extraction took ${(extractionTime / 1000).toFixed(1)}s`);

    // With 5ms delay, should complete quickly but still take some time
    expect(extractionTime).toBeGreaterThan(100);
  });

  // Test that skeleton renders during extraction
  test('skeleton renders during extraction', async ({ page }) => {
    await setupMockPoseDetector(page, 'swing-sample', 10);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to start
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('Extracting');
      },
      { timeout: 10000 }
    );

    // Check canvas has content during extraction
    // BUG: Currently extraction uses a hidden video element, so skeleton
    // doesn't render to the visible canvas. This causes the "flashing" issue
    // users see because the canvas is cleared but nothing is drawn.
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('#output-canvas') as HTMLCanvasElement;
        if (!canvas) return false;

        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        // Check if any pixel has been drawn
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 3; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 0) return true; // Non-transparent pixel found
        }
        return false;
      },
      { timeout: 30000 }
    );

    console.log('Skeleton rendered during extraction');
  });

  test('playback after extraction uses cached poses', async ({ page }) => {
    await setupMockPoseDetector(page, 'swing-sample', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - check both old (.pose-status-bar) and new (.ready-status) UI
    await page.waitForFunction(
      () => {
        // Old UI used .pose-status-bar for ready state
        const statusEl = document.querySelector('.pose-status-bar');
        if (statusEl?.textContent?.includes('ready') || statusEl?.textContent?.includes('Ready')) {
          return true;
        }
        // New UI shows .ready-status after extraction completes
        const readyEl = document.querySelector('.ready-status');
        if (readyEl?.textContent?.includes('Ready')) {
          return true;
        }
        // Or check that extraction progress bar is gone and rep count > 0
        const extractingEl = document.querySelector('.extraction-status');
        const repCounter = document.querySelector('#rep-counter');
        const repCount = parseInt(repCounter?.textContent || '0', 10);
        return !extractingEl && repCount > 0;
      },
      { timeout: 30000 }
    );

    const repCountAfterExtraction = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });

    // Play video
    await page.click('#play-pause-btn');
    await page.waitForTimeout(2000);
    await page.click('#play-pause-btn'); // Pause

    // Rep count should not have doubled
    const repCountAfterPlayback = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });

    console.log(`Reps: extraction=${repCountAfterExtraction}, after playback=${repCountAfterPlayback}`);

    // Allow small difference due to video position, but should not double
    expect(repCountAfterPlayback).toBeLessThanOrEqual(repCountAfterExtraction + 1);
  });
});

/**
 * Igor 1H Swing Tests - uses the actual default sample video
 *
 * SKIPPED: These tests take 5+ minutes due to video seeking in headless Chrome.
 * Video seeking requires ~500ms per frame without GPU acceleration.
 *
 * To run manually: npx playwright test --grep "Igor 1H Swing" --headed
 */
test.describe.skip('Igor 1H Swing: Real Sample Video (slow)', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GitHub video URL and serve igor-1h-swing video
    await useIgorTestVideo(page);
    await page.goto('/');

    // Wait for test setup to be available
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    // Set unique test ID for cache isolation
    await setVideoTestId(page, generateTestId());
  });

  test('full extraction with igor-1h-swing video reproduces user experience', async ({
    page,
  }) => {
    // Igor video has 593 frames, give it 6 minutes to extract (slow in headless Chrome)
    test.setTimeout(360000);
    // Enable console logging to capture debug info
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[DEBUG]') ||
        text.includes('[Extraction]') ||
        text.includes('skeleton') ||
        text.includes('Skeleton') ||
        text.includes('Rendering')
      ) {
        console.log(`[BROWSER] ${text}`);
      }
    });

    // Use igor-1h-swing fixture (593 frames, ~20s video)
    // Note: 0ms delay but video seeking still takes ~30-60s in headless Chrome
    await setupMockPoseDetector(page, 'igor-1h-swing', 0);

    // Click Sample - triggers extraction
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to start
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('Extracting');
      },
      { timeout: 10000 }
    );

    console.log('Extraction started...');

    // Wait for extraction to complete (594 frames takes ~3-5 minutes in headless Chrome)
    try {
      await page.waitForFunction(
        () => {
          const pageText = document.body.textContent || '';
          return pageText.includes('Ready') && pageText.includes('reps detected');
        },
        { timeout: 300000 } // 5 minutes for full video extraction
      );
    } catch (e) {
      // Dump state on failure
      const sessionData = await page.evaluate(() => {
        const debug = (window as unknown as { swingDebug?: { getCurrentSession?: () => unknown } }).swingDebug;
        if (debug?.getCurrentSession) {
          const session = debug.getCurrentSession() as { stateChanges?: unknown[]; pipelineSnapshots?: unknown[] };
          return {
            stateChanges: session?.stateChanges?.slice(-20),
            lastSnapshots: session?.pipelineSnapshots?.slice(-5),
          };
        }
        return null;
      });
      console.log('SessionRecorder state on failure:', JSON.stringify(sessionData, null, 2));
      throw e;
    }

    // Check extraction completed
    const repCount = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });

    console.log(`Igor-1h-swing extraction completed: ${repCount} reps detected`);

    // Igor video should have ~20+ reps
    expect(repCount).toBeGreaterThan(15);
  });

  test('skeleton renders after extraction and during playback', async ({ page }) => {
    test.setTimeout(120000);
    let renderLogs: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[DEBUG] Rendering skeleton')) {
        renderLogs.push(text);
      }
      if (text.includes('[DEBUG]')) {
        console.log(`[BROWSER] ${text}`);
      }
    });

    await setupMockPoseDetector(page, 'igor-1h-swing', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete
    await page.waitForFunction(
      () => {
        const pageText = document.body.textContent || '';
        return pageText.includes('Ready') && pageText.includes('reps detected');
      },
      { timeout: 60000 }
    );

    console.log(`Render logs during extraction: ${renderLogs.length}`);

    // Now test playback - this is where users report skeleton not showing
    renderLogs = []; // Reset for playback test

    // Play video for 3 seconds
    await page.click('#play-pause-btn');
    await page.waitForTimeout(3000);
    await page.click('#play-pause-btn'); // Pause

    console.log(`Render logs during playback: ${renderLogs.length}`);

    // Should have skeleton renders during playback
    expect(renderLogs.length).toBeGreaterThan(0);

    // Check canvas has content
    const hasCanvasContent = await page.evaluate(() => {
      const canvas = document.querySelector('#output-canvas') as HTMLCanvasElement;
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0) return true;
      }
      return false;
    });

    expect(hasCanvasContent).toBe(true);
    console.log('Skeleton rendered successfully during playback');
  });
});

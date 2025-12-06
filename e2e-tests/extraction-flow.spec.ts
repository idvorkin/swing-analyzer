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
      { timeout: 60000 }
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
    test.slow(); // This test intentionally takes longer

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

    // Realistic mode: 30ms delay per frame (~33fps extraction)
    // Note: swing-sample has ~800 frames, so this takes ~24s
    await setupMockPoseDetector(page, 'swing-sample-4reps', 30);

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
        { timeout: 60000 } // 1 minute timeout
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

    // With 30ms delay, should take at least a few seconds
    expect(extractionTime).toBeGreaterThan(1000);
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
      { timeout: 60000 }
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

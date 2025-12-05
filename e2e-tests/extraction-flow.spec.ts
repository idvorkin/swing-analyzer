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
  clearPoseTrackDB,
  setupMockPoseDetector,
  useShortTestVideo,
} from './helpers';

// Run serially to avoid IndexedDB interference between tests
test.describe.serial('Extraction Flow: Mock Detector + Real Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GitHub video URL and serve short local video
    await useShortTestVideo(page);
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    // Clear any cached poses so extraction actually runs
    await clearPoseTrackDB(page);
  });

  test('extraction runs and counts reps with mock detector (fast)', async ({
    page,
  }) => {
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

    // Wait for extraction to complete
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('ready') ||
               statusEl?.textContent?.includes('Ready');
      },
      { timeout: 60000 }
    );

    // Check rep count
    const repCount = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });

    console.log(`Detected ${repCount} reps during extraction`);
    expect(repCount).toBeGreaterThan(0);
  });

  // KNOWN BUG: With frameDelayMs > 0, extraction triggers infinite loop
  // of "reinitializing pipeline" calls. Needs investigation.
  // The bug only manifests with mock detector delay, not in real usage.
  test.skip('extraction with realistic timing simulates user experience', async ({
    page,
  }) => {
    test.slow(); // This test intentionally takes longer

    // Enable console logging to see extraction progress
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Extraction]') ||
        text.includes('Mock') ||
        text.includes('reinitializ')
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

    // Wait for extraction to complete
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('ready') ||
               statusEl?.textContent?.includes('Ready');
      },
      { timeout: 120000 } // 2 minutes for realistic extraction
    );

    const extractionTime = Date.now() - startTime;
    console.log(`Extraction took ${(extractionTime / 1000).toFixed(1)}s`);

    // With 30ms delay, should take at least a few seconds
    expect(extractionTime).toBeGreaterThan(1000);
  });

  // KNOWN ISSUE: Skeleton does not render during extraction
  // This test documents the expected behavior once the bug is fixed
  // Related: flashing issue when clicking Sample
  test.skip('skeleton renders during extraction', async ({ page }) => {
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

    // Wait for extraction to complete
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('ready') ||
               statusEl?.textContent?.includes('Ready');
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

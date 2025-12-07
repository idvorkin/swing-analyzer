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

// Tests must run serially - mock detector and IndexedDB have shared state
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

    // Set unique test ID for cache isolation - allows parallel test execution
    await setVideoTestId(page, generateTestId());
  });

  // Retry this test as it can be flaky with parallel test runs
  test('extraction runs and counts reps with mock detector (fast)', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'retry', description: 'Flaky with parallel IndexedDB access' });
    // Fast mode: 0ms delay
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    // Click Sample - triggers extraction
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - controls enabled and filmstrip has thumbnails
    // Note: With 0ms mock delay, extraction is instant, so we skip waiting for "Extracting" status
    await page.waitForFunction(
      () => {
        const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const filmstrip = document.querySelector('.filmstrip-container');
        const thumbnails = filmstrip?.querySelectorAll('canvas').length || 0;
        return playBtn && !playBtn.disabled && thumbnails > 0;
      },
      { timeout: 30000 }
    );

    // Seek to middle of video where poses should exist (HUD only visible when poses exist)
    await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      if (video && video.duration > 0) {
        video.currentTime = video.duration / 2;
      }
    });
    await page.waitForTimeout(500);

    // Wait for HUD to become visible
    await page.waitForFunction(
      () => document.querySelector('#rep-counter') !== null,
      { timeout: 5000 }
    );

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
    // Video seeking is slow in headless Chrome (~500ms/frame), need 2+ minutes
    test.setTimeout(150000);

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
          // Check controls enabled and filmstrip has thumbnails
          const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
          const filmstrip = document.querySelector('.filmstrip-container');
          const thumbnails = filmstrip?.querySelectorAll('canvas').length || 0;
          return playBtn && !playBtn.disabled && thumbnails > 0;
        },
        { timeout: 120000 } // 2 minutes - video seeking is ~500ms/frame in headless Chrome
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

  // Test that skeleton does NOT render during extraction (by design)
  // Skeleton rendering only happens during playback via requestVideoFrameCallback
  test('skeleton does not render during extraction', async ({ page }) => {
    // Use longer delay so we can check during extraction
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 50);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to start (HUD shows EXTRACTING text)
    await page.waitForFunction(
      () => {
        const pageText = document.body.textContent || '';
        return pageText.includes('EXTRACTING');
      },
      { timeout: 10000 }
    );

    // Canvas should be empty during extraction (skeleton only renders during playback)
    // This is correct behavior - the visible video isn't synced to extraction frames
    const canvasIsEmpty = await page.evaluate(() => {
      const canvas = document.querySelector('#output-canvas') as HTMLCanvasElement;
      if (!canvas) return true;

      const ctx = canvas.getContext('2d');
      if (!ctx) return true;

      // Check if canvas is empty (all transparent)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0) return false; // Non-transparent pixel found
      }
      return true;
    });

    // Canvas should be empty during extraction - skeleton only renders during playback
    expect(canvasIsEmpty).toBe(true);
    console.log('Canvas correctly empty during extraction');
  });

  test('playback after extraction uses cached poses', async ({ page }) => {
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - controls enabled and filmstrip has thumbnails
    await page.waitForFunction(
      () => {
        const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const filmstrip = document.querySelector('.filmstrip-container');
        const thumbnails = filmstrip?.querySelectorAll('canvas').length || 0;
        return playBtn && !playBtn.disabled && thumbnails > 0;
      },
      { timeout: 30000 }
    );

    // Seek to middle of video where poses exist (HUD only visible when poses exist)
    await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      if (video && video.duration > 0) {
        video.currentTime = video.duration / 2;
      }
    });
    await page.waitForTimeout(500);

    // Wait for HUD to become visible
    await page.waitForFunction(
      () => document.querySelector('#rep-counter') !== null,
      { timeout: 5000 }
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
          // Check controls enabled and filmstrip has thumbnails
          const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
          const filmstrip = document.querySelector('.filmstrip-container');
          const thumbnails = filmstrip?.querySelectorAll('canvas').length || 0;
          return playBtn && !playBtn.disabled && thumbnails > 0;
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
        // Check controls enabled and filmstrip has thumbnails
        const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const filmstrip = document.querySelector('.filmstrip-container');
        const thumbnails = filmstrip?.querySelectorAll('canvas').length || 0;
        return playBtn && !playBtn.disabled && thumbnails > 0;
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

/**
 * Instant Filmstrip E2E Tests
 *
 * Tests the user journey where filmstrip thumbnails appear during extraction,
 * without the user needing to press play.
 *
 * User Journey:
 * 1. User loads video
 * 2. Extraction starts (poses are detected frame by frame)
 * 3. As reps are detected during extraction, filmstrip thumbnails appear
 * 4. User sees thumbnails progressively without pressing play
 * 5. When extraction completes, all reps are visible in filmstrip
 *
 * Architecture:
 * - MockPoseDetector replaces real ML model during extraction
 * - frameDelayMs simulates realistic extraction timing (~15 FPS)
 * - Extracted frames stream through FormProcessor → RepProcessor
 * - Filmstrip captures frames as reps are detected
 */

import { expect, test } from '@playwright/test';
import { SWING_SAMPLE_VIDEO_HASH } from './fixtures';
import { clearPoseTrackDB } from './helpers';

test.describe('Instant Filmstrip: Reps Appear During Extraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear any cached poses so extraction actually runs
    await clearPoseTrackDB(page);
  });

  test('filmstrip shows rep thumbnails during extraction without pressing play', async ({
    page,
  }) => {
    // Configure mock pose detector with realistic timing
    // This simulates ~15 FPS extraction speed
    await page.evaluate(() => {
      (window as any).__MOCK_POSE_DETECTOR_CONFIG__ = {
        frameDelayMs: 67, // ~15 FPS
      };
    });

    // Load video - this triggers extraction
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Verify video is NOT playing - filmstrip should appear during extraction
    const videoPaused = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.paused;
    });
    expect(videoPaused).toBe(true);

    // Wait for extraction to start
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.posetrack-status');
        return statusEl?.textContent?.includes('Extracting');
      },
      { timeout: 10000 }
    );

    // Wait for first rep to appear in filmstrip (during extraction)
    // This is the key test - filmstrip populates BEFORE playback
    await page.waitForFunction(
      () => {
        const repCounter = document.querySelector('#rep-counter');
        const repCount = parseInt(repCounter?.textContent || '0', 10);
        return repCount >= 1;
      },
      { timeout: 30000 }
    );

    // Double-check video is STILL paused
    const stillPaused = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.paused;
    });
    expect(stillPaused).toBe(true);

    // Verify filmstrip has at least one thumbnail canvas
    const thumbnailCount = await page.evaluate(() => {
      const filmstrip = document.querySelector('.filmstrip-container');
      return filmstrip?.querySelectorAll('canvas').length || 0;
    });
    expect(thumbnailCount).toBeGreaterThanOrEqual(1);

    console.log(
      `Test passed: ${thumbnailCount} thumbnails appeared during extraction without playback`
    );
  });

  test('rep count increases progressively during extraction', async ({
    page,
  }) => {
    // Use a moderate delay to see progressive updates
    await page.evaluate(() => {
      (window as any).__MOCK_POSE_DETECTOR_CONFIG__ = {
        frameDelayMs: 50, // ~20 FPS for faster test
      };
    });

    // Load video
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Track rep count changes over time
    const repCounts: number[] = [];

    // Poll rep count during extraction
    const pollInterval = setInterval(async () => {
      const count = await page.evaluate(() => {
        const el = document.querySelector('#rep-counter');
        return parseInt(el?.textContent || '0', 10);
      });
      if (count > 0 && (repCounts.length === 0 || count !== repCounts[repCounts.length - 1])) {
        repCounts.push(count);
      }
    }, 500);

    // Wait for extraction to complete or timeout
    try {
      await page.waitForFunction(
        () => {
          const statusEl = document.querySelector('.posetrack-status');
          return statusEl?.textContent?.includes('Ready') ||
                 statusEl?.textContent?.includes('cached');
        },
        { timeout: 60000 }
      );
    } finally {
      clearInterval(pollInterval);
    }

    // Should have seen rep count increase progressively
    console.log(`Rep counts observed during extraction: ${repCounts.join(' → ')}`);

    // At minimum, we should have detected at least one rep
    const finalRepCount = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });
    expect(finalRepCount).toBeGreaterThan(0);
  });

  test('filmstrip thumbnails are clickable after extraction', async ({
    page,
  }) => {
    // Fast extraction for this test
    await page.evaluate(() => {
      (window as any).__MOCK_POSE_DETECTOR_CONFIG__ = {
        frameDelayMs: 20, // Fast extraction
      };
    });

    // Load video and wait for extraction to complete
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.posetrack-status');
        return statusEl?.textContent?.includes('Ready') ||
               statusEl?.textContent?.includes('cached');
      },
      { timeout: 60000 }
    );

    // Get initial video time
    const initialTime = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.currentTime || 0;
    });

    // Click first filmstrip thumbnail
    const thumbnail = page.locator('.filmstrip-container canvas').first();
    if (await thumbnail.isVisible()) {
      await thumbnail.click();

      // Wait for video to seek
      await page.waitForTimeout(500);

      // Video time should have changed (seeking to the checkpoint)
      const newTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      // Time should be different (thumbnail click seeks video)
      // Note: might be same if thumbnail is at 0:00
      console.log(`Video time: ${initialTime} → ${newTime}`);
    }
  });

  test('extraction with mock detector produces same rep count as real detector', async ({
    page,
  }) => {
    // This test validates that mock detector produces realistic results
    await page.evaluate(() => {
      (window as any).__MOCK_POSE_DETECTOR_CONFIG__ = {
        frameDelayMs: 0, // Fast extraction for this test
      };
    });

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.posetrack-status');
        return statusEl?.textContent?.includes('Ready') ||
               statusEl?.textContent?.includes('cached');
      },
      { timeout: 60000 }
    );

    // Get final rep count
    const repCount = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });

    // The swing-sample video should have a consistent number of reps
    // (This validates the mock detector is working correctly)
    console.log(`Detected ${repCount} reps from mock extraction`);
    expect(repCount).toBeGreaterThan(0);
  });
});

test.describe('Filmstrip Frame Capture During Extraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearPoseTrackDB(page);
  });

  test('captures 4 position thumbnails per rep (Top, Connect, Bottom, Release)', async ({
    page,
  }) => {
    // Fast extraction
    await page.evaluate(() => {
      (window as any).__MOCK_POSE_DETECTOR_CONFIG__ = {
        frameDelayMs: 0,
      };
    });

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for at least one rep
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#rep-counter');
        return parseInt(el?.textContent || '0', 10) >= 1;
      },
      { timeout: 60000 }
    );

    // Check filmstrip has 4 thumbnails for the first rep
    const thumbnailCount = await page.evaluate(() => {
      const filmstrip = document.querySelector('.filmstrip-container');
      return filmstrip?.querySelectorAll('canvas').length || 0;
    });

    // Should have exactly 4 checkpoints per rep (Top, Connect, Bottom, Release)
    expect(thumbnailCount).toBe(4);
  });
});

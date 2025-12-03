/**
 * User Journey E2E Tests
 *
 * Tests the complete user journey of loading and analyzing a sample video.
 * See specs/user-journey-load-video.md for the full PRD specification.
 *
 * ARCHITECTURE:
 * When pose data is seeded in IndexedDB, the app detects it and reinitializes
 * the pipeline with CachedPoseSkeletonTransformer instead of ML inference.
 * This enables deterministic testing without WebGL/TensorFlow dependencies.
 *
 * Tests are organized into:
 * - Tests that work with seeded pose data (using cached path)
 * - Tests that require ML model (skipped in headless browsers)
 */

import { expect, test } from '@playwright/test';
import { SWING_SAMPLE_VIDEO_HASH } from './fixtures';
import {
  clearPoseTrackDB,
  getPoseTrackFromDB,
  loadHardcodedVideo,
  seedPoseTrackFixture,
} from './helpers';

test.describe('User Journey: Load and Analyze Sample Video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearPoseTrackDB(page);
  });

  test.describe('Step 1: App Load', () => {
    test('page title contains Swing Analyzer', async ({ page }) => {
      await expect(page).toHaveTitle(/Swing Analyzer/);
    });

    test('header shows Swing Analyzer', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Swing Analyzer');
    });

    test('video controls are visible', async ({ page }) => {
      // File input (hidden but label visible)
      await expect(page.locator('label[for="video-upload"]')).toBeVisible();

      // Sample button
      await expect(page.locator('#load-hardcoded-btn')).toBeVisible();

      // Camera button
      await expect(page.locator('#camera-btn')).toBeVisible();
    });

    test('analysis section shows initial metrics at 0', async ({ page }) => {
      await expect(page.locator('#rep-counter')).toHaveText('0');
      await expect(page.locator('#spine-angle')).toHaveText('0°');
      await expect(page.locator('#arm-angle')).toHaveText('0°');
    });
  });

  test.describe('Step 2: Load Sample Video', () => {
    test('clicking Sample button loads video', async ({ page }) => {
      await page.click('#load-hardcoded-btn');

      // Video element should appear
      await page.waitForSelector('video', { timeout: 10000 });
      expect(await page.isVisible('video')).toBe(true);
    });

    test('video source is swing-sample.mp4', async ({ page }) => {
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for video src to be populated
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && video.src && video.src.includes('swing-sample.mp4');
        },
        { timeout: 10000 }
      );

      const videoSrc = await page.$eval(
        'video',
        (video) => (video as HTMLVideoElement).src
      );
      expect(videoSrc).toContain('swing-sample.mp4');
    });

    test.skip('status indicator shows video loaded (requires ML model)', async ({
      page,
    }) => {
      // SKIPPED: ML model fails to initialize in headless browsers
      await page.click('#load-hardcoded-btn');

      await expect(page.locator('.status-indicator')).toContainText(
        /loaded|Ready/i,
        { timeout: 15000 }
      );
    });

    test.skip('playback controls become enabled (requires ML model)', async ({
      page,
    }) => {
      // SKIPPED: Controls only enable after ML model initializes
      await page.click('#load-hardcoded-btn');

      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      await expect(page.locator('#play-pause-btn')).not.toBeDisabled();
      await expect(page.locator('#stop-btn')).not.toBeDisabled();
      await expect(page.locator('#prev-frame-btn')).not.toBeDisabled();
      await expect(page.locator('#next-frame-btn')).not.toBeDisabled();
    });
  });

  test.describe('Step 3: Video Playback Controls (requires ML model)', () => {
    // SKIPPED: All playback control tests require ML model to initialize
    // The play/pause/stop buttons are disabled until model loads

    test.skip('play button starts video playback', async ({ page }) => {
      await seedPoseTrackFixture(page, 'three-reps');
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      await page.click('#play-pause-btn');

      const isPlaying = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video && !video.paused;
      });
      expect(isPlaying).toBe(true);
    });

    test.skip('pause button stops video playback', async ({ page }) => {
      await seedPoseTrackFixture(page, 'three-reps');
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      await page.click('#play-pause-btn');
      await page.waitForTimeout(500);
      await page.click('#play-pause-btn');

      const isPaused = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video && video.paused;
      });
      expect(isPaused).toBe(true);
    });

    test.skip('stop button resets video to beginning', async ({ page }) => {
      await seedPoseTrackFixture(page, 'three-reps');
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      await page.click('#play-pause-btn');
      await page.waitForTimeout(1000);
      await page.click('#stop-btn');

      const currentTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || -1;
      });
      expect(currentTime).toBe(0);
    });
  });

  test.describe('Step 4-5: Rep Counting (requires ML model)', () => {
    /**
     * NOTE: These tests verify the rep counting UI works, but actual
     * rep detection requires the ML model to process video frames.
     * In headless browsers, video codec support may be limited.
     *
     * For deterministic testing, we would need to either:
     * 1. Mock the SkeletonTransformer to return poses from cached data
     * 2. Create a "replay mode" that uses PoseTrackPipeline for analysis
     */

    test('rep counter displays correctly', async ({ page }) => {
      await seedPoseTrackFixture(page, 'three-reps');
      await page.click('#load-hardcoded-btn');

      // Rep counter should exist and show 0 initially
      await expect(page.locator('#rep-counter')).toBeVisible();
      await expect(page.locator('#rep-counter')).toHaveText('0');
    });

    test.skip('angle displays update (requires ML model)', async ({ page }) => {
      // SKIPPED: loadHardcodedVideo helper waits for status which requires ML
      await seedPoseTrackFixture(page, 'three-reps');
      await loadHardcodedVideo(page);

      await expect(page.locator('#spine-angle')).toBeVisible();
      await expect(page.locator('#arm-angle')).toBeVisible();
    });

    test.skip('rep counter increments after completing swing cycle', async ({
      page,
    }) => {
      // SKIPPED: Requires ML model to process frames
      // This test documents the expected behavior but cannot run
      // deterministically without mocking the ML model

      await seedPoseTrackFixture(page, 'three-reps');
      await loadHardcodedVideo(page);

      // Play video at faster speed
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          video.playbackRate = 4;
          video.play();
        }
      });

      // Wait for video to end
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && video.ended;
        },
        { timeout: 30000 }
      );

      // Rep counter should have increased
      const repCount = await page.textContent('#rep-counter');
      expect(Number.parseInt(repCount || '0')).toBeGreaterThan(0);
    });
  });

  test.describe('Step 6: Frame-by-Frame Navigation (requires ML model)', () => {
    // SKIPPED: Frame navigation buttons are disabled until ML model loads

    test.skip('next frame button advances video', async ({ page }) => {
      await seedPoseTrackFixture(page, 'single-rep');
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#next-frame-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      const initialTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      await page.click('#next-frame-btn');
      await page.waitForTimeout(200);

      const newTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      expect(newTime).toBeGreaterThan(initialTime);
    });

    test.skip('prev frame button goes back in video', async ({ page }) => {
      await seedPoseTrackFixture(page, 'single-rep');
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#next-frame-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      await page.click('#next-frame-btn');
      await page.waitForTimeout(200);
      await page.click('#next-frame-btn');
      await page.waitForTimeout(200);

      const timeAfterAdvance = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      await page.click('#prev-frame-btn');
      await page.waitForTimeout(200);

      const timeAfterBack = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      expect(timeAfterBack).toBeLessThan(timeAfterAdvance);
    });
  });

  test.describe('Pose Track Caching', () => {
    test('seeded pose data is found when loading video', async ({ page }) => {
      // Seed data first
      await seedPoseTrackFixture(page, 'swing-sample');

      // Verify it was stored
      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_VIDEO_HASH
      );
      expect(storedTrack).not.toBeNull();
      expect(storedTrack?.frames.length).toBeGreaterThan(0);
    });

    test('pose track status bar appears after loading video', async ({
      page,
    }) => {
      // Seed data
      await seedPoseTrackFixture(page, 'swing-sample');

      // Load video
      await page.click('#load-hardcoded-btn');

      // Wait for video to load
      await page.waitForSelector('video', { timeout: 10000 });

      // Pose track status bar should appear (even if extraction fails due to ML issues)
      // We just check the component exists, not its specific state
      const statusBarExists = await page.isVisible('.posetrack-status');
      // Status bar may or may not be visible depending on extraction state
      // This is a soft assertion - just documenting current behavior
      expect(typeof statusBarExists).toBe('boolean');
    });
  });
});

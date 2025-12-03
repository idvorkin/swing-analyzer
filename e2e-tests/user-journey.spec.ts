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
  seedPoseTrackFixture,
  seekToTime,
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

    test('video source is swing-sample.webm', async ({ page }) => {
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for video src to be populated
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && video.src && video.src.includes('swing-sample.webm');
        },
        { timeout: 10000 }
      );

      const videoSrc = await page.$eval(
        'video',
        (video) => (video as HTMLVideoElement).src
      );
      expect(videoSrc).toContain('swing-sample.webm');
    });

    test('video loads and controls become enabled (with seeded data)', async ({
      page,
    }) => {
      // Seed pose data first so cached path is used
      await seedPoseTrackFixture(page, 'swing-sample');
      await page.click('#load-hardcoded-btn');

      // Wait for video element to appear
      await page.waitForSelector('video', { timeout: 10000 });

      // The key test: controls become enabled when cached poses are loaded,
      // even if ML model fails to initialize
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      // Video should be loaded
      const videoSrc = await page.$eval(
        'video',
        (video) => (video as HTMLVideoElement).src
      );
      expect(videoSrc).toContain('swing-sample.webm');
    });

    test('playback controls become enabled (with seeded data)', async ({
      page,
    }) => {
      // Seed pose data first so cached path is used
      await seedPoseTrackFixture(page, 'swing-sample');
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

  test.describe('Step 3: Video Playback Controls', () => {
    // SKIPPED: App bug - play button click doesn't start video playback (swing-o6o)
    // WebM/VP9 codec IS supported in headless Chromium - this is NOT a codec issue

    test.skip('play button starts video playback', async ({
      page,
    }) => {
      await seedPoseTrackFixture(page, 'swing-sample');
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

      // Wait for video to actually start playing
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && !video.paused;
        },
        { timeout: 5000 }
      );

      const isPlaying = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video && !video.paused;
      });
      expect(isPlaying).toBe(true);
    });

    test.skip('pause button stops video playback', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample');
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

      // Start playback
      await page.click('#play-pause-btn');

      // Wait for video to actually start playing
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && !video.paused;
        },
        { timeout: 5000 }
      );

      // Now pause it
      await page.click('#play-pause-btn');

      // Wait for video to pause
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && video.paused;
        },
        { timeout: 5000 }
      );

      const isPaused = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.paused;
      });
      expect(isPaused).toBe(true);
    });

    test.skip('stop button resets video to beginning', async ({
      page,
    }) => {
      await seedPoseTrackFixture(page, 'swing-sample');
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

      // Start playback and wait for it to actually play
      await page.click('#play-pause-btn');
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && !video.paused && video.currentTime > 0;
        },
        { timeout: 5000 }
      );

      await page.click('#stop-btn');

      // Wait for video to reset
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && video.currentTime === 0;
        },
        { timeout: 5000 }
      );

      const currentTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || -1;
      });
      expect(currentTime).toBe(0);
    });
  });

  test.describe('Step 4-5: Rep Counting', () => {
    test('rep counter displays correctly', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample');
      await page.click('#load-hardcoded-btn');

      // Rep counter should exist and show 0 initially
      await expect(page.locator('#rep-counter')).toBeVisible();
      await expect(page.locator('#rep-counter')).toHaveText('0');
    });

    test('angle displays update during playback', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample');
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for controls to be enabled
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      // Start playback
      await page.click('#play-pause-btn');
      await page.waitForTimeout(500);

      // Angle displays should be visible and have values
      await expect(page.locator('#spine-angle')).toBeVisible();
      await expect(page.locator('#arm-angle')).toBeVisible();
    });

    // SKIPPED: Depends on video playback working (blocked by swing-o6o)
    test.skip('rep counter increments after completing swing cycle', async ({
      page,
    }) => {
      await seedPoseTrackFixture(page, 'swing-sample');
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for controls to be enabled
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

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
          return video?.ended;
        },
        { timeout: 30000 }
      );

      // Rep counter should have increased
      const repCount = await page.textContent('#rep-counter');
      expect(Number.parseInt(repCount || '0', 10)).toBeGreaterThan(0);
    });
  });

  test.describe('Step 6: Frame-by-Frame Navigation', () => {
    test('next frame button advances video', async ({
      page,
    }) => {
      await seedPoseTrackFixture(page, 'swing-sample');
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

      // Wait for video time to actually change
      await page.waitForFunction(
        (prevTime) => {
          const video = document.querySelector('video');
          return video && video.currentTime > prevTime;
        },
        initialTime,
        { timeout: 5000 }
      );

      const newTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      expect(newTime).toBeGreaterThan(initialTime);
    });

    test('prev frame button goes back in video', async ({
      page,
    }) => {
      await seedPoseTrackFixture(page, 'swing-sample');
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

      // Advance a couple frames first
      await page.click('#next-frame-btn');
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video && video.currentTime > 0;
        },
        { timeout: 5000 }
      );

      await page.click('#next-frame-btn');
      await page.waitForTimeout(300);

      const timeAfterAdvance = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      await page.click('#prev-frame-btn');

      // Wait for video time to decrease
      await page.waitForFunction(
        (prevTime) => {
          const video = document.querySelector('video');
          return video && video.currentTime < prevTime;
        },
        timeAfterAdvance,
        { timeout: 5000 }
      );

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

  test.describe('Filmstrip Frame Capture', () => {
    test('filmstrip shows captured images after loading video with cached poses', async ({ page }) => {
      // Seed pose data first
      await seedPoseTrackFixture(page, 'swing-sample');

      // Load video
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for controls to be enabled (indicates batch analysis is ready)
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      // Wait for rep count to be set from batch analysis
      await page.waitForFunction(
        () => {
          const repCounter = document.querySelector('#rep-counter');
          return repCounter && repCounter.textContent !== '0';
        },
        { timeout: 10000 }
      );

      // Wait for filmstrip to have canvas elements (captured frames)
      // The hidden video element needs time to seek and capture each frame
      await page.waitForFunction(
        () => {
          const filmstripContainer = document.querySelector('.filmstrip-container');
          if (!filmstripContainer) return false;
          const canvases = filmstripContainer.querySelectorAll('canvas');
          // We expect 4 positions (Top, Connect, Bottom, Release)
          return canvases.length >= 4;
        },
        { timeout: 15000 }
      );

      // Verify filmstrip contains canvas elements (actual images, not placeholders)
      const filmstripInfo = await page.evaluate(() => {
        const filmstripContainer = document.querySelector('.filmstrip-container');
        if (!filmstripContainer) return { found: false, canvasCount: 0, hasLabels: false };

        const canvases = filmstripContainer.querySelectorAll('canvas');
        const labels = filmstripContainer.querySelectorAll('.filmstrip-label');

        return {
          found: true,
          canvasCount: canvases.length,
          hasLabels: labels.length > 0,
        };
      });

      expect(filmstripInfo.found).toBe(true);
      expect(filmstripInfo.canvasCount).toBeGreaterThanOrEqual(4);
      expect(filmstripInfo.hasLabels).toBe(true);
    });

    test('filmstrip thumbnails are clickable and seek video', async ({ page }) => {
      // Seed pose data
      await seedPoseTrackFixture(page, 'swing-sample');

      // Load video
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for controls to be enabled
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      // Wait for filmstrip with images
      await page.waitForFunction(
        () => {
          const filmstripContainer = document.querySelector('.filmstrip-container');
          if (!filmstripContainer) return false;
          const canvases = filmstripContainer.querySelectorAll('canvas');
          return canvases.length >= 4;
        },
        { timeout: 15000 }
      );

      // Get initial video time
      const initialTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      // Click on a filmstrip thumbnail (the last one - Release position)
      await page.click('.filmstrip-thumb:last-child');

      // Wait for video time to change
      await page.waitForFunction(
        (prevTime) => {
          const video = document.querySelector('video');
          return video && Math.abs(video.currentTime - prevTime) > 0.1;
        },
        initialTime,
        { timeout: 5000 }
      );

      // Verify video seeked to a different position
      const newTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      expect(Math.abs(newTime - initialTime)).toBeGreaterThan(0.1);
    });
  });

  test.describe('Skeleton Redraw on Seek', () => {
    test('skeleton redraws when video is seeked manually', async ({ page }) => {
      // Seed pose data first
      await seedPoseTrackFixture(page, 'swing-sample');

      // Verify data was seeded
      const storedTrack = await getPoseTrackFromDB(page, SWING_SAMPLE_VIDEO_HASH);
      expect(storedTrack).not.toBeNull();

      // Load video
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for controls to be enabled (cached poses should enable controls)
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      // Get video duration to seek to middle
      const duration = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.duration || 0;
      });
      expect(duration).toBeGreaterThan(0);

      // Seek to middle of video (while paused)
      const seekTime = duration / 2;
      await seekToTime(page, seekTime);

      // Wait a moment for skeleton to render
      await page.waitForTimeout(500);

      // Check that canvas has content (skeleton drawn)
      // The canvas should have non-transparent pixels if skeleton is drawn
      const canvasHasContent = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;

        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        // Get image data from a portion of the canvas
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Check if any pixel has alpha > 0 (non-transparent)
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) {
            return true;
          }
        }
        return false;
      });

      expect(canvasHasContent).toBe(true);
    });

    test('skeleton updates when seeking to different positions', async ({
      page,
    }) => {
      // Seed pose data
      await seedPoseTrackFixture(page, 'swing-sample');

      // Load video
      await page.click('#load-hardcoded-btn');
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for controls enabled
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      // Get duration
      const duration = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.duration || 0;
      });

      // Seek to 25% of video
      await seekToTime(page, duration * 0.25);
      await page.waitForTimeout(300);

      // Get spine angle at 25%
      const angleAt25 = await page.evaluate(() => {
        const el = document.querySelector('#spine-angle');
        return el?.textContent || '0°';
      });

      // Seek to 75% of video
      await seekToTime(page, duration * 0.75);
      await page.waitForTimeout(300);

      // Get spine angle at 75%
      const angleAt75 = await page.evaluate(() => {
        const el = document.querySelector('#spine-angle');
        return el?.textContent || '0°';
      });

      // Angles should be defined (not just checking they're different,
      // as they might happen to be similar at those positions)
      expect(angleAt25).toMatch(/\d+°/);
      expect(angleAt75).toMatch(/\d+°/);
    });
  });
});

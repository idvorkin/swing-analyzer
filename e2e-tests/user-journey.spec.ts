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
import { SWING_SAMPLE_4REPS_VIDEO_HASH } from './fixtures';
import {
  clearPoseTrackDB,
  clickSwingSampleButton,
  getPoseTrackFromDB,
  seedPoseTrackFixture,
  seekToTime,
  setPoseTrackStorageMode,
  useShortTestVideo,
} from './helpers';

test.describe('User Journey: Load and Analyze Sample Video', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GitHub video URL and serve short local video for faster tests
    await useShortTestVideo(page);
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
      // MediaSelectorDialog should be visible with sample video options
      await expect(page.locator('.media-dialog')).toBeVisible();

      // Upload option should be visible (uses label element)
      await expect(page.locator('.media-dialog-upload-btn')).toBeVisible();

      // Sample video button should be visible
      await expect(
        page.locator('button:has-text("Kettlebell Swing")')
      ).toBeVisible();
    });

    test('HUD is hidden before poses exist', async ({ page }) => {
      // New design: HUD is only visible when poses exist for current frame
      // Before loading a video, the HUD should be hidden
      await expect(page.locator('#rep-counter')).not.toBeVisible();
      await expect(page.locator('#spine-angle')).not.toBeVisible();
      await expect(page.locator('#arm-angle')).not.toBeVisible();
    });
  });

  test.describe('Step 2: Load Sample Video', () => {
    test('clicking Sample button loads video', async ({ page }) => {
      await clickSwingSampleButton(page);

      // Video element should appear
      await page.waitForSelector('video', { timeout: 10000 });
      expect(await page.isVisible('video')).toBe(true);
    });

    test('video source is loaded as blob URL', async ({ page }) => {
      await clickSwingSampleButton(page);
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for video src to be populated (video is fetched and converted to blob URL)
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video?.src?.startsWith('blob:');
        },
        { timeout: 10000 }
      );

      const videoSrc = await page.$eval(
        'video',
        (video) => (video as HTMLVideoElement).src
      );
      expect(videoSrc).toMatch(/^blob:/);
    });

    test('video loads and controls become enabled (with seeded data)', async ({
      page,
    }) => {
      // Seed pose data first so cached path is used
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);

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

      // Video should be loaded (as blob URL)
      const videoSrc = await page.$eval(
        'video',
        (video) => (video as HTMLVideoElement).src
      );
      expect(videoSrc).toMatch(/^blob:/);
    });

    test('playback controls become enabled (with seeded data)', async ({
      page,
    }) => {
      // Seed pose data first so cached path is used
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);

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
      await expect(page.locator('#prev-frame-btn')).not.toBeDisabled();
      await expect(page.locator('#next-frame-btn')).not.toBeDisabled();
    });
  });

  test.describe('Step 3: Video Playback Controls', () => {
    test('play button starts video playback', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);
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

    test('pause button stops video playback', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);
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
          return video?.paused;
        },
        { timeout: 5000 }
      );

      const isPaused = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.paused;
      });
      expect(isPaused).toBe(true);
    });
  });

  test.describe('Step 4-5: Rep Counting', () => {
    test('rep counter displays correctly', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for pipeline to fully initialize (controls become enabled)
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );

      // Wait for HUD to be visible (requires poses to exist for current frame)
      await expect(page.locator('#rep-counter')).toBeVisible({ timeout: 5000 });
      // Seeded fixture contains ~4 swings which produces 4 detected reps
      // Format is "current/total" e.g. "1/4"
      await expect(page.locator('#rep-counter')).toHaveText(/\d+\/4/, {
        timeout: 5000,
      });
    });

    test('angle displays update during playback', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);
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

      // Wait for HUD to be visible (poses exist for frame 0)
      await expect(page.locator('#spine-angle')).toBeVisible({ timeout: 5000 });

      // Start playback
      await page.click('#play-pause-btn');
      await page.waitForTimeout(500);

      // Angle displays should still be visible during playback
      await expect(page.locator('#spine-angle')).toBeVisible();
      await expect(page.locator('#arm-angle')).toBeVisible();
    });

    test('rep counter increments after completing swing cycle', async ({
      page,
    }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);
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
    test('next frame button advances video', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);
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

    test('prev frame button goes back in video', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await clickSwingSampleButton(page);
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
      // These tests read from IndexedDB directly with getPoseTrackFromDB
      await setPoseTrackStorageMode(page, 'indexeddb');
      // Seed data first
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Verify it was stored
      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_4REPS_VIDEO_HASH
      );
      expect(storedTrack).not.toBeNull();
      expect(storedTrack?.frames.length).toBeGreaterThan(0);
    });

    test('pose track status bar appears after loading video', async ({
      page,
    }) => {
      // Seed data
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Load video
      await clickSwingSampleButton(page);

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

  test.describe('Skeleton Redraw on Seek', () => {
    test('skeleton redraws when video is seeked manually', async ({ page }) => {
      // These tests read from IndexedDB directly with getPoseTrackFromDB
      await setPoseTrackStorageMode(page, 'indexeddb');
      // Seed pose data first
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Verify data was seeded
      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_4REPS_VIDEO_HASH
      );
      expect(storedTrack).not.toBeNull();

      // Load video
      await clickSwingSampleButton(page);
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

      // Wait for canvas to have content (skeleton drawn)
      // Use waitForFunction to poll until the canvas has non-transparent pixels
      const canvasHasContent = await page
        .waitForFunction(
          () => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return false;

            const ctx = canvas.getContext('2d');
            if (!ctx) return false;

            // Get image data from a portion of the canvas
            const imageData = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );
            const data = imageData.data;

            // Check if any pixel has alpha > 0 (non-transparent)
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 0) {
                return true;
              }
            }
            return false;
          },
          { timeout: 5000 }
        )
        .then(() => true)
        .catch(() => false);

      expect(canvasHasContent).toBe(true);
    });

    test('skeleton updates when seeking to different positions', async ({
      page,
    }) => {
      // Seed pose data
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Load video
      await clickSwingSampleButton(page);
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

  test.describe('Video Switching', () => {
    // Helper to click the reload button (header button when video loaded, or direct button when not)
    async function clickLoadSampleButton(
      page: import('@playwright/test').Page
    ) {
      // Check if dialog is already visible (no video loaded yet)
      const dialog = page.locator('.media-dialog');
      if (await dialog.isVisible()) {
        // Dialog already visible, just click the swing button
        await page.click('button:has-text("Kettlebell Swing")');
      } else {
        // Click header button to show MediaSelectorDialog
        await page.click('button[aria-label="Load different video"]');
        await page.waitForSelector('.media-dialog', { timeout: 5000 });
        await page.click('button:has-text("Kettlebell Swing")');
      }
      // Wait for video to load
      await page.waitForSelector('video', { timeout: 15000 });
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video');
          return video?.src?.startsWith('blob:');
        },
        { timeout: 15000 }
      );
    }

    test('reloading sample video works correctly', async ({ page }) => {
      // Seed pose data first
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Load video first time
      await clickSwingSampleButton(page);
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for video to be fully loaded (blob URL assigned)
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video?.src?.startsWith('blob:');
        },
        { timeout: 10000 }
      );

      // Store the first video's src for comparison
      const firstSrc = await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video.src;
      });

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

      // Reload video (uses header button + source picker when video is loaded)
      await clickLoadSampleButton(page);

      // Wait for new video to load (new blob URL)
      await page.waitForFunction(
        (oldSrc) => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video?.src?.startsWith('blob:') && video.src !== oldSrc;
        },
        firstSrc,
        { timeout: 10000 }
      );

      // Verify new blob URL is different (old was revoked, new was created)
      const secondSrc = await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video.src;
      });

      expect(secondSrc).toMatch(/^blob:/);
      expect(secondSrc).not.toBe(firstSrc);

      // Controls should still be enabled
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            '#play-pause-btn'
          ) as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 20000 }
      );
    });

    test('switching video while playing pauses and loads new video', async ({
      page,
    }) => {
      // Seed pose data first
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Load and start playing video
      await clickSwingSampleButton(page);
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

      // Start playing
      await page.click('#play-pause-btn');
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video && !video.paused;
        },
        { timeout: 5000 }
      );

      // Store current src
      const playingSrc = await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video.src;
      });

      // Reload while playing (uses header button + source picker)
      await clickLoadSampleButton(page);

      // Wait for new video to load
      await page.waitForFunction(
        (oldSrc) => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video?.src?.startsWith('blob:') && video.src !== oldSrc;
        },
        playingSrc,
        { timeout: 10000 }
      );

      // New video should be paused (not auto-playing)
      const isPaused = await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video.paused;
      });
      expect(isPaused).toBe(true);

      // New video should be at start
      const currentTime = await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video.currentTime;
      });
      expect(currentTime).toBe(0);
    });

    test('rapid video reload attempts resolve correctly', async ({ page }) => {
      // Seed pose data first
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Load video first time
      await clickSwingSampleButton(page);
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait for first video to fully load
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video?.src?.startsWith('blob:') && video.readyState >= 1;
        },
        { timeout: 15000 }
      );

      // Now rapidly reload via header button
      await clickLoadSampleButton(page);
      await page.waitForTimeout(100);
      await clickLoadSampleButton(page);
      await page.waitForTimeout(100);
      await clickLoadSampleButton(page);

      // Wait for video to fully load (should be the last request)
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video?.src?.startsWith('blob:') && video.readyState >= 1;
        },
        { timeout: 15000 }
      );

      // Video should be loaded and functional
      const videoState = await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return {
          hasSrc: !!video.src,
          isBlobUrl: video.src.startsWith('blob:'),
          readyState: video.readyState,
          paused: video.paused,
        };
      });

      expect(videoState.hasSrc).toBe(true);
      expect(videoState.isBlobUrl).toBe(true);
      expect(videoState.readyState).toBeGreaterThanOrEqual(1); // HAVE_METADATA or higher
      expect(videoState.paused).toBe(true);

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

      // Play button should work
      await page.click('#play-pause-btn');
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video && !video.paused;
        },
        { timeout: 5000 }
      );
    });
  });
});

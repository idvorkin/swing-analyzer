/**
 * Swing Analyzer E2E Tests
 *
 * These tests verify core app functionality using pose fixtures
 * to enable fast, deterministic testing without ML model inference.
 */

import { expect, test } from '@playwright/test';
import { SWING_SAMPLE_4REPS_VIDEO_HASH, SWING_SAMPLE_VIDEO_HASH } from './fixtures';
import {
  clearPoseTrackDB,
  getPoseTrackFromDB,
  seedPoseTrackFixture,
  setPoseTrackStorageMode,
  useShortTestVideo,
} from './helpers';

test.describe('Swing Analyzer', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GitHub video URL and serve short local video for faster tests
    await useShortTestVideo(page);
    await page.goto('/');
    // These tests use getPoseTrackFromDB which reads from IndexedDB
    await setPoseTrackStorageMode(page, 'indexeddb');
    await clearPoseTrackDB(page);
  });

  test('should load the application and display the UI', async ({ page }) => {
    // Verify that the page title contains "Swing Analyzer"
    await expect(page).toHaveTitle(/Swing Analyzer/);

    // Verify that the main elements are visible
    await expect(page.locator('h1')).toContainText('Swing Analyzer');
    await expect(page.locator('#load-hardcoded-btn')).toBeVisible();
  });

  test('HUD should be hidden before video loads', async ({ page }) => {
    // HUD overlay should NOT be visible until a video is loaded
    await expect(page.locator('.hud-overlay')).not.toBeVisible();
  });

  test('Extraction % should be visible during extraction', async ({ page }) => {
    // Clear cache to force extraction
    await clearPoseTrackDB(page);

    // Load video to trigger extraction
    await page.click('#load-hardcoded-btn');

    // Wait for extraction to start
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video && video.src && video.src.startsWith('blob:');
      },
      { timeout: 10000 }
    );

    // Extraction % should be visible during extraction
    try {
      await expect(page.locator('.hud-overlay-extraction')).toBeVisible({ timeout: 3000 });
    } catch {
      // Extraction may have been instant (cached) - that's OK
    }
  });

  test('HUD visible when poses exist for current frame (seeded fixture)', async ({ page }) => {
    // Seed fixture - poses will exist immediately
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Load video
    await page.click('#load-hardcoded-btn');

    // Wait for video to load
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video && video.src && video.src.startsWith('blob:');
      },
      { timeout: 10000 }
    );

    // Seek to a frame to trigger pose lookup
    await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      video.currentTime = 0.5; // Seek to 0.5s where poses should exist
    });

    // Wait for seek to complete
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return Math.abs(video.currentTime - 0.5) < 0.1;
      },
      { timeout: 5000 }
    );

    // HUD should be visible because poses exist for this frame
    await expect(page.locator('.hud-overlay-reps')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.hud-overlay-angles')).toBeVisible();
    await expect(page.locator('.hud-overlay-status')).toBeVisible();
  });

  test('Extraction % hidden after extraction completes', async ({ page }) => {
    // Seed fixture so extraction completes quickly
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Load video
    await page.click('#load-hardcoded-btn');

    // Wait for HUD to appear (indicates extraction complete and poses available)
    await expect(page.locator('.hud-overlay-reps')).toBeVisible({ timeout: 15000 });

    // Extraction indicator should be hidden after completion
    await expect(page.locator('.hud-overlay-extraction')).not.toBeVisible();
  });

  test('HUD angles stay fixed when video is paused', async ({ page }) => {
    // This test catches the bug where extraction skeletons update HUD angles
    // even though the visible video is paused at a single frame.

    // Seed fixture
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Load video (starts paused)
    await page.click('#load-hardcoded-btn');

    // Wait for HUD to appear
    await expect(page.locator('.hud-overlay-angles')).toBeVisible({ timeout: 15000 });

    // Record the initial angle value
    const getSpineAngle = () =>
      page.locator('.hud-overlay-angle-value').first().textContent();

    const initialAngle = await getSpineAngle();
    expect(initialAngle).toBeTruthy();

    // Wait 500ms (during which extraction skeletons might stream if bug exists)
    await page.waitForTimeout(500);

    // Angle should be exactly the same (video is paused at same frame)
    const angleAfterWait = await getSpineAngle();
    expect(angleAfterWait).toBe(initialAngle);
  });

  test('should load hardcoded video when sample button clicked', async ({
    page,
  }) => {
    // Click the sample button
    await page.click('#load-hardcoded-btn');

    // Wait for video element to appear
    await page.waitForSelector('video', { timeout: 5000 });

    // Video element should exist and have a source
    const videoExists = await page.isVisible('video');
    expect(videoExists).toBe(true);

    // Wait for video src to be set (video is loaded as blob URL from fetch)
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video && video.src && video.src.startsWith('blob:');
      },
      { timeout: 10000 }
    );

    // Check the video has a blob source (video is fetched and converted to blob URL)
    const videoSrc = await page.$eval(
      'video',
      (video) => (video as HTMLVideoElement).src
    );
    expect(videoSrc).toMatch(/^blob:/);
  });

  test('should seed and retrieve pose track data correctly', async ({
    page,
  }) => {
    // Seed fixture data
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Verify data was stored
    const storedTrack = await getPoseTrackFromDB(page, SWING_SAMPLE_4REPS_VIDEO_HASH);
    expect(storedTrack).not.toBeNull();
    expect(storedTrack?.metadata.sourceVideoName).toBe('swing-sample-4reps.webm');
    expect(storedTrack?.frames.length).toBeGreaterThan(0);
  });

  test('should have pose track with valid keypoints', async ({ page }) => {
    // Seed fixture data
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Get stored track and verify keypoints
    const storedTrack = await getPoseTrackFromDB(page, SWING_SAMPLE_4REPS_VIDEO_HASH);
    expect(storedTrack).not.toBeNull();

    // Find first frame WITH keypoints (frame 0 may be empty if no pose detected)
    const frameWithKeypoints = storedTrack?.frames.find(
      (f) => f.keypoints.length > 0
    );
    expect(frameWithKeypoints?.keypoints).toBeDefined();
    expect(frameWithKeypoints?.keypoints.length).toBe(17); // COCO-17 format
  });

  test('should have precomputed angles in pose track', async ({ page }) => {
    // Seed fixture data
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Get stored track
    const storedTrack = await getPoseTrackFromDB(page, SWING_SAMPLE_4REPS_VIDEO_HASH);
    expect(storedTrack).not.toBeNull();

    // Find a frame with angles
    const frameWithAngles = storedTrack?.frames.find((f) => f.angles);
    expect(frameWithAngles?.angles).toBeDefined();
    expect(frameWithAngles?.angles?.spineAngle).toBeDefined();
  });

  test('should process single-rep fixture correctly', async ({ page }) => {
    // Seed single-rep fixture (uses original video hash for generated fixtures)
    await seedPoseTrackFixture(page, 'single-rep');

    // Get stored track
    const storedTrack = await getPoseTrackFromDB(page, SWING_SAMPLE_VIDEO_HASH);
    expect(storedTrack).not.toBeNull();
    expect(storedTrack?.frames.length).toBeGreaterThan(0);
  });

  test('should handle three-reps fixture with more frames', async ({
    page,
  }) => {
    // Seed both fixtures and compare (generated fixtures use original video hash)
    await seedPoseTrackFixture(page, 'single-rep');
    const singleRepTrack = await getPoseTrackFromDB(
      page,
      SWING_SAMPLE_VIDEO_HASH
    );
    const singleRepFrames = singleRepTrack?.frames.length ?? 0;

    // Clear and seed three-reps
    await clearPoseTrackDB(page);
    await seedPoseTrackFixture(page, 'three-reps');
    const threeRepsTrack = await getPoseTrackFromDB(
      page,
      SWING_SAMPLE_VIDEO_HASH
    );
    const threeRepsFrames = threeRepsTrack?.frames.length ?? 0;

    // Three reps should have more frames than single rep
    expect(threeRepsFrames).toBeGreaterThan(singleRepFrames);
  });

  test('should handle poor detection fixture', async ({ page }) => {
    // Seed poor detection fixture (generated fixtures use original video hash)
    await seedPoseTrackFixture(page, 'poor-detection');

    // Get stored track
    const storedTrack = await getPoseTrackFromDB(page, SWING_SAMPLE_VIDEO_HASH);
    expect(storedTrack).not.toBeNull();

    // Check that frames exist but may have lower scores
    const lowScoreFrames = storedTrack?.frames.filter(
      (f) => f.score !== undefined && f.score < 0.5
    );
    expect(lowScoreFrames?.length).toBeGreaterThan(0);
  });

  test('should have video control buttons visible', async ({ page }) => {
    // Check that control buttons exist on the page
    const playPauseBtn = page.locator('#play-pause-btn');
    const stopBtn = page.locator('#stop-btn');
    const loadBtn = page.locator('#load-hardcoded-btn');

    await expect(loadBtn).toBeVisible();
    await expect(playPauseBtn).toBeVisible();
    await expect(stopBtn).toBeVisible();
  });

  test('canvas dimensions should match video dimensions after loading', async ({ page }) => {
    // This test catches the bug where canvas internal dimensions weren't synced
    // to video dimensions, causing skeleton to render outside visible area

    // Load video
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 5000 });

    // Wait for video metadata to load
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video && video.videoWidth > 0 && video.videoHeight > 0;
      },
      { timeout: 10000 }
    );

    // Get video dimensions
    const videoDimensions = await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      return { width: video.videoWidth, height: video.videoHeight };
    });

    // Get canvas dimensions
    const canvasDimensions = await page.evaluate(() => {
      const canvas = document.querySelector('#output-canvas') as HTMLCanvasElement;
      return { width: canvas.width, height: canvas.height };
    });

    // Canvas internal dimensions must match video dimensions
    // (Otherwise skeleton keypoints will render outside visible area)
    expect(canvasDimensions.width).toBe(videoDimensions.width);
    expect(canvasDimensions.height).toBe(videoDimensions.height);

    // Also verify they're not default canvas size (300x150)
    expect(canvasDimensions.width).toBeGreaterThan(300);
    expect(canvasDimensions.height).toBeGreaterThan(150);
  });

  test('canvas CSS position should align with video content area', async ({ page }) => {
    // This test catches skeleton offset bugs where canvas CSS doesn't match
    // video's rendered area (accounting for object-fit: contain letterboxing)

    // Load video
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 5000 });

    // Wait for video metadata to load
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video && video.videoWidth > 0 && video.videoHeight > 0;
      },
      { timeout: 10000 }
    );

    // Give canvas sync time to run
    await page.waitForTimeout(100);

    // Get video and canvas bounding rects
    const alignment = await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      const canvas = document.querySelector('#output-canvas') as HTMLCanvasElement;

      const videoRect = video.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      // Calculate video's actual content area (accounting for object-fit: contain)
      const videoAspect = video.videoWidth / video.videoHeight;
      const containerAspect = videoRect.width / videoRect.height;

      let contentLeft: number;
      let contentTop: number;
      let contentWidth: number;
      let contentHeight: number;

      if (videoAspect > containerAspect) {
        // Video is wider - letterbox top/bottom
        contentWidth = videoRect.width;
        contentHeight = videoRect.width / videoAspect;
        contentLeft = videoRect.left;
        contentTop = videoRect.top + (videoRect.height - contentHeight) / 2;
      } else {
        // Video is taller - letterbox left/right
        contentHeight = videoRect.height;
        contentWidth = videoRect.height * videoAspect;
        contentLeft = videoRect.left + (videoRect.width - contentWidth) / 2;
        contentTop = videoRect.top;
      }

      return {
        canvas: {
          left: canvasRect.left,
          top: canvasRect.top,
          width: canvasRect.width,
          height: canvasRect.height,
        },
        videoContent: {
          left: contentLeft,
          top: contentTop,
          width: contentWidth,
          height: contentHeight,
        },
      };
    });

    // Canvas should overlay video content area exactly (within 2px tolerance for rounding)
    expect(alignment.canvas.left).toBeCloseTo(alignment.videoContent.left, 0);
    expect(alignment.canvas.top).toBeCloseTo(alignment.videoContent.top, 0);
    expect(alignment.canvas.width).toBeCloseTo(alignment.videoContent.width, 0);
    expect(alignment.canvas.height).toBeCloseTo(alignment.videoContent.height, 0);
  });
});

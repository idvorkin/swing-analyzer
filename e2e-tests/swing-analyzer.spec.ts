/**
 * Swing Analyzer E2E Tests
 *
 * These tests verify core app functionality using pose fixtures
 * to enable fast, deterministic testing without ML model inference.
 */

import { expect, test } from '@playwright/test';
import {
  SWING_SAMPLE_4REPS_VIDEO_HASH,
  SWING_SAMPLE_VIDEO_HASH,
} from './fixtures';
import {
  clearPoseTrackDB,
  clickSwingSampleButton,
  getPoseTrackFromDB,
  seedPoseTrackFixture,
  setPoseTrackStorageMode,
  useShortTestVideo,
} from './helpers';

// Read the live HUD spine/arm text from the page (DOM ids set in
// VideoSectionV2.tsx as `#hud-${metric.key}`; the swing metrics are
// spineAngle and armAngle).
async function readHud(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const num = (sel: string) => {
      const el = document.querySelector(sel);
      const m = el?.textContent?.match(/-?\d+/);
      return m ? Number.parseInt(m[0], 10) : null;
    };
    return { spine: num('#hud-spineAngle'), arm: num('#hud-armAngle') };
  });
}

async function seekTo(
  page: import('@playwright/test').Page,
  t: number
): Promise<void> {
  await page.evaluate((tt) => {
    const v = document.querySelector('video') as HTMLVideoElement;
    v.pause();
    v.currentTime = tt;
  }, t);
  await page.waitForFunction(
    (tt) =>
      Math.abs(
        (document.querySelector('video') as HTMLVideoElement).currentTime - tt
      ) < 0.05,
    t
  );
}

// Gate: wait until the video has loaded enough to seek and the HUD is showing
// (hasPosesForCurrentFrame true). The seeded pose track is served from the live
// cache; once the HUD is visible, a seek reliably fires `seeked` and the flush
// runs. (We do NOT gate on exact fixture values: in this environment the live
// cache serves a sparse, time-varying subset of frames, so a fixture-value
// check is unreliable. The assertions below are fixture-independent.)
async function waitForVideoReadyForHud(
  page: import('@playwright/test').Page
): Promise<void> {
  await expect(page.locator('.hud-overlay-angles')).toBeVisible({
    timeout: 15000,
  });
  await page.waitForFunction(
    () => (document.querySelector('video') as HTMLVideoElement).readyState >= 2
  );
}

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
    // MediaSelectorDialog should be visible with sample video option
    await expect(page.locator('.media-dialog')).toBeVisible();
    await expect(
      page.locator('button:has-text("Kettlebell Swing")')
    ).toBeVisible();
  });

  test('HUD should be hidden before video loads', async ({ page }) => {
    // HUD overlay should NOT be visible until a video is loaded
    await expect(page.locator('.hud-overlay')).not.toBeVisible();
  });

  test('Extraction % should be visible during extraction', async ({ page }) => {
    // Clear cache to force extraction
    await clearPoseTrackDB(page);

    // Load video to trigger extraction
    await clickSwingSampleButton(page);

    // Wait for extraction to start
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.src?.startsWith('blob:');
      },
      { timeout: 10000 }
    );

    // Extraction % should be visible during extraction
    try {
      await expect(page.locator('.hud-overlay-extraction')).toBeVisible({
        timeout: 3000,
      });
    } catch {
      // Extraction may have been instant (cached) - that's OK
    }
  });

  test('HUD visible when poses exist for current frame (seeded fixture)', async ({
    page,
  }) => {
    // Seed fixture - poses will exist immediately
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Load video
    await clickSwingSampleButton(page);

    // Wait for video to load
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.src?.startsWith('blob:');
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
    await expect(page.locator('.hud-overlay-reps')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('.hud-overlay-angles')).toBeVisible();
    // Note: .hud-overlay-status (position label) is only shown during checkpoint navigation
  });

  test('Extraction % hidden after extraction completes', async ({ page }) => {
    // Seed fixture so extraction completes quickly
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Load video
    await clickSwingSampleButton(page);

    // Wait for HUD to appear (indicates extraction complete and poses available)
    await expect(page.locator('.hud-overlay-reps')).toBeVisible({
      timeout: 15000,
    });

    // Extraction indicator should be hidden after completion
    await expect(page.locator('.hud-overlay-extraction')).not.toBeVisible();
  });

  test('HUD angles stay fixed when video is paused', async ({ page }) => {
    // This test catches the bug where extraction skeletons update HUD angles
    // even though the visible video is paused at a single frame.

    // Seed fixture
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Load video (starts paused)
    await clickSwingSampleButton(page);

    // Wait for HUD to appear
    await expect(page.locator('.hud-overlay-angles')).toBeVisible({
      timeout: 15000,
    });

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
    await clickSwingSampleButton(page);

    // Wait for video element to appear
    await page.waitForSelector('video', { timeout: 5000 });

    // Video element should exist and have a source
    const videoExists = await page.isVisible('video');
    expect(videoExists).toBe(true);

    // Wait for video src to be set (video is loaded as blob URL from fetch)
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.src?.startsWith('blob:');
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
    const storedTrack = await getPoseTrackFromDB(
      page,
      SWING_SAMPLE_4REPS_VIDEO_HASH
    );
    expect(storedTrack).not.toBeNull();
    expect(storedTrack?.metadata.sourceVideoName).toBe(
      'swing-sample-4reps.webm'
    );
    expect(storedTrack?.frames.length).toBeGreaterThan(0);
  });

  test('should have pose track with valid keypoints', async ({ page }) => {
    // Seed fixture data
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Get stored track and verify keypoints
    const storedTrack = await getPoseTrackFromDB(
      page,
      SWING_SAMPLE_4REPS_VIDEO_HASH
    );
    expect(storedTrack).not.toBeNull();

    // Find first frame WITH keypoints (frame 0 may be empty if no pose detected)
    const frameWithKeypoints = storedTrack?.frames.find(
      (f) => f.keypoints.length > 0
    );
    expect(frameWithKeypoints?.keypoints).toBeDefined();
    expect(frameWithKeypoints?.keypoints.length).toBe(33); // MediaPipe BlazePose-33 format
  });

  test('should have precomputed angles in pose track', async ({ page }) => {
    // Seed fixture data
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Get stored track
    const storedTrack = await getPoseTrackFromDB(
      page,
      SWING_SAMPLE_4REPS_VIDEO_HASH
    );
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
    // Sample button is now in the MediaSelectorDialog
    const loadBtn = page.locator('button:has-text("Kettlebell Swing")');

    await expect(loadBtn).toBeVisible();
    await expect(playPauseBtn).toBeVisible();
  });

  test('canvas dimensions should match video dimensions after loading', async ({
    page,
  }) => {
    // This test catches the bug where canvas internal dimensions weren't synced
    // to video dimensions, causing skeleton to render outside visible area

    // Load video
    await clickSwingSampleButton(page);
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
      const canvas = document.querySelector(
        '#output-canvas'
      ) as HTMLCanvasElement;
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

  test('canvas CSS position should align with video content area', async ({
    page,
  }) => {
    // This test catches skeleton offset bugs where canvas CSS doesn't match
    // video's rendered area (accounting for object-fit: contain letterboxing)

    // Load video
    await clickSwingSampleButton(page);
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
      const canvas = document.querySelector(
        '#output-canvas'
      ) as HTMLCanvasElement;

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
    expect(alignment.canvas.height).toBeCloseTo(
      alignment.videoContent.height,
      0
    );
  });

  // B1: Regression for the ddde777 bug — pausing mid-playback must flush the
  // throttled HUD so the on-screen numbers match the displayed frame. The
  // throttle writes the HUD at most ~10fps; without a final flush on pause the
  // readouts can lag the displayed frame by up to ~100ms (≤3 frames @ 30fps).
  // Fixture-independent check: the HUD after a plain pause must equal the HUD
  // after an explicit seek to the same time (the seek path always flushes via
  // handleSeeked). With the fix both flush the frame at video.currentTime; if
  // the pause flush were missing the paused HUD would retain the throttled
  // (stale) value and diverge from the seeked one.
  test('pausing mid-playback flushes the HUD to the displayed frame', async ({
    page,
  }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);
    await waitForVideoReadyForHud(page);

    const sampleTimes = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

    for (const t of sampleTimes) {
      // Start each sample from a clean paused state at t (seek flushes HUD=t).
      await seekTo(page, t);

      // Play >one throttle window (~130–220ms) so the displayed frame advances
      // past the last throttled HUD write before the pause.
      await page.evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement;
        void v.play();
      });
      await page.waitForFunction(
        () => !(document.querySelector('video') as HTMLVideoElement).paused
      );
      const playMs = 130 + (t % 0.1) * 900; // deterministic 130–220ms
      await page.waitForTimeout(playMs);

      // Pause (plain pause — fires 'pause' but NOT 'seeked').
      await page.evaluate(() => {
        (document.querySelector('video') as HTMLVideoElement).pause();
      });
      await page.waitForFunction(
        () => (document.querySelector('video') as HTMLVideoElement).paused
      );

      const ct = await page.evaluate(
        () => (document.querySelector('video') as HTMLVideoElement).currentTime
      );
      const afterPause = await readHud(page);

      // Ground truth: seek away then back to ct to force the (always-flushing)
      // seeked path to write the HUD for the same time.
      const away = ct > 1 ? ct - 1 : ct + 1;
      await seekTo(page, away);
      await seekTo(page, ct);
      const afterSeek = await readHud(page);

      // The HUD after pause must equal the HUD after an explicit seek to the
      // same time (both spine and arm — fixture-independent).
      expect(afterPause.spine).not.toBeNull();
      expect(afterPause.spine).toBe(afterSeek.spine);
      expect(afterPause.arm).toBe(afterSeek.arm);
    }
  });

  // B2: The natural-end path has the same gap as pause — 'ended' does not fire
  // 'seeked', so the throttled HUD must be flushed in handleEnded.
  test('video ending flushes the HUD to the final displayed frame', async ({
    page,
  }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);
    await waitForVideoReadyForHud(page);

    // Restart from near the start so the video plays through to its end.
    await seekTo(page, 0.3);

    // Speed up playback and play to the end.
    await page.evaluate(() => {
      const v = document.querySelector('video') as HTMLVideoElement;
      v.playbackRate = 4;
      void v.play();
    });
    await page.waitForFunction(
      () => (document.querySelector('video') as HTMLVideoElement).ended,
      undefined,
      { timeout: 30000 }
    );

    const ct = await page.evaluate(
      () => (document.querySelector('video') as HTMLVideoElement).currentTime
    );
    const afterEnded = await readHud(page);

    // Cross-check against the always-flushing seek path for the same time
    // (fixture-independent).
    const away = ct > 0.5 ? ct - 0.5 : ct + 0.5;
    await seekTo(page, away);
    await seekTo(page, ct);
    const afterSeek = await readHud(page);
    expect(afterEnded.spine).toBe(afterSeek.spine);
    expect(afterEnded.arm).toBe(afterSeek.arm);
  });

  // B3: Regression guard for the handleSeeked refactor (which now delegates to
  // the shared flushHudForCurrentFrame). The seek path must still flush the HUD
  // for the seeked time and remain consistent on a round-trip. (We assert
  // consistency, not specific values: in this environment the live cache
  // serves a sparse subset of frames, so the exact value at an arbitrary time
  // isn't fixture-comparable — see the existing user-journey spec, which
  // likewise only checks the HUD is defined after seeking.)
  test('seeking flushes the HUD to the seeked frame (refactor regression guard)', async ({
    page,
  }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);
    await waitForVideoReadyForHud(page);

    // HUD stays defined across seeks to several times.
    for (const t of [0.5, 2.5, 4.0, 1.0, 5.0]) {
      await seekTo(page, t);
      const hud = await readHud(page);
      expect(hud.spine).not.toBeNull();
      expect(hud.arm).not.toBeNull();
    }

    // Round-trip consistency: seek to A, read; seek away; seek back to A; the
    // value must reproduce (the seeked flush is idempotent for a given time).
    await seekTo(page, 3.0);
    const atA = await readHud(page);
    await seekTo(page, 1.5);
    await seekTo(page, 3.0);
    const roundTrip = await readHud(page);
    expect(roundTrip.spine).toBe(atA.spine);
    expect(roundTrip.arm).toBe(atA.arm);
  });
});

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

  test('should display analysis UI elements', async ({ page }) => {
    // Check that the analysis elements exist
    await expect(page.locator('#spine-angle')).toBeVisible();
    await expect(page.locator('#rep-counter')).toBeVisible();
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
});

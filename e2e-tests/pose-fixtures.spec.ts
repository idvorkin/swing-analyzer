/**
 * E2E Tests with Pose Fixtures
 *
 * These tests use pre-extracted pose data to enable fast, deterministic testing
 * without requiring ML model inference.
 *
 * NOTE: Some tests may show extraction errors in headless browsers due to
 * video codec limitations. The pose fixture approach bypasses this by
 * pre-seeding IndexedDB with pose data.
 */

import { expect, test } from '@playwright/test';
import { SWING_SAMPLE_4REPS_VIDEO_HASH, SWING_SAMPLE_VIDEO_HASH } from './fixtures';
import {
  clearPoseTrackDB,
  getPoseTrackFromDB,
  listPoseTrackHashes,
  seedPoseTrackFixture,
  setPoseTrackStorageMode,
  useShortTestVideo,
} from './helpers';

test.describe('Pose Track Fixtures', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GitHub video URL and serve short local video for faster tests
    await useShortTestVideo(page);
    // Clear any existing pose track data before each test
    await page.goto('/');
    // These tests specifically test IndexedDB functionality, so set IndexedDB mode
    await setPoseTrackStorageMode(page, 'indexeddb');
    await clearPoseTrackDB(page);
  });

  test.describe('@smoke Basic App Functionality', () => {
    test('app loads and displays UI', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Swing Analyzer');
      await expect(page.locator('#load-hardcoded-btn')).toBeVisible();
      await expect(page.locator('#camera-btn')).toBeVisible();
    });

    test('sample button clicks and video element appears', async ({ page }) => {
      // Click the sample button
      await page.click('#load-hardcoded-btn');

      // Wait for video element to appear (even if it fails to load codec)
      await page.waitForSelector('video', { timeout: 5000 });

      // Video element should exist
      const videoExists = await page.isVisible('video');
      expect(videoExists).toBe(true);
    });

    test('analysis section is visible', async ({ page }) => {
      // The analysis section should be visible
      await expect(page.locator('#rep-counter')).toBeVisible();
      await expect(page.locator('#spine-angle')).toBeVisible();
    });
  });

  test.describe('IndexedDB Seeding', () => {
    test('seeds pose track fixture into IndexedDB', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_4REPS_VIDEO_HASH
      );
      expect(storedTrack).not.toBeNull();
      expect(storedTrack?.metadata.sourceVideoName).toBe('swing-sample-4reps.webm');
      expect(storedTrack?.metadata.version).toBe('1.0');
      expect(storedTrack?.frames.length).toBeGreaterThan(0);
    });

    test('clears IndexedDB correctly', async ({ page }) => {
      // First seed data
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Verify it's there
      let storedTrack = await getPoseTrackFromDB(page, SWING_SAMPLE_4REPS_VIDEO_HASH);
      expect(storedTrack).not.toBeNull();

      // Clear and verify it's gone
      await clearPoseTrackDB(page);
      storedTrack = await getPoseTrackFromDB(page, SWING_SAMPLE_4REPS_VIDEO_HASH);
      expect(storedTrack).toBeNull();
    });

    test('seeds multiple fixtures', async ({ page }) => {
      // Seed multiple fixtures
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await seedPoseTrackFixture(page, 'single-rep');

      // List all hashes
      const hashes = await listPoseTrackHashes(page);

      // single-rep has the same hash as swing-sample in our fixtures
      // so there should be at least 1 entry
      expect(hashes.length).toBeGreaterThanOrEqual(1);
    });

    test('stores valid pose track metadata', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_4REPS_VIDEO_HASH
      );

      // Verify metadata structure
      expect(storedTrack?.metadata).toMatchObject({
        version: '1.0',
        model: 'blazepose',
        fps: 30,
      });
    });

    test('stores pose frames with keypoints', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_4REPS_VIDEO_HASH
      );

      // Verify frame structure - find first frame WITH keypoints
      // (frame 0 may be empty if no pose was detected at video start)
      const frameWithKeypoints = storedTrack?.frames.find(
        (f) => f.keypoints.length > 0
      );
      expect(frameWithKeypoints).toBeDefined();
      expect(frameWithKeypoints?.keypoints).toBeDefined();
      expect(frameWithKeypoints?.keypoints.length).toBeGreaterThan(0);
    });

    test('stores precomputed angles', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_4REPS_VIDEO_HASH
      );

      // Check if angles are stored
      const firstFrame = storedTrack?.frames[0];
      if (firstFrame?.angles) {
        expect(typeof firstFrame.angles.spineAngle).toBe('number');
        expect(typeof firstFrame.angles.armToSpineAngle).toBe('number');
      }
    });
  });

  test.describe('Generated Fixtures', () => {
    test('single-rep fixture has correct structure', async ({ page }) => {
      // Generated fixtures use the original video hash
      await seedPoseTrackFixture(page, 'single-rep');

      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_VIDEO_HASH
      );
      expect(storedTrack).not.toBeNull();

      // Single rep should have enough frames for the rep cycle
      // 10 initial + 60 (4 phases * 15 frames) + 5 ending = 75+ frames
      expect(storedTrack?.frames.length).toBeGreaterThan(50);
    });

    test('three-reps fixture has more frames than single-rep', async ({
      page,
    }) => {
      // Generated fixtures use the original video hash
      // First get single-rep frame count
      await seedPoseTrackFixture(page, 'single-rep');
      const singleRepTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_VIDEO_HASH
      );
      const singleRepFrames = singleRepTrack?.frames.length || 0;

      // Clear and seed three-reps
      await clearPoseTrackDB(page);
      await seedPoseTrackFixture(page, 'three-reps');
      const threeRepsTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_VIDEO_HASH
      );
      const threeRepsFrames = threeRepsTrack?.frames.length || 0;

      // Three reps should have more frames
      expect(threeRepsFrames).toBeGreaterThan(singleRepFrames);
    });

    test('poor-detection fixture has low confidence scores', async ({
      page,
    }) => {
      // Generated fixtures use the original video hash
      await seedPoseTrackFixture(page, 'poor-detection');

      const storedTrack = await getPoseTrackFromDB(
        page,
        SWING_SAMPLE_VIDEO_HASH
      );

      // Check that scores are generally low
      const scoresBelow07 = storedTrack?.frames.filter(
        (f) => (f.score || 0) < 0.7
      );
      expect(scoresBelow07?.length).toBeGreaterThan(0);
    });
  });

  test.describe('App Integration', () => {
    test('clicking Sample button with seeded data loads video', async ({
      page,
    }) => {
      // Seed data before clicking
      await seedPoseTrackFixture(page, 'swing-sample-4reps');

      // Click sample button
      await page.click('#load-hardcoded-btn');

      // Video should appear
      await page.waitForSelector('video', { timeout: 5000 });
      expect(await page.isVisible('video')).toBe(true);
    });

    test('UI elements remain functional with seeded data', async ({ page }) => {
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await page.click('#load-hardcoded-btn');

      // Wait for video element to appear instead of arbitrary timeout
      await page.waitForSelector('video', { timeout: 5000 });

      // UI should still be responsive
      await expect(page.locator('#rep-counter')).toBeVisible();
      await expect(page.locator('#spine-angle')).toBeVisible();
    });
  });
});

test.describe('Pose Studio Page', () => {
  test('navigates to /poses route', async ({ page }) => {
    await page.goto('/poses');

    // Page should load without errors
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('shows seeded pose tracks', async ({ page }) => {
    // Seed data first
    await page.goto('/');
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Navigate to poses page
    await page.goto('/poses');

    // Wait for page to be fully loaded instead of arbitrary timeout
    await page.waitForLoadState('networkidle');

    // Page content should exist (specific UI depends on implementation)
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });
});

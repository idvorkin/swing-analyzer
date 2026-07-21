/**
 * Upload Journey E2E
 *
 * The primary user flow: upload a video file from disk (not a sample).
 * Seeds the matching posetrack fixture first so the upload takes the
 * cache-hit path — deterministic and fast (no ML inference).
 */
import { expect, test } from '@playwright/test';
import { clearPoseTrackDB, seedPoseTrackFixture } from './helpers';

const VIDEO_PATH = 'public/videos/swing-sample-4reps.webm';
const FILE_INPUT = '#media-dialog-file';
const CORRUPT_FILE = {
  name: 'corrupt.webm',
  mimeType: 'video/webm',
  buffer: Buffer.from('this is not a video file'),
};

test.describe('Upload journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearPoseTrackDB(page);
  });

  test('uploading a video file shows rep count', async ({ page }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await page.locator(FILE_INPUT).setInputFiles(VIDEO_PATH);

    // Cache hit → batch processing → rep counter appears with 4 reps
    await expect(page.locator('#rep-counter')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#rep-counter')).toContainText('4', {
      timeout: 20000,
    });
  });

  test('file input is cleared after selection so the same file can be re-picked', async ({
    page,
  }) => {
    // Guards spec defect 4: handleVideoUpload must clear the input's value
    // synchronously so a later re-selection of the SAME file still fires a
    // change event. A corrupt upload is used so the load fails and the
    // dialog STAYS OPEN — asserting on the input after a successful upload
    // is impossible (the dialog unmounts with it).
    await page.locator(FILE_INPUT).setInputFiles(CORRUPT_FILE);
    await expect(page.locator('.status-banner')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator(FILE_INPUT)).toHaveValue('');
  });

  test('a failed upload shows an error banner instead of failing silently', async ({
    page,
  }) => {
    await page.locator(FILE_INPUT).setInputFiles(CORRUPT_FILE);

    await expect(page.locator('.status-banner')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('.status-banner')).toContainText(/error/i);
  });
});

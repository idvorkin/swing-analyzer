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

  test.fixme('file input is cleared after selection so the same file can be re-picked', async ({
    page,
  }) => {
    // Guards spec defect 4. Enabled by the fix task ("file input reset").
    // Without the fix the input keeps its value and the browser fires no
    // change event when the user re-selects the same file.
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await page.locator(FILE_INPUT).setInputFiles(VIDEO_PATH);
    await expect(page.locator('#rep-counter')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator(FILE_INPUT)).toHaveValue('');
  });
});

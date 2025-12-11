/**
 * E2E test to validate rep detection via session recording
 *
 * This test loads pose fixtures and verifies:
 * 1. Correct rep count is detected
 * 2. Rep times match expected values
 * 3. Angles are captured correctly in session recording
 */
import { expect, test } from '@playwright/test';
import {
  clearPoseTrackDB,
  clickSwingSampleButton,
  seedPoseTrackFixture,
} from './helpers';

test.describe('Rep Detection Validation', () => {
  test('igor-1h-swing detects 9 reps with correct angles in session recording', async ({
    page,
  }) => {
    // Clear any existing cache
    await page.goto('/');
    await clearPoseTrackDB(page);

    // Seed with the igor-1h-swing fixture
    await seedPoseTrackFixture(page, 'igor-1h-swing');

    // Reload to pick up seeded data
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Click sample button to load the video
    await clickSwingSampleButton(page);

    // Wait for video to appear
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for the app to be ready and process the cached poses
    await page.waitForFunction(
      () => {
        const debug = (window as any).swingDebug;
        if (!debug) return false;
        const session = debug.getCurrentSession();
        // Wait for skeleton_processing_complete event
        return session?.stateChanges?.some(
          (e: any) => e.type === 'skeleton_processing_complete'
        );
      },
      { timeout: 30000 }
    );

    // Get session recording
    const session = await page.evaluate(() => {
      return (window as any).swingDebug.getCurrentSession();
    });

    // Extract rep_detected events
    const repEvents = session.stateChanges.filter(
      (e: any) => e.type === 'rep_detected'
    );
    const completionEvent = session.stateChanges.find(
      (e: any) => e.type === 'skeleton_processing_complete'
    );

    console.log('Session recording results:');
    console.log('- Total rep_detected events:', repEvents.length);
    console.log(
      '- Final rep count from completion:',
      completionEvent?.details?.finalRepCount
    );
    console.log(
      '- Frames processed:',
      completionEvent?.details?.framesProcessed
    );
    console.log(
      '- Total frames processed:',
      completionEvent?.details?.totalFramesProcessed
    );

    console.log('\nRep detection details:');
    repEvents.forEach((e: any) => {
      const d = e.details;
      const videoTime = d.videoTime != null ? d.videoTime.toFixed(2) : 'N/A';
      const spine = d.angles?.spine != null ? d.angles.spine.toFixed(1) : 'N/A';
      const arm = d.angles?.arm != null ? d.angles.arm.toFixed(1) : 'N/A';
      const armToVert =
        d.angles?.armToVertical != null
          ? d.angles.armToVertical.toFixed(1)
          : 'N/A';
      const hip = d.angles?.hip != null ? d.angles.hip.toFixed(0) : 'N/A';
      console.log(
        `  Rep ${d.repNumber}: frame=${d.frameIndex}, time=${videoTime}s, spine=${spine}, arm=${arm}, armToVert=${armToVert}, hip=${hip}, phase=${d.phase}`
      );
    });

    // Assertions
    expect(repEvents.length).toBe(9);
    expect(completionEvent?.details?.finalRepCount).toBe(9);

    // Verify rep times are roughly correct (within 0.5s of expected)
    const expectedRepTimes = [
      4.1, 5.63, 7.17, 8.73, 10.27, 11.87, 13.43, 15.0, 16.57,
    ];
    repEvents.forEach((e: any, i: number) => {
      const actualTime = e.details.videoTime;
      const expectedTime = expectedRepTimes[i];
      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(0.5);
    });

    // Verify all reps have arm angle > 50 (rough threshold for top position)
    // Since we use Math.abs(), negative angles should work too
    // Note: Algorithm always uses right arm - angles may vary for left-handed swings
    repEvents.forEach((e: any) => {
      const armToVertical = Math.abs(e.details.angles?.armToVertical ?? 0);
      expect(armToVertical).toBeGreaterThan(50);
    });
  });

  test('swing-sample (browser-extracted) detects 9 reps', async ({ page }) => {
    // Intercept GitHub video URL to serve local swing-sample.webm
    // This ensures the video hash matches the fixture
    const fs = await import('node:fs');
    const path = await import('node:path');
    const videoPath = path.resolve('./public/videos/swing-sample.webm');

    await page.route(
      /raw\.githubusercontent\.com\/.*form-analyzer-samples.*\.webm/,
      async (route) => {
        const videoBuffer = fs.readFileSync(videoPath);
        await route.fulfill({
          status: 200,
          contentType: 'video/webm',
          body: videoBuffer,
        });
      }
    );

    await page.goto('/');
    await clearPoseTrackDB(page);

    // Seed with the swing-sample fixture (browser-extracted data, 594 frames)
    await seedPoseTrackFixture(page, 'swing-sample');

    // Reload to pick up seeded data
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Click sample button to load the video
    await clickSwingSampleButton(page);

    // Wait for video to appear
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for the app to process the cached poses
    await page.waitForFunction(
      () => {
        const debug = (window as any).swingDebug;
        if (!debug) return false;
        const session = debug.getCurrentSession();
        return session?.stateChanges?.some(
          (e: any) => e.type === 'skeleton_processing_complete'
        );
      },
      { timeout: 30000 }
    );

    // Get session recording
    const session = await page.evaluate(() => {
      return (window as any).swingDebug.getCurrentSession();
    });

    // Extract rep_detected events
    const repEvents = session.stateChanges.filter(
      (e: any) => e.type === 'rep_detected'
    );
    const completionEvent = session.stateChanges.find(
      (e: any) => e.type === 'skeleton_processing_complete'
    );

    console.log('Swing-sample session results:');
    console.log('- Total rep_detected events:', repEvents.length);
    console.log(
      '- Final rep count from completion:',
      completionEvent?.details?.finalRepCount
    );
    console.log(
      '- Frames processed:',
      completionEvent?.details?.framesProcessed
    );

    console.log('\nRep detection details:');
    repEvents.forEach((e: any) => {
      const d = e.details;
      const videoTime = d.videoTime != null ? d.videoTime.toFixed(2) : 'N/A';
      const spine = d.angles?.spine != null ? d.angles.spine.toFixed(1) : 'N/A';
      const armToVert =
        d.angles?.armToVertical != null
          ? d.angles.armToVertical.toFixed(1)
          : 'N/A';
      console.log(
        `  Rep ${d.repNumber}: time=${videoTime}s, spine=${spine}, armToVert=${armToVert}, phase=${d.phase}`
      );
    });

    // Assertions - browser-extracted swing-sample should detect 9 reps
    expect(repEvents.length).toBe(9);
    expect(completionEvent?.details?.finalRepCount).toBe(9);

    // Verify arm angles at top position are above threshold
    // Note: Algorithm always uses right arm - angles may vary for left-handed swings
    repEvents.forEach((e: any) => {
      const armToVertical = Math.abs(e.details.angles?.armToVertical ?? 0);
      expect(armToVertical).toBeGreaterThan(50);
    });
  });
});

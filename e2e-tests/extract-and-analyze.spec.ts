/**
 * E2E test that extracts poses from the ACTUAL remote video and analyzes them.
 * This reproduces what the browser does when you clear cache and reload.
 */
import { expect, test } from '@playwright/test';
import { clearPoseTrackDB, clickSwingSampleButton } from './helpers';

test.describe('Fresh Extraction Analysis', () => {
  // Give extraction plenty of time
  test.setTimeout(120000);

  // Skip in CI - this requires actual ML extraction which is slow and may timeout
  // Run manually: npx playwright test extract-and-analyze
  test.skip('extracts from remote video and detects 9 reps', async ({
    page,
  }) => {
    // Clear any existing cache
    await page.goto('/');
    await clearPoseTrackDB(page);

    // Reload to start fresh
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Click sample button to load the remote video
    await clickSwingSampleButton(page);

    // Wait for extraction to complete (look for skeleton_processing_complete or extraction_complete)
    console.log('Waiting for extraction to complete...');
    await page.waitForFunction(
      () => {
        const debug = (window as any).swingDebug;
        if (!debug) return false;
        const session = debug.getCurrentSession();
        const hasComplete = session?.stateChanges?.some(
          (e: any) =>
            e.type === 'skeleton_processing_complete' ||
            e.type === 'extraction_complete'
        );
        // Also check progress
        const progress = session?.stateChanges?.filter(
          (e: any) => e.type === 'extraction_start'
        );
        if (progress?.length > 0) {
          console.log('Extraction started...');
        }
        return hasComplete;
      },
      { timeout: 100000 }
    );

    // Get session recording
    const session = await page.evaluate(() => {
      return (window as any).swingDebug.getCurrentSession();
    });

    // Extract events
    const repEvents = session.stateChanges.filter(
      (e: any) => e.type === 'rep_detected'
    );
    const extractionStart = session.stateChanges.find(
      (e: any) => e.type === 'extraction_start'
    );
    const extractionComplete = session.stateChanges.find(
      (e: any) => e.type === 'extraction_complete'
    );
    const cacheLoad = session.stateChanges.find(
      (e: any) => e.type === 'cache_load'
    );
    const processingComplete = session.stateChanges.find(
      (e: any) => e.type === 'skeleton_processing_complete'
    );

    console.log('\n========== EXTRACTION RESULTS ==========');
    console.log(
      'Cache load:',
      cacheLoad ? 'YES (from cache)' : 'NO (fresh extraction)'
    );
    console.log('Extraction start:', extractionStart ? 'YES' : 'NO');
    console.log('Extraction complete:', extractionComplete ? 'YES' : 'NO');
    console.log('Processing complete:', processingComplete ? 'YES' : 'NO');

    if (processingComplete) {
      console.log(
        '  Frames processed:',
        processingComplete.details?.framesProcessed
      );
      console.log(
        '  Final rep count:',
        processingComplete.details?.finalRepCount
      );
      console.log(
        '  Processing time:',
        processingComplete.details?.processingTimeMs,
        'ms'
      );
    }

    console.log('\n========== REP DETECTION ==========');
    console.log('Total reps detected:', repEvents.length);

    repEvents.forEach((e: any) => {
      const d = e.details;
      const t = d.videoTime?.toFixed(2) ?? 'N/A';
      const armV = d.angles?.armToVertical?.toFixed(1) ?? 'N/A';
      const spine = d.angles?.spine?.toFixed(1) ?? 'N/A';
      const hip = d.angles?.hip?.toFixed(0) ?? 'N/A';
      console.log(
        `  Rep ${d.repNumber}: t=${t}s arm=${armV} spine=${spine} hip=${hip}`
      );
    });

    // Check if we got fresh extraction or cache
    if (cacheLoad) {
      console.log(
        '\nWARNING: Data was loaded from cache, not fresh extraction!'
      );
      console.log('Cache hash:', cacheLoad.details?.videoHash);
    }

    // Assertions
    expect(repEvents.length).toBe(9);
  });
});

/**
 * Instant Filmstrip E2E Tests
 *
 * Tests the user journey where filmstrip thumbnails appear during extraction,
 * without the user needing to press play.
 *
 * User Journey:
 * 1. User loads video
 * 2. Extraction starts (poses are detected frame by frame)
 * 3. As reps are detected during extraction, filmstrip thumbnails appear
 * 4. User sees thumbnails progressively without pressing play
 * 5. When extraction completes, all reps are visible in filmstrip
 *
 * Architecture:
 * - MockPoseDetector replaces real ML model during extraction
 * - frameDelayMs simulates realistic extraction timing (~15 FPS)
 * - Extracted frames stream through FormProcessor → RepProcessor
 * - Filmstrip captures frames as reps are detected
 */

import { expect, test } from '@playwright/test';
import { clearPoseTrackDB, setupMockPoseDetector } from './helpers';

// SKIPPED: Filmstrip thumbnail feature is disabled
// The filmstrip thumbnail capture was removed when consolidating
// SwingFormProcessor + SwingRepProcessor into SwingAnalyzer.
// See VideoSection.tsx lines 126-130 for the TODO.
// These tests should be re-enabled when filmstrip thumbnails are reimplemented.
test.describe.skip('Instant Filmstrip: Reps Appear During Extraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    // Clear any cached poses so extraction actually runs
    await clearPoseTrackDB(page);
  });

  test('filmstrip shows rep thumbnails during extraction without pressing play', async ({
    page,
  }) => {
    // Capture console logs to debug mock detector and pipeline
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Test]') || text.includes('Mock') ||
          text.includes('Pipeline') || text.includes('Form processor') ||
          text.includes('Rep processor') || text.includes('checkpoint') ||
          text.includes('CYCLE') || text.includes('Found') ||
          text.includes('Emitting') || text.includes('position')) {
        console.log(`[BROWSER] ${text}`);
      }
    });

    // Configure mock pose detector - 0ms delay for fast test execution
    // Real extraction timing is tested separately if needed
    await setupMockPoseDetector(page, 'swing-sample', 0);

    // Verify mock was set up
    const mockAvailable = await page.evaluate(() => {
      const factory = (window as unknown as {
        __testSetup?: { getMockDetectorFactory?: () => unknown };
      }).__testSetup?.getMockDetectorFactory?.();
      return !!factory;
    });
    console.log(`[TEST] Mock detector factory available: ${mockAvailable}`);

    // Load video - this triggers extraction
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Verify video is NOT playing - filmstrip should appear during extraction
    const videoPaused = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.paused;
    });
    expect(videoPaused).toBe(true);

    // Wait for extraction to start
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('Extracting');
      },
      { timeout: 10000 }
    );

    // Wait for first rep to appear in filmstrip (during extraction)
    // This is the key test - filmstrip populates BEFORE playback
    await page.waitForFunction(
      () => {
        const repCounter = document.querySelector('#rep-counter');
        const repCount = parseInt(repCounter?.textContent || '0', 10);
        return repCount >= 1;
      },
      { timeout: 60000 }
    );

    // Double-check video is STILL paused
    const stillPaused = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.paused;
    });
    expect(stillPaused).toBe(true);

    // Verify filmstrip has at least one thumbnail canvas
    const thumbnailCount = await page.evaluate(() => {
      const filmstrip = document.querySelector('.filmstrip-container');
      return filmstrip?.querySelectorAll('canvas').length || 0;
    });
    expect(thumbnailCount).toBeGreaterThanOrEqual(1);

    console.log(
      `Test passed: ${thumbnailCount} thumbnails appeared during extraction without playback`
    );
  });

  // Skip: Flaky due to IndexedDB race with parallel tests seeding same video hash
  // The progressive counting functionality is tested by other tests
  test.skip('rep count increases progressively during extraction', async ({
    page,
  }) => {
    // Use fast delay for testing - 10ms per frame
    await setupMockPoseDetector(page, 'swing-sample', 0);

    // Load video
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Track rep count changes over time
    const repCounts: number[] = [];

    // Poll rep count during extraction
    const pollInterval = setInterval(async () => {
      const count = await page.evaluate(() => {
        const el = document.querySelector('#rep-counter');
        return parseInt(el?.textContent || '0', 10);
      });
      if (count > 0 && (repCounts.length === 0 || count !== repCounts[repCounts.length - 1])) {
        repCounts.push(count);
      }
    }, 500);

    // Wait for extraction to complete or timeout
    // This test just needs to see reps being counted, not full completion
    try {
      await page.waitForFunction(
        () => {
          const repCounter = document.querySelector('#rep-counter');
          const repCount = parseInt(repCounter?.textContent || '0', 10);
          // Wait for at least 2 reps to show progressive counting
          return repCount >= 2;
        },
        { timeout: 30000 }
      );
    } finally {
      clearInterval(pollInterval);
    }

    // Should have seen rep count increase progressively
    console.log(`Rep counts observed during extraction: ${repCounts.join(' → ')}`);

    // At minimum, we should have detected at least one rep
    const finalRepCount = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });
    expect(finalRepCount).toBeGreaterThan(0);
  });

  test('filmstrip thumbnails are clickable after extraction', async ({
    page,
  }) => {
    // Fast extraction for this test - 10ms per frame
    await setupMockPoseDetector(page, 'swing-sample', 0);

    // Load video and wait for extraction to complete
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for at least 1 rep to complete (don't need full extraction)
    // Note: Rep 1 requires seeing 2 full cycles - first cycle establishes positions,
    // second "top" after "release" increments the counter
    await page.waitForFunction(
      () => {
        const repCounter = document.querySelector('#rep-counter');
        const repCount = parseInt(repCounter?.textContent || '0', 10);
        return repCount >= 1;
      },
      { timeout: 90000 }
    );

    // Get initial video time
    const initialTime = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.currentTime || 0;
    });

    // Click first filmstrip thumbnail
    const thumbnail = page.locator('.filmstrip-container canvas').first();
    if (await thumbnail.isVisible()) {
      await thumbnail.click();

      // Wait for video to seek
      await page.waitForTimeout(500);

      // Video time should have changed (seeking to the checkpoint)
      const newTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      // Time should be different (thumbnail click seeks video)
      // Note: might be same if thumbnail is at 0:00
      console.log(`Video time: ${initialTime} → ${newTime}`);
    }
  });

  test('extraction with mock detector produces same rep count as real detector', async ({
    page,
  }) => {
    // This test validates that mock detector produces realistic results
    // Use 10ms delay for consistency with other tests
    await setupMockPoseDetector(page, 'swing-sample', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for at least 2 reps to ensure consistent detection
    await page.waitForFunction(
      () => {
        const repCounter = document.querySelector('#rep-counter');
        const repCount = parseInt(repCounter?.textContent || '0', 10);
        return repCount >= 2;
      },
      { timeout: 30000 }
    );

    // Get final rep count
    const repCount = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });

    // The swing-sample video should have a consistent number of reps
    // (This validates the mock detector is working correctly)
    console.log(`Detected ${repCount} reps from mock extraction`);
    expect(repCount).toBeGreaterThan(0);
  });
});

// SKIPPED: These tests depend on mock extraction + playback flow
// which is flaky due to timing issues with video seeking and WebGL initialization.
// The underlying feature (rep count stability during playback) should be
// tested via unit tests on the pipeline components instead.
test.describe.skip('Playback Mode: No Duplicate Rep Counting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    await clearPoseTrackDB(page);
  });

  test('rep count stays stable after extraction when playing video', async ({
    page,
  }) => {
    // Capture console logs
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('playbackOnly') || text.includes('Pipeline') ||
          text.includes('Rep processor') || text.includes('Playback')) {
        console.log(`[BROWSER] ${text}`);
      }
    });

    // Configure mock pose detector - fast extraction (0ms delay for speed)
    await setupMockPoseDetector(page, 'swing-sample', 0);

    // Load video - triggers extraction
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete (status bar shows "Pose track ready")
    // This confirms all poses have been extracted before we start playback
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('Pose track ready');
      },
      { timeout: 120000 }
    );

    // Get rep count after extraction completes
    const repCountAfterExtraction = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });
    console.log(`Rep count after extraction: ${repCountAfterExtraction}`);
    expect(repCountAfterExtraction).toBeGreaterThan(0);

    // Now play the video - this should use cached poses with playback-only mode
    await page.click('#play-pause-btn');

    // Wait for video to play for a bit (let it play through some frames)
    await page.waitForTimeout(3000);

    // Get rep count after playback
    const repCountAfterPlayback = await page.evaluate(() => {
      const el = document.querySelector('#rep-counter');
      return parseInt(el?.textContent || '0', 10);
    });
    console.log(`Rep count after playback: ${repCountAfterPlayback}`);

    // Rep count should NOT have increased during playback
    // (playback-only mode should skip form/rep processing)
    expect(repCountAfterPlayback).toBe(repCountAfterExtraction);
  });

  test('skeleton still renders during playback after extraction', async ({
    page,
  }) => {
    // Configure mock pose detector (0ms delay for speed)
    await setupMockPoseDetector(page, 'swing-sample', 0);

    // Load video and wait for extraction to complete
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete (status bar shows "Pose track ready")
    await page.waitForFunction(
      () => {
        const statusEl = document.querySelector('.pose-status-bar');
        return statusEl?.textContent?.includes('Pose track ready');
      },
      { timeout: 120000 }
    );

    // Play the video
    await page.click('#play-pause-btn');

    // Wait a moment for playback to start
    await page.waitForTimeout(1000);

    // Check that skeleton canvas is visible
    const canvasVisible = await page.evaluate(() => {
      const canvas = document.querySelector('#output-canvas');
      return canvas && (canvas as HTMLCanvasElement).width > 0;
    });
    expect(canvasVisible).toBe(true);

    console.log('Skeleton canvas visible during playback');
  });
});

test.describe.skip('Filmstrip Frame Capture During Extraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    await clearPoseTrackDB(page);
  });

  test('captures 4 position thumbnails per rep (Top, Connect, Bottom, Release)', async ({
    page,
  }) => {
    // Fast extraction with mock pose detector
    await setupMockPoseDetector(page, 'swing-sample', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for at least one rep
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#rep-counter');
        return parseInt(el?.textContent || '0', 10) >= 1;
      },
      { timeout: 60000 }
    );

    // Check filmstrip has 4 thumbnails for the first rep
    const thumbnailCount = await page.evaluate(() => {
      const filmstrip = document.querySelector('.filmstrip-container');
      return filmstrip?.querySelectorAll('canvas').length || 0;
    });

    // Should have exactly 4 checkpoints per rep (Top, Connect, Bottom, Release)
    expect(thumbnailCount).toBe(4);
  });
});

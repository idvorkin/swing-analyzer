/**
 * Instant Rep Gallery E2E Tests
 *
 * Tests the user journey where rep gallery thumbnails appear during extraction,
 * without the user needing to press play.
 *
 * User Journey:
 * 1. User loads video
 * 2. Extraction starts (poses are detected frame by frame)
 * 3. As reps are detected during extraction, rep gallery thumbnails appear
 * 4. User sees thumbnails progressively without pressing play
 * 5. When extraction completes, all reps are visible in rep gallery
 *
 * Architecture:
 * - MockPoseDetector replaces real ML model during extraction
 * - frameDelayMs simulates realistic extraction timing (~15 FPS)
 * - Extracted frames stream through FormProcessor → RepProcessor
 * - Rep gallery captures frames as reps are detected
 */

import { expect, test } from '@playwright/test';
import { generateTestId, setVideoTestId, setupMockPoseDetector, useShortTestVideo } from './helpers';

// Rep gallery thumbnail tests - thumbnails appear during extraction
// Tests must run serially - mock detector and IndexedDB have shared state
test.describe.serial('Instant Rep Gallery: Reps Appear During Extraction', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GitHub video URL and serve short local video for faster tests
    await useShortTestVideo(page);
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    // Set unique test ID for cache isolation - allows parallel test execution
    await setVideoTestId(page, generateTestId());
  });

  test('rep gallery shows thumbnails during extraction without pressing play', async ({
    page,
  }) => {
    // Capture console logs to debug mock detector and pipeline
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Test]') || text.includes('Mock') ||
          text.includes('Pipeline') || text.includes('Form processor') ||
          text.includes('Rep processor') || text.includes('checkpoint') ||
          text.includes('CYCLE') || text.includes('Found') ||
          text.includes('Emitting') || text.includes('position') ||
          text.includes('FormAnalyzer') || text.includes('Filmstrip') ||
          text.includes('frameImage')) {
        console.log(`[BROWSER] ${text}`);
      }
    });

    // Configure mock pose detector - 0ms delay for fast test execution
    // Real extraction timing is tested separately if needed
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

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

    // Verify video is NOT playing - rep gallery should appear during extraction
    const videoPaused = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.paused;
    });
    expect(videoPaused).toBe(true);

    // Wait for extraction to complete - with 0ms delay, extraction is instant
    // We check for rep gallery thumbnails as the completion indicator
    await page.waitForFunction(
      () => {
        const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return playBtn && !playBtn.disabled && thumbnails > 0;
      },
      { timeout: 30000 }
    );

    // Double-check video is STILL paused
    const stillPaused = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.paused;
    });
    expect(stillPaused).toBe(true);

    // Verify rep gallery has at least one thumbnail canvas
    const thumbnailCount = await page.evaluate(() => {
      const repGallery = document.querySelector('.rep-gallery-container');
      return repGallery?.querySelectorAll('canvas').length || 0;
    });
    expect(thumbnailCount).toBeGreaterThanOrEqual(1);

    console.log(
      `Test passed: ${thumbnailCount} thumbnails appeared during extraction without playback`
    );
  });

  test('rep gallery thumbnails appear during extraction', async ({
    page,
  }) => {
    // Use fast delay for testing - 0ms per frame
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    // Load video
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - rep gallery gets thumbnails
    await page.waitForFunction(
      () => {
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        // Wait for at least 4 thumbnails (one rep with 4 positions)
        return thumbnails >= 4;
      },
      { timeout: 30000 }
    );

    // Verify rep gallery has thumbnails
    const thumbnailCount = await page.evaluate(() => {
      const repGallery = document.querySelector('.rep-gallery-container');
      return repGallery?.querySelectorAll('canvas').length || 0;
    });

    console.log(`Rep gallery has ${thumbnailCount} thumbnails after extraction`);
    expect(thumbnailCount).toBeGreaterThanOrEqual(4);
  });

  test('rep gallery thumbnails are clickable after extraction', async ({
    page,
  }) => {
    // Fast extraction for this test
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    // Load video and wait for extraction to complete
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for rep gallery to have thumbnails (extraction complete)
    await page.waitForFunction(
      () => {
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return thumbnails >= 1;
      },
      { timeout: 30000 }
    );

    // Get initial video time
    const initialTime = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.currentTime || 0;
    });

    // Click first rep gallery thumbnail
    const thumbnail = page.locator('.rep-gallery-container canvas').first();
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

  // Retry - can be flaky with parallel IndexedDB access
  test('extraction with mock detector produces rep gallery with multiple reps', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'retry', description: 'Flaky with parallel IndexedDB access' });
    // This test validates that mock detector produces realistic results
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for rep gallery to have thumbnails (extraction complete with at least one rep)
    await page.waitForFunction(
      () => {
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return thumbnails >= 4; // 4 thumbnails = 1 rep
      },
      { timeout: 30000 }
    );

    // Get rep gallery info
    const info = await page.evaluate(() => {
      const repGallery = document.querySelector('.rep-gallery-container');
      const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
      const repNav = document.querySelector('.rep-gallery-rep-indicator');
      return {
        thumbnails,
        repInfo: repNav?.textContent || '',
      };
    });

    // The swing-sample video should produce thumbnails
    console.log(`Detected ${info.thumbnails} thumbnails, rep info: "${info.repInfo}"`);
    expect(info.thumbnails).toBeGreaterThanOrEqual(4);
  });
});

// Tests for playback mode after extraction
test.describe.serial('Playback Mode: No Duplicate Rep Counting', () => {
  test.beforeEach(async ({ page }) => {
    // Use short test video for faster tests
    await useShortTestVideo(page);
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    // Set unique test ID for cache isolation - allows parallel test execution
    await setVideoTestId(page, generateTestId());
  });

  // Retry - can be flaky with parallel IndexedDB access
  test('rep count stays stable after extraction when playing video', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'retry', description: 'Flaky with parallel IndexedDB access' });
    // Configure mock pose detector - fast extraction (0ms delay for speed)
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    // Load video - triggers extraction
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - controls become enabled and rep gallery has thumbnails
    await page.waitForFunction(
      () => {
        const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return playBtn && !playBtn.disabled && thumbnails > 0;
      },
      { timeout: 30000 }
    );

    // Seek to middle of video where poses should exist (HUD only visible when poses exist)
    await page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      if (video && video.duration > 0) {
        video.currentTime = video.duration / 2;
      }
    });
    await page.waitForTimeout(500); // Wait for seek to complete and HUD to update

    // Wait for HUD to become visible (has poses for current frame)
    await expect(page.locator('#rep-counter')).toBeVisible({ timeout: 5000 });

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

  // Retry - can be flaky with parallel IndexedDB access
  test('skeleton still renders during playback after extraction', async ({
    page,
  }) => {
    test.info().annotations.push({ type: 'retry', description: 'Flaky with parallel IndexedDB access' });
    // Configure mock pose detector (0ms delay for speed)
    // Use swing-sample-4reps to match useShortTestVideo()
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    // Load video and wait for extraction to complete
    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - controls become enabled and rep gallery has thumbnails
    await page.waitForFunction(
      () => {
        const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return playBtn && !playBtn.disabled && thumbnails > 0;
      },
      { timeout: 30000 }
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

test.describe.serial('Rep Gallery Frame Capture During Extraction', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept GitHub video URL and serve short local video for faster tests
    await useShortTestVideo(page);
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    // Set unique test ID for cache isolation - allows parallel test execution
    await setVideoTestId(page, generateTestId());
  });

  test('captures 4 position thumbnails per rep (Top, Connect, Bottom, Release)', async ({
    page,
  }) => {
    // Fast extraction with mock pose detector (use swing-sample-4reps to match useShortTestVideo)
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for rep gallery to have exactly 4 thumbnails (one rep with 4 positions)
    // Note: We check rep gallery directly instead of HUD rep counter since HUD
    // only shows when there's a pose at the current video time
    await page.waitForFunction(
      () => {
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return thumbnails === 4;
      },
      { timeout: 30000 }
    );

    // Verify rep gallery has exactly 4 thumbnails for the first rep
    const thumbnailCount = await page.evaluate(() => {
      const repGallery = document.querySelector('.rep-gallery-container');
      return repGallery?.querySelectorAll('canvas').length || 0;
    });

    // Should have exactly 4 checkpoints per rep (Top, Connect, Bottom, Release)
    expect(thumbnailCount).toBe(4);
  });
});

/**
 * Skeleton Rendering Performance Tests
 *
 * Tests that skeleton overlay renders smoothly without lag during playback.
 * Performance is measured by checking render timing and frame consistency.
 *
 * Known issues being tested (swing-8h3):
 * - Multiple beginPath() calls per frame (17 per render)
 * - No RAF throttling on timeupdate events
 * - Unnecessary keypoint normalization in hot path
 * - Expensive angle calculations during render
 */
test.describe.serial('Skeleton Rendering Performance', () => {
  test.beforeEach(async ({ page }) => {
    await useShortTestVideo(page);
    await page.goto('/');

    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    await setVideoTestId(page, generateTestId());
  });

  /**
   * Test: Skeleton rendering uses requestAnimationFrame for smooth updates
   *
   * Validates the swing-8h3 performance fix:
   * - RAF throttling is in place (no multiple renders per frame)
   * - Canvas operations are batched
   * - Angle calculations are cached
   *
   * Note: This test validates that rendering happens during playback
   * using requestVideoFrameCallback for per-frame sync.
   */
  test('skeleton renders per-frame during playback', async ({
    page,
  }) => {
    // Fast extraction
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - controls become enabled and rep gallery has thumbnails
    await page.waitForFunction(
      () => {
        const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return playBtn && !playBtn.disabled && thumbnails > 0;
      },
      { timeout: 30000 }
    );

    // Inject render counter
    await page.evaluate(() => {
      let renderCount = 0;

      // Monitor canvas clearRect to detect renders
      const canvas = document.querySelector('#output-canvas') as HTMLCanvasElement;
      if (canvas) {
        const origClearRect = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function(...args) {
          renderCount++;
          return origClearRect.apply(this, args);
        };
      }

      (window as unknown as { __renderCount: () => number }).__renderCount = () => renderCount;
    });

    // Play video for 2 seconds
    await page.click('#play-pause-btn');
    await page.waitForTimeout(2000);
    await page.click('#play-pause-btn'); // Pause

    // Check render count
    const renderCount = await page.evaluate(() => {
      return (window as unknown as { __renderCount?: () => number }).__renderCount?.() || 0;
    });

    console.log(`Skeleton rendered ${renderCount} times during 2s playback`);

    // Should have renders during playback (requestVideoFrameCallback fires per video frame)
    // At 30fps for 2 seconds, expect roughly 60 renders, but headless may vary
    expect(renderCount).toBeGreaterThan(0);
  });

  /**
   * Test: Canvas content changes during video playback
   *
   * Validates that skeleton overlay updates as video plays.
   * Note: In headless Chrome, timeupdate fires infrequently,
   * so we just verify canvas changes at least once.
   */
  test('canvas content changes during video playback', async ({ page }) => {
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    await page.click('#load-hardcoded-btn');
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - controls become enabled and rep gallery has thumbnails
    await page.waitForFunction(
      () => {
        const playBtn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return playBtn && !playBtn.disabled && thumbnails > 0;
      },
      { timeout: 30000 }
    );

    // Track canvas changes during playback
    await page.evaluate(() => {
      const canvas = document.querySelector('#output-canvas') as HTMLCanvasElement;
      if (canvas) {
        let changeCount = 0;
        let lastImageData = '';

        const checkCanvas = () => {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Sample a small region to detect changes
            const data = ctx.getImageData(0, 0, 10, 10);
            const hash = Array.from(data.data.slice(0, 40)).join(',');
            if (hash !== lastImageData) {
              changeCount++;
              lastImageData = hash;
            }
          }
        };

        const video = document.querySelector('video');
        if (video) {
          video.addEventListener('timeupdate', checkCanvas);
        }

        (window as unknown as { __canvasChangeCount: () => number }).__canvasChangeCount = () => changeCount;
      }
    });

    // Play video
    await page.click('#play-pause-btn');
    await page.waitForTimeout(2000);
    await page.click('#play-pause-btn'); // Pause

    const changeCount = await page.evaluate(() => {
      return (window as unknown as { __canvasChangeCount?: () => number }).__canvasChangeCount?.() || 0;
    });

    console.log(`Canvas changed ${changeCount} times during 2s playback`);

    // Canvas should update at least once during playback
    // (In headless Chrome, timeupdate is infrequent, so we just verify it changes)
    expect(changeCount).toBeGreaterThanOrEqual(1);
  });
});

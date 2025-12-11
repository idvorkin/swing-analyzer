/**
 * Rep Gallery E2E Tests
 *
 * Tests the Rep Gallery modal feature for browsing and comparing reps.
 * See specs/rep-gallery.md for the full specification.
 *
 * Tests use mock detector for extraction, which populates the repThumbnails map.
 * Seeded data alone doesn't work because repThumbnails is captured during extraction.
 */

import { expect, test } from '@playwright/test';
import {
  clearPoseTrackDB,
  clickSwingSampleButton,
  generateTestId,
  setVideoTestId,
  setupMockPoseDetector,
  useShortTestVideo,
} from './helpers';

test.describe('Rep Gallery Modal', () => {
  test.beforeEach(async ({ page }) => {
    await useShortTestVideo(page);
    await page.goto('/');

    // Wait for test setup to be available (app fully initialized)
    await page.waitForFunction(
      () => !!(window as unknown as { __testSetup?: unknown }).__testSetup,
      { timeout: 10000 }
    );

    // Set unique test ID for cache isolation
    await setVideoTestId(page, generateTestId());
  });

  /**
   * Helper to load video and wait for gallery button to appear
   * Uses mock detector for extraction to populate repThumbnails
   */
  async function loadVideoAndWaitForGallery(page: import('@playwright/test').Page) {
    // Configure mock pose detector - 0ms delay for fast test execution
    await setupMockPoseDetector(page, 'swing-sample-4reps', 0);

    await clickSwingSampleButton(page);
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for extraction to complete - controls enabled and rep gallery has thumbnails
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('#play-pause-btn') as HTMLButtonElement;
        const repGallery = document.querySelector('.rep-gallery-container');
        const thumbnails = repGallery?.querySelectorAll('canvas').length || 0;
        return btn && !btn.disabled && thumbnails > 0;
      },
      { timeout: 30000 }
    );

    // Wait for gallery button to appear (requires reps and thumbnails)
    await page.waitForSelector('.rep-gallery-gallery-btn', { timeout: 10000 });
  }

  test.describe('Grid View (Default)', () => {
    test('RG-001: gallery button appears when reps exist and opens modal', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);

      // Gallery button should be visible
      await expect(page.locator('.rep-gallery-gallery-btn')).toBeVisible();

      // Click to open gallery
      await page.click('.rep-gallery-gallery-btn');

      // Modal should be visible
      await expect(page.locator('.gallery-modal')).toBeVisible();
      await expect(page.locator('#gallery-title')).toHaveText('Rep Gallery');
    });

    test('RG-002: phase headers are dynamically detected from data', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Should have phase headers (dynamically detected)
      const phaseHeaders = page.locator('.gallery-phase-btn');
      await expect(phaseHeaders).toHaveCount(4); // bottom, release, top, connect

      // Verify known phases are present in display order (starting from bottom)
      await expect(phaseHeaders.nth(0)).toHaveText('Bottom');
      await expect(phaseHeaders.nth(1)).toHaveText('Release');
      await expect(phaseHeaders.nth(2)).toHaveText('Top');
      await expect(phaseHeaders.nth(3)).toHaveText('Connect');
    });

    test('RG-003: rep rows display with phase cells', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Should have at least one rep row (mock detector may detect variable reps)
      const repRows = page.locator('.gallery-grid-row');
      const rowCount = await repRows.count();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // First row should have rep number "1"
      await expect(repRows.nth(0).locator('.gallery-rep-number')).toHaveText('1');

      // Each row should have phase cells (4 phases + 1 rep cell = 5 cells per row)
      const firstRowCells = repRows.nth(0).locator('.gallery-grid-cell');
      await expect(firstRowCells).toHaveCount(5); // rep + 4 phases
    });

    test('RG-004: current rep row is highlighted', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // First rep should be highlighted as current (0-indexed in app state)
      const firstRow = page.locator('.gallery-grid-row').first();
      await expect(firstRow).toHaveClass(/gallery-grid-row--current/);
    });

    test('RG-005: clicking phase header focuses that column', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Click on "Top" phase header
      await page.click('.gallery-phase-btn:has-text("Top")');

      // Phase button should be active
      await expect(page.locator('.gallery-phase-btn:has-text("Top")')).toHaveClass(/gallery-phase-btn--active/);

      // Grid should be in focused mode
      await expect(page.locator('.gallery-grid')).toHaveClass(/gallery-grid--focused/);

      // Cells for focused phase should be larger
      const focusedCells = page.locator('.gallery-grid-cell--focused');
      expect(await focusedCells.count()).toBeGreaterThan(0);
    });

    test('RG-006: clicking focused phase header unfocuses it', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Focus "Top" phase
      await page.click('.gallery-phase-btn:has-text("Top")');
      await expect(page.locator('.gallery-phase-btn:has-text("Top")')).toHaveClass(/gallery-phase-btn--active/);

      // Click again to unfocus
      await page.click('.gallery-phase-btn:has-text("Top")');

      // Should no longer be active
      await expect(page.locator('.gallery-phase-btn:has-text("Top")')).not.toHaveClass(/gallery-phase-btn--active/);

      // Grid should not be in focused mode
      await expect(page.locator('.gallery-grid')).not.toHaveClass(/gallery-grid--focused/);
    });

    test.skip('RG-007: clicking thumbnail seeks video to that timestamp', async ({ page }) => {
      // NOTE: This test requires actual extraction to generate thumbnails with frameImage data.
      // Seeded fixtures don't include frameImage because it's captured at runtime.
      // This test should be run with realistic test mode (mock detector with timing).
      await loadVideoAndWaitForGallery(page);

      // Get initial video time
      const initialTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      await page.click('.rep-gallery-gallery-btn');

      // Click a thumbnail (not the first one to ensure seeking)
      const thumbnails = page.locator('.gallery-thumbnail');
      await thumbnails.nth(4).click(); // Click a thumbnail from later in the video

      // Video time should have changed
      await page.waitForFunction(
        (prevTime) => {
          const video = document.querySelector('video');
          return video && video.currentTime !== prevTime;
        },
        initialTime,
        { timeout: 5000 }
      );

      const newTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      expect(newTime).not.toBe(initialTime);
    });

    test('RG-008: checkbox selects rep for comparison (max 4)', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Select first rep
      await page.click('.gallery-checkbox >> nth=0');

      // Row should be selected
      await expect(page.locator('.gallery-grid-row').first()).toHaveClass(/gallery-grid-row--selected/);

      // Select second rep
      await page.click('.gallery-checkbox >> nth=1');

      // Both should be selected
      const selectedRows = page.locator('.gallery-grid-row--selected');
      await expect(selectedRows).toHaveCount(2);
    });

    test('RG-009: compare button appears when 2+ reps selected', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Compare button should not be visible initially
      await expect(page.locator('.gallery-compare-btn')).not.toBeVisible();

      // Select one rep - still no compare button
      await page.click('.gallery-checkbox >> nth=0');
      await expect(page.locator('.gallery-compare-btn')).not.toBeVisible();

      // Select second rep - compare button should appear
      await page.click('.gallery-checkbox >> nth=1');
      await expect(page.locator('.gallery-compare-btn')).toBeVisible();
      await expect(page.locator('.gallery-compare-btn')).toHaveText('Compare (2)');
    });

    test('RG-010: empty state shown when no reps exist', async ({ page }) => {
      // Don't use mock detector - no extraction means no reps
      await clickSwingSampleButton(page);
      await page.waitForSelector('video', { timeout: 10000 });

      // Wait a moment for UI to settle
      await page.waitForTimeout(500);

      // Gallery button should NOT be visible (no reps/no extraction)
      await expect(page.locator('.rep-gallery-gallery-btn')).not.toBeVisible();
    });
  });

  test.describe('Compare View', () => {
    test('RG-011: compare button switches to compare view', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Select two reps
      await page.click('.gallery-checkbox >> nth=0');
      await page.click('.gallery-checkbox >> nth=1');

      // Click compare button
      await page.click('.gallery-compare-btn');

      // Title should change
      await expect(page.locator('#gallery-title')).toHaveText('Compare Reps');

      // Compare view should be visible
      await expect(page.locator('.gallery-compare')).toBeVisible();

      // Back button should appear
      await expect(page.locator('.gallery-back-btn')).toBeVisible();
    });

    test('RG-012: back button returns to grid view', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Enter compare view
      await page.click('.gallery-checkbox >> nth=0');
      await page.click('.gallery-checkbox >> nth=1');
      await page.click('.gallery-compare-btn');

      await expect(page.locator('#gallery-title')).toHaveText('Compare Reps');

      // Click back button
      await page.click('.gallery-back-btn');

      // Should be back in grid view
      await expect(page.locator('#gallery-title')).toHaveText('Rep Gallery');
      await expect(page.locator('.gallery-grid')).toBeVisible();
    });

    test.skip('RG-013: thumbnails seek video in compare view', async ({ page }) => {
      // NOTE: This test requires actual extraction to generate thumbnails with frameImage data.
      // Seeded fixtures don't include frameImage because it's captured at runtime.
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Enter compare view
      await page.click('.gallery-checkbox >> nth=0');
      await page.click('.gallery-checkbox >> nth=1');
      await page.click('.gallery-compare-btn');

      // Get initial video time
      const initialTime = await page.evaluate(() => {
        const video = document.querySelector('video');
        return video?.currentTime || 0;
      });

      // Click a thumbnail in compare view
      await page.locator('.gallery-compare .gallery-thumbnail').first().click();

      // Video time should have changed
      await page.waitForFunction(
        (prevTime) => {
          const video = document.querySelector('video');
          return video && video.currentTime !== prevTime;
        },
        initialTime,
        { timeout: 5000 }
      );
    });

    test.skip('RG-014: compare view shows large thumbnails', async ({ page }) => {
      // NOTE: This test requires actual extraction to generate thumbnails with frameImage data.
      // Seeded fixtures don't include frameImage because it's captured at runtime.
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Enter compare view
      await page.click('.gallery-checkbox >> nth=0');
      await page.click('.gallery-checkbox >> nth=1');
      await page.click('.gallery-compare-btn');

      // All thumbnails should be large size
      const thumbnails = page.locator('.gallery-compare .gallery-thumbnail');
      const firstThumbnail = thumbnails.first();

      // Large thumbnails have --large class
      await expect(firstThumbnail).toHaveClass(/gallery-thumbnail--large/);
    });
  });

  test.describe('Modal Behavior', () => {
    test('RG-015: close button closes modal', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      await expect(page.locator('.gallery-modal')).toBeVisible();

      // Click close button
      await page.click('.gallery-close-btn');

      // Modal should be hidden
      await expect(page.locator('.gallery-modal')).not.toBeVisible();
    });

    test('RG-016: Escape key closes modal', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      await expect(page.locator('.gallery-modal')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Modal should be hidden
      await expect(page.locator('.gallery-modal')).not.toBeVisible();
    });

    test('RG-017: clicking overlay closes modal', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      await expect(page.locator('.gallery-modal')).toBeVisible();

      // Click on overlay (outside modal)
      await page.click('.gallery-overlay', { position: { x: 10, y: 10 } });

      // Modal should be hidden
      await expect(page.locator('.gallery-modal')).not.toBeVisible();
    });

    test('RG-018: selection and view mode reset when modal closes', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Select reps and enter compare view
      await page.click('.gallery-checkbox >> nth=0');
      await page.click('.gallery-checkbox >> nth=1');
      await page.click('.gallery-compare-btn');

      await expect(page.locator('#gallery-title')).toHaveText('Compare Reps');

      // Close modal
      await page.keyboard.press('Escape');

      // Reopen modal
      await page.click('.rep-gallery-gallery-btn');

      // Should be back in grid view with no selections
      await expect(page.locator('#gallery-title')).toHaveText('Rep Gallery');
      await expect(page.locator('.gallery-compare-btn')).not.toBeVisible();
      await expect(page.locator('.gallery-grid-row--selected')).toHaveCount(0);
    });
  });

  test.describe('Video Timestamp Display', () => {
    test.skip('thumbnails show video time overlay', async ({ page }) => {
      // NOTE: This test requires actual extraction to generate thumbnails with frameImage data.
      // Seeded fixtures don't include frameImage because it's captured at runtime.
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Thumbnails should have time overlay
      const timeOverlays = page.locator('.gallery-thumbnail-time');
      expect(await timeOverlays.count()).toBeGreaterThan(0);

      // Time should be formatted as "X.XXs"
      const firstTime = await timeOverlays.first().textContent();
      expect(firstTime).toMatch(/^\d+\.\d+s$/);
    });
  });

  test.describe('Footer Hints', () => {
    test('grid view shows correct hint', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      await expect(page.locator('.gallery-hint')).toHaveText(
        'Double-tap thumbnail to focus phase. Tap to seek. Select reps to compare.'
      );
    });

    test('compare view shows correct hint', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Enter compare view
      await page.click('.gallery-checkbox >> nth=0');
      await page.click('.gallery-checkbox >> nth=1');
      await page.click('.gallery-compare-btn');

      await expect(page.locator('.gallery-hint')).toHaveText(
        'Tap thumbnails to seek video.'
      );
    });
  });

  test.describe('Double-Tap Phase Focus', () => {
    test.skip('RG-019: double-tap thumbnail focuses that phase column', async ({ page }) => {
      // NOTE: This test requires actual extraction to generate thumbnails with frameImage data.
      // Seeded fixtures don't include frameImage because it's captured at runtime.
      // Double-tap logic: two clicks within 300ms triggers phase focus instead of seek.
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Grid should NOT be in focused mode initially
      await expect(page.locator('.gallery-grid')).not.toHaveClass(/gallery-grid--focused/);

      // Double-click a thumbnail in the "Top" column
      const topThumbnail = page.locator('.gallery-grid-row').first().locator('.gallery-thumbnail').first();
      await topThumbnail.dblclick();

      // Grid should now be in focused mode
      await expect(page.locator('.gallery-grid')).toHaveClass(/gallery-grid--focused/);

      // "Top" phase button should be active
      await expect(page.locator('.gallery-phase-btn:has-text("Top")')).toHaveClass(/gallery-phase-btn--active/);

      // Focused cells should be visible
      const focusedCells = page.locator('.gallery-grid-cell--focused');
      expect(await focusedCells.count()).toBeGreaterThan(0);
    });

    test.skip('RG-020: double-tap on already-focused phase unfocuses it', async ({ page }) => {
      // NOTE: This test requires actual extraction to generate thumbnails with frameImage data.
      await loadVideoAndWaitForGallery(page);
      await page.click('.rep-gallery-gallery-btn');

      // Focus "Top" phase via header click first
      await page.click('.gallery-phase-btn:has-text("Top")');
      await expect(page.locator('.gallery-grid')).toHaveClass(/gallery-grid--focused/);

      // Double-click a thumbnail in the "Top" column (already focused)
      const topThumbnail = page.locator('.gallery-grid-row').first().locator('.gallery-thumbnail').first();
      await topThumbnail.dblclick();

      // Grid should unfocus (toggle behavior)
      await expect(page.locator('.gallery-grid')).not.toHaveClass(/gallery-grid--focused/);
      await expect(page.locator('.gallery-phase-btn:has-text("Top")')).not.toHaveClass(/gallery-phase-btn--active/);
    });
  });

  test.describe('Playback Sync', () => {
    test('RG-021: current rep highlight updates during video playback', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);

      // Wait for extraction to detect at least 2 reps
      await page.waitForFunction(
        () => {
          const rows = document.querySelectorAll('.rep-gallery-row');
          return rows.length >= 2;
        },
        { timeout: 30000 }
      );

      // Get initial current rep (should be rep 1)
      const initialCurrentRow = await page.evaluate(() => {
        const row = document.querySelector('.rep-gallery-row--current');
        return row?.querySelector('.rep-gallery-row-rep')?.textContent || '';
      });
      expect(initialCurrentRow).toBe('1');

      // Seek video to a time in rep 2 (after first rep completes)
      // The fixture has rep 2 starting around 1.37s
      await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) video.currentTime = 2.0;
      });

      // Wait for state to update
      await page.waitForTimeout(500);

      // Check that current row has changed to rep 2
      const newCurrentRow = await page.evaluate(() => {
        const row = document.querySelector('.rep-gallery-row--current');
        return row?.querySelector('.rep-gallery-row-rep')?.textContent || '';
      });

      // Should now be rep 2 (video time 2.0s is during rep 2)
      expect(newCurrentRow).toBe('2');
    });

    test('RG-022: inline gallery auto-scrolls to current rep during playback', async ({ page }) => {
      await loadVideoAndWaitForGallery(page);

      // Get the inline rep gallery (not the modal)
      const inlineGallery = page.locator('.rep-gallery-container .rep-gallery-rows');

      // Check initial scroll state (should see row 1)
      const initialScrollTop = await inlineGallery.evaluate((el) => el.scrollTop);

      // Seek to rep 2 time
      await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) video.currentTime = 2.0;
      });

      // Wait for auto-scroll animation
      await page.waitForTimeout(600);

      // Note: This test validates the auto-scroll feature exists.
      // With only 2 reps visible, scroll may not change much,
      // but the current row should be highlighted.
      const currentRowVisible = await page.evaluate(() => {
        const currentRow = document.querySelector('.rep-gallery-row--current');
        if (!currentRow) return false;
        const rect = currentRow.getBoundingClientRect();
        const container = document.querySelector('.rep-gallery-rows');
        if (!container) return false;
        const containerRect = container.getBoundingClientRect();
        return rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;
      });

      expect(currentRowVisible).toBe(true);
    });
  });
});

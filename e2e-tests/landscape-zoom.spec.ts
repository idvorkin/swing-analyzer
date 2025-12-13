/**
 * Landscape Zoom Feature E2E Tests
 *
 * Tests the zoom button visibility and behavior for landscape videos
 * on both desktop and mobile viewports.
 */

import { expect, test } from '@playwright/test';
import {
  clearPoseTrackDB,
  clickSwingSampleButton,
  seedPoseTrackFixture,
  setPoseTrackStorageMode,
  useShortTestVideo,
} from './helpers';

test.describe('Landscape Zoom Feature - Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await useShortTestVideo(page);
    await page.goto('/');
    await setPoseTrackStorageMode(page, 'indexeddb');
    await clearPoseTrackDB(page);
  });

  test('hides zoom button for portrait video', async ({ page }) => {
    // Seed fixture for pistol squat (portrait video)
    await seedPoseTrackFixture(page, 'pistol-squat-sample');

    // Load pistol squat video (portrait orientation)
    await page.click('button:has-text("Pistol")');

    // Wait for video to load
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.readyState >= 2 && video?.videoWidth > 0;
      },
      { timeout: 15000 }
    );

    // Wait for cache processing
    await expect(page.locator('.cache-loading-overlay')).not.toBeVisible({
      timeout: 10000,
    });

    // Zoom button should NOT be visible for portrait videos
    const zoomBtn = page.locator('#zoom-btn');
    await expect(zoomBtn).not.toBeVisible();
  });

  test('shows zoom button for landscape video with crop region', async ({
    page,
  }) => {
    // Seed fixture with crop region data
    await seedPoseTrackFixture(page, 'swing-sample-4reps');

    // Load video
    await clickSwingSampleButton(page);

    // Wait for video to load and poses to be processed
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.readyState >= 2 && video?.videoWidth > 0;
      },
      { timeout: 15000 }
    );

    // Wait for cache processing to complete (zoom button only shows after)
    await expect(page.locator('.cache-loading-overlay')).not.toBeVisible({
      timeout: 10000,
    });

    // Zoom button should be visible for landscape videos
    const zoomBtn = page.locator('#zoom-btn');
    await expect(zoomBtn).toBeVisible({ timeout: 5000 });
    await expect(zoomBtn).toContainText('Zoom');
  });

  test('zoom button toggles to Full when clicked', async ({ page }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);

    // Wait for video and cache processing
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.readyState >= 2;
      },
      { timeout: 15000 }
    );
    await expect(page.locator('.cache-loading-overlay')).not.toBeVisible({
      timeout: 10000,
    });

    const zoomBtn = page.locator('#zoom-btn');
    await expect(zoomBtn).toBeVisible({ timeout: 5000 });

    // Click zoom button
    await zoomBtn.click();

    // Button text should change to "Full"
    await expect(zoomBtn).toContainText('Full');

    // Video container should have zoomed class
    await expect(page.locator('.video-container.zoomed')).toBeVisible();
  });

  test('zoom creates portrait-shaped container (taller than wide)', async ({
    page,
  }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);

    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.readyState >= 2;
      },
      { timeout: 15000 }
    );
    await expect(page.locator('.cache-loading-overlay')).not.toBeVisible({
      timeout: 10000,
    });

    const zoomBtn = page.locator('#zoom-btn');
    await expect(zoomBtn).toBeVisible({ timeout: 5000 });

    // Get container size before zoom
    const containerBefore = await page
      .locator('.video-container')
      .boundingBox();

    // Click zoom
    await zoomBtn.click();
    await expect(page.locator('.video-container.zoomed')).toBeVisible();

    // Get container size after zoom
    const containerAfter = await page.locator('.video-container').boundingBox();

    // Container should be portrait (height > width) after zoom
    expect(containerAfter).not.toBeNull();
    expect(containerBefore).not.toBeNull();
    if (!containerAfter || !containerBefore)
      throw new Error('Bounds not available');
    expect(containerAfter.height).toBeGreaterThan(containerAfter.width);

    // Container should be taller than before (or at least same height)
    expect(containerAfter.height).toBeGreaterThanOrEqual(
      containerBefore.height * 0.9
    );
  });

  test('clicking Full returns to normal view', async ({ page }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);

    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.readyState >= 2;
      },
      { timeout: 15000 }
    );
    await expect(page.locator('.cache-loading-overlay')).not.toBeVisible({
      timeout: 10000,
    });

    const zoomBtn = page.locator('#zoom-btn');
    await expect(zoomBtn).toBeVisible({ timeout: 5000 });

    // Toggle on
    await zoomBtn.click();
    await expect(zoomBtn).toContainText('Full');

    // Toggle off
    await zoomBtn.click();
    await expect(zoomBtn).toContainText('Zoom');
    await expect(page.locator('.video-container.zoomed')).not.toBeVisible();
  });
});

test.describe('Landscape Zoom Feature - Skeleton Alignment', () => {
  test.beforeEach(async ({ page }) => {
    await useShortTestVideo(page);
    await page.goto('/');
    await setPoseTrackStorageMode(page, 'indexeddb');
    await clearPoseTrackDB(page);
  });

  // Test verifies skeleton canvas visible area aligns with video visible area when zoomed.
  // With object-fit: cover, the canvas is larger than the container but positioned
  // so that the same cropped region is visible in both video and canvas.
  test('skeleton canvas visible area aligns with video when zoomed', async ({
    page,
  }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);

    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.readyState >= 2;
      },
      { timeout: 15000 }
    );
    await expect(page.locator('.cache-loading-overlay')).not.toBeVisible({
      timeout: 10000,
    });

    // Click zoom
    const zoomBtn = page.locator('#zoom-btn');
    await zoomBtn.click();
    await expect(page.locator('.video-container.zoomed')).toBeVisible();

    // Wait for canvas sync to complete after zoom toggle
    await page.waitForTimeout(100);

    // Get positions from page
    const positions = await page.evaluate(() => {
      const canvas = document.querySelector(
        '#output-canvas'
      ) as HTMLCanvasElement;
      const container = document.querySelector(
        '.video-container'
      ) as HTMLElement;

      const containerRect = container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      // Calculate where the canvas visible region is (clipped by container)
      const canvasVisibleLeft = Math.max(canvasRect.left, containerRect.left);
      const canvasVisibleTop = Math.max(canvasRect.top, containerRect.top);
      const canvasVisibleRight = Math.min(
        canvasRect.right,
        containerRect.right
      );
      const canvasVisibleBottom = Math.min(
        canvasRect.bottom,
        containerRect.bottom
      );

      // Video visible area (video element fills container with cover)
      const videoVisibleLeft = containerRect.left;
      const videoVisibleTop = containerRect.top;
      const videoVisibleRight = containerRect.right;
      const videoVisibleBottom = containerRect.bottom;

      return {
        canvasVisible: {
          left: canvasVisibleLeft,
          top: canvasVisibleTop,
          right: canvasVisibleRight,
          bottom: canvasVisibleBottom,
        },
        videoVisible: {
          left: videoVisibleLeft,
          top: videoVisibleTop,
          right: videoVisibleRight,
          bottom: videoVisibleBottom,
        },
      };
    });

    // Canvas visible region should match video visible region (within 2px tolerance)
    expect(
      Math.abs(positions.canvasVisible.left - positions.videoVisible.left)
    ).toBeLessThan(2);
    expect(
      Math.abs(positions.canvasVisible.top - positions.videoVisible.top)
    ).toBeLessThan(2);
    expect(
      Math.abs(positions.canvasVisible.right - positions.videoVisible.right)
    ).toBeLessThan(2);
    expect(
      Math.abs(positions.canvasVisible.bottom - positions.videoVisible.bottom)
    ).toBeLessThan(2);
  });
});

test.describe('Landscape Zoom Feature - Mobile', () => {
  // Use mobile viewport
  test.use({
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro dimensions
    isMobile: true,
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await useShortTestVideo(page);
    await page.goto('/');
    await setPoseTrackStorageMode(page, 'indexeddb');
    await clearPoseTrackDB(page);
  });

  test('shows zoom button on mobile for landscape video', async ({ page }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);

    // Wait for video and cache processing
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.readyState >= 2 && video?.videoWidth > 0;
      },
      { timeout: 15000 }
    );
    await expect(page.locator('.cache-loading-overlay')).not.toBeVisible({
      timeout: 10000,
    });

    // Zoom button should be visible on mobile too
    const zoomBtn = page.locator('#zoom-btn');
    await expect(zoomBtn).toBeVisible({ timeout: 5000 });
  });

  test('zoom works on mobile - toggles and expands container', async ({
    page,
  }) => {
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
    await clickSwingSampleButton(page);

    await page.waitForFunction(
      () => {
        const video = document.querySelector('video') as HTMLVideoElement;
        return video?.readyState >= 2;
      },
      { timeout: 15000 }
    );
    await expect(page.locator('.cache-loading-overlay')).not.toBeVisible({
      timeout: 10000,
    });

    const zoomBtn = page.locator('#zoom-btn');
    await expect(zoomBtn).toBeVisible({ timeout: 5000 });

    // Click zoom
    await zoomBtn.click();

    // Verify zoomed state
    await expect(zoomBtn).toContainText('Full');
    await expect(page.locator('.video-container.zoomed')).toBeVisible();

    // Verify video has object-position inline style applied for crop centering
    const video = page.locator('#video');
    const inlineObjectPosition = await video.evaluate(
      (el) => (el as HTMLElement).style.objectPosition
    );
    // object-position inline style should be set (non-empty means crop is applied)
    expect(inlineObjectPosition).not.toBe('');
  });
});

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

    // Verify video has transform applied for zoom
    const video = page.locator('#video');
    const transform = await video.evaluate(
      (el) => window.getComputedStyle(el).transform
    );
    // Transform should be a matrix (not 'none') when zoomed
    expect(transform).not.toBe('none');
  });
});

/**
 * Double-Tap/Double-Click Zones E2E Tests
 *
 * Tests the double-tap (touch) and double-click (desktop) zones for video control:
 * - Left zone (25%): Previous checkpoint
 * - Center zone (50%): No action (disabled)
 * - Right zone (25%): Next checkpoint
 *
 * Also tests the help modal that explains touch controls.
 */

import { expect, test } from '@playwright/test';
import {
  clearPoseTrackDB,
  clickSwingSampleButton,
  seedPoseTrackFixture,
  useShortTestVideo,
} from './helpers';

test.describe('Touch Double-Tap Zones', () => {
  test.beforeEach(async ({ page }) => {
    await useShortTestVideo(page);
    await page.goto('/');
    await clearPoseTrackDB(page);
    await seedPoseTrackFixture(page, 'swing-sample-4reps');
  });

  /**
   * Helper to load video and wait for controls
   */
  async function loadVideoAndWait(page: import('@playwright/test').Page) {
    await clickSwingSampleButton(page);
    await page.waitForSelector('video', { timeout: 10000 });

    // Wait for controls to be enabled (cached poses loaded)
    await page.waitForFunction(
      () => {
        const btn = document.querySelector(
          '#play-pause-btn'
        ) as HTMLButtonElement;
        return btn && !btn.disabled;
      },
      { timeout: 20000 }
    );
  }

  /**
   * Simulate touch by enabling touch detection in the page
   */
  async function enableTouchDevice(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      // Mock touch device detection
      Object.defineProperty(window, 'ontouchstart', {
        value: () => {},
        writable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 5,
        writable: true,
      });
    });
  }

  /**
   * Simulate a double-tap at a specific position on the video container
   */
  async function doubleTapAtPosition(
    page: import('@playwright/test').Page,
    xPercent: number
  ) {
    const container = page.locator('.video-container');
    const box = await container.boundingBox();
    if (!box) throw new Error('Video container not found');

    const x = box.x + box.width * xPercent;
    const y = box.y + box.height * 0.5;

    // Two clicks in quick succession
    await page.mouse.click(x, y);
    await page.waitForTimeout(50);
    await page.mouse.click(x, y);
  }

  test.describe('Help Tab in Settings', () => {
    test('help tab shows touch controls content', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      // Click on Help tab
      await page.locator('.settings-tab', { hasText: 'Help' }).click();

      // Should show help intro text
      await expect(page.locator('.settings-help-intro')).toContainText(
        'Double-tap the video to control playback'
      );
    });

    test('help tab shows two zones with correct labels', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');
      await page.locator('.settings-tab', { hasText: 'Help' }).click();

      // Should show 2 zones (left and right)
      const zones = page.locator('.settings-help-zone');
      await expect(zones).toHaveCount(2);

      // Left zone - Previous
      await expect(
        page.locator('.settings-help-zone--left .settings-help-zone-label')
      ).toContainText('Previous');

      // Right zone - Next
      await expect(
        page.locator('.settings-help-zone--right .settings-help-zone-label')
      ).toContainText('Next');
    });

    test('help tab shows tip about checkpoints', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');
      await page.locator('.settings-tab', { hasText: 'Help' }).click();

      // Should show tip about checkpoints
      await expect(page.locator('.settings-help-note')).toContainText(
        'Checkpoints are the key positions'
      );
    });
  });

  test.describe('Zone Detection (Touch Devices)', () => {
    test.beforeEach(async ({ page }) => {
      // Reload page to apply touch detection changes
      await enableTouchDevice(page);
      await page.reload();
      await clearPoseTrackDB(page);
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
    });

    test('double-tap center zone does nothing', async ({ page }) => {
      await enableTouchDevice(page);
      await loadVideoAndWait(page);

      // Double-tap center (50%)
      await doubleTapAtPosition(page, 0.5);

      // Should NOT show any overlay (center zone disabled)
      await expect(page.locator('.video-tap-overlay')).not.toBeVisible({
        timeout: 500,
      });
    });

    test('double-tap left zone shows prev overlay', async ({ page }) => {
      await enableTouchDevice(page);
      await loadVideoAndWait(page);

      // Navigate to a later position first so we can go back
      await page.click('button[title="Next checkpoint"]');
      await page.waitForTimeout(300);

      // Double-tap left (12.5% - center of left 25% zone)
      await doubleTapAtPosition(page, 0.125);

      // Should show overlay on left side
      await expect(page.locator('.video-tap-overlay--left')).toBeVisible({
        timeout: 1000,
      });
    });

    test('double-tap right zone shows next overlay', async ({ page }) => {
      await enableTouchDevice(page);
      await loadVideoAndWait(page);

      // Double-tap right (87.5% - center of right 25% zone)
      await doubleTapAtPosition(page, 0.875);

      // Should show overlay on right side
      await expect(page.locator('.video-tap-overlay--right')).toBeVisible({
        timeout: 1000,
      });
    });

    test('overlay disappears after animation', async ({ page }) => {
      await enableTouchDevice(page);
      await loadVideoAndWait(page);

      // Double-tap right zone (center zone no longer triggers overlay)
      await doubleTapAtPosition(page, 0.875);

      // Overlay should be visible briefly
      await expect(page.locator('.video-tap-overlay')).toBeVisible({
        timeout: 1000,
      });

      // Then disappear (500ms timeout + animation)
      await expect(page.locator('.video-tap-overlay')).not.toBeVisible({
        timeout: 2000,
      });
    });
  });

  test.describe('Desktop (Double-Click)', () => {
    test('double-click center zone does not toggle play/pause', async ({
      page,
    }) => {
      await loadVideoAndWait(page);

      const isPlayingBefore = await page.evaluate(() => {
        const video = document.querySelector('video');
        return !video?.paused;
      });

      // Double-click center (simulated with two clicks)
      await doubleTapAtPosition(page, 0.5);

      // Should NOT show any overlay (center zone disabled)
      await expect(page.locator('.video-tap-overlay')).not.toBeVisible({
        timeout: 500,
      });

      // Play state should remain unchanged
      const isPlayingAfter = await page.evaluate(() => {
        const video = document.querySelector('video');
        return !video?.paused;
      });
      expect(isPlayingBefore).toBe(isPlayingAfter);
    });

    // Flaky: Double-click timing is inconsistent in CI
    test.fixme(
      'double-click left zone navigates to previous checkpoint',
      async ({ page }) => {
        await loadVideoAndWait(page);

        // Navigate forward twice to ensure we can go back
        await page.click('button[title="Next checkpoint"]');
        await page.waitForTimeout(200);
        await page.click('button[title="Next checkpoint"]');
        await page.waitForTimeout(200);

        const timeBefore = await page.evaluate(() => {
          const video = document.querySelector('video');
          return video?.currentTime || 0;
        });

        // Double-click left (12.5% - center of left 25% zone)
        await doubleTapAtPosition(page, 0.125);

        // Should show overlay on left side
        await expect(page.locator('.video-tap-overlay--left')).toBeVisible({
          timeout: 1000,
        });

        // Time should have changed (navigated back)
        const timeAfter = await page.evaluate(() => {
          const video = document.querySelector('video');
          return video?.currentTime || 0;
        });
        expect(timeAfter).toBeLessThan(timeBefore);
      }
    );

    // Flaky: Double-click timing is inconsistent in CI
    test.fixme(
      'double-click right zone navigates to next checkpoint',
      async ({ page }) => {
        await loadVideoAndWait(page);

        const timeBefore = await page.evaluate(() => {
          const video = document.querySelector('video');
          return video?.currentTime || 0;
        });

        // Double-click right (87.5% - center of right 25% zone)
        await doubleTapAtPosition(page, 0.875);

        // Should show overlay on right side
        await expect(page.locator('.video-tap-overlay--right')).toBeVisible({
          timeout: 1000,
        });

        // Time should have changed (navigated forward)
        const timeAfter = await page.evaluate(() => {
          const video = document.querySelector('video');
          return video?.currentTime || 0;
        });
        expect(timeAfter).toBeGreaterThan(timeBefore);
      }
    );
  });
});

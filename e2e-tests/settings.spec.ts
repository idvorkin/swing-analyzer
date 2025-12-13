/**
 * Settings Modal E2E Tests
 *
 * Tests the settings modal functionality including:
 * - Opening/closing the modal
 * - Tab navigation (Settings, Developer, About)
 * - Display mode settings (segmented control)
 * - BlazePose variant selection (segmented control)
 * - Developer tab with download button
 */

import { expect, test } from '@playwright/test';
import {
  clearPoseTrackDB,
  clickSwingSampleButton,
  seedPoseTrackFixture,
  useShortTestVideo,
} from './helpers';

test.describe('Settings Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Modal Open/Close', () => {
    test('should open settings when clicking settings button', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      await expect(page.locator('.settings-modal')).toBeVisible();
      await expect(page.locator('.settings-title')).toContainText('Settings');
    });

    test('should close settings when clicking close button', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      await page.click('button[aria-label="Close settings"]');

      await expect(page.locator('.settings-modal')).not.toBeVisible();
    });

    test('should close settings when pressing Escape', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.locator('.settings-modal')).not.toBeVisible();
    });

    test('should close settings when clicking overlay', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      await page.click('.settings-overlay', { position: { x: 10, y: 10 } });

      await expect(page.locator('.settings-modal')).not.toBeVisible();
    });
  });

  test.describe('Tab Navigation', () => {
    test('should display three tabs: Settings, Help, About', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      const tabs = page.locator('.settings-tab');
      await expect(tabs).toHaveCount(3);

      await expect(page.locator('.settings-tab-label').nth(0)).toContainText(
        'Settings'
      );
      await expect(page.locator('.settings-tab-label').nth(1)).toContainText(
        'Help'
      );
      await expect(page.locator('.settings-tab-label').nth(2)).toContainText(
        'About'
      );
    });

    test('should start on Settings tab', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      const settingsTab = page.locator('.settings-tab').first();
      await expect(settingsTab).toHaveClass(/settings-tab--active/);
    });
  });

  test.describe('Settings Tab', () => {
    test('should show display mode options', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      // Segmented control with Both, Video, Skeleton options
      await expect(
        page.locator('.segmented-control-option', { hasText: 'Both' })
      ).toBeVisible();
      await expect(
        page.locator('.segmented-control-option', { hasText: 'Video' })
      ).toBeVisible();
      await expect(
        page.locator('.segmented-control-option', { hasText: 'Skeleton' })
      ).toBeVisible();
    });

    test('should show BlazePose variant options', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      // Segmented control with Lite, Full, Heavy options
      await expect(
        page.locator('.segmented-control-option', { hasText: 'Lite' })
      ).toBeVisible();
      await expect(
        page.locator('.segmented-control-option', { hasText: 'Full' })
      ).toBeVisible();
      await expect(
        page.locator('.segmented-control-option', { hasText: 'Heavy' })
      ).toBeVisible();
    });

    test('should persist display mode selection', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      // Click Video option in segmented control
      await page
        .locator('.segmented-control-option', { hasText: 'Video' })
        .click();

      await page.click('button[aria-label="Close settings"]');
      await expect(page.locator('.settings-modal')).not.toBeVisible();

      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      // Video button should be active
      await expect(
        page.locator('.segmented-control-option', { hasText: 'Video' })
      ).toHaveClass(/segmented-control-option--active/);
    });

    test('should show reload banner when changing BlazePose variant', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      // Check if Lite is active, click Full; otherwise click Lite
      const liteBtn = page.locator('.segmented-control-option', {
        hasText: 'Lite',
      });
      const fullBtn = page.locator('.segmented-control-option', {
        hasText: 'Full',
      });

      const isLiteActive = await liteBtn.evaluate((el) =>
        el.classList.contains('segmented-control-option--active')
      );

      if (isLiteActive) {
        await fullBtn.click();
      } else {
        await liteBtn.click();
      }

      await expect(page.locator('.settings-reload-banner')).toBeVisible();
      await expect(page.locator('.settings-reload-text')).toContainText(
        'Reload'
      );
    });
  });

  test.describe('Settings Tab - Developer Section', () => {
    test('should show download button', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      // Settings tab is already active by default
      await expect(page.locator('.settings-tab').nth(0)).toHaveClass(
        /settings-tab--active/
      );
      await expect(
        page.locator('.settings-action-btn', { hasText: 'Download Log' })
      ).toBeVisible();
    });

    test('should show session stats', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      // Stats row shows duration, clicks, snaps (in Settings tab)
      await expect(page.locator('.settings-stats-row')).toBeVisible();
    });

    test('should show Download Poses button', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      await expect(
        page.locator('.settings-action-btn', { hasText: 'Download Poses' })
      ).toBeVisible();
    });

    test('Download Poses button should be disabled when no video loaded', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      const downloadPosesBtn = page.locator('.settings-action-btn', {
        hasText: 'Download Poses',
      });
      await expect(downloadPosesBtn).toBeVisible();
      await expect(downloadPosesBtn).toBeDisabled();
      await expect(downloadPosesBtn).toHaveAttribute(
        'title',
        'Load a video first'
      );
    });

    test('Download Poses button should be enabled after loading video with poses', async ({
      page,
    }) => {
      // Intercept GitHub video and serve local short video
      await useShortTestVideo(page);

      // Navigate and clear/seed data
      await page.goto('/');
      await clearPoseTrackDB(page);
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Load the video
      await clickSwingSampleButton(page);

      // Wait for video to load
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video?.src?.startsWith('blob:');
        },
        { timeout: 15000 }
      );

      // Wait for pose track to be available (cache lookup)
      await page.waitForFunction(
        () => {
          const debug = (window as any).swingDebug;
          return debug?.getPoseTrack() !== null;
        },
        { timeout: 15000 }
      );

      // Open settings (Settings tab is active by default, developer section is there)
      await page.click('button[aria-label="Open settings"]');

      const downloadPosesBtn = page.locator('.settings-action-btn', {
        hasText: 'Download Poses',
      });
      await expect(downloadPosesBtn).toBeVisible();
      await expect(downloadPosesBtn).toBeEnabled();
      await expect(downloadPosesBtn).toHaveAttribute(
        'title',
        'Download extracted pose data'
      );
    });

    test('Download Poses should download valid JSON file', async ({ page }) => {
      // Intercept GitHub video and serve local short video
      await useShortTestVideo(page);

      // Navigate and clear/seed data
      await page.goto('/');
      await clearPoseTrackDB(page);
      await seedPoseTrackFixture(page, 'swing-sample-4reps');
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Load the video
      await clickSwingSampleButton(page);

      // Wait for video to load
      await page.waitForFunction(
        () => {
          const video = document.querySelector('video') as HTMLVideoElement;
          return video?.src?.startsWith('blob:');
        },
        { timeout: 15000 }
      );

      // Wait for pose track to be available (cache lookup)
      await page.waitForFunction(
        () => {
          const debug = (window as any).swingDebug;
          return debug?.getPoseTrack() !== null;
        },
        { timeout: 15000 }
      );

      // Get pose track via swingDebug API
      const poseTrack = await page.evaluate(() => {
        return (window as any).swingDebug.getPoseTrack();
      });

      // Verify pose track data structure
      expect(poseTrack).not.toBeNull();
      expect(poseTrack.metadata).toBeDefined();
      expect(poseTrack.metadata.sourceVideoHash).toBeDefined();
      expect(poseTrack.frames).toBeDefined();
      expect(poseTrack.frames.length).toBeGreaterThan(0);

      // Test the download function returns a filename (async, returns gzipped file)
      const filename = await page.evaluate(async () => {
        return await (window as any).swingDebug.downloadPoseTrack();
      });
      expect(filename).toMatch(/\.posetrack\.json\.gz$/);
    });

    test('swingDebug.downloadPoseTrack should return null when no video loaded', async ({
      page,
    }) => {
      const result = await page.evaluate(async () => {
        return await (window as any).swingDebug.downloadPoseTrack();
      });
      expect(result).toBeNull();
    });
  });

  test.describe('About Tab', () => {
    test('should show version info', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      await page.locator('.settings-tab').nth(2).click();

      await expect(page.locator('.settings-tab').nth(2)).toHaveClass(
        /settings-tab--active/
      );
      // Version row with label
      await expect(page.locator('.settings-info-label').first()).toContainText(
        'Version'
      );
    });
  });
});

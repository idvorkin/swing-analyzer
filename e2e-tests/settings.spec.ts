/**
 * Settings Modal E2E Tests
 *
 * Tests the settings modal functionality including:
 * - Opening/closing the modal
 * - Tab navigation (Settings, Developer, About)
 * - Display mode settings (segmented control)
 * - BlazePose variant selection (segmented control)
 * - Developer tab with debug and download buttons
 */

import { expect, test } from '@playwright/test';

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
    test('should display three tabs: Settings, Developer, About', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      const tabs = page.locator('.settings-tab');
      await expect(tabs).toHaveCount(3);

      await expect(page.locator('.settings-tab-label').nth(0)).toContainText(
        'Settings'
      );
      await expect(page.locator('.settings-tab-label').nth(1)).toContainText(
        'Developer'
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
      await expect(page.locator('.segmented-control-option', { hasText: 'Both' })).toBeVisible();
      await expect(page.locator('.segmented-control-option', { hasText: 'Video' })).toBeVisible();
      await expect(page.locator('.segmented-control-option', { hasText: 'Skeleton' })).toBeVisible();
    });

    test('should show BlazePose variant options', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      // Segmented control with Lite, Full, Heavy options
      await expect(page.locator('.segmented-control-option', { hasText: 'Lite' })).toBeVisible();
      await expect(page.locator('.segmented-control-option', { hasText: 'Full' })).toBeVisible();
      await expect(page.locator('.segmented-control-option', { hasText: 'Heavy' })).toBeVisible();
    });

    test('should persist display mode selection', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      // Click Video option in segmented control
      await page.locator('.segmented-control-option', { hasText: 'Video' }).click();

      await page.click('button[aria-label="Close settings"]');
      await expect(page.locator('.settings-modal')).not.toBeVisible();

      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      // Video button should be active
      await expect(page.locator('.segmented-control-option', { hasText: 'Video' })).toHaveClass(/segmented-control-option--active/);
    });

    test('should show reload banner when changing BlazePose variant', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      // Check if Lite is active, click Full; otherwise click Lite
      const liteBtn = page.locator('.segmented-control-option', { hasText: 'Lite' });
      const fullBtn = page.locator('.segmented-control-option', { hasText: 'Full' });

      const isLiteActive = await liteBtn.evaluate(el => el.classList.contains('segmented-control-option--active'));

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

  test.describe('Developer Tab', () => {
    test('should show debug and download buttons', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      await page.locator('.settings-tab').nth(1).click();

      await expect(page.locator('.settings-tab').nth(1)).toHaveClass(
        /settings-tab--active/
      );
      await expect(page.locator('.settings-action-btn', { hasText: 'Debug' })).toBeVisible();
      await expect(page.locator('.settings-action-btn', { hasText: 'Download Log' })).toBeVisible();
    });

    test('should show session stats', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      await page.locator('.settings-tab').nth(1).click();

      // Stats row shows duration, clicks, snaps
      await expect(page.locator('.settings-stats-row')).toBeVisible();
    });

    test('should navigate to debug page when clicking debug link', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      await page.locator('.settings-tab').nth(1).click();

      await page.locator('.settings-action-btn', { hasText: 'Debug' }).click();

      await expect(page).toHaveURL(/\/debug/);
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

test.describe('Debug Page', () => {
  test('should load debug page', async ({ page }) => {
    await page.goto('/debug');

    await expect(
      page.getByRole('heading', { name: /Debug MoveNet Loader/ })
    ).toBeVisible();
  });

  test('should have back link to main app', async ({ page }) => {
    await page.goto('/debug');

    const backLink = page.getByRole('link', { name: 'Back to Main App' });
    await expect(backLink).toBeVisible();

    await backLink.click();

    await expect(page).toHaveURL('/');
  });
});

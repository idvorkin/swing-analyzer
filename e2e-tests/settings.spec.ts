/**
 * Settings Modal E2E Tests
 *
 * Tests the settings modal functionality including:
 * - Opening/closing the modal
 * - Tab navigation (Settings, Developer, About)
 * - Display mode settings
 * - Pose model selection
 * - BlazePose variant selection
 * - Developer tab with session recording
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

      await expect(page.locator('input[value="both"]')).toBeVisible();
      await expect(page.locator('input[value="video"]')).toBeVisible();
      await expect(page.locator('input[value="overlay"]')).toBeVisible();
    });

    test('should show pose model options', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      await expect(page.locator('input[value="movenet"]')).toBeVisible();
      await expect(page.locator('input[value="blazepose"]')).toBeVisible();
    });

    test('should show BlazePose variant options when BlazePose selected', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      await page.click('input[value="blazepose"]');

      await expect(page.locator('input[value="lite"]')).toBeVisible();
      await expect(page.locator('input[value="full"]')).toBeVisible();
      await expect(page.locator('input[value="heavy"]')).toBeVisible();
    });

    test('should hide BlazePose variants when MoveNet selected', async ({
      page,
    }) => {
      await page.evaluate(() => {
        localStorage.setItem('swing-analyzer-pose-model', 'blazepose');
      });
      await page.reload();

      await page.click('button[aria-label="Open settings"]');

      await expect(page.locator('input[value="lite"]')).toBeVisible();

      await page.click('input[value="movenet"]');

      await expect(page.locator('input[value="lite"]')).not.toBeVisible();
    });

    test('should persist display mode selection', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      await page.click('input[value="video"]');

      await page.click('button[aria-label="Close settings"]');
      await expect(page.locator('.settings-modal')).not.toBeVisible();

      await page.click('button[aria-label="Open settings"]');
      await expect(page.locator('.settings-modal')).toBeVisible();

      await expect(page.locator('input[value="video"]')).toBeChecked();
    });

    test('should show reload banner when changing pose model', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      const isMovenet = await page.locator('input[value="movenet"]').isChecked();

      if (isMovenet) {
        await page.click('input[value="blazepose"]');
      } else {
        await page.click('input[value="movenet"]');
      }

      await expect(page.locator('.settings-reload-banner')).toBeVisible();
      await expect(page.locator('.settings-reload-text')).toContainText(
        'Reload required'
      );
    });
  });

  test.describe('Developer Tab', () => {
    test('should show session recording section', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      await page.locator('.settings-tab').nth(1).click();

      await expect(page.locator('.settings-tab').nth(1)).toHaveClass(
        /settings-tab--active/
      );
      await expect(
        page.getByText('Session Recording', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Download Session Recording/ })
      ).toBeVisible();
    });

    test('should have debug tools link', async ({ page }) => {
      await page.click('button[aria-label="Open settings"]');

      await page.locator('.settings-tab').nth(1).click();

      const debugLink = page.locator('.settings-link');
      await expect(debugLink).toBeVisible();
      await expect(debugLink).toContainText('Debug Model Loader');
    });

    test('should navigate to debug page when clicking debug link', async ({
      page,
    }) => {
      await page.click('button[aria-label="Open settings"]');

      await page.locator('.settings-tab').nth(1).click();

      await page.click('.settings-link');

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
      await expect(page.locator('.settings-about-title')).toContainText(
        'Swing Analyzer'
      );
      await expect(
        page.locator('.settings-version-label').first()
      ).toContainText('Version');
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

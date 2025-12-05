/**
 * Settings Modal E2E Tests
 *
 * Tests the settings modal functionality including:
 * - Opening/closing the modal
 * - Tab navigation (General, Analysis, Developer, About)
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

  test('should open settings when clicking settings button', async ({
    page,
  }) => {
    // Click the settings button
    await page.click('button[aria-label="Open settings"]');

    // Modal should be visible
    await expect(page.locator('.settings-modal')).toBeVisible();
    await expect(page.locator('.settings-title')).toContainText('Settings');
  });

  test('should close settings when clicking close button', async ({ page }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');
    await expect(page.locator('.settings-modal')).toBeVisible();

    // Close settings
    await page.click('button[aria-label="Close settings"]');

    // Modal should be hidden
    await expect(page.locator('.settings-modal')).not.toBeVisible();
  });

  test('should close settings when pressing Escape', async ({ page }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');
    await expect(page.locator('.settings-modal')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should be hidden
    await expect(page.locator('.settings-modal')).not.toBeVisible();
  });

  test('should close settings when clicking overlay', async ({ page }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');
    await expect(page.locator('.settings-modal')).toBeVisible();

    // Click overlay (outside modal)
    await page.click('.settings-overlay', { position: { x: 10, y: 10 } });

    // Modal should be hidden
    await expect(page.locator('.settings-modal')).not.toBeVisible();
  });

  test('should display four tabs: General, Analysis, Developer, About', async ({
    page,
  }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // Check tabs exist
    const tabs = page.locator('.settings-tab');
    await expect(tabs).toHaveCount(4);

    // Check tab labels (visible on desktop)
    await expect(page.locator('.settings-tab-label').nth(0)).toContainText(
      'General'
    );
    await expect(page.locator('.settings-tab-label').nth(1)).toContainText(
      'Analysis'
    );
    await expect(page.locator('.settings-tab-label').nth(2)).toContainText(
      'Developer'
    );
    await expect(page.locator('.settings-tab-label').nth(3)).toContainText(
      'About'
    );
  });

  test('should start on General tab', async ({ page }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // General tab should be active
    const generalTab = page.locator('.settings-tab').first();
    await expect(generalTab).toHaveClass(/settings-tab--active/);

    // Display mode options should be visible
    await expect(page.locator('input[value="both"]')).toBeVisible();
    await expect(page.locator('input[value="video"]')).toBeVisible();
    await expect(page.locator('input[value="overlay"]')).toBeVisible();
  });

  test('should switch to Analysis tab and show pose model options', async ({
    page,
  }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // Click Analysis tab
    await page.locator('.settings-tab').nth(1).click();

    // Analysis tab should be active
    await expect(page.locator('.settings-tab').nth(1)).toHaveClass(
      /settings-tab--active/
    );

    // Pose model options should be visible
    await expect(page.locator('input[value="movenet"]')).toBeVisible();
    await expect(page.locator('input[value="blazepose"]')).toBeVisible();
  });

  test('should show BlazePose variant options when BlazePose selected', async ({
    page,
  }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // Click Analysis tab
    await page.locator('.settings-tab').nth(1).click();

    // Select BlazePose
    await page.click('input[value="blazepose"]');

    // BlazePose variant options should appear
    await expect(page.locator('input[value="lite"]')).toBeVisible();
    await expect(page.locator('input[value="full"]')).toBeVisible();
    await expect(page.locator('input[value="heavy"]')).toBeVisible();
  });

  test('should hide BlazePose variants when MoveNet selected', async ({
    page,
  }) => {
    // Set BlazePose in localStorage first
    await page.evaluate(() => {
      localStorage.setItem('swing-analyzer-pose-model', 'blazepose');
    });
    await page.reload();

    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // Click Analysis tab
    await page.locator('.settings-tab').nth(1).click();

    // BlazePose variants should be visible initially
    await expect(page.locator('input[value="lite"]')).toBeVisible();

    // Select MoveNet
    await page.click('input[value="movenet"]');

    // BlazePose variant options should be hidden
    await expect(page.locator('input[value="lite"]')).not.toBeVisible();
  });

  test('should switch to Developer tab and show session recording', async ({
    page,
  }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // Click Developer tab
    await page.locator('.settings-tab').nth(2).click();

    // Developer tab should be active
    await expect(page.locator('.settings-tab').nth(2)).toHaveClass(
      /settings-tab--active/
    );

    // Session recording section should be visible
    await expect(
      page.getByText('Session Recording', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Download Session Recording/ })
    ).toBeVisible();
  });

  test('should switch to About tab and show version info', async ({ page }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // Click About tab
    await page.locator('.settings-tab').nth(3).click();

    // About tab should be active
    await expect(page.locator('.settings-tab').nth(3)).toHaveClass(
      /settings-tab--active/
    );

    // Version info should be visible
    await expect(page.locator('.settings-about-title')).toContainText(
      'Swing Analyzer'
    );
    await expect(page.locator('.settings-version-label').first()).toContainText(
      'Version'
    );
  });

  test('should have debug tools link in About tab', async ({ page }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // Click About tab
    await page.locator('.settings-tab').nth(3).click();

    // Debug link should be visible
    const debugLink = page.locator('.settings-debug-link');
    await expect(debugLink).toBeVisible();
    await expect(debugLink).toContainText('Debug Tools');
  });

  test('should navigate to debug page when clicking debug link', async ({
    page,
  }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');

    // Click About tab
    await page.locator('.settings-tab').nth(3).click();

    // Click debug link
    await page.click('.settings-debug-link');

    // Should navigate to debug page
    await expect(page).toHaveURL(/\/debug/);
  });

  test('should persist display mode selection', async ({ page }) => {
    // Open settings
    await page.click('button[aria-label="Open settings"]');
    await expect(page.locator('.settings-modal')).toBeVisible();

    // Select "Video Only" mode
    await page.click('input[value="video"]');

    // Close settings using close button and wait for modal to disappear
    await page.click('button[aria-label="Close settings"]');
    await expect(page.locator('.settings-modal')).not.toBeVisible();

    // Reopen settings
    await page.click('button[aria-label="Open settings"]');
    await expect(page.locator('.settings-modal')).toBeVisible();

    // "Video Only" should still be selected
    await expect(page.locator('input[value="video"]')).toBeChecked();
  });

  test('should show reload banner when changing pose model', async ({
    page,
  }) => {
    // Open settings and go to Analysis tab
    await page.click('button[aria-label="Open settings"]');
    await page.locator('.settings-tab').nth(1).click();

    // Get current selection
    const isMovenet = await page.locator('input[value="movenet"]').isChecked();

    // Change to the other model
    if (isMovenet) {
      await page.click('input[value="blazepose"]');
    } else {
      await page.click('input[value="movenet"]');
    }

    // Reload banner should appear
    await expect(page.locator('.settings-reload-banner')).toBeVisible();
    await expect(page.locator('.settings-reload-text')).toContainText(
      'Reload required'
    );
  });
});

test.describe('Debug Page', () => {
  test('should load debug page', async ({ page }) => {
    await page.goto('/debug');

    // Debug page should load - check for the specific debug h1
    await expect(
      page.getByRole('heading', { name: /Debug MoveNet Loader/ })
    ).toBeVisible();
  });

  test('should have back link to main app', async ({ page }) => {
    await page.goto('/debug');

    // Back link should exist
    const backLink = page.getByRole('link', { name: 'Back to Main App' });
    await expect(backLink).toBeVisible();

    // Click back link
    await backLink.click();

    // Should be on main page
    await expect(page).toHaveURL('/');
  });
});

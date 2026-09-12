/**
 * Bug Report Modal E2E Tests
 *
 * Verifies the Escape-key-from-focused-field fix and that the fix does not
 * regress the typing shield or stacked-modal behavior.
 *
 * BugReportModal uses inline styles (no CSS classes), so selectors are
 * role/placeholder/text based, unlike the class-based SettingsModal spec.
 */
import { expect, test } from '@playwright/test';

test.describe('Bug Report Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens via the header Report-a-bug button', async ({ page }) => {
    await page.click('button[aria-label="Report a bug"]');
    await expect(
      page.getByRole('heading', { name: 'Report a Bug' })
    ).toBeVisible();
  });

  test('closes when Escape is pressed while the title input is focused', async ({
    page,
  }) => {
    await page.click('button[aria-label="Report a bug"]');
    const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
    await expect(dialog).toBeVisible();

    const title = page.getByPlaceholder('Brief description of the bug');
    await title.click();
    await expect(title).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
  });

  test('closes when Escape is pressed while the description textarea is focused', async ({
    page,
  }) => {
    await page.click('button[aria-label="Report a bug"]');
    const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
    await expect(dialog).toBeVisible();

    const desc = page.getByPlaceholder('What happened? What did you expect?');
    await desc.click();
    await expect(desc).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
  });

  test('closes when Escape is pressed while the Cancel button is focused', async ({
    page,
  }) => {
    await page.click('button[aria-label="Report a bug"]');
    const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
    await expect(dialog).toBeVisible();

    const cancel = page.getByRole('button', { name: 'Cancel' });
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
  });

  test('typing shield preserved: Space inserts into title and does not reach global shortcuts', async ({
    page,
  }) => {
    await page.click('button[aria-label="Report a bug"]');
    const title = page.getByPlaceholder('Brief description of the bug');
    await title.click();
    await expect(title).toBeFocused();

    // The live app prefills the title with "Bug"; clear it for a deterministic
    // assertion based purely on what we type.
    await title.fill('');

    // Space is intercepted by useKeyboardNavigation (preventDefault) if the
    // shield is broken; with the shield it must type a space into the field.
    await page.keyboard.press('Space');
    await page.keyboard.press('.');
    await page.keyboard.press(',');

    await expect(title).toHaveValue(' .,');
  });

  test('visible dismissal still works: overlay click closes the modal', async ({
    page,
  }) => {
    await page.click('button[aria-label="Report a bug"]');
    const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
    await expect(dialog).toBeVisible();

    // Click in the dim overlay margin (top-left corner) outside the content.
    await dialog.click({ position: { x: 5, y: 5 } });

    await expect(dialog).not.toBeVisible();
  });

  test('visible dismissal still works: clicking inside the content does NOT close', async ({
    page,
  }) => {
    await page.click('button[aria-label="Report a bug"]');
    const dialog = page.getByRole('dialog', { name: 'Report a Bug' });
    await expect(dialog).toBeVisible();

    // Click the heading well inside the content area (not the overlay margin).
    await page.getByRole('heading', { name: 'Report a Bug' }).click();

    await expect(dialog).toBeVisible();
  });

  test('stacking: Escape on the bug modal does not double-close Settings', async ({
    page,
  }) => {
    // Open Settings (high z-index overlay covers the header), then open the
    // bug modal via its window-level Ctrl+I shortcut (works under the overlay).
    await page.click('button[aria-label="Open settings"]');
    await expect(page.locator('.settings-modal')).toBeVisible();

    await page.keyboard.press('Control+i');
    const bugDialog = page.getByRole('dialog', { name: 'Report a Bug' });
    await expect(bugDialog).toBeVisible();

    // Focus the bug title and press Escape — only the bug modal should close.
    const title = page.getByPlaceholder('Brief description of the bug');
    await title.click();
    await expect(title).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(bugDialog).not.toBeVisible();
    // Settings must remain open (no double-close).
    await expect(page.locator('.settings-modal')).toBeVisible();
  });
});

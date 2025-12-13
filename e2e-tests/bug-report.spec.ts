/**
 * Bug Report E2E Tests
 *
 * These tests verify the bug report functionality including
 * device details in the metadata.
 */

import { expect, test } from '@playwright/test';

test.describe('Bug Report', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should include device details in bug report metadata', async ({
    page,
  }) => {
    // Open bug report modal using keyboard shortcut (Ctrl+I)
    await page.keyboard.press('Control+i');

    // Wait for the modal to appear
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Verify the modal title is visible
    await expect(page.locator('#bug-report-title')).toContainText(
      'Report a Bug'
    );

    // The description textarea should be visible
    const descriptionTextarea = page.locator('#bug-description');
    await expect(descriptionTextarea).toBeVisible();

    // Ensure "Include technical details" checkbox is checked
    const metadataCheckbox = page.getByRole('checkbox');
    await expect(metadataCheckbox).toBeChecked();

    // Intercept the window.open call to capture the URL
    let capturedUrl = '';
    await page.evaluate(() => {
      window.open = (url: string | URL | undefined) => {
        // Store the URL in a data attribute on the body for retrieval
        document.body.setAttribute('data-captured-url', String(url));
        return null;
      };
    });

    // Submit the bug report
    const submitButton = page.getByRole('button', {
      name: /Copy & Open GitHub/,
    });
    await submitButton.click();

    // Wait for the success state
    await expect(page.getByText('GitHub opened!')).toBeVisible();

    // Get the captured URL
    capturedUrl = await page.evaluate(() => {
      return document.body.getAttribute('data-captured-url') || '';
    });

    // The URL should be a valid GitHub issue URL
    expect(capturedUrl).toContain('github.com/idvorkin/swing-analyzer/issues');

    // Decode the URL body parameter
    const url = new URL(capturedUrl);
    const body = url.searchParams.get('body') || '';
    const decodedBody = decodeURIComponent(body);

    // Verify all device fields are present in the metadata table
    const expectedFields = [
      'Screen',
      'Device Memory',
      'CPU Cores',
      'Online Status',
      'Connection Type',
      'Display Mode',
      'Touch Device',
      'Mobile',
    ];

    for (const field of expectedFields) {
      expect(decodedBody).toContain(`| ${field} |`);
    }

    // Verify specific field values are sensible (not empty)
    // Screen should have dimensions format like "1280x720 @1x"
    expect(decodedBody).toMatch(/\| Screen \| `\d+x\d+ @\d+x` \|/);

    // Online Status should be "Online" or "Offline"
    expect(decodedBody).toMatch(/\| Online Status \| `(Online|Offline)` \|/);

    // Display Mode should be "standalone" or "browser"
    expect(decodedBody).toMatch(
      /\| Display Mode \| `(standalone|browser)` \|/
    );

    // Touch Device should be "Yes" or "No"
    expect(decodedBody).toMatch(/\| Touch Device \| `(Yes|No)` \|/);

    // Mobile should be "Yes" or "No"
    expect(decodedBody).toMatch(/\| Mobile \| `(Yes|No)` \|/);
  });

  test('should not include device details when metadata checkbox is unchecked', async ({
    page,
  }) => {
    // Open bug report modal
    await page.keyboard.press('Control+i');

    // Wait for the modal
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Uncheck the metadata checkbox
    const metadataCheckbox = page.getByRole('checkbox');
    await metadataCheckbox.uncheck();
    await expect(metadataCheckbox).not.toBeChecked();

    // Intercept the window.open call
    await page.evaluate(() => {
      window.open = (url: string | URL | undefined) => {
        document.body.setAttribute('data-captured-url', String(url));
        return null;
      };
    });

    // Submit the bug report
    const submitButton = page.getByRole('button', {
      name: /Copy & Open GitHub/,
    });
    await submitButton.click();

    // Wait for the success state
    await expect(page.getByText('GitHub opened!')).toBeVisible();

    // Get the captured URL
    const capturedUrl = await page.evaluate(() => {
      return document.body.getAttribute('data-captured-url') || '';
    });

    // Decode the URL body parameter
    const url = new URL(capturedUrl);
    const body = url.searchParams.get('body') || '';
    const decodedBody = decodeURIComponent(body);

    // Verify the device fields are NOT present when metadata is disabled
    expect(decodedBody).not.toContain('| Screen |');
    expect(decodedBody).not.toContain('| Device Memory |');
    expect(decodedBody).not.toContain('| CPU Cores |');
    expect(decodedBody).not.toContain('| Online Status |');
  });
});

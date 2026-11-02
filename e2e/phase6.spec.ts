import { test, expect } from '@playwright/test';

test.describe('Phase 6: Front End Office Tool E2E Acceptance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#office-to-pdf');
  });

  test('displays persistent notice and keeps passphrase in memory only without localStorage persistence', async ({ page }) => {
    // 1. Mandatory persistent notice
    const notice = page.locator('#view-office-to-pdf .notice-server');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Files are uploaded to a server for this tool only.');

    // 2. Type passphrase
    const passphraseInput = page.locator('#office-passphrase');
    await passphraseInput.fill('my-secret-passphrase-123');

    // 3. Verify it is NOT written to localStorage or sessionStorage
    const storageKeys = await page.evaluate(() => {
      return {
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage)
      };
    });
    expect(storageKeys.local).toHaveLength(0);
    expect(storageKeys.session).toHaveLength(0);
  });

  test('handles cold-start wakeup notification and cancellation gracefully', async ({ page }) => {
    // Intercept /convert with a delayed response to simulate a sleeping server
    await page.route('**/convert', async (route) => {
      // Keep in flight for 10 seconds so cold start banner stays visible until cancel is clicked
      await new Promise((r) => setTimeout(r, 10000));
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%mock'
      });
    });

    await page.locator('#office-passphrase').fill('file-toolkit-secret');

    const fileInput = page.locator('#office-file-input');
    await fileInput.setInputFiles({
      name: 'annual_report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK\x03\x04mock docx data')
    });

    await page.locator('#office-convert-btn').click();

    // Verify cold start banner appears after 3 seconds
    const coldstartBanner = page.locator('#office-coldstart-banner');
    await expect(coldstartBanner).toBeVisible({ timeout: 6000 });
    await expect(coldstartBanner).toContainText('Waking up the server, this can take up to a minute...');

    // Test Cancel button
    const cancelBtn = page.locator('#office-cancel-btn');
    await cancelBtn.click();
    await expect(coldstartBanner).toBeHidden();
    await expect(page.locator('#office-file-status')).toContainText('Cancelled');
  });

  test('displays clean error when server rejects passphrase or is unreachable', async ({ page }) => {
    // Intercept /convert to return 401 Unauthorized
    await page.route('**/convert', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized: Invalid or missing passphrase.' })
      });
    });

    await page.locator('#office-passphrase').fill('wrong-passphrase');

    const fileInput = page.locator('#office-file-input');
    await fileInput.setInputFiles({
      name: 'financials.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK\x03\x04mock xlsx data')
    });

    await page.locator('#office-convert-btn').click();

    // Verify clean error status
    await expect(page.locator('#office-file-status')).toHaveText('Failed');
    await expect(page.locator('#office-result-area')).toContainText('Passphrase rejected');

    // Switch to Image Converter to verify other tools keep working smoothly
    await page.locator('button[data-tool="image-converter"]').click();
    await expect(page.locator('#view-image-converter')).toBeVisible();
    await expect(page.locator('#view-image-converter .tool-title')).toHaveText('Image Converter');
  });
});

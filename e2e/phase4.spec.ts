import { test, expect } from '@playwright/test';
import { createTestPdf } from '../src/services/pdfService';

test.describe('Phase 4: Cross Conversions E2E Acceptance Tests', () => {
  test('Images -> PDF: loads images, allows reordering, generates and downloads PDF', async ({ page }) => {
    await page.goto('/#images-to-pdf');

    // Create 2 small 10x10 PNGs
    const img1DataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(0, 0, 10, 10);
      return canvas.toDataURL('image/png');
    });

    const img2DataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0000FF';
      ctx.fillRect(0, 0, 10, 10);
      return canvas.toDataURL('image/png');
    });

    const fileInput = page.locator('#i2p-file-input');
    await fileInput.setInputFiles([
      {
        name: 'red.png',
        mimeType: 'image/png',
        buffer: Buffer.from(img1DataUrl.split(',')[1], 'base64')
      },
      {
        name: 'blue.png',
        mimeType: 'image/png',
        buffer: Buffer.from(img2DataUrl.split(',')[1], 'base64')
      }
    ]);

    const cards = page.locator('#i2p-grid .page-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Page 1');
    await expect(cards.nth(0)).toContainText('red.png');
    await expect(cards.nth(1)).toContainText('Page 2');
    await expect(cards.nth(1)).toContainText('blue.png');

    // Reorder: Move blue.png up
    await cards.nth(1).locator('.i2p-up').click();
    await expect(page.locator('#i2p-grid .page-card').nth(0)).toContainText('blue.png');
    await expect(page.locator('#i2p-grid .page-card').nth(1)).toContainText('red.png');

    // Click Generate PDF and verify download
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#i2p-generate-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('combined_images.pdf');
  });

  test('PDF -> Images: loads PDF, renders page list, extracts images into ZIP', async ({ page }) => {
    await page.goto('/#pdf-to-images');

    // Generate a 2-page PDF
    const pdfBytes = await createTestPdf(['First Page Content', 'Second Page Content']);

    const fileInput = page.locator('#p2i-file-input');
    await fileInput.setInputFiles({
      name: 'multipage.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes)
    });

    await expect(page.locator('#p2i-workspace')).toBeVisible();
    const cards = page.locator('#p2i-page-grid .page-card');
    await expect(cards).toHaveCount(2);

    // Select JPG and 72 DPI
    await page.locator('#p2i-format').selectOption('jpg');
    await page.locator('#p2i-dpi').selectOption('72');

    // Click Extract and verify ZIP download
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#p2i-convert-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('extracted_multipage_images.zip');
  });
});


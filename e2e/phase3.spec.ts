import { test, expect } from '@playwright/test';
import { createTestPdf } from '../src/services/pdfService';

test.describe('Phase 3: PDF Tools E2E Acceptance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#pdf-tools');
  });

  test('loads PDF, renders thumbnail grid, supports rotate, remove, and extract', async ({ page }) => {
    // Generate a 3-page PDF in Node
    const pdfBytes = await createTestPdf(['Page 1', 'Page 2', 'Page 3']);

    const fileInput = page.locator('#pdf-file-input');
    await fileInput.setInputFiles({
      name: 'sample3pages.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes)
    });

    // Check organizer workspace appears with 3 pages
    const organizer = page.locator('#pdf-organizer-workspace');
    await expect(organizer).toBeVisible();
    await expect(page.locator('#pdf-page-count-badge')).toContainText('3 active pages');

    const cards = page.locator('.page-card');
    await expect(cards).toHaveCount(3);

    // Rotate page 1 (+90 deg)
    const rotateBtn = cards.nth(0).locator('.btn-rotate');
    await rotateBtn.click();
    await expect(cards.nth(0)).toContainText('90°');

    // Remove page 2
    const deleteBtn = cards.nth(1).locator('.btn-delete');
    await deleteBtn.click();
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#pdf-page-count-badge')).toContainText('2 active pages');

    // Test Split by range
    const splitInput = page.locator('#pdf-split-input');
    await splitInput.fill('1');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#pdf-split-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('split_sample3pages.pdf');
  });

  test('merges multiple PDFs with reordering support', async ({ page }) => {
    // Switch to merge tab
    await page.locator('#pdf-tab-merge').click();
    await expect(page.locator('#pdf-merge-workspace')).toBeVisible();

    const pdfBytes1 = await createTestPdf(['Doc 1']);
    const pdfBytes2 = await createTestPdf(['Doc 2']);

    const fileInput = page.locator('#pdf-file-input');
    await fileInput.setInputFiles([
      {
        name: 'doc1.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(pdfBytes1)
      },
      {
        name: 'doc2.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(pdfBytes2)
      }
    ]);

    const mergeItems = page.locator('#merge-file-list .file-item');
    await expect(mergeItems).toHaveCount(2);
    await expect(mergeItems.nth(0)).toContainText('doc1.pdf');
    await expect(mergeItems.nth(1)).toContainText('doc2.pdf');

    // Reorder: click Down on first item
    await mergeItems.nth(0).locator('.merge-down-btn').click();
    await expect(page.locator('#merge-file-list .file-item').nth(0)).toContainText('doc2.pdf');
    await expect(page.locator('#merge-file-list .file-item').nth(1)).toContainText('doc1.pdf');

    // Click Merge & Download
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#merge-execute-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('merged_document.pdf');
  });
});

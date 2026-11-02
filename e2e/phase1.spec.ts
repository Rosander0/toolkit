import { test, expect } from '@playwright/test';

test.describe('Phase 1: Skeleton, Tool Registry & Navigation', () => {
  test('renders header and initial image converter tool view', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Personal File Toolkit/);
    await expect(page.locator('.brand-title')).toHaveText('Personal File Toolkit');

    const imageConverterTab = page.locator('button[data-tool="image-converter"]');
    await expect(imageConverterTab).toHaveClass(/active/);
    await expect(imageConverterTab).toHaveAttribute('aria-selected', 'true');

    const imageConverterView = page.locator('#view-image-converter');
    await expect(imageConverterView).toBeVisible();
    await expect(imageConverterView.locator('.tool-title')).toHaveText('Image Converter');
  });

  test('navigates through all tools using tab navigation', async ({ page }) => {
    await page.goto('/');

    const tools = [
      { id: 'pdf-tools', title: 'PDF Tools' },
      { id: 'images-to-pdf', title: 'Images to PDF' },
      { id: 'pdf-to-images', title: 'PDF to Images' },
      { id: 'office-to-pdf', title: 'Office to PDF' }
    ];

    for (const tool of tools) {
      const tab = page.locator(`button[data-tool="${tool.id}"]`);
      await tab.click();
      await expect(tab).toHaveClass(/active/);
      await expect(tab).toHaveAttribute('aria-selected', 'true');

      const view = page.locator(`#view-${tool.id}`);
      await expect(view).toBeVisible();
      await expect(view.locator('.tool-title')).toHaveText(tool.title);
    }
  });

  test('displays persistent notice specifically on the Office tool', async ({ page }) => {
    await page.goto('/#office-to-pdf');

    const officeView = page.locator('#view-office-to-pdf');
    await expect(officeView).toBeVisible();

    const notice = officeView.locator('.notice-server');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Files are uploaded to a server for this tool only.');

    // Switch back to Image Converter and ensure notice is not present there
    await page.locator('button[data-tool="image-converter"]').click();
    await expect(page.locator('#view-image-converter .notice-server')).toHaveCount(0);
  });

  test('verifies Web Workers and WebAssembly can initialize in real browser', async ({ page }) => {
    await page.goto('/');

    const workerAndWasmSupported = await page.evaluate(async () => {
      // 1. Test WebAssembly
      const wasmBytecode = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00
      ]);
      const wasmValid = WebAssembly.validate(wasmBytecode);

      // 2. Test Blob Web Worker
      const workerBlob = new Blob([
        'self.onmessage = (e) => { self.postMessage("worker_ok:" + e.data); };'
      ], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);

      const workerResult = await new Promise<string>((resolve, reject) => {
        try {
          const worker = new Worker(workerUrl);
          worker.onmessage = (e) => {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
            resolve(e.data);
          };
          worker.onerror = (err) => {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
            reject(err);
          };
          worker.postMessage('ping');
        } catch (e) {
          reject(e);
        }
      });

      return {
        wasm: wasmValid,
        worker: workerResult === 'worker_ok:ping'
      };
    });

    expect(workerAndWasmSupported.wasm).toBe(true);
    expect(workerAndWasmSupported.worker).toBe(true);
  });

  test('supports keyboard navigation across tabs (ArrowLeft, ArrowRight, Enter)', async ({ page }) => {
    await page.goto('/');

    const firstTab = page.locator('button[data-tool="image-converter"]');
    await firstTab.focus();

    // Press ArrowRight to move to PDF Tools
    await page.keyboard.press('ArrowRight');
    const pdfToolsTab = page.locator('button[data-tool="pdf-tools"]');
    await expect(pdfToolsTab).toHaveClass(/active/);
    await expect(page.locator('#view-pdf-tools')).toBeVisible();

    // Press ArrowRight again to move to Images to PDF
    await page.keyboard.press('ArrowRight');
    const imagesToPdfTab = page.locator('button[data-tool="images-to-pdf"]');
    await expect(imagesToPdfTab).toHaveClass(/active/);

    // Press ArrowLeft to return to PDF Tools
    await page.keyboard.press('ArrowLeft');
    await expect(pdfToolsTab).toHaveClass(/active/);
  });
});

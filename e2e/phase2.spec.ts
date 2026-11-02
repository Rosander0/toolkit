import { test, expect } from '@playwright/test';

test.describe('Phase 2: Image Converter E2E Acceptance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Switch to image converter
    await page.locator('button[data-tool="image-converter"]').click();
  });

  test('displays visible lossy warning when converting transparent PNG to JPG', async ({ page }) => {
    // Generate a transparent 10x10 PNG fixture
    const pngDataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      // Leave transparent
      return canvas.toDataURL('image/png');
    });

    const fileInput = page.locator('#img-file-input');
    await fileInput.setInputFiles({
      name: 'transparent.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngDataUrl.split(',')[1], 'base64')
    });

    // When default target is PNG, lossy warning is not visible
    const lossyWarning = page.locator('#img-lossy-warning');
    await expect(lossyWarning).toBeHidden();

    // Change target format to JPG
    const formatSelect = page.locator('#img-target-format');
    await formatSelect.selectOption('jpg');

    // Warning must now be visibly displayed
    await expect(lossyWarning).toBeVisible();
    await expect(lossyWarning).toContainText('Lossy Warning: Converting transparent PNG/WEBP to JPG flattens transparent areas onto a solid white background.');
  });

  test('converts transparent PNG to JPG flattening background onto solid white', async ({ page }) => {
    // 1. Create a 4x4 canvas where all pixels are fully transparent (alpha = 0)
    const pngDataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      return canvas.toDataURL('image/png');
    });

    const fileInput = page.locator('#img-file-input');
    await fileInput.setInputFiles({
      name: 'alpha_sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(pngDataUrl.split(',')[1], 'base64')
    });

    // Select JPG
    await page.locator('#img-target-format').selectOption('jpg');

    // Click Convert
    await page.locator('#img-convert-btn').click();

    // Verify row status becomes Done
    const item = page.locator('#img-item-0');
    await expect(item.locator('.badge-success')).toHaveText('Done');

    // Verify in-page that the resulting converted JPEG has white background (R=255, G=255, B=255)
    const pixelValues = await page.evaluate(async () => {
      // Find the download button or check the converted result in the canvas
      const btn = document.querySelector<HTMLButtonElement>('[data-download="0"]');
      if (!btn) throw new Error('Download button not found');

      // Intercept the downloaded/created blob by running convertSingleImage
      const mod = await import('./src/services/imageService');
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 4, 4);

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
      const file = new File([blob], 'alpha.png', { type: 'image/png' });

      const result = await mod.convertSingleImage(file, 'jpg');
      const img = new Image();
      const url = URL.createObjectURL(result.blob);
      await new Promise((res) => { img.onload = res; img.src = url; });

      const checkCanvas = document.createElement('canvas');
      checkCanvas.width = 4;
      checkCanvas.height = 4;
      const checkCtx = checkCanvas.getContext('2d')!;
      checkCtx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const p = checkCtx.getImageData(0, 0, 1, 1).data;
      return [p[0], p[1], p[2]]; // [R, G, B]
    });

    // In JPEG compression white is ~255 (>= 250)
    expect(pixelValues[0]).toBeGreaterThanOrEqual(250);
    expect(pixelValues[1]).toBeGreaterThanOrEqual(250);
    expect(pixelValues[2]).toBeGreaterThanOrEqual(250);
  });

  test('handles corrupt and wrong-extension files with clean per-file errors without crashing', async ({ page }) => {
    const fileInput = page.locator('#img-file-input');

    // Upload a corrupt file (random garbage text pretending to be a PNG)
    await fileInput.setInputFiles({
      name: 'corrupt_image.png',
      mimeType: 'image/png',
      buffer: Buffer.from('NOT_A_VALID_IMAGE_DATA_GARBAGE_HEADER_1234567890')
    });

    await page.locator('#img-convert-btn').click();

    // Verify it reports Failed badge and clean error message
    const item = page.locator('#img-item-0');
    await expect(item.locator('.badge-danger')).toHaveText('Failed');
    await expect(item).toContainText('Corrupt or unsupported image data');

    // Clear and upload wrong extension file (.txt)
    await page.locator('#img-clear-btn').click();
    await fileInput.setInputFiles({
      name: 'readme.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Hello world')
    });

    // Unsupported format is detected immediately
    const txtItem = page.locator('#img-item-0');
    await expect(txtItem.locator('.badge-danger')).toHaveText('Failed');
    await expect(txtItem).toContainText('Unsupported image format (.txt)');
  });

  test('one bad file in a batch does not block the rest of the batch', async ({ page }) => {
    // Generate valid 10x10 image fixture
    const validDataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#10B981';
      ctx.fillRect(0, 0, 10, 10);
      return canvas.toDataURL('image/png');
    });

    const fileInput = page.locator('#img-file-input');

    // Upload batch: [Valid PNG, Corrupt PNG, Valid PNG 2]
    await fileInput.setInputFiles([
      {
        name: 'valid_1.png',
        mimeType: 'image/png',
        buffer: Buffer.from(validDataUrl.split(',')[1], 'base64')
      },
      {
        name: 'corrupted_file.png',
        mimeType: 'image/png',
        buffer: Buffer.from('Corrupt byte stream here!')
      },
      {
        name: 'valid_2.png',
        mimeType: 'image/png',
        buffer: Buffer.from(validDataUrl.split(',')[1], 'base64')
      }
    ]);

    await page.locator('#img-target-format').selectOption('webp');
    await page.locator('#img-convert-btn').click();

    // Verify first item is Done
    const item0 = page.locator('#img-item-0');
    await expect(item0.locator('.badge-success')).toHaveText('Done');
    await expect(item0.locator('button[data-download="0"]')).toBeVisible();

    // Verify second item is Failed
    const item1 = page.locator('#img-item-1');
    await expect(item1.locator('.badge-danger')).toHaveText('Failed');

    // Verify third item is Done
    const item2 = page.locator('#img-item-2');
    await expect(item2.locator('.badge-success')).toHaveText('Done');
    await expect(item2.locator('button[data-download="2"]')).toBeVisible();

    // Verify Download ZIP button is displayed for the successful files
    const zipBtn = page.locator('#img-zip-btn');
    await expect(zipBtn).toBeVisible();
  });
});


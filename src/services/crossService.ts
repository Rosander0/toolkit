import { PDFDocument } from 'pdf-lib';
import { convertSingleImage } from './imageService';

/**
 * Converts a sequence of image files into a single multi-page PDF.
 */
export async function convertImagesToPdf(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new Error('No images provided for PDF conversion');
  }

  const doc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) onProgress(i, files.length);

    // Normalize image to PNG or JPG using our imageService
    const { blob } = await convertSingleImage(file, 'png');
    const arrayBuf = await blob.arrayBuffer();

    const embeddedPng = await doc.embedPng(arrayBuf);
    const { width, height } = embeddedPng.scale(1.0);

    const page = doc.addPage([width, height]);
    page.drawImage(embeddedPng, {
      x: 0,
      y: 0,
      width,
      height
    });

    if (onProgress) onProgress(i + 1, files.length);
  }

  return await doc.save();
}

/**
 * Extracts pages from a PDF as individual PNG or JPG images at the specified DPI.
 */
export async function convertPdfToImages(
  pdfBuffer: ArrayBuffer,
  options: {
    format: 'png' | 'jpg';
    dpi: number;
    pageIndices?: number[]; // 0-based page indices
  },
  onProgress?: (current: number, total: number) => void
): Promise<{ filename: string; blob: Blob }[]> {
  const pdfjs = await import('pdfjs-dist');
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Worker initialization fallback
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer.slice(0)),
    cMapPacked: true
  });

  const doc = await loadingTask.promise;
  const numPages = doc.numPages;

  const targetIndices = options.pageIndices && options.pageIndices.length > 0
    ? options.pageIndices.filter(idx => idx >= 0 && idx < numPages)
    : Array.from({ length: numPages }, (_, i) => i);

  if (targetIndices.length === 0) {
    throw new Error('No valid pages selected for conversion');
  }

  // 72 points per inch in standard PDF coordinates
  const scale = (options.dpi || 150) / 72.0;
  const results: { filename: string; blob: Blob }[] = [];

  for (let i = 0; i < targetIndices.length; i++) {
    const pageIndex = targetIndices[i];
    const pageNumber = pageIndex + 1;
    if (onProgress) onProgress(i, targetIndices.length);

    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d')!;

    if (options.format === 'jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // @ts-ignore
    await page.render({ canvasContext: ctx, viewport }).promise;

    const mime = options.format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = options.format === 'jpg' ? 0.92 : undefined;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error(`Failed to encode page ${pageNumber} to ${options.format}`));
      }, mime, quality);
    });

    results.push({
      filename: `page_${pageNumber}.${options.format}`,
      blob
    });

    if (onProgress) onProgress(i + 1, targetIndices.length);
  }

  return results;
}

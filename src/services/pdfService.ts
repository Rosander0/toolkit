import { PDFDocument, degrees } from 'pdf-lib';

export interface PageThumbnailInfo {
  pageIndex: number; // 0-based index
  pageNumber: number; // 1-based index
  dataUrl?: string;
  rotation: number; // 0, 90, 180, 270
  selected: boolean;
}

/**
 * Merge multiple PDF documents into a single PDF document in the specified order.
 */
export async function mergePdfs(pdfBuffers: ArrayBuffer[]): Promise<Uint8Array> {
  if (pdfBuffers.length === 0) {
    throw new Error('At least one PDF must be provided to merge');
  }

  const mergedDoc = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageIndices = srcDoc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) {
      mergedDoc.addPage(page);
    }
  }

  return await mergedDoc.save();
}

/**
 * Split/Extract specific pages by 1-based page numbers from a PDF document.
 */
export async function splitPdfByPages(
  pdfBuffer: ArrayBuffer,
  pageNumbers: number[]
): Promise<Uint8Array> {
  if (pageNumbers.length === 0) {
    throw new Error('No pages specified for extraction');
  }

  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  const zeroBasedIndices: number[] = [];
  for (const num of pageNumbers) {
    if (num < 1 || num > totalPages) {
      throw new Error(`Page number ${num} is out of bounds (1-${totalPages})`);
    }
    zeroBasedIndices.push(num - 1);
  }

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(srcDoc, zeroBasedIndices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  return await newDoc.save();
}

/**
 * Reorganize, rotate, and delete pages from a PDF.
 * pageConfigs: Array of page configurations specifying:
 * - originalIndex: 0-based index from the original PDF
 * - rotation: additional rotation in degrees (0, 90, 180, 270)
 * The order of pageConfigs dictates the final page order.
 */
export async function modifyPdfPages(
  pdfBuffer: ArrayBuffer,
  pageConfigs: { originalIndex: number; rotation: number }[]
): Promise<Uint8Array> {
  if (pageConfigs.length === 0) {
    throw new Error('PDF cannot be empty (all pages were removed)');
  }

  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalOriginalPages = srcDoc.getPageCount();

  const targetIndices = pageConfigs.map(c => {
    if (c.originalIndex < 0 || c.originalIndex >= totalOriginalPages) {
      throw new Error(`Invalid page index ${c.originalIndex}`);
    }
    return c.originalIndex;
  });

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(srcDoc, targetIndices);

  for (let i = 0; i < copiedPages.length; i++) {
    const page = copiedPages[i];
    const cfg = pageConfigs[i];
    const currentRot = page.getRotation().angle;
    const newRot = (currentRot + (cfg.rotation || 0)) % 360;
    page.setRotation(degrees(newRot));
    newDoc.addPage(page);
  }

  return await newDoc.save();
}

/**
 * Helper to inspect the page count of a PDF.
 */
export async function getPdfPageCount(pdfBuffer: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Generates thumbnail data URLs for all pages in a PDF using pdfjs-dist.
 */
export async function renderPdfThumbnails(
  pdfBuffer: ArrayBuffer,
  thumbWidth: number = 160
): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Handled in browser or inline
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer.slice(0)),
    cMapUrl: undefined,
    cMapPacked: true
  });

  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  const thumbnails: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const scale = thumbWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d')!;

    // @ts-ignore
    await page.render({ canvasContext: ctx, viewport }).promise;
    thumbnails.push(canvas.toDataURL('image/jpeg', 0.8));
  }

  return thumbnails;
}

/**
 * Helper to create synthetic test PDFs with text (for Vitest tests).
 */
export async function createTestPdf(pageTexts: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const text of pageTexts) {
    const page = doc.addPage([400, 600]);
    page.drawText(text, { x: 50, y: 550, size: 24 });
  }
  return await doc.save();
}

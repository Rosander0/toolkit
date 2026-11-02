import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  createTestPdf,
  mergePdfs,
  modifyPdfPages,
  splitPdfByPages,
  getPdfPageCount
} from '../src/services/pdfService';
import { parseSplitRange } from '../src/registry';

describe('PDF Tools Core Logic (Vitest Acceptance Tests)', () => {
  it('merges 3 generated PDFs with verified page count and order', async () => {
    // Generate 3 sample PDFs:
    // PDF A: 2 pages
    // PDF B: 1 page
    // PDF C: 3 pages
    const pdfABuffer = (await createTestPdf(['DocA-P1', 'DocA-P2'])).buffer;
    const pdfBBuffer = (await createTestPdf(['DocB-P1'])).buffer;
    const pdfCBuffer = (await createTestPdf(['DocC-P1', 'DocC-P2', 'DocC-P3'])).buffer;

    expect(await getPdfPageCount(pdfABuffer)).toBe(2);
    expect(await getPdfPageCount(pdfBBuffer)).toBe(1);
    expect(await getPdfPageCount(pdfCBuffer)).toBe(3);

    // Merge in order [A, B, C]
    const mergedABC = await mergePdfs([pdfABuffer, pdfBBuffer, pdfCBuffer]);
    const mergedDocABC = await PDFDocument.load(mergedABC);
    expect(mergedDocABC.getPageCount()).toBe(6);

    // Merge in reordered sequence [C, A]
    const mergedCA = await mergePdfs([pdfCBuffer, pdfABuffer]);
    const mergedDocCA = await PDFDocument.load(mergedCA);
    expect(mergedDocCA.getPageCount()).toBe(5);
  });

  it('removes pages and rearranges order with rotation', async () => {
    // 4 pages: P1 (index 0), P2 (index 1), P3 (index 2), P4 (index 3)
    const originalPdf = (await createTestPdf(['Page 1', 'Page 2', 'Page 3', 'Page 4'])).buffer;
    expect(await getPdfPageCount(originalPdf)).toBe(4);

    // Remove Page 2 (index 1) and rearrange remaining in order: [P4, P1, P3] with P4 rotated by 90 degrees
    const pageConfigs = [
      { originalIndex: 3, rotation: 90 }, // P4 rotated 90 deg
      { originalIndex: 0, rotation: 0 },  // P1
      { originalIndex: 2, rotation: 180 } // P3 rotated 180 deg
    ];

    const modifiedBuffer = await modifyPdfPages(originalPdf, pageConfigs);
    const resultDoc = await PDFDocument.load(modifiedBuffer);

    expect(resultDoc.getPageCount()).toBe(3);
    const pages = resultDoc.getPages();
    expect(pages[0].getRotation().angle).toBe(90);
    expect(pages[1].getRotation().angle).toBe(0);
    expect(pages[2].getRotation().angle).toBe(180);
  });

  it('splits PDF pages using parsed range expressions', async () => {
    // 5-page PDF
    const originalPdf = (await createTestPdf(['P1', 'P2', 'P3', 'P4', 'P5'])).buffer;

    // Use range expression "1, 3-4" -> pages [1, 3, 4]
    const pageNumbers = parseSplitRange('1, 3-4', 5);
    expect(pageNumbers).toEqual([1, 3, 4]);

    const splitBuffer = await splitPdfByPages(originalPdf, pageNumbers);
    const splitDoc = await PDFDocument.load(splitBuffer);
    expect(splitDoc.getPageCount()).toBe(3);
  });
});


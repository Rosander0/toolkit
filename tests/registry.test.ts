import { describe, it, expect } from 'vitest';
import {
  getFileExtension,
  getValidOutputs,
  getCompatibleTools,
  isValidConversion,
  sanitizeFilename,
  parseSplitRange,
  TOOLS
} from '../src/registry';

describe('Tool Registry and Explicit Valid Outputs', () => {
  it('returns only valid outputs for image extensions', () => {
    const pngOutputs = getValidOutputs('photo.png');
    expect(pngOutputs).toEqual(expect.arrayContaining(['png', 'jpg', 'webp', 'bmp', 'pdf']));
    expect(pngOutputs).not.toContain('docx');
    expect(pngOutputs).not.toContain('mp3');

    const heicOutputs = getValidOutputs('sample.heic');
    expect(heicOutputs).toEqual(expect.arrayContaining(['png', 'jpg', 'webp', 'bmp', 'pdf']));
    expect(heicOutputs).not.toContain('gif');
  });

  it('returns only valid outputs for PDF files', () => {
    const pdfOutputs = getValidOutputs('document.pdf');
    expect(pdfOutputs).toEqual(expect.arrayContaining(['pdf', 'png', 'jpg']));
    expect(pdfOutputs).not.toContain('docx');
    expect(pdfOutputs).not.toContain('webp');
  });

  it('returns only valid outputs for Office documents', () => {
    const officeFiles = [
      'resume.docx', 'old.doc', 'slides.pptx', 'presentation.ppt',
      'sheets.xlsx', 'ledger.xls', 'doc.odt', 'sheet.ods',
      'deck.odp', 'notes.rtf', 'readme.txt'
    ];

    for (const file of officeFiles) {
      const outputs = getValidOutputs(file);
      expect(outputs).toEqual(['pdf']);
    }
  });

  it('returns empty array for unsupported or arbitrary non-goal extensions', () => {
    expect(getValidOutputs('archive.zip')).toEqual([]);
    expect(getValidOutputs('video.mp4')).toEqual([]);
    expect(getValidOutputs('audio.mp3')).toEqual([]);
    expect(getValidOutputs('program.exe')).toEqual([]);
    expect(getValidOutputs('unknown')).toEqual([]);
    expect(getValidOutputs('')).toEqual([]);
  });

  it('verifies strict per-tool conversion mappings', () => {
    expect(isValidConversion('image-converter', 'png', 'jpg')).toBe(true);
    expect(isValidConversion('image-converter', 'heic', 'webp')).toBe(true);
    expect(isValidConversion('image-converter', 'png', 'pdf')).toBe(false); // image-converter produces images; images-to-pdf handles pdf

    expect(isValidConversion('images-to-pdf', 'jpg', 'pdf')).toBe(true);
    expect(isValidConversion('images-to-pdf', 'jpg', 'png')).toBe(false);

    expect(isValidConversion('pdf-to-images', 'pdf', 'png')).toBe(true);
    expect(isValidConversion('pdf-to-images', 'pdf', 'jpg')).toBe(true);
    expect(isValidConversion('pdf-to-images', 'pdf', 'docx')).toBe(false);

    expect(isValidConversion('office-to-pdf', 'docx', 'pdf')).toBe(true);
    expect(isValidConversion('office-to-pdf', 'xlsx', 'pdf')).toBe(true);
    expect(isValidConversion('office-to-pdf', 'pdf', 'docx')).toBe(false);
  });

  it('matches appropriate tools for a given file', () => {
    const imgTools = getCompatibleTools('test.png');
    expect(imgTools).toContain('image-converter');
    expect(imgTools).toContain('images-to-pdf');
    expect(imgTools).not.toContain('office-to-pdf');

    const pdfTools = getCompatibleTools('doc.pdf');
    expect(pdfTools).toContain('pdf-tools');
    expect(pdfTools).toContain('pdf-to-images');
    expect(pdfTools).not.toContain('image-converter');

    const officeTools = getCompatibleTools('report.docx');
    expect(officeTools).toEqual(['office-to-pdf']);
  });
});

describe('Filename Sanitizing', () => {
  it('strips path traversal sequences and backslashes', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\Windows\\System32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizeFilename('nested/dir/my-file.pdf')).toBe('my-file.pdf');
    expect(sanitizeFilename('nested\\dir\\my-file.pdf')).toBe('my-file.pdf');
    expect(sanitizeFilename('C:\\Documents\\invoice.pdf')).toBe('invoice.pdf');
  });

  it('replaces dangerous reserved characters with underscores', () => {
    expect(sanitizeFilename('file<bad>name:test"quote|mark?.pdf')).toBe('file_bad_name_test_quote_mark_.pdf');
  });

  it('neutralizes Windows reserved device names', () => {
    expect(sanitizeFilename('CON.txt')).toBe('CON_file.txt');
    expect(sanitizeFilename('prn.png')).toBe('prn_file.png');
    expect(sanitizeFilename('AUX.pdf')).toBe('AUX_file.pdf');
    expect(sanitizeFilename('NUL.docx')).toBe('NUL_file.docx');
    expect(sanitizeFilename('com1.dat')).toBe('com1_file.dat');
  });

  it('preserves international Unicode characters and safe symbols', () => {
    expect(sanitizeFilename('résumé_2026.pdf')).toBe('résumé_2026.pdf');
    expect(sanitizeFilename('日本語ドキュメント.docx')).toBe('日本語ドキュメント.docx');
    expect(sanitizeFilename('отчет_март.xlsx')).toBe('отчет_март.xlsx');
    expect(sanitizeFilename('photo (1) - final.png')).toBe('photo (1) - final.png');
  });

  it('handles empty, dots, and whitespace edge cases safely', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename('...')).toBe('file');
    expect(sanitizeFilename('  my report.pdf  ')).toBe('my report.pdf');
  });
});

describe('Split Range Parsing', () => {
  it('parses valid single pages and ranges', () => {
    expect(parseSplitRange('1, 3-5, 8', 10)).toEqual([1, 3, 4, 5, 8]);
    expect(parseSplitRange('1-3', 5)).toEqual([1, 2, 3]);
    expect(parseSplitRange('4', 5)).toEqual([4]);
    expect(parseSplitRange('5, 2, 3', 10)).toEqual([2, 3, 5]); // sorted
  });

  it('deduplicates overlapping page specifications', () => {
    expect(parseSplitRange('1-3, 2-4, 3', 5)).toEqual([1, 2, 3, 4]);
  });

  it('rejects invalid range ordering such as "3-1"', () => {
    expect(() => parseSplitRange('3-1', 10)).toThrow(/start page \(3\) cannot be greater than end page \(1\)/);
  });

  it('rejects non-numeric input such as "abc"', () => {
    expect(() => parseSplitRange('abc', 10)).toThrow(/Invalid page number/);
    expect(() => parseSplitRange('1, abc, 3', 10)).toThrow(/Invalid page number/);
    expect(() => parseSplitRange('1-xyz', 10)).toThrow(/Invalid range format/);
  });

  it('rejects zero or negative page numbers', () => {
    expect(() => parseSplitRange('0', 10)).toThrow(/must be 1 or greater/);
    expect(() => parseSplitRange('0-3', 10)).toThrow(/must be 1 or greater/);
    expect(() => parseSplitRange('-2', 10)).toThrow();
  });

  it('rejects ranges that exceed total pages when totalPages is provided', () => {
    expect(() => parseSplitRange('1-11', 10)).toThrow(/exceeds total pages \(10\)/);
    expect(() => parseSplitRange('12', 10)).toThrow(/exceeds total pages \(10\)/);
  });

  it('rejects empty inputs', () => {
    expect(() => parseSplitRange('')).toThrow(/Page range cannot be empty/);
    expect(() => parseSplitRange('   ')).toThrow(/Page range cannot be empty/);
  });
});

export type ToolId =
  | 'image-converter'
  | 'pdf-tools'
  | 'images-to-pdf'
  | 'pdf-to-images'
  | 'office-to-pdf';

export interface ToolMeta {
  id: ToolId;
  name: string;
  tagline: string;
  isServerSide: boolean;
  supportedInputExtensions: readonly string[];
  supportedOutputFormats: readonly string[];
  persistentNotice?: string;
}

export const TOOLS: Record<ToolId, ToolMeta> = {
  'image-converter': {
    id: 'image-converter',
    name: 'Image Converter',
    tagline: 'Client-side conversion between image formats (PNG, JPG, WEBP, BMP)',
    isServerSide: false,
    supportedInputExtensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'heic', 'tiff', 'tif'],
    supportedOutputFormats: ['png', 'jpg', 'webp', 'bmp']
  },
  'pdf-tools': {
    id: 'pdf-tools',
    name: 'PDF Tools',
    tagline: 'Merge, split, remove, rotate, and rearrange PDF pages client-side',
    isServerSide: false,
    supportedInputExtensions: ['pdf'],
    supportedOutputFormats: ['pdf']
  },
  'images-to-pdf': {
    id: 'images-to-pdf',
    name: 'Images to PDF',
    tagline: 'Combine multiple images into a single organized PDF',
    isServerSide: false,
    supportedInputExtensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'heic', 'tiff', 'tif'],
    supportedOutputFormats: ['pdf']
  },
  'pdf-to-images': {
    id: 'pdf-to-images',
    name: 'PDF to Images',
    tagline: 'Extract PDF pages as high-resolution PNG or JPG images',
    isServerSide: false,
    supportedInputExtensions: ['pdf'],
    supportedOutputFormats: ['png', 'jpg']
  },
  'office-to-pdf': {
    id: 'office-to-pdf',
    name: 'Office to PDF',
    tagline: 'Convert DOCX, XLSX, PPTX, and other Office documents to PDF',
    isServerSide: true,
    supportedInputExtensions: [
      'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'odt', 'ods', 'odp', 'rtf', 'txt'
    ],
    supportedOutputFormats: ['pdf'],
    persistentNotice: 'Files are uploaded to a server for this tool only.'
  }
};

export const MAX_CLIENT_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
export const MAX_OFFICE_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Extracts normalized file extension (without dot, lowercase).
 */
export function getFileExtension(filename: string): string {
  const clean = filename.trim();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1 || lastDot === clean.length - 1) return '';
  return clean.slice(lastDot + 1).toLowerCase();
}

/**
 * Registry check: given a filename or extension, return only valid target output formats.
 * For non-supported files, returns an empty array.
 */
export function getValidOutputs(filenameOrExt: string): string[] {
  const ext = filenameOrExt.includes('.') ? getFileExtension(filenameOrExt) : filenameOrExt.toLowerCase().trim();
  if (!ext) return [];

  const validOutputs = new Set<string>();

  // Image converter
  if (TOOLS['image-converter'].supportedInputExtensions.includes(ext)) {
    for (const out of TOOLS['image-converter'].supportedOutputFormats) {
      validOutputs.add(out);
    }
  }

  // PDF tools & PDF to images
  if (ext === 'pdf') {
    validOutputs.add('pdf');
    for (const out of TOOLS['pdf-to-images'].supportedOutputFormats) {
      validOutputs.add(out);
    }
  }

  // Images to PDF
  if (TOOLS['images-to-pdf'].supportedInputExtensions.includes(ext)) {
    validOutputs.add('pdf');
  }

  // Office to PDF
  if (TOOLS['office-to-pdf'].supportedInputExtensions.includes(ext)) {
    validOutputs.add('pdf');
  }

  return Array.from(validOutputs);
}

/**
 * Returns all tools compatible with the given file extension.
 */
export function getCompatibleTools(filenameOrExt: string): ToolId[] {
  const ext = filenameOrExt.includes('.') ? getFileExtension(filenameOrExt) : filenameOrExt.toLowerCase().trim();
  if (!ext) return [];

  const matched: ToolId[] = [];
  for (const tool of Object.values(TOOLS)) {
    if (tool.supportedInputExtensions.includes(ext)) {
      matched.push(tool.id);
    }
  }
  return matched;
}

/**
 * Checks if a specific conversion from an input extension to an output format is valid for a tool.
 */
export function isValidConversion(toolId: ToolId, inputExt: string, outputFormat: string): boolean {
  const tool = TOOLS[toolId];
  if (!tool) return false;
  const normIn = inputExt.toLowerCase().replace(/^\./, '');
  const normOut = outputFormat.toLowerCase().replace(/^\./, '');
  return tool.supportedInputExtensions.includes(normIn) && tool.supportedOutputFormats.includes(normOut);
}

/**
 * Sanitizes filename to protect against path traversal (../, ..\), reserved chars,
 * Windows reserved device names, and control characters while preserving valid Unicode.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') return 'file';

  // 1. Normalize unicode (NFKC)
  let name = filename.normalize('NFKC').trim();

  // 2. Remove directory components & traversal
  name = name.replace(/^[a-zA-Z]:[\\/]/, ''); // Remove drive letter
  name = name.replace(/.*[\\/]/, ''); // Strip any directory paths
  name = name.replace(/\.\.+[\\/]/g, ''); // Strip .. traversal

  // 3. Remove dangerous / reserved characters: < > : " / \ | ? * and control chars (0-31, 127)
  name = name.replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '_');

  // 4. Handle Windows reserved filenames (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const baseParts = name.split('.');
  const baseName = baseParts[0];
  const reservedRegex = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedRegex.test(baseName)) {
    baseParts[0] = `${baseName}_file`;
    name = baseParts.join('.');
  }

  // 5. Trim leading/trailing dots and spaces
  name = name.replace(/^[\s.]+|[\s.]+$/g, '');

  // 6. Fallback if empty
  if (!name) return 'file';

  return name;
}

/**
 * Parses a page range string (e.g. "1, 3-5, 8") and returns a sorted array of unique 1-based page numbers.
 * Validates strictly:
 * - Reject bad formatting ("abc", "3-1", "0", negative numbers)
 * - Validates within totalPages if totalPages > 0
 */
export function parseSplitRange(rangeStr: string, totalPages?: number): number[] {
  const trimmed = rangeStr.trim();
  if (!trimmed) {
    throw new Error('Page range cannot be empty');
  }

  const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Page range cannot be empty');
  }

  const pages = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const sides = part.split('-').map(s => s.trim());
      if (sides.length !== 2) {
        throw new Error(`Invalid range expression: "${part}"`);
      }
      const [startStr, endStr] = sides;
      if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) {
        throw new Error(`Invalid range format: "${part}"`);
      }
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (start <= 0 || end <= 0) {
        throw new Error(`Page numbers must be 1 or greater, got "${part}"`);
      }
      if (start > end) {
        throw new Error(`Invalid range "${part}": start page (${start}) cannot be greater than end page (${end})`);
      }
      if (totalPages !== undefined && totalPages > 0 && end > totalPages) {
        throw new Error(`Page ${end} exceeds total pages (${totalPages})`);
      }

      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    } else {
      if (!/^\d+$/.test(part)) {
        throw new Error(`Invalid page number: "${part}"`);
      }
      const page = parseInt(part, 10);
      if (page <= 0) {
        throw new Error(`Page numbers must be 1 or greater, got "${part}"`);
      }
      if (totalPages !== undefined && totalPages > 0 && page > totalPages) {
        throw new Error(`Page ${page} exceeds total pages (${totalPages})`);
      }
      pages.add(page);
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Format bytes into human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}


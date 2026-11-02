import { sanitizeFilename, getFileExtension, MAX_CLIENT_FILE_SIZE_BYTES, formatFileSize } from '../registry';
import { encodeBmp } from '../utils/bmpEncoder';

export type OutputImageFormat = 'png' | 'jpg' | 'webp' | 'bmp';

export interface ImageConversionResult {
  file: File;
  outputFilename: string;
  blob?: Blob;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  isTransparent?: boolean;
}

export type ProgressCallback = (completed: number, total: number, currentItem: ImageConversionResult) => void;

/**
 * Loads an image from Blob/File into an HTMLImageElement or ImageBitmap.
 */
async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Corrupt or unsupported image data'));
    };
    img.src = url;
  });
}

/**
 * Decodes TIFF files into an ImageData object using lazy-loaded UTIF.
 */
async function decodeTiff(buffer: ArrayBuffer): Promise<ImageData> {
  const UTIF = await import('utif');
  const ifds = UTIF.decode(buffer);
  if (!ifds || ifds.length === 0) {
    throw new Error('Invalid or corrupted TIFF image');
  }
  UTIF.decodeImage(buffer, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const width = ifds[0].width;
  const height = ifds[0].height;
  const clampedData = new Uint8ClampedArray(rgba.buffer);
  return new ImageData(clampedData, width, height);
}

/**
 * Decodes HEIC files into a standard ImageBlob using lazy-loaded heic2any.
 */
async function decodeHeic(blob: Blob): Promise<Blob> {
  const heic2anyModule = await import('heic2any');
  const heic2any = heic2anyModule.default || heic2anyModule;
  const converted = await heic2any({
    blob,
    toType: 'image/png'
  });
  return Array.isArray(converted) ? converted[0] : converted;
}

/**
 * Converts a single image file to the target format.
 */
export async function convertSingleImage(
  file: File,
  targetFormat: OutputImageFormat
): Promise<{ blob: Blob; outputFilename: string }> {
  // Check size threshold
  if (file.size > MAX_CLIENT_FILE_SIZE_BYTES) {
    throw new Error(`File size (${formatFileSize(file.size)}) exceeds maximum limit of 200 MB`);
  }

  const rawExt = getFileExtension(file.name);
  const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
  const sanitizedBase = sanitizeFilename(baseName);
  const outputExt = targetFormat === 'jpg' ? 'jpg' : targetFormat;
  const outputFilename = `${sanitizedBase}.${outputExt}`;

  // 1. Obtain canvas with image rendered on it
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is not available');
  }

  let width = 0;
  let height = 0;

  if (rawExt === 'tiff' || rawExt === 'tif') {
    const arrayBuf = await file.arrayBuffer();
    const imgData = await decodeTiff(arrayBuf);
    width = imgData.width;
    height = imgData.height;
    canvas.width = width;
    canvas.height = height;

    if (targetFormat === 'jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }
    // Draw via temporary canvas or putImageData
    if (targetFormat === 'jpg') {
      // Create temp canvas to composite over white
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
    } else {
      ctx.putImageData(imgData, 0, 0);
    }
  } else {
    let sourceBlob: Blob = file;
    if (rawExt === 'heic') {
      sourceBlob = await decodeHeic(file);
    }

    const img = await loadImageElement(sourceBlob);
    width = img.naturalWidth || img.width;
    height = img.naturalHeight || img.height;

    if (!width || !height) {
      throw new Error('Invalid image dimensions or corrupt image');
    }

    canvas.width = width;
    canvas.height = height;

    // CRITICAL: Transparent PNG/WEBP -> JPG flattens onto white
    if (targetFormat === 'jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    ctx.drawImage(img, 0, 0);
  }

  // 2. Export to target format
  if (targetFormat === 'bmp') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const bmpBuffer = encodeBmp(imgData);
    const blob = new Blob([bmpBuffer], { type: 'image/bmp' });
    return { blob, outputFilename };
  }

  const mimeType = targetFormat === 'jpg' ? 'image/jpeg' : `image/${targetFormat}`;
  const quality = targetFormat === 'jpg' || targetFormat === 'webp' ? 0.92 : undefined;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error(`Failed to encode canvas to ${targetFormat}`));
      },
      mimeType,
      quality
    );
  });

  return { blob, outputFilename };
}

/**
 * Convert batch of image files sequentially with progress reporting.
 * Resilient: one failure does not abort the remaining files.
 */
export async function convertImageBatch(
  files: File[],
  targetFormat: OutputImageFormat,
  onProgress?: ProgressCallback
): Promise<ImageConversionResult[]> {
  const results: ImageConversionResult[] = files.map(file => {
    const base = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    return {
      file,
      outputFilename: `${sanitizeFilename(base)}.${targetFormat}`,
      status: 'pending'
    };
  });

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    item.status = 'processing';
    if (onProgress) onProgress(i, results.length, item);

    try {
      const { blob, outputFilename } = await convertSingleImage(item.file, targetFormat);
      item.blob = blob;
      item.outputFilename = outputFilename;
      item.status = 'done';
    } catch (err: unknown) {
      item.status = 'error';
      item.error = err instanceof Error ? err.message : 'Unknown conversion error';
    }

    if (onProgress) onProgress(i + 1, results.length, item);
  }

  return results;
}

/**
 * Creates a ZIP file blob containing all successful image results using fflate.
 */
export async function createZipFromResults(
  results: ImageConversionResult[],
  zipFilename: string = 'converted_images.zip'
): Promise<{ zipBlob: Blob; zipFilename: string }> {
  const { zipSync } = await import('fflate');

  const zipEntries: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();

  for (const item of results) {
    if (item.status === 'done' && item.blob) {
      let filename = item.outputFilename;
      // Handle duplicate names inside the zip
      if (usedNames.has(filename)) {
        const dot = filename.lastIndexOf('.');
        const base = dot !== -1 ? filename.slice(0, dot) : filename;
        const ext = dot !== -1 ? filename.slice(dot) : '';
        let counter = 1;
        while (usedNames.has(`${base}_${counter}${ext}`)) {
          counter++;
        }
        filename = `${base}_${counter}${ext}`;
      }
      usedNames.add(filename);

      const arrayBuf = await item.blob.arrayBuffer();
      zipEntries[filename] = new Uint8Array(arrayBuf);
    }
  }

  if (Object.keys(zipEntries).length === 0) {
    throw new Error('No converted files available to package into ZIP');
  }

  const zipped = zipSync(zipEntries, { level: 6 });
  const zipBlob = new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
  return { zipBlob, zipFilename };
}

/**
 * Helper to trigger a browser file download and immediately revoke the object URL.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Guarantee URL revocation after trigger
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}


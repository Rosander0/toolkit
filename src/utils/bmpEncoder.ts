/**
 * Encodes ImageData into a standard uncompressed 32-bit BGRA BMP ArrayBuffer.
 * Works across all browsers and Node environments.
 */
export function encodeBmp(imageData: ImageData): ArrayBuffer {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data; // RGBA uint8 clamped array

  const bytesPerPixel = 4; // 32-bit BGRA
  const rowSize = width * bytesPerPixel;
  const pixelArraySize = rowSize * height;
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const pixelOffset = fileHeaderSize + infoHeaderSize;
  const fileSize = pixelOffset + pixelArraySize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // BITMAPFILEHEADER (14 bytes)
  bytes[0] = 0x42; // 'B'
  bytes[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true); // File size
  view.setUint16(6, 0, true);        // Reserved 1
  view.setUint16(8, 0, true);        // Reserved 2
  view.setUint32(10, pixelOffset, true); // Offset to pixel data (54)

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, infoHeaderSize, true); // Header size (40)
  view.setInt32(18, width, true);           // Width
  view.setInt32(22, -height, true);         // Height (negative for top-down bitmap)
  view.setUint16(26, 1, true);              // Color planes (1)
  view.setUint16(28, 32, true);             // Bits per pixel (32-bit BGRA)
  view.setUint32(30, 0, true);              // Compression (0 = BI_RGB)
  view.setUint32(34, pixelArraySize, true); // Image data size
  view.setInt32(38, 2835, true);            // H-resolution (72 DPI)
  view.setInt32(42, 2835, true);            // V-resolution (72 DPI)
  view.setUint32(46, 0, true);              // Colors in palette
  view.setUint32(50, 0, true);              // Important colors

  // Pixel data: Convert RGBA to BGRA
  let dstIdx = pixelOffset;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    bytes[dstIdx] = b;
    bytes[dstIdx + 1] = g;
    bytes[dstIdx + 2] = r;
    bytes[dstIdx + 3] = a;
    dstIdx += 4;
  }

  return buffer;
}


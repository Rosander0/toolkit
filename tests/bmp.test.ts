import { describe, it, expect } from 'vitest';
import { encodeBmp } from '../src/utils/bmpEncoder';

describe('BMP Encoder', () => {
  it('generates valid BMP header and pixel buffer', () => {
    const width = 2;
    const height = 2;
    // RGBA pixels: [Red, Green, Blue, White]
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,    // Red
      0, 255, 0, 255,    // Green
      0, 0, 255, 255,    // Blue
      255, 255, 255, 255 // White
    ]);

    const fakeImageData = { width, height, data } as ImageData;
    const buffer = encodeBmp(fakeImageData);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Verify 'BM' signature
    expect(bytes[0]).toBe(0x42);
    expect(bytes[1]).toBe(0x4d);

    // Header sizes
    expect(view.getUint32(10, true)).toBe(54); // pixel offset
    expect(view.getUint32(14, true)).toBe(40); // info header size
    expect(view.getInt32(18, true)).toBe(2);   // width
    expect(view.getInt32(22, true)).toBe(-2);  // height (top-down)
    expect(view.getUint16(28, true)).toBe(32); // 32 bpp

    // Total file size: 54 + (2 * 2 * 4) = 54 + 16 = 70 bytes
    expect(buffer.byteLength).toBe(70);
    expect(view.getUint32(2, true)).toBe(70);

    // Verify first pixel in BGRA order (Red pixel RGBA [255,0,0,255] -> BGRA [0,0,255,255])
    expect(bytes[54]).toBe(0);   // B
    expect(bytes[55]).toBe(0);   // G
    expect(bytes[56]).toBe(255); // R
    expect(bytes[57]).toBe(255); // A
  });
});


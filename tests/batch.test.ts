import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../src/registry';

describe('Batch Processing & Filename Safety in Image Workflows', () => {
  it('deduplicates and sanitizes filenames properly for ZIP entries', () => {
    const rawNames = [
      'my photo.png',
      'my photo.png',
      '../../../etc/passwd.png',
      'bad:name?.png'
    ];

    const targetFormat = 'jpg';
    const usedNames = new Set<string>();
    const sanitizedZipNames: string[] = [];

    for (const name of rawNames) {
      const base = name.substring(0, name.lastIndexOf('.')) || name;
      const sanitizedBase = sanitizeFilename(base);
      let filename = `${sanitizedBase}.${targetFormat}`;

      if (usedNames.has(filename)) {
        const dot = filename.lastIndexOf('.');
        const b = dot !== -1 ? filename.slice(0, dot) : filename;
        const ext = dot !== -1 ? filename.slice(dot) : '';
        let counter = 1;
        while (usedNames.has(`${b}_${counter}${ext}`)) {
          counter++;
        }
        filename = `${b}_${counter}${ext}`;
      }

      usedNames.add(filename);
      sanitizedZipNames.push(filename);
    }

    expect(sanitizedZipNames[0]).toBe('my photo.jpg');
    expect(sanitizedZipNames[1]).toBe('my photo_1.jpg');
    expect(sanitizedZipNames[2]).toBe('passwd.jpg');
    expect(sanitizedZipNames[3]).toBe('bad_name_.jpg');
  });
});

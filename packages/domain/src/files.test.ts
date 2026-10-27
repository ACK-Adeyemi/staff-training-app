// BP-16 and F-4 (pure part): magic-byte sniffing and image metadata detection (plan Assumption 19).
// Files are built by hand byte by byte; no real images or personal data.
//
// API under test:
//   sniffMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null
//   hasImageMetadata(bytes: Uint8Array, mime: string): boolean
//       JPEG: any APP1 segment (Exif or XMP) before the scan data; PNG: eXIf, tEXt, iTXt or zTXt chunk (CRC is not checked);
//       WebP: EXIF or XMP chunk in the RIFF container; anything else (including PDFs and unknown mimes) is false.
import { describe, expect, it } from 'vitest';
import { hasImageMetadata, sniffMime } from './files';

const ascii = (s: string): number[] => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
const u8 = (...parts: (number | number[])[]): Uint8Array => new Uint8Array(parts.flat());

// JPEG
const seg = (marker: number, payload: number[]): number[] => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 0xff,
  ...payload,
];
const jfif = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const dqt = seg(0xdb, new Array<number>(65).fill(1));
const sof = seg(0xc0, [8, 0, 8, 0, 8, 1, 1, 0x11, 0]);
const sos = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
const jpeg = (...extra: number[][]): Uint8Array =>
  u8([0xff, 0xd8], jfif, ...extra, dqt, sof, sos, [0x12, 0x34, 0x56], [0xff, 0xd9]);
const exifSeg = seg(0xe1, [...ascii('Exif'), 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
const xmpSeg = seg(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<x:xmpmeta/>')]);

// PNG
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: number[]): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const chunk = (type: string, data: number[]): number[] => [
  ...be32(data.length),
  ...ascii(type),
  ...data,
  ...be32(crc32([...ascii(type), ...data])),
];
const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ihdr = chunk('IHDR', [...be32(1), ...be32(1), 8, 2, 0, 0, 0]);
const idat = chunk('IDAT', [0x78, 0x9c, 0x63, 0, 0, 0, 2, 0, 1]);
const iend = chunk('IEND', []);
const png = (...extra: number[][]): Uint8Array => u8(pngSig, ihdr, ...extra, idat, iend);

// WebP
const le32 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const riffChunk = (type: string, data: number[]): number[] => [
  ...ascii(type),
  ...le32(data.length),
  ...data,
  ...(data.length % 2 ? [0] : []),
];
const webp = (...chunks: number[][]): Uint8Array => {
  const body = [...ascii('WEBP'), ...chunks.flat()];
  return u8(ascii('RIFF'), le32(body.length), body);
};
const vp8x = riffChunk('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const vp8 = riffChunk('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 1, 0, 1, 0]);

describe('sniffMime', () => {
  it('recognises JPEG, PNG, WebP and PDF by their first bytes', () => {
    expect(sniffMime(jpeg())).toBe('image/jpeg');
    expect(sniffMime(png())).toBe('image/png');
    expect(sniffMime(webp(vp8x, vp8))).toBe('image/webp');
    expect(sniffMime(u8(ascii('%PDF-1.7\n%'), [0xe2, 0xe3]))).toBe('application/pdf');
  });

  it('gives null for text, scripts, other containers, truncated and empty input', () => {
    expect(sniffMime(u8(ascii('<script>alert(1)</script>')))).toBeNull();
    expect(sniffMime(u8(ascii('GIF89a')))).toBeNull();
    expect(sniffMime(u8(ascii('RIFF'), le32(4), ascii('WAVE')))).toBeNull();
    expect(sniffMime(u8([0xff, 0xd8]))).toBeNull();
    expect(sniffMime(u8([0x89, 0x50]))).toBeNull();
    expect(sniffMime(u8())).toBeNull();
  });

  it('is decided by the bytes, not by a name', () => {
    expect(sniffMime(u8(ascii('MZ'), [0x90, 0, 3, 0]))).toBeNull();
  });
});

describe('hasImageMetadata: JPEG', () => {
  it('is false for a plain JPEG with only JFIF', () => {
    expect(hasImageMetadata(jpeg(), 'image/jpeg')).toBe(false);
  });

  it('is true for an Exif APP1 segment', () => {
    expect(hasImageMetadata(jpeg(exifSeg), 'image/jpeg')).toBe(true);
  });

  it('is true for an XMP APP1 segment', () => {
    expect(hasImageMetadata(jpeg(xmpSeg), 'image/jpeg')).toBe(true);
  });

  it('is true for a Photoshop APP13 segment and a COM comment segment', () => {
    expect(hasImageMetadata(jpeg(seg(0xed, [...ascii('Photoshop 3.0'), 0])), 'image/jpeg')).toBe(true);
    expect(hasImageMetadata(jpeg(seg(0xfe, [...ascii('taken at home')])), 'image/jpeg')).toBe(true);
  });

  it('finds the segment wherever it is among the headers', () => {
    expect(hasImageMetadata(u8([0xff, 0xd8], jfif, dqt, exifSeg, sof, sos, [0x01], [0xff, 0xd9]), 'image/jpeg')).toBe(
      true,
    );
  });

  it('does not mistake bytes inside the compressed scan for a segment', () => {
    const fake = [0xff, 0xe1, 0x00, 0x04, 0x45, 0x78];
    const data = u8([0xff, 0xd8], jfif, dqt, sof, sos, fake, [0xff, 0xd9]);
    expect(hasImageMetadata(data, 'image/jpeg')).toBe(false);
  });

  it('does not run past the end on a truncated segment', () => {
    expect(() => hasImageMetadata(u8([0xff, 0xd8], [0xff, 0xe1, 0xff, 0xff, 0x45]), 'image/jpeg')).not.toThrow();
  });
});

describe('hasImageMetadata: PNG', () => {
  it('is false for a plain PNG, including harmless chunks', () => {
    expect(hasImageMetadata(png(), 'image/png')).toBe(false);
    expect(
      hasImageMetadata(png(chunk('pHYs', [...be32(2835), ...be32(2835), 1]), chunk('gAMA', be32(45455))), 'image/png'),
    ).toBe(false);
  });

  it.each([
    ['eXIf', [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]],
    ['tEXt', [...ascii('Author'), 0, ...ascii('Someone')]],
    ['iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii('<x/>')]],
    ['zTXt', [...ascii('Comment'), 0, 0, 0x78, 0x9c]],
  ])('is true when a %s chunk is present', (type, data) => {
    expect(hasImageMetadata(png(chunk(type, data)), 'image/png')).toBe(true);
  });

  it('finds a metadata chunk after the image data too', () => {
    expect(
      hasImageMetadata(u8(pngSig, ihdr, idat, chunk('tEXt', [...ascii('a'), 0, ...ascii('b')]), iend), 'image/png'),
    ).toBe(true);
  });

  it('does not run past the end on a chunk length that overruns the file', () => {
    expect(() => hasImageMetadata(u8(pngSig, be32(0x7fffffff), ascii('tEXt')), 'image/png')).not.toThrow();
  });
});

describe('hasImageMetadata: WebP', () => {
  it('is false for a plain WebP', () => {
    expect(hasImageMetadata(webp(vp8x, vp8), 'image/webp')).toBe(false);
    expect(hasImageMetadata(webp(vp8x, riffChunk('ICCP', [1, 2, 3]), vp8), 'image/webp')).toBe(false);
  });

  it('is true for an EXIF chunk, including an odd-sized one before it', () => {
    expect(hasImageMetadata(webp(vp8x, vp8, riffChunk('EXIF', [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0])), 'image/webp')).toBe(
      true,
    );
    expect(
      hasImageMetadata(webp(vp8x, riffChunk('ALPH', [1, 2, 3]), riffChunk('EXIF', [1, 2, 3, 4])), 'image/webp'),
    ).toBe(true);
  });

  it('is true for an XMP chunk', () => {
    expect(hasImageMetadata(webp(vp8x, vp8, riffChunk('XMP ', ascii('<x:xmpmeta/>'))), 'image/webp')).toBe(true);
  });
});

describe('hasImageMetadata: other types', () => {
  it('is false for a PDF and for an unknown type, even with metadata-looking bytes', () => {
    expect(hasImageMetadata(u8(ascii('%PDF-1.7\n/Author (x)')), 'application/pdf')).toBe(false);
    expect(hasImageMetadata(jpeg(exifSeg), 'text/plain')).toBe(false);
  });

  it('does not apply one format rule to another format', () => {
    expect(hasImageMetadata(png(chunk('tEXt', [...ascii('a'), 0, ...ascii('b')])), 'image/jpeg')).toBe(false);
  });
});

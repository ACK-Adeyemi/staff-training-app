// Magic-byte file sniffing and image metadata detection. Brief 27; M3 plan assumption 19.
// Pure and defensive: every read is bounds-checked, so truncated or hostile input never throws.
export type SniffedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const textAt = (b: Uint8Array, at: number, len: number): string =>
  String.fromCharCode(...Array.from(b.subarray(at, at + len)));

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The file type decided by its first bytes alone, or null when it is not an allowed type. */
export function sniffMime(bytes: Uint8Array): SniffedMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, PNG_SIG)) return 'image/png';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf';
  return null;
}

const jpegHasMetadata = (b: Uint8Array): boolean => {
  if (!startsWith(b, [0xff, 0xd8])) return false;
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return false;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xe1) return true; // APP1: Exif or XMP
    if (marker === 0xda || marker === 0xd9) return false; // scan data or end: headers are over
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2; // no length
      continue;
    }
    if (i + 3 >= b.length) return false;
    const length = ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    if (length < 2) return false;
    i += 2 + length;
  }
  return false;
};

const PNG_META = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt']);
const pngHasMetadata = (b: Uint8Array): boolean => {
  if (!startsWith(b, PNG_SIG)) return false;
  let i = 8;
  while (i + 8 <= b.length) {
    const length = (b[i] ?? 0) * 2 ** 24 + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0);
    if (PNG_META.has(textAt(b, i + 4, 4))) return true;
    i += 12 + length;
  }
  return false;
};

const webpHasMetadata = (b: Uint8Array): boolean => {
  if (!(startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8))) return false;
  let i = 12;
  while (i + 8 <= b.length) {
    const type = textAt(b, i, 4);
    if (type === 'EXIF' || type === 'XMP ') return true;
    const size = (b[i + 4] ?? 0) + ((b[i + 5] ?? 0) << 8) + ((b[i + 6] ?? 0) << 16) + (b[i + 7] ?? 0) * 2 ** 24;
    i += 8 + size + (size % 2);
  }
  return false;
};

/** True when the image carries Exif, XMP or text metadata (such as location) that could be removed. */
export function hasImageMetadata(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return jpegHasMetadata(bytes);
  if (mime === 'image/png') return pngHasMetadata(bytes);
  if (mime === 'image/webp') return webpHasMetadata(bytes);
  return false;
}

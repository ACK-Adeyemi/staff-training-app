// Test files for upload specs. The JPEG is drawn by the browser (so it decodes), then an APP1 Exif segment holding the
// marker text GPSCANARY is spliced in after the start-of-image marker. A stored photo must contain neither "Exif" nor
// the marker. The PDF is a minimal, fictional one-page file.
import type { Page } from '@playwright/test';

export const GPS_MARKER = 'GPSCANARY';

const ascii = (text: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i));
  return out;
};

/** A small valid JPEG with an Exif APP1 segment that carries GPSCANARY. */
export async function exifJpeg(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = '#f4efe2';
    ctx.fillRect(0, 0, 120, 80);
    ctx.fillStyle = '#224466';
    ctx.fillRect(10, 10, 100, 12);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });
    if (!blob) throw new Error('no jpeg');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return btoa(out);
  });
  const jpeg = Buffer.from(base64, 'base64');
  const body = [...ascii('Exif'), 0, 0, ...ascii(`${GPS_MARKER} 51.5007N 0.1246W`)];
  const length = body.length + 2;
  const app1 = Buffer.from([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...body]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** A minimal PDF with fictional text. */
export function minimalPdf(): Buffer {
  return Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Fictional certificate for tests only.\n%%EOF\n');
}

/** The stored bytes of a file attachment, read straight from the app's IndexedDB database. */
export async function storedFileBytes(page: Page, attachmentId: string): Promise<number[]> {
  return page.evaluate(
    (id) =>
      new Promise<number[]>((resolve, reject) => {
        const open = indexedDB.open('sta-demo');
        open.onerror = () => {
          reject(new Error('cannot open sta-demo'));
        };
        open.onsuccess = () => {
          const req = open.result.transaction('attachments', 'readonly').objectStore('attachments').get(id);
          req.onsuccess = () => {
            const row = req.result as { data?: ArrayLike<number> } | undefined;
            if (!row?.data) reject(new Error('no stored bytes'));
            else resolve(Array.from(row.data));
          };
          req.onerror = () => {
            reject(new Error('read failed'));
          };
        };
      }),
    attachmentId,
  );
}

/** True when the bytes contain the text. */
export function containsText(bytes: readonly number[], text: string): boolean {
  const needle = ascii(text);
  for (let i = 0; i + needle.length <= bytes.length; i++) {
    if (needle.every((c, j) => bytes[i + j] === c)) return true;
  }
  return false;
}

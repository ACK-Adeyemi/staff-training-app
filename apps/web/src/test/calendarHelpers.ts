// Test helpers shared by the M3 chunk 18b calendar tests. Not part of the app.
import { vi } from 'vitest';

/** Replaces URL.createObjectURL so a download can be read back. Returns the captured blobs. */
export function captureDownloads(): { blobs: Blob[]; names: string[]; restore: () => void } {
  const blobs: Blob[] = [];
  const names: string[] = [];
  const original = { create: URL.createObjectURL.bind(URL), revoke: URL.revokeObjectURL.bind(URL) };
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    blobs.push(b as Blob);
    return `blob:calendar-${blobs.length}`;
  });
  URL.revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    if (this.download) names.push(this.download);
  });
  return {
    blobs,
    names,
    restore: () => {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
      click.mockRestore();
    },
  };
}

export function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      resolve(typeof r.result === 'string' ? r.result : '');
    };
    r.onerror = () => {
      reject(new Error('cannot read blob'));
    };
    r.readAsText(blob);
  });
}

/** Unfolds RFC 5545 lines and returns "NAME;PARAMS" / value pairs for every content line. */
export function parseIcs(text: string): { name: string; params: string; value: string }[] {
  const unfolded = text.replace(/\r\n[ \t]/g, '');
  return unfolded
    .split('\r\n')
    .filter((l) => l !== '')
    .map((line) => {
      const colon = line.indexOf(':');
      const head = line.slice(0, colon);
      const [name = '', ...rest] = head.split(';');
      return { name, params: rest.join(';'), value: line.slice(colon + 1) };
    });
}

export const ICS_ALLOWED = new Set([
  'BEGIN',
  'END',
  'PRODID',
  'VERSION',
  'CALSCALE',
  'METHOD',
  'UID',
  'DTSTAMP',
  'DTSTART',
  'DTEND',
  'SUMMARY',
]);

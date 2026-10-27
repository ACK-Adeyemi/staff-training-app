// Test helper (M3 chunk 20b): reads a captured ZIP download back into entries with fflate. Not part of the app.
import { strFromU8, unzipSync } from 'fflate';

export function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      resolve(new Uint8Array(r.result as ArrayBuffer));
    };
    r.onerror = () => {
      reject(new Error('cannot read blob'));
    };
    r.readAsArrayBuffer(blob);
  });
}

export async function readZip(blob: Blob): Promise<{ names: string[]; text: (name: string) => string }> {
  const files = unzipSync(await readBlobBytes(blob));
  return {
    names: Object.keys(files).sort(),
    text: (name) => {
      const f = files[name];
      if (!f) throw new Error(`no entry ${name}`);
      return strFromU8(f);
    },
  };
}

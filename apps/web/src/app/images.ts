// Prepares a photo of a certificate before it is stored (M3 plan, web app design). Drawing the photo onto a canvas and
// saving it again as a JPEG drops every piece of metadata (location, camera, time). Boxes the person drew are pixelated
// first, so what is behind them can not be read back. Tests replace this module; jsdom has no canvas.
import type { RedactBox } from '@sta/ui';

export const MAX_EDGE = 1600;
export const BLOCK = 12;
export const JPEG_QUALITY = 0.8;

export type PreparedImage = { data: Uint8Array; mime: 'image/jpeg' };

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare photos.');
  return ctx;
}

/** Replaces the area with 12 pixel blocks of its average colour. */
function pixelate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  if (w < 1 || h < 1) return;
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.ceil(w / BLOCK));
  small.height = Math.max(1, Math.ceil(h / BLOCK));
  const sctx = context(small);
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

export async function prepareImage(file: File, redactions: RedactBox[]): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = context(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const box of redactions) {
      const x = Math.max(0, Math.floor(box.x * width));
      const y = Math.max(0, Math.floor(box.y * height));
      const w = Math.min(width - x, Math.ceil(box.w * width));
      const h = Math.min(height - y, Math.ceil(box.h * height));
      pixelate(ctx, x, y, w, h);
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) throw new Error('This browser cannot prepare photos.');
    return { data: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

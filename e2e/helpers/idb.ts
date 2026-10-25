import type { Page } from '@playwright/test';

/** Reads one object store straight from IndexedDB (the app's own database), as the demo admin dump would. */
export async function readStore(page: Page, store: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (name) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const open = indexedDB.open('sta-demo');
        open.onerror = () => {
          reject(new Error('cannot open sta-demo'));
        };
        open.onsuccess = () => {
          const req = open.result.transaction(name, 'readonly').objectStore(name).getAll();
          req.onsuccess = () => {
            resolve(req.result as Record<string, unknown>[]);
          };
          req.onerror = () => {
            reject(new Error('read failed'));
          };
        };
      }),
    store,
  );
}

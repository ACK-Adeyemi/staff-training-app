// M5 chunk 4 (BP-2, F-2): the service worker adapter. Written before the implementation.
//
// API CONTRACT (apps/web/src/app/pwa.ts, plus apps/web/src/app/usePwa.ts)
//   type PwaState  = { needRefresh: boolean; offlineReady: boolean }
//   type PwaHandle = {
//     getState(): PwaState;                       // stable object between changes (safe for useSyncExternalStore)
//     subscribe(listener: () => void): () => void; // returns an unsubscribe function
//     update(): Promise<void>;                     // activates the waiting worker and reloads; resolves immediately when unsupported
//   }
//   register(): PwaHandle   idempotent: every call returns the same handle.
//                           A no-op in Vitest, in dev (import.meta.env.DEV) and when navigator.serviceWorker is missing:
//                           both flags stay false and nothing is registered. It reaches virtual:pwa-register only
//                           through a dynamic import() on the supported path, so tests never need that module.
//   usePwa(): PwaState & { update(): Promise<void> }   (usePwa.ts) React hook over register() via useSyncExternalStore.
// Components and tests replace the adapter with vi.mock('./pwa', () => ({ register: () => fakeHandle })).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from './pwa';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pwa adapter', () => {
  it('starts with both flags false', () => {
    const h = register();
    expect(h.getState()).toEqual({ needRefresh: false, offlineReady: false });
  });

  it('is idempotent: register() returns the same handle', () => {
    expect(register()).toBe(register());
  });

  it('is a no-op without serviceWorker support: nothing is registered and update resolves', async () => {
    const registerSw = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: undefined });
    const h = register();
    expect(h.getState().needRefresh).toBe(false);
    await expect(h.update()).resolves.toBeUndefined();
    expect(registerSw).not.toHaveBeenCalled();
  });

  it('does not register a service worker in the test environment even when the browser supports it', () => {
    const registerSw = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', {
      serviceWorker: { register: registerSw, ready: new Promise(() => undefined) },
    });
    register();
    expect(registerSw).not.toHaveBeenCalled();
  });

  it('subscribe returns an unsubscribe function and never calls the listener when nothing changes', () => {
    const listener = vi.fn();
    const off = register().subscribe(listener);
    expect(typeof off).toBe('function');
    off();
    expect(listener).not.toHaveBeenCalled();
  });

  it('update() does not reload the page', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    await register().update();
    expect(reload).not.toHaveBeenCalled();
  });
});

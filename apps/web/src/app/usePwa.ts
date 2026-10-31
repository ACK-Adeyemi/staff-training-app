import { useSyncExternalStore } from 'react';
import { register, type PwaState } from './pwa';

/** The service worker state, and a function that applies a waiting update. */
export function usePwa(): PwaState & { update: () => Promise<void> } {
  const h = register();
  const state = useSyncExternalStore(h.subscribe, h.getState);
  return { ...state, update: h.update };
}

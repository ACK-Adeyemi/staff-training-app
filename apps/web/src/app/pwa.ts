// Service worker adapter (build pack BP-2). The only file that touches virtual:pwa-register.
export type PwaState = { needRefresh: boolean; offlineReady: boolean };
export type PwaHandle = {
  getState: () => PwaState;
  subscribe: (listener: () => void) => () => void;
  update: () => Promise<void>;
};

let handle: PwaHandle | undefined;

/** Registers the worker once. A no-op in tests, in dev and where service workers are missing. */
export function register(): PwaHandle {
  if (handle) return handle;
  let state: PwaState = { needRefresh: false, offlineReady: false };
  const listeners = new Set<() => void>();
  let updateSw: ((reload?: boolean) => Promise<void>) | undefined;
  const set = (next: Partial<PwaState>): void => {
    state = { ...state, ...next };
    listeners.forEach((l) => {
      l();
    });
  };
  const supported =
    !import.meta.env.DEV &&
    import.meta.env.MODE !== 'test' &&
    typeof navigator !== 'undefined' &&
    !!navigator.serviceWorker;
  if (supported) {
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        updateSw = registerSW({
          onNeedRefresh: () => {
            set({ needRefresh: true });
          },
          onOfflineReady: () => {
            set({ offlineReady: true });
          },
        });
      })
      .catch(() => undefined);
  }
  handle = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: async () => {
      if (updateSw) await updateSw(true);
    },
  };
  return handle;
}

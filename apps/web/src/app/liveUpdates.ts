// Live updates (plan Assumption 16): the store says which stores changed (names only, never data); this tab
// refreshes its queries and tells other tabs on a BroadcastChannel. Same-tab updates work without the channel.
import type { StoreHandle } from '@sta/data';

export type LiveUpdatesOptions = {
  subscribe: StoreHandle['subscribe'];
  /** Called with the store names that changed, from this tab or another one. */
  invalidate: (stores: string[]) => void;
};

const CHANNEL = 'sta-data';

function storeNames(data: unknown): string[] | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const stores = (data as { stores?: unknown }).stores;
  if (!Array.isArray(stores) || !stores.every((s) => typeof s === 'string')) return undefined;
  return stores;
}

/** Returns a function that stops listening. */
export function connectLiveUpdates({ subscribe, invalidate }: LiveUpdatesOptions): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        const stores = storeNames(event.data);
        if (stores) invalidate(stores);
      };
    }
  } catch {
    channel = undefined;
  }

  const unsubscribe = subscribe((stores) => {
    const names = [...stores];
    invalidate(names);
    try {
      channel?.postMessage({ stores: names });
    } catch {
      // The channel is only a convenience; this tab is already up to date.
    }
  });

  return () => {
    unsubscribe();
    try {
      channel?.close();
    } catch {
      // Nothing to do.
    }
  };
}

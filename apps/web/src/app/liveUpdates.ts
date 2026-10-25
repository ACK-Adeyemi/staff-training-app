// Scaffolding only: the implementation arrives with M1 chunk 8 (plan Assumption 16).
import type { StoreHandle } from '@sta/data';

export type LiveUpdatesOptions = {
  subscribe: StoreHandle['subscribe'];
  /** Called with the store names that changed, from this tab or another one. */
  invalidate: (stores: string[]) => void;
};

/** Returns a function that stops listening. */
export function connectLiveUpdates(options: LiveUpdatesOptions): () => void {
  throw new Error(`connectLiveUpdates is not implemented yet (${typeof options})`);
}

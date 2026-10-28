import type { DataStore } from '@sta/data';

const text = (value: unknown, fallback: string): string => {
  if (value instanceof Error) return value.message || fallback;
  return typeof value === 'string' && value ? value : fallback;
};

/**
 * Records uncaught errors and unhandled rejections on this device only (store.telemetry.recordLocalError).
 * Returns a function that removes the handlers. Recording must never throw.
 */
export function listenForLocalErrors(store: DataStore, target: Window = window): () => void {
  const record = (name: string, message: string) => {
    store.telemetry
      .recordLocalError({ name: name.slice(0, 120) || 'Error', message: message.slice(0, 500) })
      .catch(() => undefined);
  };
  const onError = (e: ErrorEvent) => {
    record(e.error instanceof Error ? e.error.name : 'Error', text(e.error, e.message));
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const reason: unknown = e.reason;
    record(reason instanceof Error ? reason.name : 'UnhandledRejection', text(reason, 'Unhandled rejection'));
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

/** For the error boundary: the same recorder, for an error React caught. */
export function recordCaughtError(store: DataStore, error: unknown): void {
  const name = error instanceof Error ? error.name : 'Error';
  store.telemetry
    .recordLocalError({ name: name.slice(0, 120) || 'Error', message: text(error, 'Unknown error').slice(0, 500) })
    .catch(() => undefined);
}

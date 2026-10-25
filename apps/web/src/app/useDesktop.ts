import { useSyncExternalStore } from 'react';

const query = '(min-width: 48rem)';

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onChange);
  return () => {
    mql.removeEventListener('change', onChange);
  };
}
const snapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** True at tablet width and above. Phone layout when matchMedia is missing (tests). */
export function useDesktop(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** True when `reset=1` is in the query string (before the hash) or at the end of the hash route (`#/staff?reset=1`). */
export function wantsReset(search: string, hash: string): boolean {
  if (new URLSearchParams(search).get('reset') === '1') return true;
  const q = hash.indexOf('?');
  return q >= 0 && new URLSearchParams(hash.slice(q)).get('reset') === '1';
}

/** The address with `reset` removed from both places, keeping every other parameter. */
export function withoutReset(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('reset');
  const q = url.hash.indexOf('?');
  if (q >= 0) {
    const params = new URLSearchParams(url.hash.slice(q));
    params.delete('reset');
    const rest = params.toString();
    url.hash = url.hash.slice(0, q) + (rest ? `?${rest}` : '');
  }
  return url.toString();
}

/** Typing `#/staff?reset=1` over an open page changes only the hash, so nothing reloads. This gives the address that does: reset in the query, route kept in the hash. Null when the hash has no reset. */
export function reloadAddressForHashReset(href: string): string | null {
  const url = new URL(href);
  if (!wantsReset('', url.hash)) return null;
  const clean = new URL(withoutReset(href));
  clean.searchParams.set('reset', '1');
  return clean.toString();
}

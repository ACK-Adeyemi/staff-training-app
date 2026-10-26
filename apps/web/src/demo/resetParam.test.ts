import { describe, expect, it } from 'vitest';
import { reloadAddressForHashReset, wantsReset, withoutReset } from './resetParam';

describe('reset parameter', () => {
  it('is found before the hash and at the end of the route', () => {
    expect(wantsReset('?reset=1', '#/staff')).toBe(true);
    expect(wantsReset('', '#/staff?reset=1')).toBe(true);
    expect(wantsReset('?reset=0&clear=1', '#/staff')).toBe(false);
    expect(wantsReset('', '#/staff')).toBe(false);
  });
  it('is removed from both places and keeps other parameters', () => {
    expect(withoutReset('https://x.test/app/?reset=1#/staff')).toBe('https://x.test/app/#/staff');
    expect(withoutReset('https://x.test/app/#/staff?reset=1')).toBe('https://x.test/app/#/staff');
    expect(withoutReset('https://x.test/app/#/staff?a=1&reset=1')).toBe('https://x.test/app/#/staff?a=1');
  });
});

describe('reloadAddressForHashReset', () => {
  it('moves reset to the query so the page reloads, and ignores other hashes', () => {
    expect(reloadAddressForHashReset('https://x.test/app/#/staff?reset=1')).toBe('https://x.test/app/?reset=1#/staff');
    expect(reloadAddressForHashReset('https://x.test/app/#/staff')).toBeNull();
  });
});

// M5 chunk 5 (F-4): second interface language. Written before the implementation.
// Contract assumed:
//   languages['pl-PL'] = { label: 'Polski', machineTranslated: true, load: () => Promise<messages> }  (load is an async
//     function wrapping a dynamic import of ./lang/pl-PL.json; the Polish messages are NOT a property of the entry object).
//   languages['en-GB'] = { label: 'English (UK)', messages, ... } (machineTranslated false or absent).
//   createT(messages, { strict?, fallback? }): `options.fallback` is the en-GB messages used when a key is missing.
//   packages/content/src/lang/pl-PL.json: a partial overlay of en-GB.
import { describe, expect, it } from 'vitest';
import { createT, languages } from './i18n';
import enGB from './lang/en-GB.json' with { type: 'json' };
import plPL from './lang/pl-PL.json' with { type: 'json' };

const flatten = (node: unknown, prefix = ''): Map<string, string> => {
  const out = new Map<string, string>();
  if (typeof node === 'string') out.set(prefix, node);
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) for (const [kk, vv] of flatten(v, prefix ? `${prefix}.${k}` : k)) out.set(kk, vv);
  return out;
};
const placeholders = (s: string): string[] => [...s.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]!).sort();

const reg = languages as unknown as Record<
  string,
  { label: string; machineTranslated?: boolean; messages?: unknown; load?: () => Promise<unknown> }
>;

describe('languages registry', () => {
  it('registers pl-PL as Polski, machine translated', () => {
    expect(reg['pl-PL']?.label).toBe('Polski');
    expect(reg['pl-PL']?.machineTranslated).toBe(true);
  });

  it('keeps English (UK) first and not machine translated', () => {
    expect(Object.keys(languages)[0]).toBe('en-GB');
    expect(reg['en-GB']?.label).toBe('English (UK)');
    expect(reg['en-GB']?.machineTranslated ?? false).toBe(false);
  });

  it('does not hold the Polish messages in the entry object, so English users never download them', () => {
    expect(reg['pl-PL']?.messages).toBeUndefined();
  });

  it('loads pl-PL through an async loader', async () => {
    const load = reg['pl-PL']?.load;
    expect(typeof load).toBe('function');
    expect(load!.constructor.name).toBe('AsyncFunction');
    const result = load!();
    expect(result).toBeInstanceOf(Promise);
    const loaded = (await result) as Record<string, unknown>;
    const messages = (loaded['default'] ?? loaded) as Record<string, unknown>;
    expect(flatten(messages).size).toBeGreaterThan(0);
  });
});

describe('Polish t with an English fallback', () => {
  const en = { a: 'Hello', b: 'Hi {name}', nested: { c: 'Deep' }, onlyEn: 'Only English' };
  const pl = { a: 'Czesc', nested: {} };
  const make = (strict: boolean) =>
    createT(pl as never, { strict, fallback: en as never } as never) as unknown as (
      key: string,
      params?: Record<string, string | number>,
    ) => string;

  it('uses the Polish text when the key exists', () => {
    expect(make(true)('a')).toBe('Czesc');
  });

  it('falls back to English for a missing key and never returns the raw key', () => {
    expect(make(true)('onlyEn')).toBe('Only English');
    expect(make(false)('nested.c')).toBe('Deep');
  });

  it('fills placeholders in a fallback message', () => {
    expect(make(true)('b', { name: 'Kasia' })).toBe('Hi Kasia');
  });

  it('still throws in strict mode when the key is in neither language', () => {
    expect(() => make(true)('nowhere')).toThrow(/nowhere/);
  });
});

describe('pl-PL.json', () => {
  const en = flatten(enGB);
  const pl = flatten(plPL);

  it('has some translated keys', () => {
    expect(pl.size).toBeGreaterThan(0);
  });

  it('only uses keys that exist in en-GB', () => {
    expect([...pl.keys()].filter((k) => !en.has(k))).toEqual([]);
  });

  it('uses exactly the same {placeholders} as en-GB for every key', () => {
    const wrong = [...pl].filter(([k, v]) => JSON.stringify(placeholders(v)) !== JSON.stringify(placeholders(en.get(k) ?? '')));
    expect(wrong.map(([k]) => k)).toEqual([]);
  });

  it('has no empty messages', () => {
    expect([...pl].filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([]);
  });

  it('translates the shell, staff nav and Me language keys', () => {
    for (const k of ['nav.staff.home', 'nav.staff.me', 'me.title', 'me.languageTitle', 'me.languageMachineNote'])
      expect(pl.has(k), k).toBe(true);
  });

  it('creates a working Polish t over en-GB for the whole key set', () => {
    const t = createT(plPL as never, { strict: true, fallback: enGB } as never) as unknown as (k: string) => string;
    expect(t('nav.staff.me')).toBe(pl.get('nav.staff.me'));
    for (const k of en.keys()) if (!pl.has(k)) expect(t(k.includes('{') ? 'me.title' : k)).toBeTruthy();
  });
});

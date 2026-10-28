// M3 chunk 5 (BP-7): theme presets all pass validateTheme (assumption 51).
// Contract: themes/presets.ts exports themeBases: { light: ThemeBase; dark: ThemeBase } and
// themePresets: { id; nameKey; mode: 'light' | 'dark'; tokens: ThemeTokens }[]
import { describe, expect, it } from 'vitest';
import { themeTokensSchema, validateTheme } from '@sta/domain';
import enGB from '../lang/en-GB.json';
import { themeBases, themePresets } from './presets';

const names = [
  'Default light',
  'Default dark',
  'Christmas',
  'Halloween',
  'Easter',
  'New Year',
  'Spring',
  'Summer',
  'Bonfire Night',
  'Diwali',
  'Eid',
];
const nameOf = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), enGB);

describe('theme presets', () => {
  it('has the eleven presets with unique ids and real names', () => {
    expect(themePresets).toHaveLength(11);
    expect(new Set(themePresets.map((p) => p.id)).size).toBe(11);
    expect(themePresets.map((p) => nameOf(p.nameKey)).sort()).toEqual([...names].sort());
  });

  it('uses only allowlisted tokens', () => {
    for (const p of themePresets) expect(themeTokensSchema.safeParse(p.tokens).success, p.id).toBe(true);
  });

  it('passes validateTheme for every preset against its own base', () => {
    for (const p of themePresets) {
      const r = validateTheme(p.tokens, themeBases[p.mode]);
      expect(r.failures, p.id).toEqual([]);
      expect(r.ok, p.id).toBe(true);
    }
  });

  it('has a light and a dark default', () => {
    expect(themePresets.filter((p) => p.mode === 'dark').length).toBeGreaterThanOrEqual(1);
    expect(themePresets.filter((p) => p.mode === 'light').length).toBeGreaterThanOrEqual(1);
  });

  it('has bases that are real colours', () => {
    for (const b of Object.values(themeBases)) for (const c of Object.values(b)) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

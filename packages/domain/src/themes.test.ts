// BP-7 (pure part): theme contrast rules, which theme is active and the CSS variables (brief 19.4; M3 assumptions 51 and 52).
//
// API under test (themes.ts):
//   contrastRatio(a: string, b: string): number       // WCAG 2.x ratio of two #rrggbb colours, 1 to 21, symmetric, case-insensitive
//   validateTheme(tokens: ThemeTokens, base: ThemeBase): { ok: boolean; failures: { pair: ThemePair; ratio: number; required: number }[] }
//       ThemeBase = { text: string; buttonText: string; background: string }   (the colours the app uses with the theme)
//       ThemePair = 'textOnBackground' | 'textOnTint' | 'buttonTextOnPrimary' | 'primaryOnBackground' | 'accentOnBackground'
//       text pairs and button text need 4.5, primary and accent against the background need 3 (UI components)
//   activeTheme(themes: Theme[], settings: { themeId?: string }, now: Date, side: 'staff' | 'admin'): Theme | null
//       a scheduled theme with startAt <= now < endAt that applies to `side` wins over the base theme (settings.themeId);
//       when several scheduled themes match, the latest startAt wins; null when nothing applies
//   themeCssVariables(theme: Theme, access?: { contrast: 'standard' | 'high'; colourMode: 'light' | 'dark' }): Record<string, string>
//       keys --theme-primary, --theme-accent, --theme-tint (the token values) and --theme-radius; colours are left out when
//       contrast is high or the colour mode is dark, the radius stays
import { describe, expect, it } from 'vitest';
import type { Theme } from './schemas/admin';
import { activeTheme, contrastRatio, themeCssVariables, validateTheme } from './themes';

const BASE = { text: '#1a1a1a', buttonText: '#ffffff', background: '#ffffff' };
const GOOD = { primary: '#1d4ed8', accent: '#0f766e', backgroundTint: '#f1f5f9', radius: 'md' as const };

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('is the same whichever colour comes first and ignores hex case', () => {
    expect(contrastRatio('#1D4ED8', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#1d4ed8'), 10);
  });

  it('matches the published WCAG values for mid greys on white', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeGreaterThan(4.4);
  });
});

describe('validateTheme', () => {
  it('accepts tokens that meet every rule', () => {
    expect(validateTheme(GOOD, BASE)).toEqual({ ok: true, failures: [] });
  });

  it('lists button text on primary and primary on the background when primary is a pale yellow', () => {
    const result = validateTheme({ ...GOOD, primary: '#facc15' }, BASE);
    expect(result.ok).toBe(false);
    const pairs = result.failures.map((f) => f.pair);
    expect(pairs).toContain('buttonTextOnPrimary');
    expect(pairs).toContain('primaryOnBackground');
    expect(pairs).not.toContain('accentOnBackground');
    const button = result.failures.find((f) => f.pair === 'buttonTextOnPrimary');
    expect(button?.required).toBe(4.5);
    expect(button?.ratio).toBeLessThan(4.5);
    expect(result.failures.find((f) => f.pair === 'primaryOnBackground')?.required).toBe(3);
  });

  it('lists the accent when it is too faint against the background', () => {
    const result = validateTheme({ ...GOOD, accent: '#e5e7eb' }, BASE);
    expect(result.failures.map((f) => f.pair)).toEqual(['accentOnBackground']);
  });

  it('lists text on the tint when the tint is too dark for the text', () => {
    const result = validateTheme({ ...GOOD, backgroundTint: '#555555' }, BASE);
    expect(result.failures.map((f) => f.pair)).toEqual(['textOnTint']);
  });

  it('uses 4.5 for button text: #767676 passes and #777777 fails', () => {
    expect(validateTheme({ ...GOOD, primary: '#767676' }, BASE).ok).toBe(true);
    const bad = validateTheme({ ...GOOD, primary: '#777777' }, BASE);
    expect(bad.failures.map((f) => f.pair)).toEqual(['buttonTextOnPrimary']);
  });

  it('reports every failing pair at once, not just the first', () => {
    const result = validateTheme(
      { primary: '#facc15', accent: '#e5e7eb', backgroundTint: '#555555', radius: 'sm' },
      BASE,
    );
    expect(new Set(result.failures.map((f) => f.pair))).toEqual(
      new Set(['textOnTint', 'buttonTextOnPrimary', 'primaryOnBackground', 'accentOnBackground']),
    );
  });

  it('checks against the base it is given (a dark base changes the answer)', () => {
    const dark = { text: '#f5f5f5', buttonText: '#000000', background: '#121212' };
    const tokens = { primary: '#93c5fd', accent: '#5eead4', backgroundTint: '#1e293b', radius: 'md' as const };
    expect(validateTheme(tokens, dark).ok).toBe(true);
    expect(validateTheme(tokens, BASE).ok).toBe(false);
  });
});

const ID = (n: number): string => `01HZX${String(n).padStart(21, '0')}`;
const theme = (n: number, over: Partial<Theme> = {}): Theme => ({
  id: ID(n),
  name: `Theme ${n}`,
  tokens: GOOD,
  appliesTo: { staff: true, admin: true },
  ...over,
});
const base = theme(1, { name: 'Base' });
const christmas = theme(2, {
  name: 'Christmas',
  tokens: { ...GOOD, primary: '#b91c1c' },
  schedule: { startAt: '2026-12-01T00:00:00.000Z', endAt: '2027-01-07T00:00:00.000Z' },
});

describe('activeTheme', () => {
  const themes = [base, christmas];
  const settings = { themeId: base.id };

  it('uses the base theme outside any schedule', () => {
    expect(activeTheme(themes, settings, new Date('2026-11-30T23:59:00.000Z'), 'staff')?.id).toBe(base.id);
  });

  it('switches Christmas on at 1 December and off after 6 January', () => {
    expect(activeTheme(themes, settings, new Date('2026-12-01T09:00:00.000Z'), 'staff')?.id).toBe(christmas.id);
    expect(activeTheme(themes, settings, new Date('2027-01-06T20:00:00.000Z'), 'admin')?.id).toBe(christmas.id);
    expect(activeTheme(themes, settings, new Date('2027-01-07T09:00:00.000Z'), 'staff')?.id).toBe(base.id);
  });

  it('includes the start instant and excludes the end instant', () => {
    expect(activeTheme(themes, settings, new Date('2026-12-01T00:00:00.000Z'), 'staff')?.id).toBe(christmas.id);
    expect(activeTheme(themes, settings, new Date('2027-01-07T00:00:00.000Z'), 'staff')?.id).toBe(base.id);
  });

  it('respects appliesTo for each side', () => {
    const staffOnly = { ...christmas, appliesTo: { staff: true, admin: false } };
    const now = new Date('2026-12-10T09:00:00.000Z');
    expect(activeTheme([base, staffOnly], settings, now, 'staff')?.id).toBe(christmas.id);
    expect(activeTheme([base, staffOnly], settings, now, 'admin')?.id).toBe(base.id);
  });

  it('prefers the scheduled theme that started last when two overlap', () => {
    const later = theme(3, { schedule: { startAt: '2026-12-10T00:00:00.000Z', endAt: '2026-12-20T00:00:00.000Z' } });
    expect(activeTheme([base, christmas, later], settings, new Date('2026-12-12T09:00:00.000Z'), 'staff')?.id).toBe(
      later.id,
    );
  });

  it('returns null when there is no base theme and nothing is scheduled', () => {
    expect(activeTheme([base, christmas], {}, new Date('2026-06-01T09:00:00.000Z'), 'staff')).toBeNull();
    expect(activeTheme([], { themeId: base.id }, new Date('2026-06-01T09:00:00.000Z'), 'staff')).toBeNull();
  });
});

describe('themeCssVariables', () => {
  it('maps the colour tokens and radius to variables', () => {
    const vars = themeCssVariables(theme(4, { tokens: { ...GOOD, radius: 'lg' } }));
    expect(vars['--theme-primary']).toBe(GOOD.primary);
    expect(vars['--theme-accent']).toBe(GOOD.accent);
    expect(vars['--theme-tint']).toBe(GOOD.backgroundTint);
    expect(vars['--theme-radius']).toBeTruthy();
  });

  it('gives different radii for sm and lg', () => {
    const sm = themeCssVariables(theme(5, { tokens: { ...GOOD, radius: 'sm' } }))['--theme-radius'];
    const lg = themeCssVariables(theme(6, { tokens: { ...GOOD, radius: 'lg' } }))['--theme-radius'];
    expect(sm).not.toBe(lg);
  });

  it('never emits status, error or success colours', () => {
    const keys = Object.keys(themeCssVariables(theme(7)));
    expect(keys.filter((k) => /status|error|success|danger|warning/i.test(k))).toEqual([]);
  });

  it('leaves colours out under high contrast but keeps the radius', () => {
    const t = theme(8, { tokens: { ...GOOD, radius: 'lg' } });
    const vars = themeCssVariables(t, { contrast: 'high', colourMode: 'light' });
    expect(vars['--theme-primary']).toBeUndefined();
    expect(vars['--theme-accent']).toBeUndefined();
    expect(vars['--theme-tint']).toBeUndefined();
    expect(vars['--theme-radius']).toBe(themeCssVariables(t)['--theme-radius']);
  });

  it('leaves colours out in dark mode but keeps the radius', () => {
    const vars = themeCssVariables(theme(9), { contrast: 'standard', colourMode: 'dark' });
    expect(vars['--theme-primary']).toBeUndefined();
    expect(vars['--theme-radius']).toBeTruthy();
  });

  it('applies colours for standard contrast in light mode', () => {
    expect(themeCssVariables(theme(10), { contrast: 'standard', colourMode: 'light' })['--theme-primary']).toBe(
      GOOD.primary,
    );
  });
});

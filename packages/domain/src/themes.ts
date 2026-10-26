// Theme contrast rules, the active theme and its CSS variables (brief 19.4; M3 assumptions 51 and 52).
import type { Theme } from './schemas/admin';

export type ThemeTokens = Theme['tokens'];
export type ThemeBase = { text: string; buttonText: string; background: string };
export type ThemePair =
  'textOnBackground' | 'textOnTint' | 'buttonTextOnPrimary' | 'primaryOnBackground' | 'accentOnBackground';

const channel = (hex: string, at: number): number => {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function validateTheme(
  tokens: ThemeTokens,
  base: ThemeBase,
): { ok: boolean; failures: { pair: ThemePair; ratio: number; required: number }[] } {
  const checks: [ThemePair, string, string, number][] = [
    ['textOnTint', base.text, tokens.backgroundTint, 4.5],
    ['buttonTextOnPrimary', base.buttonText, tokens.primary, 4.5],
    ['primaryOnBackground', tokens.primary, base.background, 3],
    ['accentOnBackground', tokens.accent, base.background, 3],
  ];
  const failures = checks
    .map(([pair, a, b, required]) => ({ pair, ratio: contrastRatio(a, b), required }))
    .filter((c) => c.ratio < c.required);
  return { ok: failures.length === 0, failures };
}

/** The theme in force: the latest-starting scheduled theme for this side, else the base theme, else null. */
export function activeTheme(
  themes: Theme[],
  settings: { themeId?: string },
  now: Date,
  side: 'staff' | 'admin',
): Theme | null {
  const t = now.getTime();
  const scheduled = themes
    .flatMap((x) =>
      x.appliesTo[side] && x.schedule && Date.parse(x.schedule.startAt) <= t && t < Date.parse(x.schedule.endAt)
        ? [{ theme: x, start: Date.parse(x.schedule.startAt) }]
        : [],
    )
    .sort((a, b) => b.start - a.start);
  if (scheduled[0]) return scheduled[0].theme;
  return themes.find((x) => x.id === settings.themeId) ?? null;
}

const RADIUS = { sm: '4px', md: '8px', lg: '16px' } as const;

export function themeCssVariables(
  theme: Theme,
  access?: { contrast: 'standard' | 'high'; colourMode: 'light' | 'dark' },
): Record<string, string> {
  const vars: Record<string, string> = { '--theme-radius': RADIUS[theme.tokens.radius] };
  if (access && (access.contrast === 'high' || access.colourMode === 'dark')) return vars;
  vars['--theme-primary'] = theme.tokens.primary;
  vars['--theme-accent'] = theme.tokens.accent;
  vars['--theme-tint'] = theme.tokens.backgroundTint;
  return vars;
}

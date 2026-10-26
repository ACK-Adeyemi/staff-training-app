// M2 chunk 5 (F-8): nursery default categories (assumption 35), module map and coming soon cards.
import { describe, expect, it } from 'vitest';
import { CATEGORY_COLOURS } from '@sta/domain';
import { readFileSync } from 'node:fs';
import { moduleIds } from '../moduleIds';
import { contentId } from '../contentId';
import enGB from '../../lang/en-GB.json' with { type: 'json' };
import { nurseryCategories, nurseryModuleCategory } from './categories';
import { nurseryComingSoon } from './comingSoon';

const iconSource = readFileSync(new URL('../../../../ui/src/components/Icon.tsx', import.meta.url), 'utf8');
const iconKeys = new Set(
  [...(iconSource.match(/export type IconName =([^;]*);/)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]),
);

const lang = (key: string): string | undefined =>
  key
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), enGB) as
    string | undefined;

describe('moduleIds.saferSleep', () => {
  it('is the content id 207 and distinct from every other module id', () => {
    expect(moduleIds.saferSleep).toBe(contentId(207));
    const all = Object.values(moduleIds);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('nursery default categories', () => {
  it('has the six categories in order', () => {
    expect(nurseryCategories.map((c) => c.name)).toEqual([
      'Safeguarding',
      'Health and safety',
      'Food and nutrition',
      'Sleep and wellbeing',
      'Induction',
      'Our policies',
    ]);
  });

  it('has unique keys and names (ignoring case), names 1 to 40 characters', () => {
    expect(new Set(nurseryCategories.map((c) => c.key)).size).toBe(6);
    expect(new Set(nurseryCategories.map((c) => c.name.toLowerCase())).size).toBe(6);
    for (const c of nurseryCategories) {
      expect(c.name.length).toBeGreaterThanOrEqual(1);
      expect(c.name.length).toBeLessThanOrEqual(40);
    }
  });

  it('uses colour keys from the fixed 8-key palette', () => {
    expect(CATEGORY_COLOURS).toHaveLength(8);
    for (const c of nurseryCategories) expect(CATEGORY_COLOURS as readonly string[], c.key).toContain(c.colour);
  });

  it('uses icon keys that exist in the UI Icon set', () => {
    expect(iconKeys.size).toBeGreaterThan(5);
    for (const c of nurseryCategories) expect(iconKeys.has(c.icon), `${c.key}: ${c.icon}`).toBe(true);
  });
});

describe('nursery module to category map', () => {
  const keys = () => nurseryCategories.map((c) => c.key);
  it('maps the modules as the plan says', () => {
    expect(nurseryModuleCategory[moduleIds.safeguardingAndWhistleblowing]).toBe('safeguarding');
    expect(nurseryModuleCategory[moduleIds.whatChangedSeptember2026]).toBe('safeguarding');
    expect(nurseryModuleCategory[moduleIds.paediatricFirstAid]).toBe('healthAndSafety');
    expect(nurseryModuleCategory[moduleIds.safeEatingAllergiesAndChoking]).toBe('foodAndNutrition');
    expect(nurseryModuleCategory[moduleIds.saferSleep]).toBe('sleepAndWellbeing');
  });

  it('only points at defined category keys', () => {
    for (const [moduleId, key] of Object.entries(nurseryModuleCategory)) {
      expect(keys(), moduleId).toContain(key);
    }
  });
});

describe('nursery coming soon cards', () => {
  it('has five Tier 2 and five Tier 3 topics', () => {
    expect(nurseryComingSoon.filter((c) => c.tier === 2)).toHaveLength(5);
    expect(nurseryComingSoon.filter((c) => c.tier === 3)).toHaveLength(5);
    expect(nurseryComingSoon).toHaveLength(10);
  });

  it('has unique ids, existing title keys and valid category keys', () => {
    expect(new Set(nurseryComingSoon.map((c) => c.id)).size).toBe(10);
    for (const c of nurseryComingSoon) {
      expect(typeof lang(c.titleKey), c.titleKey).toBe('string');
      expect(
        nurseryCategories.map((k) => k.key),
        c.id,
      ).toContain(c.categoryKey);
    }
  });

  it('names the brief 7 topics', () => {
    const titles = nurseryComingSoon.map((c) => `${c.tier}|${lang(c.titleKey)}`.toLowerCase()).join('\n');
    for (const [tier, word] of [
      [2, 'suitable people'],
      [2, 'ratios'],
      [2, 'risk assessment'],
      [2, 'medicines'],
      [2, 'records'],
      [3, 'learning and development'],
      [3, 'assessment'],
      [3, 'send'],
      [3, 'behaviour'],
      [3, 'induction and supervision'],
    ] as const) {
      expect(titles, word).toMatch(new RegExp(`${tier}\\|[^\\n]*${word}`));
    }
  });
});

// M2 chunk 5 (F-8): levels and badge definitions live in content (plan assumptions 5 and 6).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levelFor } from '@sta/domain';
import { moduleIds } from '../packs/moduleIds';
import enGB from '../lang/en-GB.json' with { type: 'json' };
import levels from './levels.json' with { type: 'json' };
import badges from './badges.json' with { type: 'json' };

const lang = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), enGB);

const iconSource = readFileSync(new URL('../../../ui/src/components/Icon.tsx', import.meta.url), 'utf8');
const iconKeys = new Set(
  [...(iconSource.match(/export type IconName =([^;]*);/)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]),
);

describe('engagement/levels.json', () => {
  it('has the ten placeholder thresholds and an 800 step after the table', () => {
    expect(levels.thresholds).toEqual([0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200]);
    expect(levels.stepAfterTable).toBe(800);
  });

  it('drives levelFor: level 1 at 0, level 2 at 100, level 10 at 3200, level 11 at 4000', () => {
    const f = (xp: number) => levelFor(xp, levels.thresholds, levels.stepAfterTable);
    expect(f(0).level).toBe(1);
    expect(f(99).level).toBe(1);
    expect(f(100).level).toBe(2);
    expect(f(3200).level).toBe(10);
    expect(f(3999).level).toBe(10);
    expect(f(4000)).toEqual({ level: 11, xpIntoLevel: 0, xpForNext: 800 });
  });
});

describe('engagement/badges.json', () => {
  const kinds = [
    'firstModule',
    'safeguardingReady',
    'mastery',
    'earlyBird',
    'scenarioSavvy',
    'learningHabit',
    'allCompliant',
    'competitionWinner',
  ];

  it('has one definition for each of the eight domain badge kinds', () => {
    expect(badges.map((b) => b.kind).sort()).toEqual([...kinds].sort());
  });

  it('has unique non-empty ids', () => {
    const ids = badges.map((b) => b.id);
    expect(ids.every((i) => typeof i === 'string' && i.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points Safeguarding Ready at the safeguarding module and nothing else has a moduleId', () => {
    for (const b of badges as { kind: string; moduleId?: string }[]) {
      if (b.kind === 'safeguardingReady') expect(b.moduleId).toBe(moduleIds.safeguardingAndWhistleblowing);
      else expect(b.moduleId, b.kind).toBeUndefined();
    }
  });

  it('uses icon keys from the UI Icon set', () => {
    for (const b of badges) expect(iconKeys.has(b.icon), `${b.id}: ${b.icon}`).toBe(true);
  });

  it('has name and description keys that exist in en-GB.json', () => {
    for (const b of badges) {
      expect(typeof lang(b.nameKey), b.nameKey).toBe('string');
      expect(typeof lang(b.descriptionKey), b.descriptionKey).toBe('string');
    }
  });

  it('mentions no speed in any badge description', () => {
    for (const b of badges)
      expect(String(lang(b.descriptionKey))).not.toMatch(/\b(fast|quick|quickly|speed|fastest|seconds)\b/i);
  });
});

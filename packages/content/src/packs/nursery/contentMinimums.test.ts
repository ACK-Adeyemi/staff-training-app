// M5 chunk 2 (F-1): content minimums for nursery modules (build pack 2.4, 9.1, 9.3, 9.5) and the first three Tier 2
// modules by id: Suitable people and vetting, Ratios and qualifications, Risk assessment and outings.
// Plan docs/plans/m5.md, Chunks item 2 and Assumptions 4 and 5. Chunk 3 adds Medicines and Records.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleSchema, type Module } from '@sta/domain';
import { moduleIds } from '../moduleIds';
import { parseLesson } from '../lessonParser';
import { nurseryModules } from './modules';
import { nurseryCategories, nurseryModuleCategory } from './categories';

const here = dirname(fileURLToPath(import.meta.url));
const ids = moduleIds as Record<string, string | undefined>;

const officialHost = (h: string): boolean =>
  h === 'gov.uk' || h.endsWith('.gov.uk') || h === 'nspcc.org.uk' || h.endsWith('.nspcc.org.uk') || h === 'ico.org.uk';

const checkQuestions = (mod: Module): void => {
  for (const q of mod.questions) {
    expect(q.explanation.trim().length, `${q.id} explanation`).toBeGreaterThan(0);
    const links = q.learnMore.filter((l) => l.url);
    expect(links.length, `${q.id} needs a Learn more link`).toBeGreaterThanOrEqual(1);
    for (const l of links) {
      expect(l.url!.startsWith('https://'), `${q.id} ${l.url}`).toBe(true);
      expect(officialHost(new URL(l.url!).hostname), `${q.id} ${l.url}`).toBe(true);
    }
  }
};

describe('every nursery provider module meets the minimums', () => {
  it('has at least one module to check', () => {
    expect(nurseryModules.length).toBeGreaterThanOrEqual(6);
  });

  it.each(nurseryModules.map((m) => [m.title, m] as const))('%s', (_t, mod) => {
    expect(mod.lessons.length).toBeGreaterThanOrEqual(1);
    expect(mod.questions.length).toBeGreaterThanOrEqual(5);
    for (const l of mod.lessons) expect(l.blocks.length, l.id).toBeGreaterThan(0);
    expect(mod.draftContent).toBe(true);
    expect(mod.owner).toBe('provider');
    checkQuestions(mod);
  });
});

interface Tier2 {
  name: string;
  key: string; // moduleIds key
  folder: string;
  category: string;
  paragraphs: number[]; // allowed EYFS 3.x paragraphs (build pack 9.3, brief 7)
}

const tier2: Tier2[] = [
  {
    name: 'Suitable people and vetting',
    key: 'suitablePeople',
    folder: 'suitable-people',
    category: 'safeguarding',
    paragraphs: range(13, 27),
  },
  {
    name: 'Ratios and qualifications',
    key: 'ratios',
    folder: 'ratios',
    category: 'healthAndSafety',
    paragraphs: range(43, 57),
  },
  {
    name: 'Risk assessment and outings',
    key: 'riskAssessment',
    folder: 'risk-assessment',
    category: 'healthAndSafety',
    paragraphs: range(91, 93),
  },
];

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

describe.each(tier2)('Tier 2 module: $name', (spec) => {
  const id = ids[spec.key];
  const mod = nurseryModules.find((m) => id !== undefined && m.id === id) as Module | undefined;
  const dir = join(here, 'modules', spec.folder);

  it('has an id registered in moduleIds, distinct from the others', () => {
    expect(id, `moduleIds.${spec.key}`).toBeDefined();
    expect(Object.values(moduleIds).filter((v) => v === id)).toHaveLength(1);
  });

  it('is registered once in nurseryModules and parses with moduleSchema', () => {
    expect(mod, `${spec.key} missing from nurseryModules`).toBeDefined();
    expect(nurseryModules.filter((m) => m.id === id)).toHaveLength(1);
    expect(moduleSchema.safeParse(mod).success).toBe(true);
  });

  it('is provider-owned, published draft content', () => {
    expect(mod!.owner).toBe('provider');
    expect(mod!.status).toBe('published');
    expect(mod!.draftContent).toBe(true);
  });

  it('has exactly one lesson of 2 to 4 minutes with content', () => {
    expect(mod!.lessons).toHaveLength(1);
    const l = mod!.lessons[0]!;
    expect(l.minutes).toBeGreaterThanOrEqual(2);
    expect(l.minutes).toBeLessThanOrEqual(4);
    expect(l.blocks.length).toBeGreaterThan(0);
  });

  it('has lesson-1.md that parses to the module blocks', () => {
    const file = join(dir, 'lesson-1.md');
    expect(existsSync(file), file).toBe(true);
    expect(mod!.lessons[0]!.blocks).toEqual(parseLesson(readFileSync(file, 'utf8')));
    expect(readdirSync(dir).filter((f) => /^lesson-\d+\.md$/.test(f))).toEqual(['lesson-1.md']);
  });

  it('has at least 5 questions with unique ids', () => {
    expect(mod!.questions.length).toBeGreaterThanOrEqual(5);
    expect(new Set(mod!.questions.map((q) => q.id)).size).toBe(mod!.questions.length);
  });

  it('gives every question an explanation and an https official Learn more link', () => {
    checkQuestions(mod!);
  });

  it('cites an EYFS paragraph in the planned range for every question, with a matching link locator', () => {
    for (const q of mod!.questions) {
      const m = /^EYFS 3\.(\d+)/.exec(q.sourceRef ?? '');
      expect(m, `${q.id} sourceRef "${q.sourceRef}"`).not.toBeNull();
      expect(spec.paragraphs, `${q.id} cites 3.${m?.[1]}`).toContain(Number(m![1]));
      const para = `3.${m![1]}`;
      expect(
        q.learnMore.some(
          (l) => l.url && new URL(l.url).hostname.endsWith('gov.uk') && (l.locator ?? '').includes(para),
        ),
        `${q.id} needs a gov.uk link with locator naming ${para}`,
      ).toBe(true);
    }
  });

  it('carries the Open Government Licence attribution line', () => {
    expect(mod!.sourceAttribution ?? '').toMatch(/Open Government Licence/i);
  });

  it('has a valid category in nurseryModuleCategory', () => {
    const key = nurseryModuleCategory[id!];
    expect(key).toBe(spec.category);
    expect(nurseryCategories.map((c) => c.key)).toContain(key);
  });

  it('names no real companies and has no payment wording', () => {
    const text = JSON.stringify(mod);
    expect(text).not.toMatch(
      /\b(WhatsApp|Facebook|Instagram|TikTok|Google|Apple|Amazon|Tesco|Bright Horizons|Busy Bees)\b/i,
    );
    expect(text).not.toMatch(/\b(subscription|invoice|billing|per seat)\b/i);
  });
});

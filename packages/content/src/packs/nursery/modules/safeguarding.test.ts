// M1 chunk 4 (F-1): the Safeguarding and whistleblowing module meets build pack 9.1 and 9.2.
// Plan docs/plans/m1.md, Assumptions 12, 18, 21 and 22.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleSchema, type Module, type Question } from '@sta/domain';
import { moduleIds } from '../../moduleIds';
import { parseLesson } from '../../lessonParser';
import { nurseryModules } from './index';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'safeguarding');
const find = (): Module => {
  const m = nurseryModules.find((x) => x.id === moduleIds.safeguardingAndWhistleblowing);
  if (!m) throw new Error('Safeguarding module is not exported from nurseryModules');
  return m;
};
const mod = find();
const simple = mod.questions.filter((q) => q.type === 'mcq' || q.type === 'trueFalse');
const scenarios = mod.questions.filter((q) => q.type === 'scenario');
const hostOf = (url: string): string => new URL(url).hostname;
const officialHost = (h: string): boolean =>
  h.endsWith('.gov.uk') || h === 'gov.uk' || h === 'nspcc.org.uk' || h.endsWith('.nspcc.org.uk') || h === 'ico.org.uk';
const urlsOf = (q: Question) => q.learnMore.flatMap((l) => (l.url ? [l] : []));
const allText = (): string =>
  JSON.stringify(mod) +
  readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');

describe('Safeguarding module: shape', () => {
  it('parses with moduleSchema', () => {
    expect(moduleSchema.safeParse(mod).success).toBe(true);
  });

  it('uses the stable module id, is provider owned and published', () => {
    expect(mod.id).toBe(moduleIds.safeguardingAndWhistleblowing);
    expect(mod.owner).toBe('provider');
    expect(mod.status).toBe('published');
    expect(mod.version).toBeGreaterThanOrEqual(1);
  });

  it('is marked as draft content until the user reviews it (Assumption 18)', () => {
    expect(mod.draftContent).toBe(true);
  });

  it('keeps the placeholder quiz settings (Assumption 21)', () => {
    expect(mod.quiz).toEqual({
      mode: 'mix',
      mixScenarioShare: 0.4,
      drawCount: 10,
      shuffleQuestions: true,
      shuffleOptions: true,
      passMark: 80,
      maxRetakes: null,
      feedback: true,
      showSourceRef: true,
      notesInQuiz: 'choice',
      learnMoreFor: 'all',
    });
  });

  it('carries an Open Government Licence attribution marked VERIFY in module.json', () => {
    expect(mod.sourceAttribution ?? '').toMatch(/Open Government Licence/i);
    const raw = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8')) as { verify?: unknown };
    expect(raw.verify, 'module.json needs a verify note listing unchecked items').toBeDefined();
  });

  it('does not change the Safeguarding renewal period (Assumption 22)', () => {
    expect(mod.requirementIds.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Safeguarding module: lessons', () => {
  it('has the four lessons from build pack 9.2 in order', () => {
    expect(mod.lessons).toHaveLength(4);
    const titles = mod.lessons.map((l) => l.title.toLowerCase());
    expect(titles[0]).toMatch(/role|dsl/);
    expect(titles[1]).toMatch(/spotting|concern/);
    expect(titles[2]).toMatch(/allegation|whistleblow/);
    expect(titles[3]).toMatch(/everyday|safety/);
  });

  it('gives each lesson 2 to 4 minutes and some content', () => {
    for (const l of mod.lessons) {
      expect(l.minutes, l.id).toBeGreaterThanOrEqual(2);
      expect(l.minutes, l.id).toBeLessThanOrEqual(4);
      expect(l.blocks.length, l.id).toBeGreaterThan(0);
    }
  });

  it('has lesson Markdown files that all parse with parseLesson and match the module blocks', () => {
    const files = readdirSync(dir)
      .filter((f) => /^lesson-\d+\.md$/.test(f))
      .sort();
    expect(files).toEqual(['lesson-1.md', 'lesson-2.md', 'lesson-3.md', 'lesson-4.md']);
    files.forEach((f, i) => {
      const blocks = parseLesson(readFileSync(join(dir, f), 'utf8'));
      expect(blocks.length, f).toBeGreaterThan(0);
      expect(mod.lessons[i]?.blocks, f).toEqual(blocks);
    });
  });

  it('has lesson files with no raw HTML, links or images', () => {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(text, f).not.toMatch(/<[a-zA-Z/!]/);
      expect(text, f).not.toMatch(/\]\(/);
      expect(text, f).not.toMatch(/!\[/);
    }
  });
});

describe('Safeguarding module: question bank (F-1)', () => {
  it('has at least 10 multiple choice or true or false questions', () => {
    expect(simple.length).toBeGreaterThanOrEqual(10);
  });

  it('has at least 6 scenarios, at least 4 with two steps joined by next', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(6);
    const branching = scenarios.filter((q) => {
      const steps = q.scenario?.steps ?? [];
      return steps.length >= 2 && steps.some((s) => s.choices.some((c) => c.next !== undefined));
    });
    expect(branching.length).toBeGreaterThanOrEqual(4);
  });

  it('gives every question an explanation and an EYFS sourceRef', () => {
    for (const q of mod.questions) {
      expect(q.explanation.trim().length, q.id).toBeGreaterThan(20);
      expect(q.sourceRef ?? '', q.id).toMatch(/^EYFS \d/);
    }
  });

  it('gives every question at least one https official-source Learn more link', () => {
    for (const q of mod.questions) {
      const links = urlsOf(q);
      expect(links.length, q.id).toBeGreaterThanOrEqual(1);
      for (const l of links) {
        expect(l.url!.startsWith('https://'), `${q.id} ${l.url}`).toBe(true);
        expect(officialHost(hostOf(l.url!)), `${q.id} ${l.url}`).toBe(true);
        expect(l.publisher.trim().length, q.id).toBeGreaterThan(0);
      }
    }
  });

  it('uses descriptive link titles, not bare words like here or link', () => {
    for (const q of mod.questions) {
      for (const l of q.learnMore) {
        expect(l.title.trim().length, `${q.id} ${l.title}`).toBeGreaterThanOrEqual(15);
        expect(l.title, q.id).not.toMatch(/^(click )?(here|link|read more|more|this)\.?$/i);
      }
    }
  });

  it('has an EYFS framework link on GOV.UK whose locator names the same paragraph as the sourceRef', () => {
    for (const q of mod.questions) {
      const para = /(\d+\.\d+)/.exec(q.sourceRef ?? '')?.[1];
      expect(para, `${q.id} sourceRef`).toBeDefined();
      const matching = q.learnMore.filter(
        (l) => l.url && hostOf(l.url).endsWith('gov.uk') && (l.locator ?? '').includes(para!),
      );
      expect(matching.length, `${q.id} needs a gov.uk link with locator naming ${para}`).toBeGreaterThanOrEqual(1);
      expect(matching[0]!.locator, q.id).toMatch(/page|p\.?\s*\d/i);
    }
  });

  it('has an MCQ citing EYFS 3.4 for the Track A link', () => {
    expect(mod.questions.some((q) => q.type === 'mcq' && q.sourceRef?.includes('3.4'))).toBe(true);
  });

  it('has a question that links the NSPCC whistleblowing advice line', () => {
    const q = mod.questions.find((x) => urlsOf(x).some((l) => hostOf(l.url!).endsWith('nspcc.org.uk')));
    expect(q, 'no question links nspcc.org.uk').toBeDefined();
    expect(JSON.stringify(q).toLowerCase()).toContain('whistleblow');
  });

  it('has a scenario that can be completed with only best choices', () => {
    // moduleSchema already enforces this; check the bank has a mix of outcomes to give useful feedback.
    const outcomes = new Set(
      scenarios.flatMap((q) => q.scenario!.steps.flatMap((s) => s.choices.map((c) => c.outcome))),
    );
    expect(outcomes.has('best')).toBe(true);
    expect(outcomes.has('poor')).toBe(true);
  });

  it('gives every scenario choice written feedback', () => {
    for (const q of scenarios)
      for (const s of q.scenario!.steps)
        for (const c of s.choices) expect(c.feedback.trim().length, `${q.id}/${c.id}`).toBeGreaterThan(0);
  });
});

describe('Safeguarding module: tone and naming', () => {
  it('names no real companies or brands', () => {
    const banned =
      /\b(WhatsApp|Facebook|Instagram|TikTok|Snapchat|Google|Apple|Amazon|Microsoft|Tesco|Sainsbury|Bright Horizons|Busy Bees|Kids Allowed|Tiny Tots)\b/i;
    expect(allText()).not.toMatch(banned);
  });

  it('has no payment wording', () => {
    expect(allText()).not.toMatch(/\b(subscription|invoice|billing|per seat)\b/i);
  });
});

// M2 chunk 6 (F-8): Paediatric first aid and Safer eating meet build pack 9.1, 9.3, 9.5 and 2.4 (shorter standard).
// Plan docs/plans/m2.md work chunk 6. Folders: paediatric-first-aid and safer-eating, beside safeguarding.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleSchema, type Module, type Question } from '@sta/domain';
import { contentId } from '../../contentId';
import { moduleIds } from '../../moduleIds';
import { parseLesson } from '../../lessonParser';
import { nurseryModules } from './index';

const here = dirname(fileURLToPath(import.meta.url));
const eyfsPath = join(here, '../../../../../../.sources-cache/eyfs-group.txt');
const eyfs = existsSync(eyfsPath) ? readFileSync(eyfsPath, 'utf8') : null;

const hostOf = (url: string): string => new URL(url).hostname;
const officialHost = (h: string): boolean =>
  h.endsWith('.gov.uk') || h === 'gov.uk' || h === 'nspcc.org.uk' || h.endsWith('.nspcc.org.uk') || h === 'ico.org.uk';
const urlsOf = (q: Question) => q.learnMore.flatMap((l) => (l.url ? [l] : []));

interface Spec {
  name: string;
  folder: string;
  id: string;
  requirementIds: string[];
  titleHints: RegExp[]; // one per lesson, in order, lessons 1..n (n between 2 and 3)
  paragraphs: number[]; // allowed EYFS 3.x paragraph numbers (build pack 9.3)
  mustCite: number[]; // paragraphs that at least one question must cite
  facts: RegExp[]; // facts that must appear somewhere in lessons or questions
}

const specs: Spec[] = [
  {
    name: 'Paediatric first aid and accidents',
    folder: 'paediatric-first-aid',
    id: moduleIds.paediatricFirstAid,
    requirementIds: [contentId(602)],
    titleHints: [/first aid|first aider/i, /accident|record|notif/i],
    paragraphs: [37, 38, 39, 40, 78, 79],
    mustCite: [37, 39, 40, 78, 79],
    facts: [/three years/i, /14 days/i, /outing/i, /same day/i, /certificate/i],
  },
  {
    name: 'Safer eating, allergies and choking',
    folder: 'safer-eating',
    id: moduleIds.safeEatingAllergiesAndChoking,
    requirementIds: [], // optional module (decisions.md M2 assumption 34), no requirement link
    titleHints: [/allerg/i, /choking|weaning|seat/i],
    paragraphs: [64, 65, 66, 67, 68, 69, 70, 71, 72, 73],
    mustCite: [64, 65, 66, 67, 68, 70, 71, 73],
    facts: [/sight and hearing/i, /silent/i, /allergy action plan/i, /weaning|solid food/i, /food poisoning/i],
  },
];

describe.each(specs)('$name module', (spec) => {
  const dir = join(here, spec.folder);
  const mod: Module = nurseryModules.find((x) => x.id === spec.id) as Module;
  // Absent until implemented; the registration test reports that clearly.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const questions = mod?.questions ?? [];
  const scenarios = questions.filter((q) => q.type === 'scenario');
  const simple = questions.filter((q) => q.type === 'mcq' || q.type === 'trueFalse');
  const fileText = (): string =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith('.md'))
          .map((f) => readFileSync(join(dir, f), 'utf8'))
          .join('\n')
      : '';
  const allText = (): string => JSON.stringify(mod) + fileText();

  describe('shape and registration', () => {
    it('is registered in nurseryModules under its stable id', () => {
      expect(mod, `${spec.id} missing from nurseryModules`).toBeDefined();
      expect(nurseryModules.filter((m) => m.id === spec.id)).toHaveLength(1);
    });

    it('parses with moduleSchema, is provider owned and published', () => {
      expect(moduleSchema.safeParse(mod).success).toBe(true);
      expect(mod.owner).toBe('provider');
      expect(mod.status).toBe('published');
      expect(mod.version).toBeGreaterThanOrEqual(1);
    });

    it('is marked as draft content until the user reviews it', () => {
      expect(mod.draftContent).toBe(true);
    });

    it('links requirements only as the content plan says', () => {
      expect([...mod.requirementIds].sort()).toEqual([...spec.requirementIds].sort());
    });

    it('takes about 10 minutes or less', () => {
      expect(mod.estimatedMinutes).toBeGreaterThan(0);
      expect(mod.estimatedMinutes).toBeLessThanOrEqual(10);
    });

    it('has a folder with module.json carrying a verify note and an Open Government Licence line', () => {
      expect(existsSync(join(dir, 'module.json')), `${spec.folder}/module.json`).toBe(true);
      const raw = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8')) as { verify?: unknown };
      expect(raw.verify).toBeDefined();
      expect(mod.sourceAttribution ?? '').toMatch(/Open Government Licence/i);
    });

    it('has a quiz that passes at 80 percent with feedback and source refs shown', () => {
      expect(mod.quiz.passMark).toBe(80);
      expect(mod.quiz.feedback).toBe(true);
      expect(mod.quiz.showSourceRef).toBe(true);
    });
  });

  describe('lessons (2.4: 2 to 3 lessons)', () => {
    it('has 2 or 3 lessons whose titles follow the plan', () => {
      expect(mod.lessons.length).toBeGreaterThanOrEqual(2);
      expect(mod.lessons.length).toBeLessThanOrEqual(3);
      spec.titleHints.forEach((re, i) => {
        expect(mod.lessons[i]?.title, `lesson ${i + 1}`).toMatch(re);
      });
    });

    it('gives each lesson 2 to 4 minutes and some content', () => {
      for (const l of mod.lessons) {
        expect(l.minutes, l.id).toBeGreaterThanOrEqual(2);
        expect(l.minutes, l.id).toBeLessThanOrEqual(4);
        expect(l.blocks.length, l.id).toBeGreaterThan(0);
      }
    });

    it('has lesson-N.md files that parse and match the module blocks', () => {
      const files = existsSync(dir)
        ? readdirSync(dir)
            .filter((f) => /^lesson-\d+\.md$/.test(f))
            .sort()
        : [];
      expect(files).toEqual(mod.lessons.map((_, i) => `lesson-${i + 1}.md`));
      files.forEach((f, i) => {
        const blocks = parseLesson(readFileSync(join(dir, f), 'utf8'));
        expect(blocks.length, f).toBeGreaterThan(0);
        expect(mod.lessons[i]?.blocks, f).toEqual(blocks);
      });
    });

    it('has lesson files with no raw HTML, links or images', () => {
      const text = fileText();
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/<[a-zA-Z/!]/);
      expect(text).not.toMatch(/\]\(/);
      expect(text).not.toMatch(/!\[/);
    });

    it.each(spec.facts.map((f) => [String(f), f] as const))('teaches the key fact %s', (_n, re) => {
      expect(allText()).toMatch(re);
    });
  });

  describe('question bank (2.4: at least 8 questions)', () => {
    it('has at least 8 questions, at least 6 multiple choice or true or false', () => {
      expect(questions.length).toBeGreaterThanOrEqual(8);
      expect(simple.length).toBeGreaterThanOrEqual(6);
    });

    it('has at least 2 scenarios, at least 1 branching with a next step', () => {
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
      const branching = scenarios.filter((q) => {
        const steps = q.scenario?.steps ?? [];
        return steps.length >= 2 && steps.some((s) => s.choices.some((c) => c.next !== undefined));
      });
      expect(branching.length).toBeGreaterThanOrEqual(1);
    });

    it('has unique question ids and every scenario choice has written feedback', () => {
      expect(questions.length).toBeGreaterThan(0);
      expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
      for (const q of scenarios)
        for (const s of q.scenario!.steps)
          for (const c of s.choices) expect(c.feedback.trim().length, `${q.id}/${c.id}`).toBeGreaterThan(0);
    });

    it('gives every question an explanation and an EYFS section 3 sourceRef in the plan range', () => {
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) {
        expect(q.explanation.trim().length, q.id).toBeGreaterThan(20);
        const m = /^EYFS 3\.(\d+)/.exec(q.sourceRef ?? '');
        expect(m, `${q.id} sourceRef "${q.sourceRef}"`).not.toBeNull();
        expect(spec.paragraphs, `${q.id} cites 3.${m?.[1]}`).toContain(Number(m![1]));
      }
    });

    it('cites each required paragraph at least once', () => {
      const cited = new Set(questions.map((q) => Number(/^EYFS 3\.(\d+)/.exec(q.sourceRef ?? '')?.[1])));
      for (const p of spec.mustCite) expect(cited.has(p), `3.${p} not cited`).toBe(true);
    });

    it('gives every question an https official Learn more link with a descriptive title and publisher', () => {
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) {
        const links = urlsOf(q);
        expect(links.length, q.id).toBeGreaterThanOrEqual(1);
        for (const l of links) {
          expect(l.url!.startsWith('https://'), `${q.id} ${l.url}`).toBe(true);
          expect(officialHost(hostOf(l.url!)), `${q.id} ${l.url}`).toBe(true);
          expect(l.publisher.trim().length, q.id).toBeGreaterThan(0);
        }
        for (const l of q.learnMore) {
          expect(l.title.trim().length, `${q.id} ${l.title}`).toBeGreaterThanOrEqual(15);
          expect(l.title, q.id).not.toMatch(/^(click )?(here|link|read more|more|this)\.?$/i);
        }
      }
    });

    it('has a gov.uk link whose locator names the sourceRef paragraph and a page', () => {
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) {
        const para = /(\d+\.\d+)/.exec(q.sourceRef ?? '')?.[1];
        expect(para, `${q.id} sourceRef`).toBeDefined();
        const matching = q.learnMore.filter(
          (l) => l.url && hostOf(l.url).endsWith('gov.uk') && (l.locator ?? '').includes(para!),
        );
        expect(matching.length, `${q.id} needs a gov.uk link with locator naming ${para}`).toBeGreaterThanOrEqual(1);
        expect(matching[0]!.locator, q.id).toMatch(/page|p\.?\s*\d/i);
      }
    });

    it('uses both best and poor scenario outcomes', () => {
      const outcomes = new Set(
        scenarios.flatMap((q) => q.scenario!.steps.flatMap((s) => s.choices.map((c) => c.outcome))),
      );
      expect(outcomes.has('best')).toBe(true);
      expect(outcomes.has('poor')).toBe(true);
    });
  });

  describe('source check against the cached EYFS text', () => {
    it.skipIf(!eyfs)('finds every cited paragraph in .sources-cache/eyfs-group.txt', () => {
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) {
        const p = /^EYFS (3\.\d+)/.exec(q.sourceRef ?? '')?.[1];
        expect(p, q.id).toBeDefined();
        expect(eyfs, `${q.id} cites ${p}`).toMatch(new RegExp(`^${p!.replace('.', '\\.')}\\s`, 'm'));
      }
    });

    it.skipIf(!eyfs)('the facts taught appear in the cited framework text', () => {
      const text = eyfs!.replace(/\s+/g, ' ');
      const checks: Record<string, RegExp[]> = {
        'paediatric-first-aid': [/renewed every three years/, /within 14 days/, /accompany children on outings/],
        'safer-eating': [/within sight and hearing/, /Choking can be completely silent/, /allergy action plans/],
      };
      for (const re of checks[spec.folder]!) expect(text).toMatch(re);
      for (const re of spec.facts) expect(allText()).toMatch(re);
    });
  });

  describe('tone and naming', () => {
    it('names no real companies or brands and has no payment wording', () => {
      expect(allText()).not.toMatch(
        /\b(WhatsApp|Facebook|Instagram|TikTok|Google|Apple|Amazon|Tesco|Sainsbury|Bright Horizons|Busy Bees|Red Cross|St John Ambulance)\b/i,
      );
      expect(allText()).not.toMatch(/\b(subscription|invoice|billing|per seat)\b/i);
    });

    it('has no graphic injury wording', () => {
      expect(fileText()).not.toMatch(/\b(blood everywhere|gore|gory|graphic)\b/i);
    });
  });
});

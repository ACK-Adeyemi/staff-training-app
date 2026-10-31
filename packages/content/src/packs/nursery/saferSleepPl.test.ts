// M5 chunk 7 (F-5): the sample translated module, Safer sleep in Polish. Plan docs/plans/m5.md F-5 and assumptions 2, 3, 6.
// Assumed (the implementer must match): moduleIds.saferSleepPl, folder modules/safer-sleep-pl (module.json, lesson-1.md,
// lesson-2.md), language pl-PL, translatedFrom { moduleId: moduleIds.saferSleep, machine: true }.
// Mapping rule: every lesson, question and option keeps the SAME id as the English original (ids are scoped by module), so
// per-question statistics and the answer key line up one to one. Learn more links keep their id, url and locator; titles
// may be Polish or stay English with an "(in English)" note.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleSchema } from '@sta/domain';
import { moduleIds } from '../moduleIds';
import { parseLesson } from '../lessonParser';
import { nurseryModules } from './modules';
import { nurseryModuleCategory } from './categories';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'modules', 'safer-sleep-pl');
const ids = moduleIds as Record<string, string | undefined>;
const plId = ids['saferSleepPl'];
const pl = nurseryModules.find((m) => plId !== undefined && m.id === plId);
const en = nurseryModules.find((m) => m.id === moduleIds.saferSleep)!;

const PAYMENT_EN = /\b(subscription|invoice|billing|per seat|payment|price)\b/i;
const PAYMENT_PL = /(płatno|faktur|subskrypcj|abonament|\bcena\b|\bcen[ayę]\b|zapłać|karta płatnicza)/i;

describe('Safer sleep (Polish) module', () => {
  it('has an id registered in moduleIds, distinct from every other module id', () => {
    expect(plId, 'moduleIds.saferSleepPl').toBeDefined();
    expect(Object.values(moduleIds).filter((v) => v === plId)).toHaveLength(1);
  });

  it('is registered once in nurseryModules and parses with moduleSchema', () => {
    expect(pl, 'saferSleepPl missing from nurseryModules').toBeDefined();
    expect(nurseryModules.filter((m) => m.id === plId)).toHaveLength(1);
    expect(moduleSchema.safeParse(pl).success).toBe(true);
  });

  it('is Polish, machine translated from Safer sleep, provider-owned published draft content', () => {
    expect(pl!.language).toBe('pl-PL');
    expect(pl!.translatedFrom).toEqual({ moduleId: moduleIds.saferSleep, machine: true });
    expect(pl!.owner).toBe('provider');
    expect(pl!.status).toBe('published');
    expect(pl!.draftContent).toBe(true);
    expect(en.language).toBe('en-GB');
  });

  it('counts for the same requirements as the original', () => {
    expect(pl!.requirementIds).toEqual(en.requirementIds);
    expect(pl!.roleTags).toEqual(en.roleTags);
    expect(pl!.optional).toEqual(en.optional);
  });

  it('keeps the original category, quiz settings, minutes and attribution', () => {
    expect(nurseryModuleCategory[plId!]).toBe(nurseryModuleCategory[moduleIds.saferSleep]);
    expect(pl!.quiz).toEqual(en.quiz);
    expect(pl!.estimatedMinutes).toBe(en.estimatedMinutes);
    expect(pl!.sourceAttribution ?? '').toMatch(/Open Government Licence/i);
  });

  it('has the same lessons by id and minutes, with Polish titles and content from lesson-N.md', () => {
    expect(pl!.lessons.map((l) => l.id)).toEqual(en.lessons.map((l) => l.id));
    expect(pl!.lessons).toHaveLength(2);
    pl!.lessons.forEach((l, i) => {
      const file = join(dir, `lesson-${String(i + 1)}.md`);
      expect(existsSync(file), file).toBe(true);
      expect(l.blocks).toEqual(parseLesson(readFileSync(file, 'utf8')));
      expect(l.blocks.length).toBeGreaterThan(0);
      expect(l.minutes).toBe(en.lessons[i]!.minutes);
      expect(l.title.trim(), l.id).not.toBe('');
      expect(l.title, l.id).not.toBe(en.lessons[i]!.title);
    });
  });

  it('has the same number of questions with the same ids, types, source references and correct answers', () => {
    expect(pl!.questions.length).toBe(en.questions.length);
    expect(pl!.questions.length).toBeGreaterThanOrEqual(5);
    expect(pl!.questions.map((q) => q.id)).toEqual(en.questions.map((q) => q.id));
    pl!.questions.forEach((q, i) => {
      const o = en.questions[i]!;
      expect(q.type, q.id).toBe(o.type);
      expect(q.sourceRef, q.id).toBe(o.sourceRef);
      expect(q.tags, q.id).toEqual(o.tags);
      expect(
        (q.options ?? []).map((x) => [x.id, x.correct]),
        q.id,
      ).toEqual((o.options ?? []).map((x) => [x.id, x.correct]));
    });
  });

  it('keeps every Learn more link (id, https url, locator) and still has at least one per question', () => {
    pl!.questions.forEach((q, i) => {
      const o = en.questions[i]!;
      expect(q.learnMore.length, q.id).toBeGreaterThanOrEqual(1);
      expect(
        q.learnMore.map((l) => [l.id, l.url, l.locator, l.kind, l.showFor]),
        q.id,
      ).toEqual(o.learnMore.map((l) => [l.id, l.url, l.locator, l.kind, l.showFor]));
      for (const l of q.learnMore) expect(l.url!.startsWith('https://'), l.id).toBe(true);
    });
  });

  it('is really translated: prompts, options, explanations and lesson text are not empty and not the English', () => {
    pl!.questions.forEach((q, i) => {
      const o = en.questions[i]!;
      expect(q.prompt.trim(), `${q.id} prompt`).not.toBe('');
      expect(q.prompt, `${q.id} prompt`).not.toBe(o.prompt);
      expect(q.explanation.trim(), `${q.id} explanation`).not.toBe('');
      expect(q.explanation, `${q.id} explanation`).not.toBe(o.explanation);
      (q.options ?? []).forEach((opt, j) => {
        expect(opt.text.trim(), opt.id).not.toBe('');
        expect(opt.text, opt.id).not.toBe(o.options![j]!.text);
      });
    });
    expect(pl!.title).not.toBe(en.title);
    expect(pl!.description).not.toBe(en.description);
    expect(pl!.description.trim()).not.toBe('');
    expect(JSON.stringify(pl!.lessons)).not.toBe(JSON.stringify(en.lessons.map((l) => ({ ...l, title: '' }))));
    for (let i = 1; i <= 2; i++) {
      const pt = readFileSync(join(dir, `lesson-${String(i)}.md`), 'utf8');
      const et = readFileSync(join(here, 'modules', 'safer-sleep', `lesson-${String(i)}.md`), 'utf8');
      expect(pt.trim().length).toBeGreaterThan(100);
      expect(pt).not.toBe(et);
    }
  });

  it('uses Polish letters, so it is not English text with a Polish title', () => {
    const text = [
      pl!.title,
      pl!.description,
      ...pl!.questions.flatMap((q) => [q.prompt, q.explanation, ...(q.options ?? []).map((o) => o.text)]),
      readFileSync(join(dir, 'lesson-1.md'), 'utf8'),
      readFileSync(join(dir, 'lesson-2.md'), 'utf8'),
    ].join(' ');
    expect(text).toMatch(/[ąćęłńóśźż]/i);
  });

  it('has no payment wording and names no real companies', () => {
    const text =
      JSON.stringify(pl) +
      readFileSync(join(dir, 'lesson-1.md'), 'utf8') +
      readFileSync(join(dir, 'lesson-2.md'), 'utf8');
    expect(text).not.toMatch(PAYMENT_EN);
    expect(text).not.toMatch(PAYMENT_PL);
    expect(text).not.toMatch(/\b(WhatsApp|Facebook|Instagram|TikTok|Google|Apple|Amazon|Tesco)\b/i);
  });

  it('is the only translated module in the nursery pack', () => {
    expect(nurseryModules.filter((m) => m.translatedFrom !== undefined).map((m) => m.id)).toEqual([plId]);
  });
});

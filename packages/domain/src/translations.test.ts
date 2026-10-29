// M5 chunk 7 (F-5): finding and choosing between language versions of a module. Plan docs/plans/m5.md F-5, assumptions 2 and 6.
// Written before the implementation; the file under test is ./translations.ts (exported from the package index).
//
// API under test:
//   translationsFor(moduleId: string, modules: Module[]): Module[]
//     The OTHER language versions of the same content, in the order they appear in `modules`.
//     - For an original module id: every module whose translatedFrom.moduleId is that id.
//     - For a translation id: the original plus the other translations of the same original (never itself).
//     - Modules that are not published (draft, retired) are left out, so a learner is never sent to one.
//     - Unknown id, or a module with no translations: [].
//   preferredVersion(module: Module, translations: Module[], language: string): Module
//     The version the learner should open by default. Candidates are `module` followed by `translations`.
//     Returns the first candidate whose `language` equals `language` exactly (so pl-PL matches pl-PL, not pl or en-GB).
//     When none matches it returns `module` unchanged (the official English text is the fallback). Candidates that are
//     not published are ignored, except `module` itself, which is always the fallback.
//   moduleStats({ ..., translations?: Module[] }): attempts, events and assignments on a translation count for the
//     original module (assumption 6). The module shown is still the original.
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import type { Attempt } from './schemas/learning';
import { moduleStats } from './progress/moduleStats';
import { preferredVersion, translationsFor } from './translations';
import { CLIENT, NOW, SITE_ID, assignment, moduleFor, nextId, person } from './progress/testFixtures';

const en = moduleFor({ id: nextId(), title: 'Safer sleep', language: 'en-GB', questions: [{ id: 'q1' }] as never });
const pl = moduleFor({
  id: nextId(),
  title: 'Bezpieczny sen',
  language: 'pl-PL',
  translatedFrom: { moduleId: en.id, machine: true },
});
const de = moduleFor({
  id: nextId(),
  title: 'Sicherer Schlaf',
  language: 'de-DE',
  translatedFrom: { moduleId: en.id, machine: true },
});
const other = moduleFor({ id: nextId(), title: 'Safer eating', language: 'en-GB' });
const otherPl = moduleFor({
  id: nextId(),
  title: 'Bezpieczne jedzenie',
  language: 'pl-PL',
  translatedFrom: { moduleId: other.id, machine: true },
});
const all = [en, pl, de, other, otherPl];

describe('translationsFor', () => {
  it('lists the translations of an original, in the order given', () => {
    expect(translationsFor(en.id, all).map((m) => m.id)).toEqual([pl.id, de.id]);
  });

  it('does not mix in translations of other modules', () => {
    expect(translationsFor(other.id, all).map((m) => m.id)).toEqual([otherPl.id]);
  });

  it('from a translation, gives the original and the other translations but not itself', () => {
    expect(translationsFor(pl.id, all).map((m) => m.id)).toEqual([en.id, de.id]);
  });

  it('gives an empty list for a module with no translations and for an unknown id', () => {
    expect(translationsFor(de.id, [en, de])).toEqual([en]);
    expect(translationsFor('99999999-9999-4999-8999-999999999999', all)).toEqual([]);
    expect(translationsFor(en.id, [en, other])).toEqual([]);
  });

  it('leaves out translations that are not published', () => {
    const draftPl = { ...pl, status: 'draft' as const };
    expect(translationsFor(en.id, [en, draftPl, de]).map((m) => m.id)).toEqual([de.id]);
    expect(translationsFor(en.id, [en, { ...pl, status: 'retired' as never }]).map((m) => m.id)).toEqual([]);
  });

  it('does not change its input', () => {
    const copy = [...all];
    translationsFor(en.id, all);
    expect(all).toEqual(copy);
  });
});

describe('preferredVersion', () => {
  it('opens the Polish version for a Polish learner', () => {
    expect(preferredVersion(en, [pl, de], 'pl-PL').id).toBe(pl.id);
  });

  it('opens the original for an English learner', () => {
    expect(preferredVersion(en, [pl, de], 'en-GB').id).toBe(en.id);
  });

  it('given the Polish version and its siblings, an English learner gets the English original', () => {
    expect(preferredVersion(pl, [en, de], 'en-GB').id).toBe(en.id);
  });

  it('given the Polish version, a Polish learner stays on it', () => {
    expect(preferredVersion(pl, [en], 'pl-PL').id).toBe(pl.id);
  });

  it('falls back to the module itself when no version has the language', () => {
    expect(preferredVersion(en, [pl], 'fr-FR').id).toBe(en.id);
    expect(preferredVersion(en, [], 'pl-PL').id).toBe(en.id);
  });

  it('needs an exact language match', () => {
    expect(preferredVersion(en, [pl], 'pl').id).toBe(en.id);
  });

  it('never picks a translation that is not published', () => {
    expect(preferredVersion(en, [{ ...pl, status: 'draft' as const }], 'pl-PL').id).toBe(en.id);
  });
});

describe('module stats count translations for the original', () => {
  const a = person('Ava', 'Pass');
  const b = person('Bea', 'Other');
  const attempt = (p: typeof a, moduleId: string, score: number): Attempt => ({
    id: nextId(),
    clientId: CLIENT,
    siteId: SITE_ID,
    personId: p.id,
    moduleId,
    moduleVersion: 1,
    mode: 'open',
    questionIds: ['q1'],
    startedAt: addDays(NOW, -1).toISOString(),
    finishedAt: addDays(NOW, -1).toISOString(),
    score,
    passed: score >= 80,
  });
  const base = {
    module: en,
    assignments: [assignment(a, en.id, 5, { status: 'done' }), assignment(b, en.id, 5)],
    events: [],
    evidence: [],
    now: NOW,
  };

  it('counts an attempt taken on the Polish version as started, scored and passed for the original', () => {
    const attempts = [attempt(a, pl.id, 100)];
    const without = moduleStats({ ...base, attempts });
    const withPl = moduleStats({ ...base, attempts, translations: [pl] });
    expect(without.headline.started).toBe(0);
    expect(withPl.headline).toMatchObject({
      started: 1,
      averageScore: 100,
      passRate: 100,
      completed: 1,
      notStarted: 1,
    });
  });

  it('still ignores attempts on unrelated modules', () => {
    const stats = moduleStats({ ...base, attempts: [attempt(a, other.id, 100)], translations: [pl] });
    expect(stats.headline.started).toBe(0);
  });
});

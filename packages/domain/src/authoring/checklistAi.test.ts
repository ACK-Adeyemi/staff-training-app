// M5 chunk 10 (F-7): the publish checklist blocks publishing while any AI-drafted lesson or question has no
// aiReviewedBy. publishChecklist keeps its six items (ids and order unchanged) and its result gains
// `aiUnchecked: number`, the count of AI-drafted lessons and questions without aiReviewedBy; `ok` is false when it is above 0.
import { describe, expect, it } from 'vitest';
import { publishChecklist } from './checklist';
import type { Module, Question } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';

const REVIEWER = '01J0000000000000000000REV1';
const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  type: 'trueFalse',
  prompt: `Statement ${id}`,
  options: [
    { id: `${id}-t`, text: 'True', correct: true },
    { id: `${id}-f`, text: 'False', correct: false },
  ],
  explanation: 'Because.',
  learnMore: [],
  tags: [],
  ...over,
});
const base = (over: Partial<Module> = {}): Module => ({
  id: '01J0000000000000000000MOD1',
  owner: { clientId: '01J0000000000000000000CLI1' },
  status: 'draft',
  version: 1,
  updatedAt: '2026-10-19T09:00:00.000Z',
  title: 'Fire drills',
  description: 'd',
  estimatedMinutes: 5,
  language: 'en-GB',
  requirementIds: [],
  optional: true,
  roleTags: [],
  lessons: [{ id: 'l1', title: 'One', minutes: 2, blocks: [{ kind: 'text', markdown: 'Know the exits.' }] }],
  questions: [q('q1')],
  quiz: {
    mode: 'mcq',
    drawCount: 1,
    shuffleQuestions: true,
    shuffleOptions: true,
    passMark: 80,
    maxRetakes: null,
    feedback: true,
    showSourceRef: true,
    notesInQuiz: 'choice',
    learnMoreFor: 'all',
  },
  ...over,
});
const none: Requirement[] = [];

describe('publishChecklist and AI-drafted items', () => {
  it('passes with no AI-drafted items, and reports aiUnchecked 0', () => {
    const r = publishChecklist(base(), none);
    expect(r.ok).toBe(true);
    expect(r).toMatchObject({ aiUnchecked: 0 });
    expect(r.items.map((i) => i.id)).toEqual(['title', 'lesson', 'question', 'quiz', 'requirement', 'links']);
  });

  it('blocks publishing while an AI-drafted question has no aiReviewedBy', () => {
    const r = publishChecklist(base({ questions: [q('q1', { aiDrafted: true })] }), none);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ aiUnchecked: 1 });
    expect(r.items.every((i) => i.passed)).toBe(true);
  });

  it('blocks publishing while an AI-drafted lesson has no aiReviewedBy', () => {
    const m = base();
    const r = publishChecklist({ ...m, lessons: [{ ...m.lessons[0]!, aiDrafted: true }] }, none);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ aiUnchecked: 1 });
  });

  it('counts every unchecked AI-drafted lesson and question', () => {
    const m = base();
    const r = publishChecklist(
      {
        ...m,
        lessons: [{ ...m.lessons[0]!, aiDrafted: true }],
        questions: [q('q1', { aiDrafted: true }), q('q2', { aiDrafted: true }), q('q3')],
        quiz: { ...m.quiz, drawCount: 1 },
      },
      none,
    );
    expect(r).toMatchObject({ ok: false, aiUnchecked: 3 });
  });

  it('passes once every AI-drafted item has aiReviewedBy', () => {
    const m = base();
    const r = publishChecklist(
      {
        ...m,
        lessons: [{ ...m.lessons[0]!, aiDrafted: true, aiReviewedBy: REVIEWER }],
        questions: [q('q1', { aiDrafted: true, aiReviewedBy: REVIEWER })],
      },
      none,
    );
    expect(r.ok).toBe(true);
    expect(r).toMatchObject({ aiUnchecked: 0 });
  });

  it('stays blocked when only some of the AI-drafted items are checked', () => {
    const r = publishChecklist(
      base({ questions: [q('q1', { aiDrafted: true, aiReviewedBy: REVIEWER }), q('q2', { aiDrafted: true })] }),
      none,
    );
    expect(r).toMatchObject({ ok: false, aiUnchecked: 1 });
  });

  it('ignores aiReviewedBy on an item that is not AI-drafted', () => {
    const r = publishChecklist(base({ questions: [q('q1', { aiReviewedBy: REVIEWER })] }), none);
    expect(r).toMatchObject({ ok: true, aiUnchecked: 0 });
  });
});

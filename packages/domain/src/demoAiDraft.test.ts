// M5 chunk 10 (F-7 client admin part; brief 20.7 and brief 08 last paragraph): the canned Demo AI drafting helpers.
// Written before the implementation. Names and shapes the implementer must provide in packages/domain/src/demoAi.ts:
//   POLICY_MAX_CHARS = 20000
//   draftFromPolicy(text: string):
//     | { ok: false; reason: 'empty' | 'tooLong' }      (blank text; more than POLICY_MAX_CHARS characters)
//     | { ok: true; title: string; lessons: Lesson[]; questions: Question[] }
//   suggestQuestions(lesson: Pick<Lesson, 'id' | 'title' | 'blocks'>, rng?: Rng): Question[]
// Rules:
//   - title is the first non-empty line with any leading # marks removed (at most 100 characters). That line is not a lesson.
//   - Lessons split at heading lines (lines starting with #). With no headings, each blank-line separated group after
//     the title line is a lesson. A lesson's body is plain text in one 'text' block (HTML is kept as typed).
//   - Each lesson has up to 3 true or false questions, one per distinct sentence of that lesson (as many as it has
//     sentences, at most 3). The prompt contains the sentence; the question is tagged with its lesson id (tags).
//     The explanation ends with "Source: Your policy, part N" (N = lesson number from 1). There is no sourceRef,
//     because the schema demands a Learn more link with one and a pasted policy has no https address.
//   - Every lesson and question has aiDrafted: true and no aiReviewedBy. Ids are valid local keys, unique overall.
//   - Deterministic: same text, same result. Never mentions EYFS.
import { describe, expect, it } from 'vitest';
import { POLICY_MAX_CHARS, draftFromPolicy, suggestQuestions } from './demoAi';
import { createRng } from './rng';
import { lessonSchema, questionSchema, type Lesson, type Question } from './schemas/learning';

const WITH_HEADINGS = [
  'Fire safety policy',
  '',
  '# Raise the alarm',
  'Shout fire loudly. Press the nearest call point. Tell the manager at once.',
  '',
  '# Leave the building',
  'Lead the children to the assembly point. Do not use the lifts.',
].join('\n');

const BLANK_GROUPS = [
  'Mobile phone policy',
  '',
  'Staff keep personal phones in the locked cupboard. Phones are never used in the rooms.',
  '',
  'Staff may use the office phone for calls. Parents are told this at induction.',
].join('\n');

const textOf = (l: Lesson): string =>
  l.blocks.map((b) => (b.kind === 'text' ? b.markdown : b.kind === 'keyPoints' ? b.items.join(' ') : '')).join(' ');
const sentencesOf = (s: string): string[] =>
  s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
const ok = (text: string) => {
  const r = draftFromPolicy(text);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r;
};
const questionsOf = (qs: Question[], lesson: Lesson) => qs.filter((q) => q.tags.includes(lesson.id));

describe('draftFromPolicy', () => {
  it('takes the title from the first line and splits lessons at headings', () => {
    const d = ok(WITH_HEADINGS);
    expect(d.title).toBe('Fire safety policy');
    expect(d.lessons.map((l) => l.title)).toEqual(['Raise the alarm', 'Leave the building']);
  });

  it('splits into one lesson per blank-line group when there are no headings', () => {
    const d = ok(BLANK_GROUPS);
    expect(d.title).toBe('Mobile phone policy');
    expect(d.lessons).toHaveLength(2);
    expect(textOf(d.lessons[0])).toContain('locked cupboard');
    expect(textOf(d.lessons[1])).toContain('office phone');
    for (const l of d.lessons) expect(l.title.trim().length).toBeGreaterThan(0);
  });

  it('makes up to 3 true or false questions per lesson, one per sentence of that lesson', () => {
    const d = ok(WITH_HEADINGS);
    const [first, second] = d.lessons as [Lesson, Lesson];
    expect(questionsOf(d.questions, first)).toHaveLength(3);
    const two = questionsOf(d.questions, second);
    expect(two).toHaveLength(2);
    for (const l of d.lessons) {
      const own = sentencesOf(textOf(l));
      for (const q of questionsOf(d.questions, l)) {
        expect(q.type).toBe('trueFalse');
        expect(q.options?.map((o) => o.text).sort()).toEqual(['False', 'True']);
        expect(q.options?.filter((o) => o.correct)).toHaveLength(1);
        expect(own.some((s) => q.prompt.includes(s.replace(/[.!?]$/, '')))).toBe(true);
      }
      const prompts = questionsOf(d.questions, l).map((q) => q.prompt);
      expect(new Set(prompts).size).toBe(prompts.length);
    }
    expect(d.questions).toHaveLength(5);
  });

  it('never builds a question from another lesson sentence', () => {
    const d = ok(WITH_HEADINGS);
    const [first, second] = d.lessons as [Lesson, Lesson];
    for (const q of questionsOf(d.questions, first)) expect(q.prompt).not.toMatch(/lifts|assembly/i);
    for (const q of questionsOf(d.questions, second)) expect(q.prompt).not.toMatch(/call point|manager/i);
  });

  it('flags every lesson and question aiDrafted and leaves aiReviewedBy empty', () => {
    const d = ok(WITH_HEADINGS);
    expect(d.lessons.length).toBeGreaterThan(0);
    for (const l of d.lessons) {
      expect(l.aiDrafted).toBe(true);
      expect(l.aiReviewedBy).toBeUndefined();
    }
    for (const q of d.questions) {
      expect(q.aiDrafted).toBe(true);
      expect(q.aiReviewedBy).toBeUndefined();
    }
  });

  it('points each question at "Your policy, part N" and never at an EYFS paragraph', () => {
    const d = ok(WITH_HEADINGS);
    d.lessons.forEach((l, i) => {
      for (const q of questionsOf(d.questions, l)) {
        expect(q.explanation).toContain(`Your policy, part ${String(i + 1)}`);
        expect(q.sourceRef ?? '').not.toMatch(/eyfs/i);
      }
    });
    expect(JSON.stringify(d)).not.toMatch(/eyfs/i);
    // Even a policy that talks about the EYFS gets no EYFS reference of its own.
    const mentions = ok('Policy\n\n# Ratios\nWe follow the EYFS 3.28 ratios. Staff count the children.');
    for (const q of mentions.questions) {
      expect(q.sourceRef).toBeUndefined();
      expect(q.explanation).toContain('Your policy, part 1');
      expect(q.explanation).not.toMatch(/EYFS\s*\d/);
    }
  });

  it('gives valid lessons and questions with unique local-key ids', () => {
    const d = ok(WITH_HEADINGS);
    for (const l of d.lessons) expect(lessonSchema.safeParse(l).success).toBe(true);
    for (const q of d.questions) expect(questionSchema.safeParse(q).success).toBe(true);
    const all = [...d.lessons.map((l) => l.id), ...d.questions.map((q) => q.id)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('is deterministic', () => {
    expect(draftFromPolicy(WITH_HEADINGS)).toEqual(draftFromPolicy(WITH_HEADINGS));
  });

  it('keeps pasted HTML as plain text, unchanged', () => {
    const html = '<script>alert(1)</script>';
    const d = ok(`Policy\n\n# Bad ${html}\nDo not trust ${html} here. Keep <b>calm</b> always.`);
    expect(JSON.stringify(d)).toContain('<b>calm</b>');
    expect(d.lessons.map(textOf).join(' ')).toContain(html);
    for (const l of d.lessons) expect(l.blocks.every((b) => b.kind === 'text' || b.kind === 'keyPoints')).toBe(true);
  });

  it('refuses text of more than 20,000 characters and accepts exactly 20,000', () => {
    expect(POLICY_MAX_CHARS).toBe(20000);
    const line = 'Staff wash their hands before food. ';
    const exact = ('Policy\n\n' + line.repeat(1000)).slice(0, 20000);
    expect(exact).toHaveLength(20000);
    expect(draftFromPolicy(exact).ok).toBe(true);
    expect(draftFromPolicy(exact + 'x')).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('refuses empty and blank text', () => {
    expect(draftFromPolicy('')).toEqual({ ok: false, reason: 'empty' });
    expect(draftFromPolicy('  \n\n \t ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('suggestQuestions', () => {
  const lesson: Lesson = {
    id: 'storage',
    title: 'Storing food',
    minutes: 3,
    blocks: [
      {
        kind: 'text',
        markdown:
          'Keep raw meat on the bottom shelf. Label every open tub with the date. Check the fridge each morning.',
      },
      { kind: 'text', markdown: 'Throw away anything past its date.' },
    ],
  };

  it('returns up to 3 true or false questions built from the lesson own sentences, all aiDrafted', () => {
    const qs = suggestQuestions(lesson, createRng(3));
    expect(qs).toHaveLength(3);
    const own = sentencesOf(textOf(lesson));
    for (const q of qs) {
      expect(q.aiDrafted).toBe(true);
      expect(q.aiReviewedBy).toBeUndefined();
      expect(q.type).toBe('trueFalse');
      expect(own.some((s) => q.prompt.includes(s.replace(/[.!?]$/, '')))).toBe(true);
      expect(questionSchema.safeParse(q).success).toBe(true);
      expect(q.sourceRef ?? '').not.toMatch(/eyfs/i);
      expect(JSON.stringify(q)).not.toMatch(/eyfs/i);
    }
    expect(new Set(qs.map((q) => q.id)).size).toBe(3);
  });

  it('returns fewer questions when the lesson has fewer sentences, and none without text', () => {
    const short: Lesson = { ...lesson, blocks: [{ kind: 'text', markdown: 'Only one sentence here.' }] };
    expect(suggestQuestions(short, createRng(1))).toHaveLength(1);
    expect(suggestQuestions({ ...lesson, blocks: [] }, createRng(1))).toEqual([]);
  });

  it('is deterministic for a seed, and works without an rng', () => {
    expect(suggestQuestions(lesson, createRng(9))).toEqual(suggestQuestions(lesson, createRng(9)));
    expect(suggestQuestions(lesson)).toEqual(suggestQuestions(lesson));
    expect(suggestQuestions(lesson)).toHaveLength(3);
  });

  it('keeps HTML in the lesson as plain text and does not change the lesson', () => {
    const html: Lesson = {
      ...lesson,
      blocks: [{ kind: 'text', markdown: 'Never <img src=x onerror=alert(1)> here.' }],
    };
    const before = JSON.stringify(html);
    const qs = suggestQuestions(html);
    expect(JSON.stringify(qs)).toContain('<img src=x onerror=alert(1)>');
    expect(JSON.stringify(html)).toBe(before);
  });
});

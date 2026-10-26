// BP-2: the publish checklist (brief 5.1; plan Assumption 14).
//
// API under test:
//   publishChecklist(module: Module, requirements: Requirement[]): { ok: boolean; items: { id: ChecklistItemId; passed: boolean }[] }
//   ChecklistItemId = 'title' | 'lesson' | 'question' | 'quiz' | 'requirement' | 'links'; items are always all six, in that order.
//   title 3 to 100 chars (trimmed); a lesson with a non-blank text block; at least one question;
//   quiz: drawCount 1..bank size, passMark 1..100, mode possible with the bank (scenario needs scenario questions,
//   mcq needs non-scenario questions); requirement: every requirementId exists in `requirements`, or module.optional is true;
//   links: every https (question learnMore and lesson furtherReading).
import { describe, expect, it } from 'vitest';
import type { Module } from '../schemas/learning';
import { requirement } from '../progress/testFixtures';
import { mcq, moduleWith, scenario, trueFalse } from '../quiz/testFixtures';
import { publishChecklist, type ChecklistItemId } from './checklist';

const req = requirement('Fire safety');
const valid = (over: Partial<Module> = {}): Module => ({
  ...moduleWith([mcq('q1'), mcq('q2'), trueFalse('q3')], { mode: 'mcq', drawCount: 3, passMark: 80 }),
  title: 'Fire evacuation',
  requirementIds: [req.id],
  ...over,
});
const failing = (m: Module, reqs = [req]): ChecklistItemId[] =>
  publishChecklist(m, reqs)
    .items.filter((i) => !i.passed)
    .map((i) => i.id);

describe('publishChecklist', () => {
  it('passes a complete module and lists all six items', () => {
    const r = publishChecklist(valid(), [req]);
    expect(r.ok).toBe(true);
    expect(r.items.map((i) => i.id)).toEqual(['title', 'lesson', 'question', 'quiz', 'requirement', 'links']);
    expect(r.items.every((i) => i.passed)).toBe(true);
  });

  it('fails the title when under 3 or over 100 characters, passes at the edges', () => {
    expect(failing(valid({ title: 'ab' }))).toEqual(['title']);
    expect(failing(valid({ title: '  ab  ' }))).toEqual(['title']);
    expect(failing(valid({ title: 'x'.repeat(101) }))).toEqual(['title']);
    expect(failing(valid({ title: 'abc' }))).toEqual([]);
    expect(failing(valid({ title: 'x'.repeat(100) }))).toEqual([]);
  });

  it('fails when there is no lesson with text', () => {
    expect(failing(valid({ lessons: [] }))).toEqual(['lesson']);
    const blank = [{ id: 'l1', title: 'L', minutes: 1, blocks: [{ kind: 'text' as const, markdown: '   ' }] }];
    expect(failing(valid({ lessons: blank }))).toEqual(['lesson']);
    const onlyPoints = [{ id: 'l1', title: 'L', minutes: 1, blocks: [{ kind: 'keyPoints' as const, items: ['a'] }] }];
    expect(failing(valid({ lessons: onlyPoints }))).toEqual(['lesson']);
  });

  it('fails when there are no questions (and the quiz item fails with it)', () => {
    const ids = failing(valid({ questions: [] }));
    expect(ids).toContain('question');
    expect(ids).toContain('quiz');
  });

  it('fails the quiz when drawCount is 0 or more than the bank', () => {
    expect(failing(valid({ quiz: { ...valid().quiz, drawCount: 0 } }))).toEqual(['quiz']);
    expect(failing(valid({ quiz: { ...valid().quiz, drawCount: 4 } }))).toEqual(['quiz']);
    expect(failing(valid({ quiz: { ...valid().quiz, drawCount: 1 } }))).toEqual([]);
  });

  it('fails the quiz when the pass mark is outside 1 to 100', () => {
    expect(failing(valid({ quiz: { ...valid().quiz, passMark: 0 } }))).toEqual(['quiz']);
    expect(failing(valid({ quiz: { ...valid().quiz, passMark: 101 } }))).toEqual(['quiz']);
    expect(failing(valid({ quiz: { ...valid().quiz, passMark: 100 } }))).toEqual([]);
    expect(failing(valid({ quiz: { ...valid().quiz, passMark: 1 } }))).toEqual([]);
  });

  it('fails the quiz when the mode cannot be met by the bank', () => {
    expect(failing(valid({ quiz: { ...valid().quiz, mode: 'scenario' } }))).toEqual(['quiz']);
    const onlyScenarios = valid({
      questions: [scenario('s1'), scenario('s2')],
      quiz: { ...valid().quiz, mode: 'mcq', drawCount: 2 },
    });
    expect(failing(onlyScenarios)).toEqual(['quiz']);
    const scenariosOk = valid({
      questions: [scenario('s1'), scenario('s2')],
      quiz: { ...valid().quiz, mode: 'scenario', drawCount: 2 },
    });
    expect(failing(scenariosOk)).toEqual([]);
  });

  it('needs a linked requirement that exists, or the explicit optional choice', () => {
    expect(failing(valid({ requirementIds: [] }))).toEqual(['requirement']);
    expect(failing(valid({ requirementIds: ['01HZX0000000000000000000ZZ'] }))).toEqual(['requirement']);
    expect(failing(valid({ requirementIds: [], optional: true }))).toEqual([]);
  });

  it('fails when any link is not https, in a question or a lesson', () => {
    const bad = {
      id: 'l1',
      title: 'Guide',
      url: 'http://example.org/x',
      publisher: 'Fictional',
      kind: 'other' as const,
      language: 'en-GB',
      showFor: 'all' as const,
    };
    const q = { ...mcq('q1'), learnMore: [bad] };
    expect(failing(valid({ questions: [q, mcq('q2'), trueFalse('q3')] }))).toEqual(['links']);
    const lesson = {
      id: 'lesson-1',
      title: 'L',
      minutes: 1,
      blocks: [{ kind: 'text' as const, markdown: 'Hi.' }],
      furtherReading: [{ ...bad, url: 'javascript:alert(1)' }],
    };
    expect(failing(valid({ lessons: [lesson] }))).toEqual(['links']);
  });

  it('lists every failing item at once and is not ok', () => {
    const r = publishChecklist(valid({ title: 'x', lessons: [], questions: [], requirementIds: [] }), [req]);
    expect(r.ok).toBe(false);
    expect(r.items.filter((i) => !i.passed).map((i) => i.id)).toEqual([
      'title',
      'lesson',
      'question',
      'quiz',
      'requirement',
    ]);
  });
});

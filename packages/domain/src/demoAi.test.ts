import { describe, expect, it } from 'vitest';
import { explainLesson, practiceQuestions, usageCapReached } from './demoAi';
import { createRng } from './rng';
import type { Module, Question } from './schemas/learning';

describe('explainLesson', () => {
  it('uses key points and ignores text when there are some', () => {
    const text = explainLesson({
      blocks: [
        { kind: 'text', markdown: 'Ignore this. Really.' },
        { kind: 'keyPoints', items: ['One.', 'Two.'] },
      ],
    });
    expect(text).toBe('One.\nTwo.');
  });
  it('falls back to the first sentence of each text block, without markdown marks', () => {
    const text = explainLesson({
      blocks: [
        { kind: 'text', markdown: '## **Exits** stay clear. Check daily.' },
        { kind: 'text', markdown: 'Keep the log' },
      ],
    });
    expect(text).toBe('Exits stay clear.\nKeep the log');
  });
});

describe('usageCapReached', () => {
  const pricing = { includedUnits: 200, pricePerUnit: 5 };
  it('never stops inside the included units, even with a cap of 0', () => {
    expect(usageCapReached(199, pricing, 0)).toBe(false);
  });
  it('stops when the next unit would pass the cap', () => {
    expect(usageCapReached(200, pricing, 5)).toBe(false);
    expect(usageCapReached(201, pricing, 5)).toBe(true);
  });
  it('has no limit without a cap', () => {
    expect(usageCapReached(10_000, pricing, undefined)).toBe(false);
  });
});

// M5 chunk 9 (F-7): Quiz me for practice. practiceQuestions(module, rng, count) draws from the module's own bank only.
const mcq = (id: string, prompt = `Prompt ${id}`): Question => ({
  id,
  type: 'mcq',
  prompt,
  options: [
    { id: `${id}-a`, text: 'Right', correct: true },
    { id: `${id}-b`, text: 'Wrong', correct: false },
  ],
  explanation: `Because ${id}.`,
  learnMore: [],
  tags: [],
});
const moduleWith = (questions: Question[]): Pick<Module, 'questions'> => ({ questions });
const bank = (n: number): Question[] => Array.from({ length: n }, (_, i) => mcq(`q${String(i + 1)}`));

describe('practiceQuestions', () => {
  it('returns the same questions in the same order for the same seed', () => {
    const m = moduleWith(bank(12));
    const a = practiceQuestions(m as Module, createRng(42), 3).map((q) => q.id);
    const b = practiceQuestions(m as Module, createRng(42), 3).map((q) => q.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });
  it('draws differently for different seeds', () => {
    const m = moduleWith(bank(30));
    const seen = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) =>
        practiceQuestions(m as Module, createRng(seed), 3)
          .map((q) => q.id)
          .join(','),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
  it('never repeats a question', () => {
    const m = moduleWith(bank(5));
    for (let seed = 1; seed <= 25; seed++) {
      const ids = practiceQuestions(m as Module, createRng(seed), 3).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('never returns more than the bank holds', () => {
    expect(practiceQuestions(moduleWith(bank(2)) as Module, createRng(1), 3)).toHaveLength(2);
    expect(practiceQuestions(moduleWith([]) as Module, createRng(1), 3)).toEqual([]);
  });
  it('returns only questions from the module itself, whole and unchanged', () => {
    const own = bank(6);
    const drawn = practiceQuestions(moduleWith(own), createRng(9), 3);
    for (const q of drawn) expect(own).toContainEqual(q);
  });
  it('uses the translated module own wording when two modules share question ids', () => {
    const en = moduleWith(bank(6));
    const pl = moduleWith(bank(6).map((q) => ({ ...q, prompt: `PL ${q.prompt}`, explanation: `PL ${q.explanation}` })));
    const drawn = practiceQuestions(pl, createRng(3), 3);
    expect(drawn.length).toBe(3);
    for (const q of drawn) {
      expect(q.prompt.startsWith('PL ')).toBe(true);
      expect(q.explanation.startsWith('PL ')).toBe(true);
    }
    expect(practiceQuestions(en as Module, createRng(3), 3).map((q) => q.id)).toEqual(drawn.map((q) => q.id));
  });
  it('does not change the module bank', () => {
    const m = moduleWith(bank(8));
    const before = m.questions.map((q) => q.id);
    practiceQuestions(m, createRng(5), 3);
    expect(m.questions.map((q) => q.id)).toEqual(before);
  });
});

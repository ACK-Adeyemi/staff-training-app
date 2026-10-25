// BP-3: question draw rules (brief 8, plan Assumption 7). Uses the seeded RNG only.
import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { drawQuestions } from './draw';
import { bank, moduleWith } from './testFixtures';

const kindOf = (id: string): 'mcq' | 'tf' | 'scenario' =>
  id.startsWith('m') ? 'mcq' : id.startsWith('t') ? 'tf' : 'scenario';
const bankOrder = bank().map((q) => q.id);

describe('drawQuestions', () => {
  it('draws only scenarios in scenario mode', () => {
    const { questionIds } = drawQuestions(moduleWith(bank(), { mode: 'scenario', drawCount: 5 }), createRng(1));
    expect(questionIds).toHaveLength(5);
    expect(questionIds.every((id) => kindOf(id) === 'scenario')).toBe(true);
  });

  it('draws only mcq and true or false in mcq mode', () => {
    const { questionIds } = drawQuestions(moduleWith(bank(), { mode: 'mcq', drawCount: 10 }), createRng(2));
    expect(questionIds).toHaveLength(10);
    expect(questionIds.every((id) => kindOf(id) !== 'scenario')).toBe(true);
  });

  it('gives 4 scenarios and 6 others for mix 0.4 of 10', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { questionIds } = drawQuestions(
        moduleWith(bank(), { mode: 'mix', mixScenarioShare: 0.4 }),
        createRng(seed),
      );
      expect(questionIds).toHaveLength(10);
      expect(questionIds.filter((id) => kindOf(id) === 'scenario')).toHaveLength(4);
    }
  });

  it('fills the gap from other types when scenarios are short (mix 0.5 with 2 scenarios gives 2 plus 8)', () => {
    const questions = bank().filter((q) => q.type !== 'scenario' || ['s1', 's2'].includes(q.id));
    const { questionIds } = drawQuestions(moduleWith(questions, { mixScenarioShare: 0.5 }), createRng(3));
    expect(questionIds).toHaveLength(10);
    expect(questionIds.filter((id) => kindOf(id) === 'scenario')).toHaveLength(2);
  });

  it('fills the gap from scenarios when mcq and true or false are short', () => {
    const questions = bank().filter((q) => q.type === 'scenario' || ['m1', 't1'].includes(q.id));
    const { questionIds } = drawQuestions(moduleWith(questions, { mixScenarioShare: 0.4 }), createRng(3));
    expect(questionIds).toHaveLength(8);
    expect(questionIds.filter((id) => kindOf(id) !== 'scenario')).toHaveLength(2);
  });

  it('uses every eligible question when the bank is smaller than drawCount, without duplicates', () => {
    const questions = bank().slice(0, 6);
    const { questionIds } = drawQuestions(moduleWith(questions, { mode: 'mcq', drawCount: 10 }), createRng(4));
    expect([...questionIds].sort()).toEqual(questions.map((q) => q.id).sort());
  });

  it('draws one question when drawCount is 1', () => {
    const { questionIds } = drawQuestions(moduleWith(bank(), { mode: 'mcq', drawCount: 1 }), createRng(5));
    expect(questionIds).toHaveLength(1);
  });

  it('never repeats a question', () => {
    const { questionIds } = drawQuestions(moduleWith(bank(), { drawCount: 18, mixScenarioShare: 0.4 }), createRng(6));
    expect(new Set(questionIds).size).toBe(questionIds.length);
  });

  it('gives the same draw for the same seed and a different draw for some other seeds', () => {
    const m = moduleWith(bank());
    expect(drawQuestions(m, createRng(11))).toEqual(drawQuestions(m, createRng(11)));
    const distinct = new Set(
      Array.from({ length: 20 }, (_, s) => drawQuestions(m, createRng(s + 100)).questionIds.join(',')),
    );
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  it('keeps bank order when shuffleQuestions is false, still choosing different subsets', () => {
    const m = moduleWith(bank(), { shuffleQuestions: false, drawCount: 8, mode: 'mcq' });
    const subsets = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { questionIds } = drawQuestions(m, createRng(seed));
      const positions = questionIds.map((id) => bankOrder.indexOf(id));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      subsets.add(questionIds.join(','));
    }
    expect(subsets.size).toBeGreaterThan(1);
  });

  it('produces a non-bank order for some seed when shuffleQuestions is true', () => {
    const m = moduleWith(bank(), { shuffleQuestions: true, drawCount: 8, mode: 'mcq' });
    const outOfOrder = Array.from({ length: 20 }, (_, s) => drawQuestions(m, createRng(s + 1)).questionIds).some(
      (ids) => {
        const pos = ids.map((id) => bankOrder.indexOf(id));
        return pos.some((p, i) => i > 0 && p < (pos[i - 1] as number));
      },
    );
    expect(outOfOrder).toBe(true);
  });

  it('keeps option order for every drawn question when shuffleOptions is false', () => {
    const m = moduleWith(bank(), { shuffleOptions: false, drawCount: 18, mixScenarioShare: 0.4 });
    const { questionIds, optionOrder } = drawQuestions(m, createRng(8));
    for (const id of questionIds) {
      const q = m.questions.find((x) => x.id === id)!;
      const original =
        q.type === 'scenario' ? q.scenario!.steps[0]!.choices.map((c) => c.id) : q.options!.map((o) => o.id);
      const given = optionOrder[id];
      if (given !== undefined) expect(given).toEqual(original);
    }
  });

  it('reorders options of at least one mcq or scenario question when shuffleOptions is true', () => {
    const m = moduleWith(bank(), { shuffleOptions: true, drawCount: 18, mixScenarioShare: 0.4 });
    let reordered = false;
    for (let seed = 1; seed <= 10; seed++) {
      const { questionIds, optionOrder } = drawQuestions(m, createRng(seed));
      for (const id of questionIds) {
        const q = m.questions.find((x) => x.id === id)!;
        if (q.type !== 'mcq') continue;
        const order = optionOrder[id];
        expect(order).toBeDefined();
        expect([...order!].sort()).toEqual(q.options!.map((o) => o.id).sort());
        if (order!.join() !== q.options!.map((o) => o.id).join()) reordered = true;
      }
    }
    expect(reordered).toBe(true);
  });

  it('never reorders true or false options', () => {
    const m = moduleWith(bank(), { shuffleOptions: true, drawCount: 12, mode: 'mcq' });
    for (let seed = 1; seed <= 20; seed++) {
      const { questionIds, optionOrder } = drawQuestions(m, createRng(seed));
      for (const id of questionIds.filter((x) => kindOf(x) === 'tf')) {
        const order = optionOrder[id];
        if (order !== undefined) expect(order).toEqual([`${id}-true`, `${id}-false`]);
      }
    }
  });

  it('does not mutate the module', () => {
    const m = moduleWith(bank());
    const before = JSON.stringify(m);
    drawQuestions(m, createRng(9));
    expect(JSON.stringify(m)).toBe(before);
  });
});

// F-2 and plan Assumption 6: answer checking, scenario walking and scoring.
import { describe, expect, it } from 'vitest';
import { InvalidAnswerError, checkAnswer, scoreAttempt, walkScenario } from './score';
import { mcq, moduleWith, scenario, trueFalse } from './testFixtures';

describe('checkAnswer', () => {
  it('marks the correct mcq option right and another wrong', () => {
    const q = mcq('m1', 2);
    expect(checkAnswer(q, { optionId: 'm1-o2' }).correct).toBe(true);
    expect(checkAnswer(q, { optionId: 'm1-o0' }).correct).toBe(false);
  });

  it('marks true or false answers', () => {
    const q = trueFalse('t1', false);
    expect(checkAnswer(q, { optionId: 't1-false' }).correct).toBe(true);
    expect(checkAnswer(q, { optionId: 't1-true' }).correct).toBe(false);
  });

  it('throws InvalidAnswerError for an option that is not in the question', () => {
    expect(() => checkAnswer(mcq('m1'), { optionId: 'nope' })).toThrow(InvalidAnswerError);
  });

  it('is correct with outcome best when every choice is best', () => {
    expect(checkAnswer(scenario('s1'), { choiceIds: ['s1-a', 's1-d'] })).toEqual({ correct: true, outcome: 'best' });
  });

  it('is incorrect with outcome ok for best then ok', () => {
    expect(checkAnswer(scenario('s1'), { choiceIds: ['s1-a', 's1-e'] })).toEqual({ correct: false, outcome: 'ok' });
  });

  it('reports poor when any choice is poor, even after a best one', () => {
    expect(checkAnswer(scenario('s1'), { choiceIds: ['s1-a', 's1-f'] })).toEqual({ correct: false, outcome: 'poor' });
    expect(checkAnswer(scenario('s1'), { choiceIds: ['s1-c'] })).toEqual({ correct: false, outcome: 'poor' });
  });

  it('reports poor over ok when both appear on the path', () => {
    expect(checkAnswer(scenario('s1'), { choiceIds: ['s1-b', 's1-f'] }).outcome).toBe('poor');
  });
});

describe('walkScenario', () => {
  it('returns the choices along a valid path', () => {
    const path = walkScenario(scenario('s1'), ['s1-b', 's1-d']);
    expect(path.map((c) => c.id)).toEqual(['s1-b', 's1-d']);
  });

  it('accepts a path that ends early at a choice with no next', () => {
    expect(walkScenario(scenario('s1'), ['s1-c'])).toHaveLength(1);
  });

  it('throws when a choice belongs to the wrong step', () => {
    expect(() => walkScenario(scenario('s1'), ['s1-d', 's1-a'])).toThrow(InvalidAnswerError);
  });

  it('throws when a step is skipped', () => {
    expect(() => walkScenario(scenario('s1'), ['s1-d'])).toThrow(InvalidAnswerError);
  });

  it('throws when the path stops before a choice with no next', () => {
    expect(() => walkScenario(scenario('s1'), ['s1-a'])).toThrow(InvalidAnswerError);
  });

  it('throws when the path continues past the end', () => {
    expect(() => walkScenario(scenario('s1'), ['s1-c', 's1-d'])).toThrow(InvalidAnswerError);
    expect(() => walkScenario(scenario('s1'), [])).toThrow(InvalidAnswerError);
  });

  it('throws for an unknown choice id', () => {
    expect(() => walkScenario(scenario('s1'), ['zzz'])).toThrow(InvalidAnswerError);
  });
});

describe('scoreAttempt', () => {
  const questions = Array.from({ length: 9 }, (_, i) => mcq(`q${i + 1}`, 0));
  const m = moduleWith(questions);
  const ids = questions.map((q) => q.id);
  const answers = (wrong: number): Record<string, { optionId: string }> =>
    Object.fromEntries(ids.map((id, i) => [id, { optionId: i < wrong ? `${id}-o1` : `${id}-o0` }]));

  it('rounds the percentage down (7 of 9 is 77)', () => {
    expect(scoreAttempt(ids, answers(2), m, 80).score).toBe(77);
  });

  it('scores 100 and passes when all are right', () => {
    expect(scoreAttempt(ids, answers(0), m, 80)).toEqual({ score: 100, passed: true, missedQuestionIds: [] });
  });

  it('passes at exactly the pass mark and fails one below', () => {
    const ten = Array.from({ length: 10 }, (_, i) => mcq(`p${i + 1}`, 0));
    const tm = moduleWith(ten);
    const tids = ten.map((q) => q.id);
    const build = (wrong: number): Record<string, { optionId: string }> =>
      Object.fromEntries(tids.map((id, i) => [id, { optionId: i < wrong ? `${id}-o1` : `${id}-o0` }]));
    expect(scoreAttempt(tids, build(2), tm, 80).passed).toBe(true);
    expect(scoreAttempt(tids, build(3), tm, 80).passed).toBe(false);
  });

  it('lists missed questions in the drawn order, including incorrect scenarios', () => {
    const qs = [mcq('a1', 0), scenario('s1'), mcq('a2', 0)];
    const sm = moduleWith(qs);
    const result = scoreAttempt(
      ['a2', 's1', 'a1'],
      { a1: { optionId: 'a1-o0' }, s1: { choiceIds: ['s1-a', 's1-e'] }, a2: { optionId: 'a2-o3' } },
      sm,
      50,
    );
    expect(result.missedQuestionIds).toEqual(['a2', 's1']);
    expect(result.score).toBe(33);
    expect(result.passed).toBe(false);
  });

  it('counts an unanswered drawn question as missed', () => {
    const result = scoreAttempt(['q1', 'q2'], { q1: { optionId: 'q1-o0' } }, m, 50);
    expect(result.missedQuestionIds).toEqual(['q2']);
    expect(result.score).toBe(50);
  });
});

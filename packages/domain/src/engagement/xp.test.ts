// BP-1: XP rules (plan M2 assumptions 1 to 4). XP is derived from events; nothing reads timing.
import { describe, expect, it } from 'vitest';
import { learningEventSchema } from '../schemas/learning';
import type { LearningEvent } from '../schemas/learning';
import { xpForAttempt, xpLedger, xpTotal } from './xp';
import { answer, attemptFor, bankModule, event, me, moduleEvidence, nextId, passed, reversed } from './testFixtures';
import type { Module } from '../schemas/learning';

const run = (events: LearningEvent[], modules: Module[], extra: Record<string, unknown> = {}) =>
  xpLedger({
    events,
    attempts: [],
    modules,
    evidence: [],
    requirements: [],
    weeklyGoalLessons: 50, // out of the way unless a test sets it
    ...extra,
  });
const of = (ledger: ReturnType<typeof run>, kind: string) =>
  ledger.filter((e) => e.kind === kind).reduce((n, e) => n + e.amount, 0);
const day = (d: number, h = 10) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`;

describe('lesson XP', () => {
  const m = bankModule(2, 3);
  const lessonDone = (id: string, at: string) => event({ type: 'lessonCompleted', moduleId: m.id, lessonId: id, at });

  it('gives 10 for the first completion of a lesson and 0 for repeats', () => {
    const l = run([lessonDone('l1', day(20)), lessonDone('l1', day(21)), lessonDone('l2', day(21, 11))], [m]);
    expect(l.filter((e) => e.kind === 'lesson').map((e) => e.amount)).toEqual([10, 10]);
    expect(of(l, 'lesson')).toBe(20);
    expect(xpTotal(l)).toBe(20);
  });

  it('never lets a repeat lesson earn, even in a later week', () => {
    const l = run([lessonDone('l1', day(5)), lessonDone('l1', day(26))], [m]);
    expect(xpTotal(l)).toBe(10);
  });
});

describe('question XP: unique credit only', () => {
  const m = bankModule(1, 5);

  it('gives 10 for the first correct answer to a question', () => {
    const l = run([answer(m, 'q1', day(20), { notesVisible: true })], [m]);
    expect(of(l, 'correct')).toBe(10);
    expect(xpTotal(l)).toBe(10);
  });

  it('gives 0 for a second correct answer to the same question in another attempt or mode', () => {
    const a1 = nextId();
    const a2 = nextId();
    const l = run(
      [
        answer(m, 'q1', day(20), { attemptId: a1, notesVisible: true }),
        answer(m, 'q1', day(21), { attemptId: a2, attemptMode: 'closed', notesVisible: false }),
      ],
      [m],
    );
    expect(xpTotal(l)).toBe(10);
  });

  it('gives nothing for a wrong answer and does not use it up, so a later correct answer still earns', () => {
    const l = run(
      [
        answer(m, 'q1', day(20), { correct: false, notesVisible: true }),
        answer(m, 'q1', day(21), { notesVisible: true }),
      ],
      [m],
    );
    expect(xpTotal(l)).toBe(10);
  });

  it('keys credit by module and question, so the same question key in another module earns', () => {
    const m2 = bankModule(1, 5);
    const l = run(
      [answer(m, 'q1', day(20), { notesVisible: true }), answer(m2, 'q1', day(20, 11), { notesVisible: true })],
      [m, m2],
    );
    expect(of(l, 'correct')).toBe(20);
  });

  it('rejects a questionAnswered event with no notesVisible', () => {
    const { notesVisible: _omit, ...bad } = answer(m, 'q1', day(20));
    expect(learningEventSchema.safeParse(bad).success).toBe(false);
  });
});

describe('closed-book bonus per question', () => {
  const m = bankModule(1, 6);

  it('adds a separate closedBookBonus of 5 to a first correct answer given with notes hidden', () => {
    const l = run([answer(m, 'q1', day(20), { attemptMode: 'closed', notesVisible: false })], [m]);
    expect(of(l, 'correct')).toBe(10);
    expect(of(l, 'closedBookBonus')).toBe(5);
    expect(xpTotal(l)).toBe(15);
  });

  it('gives no bonus to a question answered with notes visible, while the others in the attempt keep theirs', () => {
    const att = nextId();
    const l = run(
      [
        answer(m, 'q1', day(20, 10), { attemptId: att, notesVisible: false }),
        answer(m, 'q2', day(20, 11), { attemptId: att, notesVisible: true }),
        answer(m, 'q3', day(20, 12), { attemptId: att, notesVisible: false }),
      ],
      [m],
    );
    expect(of(l, 'correct')).toBe(30);
    expect(l.filter((e) => e.kind === 'closedBookBonus')).toHaveLength(2);
    expect(of(l, 'closedBookBonus')).toBe(10);
  });

  it('gives no bonus on a repeat correct answer, even with notes hidden', () => {
    const l = run(
      [answer(m, 'q1', day(20), { notesVisible: true }), answer(m, 'q1', day(21), { notesVisible: false })],
      [m],
    );
    expect(of(l, 'closedBookBonus')).toBe(0);
  });

  it('gives no bonus on a wrong answer', () => {
    const l = run([answer(m, 'q1', day(20), { correct: false, notesVisible: false })], [m]);
    expect(xpTotal(l)).toBe(0);
  });
});

describe('passing a module', () => {
  const m = bankModule(1, 3);
  const m2 = { ...m, version: 2 };

  it('gives 20 for the first pass of a version and 0 for a later pass of the same version', () => {
    const l = run([passed(m, day(20)), passed(m, day(22))], [m]);
    expect(of(l, 'passed')).toBe(20);
  });

  it('gives 10 for a pass of a newer version of a module passed before', () => {
    const l = run([passed(m, day(20)), passed(m2, day(22))], [m2]);
    expect(of(l, 'passed')).toBe(30);
    expect(l.filter((e) => e.kind === 'passed').map((e) => e.amount)).toEqual([20, 10]);
  });
});

describe('mastery', () => {
  const m = bankModule(1, 3);

  it('gives 30 at the answer that completes the bank, once', () => {
    const events = [
      answer(m, 'q1', day(20, 9), { notesVisible: true }),
      answer(m, 'q2', day(20, 10), { notesVisible: true }),
      answer(m, 'q3', day(20, 11), { notesVisible: true }),
      answer(m, 'q3', day(21, 11), { notesVisible: true }),
      answer(m, 'q1', day(22, 11), { notesVisible: true }),
    ];
    const l = run(events, [m]);
    const mastery = l.filter((e) => e.kind === 'mastery');
    expect(mastery).toHaveLength(1);
    expect(mastery[0]).toMatchObject({ amount: 30, sourceEventId: events[2]!.id, at: day(20, 11) });
  });

  it('is not given while a question in the bank has no credited correct answer', () => {
    const l = run(
      [
        answer(m, 'q1', day(20, 9), { notesVisible: true }),
        answer(m, 'q2', day(20, 10), { correct: false, notesVisible: true }),
        answer(m, 'q3', day(20, 11), { notesVisible: true }),
      ],
      [m],
    );
    expect(of(l, 'mastery')).toBe(0);
  });
});

describe('early refresher', () => {
  const reqId = nextId();
  const m = bankModule(1, 2, { requirementIds: [reqId] });
  const doneAt = '2026-10-20T10:00:00.000Z';

  it('gives 25 when the previous Evidence had not yet expired', () => {
    const evidence = [
      moduleEvidence(reqId, '2025-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z'),
      moduleEvidence(reqId, doneAt, '2027-10-20T10:00:00.000Z', { moduleId: m.id }),
    ];
    const l = run([passed(m, doneAt)], [m], { evidence });
    expect(of(l, 'earlyRefresher')).toBe(25);
  });

  it('does not give it when expiry equals the completion instant', () => {
    const evidence = [
      moduleEvidence(reqId, '2025-10-20T10:00:00.000Z', doneAt),
      moduleEvidence(reqId, doneAt, '2027-10-20T10:00:00.000Z', { moduleId: m.id }),
    ];
    expect(of(run([passed(m, doneAt)], [m], { evidence }), 'earlyRefresher')).toBe(0);
  });

  it('does not give it when the previous Evidence had already expired, or there was none', () => {
    const expired = [
      moduleEvidence(reqId, '2025-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z'),
      moduleEvidence(reqId, doneAt, '2027-10-20T10:00:00.000Z', { moduleId: m.id }),
    ];
    expect(of(run([passed(m, doneAt)], [m], { evidence: expired }), 'earlyRefresher')).toBe(0);
    const first = [moduleEvidence(reqId, doneAt, '2027-10-20T10:00:00.000Z', { moduleId: m.id })];
    expect(of(run([passed(m, doneAt)], [m], { evidence: first }), 'earlyRefresher')).toBe(0);
  });
});

describe('weekly goal XP', () => {
  const m = bankModule(4, 1);
  const lessonDone = (id: string, at: string) => event({ type: 'lessonCompleted', moduleId: m.id, lessonId: id, at });

  it('gives 15 once per London week, at the lesson that reaches the goal', () => {
    const events = [
      lessonDone('l1', '2026-10-19T09:00:00.000Z'),
      lessonDone('l2', '2026-10-20T09:00:00.000Z'),
      lessonDone('l3', '2026-10-21T09:00:00.000Z'),
      lessonDone('l4', '2026-10-27T09:00:00.000Z'),
    ];
    const l = run(events, [m], { weeklyGoalLessons: 2 });
    const goals = l.filter((e) => e.kind === 'weeklyGoal');
    expect(goals.map((e) => [e.amount, e.sourceEventId])).toEqual([[15, events[1]!.id]]);
    const next = run([...events, lessonDone('l1', '2026-10-28T09:00:00.000Z')], [m], { weeklyGoalLessons: 2 });
    expect(next.filter((e) => e.kind === 'weeklyGoal')).toHaveLength(2);
  });
});

describe('no XP for speed', () => {
  const m = bankModule(1, 4);
  const stream = (times: string[]) => [
    answer(m, 'q1', times[0]!, { attemptId: 'a', notesVisible: true }),
    answer(m, 'q2', times[1]!, { attemptId: 'a', notesVisible: false }),
    answer(m, 'q3', times[2]!, { attemptId: 'a', notesVisible: false }),
  ];

  it('gives the same total when only the timestamps within a London day differ', () => {
    const slow = stream([day(20, 8), day(20, 13), day(20, 20)]);
    const fast = slow.map((e, i) => ({ ...e, at: `2026-10-20T08:00:0${i}.000Z` }));
    expect(xpTotal(run(fast, [m]))).toBe(xpTotal(run(slow, [m])));
  });

  it('gives the same total when attempt duration differs', () => {
    const events = stream([day(20, 8), day(20, 9), day(20, 10)]);
    const quick = attemptFor(m, {
      id: 'a',
      startedAt: day(20, 8),
      finishedAt: '2026-10-20T08:00:05.000Z',
      score: 100,
      passed: true,
    });
    const slowAtt = attemptFor(m, {
      id: 'a',
      startedAt: day(20, 8),
      finishedAt: day(20, 23),
      score: 100,
      passed: true,
    });
    const a = xpTotal(run(events, [m], { attempts: [quick] }));
    const b = xpTotal(run(events, [m], { attempts: [slowAtt] }));
    expect(a).toBe(b);
  });

  it('has no duration or timing field on its input type', () => {
    const l = run([answer(m, 'q1', day(20), { notesVisible: true })], [m]);
    expect(Object.keys(l[0]!).sort()).not.toContain('durationMs');
    expect(JSON.stringify(l)).not.toMatch(/duration|speed|seconds/i);
  });
});

describe('daily cap of 300', () => {
  const m = bankModule(1, 40);
  const fill = (n: number, d: number, startQ = 1): LearningEvent[] =>
    Array.from({ length: n }, (_, i) =>
      answer(m, `q${startQ + i}`, `2026-10-${d}T10:${String(i).padStart(2, '0')}:00.000Z`, { notesVisible: false }),
    );

  it('allows exactly 300 in a day and then records later entries as 0 and capped', () => {
    const l = run([...fill(20, 20), ...fill(1, 20, 21).map((e) => ({ ...e, at: '2026-10-20T11:00:00.000Z' }))], [m]);
    const day20 = l.filter((e) => e.at.startsWith('2026-10-20'));
    expect(xpTotal(day20)).toBe(300);
    const after = day20.filter((e) => e.at === '2026-10-20T11:00:00.000Z');
    expect(after.length).toBeGreaterThan(0);
    for (const e of after) expect(e).toMatchObject({ amount: 0, capped: true });
  });

  it('reduces the entry that crosses the cap to the remainder', () => {
    const base = fill(19, 20); // 19 x 15 = 285
    const cross = answer(m, 'q30', '2026-10-20T12:00:00.000Z', { notesVisible: true }); // +10 -> 295
    const crossing = answer(m, 'q31', '2026-10-20T12:30:00.000Z', { notesVisible: true }); // 10 but only 5 left
    const over = answer(m, 'q32', '2026-10-20T13:00:00.000Z', { notesVisible: true });
    const l = run([...base, cross, crossing, over], [m]);
    expect(xpTotal(l)).toBe(300);
    expect(l.find((e) => e.sourceEventId === crossing.id)!.amount).toBe(5);
    expect(l.find((e) => e.sourceEventId === over.id)).toMatchObject({ amount: 0, capped: true });
  });

  it('starts the next London day at 0', () => {
    const l = run([...fill(21, 20), answer(m, 'q30', '2026-10-21T08:00:00.000Z', { notesVisible: true })], [m]);
    expect(l.find((e) => e.at === '2026-10-21T08:00:00.000Z')).toMatchObject({ amount: 10 });
    expect(l.find((e) => e.at === '2026-10-21T08:00:00.000Z')!.capped).toBeFalsy();
  });

  it('uses London days across the 25 October 2026 clock change', () => {
    // 25 October is 25 hours long: 2026-10-24T23:00Z to 2026-10-26T00:00Z.
    const filled = fill(20, 25).map((e) => ({ ...e, at: e.at.replace('T10:', 'T09:') }));
    const late = answer(m, 'q30', '2026-10-25T23:30:00.000Z', { notesVisible: true }); // still 25 Oct London
    const nextDay = answer(m, 'q31', '2026-10-26T00:00:00.000Z', { notesVisible: true }); // 26 Oct London
    const l = run([...filled, late, nextDay], [m]);
    expect(l.find((e) => e.sourceEventId === late.id)).toMatchObject({ amount: 0, capped: true });
    expect(l.find((e) => e.sourceEventId === nextDay.id)).toMatchObject({ amount: 10 });
  });
});

describe('ledger order and shape', () => {
  const m = bankModule(2, 3);
  const events = [
    event({ type: 'lessonCompleted', moduleId: m.id, lessonId: 'l1', at: day(20, 9) }),
    answer(m, 'q1', day(20, 10), { notesVisible: false }),
    answer(m, 'q2', day(20, 11), { notesVisible: true }),
    passed(m, day(20, 12)),
  ];

  it('is the same when events arrive in a different array order', () => {
    expect(run(reversed(events), [m])).toEqual(run(events, [m]));
  });

  it('breaks ties on the same instant by event id', () => {
    const a = answer(m, 'q1', day(20), { notesVisible: true });
    const b = answer(m, 'q2', day(20), { notesVisible: true });
    expect(run([b, a], [m])).toEqual(run([a, b], [m]));
  });

  it('returns entries in time order for this person with a source event each', () => {
    const l = run(events, [m]);
    expect(l.map((e) => e.at)).toEqual([...l.map((e) => e.at)].sort());
    for (const e of l) {
      expect(e.personId).toBe(me.id);
      expect(events.map((x) => x.id)).toContain(e.sourceEventId);
    }
  });

  it("ignores other people's events", () => {
    const other = answer(m, 'q3', day(20, 13), { personId: nextId(), notesVisible: true });
    expect(xpTotal(run([...events, other], [m]))).toBe(xpTotal(run(events, [m])));
  });
});

describe('xpForAttempt', () => {
  it('groups the XP from one attempt by kind', () => {
    const m = bankModule(1, 4);
    const a1 = nextId();
    const a2 = nextId();
    const events = [
      answer(m, 'q1', day(20, 9), { attemptId: a1, notesVisible: false }),
      answer(m, 'q2', day(20, 10), { attemptId: a1, notesVisible: true }),
      answer(m, 'q3', day(21, 9), { attemptId: a2, notesVisible: true }),
    ];
    const l = run(events, [m]);
    expect(xpForAttempt(l, a1, events)).toEqual({ correct: 20, closedBookBonus: 5 });
    expect(xpForAttempt(l, a2, events)).toEqual({ correct: 10 });
    expect(xpForAttempt(l, nextId(), events)).toEqual({});
  });
});

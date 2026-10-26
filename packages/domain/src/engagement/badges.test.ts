// F-1: badges (plan M2 assumption 6). Each badge is derived with the instant it was earned.
import { describe, expect, it } from 'vitest';
import { badgeProgress, earnedBadges } from './badges';
import { answer, bankModule, event, me, moduleEvidence, nextId, passed } from './testFixtures';
import { requirement } from '../progress/testFixtures';
import type { LearningEvent, Module } from '../schemas/learning';

const NOW = new Date('2026-11-30T09:00:00.000Z');
const site = { id: me.primarySiteId } as never;
const defs = (m?: Module) =>
  [
    { id: 'firstModule', kind: 'firstModule' },
    { id: 'safeguardingReady', kind: 'safeguardingReady', moduleId: m?.id },
    { id: 'mastery', kind: 'mastery' },
    { id: 'earlyBird', kind: 'earlyBird' },
    { id: 'scenarioSavvy', kind: 'scenarioSavvy' },
    { id: 'learningHabit', kind: 'learningHabit' },
    { id: 'allCompliant', kind: 'allCompliant' },
    { id: 'competitionWinner', kind: 'competitionWinner' },
  ] as never;

const earn = (over: Record<string, unknown> = {}, m?: Module) =>
  earnedBadges({
    definitions: defs(m),
    events: [] as LearningEvent[],
    attempts: [],
    modules: m ? [m] : [],
    evidence: [],
    requirements: [],
    competitions: [],
    person: me,
    site,
    ...over,
  });
const at = (badges: { badgeId: string; at: string }[], id: string) => badges.find((b) => b.badgeId === id)?.at;

describe('earnedBadges', () => {
  it('awards nothing for a person with no history', () => {
    expect(earn()).toEqual([]);
  });

  it('awards First module at the first moduleCompleted event', () => {
    const m = bankModule(1, 2);
    const b = earn({ events: [passed(m, '2026-10-22T10:00:00.000Z'), passed(m, '2026-10-20T10:00:00.000Z')] }, m);
    expect(at(b, 'firstModule')).toBe('2026-10-20T10:00:00.000Z');
  });

  it('awards Safeguarding Ready when the safeguarding module is passed, not another module', () => {
    const sg = bankModule(1, 2);
    const other = bankModule(1, 2);
    expect(
      at(earn({ events: [passed(other, '2026-10-20T10:00:00.000Z')], modules: [sg, other] }, sg), 'safeguardingReady'),
    ).toBeUndefined();
    expect(at(earn({ events: [passed(sg, '2026-10-21T10:00:00.000Z')] }, sg), 'safeguardingReady')).toBe(
      '2026-10-21T10:00:00.000Z',
    );
  });

  it('awards one Mastery badge per module at the answer that completes its bank', () => {
    const m = bankModule(1, 2);
    const events = [
      answer(m, 'q1', '2026-10-20T10:00:00.000Z', { notesVisible: true }),
      answer(m, 'q2', '2026-10-21T10:00:00.000Z', { notesVisible: true }),
    ];
    const b = earn({ events }, m);
    expect(b.filter((x) => x.badgeId === `mastery:${m.id}`)).toEqual([
      { badgeId: `mastery:${m.id}`, at: '2026-10-21T10:00:00.000Z' },
    ]);
    expect(earn({ events: events.slice(0, 1) }, m).some((x) => x.badgeId.startsWith('mastery'))).toBe(false);
  });

  it('awards Early Bird at the first early refresher only', () => {
    const r = requirement('Safeguarding');
    const m = bankModule(1, 1, { requirementIds: [r.id] });
    const early = moduleEvidence(r.id, '2026-10-20T10:00:00.000Z', '2027-10-20T10:00:00.000Z', { moduleId: m.id });
    const prevOk = moduleEvidence(r.id, '2025-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z');
    const prevExpired = moduleEvidence(r.id, '2025-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z');
    const events = [passed(m, '2026-10-20T10:00:00.000Z')];
    expect(at(earn({ events, evidence: [prevOk, early], requirements: [r] }, m), 'earlyBird')).toBe(
      '2026-10-20T10:00:00.000Z',
    );
    expect(at(earn({ events, evidence: [prevExpired, early], requirements: [r] }, m), 'earlyBird')).toBeUndefined();
  });

  it('awards Scenario Savvy at the 10th different scenario question with the best outcome, not at 9', () => {
    const m = bankModule(1, 12);
    const scen = (i: number, over: Partial<LearningEvent> = {}) =>
      answer(m, `q${i}`, `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`, {
        scenarioOutcome: 'best',
        notesVisible: false,
        ...over,
      });
    const nine = Array.from({ length: 9 }, (_, i) => scen(i + 1));
    expect(at(earn({ events: nine }, m), 'scenarioSavvy')).toBeUndefined();
    // the same question again, and an ok outcome, do not count
    const padded = [...nine, scen(9, { at: '2026-10-30T10:00:00.000Z' }), scen(10, { scenarioOutcome: 'ok' })];
    expect(at(earn({ events: padded }, m), 'scenarioSavvy')).toBeUndefined();
    const ten = [...nine, scen(10)];
    expect(at(earn({ events: ten }, m), 'scenarioSavvy')).toBe(ten[9]!.at);
  });

  it('awards Learning Habit when the 4th active week begins, not at 3 weeks', () => {
    const wk = (iso: string): LearningEvent =>
      event({ type: 'lessonCompleted', moduleId: nextId(), lessonId: 'l1', at: iso });
    const three = [wk('2026-10-05T10:00:00.000Z'), wk('2026-10-12T10:00:00.000Z'), wk('2026-10-19T10:00:00.000Z')];
    expect(at(earn({ events: three }), 'learningHabit')).toBeUndefined();
    const four = [...three, wk('2026-11-09T10:00:00.000Z')]; // gaps are fine; weeks never reset
    expect(at(earn({ events: four }), 'learningHabit')).toBe('2026-11-09T10:00:00.000Z');
  });

  it('awards All Compliant at an Evidence instant using only Evidence completed up to then', () => {
    const a = requirement('A');
    const b = requirement('B');
    const evA = moduleEvidence(a.id, '2026-03-01T10:00:00.000Z', '2027-03-01T10:00:00.000Z');
    const evB = moduleEvidence(b.id, '2026-06-01T10:00:00.000Z', '2027-06-01T10:00:00.000Z');
    const base = { requirements: [a, b] };
    expect(at(earn({ ...base, evidence: [evA] }), 'allCompliant')).toBeUndefined();
    expect(at(earn({ ...base, evidence: [evA, evB] }), 'allCompliant')).toBe('2026-06-01T10:00:00.000Z');
    const aExpired = moduleEvidence(a.id, '2025-03-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z');
    expect(at(earn({ ...base, evidence: [aExpired, evB] }), 'allCompliant')).toBeUndefined();
  });

  it('awards Competition winner from recorded winners naming this person', () => {
    const win = { id: nextId(), winners: [{ personId: me.id, recordedAt: '2026-10-31T10:00:00.000Z' }] };
    const lose = { id: nextId(), winners: [{ personId: nextId(), recordedAt: '2026-10-31T10:00:00.000Z' }] };
    expect(at(earn({ competitions: [win] }), 'competitionWinner')).toBe('2026-10-31T10:00:00.000Z');
    expect(at(earn({ competitions: [lose] }), 'competitionWinner')).toBeUndefined();
  });

  it('never depends on how fast anything was done', () => {
    const m = bankModule(1, 2);
    const slow = [
      answer(m, 'q1', '2026-10-20T10:00:00.000Z', { notesVisible: true }),
      answer(m, 'q2', '2026-10-20T18:00:00.000Z', { notesVisible: true }),
    ];
    const fast = slow.map((e, i) => ({ ...e, at: `2026-10-20T10:00:0${i}.000Z` }));
    expect(earn({ events: fast }, m).map((x) => x.badgeId)).toEqual(earn({ events: slow }, m).map((x) => x.badgeId));
  });
});

describe('badgeProgress', () => {
  it('shows unearned badges as next goals with current and target', () => {
    const m = bankModule(1, 12);
    const nine = Array.from({ length: 9 }, (_, i) =>
      answer(m, `q${i + 1}`, `2026-10-${String(11 + i).padStart(2, '0')}T10:00:00.000Z`, {
        scenarioOutcome: 'best',
        notesVisible: false,
      }),
    );
    const weeks = ['2026-10-05', '2026-10-12', '2026-10-19'].map((d) =>
      event({ type: 'lessonCompleted', moduleId: m.id, lessonId: 'l1', at: `${d}T10:00:00.000Z` }),
    );
    const p = badgeProgress({
      definitions: defs(m),
      events: [...nine, ...weeks],
      attempts: [],
      modules: [m],
      evidence: [],
      requirements: [],
      competitions: [],
      person: me,
      site,
      now: NOW,
    });
    const find = (id: string) => p.find((x: { badgeId: string }) => x.badgeId === id);
    expect(find('scenarioSavvy')).toMatchObject({ earned: false, current: 9, target: 10 });
    expect(find('learningHabit')).toMatchObject({ earned: false, current: 3, target: 4 });
    expect(find('firstModule')).toMatchObject({ earned: false, current: 0, target: 1 });
  });

  it('marks an earned badge as earned with its instant', () => {
    const m = bankModule(1, 1);
    const p = badgeProgress({
      definitions: defs(m),
      events: [passed(m, '2026-10-20T10:00:00.000Z')],
      attempts: [],
      modules: [m],
      evidence: [],
      requirements: [],
      competitions: [],
      person: me,
      site,
      now: NOW,
    });
    expect(p.find((x: { badgeId: string }) => x.badgeId === 'firstModule')).toMatchObject({
      earned: true,
      at: '2026-10-20T10:00:00.000Z',
    });
  });
});

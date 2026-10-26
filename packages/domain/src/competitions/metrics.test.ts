// BP-2 and BP-4: the eight brief 13.4 template metrics over fixtures (plan M2 assumption 13).
// Only events in [startAt, endAt) count. Eligible people only. XP is never an input.
import { describe, expect, it } from 'vitest';
import { competitionMetric } from './metrics';
import {
  attemptOf,
  bank,
  competition,
  completedModule,
  correct,
  dueAssignment,
  event,
  lessonDone,
  metricInput,
  nextId,
  staff,
  wrong,
} from './testFixtures';
import { moduleEvidence } from '../engagement/testFixtures';
import { requirement, team } from '../progress/testFixtures';

const ada = staff('Ada', 'Adams');
const bea = staff('Bea', 'Brown');
const cat = staff('Cat', 'Clarke');
const dee = staff('Dee', 'Dunn');
const eve = staff('Eve', 'Evans');
const fay = staff('Fay', 'Fox', { status: 'onLeave' });
const everyone = [ada, bea, cat, dee, eve, fay];

const IN = '2026-10-10T10:00:00.000Z';
const BEFORE = '2026-09-30T23:59:59.999Z';
const START = '2026-10-01T00:00:00.000Z';
const END = '2026-11-01T00:00:00.000Z';
const val = (m: { values: Map<string, number> }, id: string) => m.values.get(id) ?? 0;

describe('knowledgeBuilder: unique questions answered correctly in the window', () => {
  const m = bank(['q1', 'q2', 'q3']);
  const m2 = bank(['q1', 'q2']);

  it('counts each question once per person, ignores wrong answers and repeats', () => {
    const events = [
      correct(ada, m, 'q1', IN),
      correct(ada, m, 'q1', '2026-10-11T10:00:00.000Z'),
      correct(ada, m, 'q2', IN),
      wrong(ada, m, 'q3', IN),
      correct(bea, m, 'q1', IN),
      correct(bea, m2, 'q1', IN), // same key in another module is a different question
    ];
    const r = competitionMetric('knowledgeBuilder', metricInput({ people: everyone, events, modules: [m, m2] }));
    expect(r.unit).toBe('person');
    expect(val(r, ada.id)).toBe(2);
    expect(val(r, bea.id)).toBe(2);
    expect(val(r, cat.id)).toBe(0);
  });

  it('includes an event exactly at startAt and excludes one exactly at endAt', () => {
    const events = [correct(ada, m, 'q1', START), correct(ada, m, 'q2', END), correct(ada, m, 'q3', BEFORE)];
    const r = competitionMetric('knowledgeBuilder', metricInput({ people: everyone, events, modules: [m] }));
    expect(val(r, ada.id)).toBe(1);
  });

  it('counts a question again inside the window if it was only answered correctly before it', () => {
    const events = [correct(ada, m, 'q1', '2026-08-01T10:00:00.000Z'), correct(ada, m, 'q1', IN)];
    const r = competitionMetric('knowledgeBuilder', metricInput({ people: everyone, events, modules: [m] }));
    expect(val(r, ada.id)).toBe(1);
  });

  it('restricts to moduleIds when set', () => {
    const events = [correct(ada, m, 'q1', IN), correct(ada, m2, 'q1', IN), correct(ada, m2, 'q2', IN)];
    const c = competition({ moduleIds: [m2.id] });
    const r = competitionMetric(
      'knowledgeBuilder',
      metricInput({ competition: c, people: everyone, events, modules: [m, m2] }),
    );
    expect(val(r, ada.id)).toBe(2);
  });

  it('never counts people on leave or named exclusions, and has no entry for them', () => {
    const events = [correct(fay, m, 'q1', IN), correct(eve, m, 'q1', IN), correct(ada, m, 'q1', IN)];
    const c = competition({ eligibility: { excludePersonIds: [eve.id] } });
    const r = competitionMetric(
      'knowledgeBuilder',
      metricInput({ competition: c, people: everyone, events, modules: [m] }),
    );
    expect(r.values.has(fay.id)).toBe(false);
    expect(r.values.has(eve.id)).toBe(false);
    expect(val(r, ada.id)).toBe(1);
  });

  it('gives every eligible person an entry, including zero, so "of N" can be counted', () => {
    const r = competitionMetric('knowledgeBuilder', metricInput({ people: everyone, events: [], modules: [m] }));
    expect([...r.values.keys()].sort()).toEqual([ada.id, bea.id, cat.id, dee.id, eve.id].sort());
  });

  it('narrows to eligible roles and teams', () => {
    const role = nextId();
    const cook = staff('Cook', 'Role', { jobRoleIds: [role] });
    const events = [correct(cook, m, 'q1', IN), correct(ada, m, 'q1', IN)];
    const c = competition({ eligibility: { jobRoleIds: [role], excludePersonIds: [] } });
    const r = competitionMetric(
      'knowledgeBuilder',
      metricInput({ competition: c, people: [cook, ada], events, modules: [m] }),
    );
    expect(r.values.has(ada.id)).toBe(false);
    expect(val(r, cook.id)).toBe(1);
  });

  it('takes no XP: an xp field on the input is a type error and changes nothing', () => {
    const events = [correct(ada, m, 'q1', IN)];
    const base = metricInput({ people: everyone, events, modules: [m] });
    // @ts-expect-error XP is never an input to a ranking
    const withXp = competitionMetric('knowledgeBuilder', { ...base, xp: new Map([[ada.id, 9999]]) });
    expect(val(withXp, ada.id)).toBe(1);
  });
});

describe('masteryMonth: modules where every question in the current bank was answered correctly in the window', () => {
  const m = bank(['q1', 'q2']);
  const big = bank(['q1', 'q2', 'q3']);

  it('counts a module once its whole bank is answered correctly, across attempts and retakes', () => {
    const events = [
      correct(ada, m, 'q1', IN),
      wrong(ada, m, 'q2', IN),
      correct(ada, m, 'q2', '2026-10-12T10:00:00.000Z'), // retake
      correct(bea, m, 'q1', IN),
      correct(bea, big, 'q1', IN),
      correct(bea, big, 'q2', IN),
    ];
    const r = competitionMetric('masteryMonth', metricInput({ people: everyone, events, modules: [m, big] }));
    expect(r.unit).toBe('person');
    expect(val(r, ada.id)).toBe(1);
    expect(val(r, bea.id)).toBe(0);
  });

  it('needs every answer inside the window: an earlier correct answer does not complete the bank', () => {
    const events = [correct(ada, m, 'q1', BEFORE), correct(ada, m, 'q2', IN)];
    const r = competitionMetric('masteryMonth', metricInput({ people: everyone, events, modules: [m] }));
    expect(val(r, ada.id)).toBe(0);
  });

  it('treats the final answer at endAt as outside the window', () => {
    const events = [correct(ada, m, 'q1', IN), correct(ada, m, 'q2', END)];
    const r = competitionMetric('masteryMonth', metricInput({ people: everyone, events, modules: [m] }));
    expect(val(r, ada.id)).toBe(0);
  });

  it('counts several mastered modules and honours moduleIds', () => {
    const events = [
      correct(ada, m, 'q1', IN),
      correct(ada, m, 'q2', IN),
      correct(ada, big, 'q1', IN),
      correct(ada, big, 'q2', IN),
      correct(ada, big, 'q3', IN),
    ];
    const all = competitionMetric('masteryMonth', metricInput({ people: everyone, events, modules: [m, big] }));
    expect(val(all, ada.id)).toBe(2);
    const only = competitionMetric(
      'masteryMonth',
      metricInput({
        competition: competition({ templateId: 'masteryMonth', moduleIds: [big.id] }),
        people: everyone,
        events,
        modules: [m, big],
      }),
    );
    expect(val(only, ada.id)).toBe(1);
  });
});

describe('learningStreak: active London weeks in the window', () => {
  it('counts each week once, from lessons completed or attempts finished only', () => {
    const events = [
      lessonDone(ada, '2026-10-01T09:00:00.000Z'), // week of 28 Sep
      lessonDone(ada, '2026-10-06T09:00:00.000Z'), // week of 5 Oct
      lessonDone(ada, '2026-10-07T09:00:00.000Z'), // same week again
      event({ type: 'attemptFinished', personId: ada.id, at: '2026-10-21T09:00:00.000Z' }), // week of 19 Oct
      event({ type: 'lessonViewed', personId: ada.id, at: '2026-10-14T09:00:00.000Z' }), // does not count
      event({ type: 'login', personId: ada.id, at: '2026-10-15T09:00:00.000Z' }), // does not count
    ];
    const r = competitionMetric(
      'learningStreak',
      metricInput({ competition: competition({ templateId: 'learningStreak' }), people: everyone, events }),
    );
    expect(r.unit).toBe('person');
    expect(val(r, ada.id)).toBe(3);
  });

  it('respects the window edges and does not need weeks to be consecutive', () => {
    const events = [
      lessonDone(bea, BEFORE),
      lessonDone(bea, END),
      lessonDone(cat, START),
      lessonDone(cat, '2026-10-26T09:00:00.000Z'),
    ];
    const r = competitionMetric(
      'learningStreak',
      metricInput({ competition: competition({ templateId: 'learningStreak' }), people: everyone, events }),
    );
    expect(val(r, bea.id)).toBe(0);
    expect(val(r, cat.id)).toBe(2);
  });

  it('restricts to moduleIds when set', () => {
    const a = bank(['q1']);
    const b = bank(['q1']);
    const events = [lessonDone(ada, '2026-10-06T09:00:00.000Z', a), lessonDone(ada, '2026-10-14T09:00:00.000Z', b)];
    const c = competition({ templateId: 'learningStreak', moduleIds: [b.id] });
    const r = competitionMetric(
      'learningStreak',
      metricInput({ competition: c, people: everyone, events, modules: [a, b] }),
    );
    expect(val(r, ada.id)).toBe(1);
  });
});

describe('teamShowdown: percentage of assignments due in the window completed by their due date', () => {
  const m = bank(['q1']);
  const teamA = team(nextId(), 'Baby room');
  const teamB = team(nextId(), 'Toddler room');
  const teamC = team(nextId(), 'Pre-school');
  const a1 = staff('Ann', 'A', { teamIds: [teamA.id] });
  const a2 = staff('Abi', 'A', { teamIds: [teamA.id] });
  const a3 = staff('Amy', 'A', { teamIds: [teamA.id] });
  const b1 = staff('Bob', 'B', { teamIds: [teamB.id] });
  const b2 = staff('Ben', 'B', { teamIds: [teamB.id] });
  const c1 = staff('Cal', 'C', { teamIds: [teamC.id] });
  const leaver = staff('Lea', 'L', { teamIds: [teamA.id], status: 'onLeave' });
  const people = [a1, a2, a3, b1, b2, c1, leaver];
  const c = competition({ templateId: 'teamShowdown' });
  const due = '2026-10-15T12:00:00.000Z';

  it('gives percentages rounded down, counting completion at or before the due instant, per team', () => {
    const assignments = [
      dueAssignment(a1, m, due),
      dueAssignment(a2, m, due),
      dueAssignment(a3, m, due),
      dueAssignment(b1, m, '2026-10-20T12:00:00.000Z'),
      dueAssignment(b2, m, '2026-10-20T12:00:00.000Z'),
      dueAssignment(leaver, m, due), // on leave: not counted
    ];
    const events = [
      completedModule(a1, m, '2026-10-10T10:00:00.000Z'),
      completedModule(a2, m, due), // exactly on time
      completedModule(a3, m, '2026-10-16T10:00:00.000Z'), // late
      completedModule(b1, m, '2026-10-19T10:00:00.000Z'),
    ];
    const r = competitionMetric(
      'teamShowdown',
      metricInput({ competition: c, people, teams: [teamA, teamB, teamC], assignments, events, modules: [m] }),
    );
    expect(r.unit).toBe('team');
    expect(r.values.get(teamA.id)).toBe(66); // 2 of 3, rounded down
    expect(r.values.get(teamB.id)).toBe(50); // 1 of 2: different sizes compare fairly
  });

  it('does not rank a team with nothing due in the window and lists it as unranked', () => {
    const assignments = [
      dueAssignment(c1, m, '2026-11-05T12:00:00.000Z'), // after the window
      dueAssignment(a1, m, due),
    ];
    const r = competitionMetric(
      'teamShowdown',
      metricInput({
        competition: c,
        people,
        teams: [teamA, teamB, teamC],
        assignments,
        events: [completedModule(a1, m, due)],
        modules: [m],
      }),
    );
    expect(r.values.has(teamC.id)).toBe(false);
    expect(r.values.has(teamB.id)).toBe(false);
    expect(r.unranked?.has(teamC.id)).toBe(true);
    expect(r.values.get(teamA.id)).toBe(100);
  });

  it('counts an assignment due exactly at startAt and not one due exactly at endAt', () => {
    const assignments = [dueAssignment(a1, m, START), dueAssignment(a2, m, END)];
    const r = competitionMetric(
      'teamShowdown',
      metricInput({
        competition: c,
        people,
        teams: [teamA],
        assignments,
        events: [completedModule(a1, m, START)],
        modules: [m],
      }),
    );
    // only a1's assignment is in the window (a2's is due at endAt)
    expect(r.values.get(teamA.id)).toBe(100);
  });

  it('compares whole sites when teamUnit is site', () => {
    const site2 = nextId();
    const s1 = staff('Sia', 'One');
    const s2 = staff('Sid', 'One');
    const t1 = staff('Tia', 'Two', { primarySiteId: site2 });
    const assignments = [dueAssignment(s1, m, due), dueAssignment(s2, m, due), dueAssignment(t1, m, due)];
    const events = [
      completedModule(s1, m, '2026-10-10T10:00:00.000Z'),
      completedModule(t1, m, '2026-10-10T10:00:00.000Z'),
    ];
    const r = competitionMetric(
      'teamShowdown',
      metricInput({
        competition: competition({ templateId: 'teamShowdown', teamUnit: 'site' }),
        people: [s1, s2, t1],
        assignments,
        events,
        modules: [m],
      }),
    );
    expect(r.unit).toBe('site');
    expect(r.values.get(s1.primarySiteId)).toBe(50);
    expect(r.values.get(site2)).toBe(100);
  });
});

describe('beatTheExpiry: refresher completed in the window before the previous one expired', () => {
  const r12 = requirement('Safeguarding', { renewEveryMonths: 12 });
  const noRenewal = requirement('Induction');
  const ev = (p: typeof ada, completedAt: string, expiresAt?: string, over = {}) =>
    moduleEvidence(r12.id, completedAt, expiresAt, { personId: p.id, ...over });

  it('qualifies only people whose previous evidence was still valid when they renewed', () => {
    const evidence = [
      ev(ada, '2025-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z'),
      ev(ada, '2026-10-10T10:00:00.000Z', '2027-10-10T10:00:00.000Z'), // early: qualifies
      ev(bea, '2025-08-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z'),
      ev(bea, '2026-10-10T10:00:00.000Z', '2027-10-10T10:00:00.000Z'), // already expired: no
      ev(dee, '2026-10-10T10:00:00.000Z', '2027-10-10T10:00:00.000Z'), // nothing before it: no
    ];
    const r = competitionMetric(
      'beatTheExpiry',
      metricInput({
        competition: competition({ templateId: 'beatTheExpiry', winnerSelection: 'draw' }),
        people: everyone,
        evidence,
        requirements: [r12],
      }),
    );
    expect(r.qualifies).toEqual(new Set([ada.id]));
  });

  it('counts approved external evidence by its completed date, not its approval date', () => {
    const evidence = [
      ev(cat, '2025-10-25T10:00:00.000Z', '2026-10-25T10:00:00.000Z'),
      ev(cat, '2026-10-12T10:00:00.000Z', '2027-10-12T10:00:00.000Z', {
        kind: 'external',
        approvedAt: '2026-11-05T10:00:00.000Z', // approved after the window: still counted by completedAt
        approvedBy: nextId(),
      }),
    ];
    const r = competitionMetric(
      'beatTheExpiry',
      metricInput({
        competition: competition({ templateId: 'beatTheExpiry', winnerSelection: 'draw' }),
        people: everyone,
        evidence,
        requirements: [r12],
      }),
    );
    expect(r.qualifies?.has(cat.id)).toBe(true);
  });

  it('respects window edges, requires a renewal period, and skips people on leave', () => {
    const noRen = (p: typeof ada, completedAt: string, expiresAt: string) =>
      moduleEvidence(noRenewal.id, completedAt, expiresAt, { personId: p.id });
    const evidence = [
      ev(eve, '2025-11-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z'),
      ev(eve, END, '2027-11-01T00:00:00.000Z'), // at endAt: outside
      noRen(ada, '2025-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z'),
      noRen(ada, '2026-10-10T10:00:00.000Z', '2027-10-10T10:00:00.000Z'), // no renewal period on the requirement
      ev(fay, '2025-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z'),
      ev(fay, '2026-10-10T10:00:00.000Z', '2027-10-10T10:00:00.000Z'), // on leave
    ];
    const r = competitionMetric(
      'beatTheExpiry',
      metricInput({
        competition: competition({ templateId: 'beatTheExpiry', winnerSelection: 'draw' }),
        people: everyone,
        evidence,
        requirements: [r12, noRenewal],
      }),
    );
    expect(r.qualifies).toEqual(new Set());
  });
});

describe('completeAndWin: every chosen module completed in the window', () => {
  const m1 = bank(['q1']);
  const m2 = bank(['q1']);
  const c = competition({ templateId: 'completeAndWin', winnerSelection: 'draw', moduleIds: [m1.id, m2.id] });

  it('qualifies people who completed all chosen modules inside the window', () => {
    const events = [
      completedModule(ada, m1, IN),
      completedModule(ada, m2, '2026-10-20T10:00:00.000Z'),
      completedModule(bea, m1, IN), // only one
      completedModule(cat, m1, IN),
      completedModule(cat, m2, END), // at endAt: outside
      completedModule(dee, m1, BEFORE), // before the window
      completedModule(dee, m2, IN),
      completedModule(fay, m1, IN),
      completedModule(fay, m2, IN), // on leave
      completedModule(eve, m1, START), // at startAt: inside
      completedModule(eve, m2, IN),
    ];
    const r = competitionMetric(
      'completeAndWin',
      metricInput({ competition: c, people: everyone, events, modules: [m1, m2] }),
    );
    expect(r.qualifies).toEqual(new Set([ada.id, eve.id]));
  });

  it('ignores completions of modules that are not in the list', () => {
    const other = bank(['q1']);
    const events = [completedModule(ada, m1, IN), completedModule(ada, other, IN)];
    const r = competitionMetric(
      'completeAndWin',
      metricInput({ competition: c, people: everyone, events, modules: [m1, m2, other] }),
    );
    expect(r.qualifies?.has(ada.id)).toBe(false);
  });
});

describe('scenarioSavvy: unique scenario questions answered with the best outcome', () => {
  const m = bank(['s1', 's2', 's3', 'q1']);
  const best = (p: typeof ada, q: string, at: string) => correct(p, m, q, at, { scenarioOutcome: 'best' });

  it('counts best outcomes on scenario questions once each, not poor outcomes or non-scenarios', () => {
    const events = [
      best(ada, 's1', IN),
      best(ada, 's1', '2026-10-12T10:00:00.000Z'), // repeat
      best(ada, 's2', IN),
      correct(ada, m, 's3', IN, { correct: false, scenarioOutcome: 'poor' }),
      correct(ada, m, 'q1', IN), // not a scenario
      best(bea, 's1', END), // outside the window
      best(cat, 's1', START), // inside
    ];
    const r = competitionMetric(
      'scenarioSavvy',
      metricInput({
        competition: competition({ templateId: 'scenarioSavvy' }),
        people: everyone,
        events,
        modules: [m],
      }),
    );
    expect(val(r, ada.id)).toBe(2);
    expect(val(r, bea.id)).toBe(0);
    expect(val(r, cat.id)).toBe(1);
  });

  it('restricts to moduleIds when set', () => {
    const other = bank(['s1']);
    const events = [best(ada, 's1', IN), correct(ada, other, 's1', IN, { scenarioOutcome: 'best' })];
    const r = competitionMetric(
      'scenarioSavvy',
      metricInput({
        competition: competition({ templateId: 'scenarioSavvy', moduleIds: [other.id] }),
        people: everyone,
        events,
        modules: [m, other],
      }),
    );
    expect(val(r, ada.id)).toBe(1);
  });
});

describe('closed-book only (BP-4): the stored attempt mode decides, not the event flag', () => {
  const m = bank(['q1', 'q2', 'q3']);
  const closedA = attemptOf(ada, m, 'closed');
  const openA = attemptOf(ada, m, 'open');
  const abandoned = attemptOf(ada, m, 'closed', { abandoned: true, finishedAt: undefined });
  const inAttempt = (a: typeof closedA, q: string, over = {}) => correct(ada, m, q, IN, { attemptId: a.id, ...over });

  it('closedBookChallenge counts only answers from closed attempts', () => {
    const events = [
      inAttempt(closedA, 'q1', { attemptMode: 'closed' }),
      inAttempt(openA, 'q2', { attemptMode: 'open' }),
    ];
    const r = competitionMetric(
      'closedBookChallenge',
      metricInput({
        competition: competition({ templateId: 'closedBookChallenge', closedBookOnly: true }),
        people: everyone,
        events,
        attempts: [closedA, openA],
        modules: [m],
      }),
    );
    expect(r.unit).toBe('person');
    expect(val(r, ada.id)).toBe(1);
  });

  it('does not trust an event that claims closed when its attempt was open', () => {
    const events = [
      inAttempt(openA, 'q1', { attemptMode: 'closed' }),
      correct(ada, m, 'q2', IN, { attemptMode: 'closed' }),
    ];
    const r = competitionMetric(
      'closedBookChallenge',
      metricInput({
        competition: competition({ templateId: 'closedBookChallenge', closedBookOnly: true }),
        people: everyone,
        events,
        attempts: [openA],
        modules: [m],
      }),
    );
    expect(val(r, ada.id)).toBe(0);
  });

  it('forces closed-book on for the closed-book challenge even if the flag is missing', () => {
    const events = [inAttempt(openA, 'q1')];
    const r = competitionMetric(
      'closedBookChallenge',
      metricInput({
        competition: competition({ templateId: 'closedBookChallenge', closedBookOnly: false }),
        people: everyone,
        events,
        attempts: [openA],
        modules: [m],
      }),
    );
    expect(val(r, ada.id)).toBe(0);
  });

  it.each(['knowledgeBuilder', 'masteryMonth', 'scenarioSavvy'] as const)(
    '%s with closedBookOnly counts only closed attempts, and counts both modes without it',
    (templateId) => {
      const sm = bank(['s1']);
      const cA = attemptOf(ada, sm, 'closed');
      const oA = attemptOf(ada, sm, 'open');
      const mk = (a: typeof cA, over = {}) =>
        correct(ada, sm, 's1', IN, { attemptId: a.id, scenarioOutcome: 'best', ...over });
      const closedOnly = competitionMetric(
        templateId,
        metricInput({
          competition: competition({ templateId, closedBookOnly: true }),
          people: everyone,
          events: [mk(oA)],
          attempts: [oA],
          modules: [sm],
        }),
      );
      expect(val(closedOnly, ada.id)).toBe(0);
      const closedOk = competitionMetric(
        templateId,
        metricInput({
          competition: competition({ templateId, closedBookOnly: true }),
          people: everyone,
          events: [mk(cA)],
          attempts: [cA],
          modules: [sm],
        }),
      );
      expect(val(closedOk, ada.id)).toBe(1);
      const open = competitionMetric(
        templateId,
        metricInput({
          competition: competition({ templateId, closedBookOnly: false }),
          people: everyone,
          events: [mk(oA)],
          attempts: [oA],
          modules: [sm],
        }),
      );
      expect(val(open, ada.id)).toBe(1);
    },
  );

  it('ignores answers from abandoned attempts in closed and open competitions', () => {
    const events = [inAttempt(abandoned, 'q1')];
    const closed = competitionMetric(
      'closedBookChallenge',
      metricInput({
        competition: competition({ templateId: 'closedBookChallenge', closedBookOnly: true }),
        people: everyone,
        events,
        attempts: [abandoned],
        modules: [m],
      }),
    );
    expect(val(closed, ada.id)).toBe(0);
    const abandonedOpen = attemptOf(ada, m, 'open', { abandoned: true, finishedAt: undefined });
    const open = competitionMetric(
      'knowledgeBuilder',
      metricInput({
        people: everyone,
        events: [inAttempt(abandonedOpen, 'q1')],
        attempts: [abandonedOpen],
        modules: [m],
      }),
    );
    expect(val(open, ada.id)).toBe(0);
  });
});

describe('metric inputs never carry speed or XP', () => {
  it('gives the same answer however long the events took (only correctness and window matter)', () => {
    const m = bank(['q1', 'q2']);
    const fast = [correct(ada, m, 'q1', '2026-10-10T10:00:00.000Z'), correct(ada, m, 'q2', '2026-10-10T10:00:01.000Z')];
    const slow = [correct(ada, m, 'q1', '2026-10-02T10:00:00.000Z'), correct(ada, m, 'q2', '2026-10-30T10:00:00.000Z')];
    const run = (events: typeof fast) =>
      val(competitionMetric('knowledgeBuilder', metricInput({ people: everyone, events, modules: [m] })), ada.id);
    expect(run(fast)).toBe(run(slow));
  });
});

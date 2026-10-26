// BP-2: the six standing boards with All time, This month and This quarter (plan M2 assumptions 8, 10).
// "Now" is Monday 26 October 2026, London. This month is 1 to 31 October London time, This quarter is October to December.
import { describe, expect, it } from 'vitest';
import { BOARD_IDS } from './schemas/engagement';
import { defaultBoardSettings, standingBoard } from './standingBoards';
import {
  bank,
  boardInput,
  completedModule,
  correct,
  dueAssignment,
  event,
  lessonDone,
  nextId,
  staff,
} from './competitions/testFixtures';
import { moduleEvidence } from './engagement/testFixtures';
import { requirement, team } from './progress/testFixtures';

const ada = staff('Ada', 'Adams');
const bea = staff('Bea', 'Brown');
const cat = staff('Cat', 'Clarke');
const grace = staff('Grace', 'Green', { status: 'onLeave' });
const people = [ada, bea, cat, grace];
const val = (r: { values: Map<string, number> }, id: string) => r.values.get(id) ?? 0;

const SEPT = '2026-09-15T10:00:00.000Z';
const OCT = '2026-10-12T10:00:00.000Z';
// 00:00 on 1 October in London is 23:00 UTC on 30 September (BST).
const MONTH_START = '2026-09-30T23:00:00.000Z';
const JUST_BEFORE_MONTH = '2026-09-30T22:59:59.999Z';

describe('every board', () => {
  it.each(['correctQuestions', 'modulesCompleted', 'modulesMastered', 'activeWeeks', 'refresherChampions'] as const)(
    '%s has an entry for each active person (zero included) and none for people on leave',
    (board) => {
      const r = standingBoard(board, 'allTime', boardInput({ people }));
      expect(r.unit).toBe('person');
      expect([...r.values.keys()].sort()).toEqual([ada.id, bea.id, cat.id].sort());
      expect(r.values.has(grace.id)).toBe(false);
    },
  );

  it('ignores invited and archived people', () => {
    const inv = staff('In', 'Vited', { status: 'invited' });
    const arc = staff('Ar', 'Chived', { status: 'archived' });
    const r = standingBoard('correctQuestions', 'allTime', boardInput({ people: [ada, inv, arc] }));
    expect([...r.values.keys()]).toEqual([ada.id]);
  });
});

describe('correctQuestions: unique questions answered correctly', () => {
  const m = bank(['q1', 'q2', 'q3']);
  const m2 = bank(['q1']);
  const events = [
    correct(ada, m, 'q1', SEPT),
    correct(ada, m, 'q1', OCT), // repeat
    correct(ada, m, 'q2', OCT),
    correct(ada, m2, 'q1', OCT), // same key, other module
    correct(bea, m, 'q3', SEPT),
    correct(bea, m, 'q3', '2026-10-13T10:00:00.000Z', { correct: false }),
  ];

  it('counts each question once for all time', () => {
    const r = standingBoard('correctQuestions', 'allTime', boardInput({ people, events, modules: [m, m2] }));
    expect(val(r, ada.id)).toBe(3);
    expect(val(r, bea.id)).toBe(1);
    expect(val(r, cat.id)).toBe(0);
  });

  it('counts only the London calendar month for This month, with first-in-month credit', () => {
    const r = standingBoard('correctQuestions', 'thisMonth', boardInput({ people, events, modules: [m, m2] }));
    expect(val(r, ada.id)).toBe(3); // q1 answered again in October counts for the month
    expect(val(r, bea.id)).toBe(0);
  });

  it('puts midnight at the start of October in London (BST) inside the month and a millisecond earlier outside', () => {
    const e = [correct(ada, m, 'q1', MONTH_START), correct(bea, m, 'q1', JUST_BEFORE_MONTH)];
    const r = standingBoard('correctQuestions', 'thisMonth', boardInput({ people, events: e, modules: [m] }));
    expect(val(r, ada.id)).toBe(1);
    expect(val(r, bea.id)).toBe(0);
  });

  it('ends the month at midnight London time on 1 November (GMT)', () => {
    const e = [correct(ada, m, 'q1', '2026-10-31T23:59:59.999Z'), correct(bea, m, 'q1', '2026-11-01T00:00:00.000Z')];
    const r = standingBoard(
      'correctQuestions',
      'thisMonth',
      boardInput({ people, events: e, modules: [m], now: new Date('2026-10-31T23:59:59.999Z') }),
    );
    expect(val(r, ada.id)).toBe(1);
    expect(val(r, bea.id)).toBe(0);
  });

  it('takes no XP and is unaffected by how quickly answers came', () => {
    const r = standingBoard(
      'correctQuestions',
      'allTime',
      boardInput({ people, events: [correct(ada, m, 'q1', OCT)], modules: [m] }),
    );
    expect(val(r, ada.id)).toBe(1);
  });
});

describe('modulesCompleted: published modules, once each', () => {
  const pub = bank(['q1']);
  const pub2 = bank(['q1']);
  const draft = bank(['q1'], { status: 'draft' });
  const archived = bank(['q1'], { status: 'archived' });

  it('counts a module once however many times or versions it was passed', () => {
    const events = [
      completedModule(ada, pub, SEPT),
      completedModule(ada, pub, OCT),
      event({ type: 'moduleCompleted', personId: ada.id, moduleId: pub.id, moduleVersion: 2, at: OCT }),
      completedModule(ada, pub2, OCT),
    ];
    const r = standingBoard('modulesCompleted', 'allTime', boardInput({ people, events, modules: [pub, pub2] }));
    expect(val(r, ada.id)).toBe(2);
  });

  it('counts published modules only', () => {
    const events = [
      completedModule(bea, draft, OCT),
      completedModule(bea, archived, OCT),
      completedModule(bea, pub, OCT),
    ];
    const r = standingBoard(
      'modulesCompleted',
      'allTime',
      boardInput({ people, events, modules: [pub, draft, archived] }),
    );
    expect(val(r, bea.id)).toBe(1);
  });

  it('for This month, counts modules completed in the month and not those completed only earlier', () => {
    const events = [completedModule(ada, pub, SEPT), completedModule(ada, pub2, OCT)];
    const r = standingBoard('modulesCompleted', 'thisMonth', boardInput({ people, events, modules: [pub, pub2] }));
    expect(val(r, ada.id)).toBe(1);
  });
});

describe('modulesMastered: every question in the bank answered correctly at least once', () => {
  const m = bank(['q1', 'q2']);
  it('needs the whole bank, across any attempts', () => {
    const events = [correct(ada, m, 'q1', SEPT), correct(ada, m, 'q2', OCT), correct(bea, m, 'q1', OCT)];
    const r = standingBoard('modulesMastered', 'allTime', boardInput({ people, events, modules: [m] }));
    expect(val(r, ada.id)).toBe(1);
    expect(val(r, bea.id)).toBe(0);
  });
  it('for This month needs the answers in the month', () => {
    const events = [
      correct(ada, m, 'q1', SEPT),
      correct(ada, m, 'q2', OCT),
      correct(bea, m, 'q1', OCT),
      correct(bea, m, 'q2', OCT),
    ];
    const r = standingBoard('modulesMastered', 'thisMonth', boardInput({ people, events, modules: [m] }));
    expect(val(r, ada.id)).toBe(0);
    expect(val(r, bea.id)).toBe(1);
  });
});

describe('activeWeeks: total weeks with learning, not a streak', () => {
  const events = [
    lessonDone(ada, '2026-08-05T10:00:00.000Z'),
    lessonDone(ada, '2026-08-06T10:00:00.000Z'), // same week
    lessonDone(ada, '2026-09-23T10:00:00.000Z'), // a gap, then more
    event({ type: 'attemptFinished', personId: ada.id, at: OCT }),
    event({ type: 'lessonViewed', personId: bea.id, at: OCT }), // viewing is not activity
  ];
  it('counts distinct London weeks for all time, gaps allowed', () => {
    const r = standingBoard('activeWeeks', 'allTime', boardInput({ people, events }));
    expect(val(r, ada.id)).toBe(3);
    expect(val(r, bea.id)).toBe(0);
  });
  it('counts only weeks of activity in the month for This month', () => {
    const r = standingBoard('activeWeeks', 'thisMonth', boardInput({ people, events }));
    expect(val(r, ada.id)).toBe(1);
  });
});

describe('refresherChampions: refreshers completed before the previous one expired', () => {
  const r12 = requirement('Safeguarding', { renewEveryMonths: 12 });
  const ev = (p: typeof ada, completedAt: string, expiresAt: string, over = {}) =>
    moduleEvidence(r12.id, completedAt, expiresAt, { personId: p.id, ...over });
  const evidence = [
    ev(ada, '2025-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z'),
    ev(ada, OCT, '2027-10-12T10:00:00.000Z'), // early: counts
    ev(bea, '2024-01-10T10:00:00.000Z', '2025-01-10T10:00:00.000Z'),
    ev(bea, OCT, '2027-10-12T10:00:00.000Z'), // late: does not count
    ev(cat, '2025-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z'),
    ev(cat, '2026-02-01T10:00:00.000Z', '2027-02-01T10:00:00.000Z', {
      kind: 'external',
      approvedAt: '2026-02-03T10:00:00.000Z',
      approvedBy: nextId(),
    }), // early, external, earlier this year
  ];
  it('counts early module and external refreshers for all time', () => {
    const r = standingBoard('refresherChampions', 'allTime', boardInput({ people, evidence, requirements: [r12] }));
    expect(val(r, ada.id)).toBe(1);
    expect(val(r, bea.id)).toBe(0);
    expect(val(r, cat.id)).toBe(1);
  });
  it('for This month counts only refreshers completed in the month', () => {
    const r = standingBoard('refresherChampions', 'thisMonth', boardInput({ people, evidence, requirements: [r12] }));
    expect(val(r, ada.id)).toBe(1);
    expect(val(r, cat.id)).toBe(0);
  });
});

describe('teamBoard: percentage of assigned training completed by its due date, at team level', () => {
  const m = bank(['q1']);
  const baby = team(nextId(), 'Baby room');
  const toddler = team(nextId(), 'Toddler room');
  const preschool = team(nextId(), 'Pre-school');
  const b1 = staff('Bo', 'One', { teamIds: [baby.id] });
  const b2 = staff('Bi', 'Two', { teamIds: [baby.id] });
  const b3 = staff('Ba', 'Three', { teamIds: [baby.id] });
  const t1 = staff('Ty', 'One', { teamIds: [toddler.id] });
  const t2 = staff('Tu', 'Two', { teamIds: [toddler.id] });
  const p1 = staff('Pe', 'One', { teamIds: [preschool.id] });
  const all = [b1, b2, b3, t1, t2, p1];
  const dueOct = '2026-10-14T12:00:00.000Z';
  const assignments = [
    dueAssignment(b1, m, dueOct),
    dueAssignment(b2, m, dueOct),
    dueAssignment(b3, m, dueOct),
    dueAssignment(t1, m, dueOct),
    dueAssignment(t2, m, dueOct),
    dueAssignment(p1, m, '2026-08-14T12:00:00.000Z'), // due in August: in no month or quarter window... in the quarter? no, Q3
  ];
  const events = [
    completedModule(b1, m, '2026-10-10T10:00:00.000Z'),
    completedModule(b2, m, '2026-10-14T12:00:00.000Z'), // exactly on the due instant
    completedModule(b3, m, '2026-10-15T10:00:00.000Z'), // late
    completedModule(t1, m, '2026-10-01T10:00:00.000Z'),
    completedModule(t2, m, '2026-10-02T10:00:00.000Z'),
  ];
  const run = (period: 'thisMonth' | 'thisQuarter') =>
    standingBoard(
      'teamBoard',
      period,
      boardInput({ people: all, teams: [baby, toddler, preschool], assignments, events, modules: [m] }),
    );

  it('is a team-level board whose keys are team ids only', () => {
    const r = run('thisMonth');
    expect(r.unit).toBe('team');
    expect([...r.values.keys()].sort()).toEqual([baby.id, toddler.id].sort());
    for (const p of all) expect(r.values.has(p.id)).toBe(false);
  });

  it('gives percentages rounded down of assignments due in the period done by the due date', () => {
    const r = run('thisMonth');
    expect(r.values.get(baby.id)).toBe(66);
    expect(r.values.get(toddler.id)).toBe(100);
  });

  it('lists a team with nothing due as unranked ("No training due")', () => {
    const r = run('thisMonth');
    expect(r.unranked?.has(preschool.id)).toBe(true);
    expect(r.values.has(preschool.id)).toBe(false);
  });

  it('uses the calendar quarter for This quarter, so an August due date is outside it but a September one is not', () => {
    const q = standingBoard(
      'teamBoard',
      'thisQuarter',
      boardInput({
        people: all,
        teams: [baby, toddler, preschool],
        assignments: [...assignments, dueAssignment(p1, m, '2026-10-02T12:00:00.000Z')],
        events,
        modules: [m],
        now: new Date('2026-11-15T09:00:00.000Z'),
      }),
    );
    expect(q.values.get(preschool.id)).toBe(0); // due 2 Oct, never done
    expect(q.values.get(baby.id)).toBe(66);
  });

  it('ignores people on leave', () => {
    const away = staff('Aw', 'Ay', { teamIds: [toddler.id], status: 'onLeave' });
    const r = standingBoard(
      'teamBoard',
      'thisMonth',
      boardInput({
        people: [...all, away],
        teams: [baby, toddler, preschool],
        assignments: [...assignments, dueAssignment(away, m, dueOct)],
        events,
        modules: [m],
      }),
    );
    expect(r.values.get(toddler.id)).toBe(100);
  });
});

describe('defaultBoardSettings', () => {
  it('switches every board on for the client, with staff seeing their own site', () => {
    const d = defaultBoardSettings('01J00000000000000000000001');
    expect(d.clientId).toBe('01J00000000000000000000001');
    for (const id of BOARD_IDS) expect(d.boards[id]).toEqual({ enabled: true, staffScopes: ['site'] });
    expect(d.siteBoard.enabled).toBe(false);
  });
});

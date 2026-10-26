// BP-5 (pure part): planning an assignment, and due dates. Plan Assumption 14.
//
// API under test (assign.ts):
//   planAssignment({ moduleId, personIds, people, existing, dueAt, now }) => {
//     toCreate: string[];                                            // person ids, in the order given
//     skipped: { personId: string; reason: 'alreadyAssigned' }[];     // open assignment for the same module
//     invalid: { personId: string; reason: 'archived' | 'unknown' }[]; // `people` is the set of known people
//   }
//   `existing` may hold any assignments; only open ones for the same module block. `people` is extra to the plan's
//   wording: it is how "unknown" and "archived" can be told apart. Duplicate ids in personIds count once.
//   dueAtFromLondonDate('YYYY-MM-DD') => ISO UTC string for 23:59:00.000 on that London day; throws on a bad date string.
import { describe, expect, it } from 'vitest';
import { dueAtFromLondonDate, isDueInPast, planAssignment } from './assign';
import { NOW, assignment, nextId, person } from './progress/testFixtures';

const MOD = nextId();
const jade = person('Jade', 'Mills');
const sam = person('Sam', 'Okafor');
const olivia = person('Olivia', 'Grant', { status: 'archived' });
const grace = person('Grace', 'Lee', { status: 'onLeave' });
const dueAt = dueAtFromLondonDate('2026-11-02');
const plan = (personIds: string[], existing = [assignment(jade, MOD, 10)]) =>
  planAssignment({ moduleId: MOD, personIds, people: [jade, sam, olivia, grace], existing, dueAt, now: NOW });

describe('planAssignment', () => {
  it('creates for people without an open assignment, in the order given', () => {
    expect(plan([sam.id, grace.id]).toCreate).toEqual([sam.id, grace.id]);
  });

  it('skips and reports someone who already has an open assignment for the module', () => {
    const r = plan([jade.id, sam.id]);
    expect(r.toCreate).toEqual([sam.id]);
    expect(r.skipped).toEqual([{ personId: jade.id, reason: 'alreadyAssigned' }]);
  });

  it('does not let a done or cancelled assignment block a new one', () => {
    expect(
      plan(
        [jade.id],
        [assignment(jade, MOD, 10, { status: 'done' }), assignment(jade, MOD, 10, { status: 'cancelled' })],
      ).toCreate,
    ).toEqual([jade.id]);
  });

  it('does not let an open assignment for a different module block', () => {
    expect(plan([jade.id], [assignment(jade, nextId(), 10)]).toCreate).toEqual([jade.id]);
  });

  it('reports archived and unknown people as invalid and does not create for them', () => {
    const stranger = nextId();
    const r = plan([olivia.id, stranger, sam.id]);
    expect(r.invalid).toEqual([
      { personId: olivia.id, reason: 'archived' },
      { personId: stranger, reason: 'unknown' },
    ]);
    expect(r.toCreate).toEqual([sam.id]);
  });

  it('counts a repeated person once', () => {
    expect(plan([sam.id, sam.id]).toCreate).toEqual([sam.id]);
  });

  it('returns empty lists for no people', () => {
    expect(plan([])).toEqual({ toCreate: [], skipped: [], invalid: [] });
  });
});

describe('dueAtFromLondonDate', () => {
  it.each([
    ['2026-11-02', '2026-11-02T23:59:00.000Z'], // GMT: same as UTC
    ['2026-12-25', '2026-12-25T23:59:00.000Z'],
    ['2026-07-01', '2026-07-01T22:59:00.000Z'], // BST: one hour behind
    ['2026-10-19', '2026-10-19T22:59:00.000Z'], // BST (today in the fixtures)
    ['2026-10-24', '2026-10-24T22:59:00.000Z'], // last full BST day
    ['2026-10-25', '2026-10-25T23:59:00.000Z'], // clocks go back at 02:00; evening is GMT
    ['2026-03-28', '2026-03-28T23:59:00.000Z'], // day before clocks go forward, GMT
    ['2026-03-29', '2026-03-29T22:59:00.000Z'], // clocks go forward at 01:00; evening is BST
  ])('maps %s to %s', (day, iso) => {
    expect(dueAtFromLondonDate(day)).toBe(iso);
  });

  it.each(['2026-13-01', '2026-02-30', '02/11/2026', '', '2026-11-02T10:00:00Z'])('rejects %j', (bad) => {
    expect(() => dueAtFromLondonDate(bad)).toThrow();
  });
});

describe('isDueInPast', () => {
  const now = new Date('2026-10-19T09:00:00.000Z');
  it('accepts the end of today and later days', () => {
    expect(isDueInPast(dueAtFromLondonDate('2026-10-19'), now)).toBe(false);
    expect(isDueInPast(dueAtFromLondonDate('2026-11-02'), now)).toBe(false);
  });
  it('rejects an earlier day', () => {
    expect(isDueInPast(dueAtFromLondonDate('2026-10-18'), now)).toBe(true);
  });
});

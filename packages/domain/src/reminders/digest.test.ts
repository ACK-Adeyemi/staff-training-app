// reminderDigest and planManualSend (M3 chunk 10b): the digest preview and the manager's "Remind" button.
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { londonWeekKey } from '../engagement/weeks';
import { planManualSend, reminderDigest } from './plan';
import {
  CLIENT,
  assignment,
  evidenceExpiring,
  nextId,
  requirement,
  siteNamed,
  staffAt,
  submissionWaiting,
} from '../sites/testFixtures';

const policy = {
  dueOffsetsDays: [7, 1],
  expiringOffsetsDays: [60, 30, 7],
  weeklyCapPerPerson: 2,
  quietHours: { from: '21:00', to: '07:00' },
};
const s = siteNamed('Riverside');
const sg = requirement('Safeguarding', { renewEveryMonths: 24 });
const moduleId = nextId();
// Monday 19 October 2026, 10:00 London (BST): outside quiet hours.
const T = new Date('2026-10-19T09:00:00.000Z');
const base = { now: T, policy, accountState: 'active' as const, sites: [s], requirements: [sg], log: [] };
const late = (p: ReturnType<typeof staffAt>) => assignment(p, moduleId, -3, { dueAt: addDays(T, -3).toISOString() });

describe('reminderDigest', () => {
  it('lists each person once for overdue and for Evidence expiring within the widest offset', () => {
    const ann = staffAt(s, 'Ann', 'Adams');
    const bob = staffAt(s, 'Bob', 'Brown');
    const cy = staffAt(s, 'Cy', 'Clarke');
    const digest = reminderDigest({
      ...base,
      people: [ann, bob, cy],
      assignments: [late(ann), late(ann)],
      evidence: [evidenceExpiring(bob, sg, 45, { expiresAt: addDays(T, 45).toISOString() })],
      submissions: [],
    });
    expect(digest.overdue).toEqual([{ personId: ann.id }]);
    expect(digest.expiring).toEqual([{ personId: bob.id }]);
  });

  it('leaves out Evidence expiring beyond the widest offset, done assignments and archived people', () => {
    const ann = staffAt(s, 'Ann', 'Adams');
    const gone = staffAt(s, 'Gone', 'Away', { status: 'archived' });
    const digest = reminderDigest({
      ...base,
      people: [ann, gone],
      assignments: [{ ...late(ann), status: 'done' as const }, late(gone)],
      evidence: [evidenceExpiring(ann, sg, 200, { expiresAt: addDays(T, 200).toISOString() })],
      submissions: [],
    });
    expect(digest).toEqual({ overdue: [], expiring: [] });
  });
});

describe('planManualSend', () => {
  const input = (people: ReturnType<typeof staffAt>[], over = {}) => ({
    ...base,
    people,
    assignments: people.map(late),
    evidence: [],
    submissions: [],
    ...over,
  });

  it('sends one overdue reminder per person and counts the days overdue', () => {
    const ann = staffAt(s, 'Ann', 'Adams');
    const r = planManualSend(input([ann]), [ann.id, ann.id]);
    expect(r.skipped).toEqual([]);
    expect(r.send).toHaveLength(1);
    expect(r.send[0]).toMatchObject({ personId: ann.id, kind: 'overdue', offset: 3 });
  });

  it('falls back to an expiring reminder when nothing is overdue', () => {
    const ann = staffAt(s, 'Ann', 'Adams');
    const r = planManualSend(
      input([ann], {
        assignments: [],
        evidence: [evidenceExpiring(ann, sg, 30, { expiresAt: addDays(T, 30).toISOString() })],
      }),
      [ann.id],
    );
    expect(r.send).toEqual([{ personId: ann.id, kind: 'expiring', targetId: sg.id, offset: 30 }]);
  });

  it('reminds about a requirement that has already run out, as Chase all overdue lists it', () => {
    const ann = staffAt(s, 'Ann', 'Adams');
    const r = planManualSend(
      input([ann], {
        assignments: [],
        evidence: [evidenceExpiring(ann, sg, -10, { expiresAt: addDays(T, -10).toISOString() })],
      }),
      [ann.id],
    );
    expect(r.skipped).toEqual([]);
    expect(r.send).toHaveLength(1);
    expect(r.send[0]).toMatchObject({ personId: ann.id, kind: 'overdue', targetId: sg.id });
  });

  it('skips with the reason: leave, pause, nothing to chase, unknown person and the weekly cap', () => {
    const leave = staffAt(s, 'Lea', 'Leave', { status: 'onLeave' });
    const paused = staffAt(s, 'Pat', 'Paused', { pausedUntil: addDays(T, 5).toISOString() });
    const none = staffAt(s, 'Nan', 'None');
    const capped = staffAt(s, 'Cap', 'Ped');
    const week = londonWeekKey(T);
    const log = [1, 2].map((i) => ({
      key: `${capped.id}:dueSoon:x:${String(i)}`,
      clientId: CLIENT,
      personId: capped.id,
      kind: 'dueSoon',
      sentAt: T.toISOString(),
      weekKey: week,
    }));
    const people = [leave, paused, none, capped];
    const r = planManualSend({ ...input(people, { log }), assignments: [late(leave), late(paused), late(capped)] }, [
      ...people.map((p) => p.id),
      'unknown',
    ]);
    expect(r.send).toEqual([]);
    expect(r.skipped).toEqual([
      { personId: leave.id, reason: 'onLeave' },
      { personId: paused.id, reason: 'paused' },
      { personId: none.id, reason: 'nothingToChase' },
      { personId: capped.id, reason: 'cap' },
      { personId: 'unknown', reason: 'nothingToChase' },
    ]);
  });

  it('skips in quiet hours and when the only thing to chase is waiting for a check', () => {
    const ann = staffAt(s, 'Ann', 'Adams');
    const night = new Date('2026-10-19T21:30:00.000Z');
    const quiet = planManualSend(
      { ...input([ann]), now: night, assignments: [{ ...late(ann), dueAt: addDays(night, -3).toISOString() }] },
      [ann.id],
    );
    expect(quiet.skipped).toEqual([{ personId: ann.id, reason: 'quietHours' }]);

    const waiting = planManualSend(
      input([ann], {
        assignments: [],
        evidence: [evidenceExpiring(ann, sg, 30, { expiresAt: addDays(T, 30).toISOString() })],
        submissions: [submissionWaiting(ann, sg)],
      }),
      [ann.id],
    );
    expect(waiting.skipped).toEqual([{ personId: ann.id, reason: 'awaitingCheck' }]);
  });
});

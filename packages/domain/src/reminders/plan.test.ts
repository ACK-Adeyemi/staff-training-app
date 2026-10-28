// BP-6, F-7: reminder planning (plan M3 assumptions 28 and 29; brief 21.1).
//
// API under test (reminders/plan.ts), all pure:
//   type PlanInput = {
//     now: Date; policy: ReminderPolicy (ClientSettings.reminderPolicy); accountState: AccountState;
//     people: Person[]; sites: Site[]; assignments: Assignment[]; requirements: Requirement[];
//     evidence: Evidence[]; submissions: EvidenceSubmission[]; log: ReminderLog[];
//   }
//   planReminders(input) => { send: Reminder[]; deferred: Skip[]; skipped: Skip[] }
//     Reminder = { personId; kind: 'dueSoon' | 'overdue' | 'expiring'; targetId; offset; key; outbox: boolean }
//       dueSoon: open assignment whose due date is `offset` London days away, offset in policy.dueOffsetsDays (targetId = assignment id)
//       overdue: open assignment past due; offset = whole days overdue; sent on day 1 and then every 7th day (1, 8, 15 ...)
//       expiring: requirement expiring in `offset` days, offset in policy.expiringOffsetsDays (targetId = requirement id)
//       key = `${personId}:${kind}:${targetId}:${offset}`; a key already in `log` is never planned again.
//       outbox is true normally, false when accountState is 'limited' (in-app only).
//     Skip = { personId; key; reason }.
//     deferred: reason 'quietHours' (client policy range or the person's own prefs.quietHours, London time; waits for a later run).
//     skipped reasons: 'onLeave', 'paused' (pausedUntil in the future), 'awaitingCheck', 'cap', 'alreadySent'.
//     Invited and archived people get nothing. Done or cancelled assignments get nothing. accountState 'readOnly' and 'closed': send is empty.
//     Cap: at most policy.weeklyCapPerPerson per person per London week, counting every log entry with that week's weekKey
//     (reminders and manager chases alike) plus reminders planned in this call.
//   inQuietHours(now: Date, ranges: { from: string; to: string }[]) => boolean   "HH:MM" in London time; from inclusive, to exclusive; from > to spans midnight.
//   renderReminder(template: string, params: { firstName: string; training: string; date: string }) => string
//     Replaces {firstName}, {training}, {date}. Throws on any other {placeholder}. Output is plain text (nothing is escaped or interpreted).
//   chasePreview(input: PlanInput) => { willSend: { personId: string }[]; skipped: { personId: string; reason: string }[] }
//     Everyone with something overdue right now (an open assignment past due or an overdue requirement), whatever the offsets.
//     Skips use the same reasons as above, plus 'quietHours' when now is inside quiet hours.
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { londonWeekKey } from '../engagement/weeks';
import type { ReminderLog } from '../schemas/admin';
import type { Assignment } from '../schemas/learning';
import { chasePreview, inQuietHours, planReminders, renderReminder } from './plan';
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
  weeklyCapPerPerson: 3,
  quietHours: { from: '21:00', to: '07:00' },
};
const s = siteNamed('Riverside');
const sg = requirement('Safeguarding', { renewEveryMonths: 24 });
const moduleId = nextId();
// Monday 19 October 2026, 10:00 London (BST): outside quiet hours.
const T = new Date('2026-10-19T09:00:00.000Z');

type PlanInput = Parameters<typeof planReminders>[0];
const plan = (over: Partial<PlanInput> = {}) =>
  planReminders({
    now: T,
    policy,
    accountState: 'active',
    people: [],
    sites: [s],
    assignments: [],
    requirements: [sg],
    evidence: [],
    submissions: [],
    log: [],
    ...over,
  });

const dueIn = (p: ReturnType<typeof staffAt>, days: number, now = T, over: Partial<Assignment> = {}) =>
  assignment(p, moduleId, days, { dueAt: addDays(now, days).toISOString(), ...over });
const logged = (p: { id: string }, n: number, sentAt: string): ReminderLog[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `${p.id}:dueSoon:${nextId()}:${i}`,
    clientId: CLIENT,
    personId: p.id,
    kind: 'dueSoon',
    sentAt,
    weekKey: londonWeekKey(sentAt),
  }));

describe('offsets', () => {
  const p = staffAt(s, 'Pat', 'One');

  it.each([7, 1])('sends a due reminder %i days before the due date', (n) => {
    const a = dueIn(p, n);
    const r = plan({ people: [p], assignments: [a] });
    expect(r.send).toEqual([
      expect.objectContaining({
        personId: p.id,
        kind: 'dueSoon',
        targetId: a.id,
        offset: n,
        key: `${p.id}:dueSoon:${a.id}:${n}`,
      }),
    ]);
  });

  it.each([5, 3, 0])('sends nothing %i days before the due date', (n) => {
    expect(plan({ people: [p], assignments: [dueIn(p, n)] }).send).toEqual([]);
  });

  it('sends one overdue reminder on the first overdue day', () => {
    const a = dueIn(p, -1);
    const r = plan({ people: [p], assignments: [a] });
    expect(r.send).toHaveLength(1);
    expect(r.send[0]).toMatchObject({ kind: 'overdue', offset: 1, targetId: a.id });
  });

  it.each([2, 3, 6])('sends nothing on overdue day %i', (n) => {
    expect(plan({ people: [p], assignments: [dueIn(p, -n)] }).send).toEqual([]);
  });

  it.each([8, 15])('repeats weekly: sends on overdue day %i', (n) => {
    expect(plan({ people: [p], assignments: [dueIn(p, -n)] }).send).toHaveLength(1);
  });

  it.each([60, 30, 7])('sends an expiry reminder %i days before expiry', (n) => {
    const r = plan({
      people: [p],
      evidence: [
        evidenceExpiring(p, sg, n, {
          completedAt: addDays(T, n - 700).toISOString(),
          expiresAt: addDays(T, n).toISOString(),
        }),
      ],
    });
    expect(r.send).toEqual([
      expect.objectContaining({ kind: 'expiring', targetId: sg.id, offset: n, key: `${p.id}:expiring:${sg.id}:${n}` }),
    ]);
  });

  it('sends no expiry reminder between offsets', () => {
    const e = evidenceExpiring(p, sg, 45, { expiresAt: addDays(T, 45).toISOString() });
    expect(plan({ people: [p], evidence: [e] }).send).toEqual([]);
  });

  it('follows the client policy offsets, not fixed numbers', () => {
    const custom = { ...policy, dueOffsetsDays: [3] };
    expect(plan({ policy: custom, people: [p], assignments: [dueIn(p, 3)] }).send).toHaveLength(1);
    expect(plan({ policy: custom, people: [p], assignments: [dueIn(p, 7)] }).send).toEqual([]);
  });

  it('stops once the training is done or cancelled', () => {
    for (const status of ['done', 'cancelled'] as const) {
      const r = plan({ people: [p], assignments: [dueIn(p, 7, T, { status })] });
      expect(r.send).toEqual([]);
      expect(r.deferred).toEqual([]);
    }
  });

  it('does not send the same reminder twice (log de-duplication)', () => {
    const a = dueIn(p, 7);
    const entry: ReminderLog = {
      key: `${p.id}:dueSoon:${a.id}:7`,
      clientId: CLIENT,
      personId: p.id,
      kind: 'dueSoon',
      sentAt: T.toISOString(),
      weekKey: londonWeekKey(T),
    };
    const r = plan({ people: [p], assignments: [a], log: [entry] });
    expect(r.send).toEqual([]);
    expect(r.skipped.map((x) => x.reason)).toContain('alreadySent');
  });

  it('is idempotent when the plan is logged and run again', () => {
    const a = dueIn(p, 7);
    const first = plan({ people: [p], assignments: [a] });
    const log = first.send.map((x: { key: string }) => ({
      key: x.key,
      clientId: CLIENT,
      personId: p.id,
      kind: 'dueSoon',
      sentAt: T.toISOString(),
      weekKey: londonWeekKey(T),
    }));
    expect(plan({ people: [p], assignments: [a], log }).send).toEqual([]);
  });
});

describe('who gets nothing', () => {
  it('skips people on leave with the reason', () => {
    const p = staffAt(s, 'Lee', 'Away', { status: 'onLeave' });
    const r = plan({ people: [p], assignments: [dueIn(p, 7)] });
    expect(r.send).toEqual([]);
    expect(r.skipped).toEqual([expect.objectContaining({ personId: p.id, reason: 'onLeave' })]);
  });

  it('skips people paused until a future date, but not once the pause has passed', () => {
    const paused = staffAt(s, 'Pau', 'Sed', { pausedUntil: addDays(T, 5).toISOString() });
    const back = staffAt(s, 'Bea', 'Back', { pausedUntil: addDays(T, -1).toISOString() });
    const r = plan({ people: [paused, back], assignments: [dueIn(paused, 7), dueIn(back, 7)] });
    expect(r.send.map((x: { personId: string }) => x.personId)).toEqual([back.id]);
    expect(r.skipped).toEqual([expect.objectContaining({ personId: paused.id, reason: 'paused' })]);
  });

  it.each(['invited', 'archived'] as const)('sends nothing to %s people', (status) => {
    const p = staffAt(s, 'No', 'Body', { status });
    expect(plan({ people: [p], assignments: [dueIn(p, 7)] }).send).toEqual([]);
  });

  it('sends no expiry reminder while a certificate is awaiting check', () => {
    const p = staffAt(s, 'Aw', 'Aiting');
    const e = evidenceExpiring(p, sg, 30, { expiresAt: addDays(T, 30).toISOString() });
    const r = plan({ people: [p], evidence: [e], submissions: [submissionWaiting(p, sg)] });
    expect(r.send).toEqual([]);
    expect(r.skipped).toEqual([expect.objectContaining({ personId: p.id, reason: 'awaitingCheck' })]);
  });

  it.each(['readOnly', 'closed'] as const)('sends nothing in %s', (accountState) => {
    const p = staffAt(s, 'Pat', 'One');
    expect(plan({ accountState, people: [p], assignments: [dueIn(p, 7)] }).send).toEqual([]);
  });

  it('in Limited, still plans the reminder but marks it in-app only', () => {
    const p = staffAt(s, 'Pat', 'One');
    const a = dueIn(p, 7);
    expect(plan({ accountState: 'limited', people: [p], assignments: [a] }).send[0]).toMatchObject({ outbox: false });
    expect(plan({ accountState: 'active', people: [p], assignments: [a] }).send[0]).toMatchObject({ outbox: true });
  });
});

describe('weekly cap', () => {
  const p = staffAt(s, 'Cap', 'Tain');

  it('sends only as many as the cap allows and skips the rest with the reason', () => {
    const many = [1, 2, 3, 4].map(() => dueIn(p, 7));
    const r = plan({ people: [p], assignments: many });
    expect(r.send).toHaveLength(3);
    expect(r.skipped.filter((x: { reason: string }) => x.reason === 'cap')).toHaveLength(1);
  });

  it('counts reminders and chases already logged this London week', () => {
    const log = logged(p, 2, '2026-10-19T08:00:00.000Z');
    const r = plan({ people: [p], assignments: [dueIn(p, 7), dueIn(p, 7)], log });
    expect(r.send).toHaveLength(1);
  });

  it('sends nothing when the cap is already used', () => {
    const r = plan({ people: [p], assignments: [dueIn(p, 7)], log: logged(p, 3, '2026-10-19T08:00:00.000Z') });
    expect(r.send).toEqual([]);
    expect(r.skipped.map((x: { reason: string }) => x.reason)).toContain('cap');
  });

  it('applies the cap per person, not across people', () => {
    const q = staffAt(s, 'Qu', 'Inn');
    const r = plan({
      people: [p, q],
      assignments: [dueIn(p, 7), dueIn(q, 7)],
      log: logged(p, 3, '2026-10-19T08:00:00.000Z'),
    });
    expect(r.send.map((x: { personId: string }) => x.personId)).toEqual([q.id]);
  });

  it('uses the policy cap', () => {
    const r = plan({
      policy: { ...policy, weeklyCapPerPerson: 1 },
      people: [p],
      assignments: [dueIn(p, 7), dueIn(p, 7)],
    });
    expect(r.send).toHaveLength(1);
  });

  it('still counts Sunday evening in the old week (the week of 25 October clock change)', () => {
    // Sunday 25 October 2026 20:30 London (GMT, the clocks went back that morning) is still the week starting Monday 19 October.
    const sunday = new Date('2026-10-25T20:30:00.000Z');
    const r = plan({
      now: sunday,
      people: [p],
      assignments: [dueIn(p, 7, sunday)],
      log: logged(p, 3, '2026-10-20T10:00:00.000Z'),
    });
    expect(r.send).toEqual([]);
  });

  it('starts a fresh count on Monday 26 October after a Sunday 23:30 reminder', () => {
    const monday = new Date('2026-10-26T09:00:00.000Z');
    const r = plan({
      now: monday,
      people: [p],
      assignments: [dueIn(p, 7, monday)],
      log: logged(p, 3, '2026-10-25T23:30:00.000Z'), // Sunday 23:30 GMT: last week
    });
    expect(r.send).toHaveLength(1);
  });
});

describe('quiet hours', () => {
  const p = staffAt(s, 'Qui', 'Et');

  it.each([
    ['21:00 London (20:00Z)', '2026-10-19T20:00:00.000Z', true],
    ['22:30 London', '2026-10-19T21:30:00.000Z', true],
    ['03:00 London', '2026-10-19T02:00:00.000Z', true],
    ['06:59 London', '2026-10-19T05:59:00.000Z', true],
    ['07:00 London', '2026-10-19T06:00:00.000Z', false],
    ['10:00 London', '2026-10-19T09:00:00.000Z', false],
    ['20:59 London', '2026-10-19T19:59:00.000Z', false],
  ])('a range from 21:00 to 07:00 at %s is %s', (_label, iso, expected) => {
    expect(inQuietHours(new Date(iso), [{ from: '21:00', to: '07:00' }])).toBe(expected);
  });

  it('handles a same-day range', () => {
    expect(inQuietHours(new Date('2026-10-19T12:30:00.000Z'), [{ from: '13:00', to: '14:00' }])).toBe(true); // 13:30 BST
    expect(inQuietHours(new Date('2026-10-19T14:00:00.000Z'), [{ from: '13:00', to: '14:00' }])).toBe(false); // 15:00 BST
  });

  it('is quiet when any one range matches, and never with no ranges', () => {
    const noon = new Date('2026-10-19T11:30:00.000Z'); // 12:30 BST
    expect(
      inQuietHours(noon, [
        { from: '21:00', to: '07:00' },
        { from: '12:00', to: '13:00' },
      ]),
    ).toBe(true);
    expect(inQuietHours(noon, [])).toBe(false);
  });

  it('uses London time in winter too (GMT)', () => {
    expect(inQuietHours(new Date('2026-12-07T21:30:00.000Z'), [{ from: '21:00', to: '07:00' }])).toBe(true);
    expect(inQuietHours(new Date('2026-12-07T20:30:00.000Z'), [{ from: '21:00', to: '07:00' }])).toBe(false);
  });

  it('defers a reminder that falls inside the client quiet hours instead of sending it', () => {
    const now = new Date('2026-10-19T21:30:00.000Z');
    const r = plan({ now, people: [p], assignments: [dueIn(p, 7, now)] });
    expect(r.send).toEqual([]);
    expect(r.deferred).toEqual([expect.objectContaining({ personId: p.id, reason: 'quietHours' })]);
  });

  it('sends it at the next run outside quiet hours (nothing was logged while deferred)', () => {
    const later = new Date('2026-10-19T06:30:00.000Z'); // 07:30 London
    const a = dueIn(p, 7, later);
    expect(plan({ now: later, people: [p], assignments: [a] }).send).toHaveLength(1);
  });

  it("honours a person's own quiet hours as well", () => {
    const own = staffAt(s, 'Own', 'Hours', { prefs: { ...p.prefs, quietHours: { from: '09:30', to: '11:00' } } });
    const r = plan({ people: [own], assignments: [dueIn(own, 7)] }); // 10:00 London
    expect(r.send).toEqual([]);
    expect(r.deferred).toEqual([expect.objectContaining({ personId: own.id, reason: 'quietHours' })]);
  });

  it("does not apply one person's quiet hours to another", () => {
    const own = staffAt(s, 'Own', 'Hours', { prefs: { ...p.prefs, quietHours: { from: '09:30', to: '11:00' } } });
    const r = plan({ people: [own, p], assignments: [dueIn(own, 7), dueIn(p, 7)] });
    expect(r.send.map((x: { personId: string }) => x.personId)).toEqual([p.id]);
  });
});

describe('assignments whose requirement is waiting or already met (BP-15, BP-6)', () => {
  const sgMod = requirement('Safeguarding module', { renewEveryMonths: 24, satisfiedByModuleIds: [moduleId] });
  const p = staffAt(s, 'Ext', 'Ernal');
  const a = (days: number) => dueIn(p, days, T, { createdAt: addDays(T, -10).toISOString() });

  it('sends the reminder when nothing else is going on', () => {
    expect(plan({ requirements: [sgMod], people: [p], assignments: [a(7)] }).send).toHaveLength(1);
  });

  it('skips it, with the reason, while a certificate for that requirement awaits a check', () => {
    const r = plan({
      requirements: [sgMod],
      people: [p],
      assignments: [a(7)],
      submissions: [submissionWaiting(p, sgMod)],
    });
    expect(r.send).toEqual([]);
    expect(r.skipped).toEqual([expect.objectContaining({ personId: p.id, reason: 'awaitingCheck' })]);
  });

  it('sends no overdue reminder once approved Evidence recorded since the assignment meets the requirement', () => {
    const ext = evidenceExpiring(p, sgMod, 700, {
      kind: 'external',
      completedAt: addDays(T, -2).toISOString(),
      approvedAt: addDays(T, -1).toISOString(),
      expiresAt: addDays(T, 700).toISOString(),
    });
    const r = plan({ requirements: [sgMod], people: [p], assignments: [a(-1)], evidence: [ext] });
    expect(r.send).toEqual([]);
    expect(r.deferred).toEqual([]);
  });

  it('still reminds when the Evidence on file is older than the assignment (a refresher before expiry)', () => {
    const old = evidenceExpiring(p, sgMod, 60, {
      completedAt: addDays(T, -600).toISOString(),
      expiresAt: addDays(T, 60).toISOString(),
    });
    expect(
      plan({ requirements: [sgMod], people: [p], assignments: [a(7)], evidence: [old] }).send.filter(
        (x: { kind: string }) => x.kind === 'dueSoon',
      ),
    ).toHaveLength(1);
  });
});

describe('catching up after quiet hours (BP-6, assumption 28)', () => {
  const p = staffAt(s, 'Cat', 'Chup');
  // Offset day 19 October, 22:00 London (21:00Z) is quiet. The next run is the next morning.
  const night = new Date('2026-10-19T21:00:00.000Z');
  const morning = new Date('2026-10-20T09:00:00.000Z');
  const a = assignment(p, moduleId, 7, {
    dueAt: addDays(night, 7).toISOString(),
    createdAt: addDays(night, -3).toISOString(),
  });

  it('defers on the offset night and sends on a later run, once', () => {
    const first = plan({ now: night, people: [p], assignments: [a], catchUpDays: 1 });
    expect(first.send).toEqual([]);
    expect(first.deferred).toHaveLength(1);
    const later = plan({ now: morning, people: [p], assignments: [a], catchUpDays: 1 });
    expect(later.send).toEqual([expect.objectContaining({ kind: 'dueSoon', targetId: a.id, offset: 7 })]);
    const log = later.send.map((x: { key: string }) => ({
      key: x.key,
      clientId: CLIENT,
      personId: p.id,
      kind: 'dueSoon' as const,
      sentAt: morning.toISOString(),
      weekKey: londonWeekKey(morning),
    }));
    expect(plan({ now: morning, people: [p], assignments: [a], catchUpDays: 1, log }).send).toEqual([]);
  });

  it('does not catch up unless asked to (default is the exact offset day only)', () => {
    expect(plan({ now: morning, people: [p], assignments: [a] }).send).toEqual([]);
  });

  it('does not catch up what the weekly cap stopped on the offset day', () => {
    const used = Array.from({ length: 3 }, (_, i) => ({
      key: `${p.id}:dueSoon:${nextId()}:${i}`,
      clientId: CLIENT,
      personId: p.id,
      kind: 'dueSoon' as const,
      sentAt: addDays(night, -1).toISOString(),
      weekKey: londonWeekKey(night),
    }));
    expect(plan({ now: morning, people: [p], assignments: [a], catchUpDays: 1, log: used }).send).toEqual([]);
  });

  it('does not catch up an assignment made after the offset day', () => {
    const fresh = { ...a, createdAt: morning.toISOString() };
    expect(plan({ now: morning, people: [p], assignments: [fresh], catchUpDays: 1 }).send).toEqual([]);
  });

  it('does not catch up once the assignment is done', () => {
    const done = { ...a, status: 'done' as const };
    expect(plan({ now: morning, people: [p], assignments: [done], catchUpDays: 1 }).send).toEqual([]);
  });

  it('catches up an expiry reminder too, but not if the certificate was renewed since', () => {
    const e = evidenceExpiring(p, sg, 30, {
      completedAt: addDays(night, -700).toISOString(),
      expiresAt: addDays(night, 30).toISOString(),
    });
    const r = plan({ now: morning, people: [p], evidence: [e], catchUpDays: 1 });
    expect(r.send).toEqual([expect.objectContaining({ kind: 'expiring', offset: 30 })]);
    const renewed = evidenceExpiring(p, sg, 700, {
      completedAt: addDays(morning, -1).toISOString(),
      expiresAt: addDays(morning, 700).toISOString(),
    });
    expect(plan({ now: morning, people: [p], evidence: [e, renewed], catchUpDays: 1 }).send).toEqual([]);
  });
});

describe('renderReminder', () => {
  const params = { firstName: 'Jade', training: 'Fire safety', date: '5 November' };

  it('fills the three placeholders, every occurrence', () => {
    expect(renderReminder('Hi {firstName}, {training} is due {date}. Thanks {firstName}.', params)).toBe(
      'Hi Jade, Fire safety is due 5 November. Thanks Jade.',
    );
  });

  it('refuses an unknown placeholder', () => {
    expect(() => renderReminder('Hi {surname}', params)).toThrow(/surname/);
    expect(() => renderReminder('Pay {amount}', params)).toThrow();
  });

  it('renders as plain text: markup in the template or the values is left alone', () => {
    const out = renderReminder('<b>{training}</b>', { ...params, training: '<script>x</script>' });
    expect(out).toBe('<b><script>x</script></b>');
  });

  it('leaves text with no placeholders unchanged', () => {
    expect(renderReminder('Nothing to fill in.', params)).toBe('Nothing to fill in.');
  });
});

describe('chasePreview', () => {
  const ok = staffAt(s, 'Ok', 'One');
  const capped = staffAt(s, 'Cap', 'Ped');
  const paused = staffAt(s, 'Pau', 'Sed', { pausedUntil: addDays(T, 4).toISOString() });
  const away = staffAt(s, 'Lee', 'Away', { status: 'onLeave' });
  const fine = staffAt(s, 'No', 'Issue');
  const waiting = staffAt(s, 'Wai', 'Ting');
  const base = {
    people: [ok, capped, paused, away, fine, waiting],
    assignments: [dueIn(ok, -3), dueIn(capped, -3), dueIn(paused, -3), dueIn(away, -3)],
    evidence: [evidenceExpiring(waiting, sg, -4)],
    submissions: [submissionWaiting(waiting, sg)],
    log: logged(capped, 3, '2026-10-19T08:00:00.000Z'),
  };
  const run = (over: Partial<PlanInput> = {}) =>
    chasePreview({
      now: T,
      policy,
      accountState: 'active',
      sites: [s],
      requirements: [sg],
      ...base,
      ...over,
    });

  it('lists who would get a chase and who is skipped and why', () => {
    const r = run();
    expect(r.willSend.map((x: { personId: string }) => x.personId)).toEqual([ok.id]);
    const reasons = Object.fromEntries(
      r.skipped.map((x: { personId: string; reason: string }) => [x.personId, x.reason]),
    );
    expect(reasons).toEqual({
      [capped.id]: 'cap',
      [paused.id]: 'paused',
      [away.id]: 'onLeave',
      [waiting.id]: 'awaitingCheck',
    });
  });

  it('includes people who are overdue on any day, not only on a reminder offset', () => {
    expect(run().willSend.map((x: { personId: string }) => x.personId)).toContain(ok.id); // 3 days overdue
  });

  it('ignores people with nothing overdue', () => {
    const r = run();
    const everyone = [...r.willSend, ...r.skipped].map((x: { personId: string }) => x.personId);
    expect(everyone).not.toContain(fine.id);
  });

  it('skips everyone as quiet hours when the clock is inside them', () => {
    const r = run({ now: new Date('2026-10-19T21:30:00.000Z') });
    expect(r.willSend).toEqual([]);
    expect(r.skipped.map((x: { reason: string }) => x.reason)).toContain('quietHours');
  });
});

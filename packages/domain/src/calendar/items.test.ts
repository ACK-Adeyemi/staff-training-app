// BP-13: derived calendar items (plan M3 assumptions 31 and 32; brief 28). Nothing is stored.
//
// API under test (calendar/items.ts), pure:
//   type CalendarKind = 'assignmentDue' | 'expiry' | 'refresherStart' | 'awaitingCheck' | 'competitionStart' | 'competitionEnd'
//     | 'competitionWinners' | 'weeklyGoal' | 'leaveEnd'                                  (staff)
//     | 'ruleRefresher' | 'competitionRecordWinners' | 'themeStart' | 'themeEnd' | 'newStarter'   (admin, in addition)
//     | 'planRenewal' | 'invoiceDue' | 'addOnTrialEnd' | 'accountStateChange'                (admin, only with billing data)
//   type CalendarItem = { id: string; kind: CalendarKind; date: string /* London YYYY-MM-DD, all-day */;
//     titleKey: string; params: Record<string, string | number>; personId?: string; siteId?: string;
//     requirementId?: string; moduleId?: string; competitionId?: string }
//   type CalendarRange = { from: string; to: string }          London dates, both inclusive (today to today + 90 by default)
//   type CalendarFilters = { siteId?: string; teamId?: string; personId?: string; requirementId?: string; kinds?: CalendarKind[] }
//   calendarItems(view, range, filters?) => CalendarItem[]   sorted by date, then kind, then id; ids are stable across calls
//     Staff view:  { audience: 'staff'; person; sites; requirements; evidence; submissions; assignments; modules;
//                    competitions; amberWindowDays; now }
//     Admin view:  { audience: 'admin'; people; sites; requirements; evidence; submissions; assignments; modules;
//                    competitions; rules: AutoAssignRule[]; themes: Theme[]; amberWindowDays; now;
//                    billing?: { renewalAt?: string; invoices: { id: string; dueAt: string; status: 'open' | 'paid' }[];
//                                addOnTrials: { addOnId: string; endsAt: string }[];
//                                nextStateChange?: { at: string; state: string } } }
//   Staff items: open assignment due dates (params.training = module title); per applicable requirement the expiry date and
//     'refresherStart' on expiry minus the amber window; awaitingCheck for an awaiting submission; competitions the person is
//     eligible for that are scheduled or live (not draft or cancelled): start, end, and 'competitionWinners' on the end date;
//     one 'weeklyGoal' marker in the current London week only; 'leaveEnd' on the person's own pausedUntil.
//   Admin items (people in the filtered scope, by primary site): the same per person with personId, 'ruleRefresher' for each
//     enabled requirementExpiring rule (expiry minus rule days), 'competitionRecordWinners' on the end date, themes with a
//     schedule (themeStart, themeEnd), leaveEnd for people with a future pausedUntil, newStarter on a future startDate,
//     and billing items ONLY when view.billing is present.
import { describe, expect, it } from 'vitest';
import { addDays, londonDateString } from '../dates';
import { competition } from '../competitions/testFixtures';
import type { AutoAssignRule, Theme } from '../schemas/admin';
import { calendarItems } from './items';
import {
  AMBER,
  CLIENT,
  NOW,
  assignment,
  evidenceExpiring,
  moduleFor,
  nextId,
  requirement,
  siteNamed,
  staffAt,
  submissionWaiting,
} from '../sites/testFixtures';

const day = (n: number): string => londonDateString(addDays(NOW, n));
const range = (to = 90) => ({ from: day(0), to: day(to) });
const kinds = (items: { kind: string }[]) => items.map((i) => i.kind);

const riverside = siteNamed('Riverside');
const meadow = siteNamed('Meadow');
const sg = requirement('Safeguarding', { renewEveryMonths: 24 });
const fa = requirement('Paediatric first aid', { renewEveryMonths: 36 });
const mod = moduleFor({ id: nextId(), title: 'Fire evacuation' });

const staffView = (me: ReturnType<typeof staffAt>, over: Record<string, unknown> = {}) =>
  ({
    audience: 'staff',
    person: me,
    sites: [riverside, meadow],
    requirements: [sg, fa],
    evidence: [],
    submissions: [],
    assignments: [],
    modules: [mod],
    competitions: [],
    amberWindowDays: AMBER,
    now: NOW,
    ...over,
  }) as never;

const adminView = (people: ReturnType<typeof staffAt>[], over: Record<string, unknown> = {}) =>
  ({
    audience: 'admin',
    people,
    sites: [riverside, meadow],
    requirements: [sg, fa],
    evidence: [],
    submissions: [],
    assignments: [],
    modules: [mod],
    competitions: [],
    rules: [],
    themes: [],
    amberWindowDays: AMBER,
    now: NOW,
    ...over,
  }) as never;

describe('staff items', () => {
  const me = staffAt(riverside, 'Mark', 'Taylor');

  it('lists an open assignment on its due date with the module title', () => {
    const a = assignment(me, mod.id, 12);
    const items = calendarItems(staffView(me, { assignments: [a] }), range());
    expect(items).toContainEqual(
      expect.objectContaining({
        kind: 'assignmentDue',
        date: day(12),
        moduleId: mod.id,
        params: expect.objectContaining({ training: 'Fire evacuation' }) as unknown,
      }),
    );
  });

  it('leaves out done and cancelled assignments', () => {
    const a = [assignment(me, mod.id, 5, { status: 'done' }), assignment(me, mod.id, 6, { status: 'cancelled' })];
    expect(kinds(calendarItems(staffView(me, { assignments: a }), range()))).not.toContain('assignmentDue');
  });

  it('lists the expiry date and a refresher start on expiry minus the amber window', () => {
    const e = evidenceExpiring(me, fa, 70);
    const items = calendarItems(staffView(me, { evidence: [e] }), range());
    expect(items).toContainEqual(expect.objectContaining({ kind: 'expiry', date: day(70), requirementId: fa.id }));
    expect(items).toContainEqual(
      expect.objectContaining({ kind: 'refresherStart', date: day(70 - AMBER), requirementId: fa.id }),
    );
  });

  it('shows only the refresher start when the expiry is beyond 90 days', () => {
    const e = evidenceExpiring(me, sg, 100);
    const items = calendarItems(staffView(me, { evidence: [e] }), range());
    expect(items.filter((i) => i.requirementId === sg.id).map((i) => i.kind)).toEqual(['refresherStart']);
  });

  it('includes day 90 and leaves out day 91', () => {
    const items = calendarItems(
      staffView(me, { evidence: [evidenceExpiring(me, fa, 90), evidenceExpiring(me, sg, 91)] }),
      range(90),
    );
    expect(items).toContainEqual(expect.objectContaining({ kind: 'expiry', requirementId: fa.id, date: day(90) }));
    expect(items.some((i) => i.kind === 'expiry' && i.requirementId === sg.id)).toBe(false);
  });

  it('leaves out dates before today', () => {
    const items = calendarItems(staffView(me, { evidence: [evidenceExpiring(me, fa, 20)] }), range());
    expect(items.some((i) => i.kind === 'refresherStart')).toBe(false); // 20 - 60 is in the past
    expect(items.every((i) => i.date >= day(0))).toBe(true);
  });

  it('leaves out a requirement that does not apply to the person', () => {
    const only = requirement('Food hygiene', { appliesTo: { jobRoleIds: [nextId()] }, renewEveryMonths: 36 });
    const items = calendarItems(
      staffView(me, { requirements: [only], evidence: [evidenceExpiring(me, only, 30)] }),
      range(),
    );
    expect(items.filter((i) => i.requirementId === only.id)).toEqual([]);
  });

  it('lists a certificate awaiting check', () => {
    const items = calendarItems(staffView(me, { submissions: [submissionWaiting(me, fa)] }), range());
    expect(items).toContainEqual(expect.objectContaining({ kind: 'awaitingCheck', requirementId: fa.id }));
  });

  it('lists competition start, end and winners announced (the end date) for ones the person can see', () => {
    const c = competition({
      startAt: addDays(NOW, 10).toISOString(),
      endAt: addDays(NOW, 40).toISOString(),
      status: 'scheduled',
    });
    const items = calendarItems(staffView(me, { competitions: [c] }), range());
    expect(items).toContainEqual(
      expect.objectContaining({ kind: 'competitionStart', date: day(10), competitionId: c.id }),
    );
    expect(items).toContainEqual(expect.objectContaining({ kind: 'competitionEnd', date: day(40) }));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'competitionWinners', date: day(40) }));
  });

  it('hides draft and cancelled competitions and ones the person is not eligible for', () => {
    const base = { startAt: addDays(NOW, 10).toISOString(), endAt: addDays(NOW, 40).toISOString() };
    const cs = [
      competition({ ...base, status: 'draft' }),
      competition({ ...base, status: 'cancelled' }),
      competition({ ...base, status: 'scheduled', eligibility: { siteIds: [meadow.id], excludePersonIds: [] } }),
      competition({ ...base, status: 'scheduled', eligibility: { excludePersonIds: [me.id] } }),
    ];
    expect(calendarItems(staffView(me, { competitions: cs }), range()).filter((i) => i.competitionId)).toEqual([]);
  });

  it('does not list the start of a competition that has already started', () => {
    const c = competition({ startAt: addDays(NOW, -5).toISOString(), endAt: addDays(NOW, 20).toISOString() });
    const items = calendarItems(staffView(me, { competitions: [c] }), range());
    expect(kinds(items)).not.toContain('competitionStart');
    expect(kinds(items)).toContain('competitionEnd');
  });

  it('puts one weekly goal marker in the current London week only', () => {
    const goals = calendarItems(staffView(me), range()).filter((i) => i.kind === 'weeklyGoal');
    expect(goals).toHaveLength(1);
    // NOW is Monday 19 October 2026: the week runs to Sunday 25 October.
    expect(goals[0]!.date >= '2026-10-19' && goals[0]!.date <= '2026-10-25').toBe(true);
  });

  it("lists the end of the person's own leave pause", () => {
    const away = staffAt(riverside, 'Lee', 'Away', { status: 'onLeave', pausedUntil: addDays(NOW, 30).toISOString() });
    expect(calendarItems(staffView(away), range())).toContainEqual(
      expect.objectContaining({ kind: 'leaveEnd', date: day(30) }),
    );
  });

  it('never includes billing or other people', () => {
    const items = calendarItems(staffView(me, { evidence: [evidenceExpiring(me, fa, 30)] }), range());
    expect(items.every((i) => i.personId === undefined || i.personId === me.id)).toBe(true);
    expect(kinds(items)).not.toContain('planRenewal');
  });

  it('is sorted by date and gives the same ids when called twice (so Fast-forward just re-derives)', () => {
    const v = staffView(me, {
      assignments: [assignment(me, mod.id, 9), assignment(me, mod.id, 3)],
      evidence: [evidenceExpiring(me, fa, 50)],
    });
    const a = calendarItems(v, range());
    expect(a.map((i) => i.date)).toEqual([...a.map((i) => i.date)].sort());
    expect(calendarItems(v, range()).map((i) => i.id)).toEqual(a.map((i) => i.id));
    expect(new Set(a.map((i) => i.id)).size).toBe(a.length);
  });

  it('re-derives after the clock moves on', () => {
    const v = staffView(me, { assignments: [assignment(me, mod.id, 20)] });
    const later = addDays(NOW, 25);
    const items = calendarItems({ ...(v as object), now: later } as never, {
      from: londonDateString(later),
      to: londonDateString(addDays(later, 90)),
    });
    expect(items.filter((i) => i.kind === 'assignmentDue')).toEqual([]); // it is now 5 days overdue, not "coming up"
  });
});

describe('admin items', () => {
  const p1 = staffAt(riverside, 'Ann', 'One');
  const p2 = staffAt(riverside, 'Bob', 'Two');
  const q1 = staffAt(meadow, 'Cat', 'Three');
  const people = [p1, p2, q1];
  const ev = [evidenceExpiring(p1, sg, 45), evidenceExpiring(p2, sg, 47), evidenceExpiring(q1, sg, 46)];

  it('lists each person expiry with the person and site', () => {
    const items = calendarItems(adminView(people, { evidence: ev }), range()).filter((i) => i.kind === 'expiry');
    expect(items.map((i) => i.personId).sort()).toEqual([p1.id, p2.id, q1.id].sort());
    expect(items.find((i) => i.personId === q1.id)).toMatchObject({
      siteId: meadow.id,
      date: day(46),
      requirementId: sg.id,
    });
  });

  it('respects the site filter, by primary site', () => {
    const items = calendarItems(adminView(people, { evidence: ev }), range(), { siteId: meadow.id });
    expect(items.every((i) => i.personId === q1.id || i.personId === undefined)).toBe(true);
    expect(items.some((i) => i.personId === p1.id)).toBe(false);
  });

  it('counts a floating person at their primary site only', () => {
    const nadia = staffAt(riverside, 'Nadia', 'Bank', { additionalSiteIds: [meadow.id] });
    const items = calendarItems(adminView([nadia], { evidence: [evidenceExpiring(nadia, sg, 30)] }), range(), {
      siteId: meadow.id,
    });
    expect(items.filter((i) => i.personId === nadia.id)).toEqual([]);
  });

  it('filters by person, requirement and kind', () => {
    const v = adminView(people, {
      evidence: [...ev, evidenceExpiring(p1, fa, 33)],
      assignments: [assignment(p1, mod.id, 5)],
    });
    expect(new Set(calendarItems(v, range(), { personId: p1.id }).map((i) => i.personId))).toEqual(new Set([p1.id]));
    expect(calendarItems(v, range(), { requirementId: fa.id }).every((i) => i.requirementId === fa.id)).toBe(true);
    expect(new Set(kinds(calendarItems(v, range(), { kinds: ['assignmentDue'] })))).toEqual(new Set(['assignmentDue']));
  });

  it('lists the expected refresher date for an enabled requirementExpiring rule, and not for a disabled one', () => {
    const rule = (enabled: boolean): AutoAssignRule => ({
      id: nextId(),
      clientId: CLIENT,
      name: 'Safeguarding refresher',
      enabled,
      trigger: { type: 'requirementExpiring', days: 30, requirementId: sg.id },
      filters: {},
      action: { moduleId: mod.id },
      dueInDays: 0,
    });
    const on = calendarItems(adminView([p1], { evidence: [ev[0]], rules: [rule(true)] }), range());
    expect(on).toContainEqual(expect.objectContaining({ kind: 'ruleRefresher', date: day(45 - 30), personId: p1.id }));
    const off = calendarItems(adminView([p1], { evidence: [ev[0]], rules: [rule(false)] }), range());
    expect(kinds(off)).not.toContain('ruleRefresher');
  });

  it('lists awaiting-check items', () => {
    const items = calendarItems(adminView([p1], { submissions: [submissionWaiting(p1, fa)] }), range());
    expect(items).toContainEqual(expect.objectContaining({ kind: 'awaitingCheck', personId: p1.id }));
  });

  it('lists competition start, end and record-winners date', () => {
    const c = competition({ startAt: addDays(NOW, 5).toISOString(), endAt: addDays(NOW, 35).toISOString() });
    const items = calendarItems(adminView([p1], { competitions: [c] }), range());
    expect(items).toContainEqual(expect.objectContaining({ kind: 'competitionStart', date: day(5) }));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'competitionEnd', date: day(35) }));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'competitionRecordWinners', date: day(35) }));
  });

  it('lists scheduled themes (start and end)', () => {
    const t: Theme = {
      id: nextId(),
      clientId: CLIENT,
      name: 'Christmas',
      tokens: { primary: '#1b5e20', accent: '#b71c1c', backgroundTint: '#f5fbf5', radius: 'md' },
      schedule: { startAt: addDays(NOW, 20).toISOString(), endAt: addDays(NOW, 50).toISOString() },
      appliesTo: { staff: true, admin: false },
    };
    const items = calendarItems(adminView([p1], { themes: [t] }), range());
    expect(items).toContainEqual(expect.objectContaining({ kind: 'themeStart', date: day(20) }));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'themeEnd', date: day(50) }));
  });

  it('lists leave return dates and new starters start dates', () => {
    const away = staffAt(riverside, 'Lee', 'Away', { status: 'onLeave', pausedUntil: addDays(NOW, 14).toISOString() });
    const newbie = staffAt(riverside, 'Nia', 'New', { status: 'invited', startDate: addDays(NOW, 8).toISOString() });
    const items = calendarItems(adminView([away, newbie]), range());
    expect(items).toContainEqual(expect.objectContaining({ kind: 'leaveEnd', date: day(14), personId: away.id }));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'newStarter', date: day(8), personId: newbie.id }));
  });

  describe('billing dates', () => {
    const billing = {
      renewalAt: addDays(NOW, 40).toISOString(),
      invoices: [
        { id: nextId(), dueAt: addDays(NOW, 10).toISOString(), status: 'open' as const },
        { id: nextId(), dueAt: addDays(NOW, 11).toISOString(), status: 'paid' as const },
      ],
      addOnTrials: [{ addOnId: nextId(), endsAt: addDays(NOW, 12).toISOString() }],
      nextStateChange: { at: addDays(NOW, 20).toISOString(), state: 'limited' },
    };

    it('appear only when billing data is passed in', () => {
      const without = calendarItems(adminView([p1]), range());
      for (const k of ['planRenewal', 'invoiceDue', 'addOnTrialEnd', 'accountStateChange'])
        expect(kinds(without)).not.toContain(k);
    });

    it('list plan renewal, unpaid invoice due dates, add-on trial ends and the next account state change', () => {
      const items = calendarItems(adminView([p1], { billing }), range());
      expect(items).toContainEqual(expect.objectContaining({ kind: 'planRenewal', date: day(40) }));
      expect(items.filter((i) => i.kind === 'invoiceDue').map((i) => i.date)).toEqual([day(10)]); // the paid invoice is not shown
      expect(items).toContainEqual(expect.objectContaining({ kind: 'addOnTrialEnd', date: day(12) }));
      expect(items).toContainEqual(expect.objectContaining({ kind: 'accountStateChange', date: day(20) }));
    });
  });
});

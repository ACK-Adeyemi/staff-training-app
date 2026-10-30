// Derived calendar items for staff (S18) and client admins (C28). Nothing is stored; call again after the clock moves
// (brief 28; plan M3 assumptions 31 and 32). Pure: `now` is in the view. Dates are London days, all-day.
// Decisions (docs/decisions.md, M3 chunk 2): awaitingCheck items are dated today; leave items are only the end of leave;
// competitions show while scheduled or live (derived from the dates).
import { competitionStatus, isEligible } from '../competitions/status';
import { addDays, daysBetween, londonDateString, mondayOfWeek } from '../dates';
import { displayName } from '../competitions/leaderboard';
import { personRequirementStatus } from '../requirements';
import { ruleMatchesPerson } from '../rules/autoAssign';
import type { AutoAssignRule, Theme } from '../schemas/admin';
import type { Competition } from '../schemas/engagement';
import type { Evidence, EvidenceSubmission } from '../schemas/evidence';
import type { Assignment, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { Person, Site } from '../schemas/tenancy';

export type CalendarKind =
  | 'assignmentDue'
  | 'expiry'
  | 'refresherStart'
  | 'awaitingCheck'
  | 'competitionStart'
  | 'competitionEnd'
  | 'competitionWinners'
  | 'weeklyGoal'
  | 'leaveEnd'
  | 'ruleRefresher'
  | 'competitionRecordWinners'
  | 'themeStart'
  | 'themeEnd'
  | 'newStarter'
  | 'planRenewal'
  | 'invoiceDue'
  | 'addOnTrialEnd'
  | 'accountStateChange'
  | 'priceChange';

export type CalendarItem = {
  id: string;
  kind: CalendarKind;
  /** London YYYY-MM-DD, all-day. */
  date: string;
  titleKey: string;
  params: Record<string, string | number>;
  personId?: string;
  siteId?: string;
  requirementId?: string;
  moduleId?: string;
  competitionId?: string;
};

export type CalendarRange = { from: string; to: string };
export type CalendarFilters = {
  siteId?: string;
  teamId?: string;
  personId?: string;
  requirementId?: string;
  kinds?: CalendarKind[];
};

type Shared = {
  sites: Site[];
  requirements: Requirement[];
  evidence: Evidence[];
  submissions: EvidenceSubmission[];
  assignments: Assignment[];
  modules: Module[];
  competitions: Competition[];
  amberWindowDays: number;
  now: Date;
};

export type StaffCalendarView = Shared & { audience: 'staff'; person: Person };
export type Billing = {
  renewalAt?: string;
  invoices: { id: string; dueAt: string; status: 'open' | 'paid' }[];
  addOnTrials: { addOnId: string; endsAt: string }[];
  nextStateChange?: { at: string; state: string };
  /** Confirmed price changes, by the date they take effect. */
  priceChanges?: { id: string; effectiveAt: string }[];
};
export type AdminCalendarView = Shared & {
  audience: 'admin';
  people: Person[];
  rules: AutoAssignRule[];
  themes: Theme[];
  billing?: Billing;
};
export type CalendarView = StaffCalendarView | AdminCalendarView;

const day = (iso: string): string => londonDateString(new Date(iso));

export function calendarItems(view: CalendarView, range: CalendarRange, filters: CalendarFilters = {}): CalendarItem[] {
  const out: CalendarItem[] = [];
  const add = (item: Omit<CalendarItem, 'params'> & { params?: CalendarItem['params'] }): void => {
    out.push({ params: {}, ...item });
  };
  const admin = view.audience === 'admin';
  const everyone = view.audience === 'admin' ? view.people : [view.person];
  const people = everyone.filter(
    (p) =>
      (filters.siteId === undefined || p.primarySiteId === filters.siteId) &&
      (filters.teamId === undefined || p.teamIds.includes(filters.teamId)) &&
      (filters.personId === undefined || p.id === filters.personId),
  );
  const moduleTitle = (id: string): string => view.modules.find((m) => m.id === id)?.title ?? '';
  const today = londonDateString(view.now);

  for (const p of people) {
    const mine = { personId: p.id, siteId: p.primarySiteId };
    const named = admin ? { person: displayName(p) } : {};
    if (p.status === 'active' || p.status === 'onLeave') {
      for (const a of view.assignments) {
        if (a.personId !== p.id || a.status !== 'open' || !('moduleId' in a.target)) continue;
        add({
          id: `assignmentDue:${a.id}`,
          kind: 'assignmentDue',
          date: day(a.dueAt),
          titleKey: 'calendar.assignmentDue',
          params: { training: moduleTitle(a.target.moduleId), ...named },
          moduleId: a.target.moduleId,
          ...mine,
        });
      }
      const site = view.sites.find((s) => s.id === p.primarySiteId);
      const ev = view.evidence.filter((e) => e.personId === p.id);
      const subs = view.submissions.filter((s) => s.personId === p.id);
      for (const r of view.requirements) {
        if (!site) break;
        const s = personRequirementStatus(r, p, site, ev, subs, view.now, view.amberWindowDays);
        if (!s.expiresAt) continue;
        const params = { requirement: r.name, ...named };
        const base = { requirementId: r.id, ...mine };
        add({
          id: `expiry:${p.id}:${r.id}:${day(s.expiresAt)}`,
          kind: 'expiry',
          date: day(s.expiresAt),
          titleKey: 'calendar.expiry',
          params,
          ...base,
        });
        const start = londonDateString(addDays(new Date(s.expiresAt), -view.amberWindowDays));
        add({
          id: `refresherStart:${p.id}:${r.id}:${start}`,
          kind: 'refresherStart',
          date: start,
          titleKey: 'calendar.refresherStart',
          params,
          ...base,
        });
        if (view.audience === 'admin') {
          for (const rule of view.rules) {
            if (!rule.enabled || rule.trigger.type !== 'requirementExpiring' || rule.trigger.requirementId !== r.id)
              continue;
            if (!ruleMatchesPerson(rule, p)) continue;
            const date = londonDateString(addDays(new Date(s.expiresAt), -rule.trigger.days));
            add({
              id: `ruleRefresher:${rule.id}:${p.id}:${date}`,
              kind: 'ruleRefresher',
              date,
              titleKey: 'calendar.ruleRefresher',
              params: { ...params, rule: rule.name },
              ...base,
            });
          }
        }
      }
      for (const sub of subs) {
        if (sub.status !== 'awaitingCheck') continue;
        const r = view.requirements.find((x) => x.id === sub.requirementId);
        add({
          id: `awaitingCheck:${sub.id}`,
          kind: 'awaitingCheck',
          date: today,
          titleKey: 'calendar.awaitingCheck',
          params: {
            requirement: r?.name ?? '',
            waitingDays: Math.max(0, daysBetween(new Date(sub.createdAt), view.now)),
            ...named,
          },
          requirementId: sub.requirementId,
          ...mine,
        });
      }
      if (view.audience === 'staff') {
        for (const c of view.competitions) {
          if (isEligible(c, p)) competitionItems(c, view.now, false, add);
        }
      }
    }
    if (p.pausedUntil !== undefined && new Date(p.pausedUntil).getTime() > view.now.getTime()) {
      add({
        id: `leaveEnd:${p.id}:${day(p.pausedUntil)}`,
        kind: 'leaveEnd',
        date: day(p.pausedUntil),
        titleKey: 'calendar.leaveEnd',
        params: named,
        ...mine,
      });
    }
    if (admin && new Date(p.startDate).getTime() > view.now.getTime()) {
      add({
        id: `newStarter:${p.id}:${day(p.startDate)}`,
        kind: 'newStarter',
        date: day(p.startDate),
        titleKey: 'calendar.newStarter',
        params: named,
        ...mine,
      });
    }
  }

  if (view.audience === 'staff') {
    const week = mondayOfWeek(view.now);
    const date = londonDateString(addDays(week, 6));
    add({
      id: `weeklyGoal:${londonDateString(week)}`,
      kind: 'weeklyGoal',
      date,
      titleKey: 'calendar.weeklyGoal',
      personId: view.person.id,
      siteId: view.person.primarySiteId,
    });
  } else {
    for (const c of view.competitions) competitionItems(c, view.now, true, add);
    for (const t of view.themes) {
      if (!t.schedule) continue;
      add({
        id: `themeStart:${t.id}`,
        kind: 'themeStart',
        date: day(t.schedule.startAt),
        titleKey: 'calendar.themeStart',
        params: { theme: t.name },
      });
      add({
        id: `themeEnd:${t.id}`,
        kind: 'themeEnd',
        date: day(t.schedule.endAt),
        titleKey: 'calendar.themeEnd',
        params: { theme: t.name },
      });
    }
    const b = view.billing;
    if (b) {
      if (b.renewalAt)
        add({ id: 'planRenewal', kind: 'planRenewal', date: day(b.renewalAt), titleKey: 'calendar.planRenewal' });
      for (const inv of b.invoices) {
        if (inv.status === 'open')
          add({
            id: `invoiceDue:${inv.id}`,
            kind: 'invoiceDue',
            date: day(inv.dueAt),
            titleKey: 'calendar.invoiceDue',
          });
      }
      for (const t of b.addOnTrials)
        add({
          id: `addOnTrialEnd:${t.addOnId}`,
          kind: 'addOnTrialEnd',
          date: day(t.endsAt),
          titleKey: 'calendar.addOnTrialEnd',
        });
      for (const pc of b.priceChanges ?? [])
        add({
          id: `priceChange:${pc.id}`,
          kind: 'priceChange',
          date: day(pc.effectiveAt),
          titleKey: 'client.priceNotice.title',
        });
      if (b.nextStateChange)
        add({
          id: 'accountStateChange',
          kind: 'accountStateChange',
          date: day(b.nextStateChange.at),
          titleKey: 'calendar.accountStateChange',
          params: { state: b.nextStateChange.state },
        });
    }
  }

  return out
    .filter(
      (i) =>
        i.date >= range.from &&
        i.date <= range.to &&
        (filters.personId === undefined || i.personId === filters.personId) &&
        (filters.requirementId === undefined || i.requirementId === filters.requirementId) &&
        (filters.kinds === undefined || filters.kinds.includes(i.kind)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

function competitionItems(
  c: Competition,
  now: Date,
  forAdmin: boolean,
  add: (i: Omit<CalendarItem, 'params'> & { params?: CalendarItem['params'] }) => void,
): void {
  const status = competitionStatus(c, now);
  if (status !== 'scheduled' && status !== 'live') return;
  const params = { competition: c.name };
  const base = { competitionId: c.id, params };
  add({
    id: `competitionStart:${c.id}`,
    kind: 'competitionStart',
    date: day(c.startAt),
    titleKey: 'calendar.competitionStart',
    ...base,
  });
  add({
    id: `competitionEnd:${c.id}`,
    kind: 'competitionEnd',
    date: day(c.endAt),
    titleKey: 'calendar.competitionEnd',
    ...base,
  });
  const kind = forAdmin ? 'competitionRecordWinners' : 'competitionWinners';
  add({ id: `${kind}:${c.id}`, kind, date: day(c.endAt), titleKey: `calendar.${kind}`, ...base });
}

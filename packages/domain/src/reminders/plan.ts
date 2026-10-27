// Reminder planning (brief 21.1; plan M3 assumptions 28 and 29). Pure: the caller sends and logs what comes back.
// Reminders fire only on the exact offset days. There is no catch-up if a run is missed (docs/decisions.md, M3 chunk 2).
import { daysBetween } from '../dates';
import { londonWeekKey } from '../engagement/weeks';
import { personRequirementStatus } from '../requirements';
import type { ReminderLog } from '../schemas/admin';
import type { Evidence, EvidenceSubmission } from '../schemas/evidence';
import type { Assignment } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { AccountState } from '../schemas/primitives';
import type { ClientSettings, Person, Site } from '../schemas/tenancy';

export type ReminderPolicy = ClientSettings['reminderPolicy'];
export type ReminderKind = 'dueSoon' | 'overdue' | 'expiring';
export type Reminder = {
  personId: string;
  kind: ReminderKind;
  targetId: string;
  offset: number;
  key: string;
  /** False in Limited: shown in the app only, nothing goes to the outbox. */
  outbox: boolean;
};
export type SkipReason = 'onLeave' | 'paused' | 'awaitingCheck' | 'cap' | 'alreadySent' | 'quietHours';
export type Skip = { personId: string; key: string; reason: SkipReason };

export type PlanInput = {
  now: Date;
  policy: ReminderPolicy;
  accountState: AccountState;
  people: Person[];
  sites: Site[];
  assignments: Assignment[];
  requirements: Requirement[];
  evidence: Evidence[];
  submissions: EvidenceSubmission[];
  log: ReminderLog[];
};

type Range = { from: string; to: string };

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

const londonClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const londonMinutes = (now: Date): number => {
  const parts = londonClock.formatToParts(now);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
};

/** True when London time is inside any range. `from` is inclusive, `to` exclusive; from > to spans midnight. */
export function inQuietHours(now: Date, ranges: Range[]): boolean {
  const at = londonMinutes(now);
  return ranges.some((r) => {
    const from = minutes(r.from);
    const to = minutes(r.to);
    return from <= to ? at >= from && at < to : at >= from || at < to;
  });
}

const rangesFor = (policy: ReminderPolicy, p: Person): Range[] => [
  policy.quietHours,
  ...(p.prefs.quietHours ? [p.prefs.quietHours] : []),
];

type Candidate = { kind: ReminderKind; targetId: string; offset: number; waiting: boolean };

function candidates(input: PlanInput, p: Person): Candidate[] {
  const out: Candidate[] = [];
  for (const a of input.assignments) {
    if (a.personId !== p.id || a.status !== 'open') continue;
    const days = daysBetween(input.now, new Date(a.dueAt));
    if (days > 0 && input.policy.dueOffsetsDays.includes(days)) {
      out.push({ kind: 'dueSoon', targetId: a.id, offset: days, waiting: false });
    } else if (days < 0 && (-days - 1) % 7 === 0) {
      out.push({ kind: 'overdue', targetId: a.id, offset: -days, waiting: false });
    }
  }
  const site = input.sites.find((s) => s.id === p.primarySiteId);
  if (site) {
    const ev = input.evidence.filter((e) => e.personId === p.id);
    const subs = input.submissions.filter((s) => s.personId === p.id);
    for (const r of input.requirements) {
      const s = personRequirementStatus(r, p, site, ev, subs, input.now, 36500);
      if (s.expiresAt === undefined || s.daysLeft === undefined || s.daysLeft <= 0) continue;
      if (!input.policy.expiringOffsetsDays.includes(s.daysLeft)) continue;
      out.push({ kind: 'expiring', targetId: r.id, offset: s.daysLeft, waiting: s.status === 'awaitingCheck' });
    }
  }
  return out;
}

const loggedThisWeek = (log: ReminderLog[], personId: string, weekKey: string): number =>
  log.filter((l) => l.personId === personId && l.weekKey === weekKey).length;

const asleep = (p: Person, now: Date): 'onLeave' | 'paused' | 'ignored' | undefined => {
  if (p.status === 'invited' || p.status === 'archived') return 'ignored';
  if (p.status === 'onLeave') return 'onLeave';
  if (p.pausedUntil !== undefined && new Date(p.pausedUntil).getTime() > now.getTime()) return 'paused';
  return undefined;
};

export function planReminders(input: PlanInput): { send: Reminder[]; deferred: Skip[]; skipped: Skip[] } {
  const send: Reminder[] = [];
  const deferred: Skip[] = [];
  const skipped: Skip[] = [];
  if (input.accountState === 'readOnly' || input.accountState === 'closed') return { send, deferred, skipped };

  const week = londonWeekKey(input.now);
  const logged = new Set(input.log.map((l) => l.key));
  for (const p of input.people) {
    const state = asleep(p, input.now);
    if (state === 'ignored') continue;
    let used = loggedThisWeek(input.log, p.id, week);
    for (const c of candidates(input, p)) {
      const key = `${p.id}:${c.kind}:${c.targetId}:${c.offset}`;
      const skip = (reason: SkipReason) => ({ personId: p.id, key, reason });
      if (logged.has(key)) skipped.push(skip('alreadySent'));
      else if (state) skipped.push(skip(state));
      else if (c.waiting) skipped.push(skip('awaitingCheck'));
      else if (inQuietHours(input.now, rangesFor(input.policy, p))) deferred.push(skip('quietHours'));
      else if (used >= input.policy.weeklyCapPerPerson) skipped.push(skip('cap'));
      else {
        used++;
        send.push({
          personId: p.id,
          kind: c.kind,
          targetId: c.targetId,
          offset: c.offset,
          key,
          outbox: input.accountState !== 'limited',
        });
      }
    }
  }
  return { send, deferred, skipped };
}

const KNOWN = ['firstName', 'training', 'date'] as const;

/** Fills {firstName}, {training} and {date}. Any other placeholder is an error. Output is plain text. */
export function renderReminder(
  template: string,
  params: { firstName: string; training: string; date: string },
): string {
  return template.replace(/\{([^{}]*)\}/g, (_m, name: string) => {
    if (!(KNOWN as readonly string[]).includes(name)) throw new Error(`Unknown placeholder {${name}}`);
    return params[name as (typeof KNOWN)[number]];
  });
}

export type ReminderTone = 'friendly' | 'neutral' | 'brief';
export const MAX_REMINDER_TEXT = 300;

const TONE_TEXT: Record<ReminderTone, Record<ReminderKind, string>> = {
  friendly: {
    dueSoon: 'Hi {firstName}, {training} is due on {date}.',
    overdue: 'Hi {firstName}, {training} was due on {date}. Please finish it when you can.',
    expiring: 'Hi {firstName}, your {training} certificate runs out on {date}.',
  },
  neutral: {
    dueSoon: '{firstName}, {training} is due on {date}.',
    overdue: '{firstName}, {training} was due on {date} and is now overdue.',
    expiring: '{firstName}, your {training} certificate expires on {date}.',
  },
  brief: {
    dueSoon: '{training}: due {date}.',
    overdue: '{training}: overdue since {date}.',
    expiring: '{training}: expires {date}.',
  },
};

/** The message used when a client has not written their own. Unknown kinds fall back to the due-soon wording. */
export function defaultReminderText(kind: string, tone: ReminderTone = 'friendly'): string {
  const set = TONE_TEXT[tone];
  return kind === 'overdue' ? set.overdue : kind === 'expiring' ? set.expiring : set.dueSoon;
}

/** Whether a client-written message can be saved: 1 to 300 characters, only {firstName}, {training} and {date}. */
export function checkReminderTemplate(text: string): 'ok' | 'empty' | 'tooLong' | 'unknownPlaceholder' {
  if (text.length === 0) return 'empty';
  if (text.length > MAX_REMINDER_TEXT) return 'tooLong';
  try {
    renderReminder(text, { firstName: '', training: '', date: '' });
  } catch {
    return 'unknownPlaceholder';
  }
  return 'ok';
}

export type ChaseSkipReason = SkipReason | 'accountState';

/** Everyone with something overdue right now, whatever the offsets, and who would be skipped and why. */
export function chasePreview(input: PlanInput): {
  willSend: { personId: string }[];
  skipped: { personId: string; reason: ChaseSkipReason }[];
} {
  const willSend: { personId: string }[] = [];
  const skipped: { personId: string; reason: ChaseSkipReason }[] = [];
  const week = londonWeekKey(input.now);
  for (const p of input.people) {
    const state = asleep(p, input.now);
    if (state === 'ignored') continue;
    const overdue: { waiting: boolean }[] = input.assignments
      .filter((a) => a.personId === p.id && a.status === 'open' && new Date(a.dueAt).getTime() < input.now.getTime())
      .map(() => ({ waiting: false }));
    const site = input.sites.find((s) => s.id === p.primarySiteId);
    if (site) {
      const ev = input.evidence.filter((e) => e.personId === p.id);
      const subs = input.submissions.filter((s) => s.personId === p.id);
      for (const r of input.requirements) {
        const s = personRequirementStatus(r, p, site, ev, subs, input.now, 0);
        if (s.status === 'overdue') overdue.push({ waiting: s.evidenceWaiting === true });
      }
    }
    if (overdue.length === 0) continue;
    const reason: ChaseSkipReason | undefined =
      input.accountState === 'readOnly' || input.accountState === 'closed'
        ? 'accountState'
        : state
          ? state
          : overdue.every((o) => o.waiting)
            ? 'awaitingCheck'
            : inQuietHours(input.now, rangesFor(input.policy, p))
              ? 'quietHours'
              : loggedThisWeek(input.log, p.id, week) >= input.policy.weeklyCapPerPerson
                ? 'cap'
                : undefined;
    if (reason) skipped.push({ personId: p.id, reason });
    else willSend.push({ personId: p.id });
  }
  return { willSend, skipped };
}

// ---------------------------------------------------------------- digest and manual sends (M3 chunk 10b)

type DigestInput = Omit<PlanInput, 'log' | 'accountState'>;

type Chase = {
  overdue: Assignment[];
  expiring: { requirementId: string; daysLeft: number; waiting: boolean }[];
  /** Requirements that have already run out (or were never met), as "Chase all overdue" counts them. */
  lapsed: { requirementId: string; daysOver: number; waiting: boolean }[];
};

/** Open assignments past their due date, and Evidence that runs out within the policy's widest expiry offset. */
function chaseItems(input: DigestInput, p: Person): Chase {
  const overdue = input.assignments.filter(
    (a) => a.personId === p.id && a.status === 'open' && new Date(a.dueAt).getTime() < input.now.getTime(),
  );
  const widest = Math.max(0, ...input.policy.expiringOffsetsDays);
  const expiring: Chase['expiring'] = [];
  const lapsed: Chase['lapsed'] = [];
  const site = input.sites.find((s) => s.id === p.primarySiteId);
  if (site) {
    const ev = input.evidence.filter((e) => e.personId === p.id);
    const subs = input.submissions.filter((s) => s.personId === p.id);
    for (const r of input.requirements) {
      const s = personRequirementStatus(r, p, site, ev, subs, input.now, 36500);
      if (s.status === 'overdue') {
        const over = s.daysLeft === undefined ? 1 : Math.max(1, -s.daysLeft);
        lapsed.push({ requirementId: r.id, daysOver: over, waiting: s.evidenceWaiting === true });
      }
      if (s.expiresAt === undefined || s.daysLeft === undefined || s.daysLeft <= 0 || s.daysLeft > widest) continue;
      expiring.push({ requirementId: r.id, daysLeft: s.daysLeft, waiting: s.status === 'awaitingCheck' });
    }
  }
  return { overdue, expiring, lapsed };
}

/** Who has something overdue and who has Evidence about to expire, each person once per list. Sends nothing. */
export function reminderDigest(input: DigestInput): {
  overdue: { personId: string }[];
  expiring: { personId: string }[];
} {
  const overdue: { personId: string }[] = [];
  const expiring: { personId: string }[] = [];
  for (const p of input.people) {
    if (asleep(p, input.now) === 'ignored') continue;
    const items = chaseItems(input, p);
    if (items.overdue.length > 0) overdue.push({ personId: p.id });
    if (items.expiring.length > 0) expiring.push({ personId: p.id });
  }
  return { overdue, expiring };
}

export type ManualSkipReason = SkipReason | 'nothingToChase';
export type ManualReminder = {
  personId: string;
  kind: 'overdue' | 'expiring';
  /** The assignment id (overdue), or the requirement id (overdue with no assignment, or expiring), the reminder names. */
  targetId: string;
  /** Days overdue or days left. */
  offset: number;
};

/**
 * What a manager's "Remind" button does for the named people: one reminder each, for the first overdue assignment or
 * else the first expiring requirement. People who are away, waiting on a check, in quiet hours or over the weekly cap
 * are skipped with the reason. The caller sends and logs what comes back.
 */
export function planManualSend(
  input: PlanInput,
  personIds: readonly string[],
): { send: ManualReminder[]; skipped: { personId: string; reason: ManualSkipReason }[] } {
  const send: ManualReminder[] = [];
  const skipped: { personId: string; reason: ManualSkipReason }[] = [];
  const week = londonWeekKey(input.now);
  for (const id of new Set(personIds)) {
    const p = input.people.find((x) => x.id === id);
    const state = p ? asleep(p, input.now) : 'ignored';
    if (!p || state === 'ignored') {
      skipped.push({ personId: id, reason: 'nothingToChase' });
      continue;
    }
    const items = chaseItems(input, p);
    const first = [...items.overdue].sort((a, b) =>
      a.dueAt === b.dueAt ? (a.id < b.id ? -1 : 1) : a.dueAt < b.dueAt ? -1 : 1,
    )[0];
    const ready = items.expiring.filter((e) => !e.waiting);
    const lapsedReady = items.lapsed.filter((e) => !e.waiting);
    const reason: ManualSkipReason | undefined =
      !first && items.expiring.length === 0 && items.lapsed.length === 0
        ? 'nothingToChase'
        : state
          ? state
          : !first && ready.length === 0 && lapsedReady.length === 0
            ? 'awaitingCheck'
            : inQuietHours(input.now, rangesFor(input.policy, p))
              ? 'quietHours'
              : loggedThisWeek(input.log, p.id, week) >= input.policy.weeklyCapPerPerson
                ? 'cap'
                : undefined;
    if (reason) {
      skipped.push({ personId: id, reason });
    } else if (first) {
      send.push({
        personId: id,
        kind: 'overdue',
        targetId: first.id,
        offset: Math.max(1, -daysBetween(input.now, new Date(first.dueAt))),
      });
    } else if (lapsedReady[0]) {
      send.push({
        personId: id,
        kind: 'overdue',
        targetId: lapsedReady[0].requirementId,
        offset: lapsedReady[0].daysOver,
      });
    } else {
      const e = ready[0] as (typeof ready)[number];
      send.push({ personId: id, kind: 'expiring', targetId: e.requirementId, offset: e.daysLeft });
    }
  }
  return { send, skipped };
}

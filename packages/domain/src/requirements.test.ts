// BP-5 (pure part): requirement status, written before the implementation (M0 chunk 5). Brief 27.6, plan Assumption 20.
//
// API under test (requirements.ts):
//   type RequirementStatusName = 'current' | 'expiringSoon' | 'awaitingCheck' | 'overdue' | 'notStarted' | 'notAssigned'
//   type RequirementStatus = { status: RequirementStatusName; expiresAt?: string; daysLeft?: number; evidenceWaiting?: boolean }
//   requirementStatus(requirement: Requirement, evidence: Evidence[], submissions: EvidenceSubmission[], now: Date,
//     amberWindowDays: number): RequirementStatus
//   personRequirementStatus(requirement, person: Person, site: Site, evidence, submissions, now: Date,
//     amberWindowDays: number): RequirementStatus      (notAssigned when requirementApplies is false)
//
// Conventions chosen where the plan left them open:
//  - `expiresAt` in the result is an ISO UTC string (Date.toISOString()), present whenever the latest evidence expires.
//  - `daysLeft` = daysBetween(now, expiry) in London days (negative once overdue is not asserted); omitted if no expiry.
//  - `evidenceWaiting` is true only for status 'overdue' with a submission in status 'awaitingCheck'; it is absent
//    or false everywhere else.
//  - Only submissions with status 'awaitingCheck' count as waiting. needsBetterCopy, rejected, withdrawn and approved do not.
//  - Expiry of the latest evidence (latest completedAt) is evidence.expiresAt, else addMonths(completedAt,
//    requirement.renewEveryMonths), else never. current when expiry - now > amberWindowDays days (exact), expiringSoon
//    when 0 < expiry - now <= amberWindowDays days, overdue when now >= expiry.
import { describe, expect, it } from 'vitest';
import { fixedClock, offsetClock } from './clock';
import { addDays, addMonths } from './dates';
import { idSchema } from './schemas/primitives';
import type { Evidence, EvidenceSubmission } from './schemas/evidence';
import type { Requirement } from './schemas/packs';
import type { Person, Site } from './schemas/tenancy';
import { personRequirementStatus, requirementStatus } from './requirements';

const id = (tag: string): string => {
  const crockford = tag.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  const value = ('0'.repeat(26) + crockford).slice(-26);
  if (!idSchema.safeParse(value).success) throw new Error(`bad test id ${tag}`);
  return value;
};

const TODAY = '2026-10-19T09:00:00.000Z';
const NOW = new Date(TODAY);
const AMBER = 60;
const CLIENT = id('CLIENT1');
const SITE = id('SITE1');
const PERSON = id('PERSON1');
const REQ = id('REQ1');
const DAY_MS = 86_400_000;

const requirement = (extra: Partial<Requirement> = {}): Requirement => ({
  id: REQ,
  name: 'Safeguarding',
  appliesTo: { all: true },
  evidence: ['module', 'external'],
  satisfiedByModuleIds: [],
  acceptsExternal: true,
  acceptedProviders: [],
  expiryMode: 'fromCertificate',
  approverChecklist: [],
  ...extra,
});

let counter = 0;
const nextId = (): string => id(`GEN${++counter}`);

const evidence = (completedAt: string, expiresAt?: string, extra: Partial<Evidence> = {}): Evidence => ({
  id: nextId(),
  clientId: CLIENT,
  personId: PERSON,
  requirementId: REQ,
  kind: 'external',
  completedAt,
  ...(expiresAt ? { expiresAt } : {}),
  siteIdAtTime: SITE,
  ...extra,
});

const submission = (status: EvidenceSubmission['status']): EvidenceSubmission => ({
  id: nextId(),
  clientId: CLIENT,
  siteId: SITE,
  personId: PERSON,
  requirementId: REQ,
  uploadedBy: PERSON,
  fileAttachmentId: nextId(),
  providerName: 'Example Training Ltd',
  completedAt: '2026-10-10T09:00:00.000Z',
  status,
  createdAt: '2026-10-14T09:00:00.000Z',
});

const inDays = (n: number, from: Date = NOW): string => addDays(from, n).toISOString();
const COMPLETED = '2025-01-10T09:00:00.000Z';

describe('requirementStatus: with evidence', () => {
  it('is current when expiry is well outside the amber window, and reports expiry and days left', () => {
    const expiry = inDays(200);
    const result = requirementStatus(requirement(), [evidence(COMPLETED, expiry)], [], NOW, AMBER);
    expect(result.status).toBe('current');
    expect(result.expiresAt).toBe(expiry);
    expect(result.daysLeft).toBe(200);
    expect(result.evidenceWaiting).toBeFalsy();
  });

  it('is expiringSoon at exactly the amber window (60 days)', () => {
    const result = requirementStatus(requirement(), [evidence(COMPLETED, inDays(60))], [], NOW, AMBER);
    expect(result.status).toBe('expiringSoon');
    expect(result.daysLeft).toBe(60);
  });

  it('is current at 61 days', () => {
    const result = requirementStatus(requirement(), [evidence(COMPLETED, inDays(61))], [], NOW, AMBER);
    expect(result.status).toBe('current');
  });

  it('is expiringSoon one millisecond before expiry', () => {
    const expiry = new Date(NOW.getTime() + 1).toISOString();
    expect(requirementStatus(requirement(), [evidence(COMPLETED, expiry)], [], NOW, AMBER).status).toBe('expiringSoon');
  });

  it('is overdue exactly when now equals expiry', () => {
    const result = requirementStatus(requirement(), [evidence(COMPLETED, TODAY)], [], NOW, AMBER);
    expect(result.status).toBe('overdue');
    expect(result.expiresAt).toBe(TODAY);
  });

  it('is overdue after expiry', () => {
    const result = requirementStatus(requirement(), [evidence(COMPLETED, inDays(-8))], [], NOW, AMBER);
    expect(result.status).toBe('overdue');
    expect(result.evidenceWaiting).toBeFalsy();
  });

  it('honours a different amber window per client', () => {
    const ev = [evidence(COMPLETED, inDays(45))];
    expect(requirementStatus(requirement(), ev, [], NOW, 30).status).toBe('current');
    expect(requirementStatus(requirement(), ev, [], NOW, 60).status).toBe('expiringSoon');
    expect(requirementStatus(requirement(), ev, [], NOW, 0).status).toBe('current');
  });

  it('works out expiry from renewEveryMonths when the evidence has no expiresAt', () => {
    const r = requirement({ renewEveryMonths: 24, expiryMode: 'fromRenewalPeriod' });
    const completed = '2025-01-10T09:00:00.000Z';
    const result = requirementStatus(r, [evidence(completed)], [], NOW, AMBER);
    expect(result.expiresAt).toBe(addMonths(new Date(completed), 24).toISOString());
    expect(result.status).toBe('current');
  });

  it('is overdue when renewEveryMonths has already run out', () => {
    const r = requirement({ renewEveryMonths: 12, expiryMode: 'fromRenewalPeriod' });
    expect(requirementStatus(r, [evidence('2025-01-10T09:00:00.000Z')], [], NOW, AMBER).status).toBe('overdue');
  });

  it('prefers the evidence expiresAt over renewEveryMonths', () => {
    const r = requirement({ renewEveryMonths: 24 });
    const result = requirementStatus(r, [evidence('2025-01-10T09:00:00.000Z', inDays(10))], [], NOW, AMBER);
    expect(result.status).toBe('expiringSoon');
    expect(result.daysLeft).toBe(10);
  });

  it('is current for ever when there is no expiry and no renewal period', () => {
    const r = requirement({ evidence: ['module'], expiryMode: 'fromRenewalPeriod' });
    const result = requirementStatus(r, [evidence('2020-01-01T09:00:00.000Z')], [], NOW, AMBER);
    expect(result.status).toBe('current');
    expect(result.expiresAt).toBeUndefined();
    expect(result.daysLeft).toBeUndefined();
    const far = addDays(NOW, 20 * 365);
    expect(requirementStatus(r, [evidence('2020-01-01T09:00:00.000Z')], [], far, AMBER).status).toBe('current');
  });

  it('uses the latest evidence by completedAt, not the order given or the latest expiry', () => {
    const older = evidence('2024-01-10T09:00:00.000Z', inDays(300));
    const newer = evidence('2026-09-01T09:00:00.000Z', inDays(20));
    expect(requirementStatus(requirement(), [older, newer], [], NOW, AMBER).status).toBe('expiringSoon');
    expect(requirementStatus(requirement(), [newer, older], [], NOW, AMBER).status).toBe('expiringSoon');
  });

  it('a renewal with a later expiry restores current after an overdue certificate', () => {
    const old = evidence('2023-01-10T09:00:00.000Z', inDays(-30));
    const renewal = evidence('2026-10-01T09:00:00.000Z', inDays(700));
    expect(requirementStatus(requirement(), [old], [], NOW, AMBER).status).toBe('overdue');
    expect(requirementStatus(requirement(), [old, renewal], [], NOW, AMBER).status).toBe('current');
  });
});

describe('requirementStatus: without evidence', () => {
  it('is notStarted with no evidence and no submissions', () => {
    const result = requirementStatus(requirement(), [], [], NOW, AMBER);
    expect(result.status).toBe('notStarted');
    expect(result.expiresAt).toBeUndefined();
    expect(result.evidenceWaiting).toBeFalsy();
  });

  it('is awaitingCheck with no evidence and a submission waiting for a check', () => {
    expect(requirementStatus(requirement(), [], [submission('awaitingCheck')], NOW, AMBER).status).toBe(
      'awaitingCheck',
    );
  });

  it.each(['needsBetterCopy', 'rejected', 'withdrawn', 'approved'] as const)(
    'a %s submission with no evidence leaves the requirement notStarted',
    (status) => {
      expect(requirementStatus(requirement(), [], [submission(status)], NOW, AMBER).status).toBe('notStarted');
    },
  );

  it('one waiting submission among decided ones still gives awaitingCheck', () => {
    const subs = [submission('rejected'), submission('awaitingCheck'), submission('withdrawn')];
    expect(requirementStatus(requirement(), [], subs, NOW, AMBER).status).toBe('awaitingCheck');
  });
});

describe('requirementStatus: evidence and a waiting submission together (Assumption 20)', () => {
  it('current evidence outside the window stays current', () => {
    const result = requirementStatus(
      requirement(),
      [evidence(COMPLETED, inDays(200))],
      [submission('awaitingCheck')],
      NOW,
      AMBER,
    );
    expect(result.status).toBe('current');
    expect(result.evidenceWaiting).toBeFalsy();
  });

  it('evidence inside the window with a waiting submission is awaitingCheck, not compliant', () => {
    const result = requirementStatus(
      requirement(),
      [evidence(COMPLETED, inDays(20))],
      [submission('awaitingCheck')],
      NOW,
      AMBER,
    );
    expect(result.status).toBe('awaitingCheck');
    expect(result.daysLeft).toBe(20);
  });

  it('evidence inside the window with a rejected submission is plain expiringSoon', () => {
    const result = requirementStatus(
      requirement(),
      [evidence(COMPLETED, inDays(20))],
      [submission('rejected'), submission('needsBetterCopy')],
      NOW,
      AMBER,
    );
    expect(result.status).toBe('expiringSoon');
  });

  it('evidence inside the window with an approved submission is plain expiringSoon', () => {
    const result = requirementStatus(
      requirement(),
      [evidence(COMPLETED, inDays(20))],
      [submission('approved')],
      NOW,
      AMBER,
    );
    expect(result.status).toBe('expiringSoon');
  });

  it('expired evidence with a waiting submission is overdue with evidenceWaiting', () => {
    const result = requirementStatus(
      requirement(),
      [evidence(COMPLETED, inDays(-3))],
      [submission('awaitingCheck')],
      NOW,
      AMBER,
    );
    expect(result.status).toBe('overdue');
    expect(result.evidenceWaiting).toBe(true);
  });

  it('expired evidence with a withdrawn submission is overdue without evidenceWaiting', () => {
    const result = requirementStatus(
      requirement(),
      [evidence(COMPLETED, inDays(-3))],
      [submission('withdrawn')],
      NOW,
      AMBER,
    );
    expect(result.status).toBe('overdue');
    expect(result.evidenceWaiting).toBeFalsy();
  });

  it('approving the submission (evidence created) makes the status current', () => {
    const subs = [submission('approved')];
    const approved = evidence('2026-10-10T09:00:00.000Z', inDays(700), { approvedBy: id('DANIEL'), approvedAt: TODAY });
    expect(requirementStatus(requirement(), [evidence(COMPLETED, inDays(20)), approved], subs, NOW, AMBER).status).toBe(
      'current',
    );
  });
});

describe('requirementStatus: fast-forwarded clock (BP-5)', () => {
  const today = fixedClock(TODAY);
  const ev = [evidence(COMPLETED, inDays(12))];

  it('12 days left is expiringSoon, +30 days is overdue, and offset 0 is expiringSoon again', () => {
    const at = (offsetDays: number) =>
      requirementStatus(requirement(), ev, [], offsetClock(today, offsetDays * DAY_MS).now(), AMBER);
    expect(at(0).status).toBe('expiringSoon');
    expect(at(0).daysLeft).toBe(12);
    expect(at(30).status).toBe('overdue');
    expect(at(0).status).toBe('expiringSoon');
  });

  it('a negative offset moves back to current', () => {
    const later = [evidence(COMPLETED, inDays(100))];
    const back = offsetClock(today, -50 * DAY_MS).now();
    expect(requirementStatus(requirement(), later, [], back, AMBER).status).toBe('current');
    expect(requirementStatus(requirement(), later, [], NOW, AMBER).status).toBe('current');
    expect(requirementStatus(requirement(), later, [], addDays(NOW, 50), AMBER).status).toBe('expiringSoon');
  });
});

describe('personRequirementStatus', () => {
  const COOK = id('COOK');
  const person = (extra: Partial<Person> = {}): Person => ({
    id: PERSON,
    clientId: CLIENT,
    primarySiteId: SITE,
    additionalSiteIds: [],
    teamIds: [],
    firstName: 'Jade',
    lastName: 'Mills',
    jobRoleIds: [],
    startDate: '2024-01-08T09:00:00.000Z',
    status: 'active',
    prefs: {
      hideFromLeaderboards: false,
      simpleView: false,
      textScale: 1,
      uiScale: 1,
      contrast: 'standard',
      colourMode: 'auto',
      reduceMotion: false,
      sound: true,
      haptics: true,
      readingFont: 'default',
      biggerButtons: false,
      language: 'en-GB',
      battleExtraTimePercent: 0,
    },
    ...extra,
  });
  const site: Site = {
    id: SITE,
    clientId: CLIENT,
    name: 'Riverside',
    countryCode: 'GB',
    status: 'active',
    timezone: 'Europe/London',
  };

  it('is notAssigned when the requirement does not apply to the person', () => {
    const r = requirement({ appliesTo: { jobRoleIds: [COOK] } });
    expect(personRequirementStatus(r, person(), site, [], [], NOW, AMBER).status).toBe('notAssigned');
  });

  it('is notAssigned for an archived person even when they hold evidence', () => {
    const result = personRequirementStatus(
      requirement(),
      person({ status: 'archived' }),
      site,
      [evidence(COMPLETED, inDays(200))],
      [],
      NOW,
      AMBER,
    );
    expect(result.status).toBe('notAssigned');
  });

  it('delegates to requirementStatus when the requirement applies', () => {
    const r = requirement({ appliesTo: { jobRoleIds: [COOK] } });
    const cook = person({ jobRoleIds: [COOK] });
    expect(personRequirementStatus(r, cook, site, [], [], NOW, AMBER).status).toBe('notStarted');
    expect(personRequirementStatus(r, cook, site, [evidence(COMPLETED, inDays(20))], [], NOW, AMBER).status).toBe(
      'expiringSoon',
    );
  });

  it('a person on leave is still assessed', () => {
    const result = personRequirementStatus(requirement(), person({ status: 'onLeave' }), site, [], [], NOW, AMBER);
    expect(result.status).toBe('notStarted');
  });
});

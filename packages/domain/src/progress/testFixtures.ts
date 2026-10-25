// Test-only builders for the progress, matrix, stats and assign tests (M1 chunk 3). Plain data, no behaviour.
import { addDays } from '../dates';
import type { Evidence, EvidenceSubmission } from '../schemas/evidence';
import type { Assignment, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { Person, Site, Team } from '../schemas/tenancy';

export const NOW = new Date('2026-10-19T09:00:00.000Z');
export const AMBER = 60;

const ids = (n: number): string => `01HZX${String(n).padStart(21, '0')}`;
let counter = 1000;
export const nextId = (): string => ids(counter++);

export const CLIENT = ids(1);
export const SITE_ID = ids(2);
export const SITE_2_ID = ids(3);
export const USER = ids(4);

export const site = (over: Partial<Site> = {}): Site => ({
  id: SITE_ID,
  clientId: CLIENT,
  name: 'Main site',
  countryCode: 'GB',
  status: 'active',
  timezone: 'Europe/London',
  ...over,
});

export const team = (id: string, name: string, siteId = SITE_ID): Team => ({ id, clientId: CLIENT, siteId, name });

export const person = (first: string, last: string, over: Partial<Person> = {}): Person => ({
  id: nextId(),
  clientId: CLIENT,
  primarySiteId: SITE_ID,
  additionalSiteIds: [],
  teamIds: [],
  firstName: first,
  lastName: last,
  jobRoleIds: [],
  startDate: '2025-01-06T09:00:00.000Z',
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
  ...over,
});

export const COOK_ROLE = ids(10);

export const requirement = (name: string, over: Partial<Requirement> = {}): Requirement => ({
  id: nextId(),
  name,
  appliesTo: { all: true },
  evidence: ['module'],
  satisfiedByModuleIds: [],
  acceptsExternal: false,
  acceptedProviders: [],
  expiryMode: 'fromRenewalPeriod',
  approverChecklist: [],
  ...over,
});

/** Evidence for a person that expires `inDays` days after NOW (negative is already expired). */
export const evidenceExpiring = (p: Person, r: Requirement, inDays: number, over: Partial<Evidence> = {}): Evidence => ({
  id: nextId(),
  clientId: p.clientId,
  personId: p.id,
  requirementId: r.id,
  kind: 'module',
  completedAt: addDays(NOW, inDays - 365).toISOString(),
  expiresAt: addDays(NOW, inDays).toISOString(),
  siteIdAtTime: p.primarySiteId,
  ...over,
});

export const submissionWaiting = (p: Person, r: Requirement): EvidenceSubmission => ({
  id: nextId(),
  clientId: p.clientId,
  siteId: p.primarySiteId,
  personId: p.id,
  requirementId: r.id,
  uploadedBy: USER,
  fileAttachmentId: nextId(),
  providerName: 'Fictional Training Ltd',
  completedAt: addDays(NOW, -6).toISOString(),
  status: 'awaitingCheck',
  createdAt: addDays(NOW, -6).toISOString(),
});

export const moduleFor = (over: Partial<Module> & { id: string }): Module =>
  ({
    owner: 'provider',
    title: 'Fictional module',
    description: '',
    estimatedMinutes: 10,
    language: 'en-GB',
    status: 'published',
    version: 1,
    requirementIds: [],
    roleTags: [],
    lessons: [],
    questions: [],
    ...over,
  }) as unknown as Module;

export const assignment = (
  p: Person,
  moduleId: string,
  dueInDays: number,
  over: Partial<Assignment> = {},
): Assignment => ({
  id: nextId(),
  clientId: p.clientId,
  personId: p.id,
  target: { moduleId },
  dueAt: addDays(NOW, dueInDays).toISOString(),
  source: 'manual',
  assignedBy: USER,
  createdAt: addDays(NOW, -3).toISOString(),
  status: 'open',
  ...over,
});

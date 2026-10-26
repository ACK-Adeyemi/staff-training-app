// Test-only builders for the competition, leaderboard and standing board tests (M2 chunk 3). Plain data, no behaviour.
import type { Competition } from '../schemas/engagement';
import type { Attempt, LearningEvent, Module } from '../schemas/learning';
import type { Person } from '../schemas/tenancy';
import { CLIENT, SITE_ID, event, moduleFor, nextId, person } from '../engagement/testFixtures';

export { CLIENT, SITE_ID, event, moduleFor, nextId, person };

/** The competition window used throughout: 1 October to 1 November 2026 (UTC instants). */
export const START = '2026-10-01T00:00:00.000Z';
export const END = '2026-11-01T00:00:00.000Z';

export const competition = (over: Partial<Competition> = {}): Competition => ({
  id: nextId(),
  clientId: CLIENT,
  type: 'builtIn',
  templateId: 'knowledgeBuilder',
  name: 'Knowledge Builder',
  startAt: START,
  endAt: END,
  prizeText: '£15 coffee shop voucher',
  eligibility: { excludePersonIds: [] },
  winnerSelection: 'top',
  winnerCount: 3,
  liveLeaderboard: true,
  status: 'scheduled',
  ...over,
});

/** A custom competition: no template, metric, leaderboard, winner selection or closed-book option. */
export const customCompetition = (over: Partial<Competition> = {}): Competition => ({
  id: nextId(),
  clientId: CLIENT,
  type: 'custom',
  name: 'Staff bake-off',
  startAt: START,
  endAt: END,
  prizeText: 'Cake stand',
  eligibility: { excludePersonIds: [] },
  status: 'scheduled',
  ...over,
});

/** A person who is on the roll and active by default. */
export const staff = (first: string, last: string, over: Partial<Person> = {}): Person => person(first, last, over);

export type MetricInputOver = Record<string, unknown>;

/** The input bag for competitionMetric (plan Design: competitions/metrics.ts). */
export const metricInput = (over: MetricInputOver = {}) => ({
  competition: competition(),
  people: [] as Person[],
  teams: [] as unknown[],
  events: [] as LearningEvent[],
  attempts: [] as Attempt[],
  assignments: [] as unknown[],
  evidence: [] as unknown[],
  requirements: [] as unknown[],
  modules: [] as Module[],
  ...over,
});

/** The input bag for standingBoard (plan Design: standingBoards.ts). */
export const boardInput = (over: MetricInputOver = {}) => {
  const base: Record<string, unknown> = metricInput();
  delete base.competition;
  return { ...base, now: new Date('2026-10-26T09:00:00.000Z'), ...over } as MetricInputOver & { now: Date };
};

/** A correct answer by a person, optionally tied to an attempt. */
export const correct = (
  p: Person,
  m: Module,
  questionId: string,
  at: string,
  over: Partial<LearningEvent> = {},
): LearningEvent =>
  event({
    type: 'questionAnswered',
    personId: p.id,
    moduleId: m.id,
    moduleVersion: m.version,
    questionId,
    correct: true,
    notesVisible: false,
    attemptMode: 'open',
    at,
    ...over,
  });

export const wrong = (p: Person, m: Module, questionId: string, at: string): LearningEvent =>
  correct(p, m, questionId, at, { correct: false });

export const completedModule = (p: Person, m: Module, at: string): LearningEvent =>
  event({ type: 'moduleCompleted', personId: p.id, moduleId: m.id, moduleVersion: m.version, at });

export const lessonDone = (p: Person, at: string, m?: Module): LearningEvent =>
  event({ type: 'lessonCompleted', personId: p.id, ...(m ? { moduleId: m.id } : {}), lessonId: 'l1', at });

export const attemptOf = (p: Person, m: Module, mode: 'open' | 'closed', over: Partial<Attempt> = {}): Attempt => ({
  id: nextId(),
  clientId: CLIENT,
  siteId: p.primarySiteId,
  personId: p.id,
  moduleId: m.id,
  moduleVersion: m.version,
  mode,
  questionIds: m.questions.map((q) => q.id),
  startedAt: '2026-10-10T09:00:00.000Z',
  finishedAt: '2026-10-10T09:10:00.000Z',
  ...over,
});

/** A published module whose bank is the given question keys; keys starting with `s` are scenarios. */
export const bank = (keys: string[], over: Partial<Module> = {}): Module =>
  moduleFor({
    id: nextId(),
    lessons: [{ id: 'l1', title: 'l1', minutes: 3, blocks: [] }],
    questions: keys.map((id) => ({ id, type: id.startsWith('s') ? 'scenario' : 'mcq', prompt: id })) as never,
    ...over,
  });

export const dueAssignment = (p: Person, m: Module, dueAt: string, over: Record<string, unknown> = {}) => ({
  id: nextId(),
  clientId: CLIENT,
  personId: p.id,
  target: { moduleId: m.id },
  dueAt,
  source: 'manual' as const,
  assignedBy: nextId(),
  createdAt: '2026-09-01T09:00:00.000Z',
  status: 'open' as const,
  ...over,
});

export const idsIn = (value: unknown): string => JSON.stringify(value);

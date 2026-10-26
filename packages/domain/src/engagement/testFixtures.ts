// Test-only builders for the engagement tests (M2 chunk 2). Plain data, no behaviour.
import type { Evidence } from '../schemas/evidence';
import type { Attempt, LearningEvent, Module } from '../schemas/learning';
import { CLIENT, SITE_ID, moduleFor, nextId, person } from '../progress/testFixtures';

export { CLIENT, SITE_ID, nextId, person, moduleFor };

export const me = person('Jade', 'Test');

/** Builds an event for `me`. `at` is any ISO string. Ids ascend, so id order matches creation order. */
export const event = (over: Partial<LearningEvent>): LearningEvent => ({
  id: nextId(),
  clientId: CLIENT,
  siteId: SITE_ID,
  personId: me.id,
  at: '2026-10-20T10:00:00.000Z',
  type: 'lessonCompleted',
  ...over,
});

export const lesson = (id: string) => ({ id, title: id, minutes: 3, blocks: [] });
export const question = (id: string, scenario = false) => ({ id, type: scenario ? 'scenario' : 'single', prompt: id });

/** A module with `lessons` lesson keys (l1..) and `questions` question keys (q1..). */
export const bankModule = (lessons: number, questions: number, over: Partial<Module> = {}): Module =>
  moduleFor({
    id: nextId(),
    lessons: Array.from({ length: lessons }, (_, i) => lesson(`l${i + 1}`)),
    questions: Array.from({ length: questions }, (_, i) => question(`q${i + 1}`)) as unknown as Module['questions'],
    ...over,
  });

export const attemptFor = (m: Module, over: Partial<Attempt> = {}): Attempt => ({
  id: nextId(),
  clientId: CLIENT,
  siteId: SITE_ID,
  personId: me.id,
  moduleId: m.id,
  moduleVersion: m.version,
  mode: 'open',
  questionIds: m.questions.map((q) => q.id),
  startedAt: '2026-10-20T10:00:00.000Z',
  ...over,
});

/** A correct answer; notesVisible defaults to false (notes hidden). */
export const answer = (m: Module, questionId: string, at: string, over: Partial<LearningEvent> = {}): LearningEvent =>
  event({
    type: 'questionAnswered',
    moduleId: m.id,
    moduleVersion: m.version,
    questionId,
    correct: true,
    notesVisible: false,
    attemptMode: 'open',
    at,
    ...over,
  });

export const passed = (m: Module, at: string, over: Partial<LearningEvent> = {}): LearningEvent =>
  event({ type: 'moduleCompleted', moduleId: m.id, moduleVersion: m.version, at, ...over });

export const moduleEvidence = (
  reqId: string,
  completedAt: string,
  expiresAt: string | undefined,
  over: Partial<Evidence> = {},
): Evidence => ({
  id: nextId(),
  clientId: CLIENT,
  personId: me.id,
  requirementId: reqId,
  kind: 'module',
  completedAt,
  ...(expiresAt === undefined ? {} : { expiresAt }),
  siteIdAtTime: SITE_ID,
  ...over,
});

/** Shuffles deterministically (no Math.random). */
export const reversed = <T>(xs: readonly T[]): T[] => [...xs].reverse();

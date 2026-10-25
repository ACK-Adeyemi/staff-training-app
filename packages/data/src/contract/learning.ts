// M1 chunk 5 contract tests: learning stores, read rules, learning operations, assign, notifications, archive,
// change notices and DemoAdmin.listStaffUsers (plan docs/plans/m1.md, "Data package" and "Contract tests").
// Runs against every adapter. Written before the implementation, so the API is described by the local types below.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  dueAtFromLondonDate,
  drawQuestions,
  fixedClock,
  type Assignment,
  type Attempt,
  type Evidence,
  type LearningEvent,
  type Module,
  type Question,
  type UserAccount,
} from '@sta/domain';
import {
  DataError,
  type ActorContext,
  type DataStore,
  type DemoAdmin,
  type StoreHandle,
  type StoreOptions,
} from '../types';
import { buildWorld, freshId, TODAY, type World } from './world';

// ---------------------------------------------------------------- the API under test, as the plan describes it

type Repo<T> = {
  get(ctx: ActorContext, id: string): Promise<T>;
  list(ctx: ActorContext, filter?: Record<string, unknown>): Promise<T[]>;
};
type Notification = {
  id: string;
  clientId: string;
  userId: string;
  kind: string;
  params: Record<string, string | number>;
  createdAt: string;
  readAt?: string;
};
type Attachment = { id: string; clientId: string };
type Overlay = { id: string; clientId: string };
type FinishResult = {
  attempt: Attempt;
  passed: boolean;
  score: number;
  missedQuestionIds: string[];
  evidence: Evidence[];
};
export type LearningStore = DataStore & {
  modules: Repo<Module>;
  attachments: Repo<Attachment>;
  clientLinkOverlays: Repo<Overlay>;
  assignments: Repo<Assignment> & {
    assign(
      ctx: ActorContext,
      input: { moduleId: string; personIds: string[]; dueAt: string },
    ): Promise<{ created: Assignment[]; skipped: { personId: string; reason: string }[] }>;
  };
  learningEvents: Repo<LearningEvent>;
  attempts: Repo<Attempt>;
  notifications: Repo<Notification> & { markRead(ctx: ActorContext, ids: string[]): Promise<void> };
  learning: {
    recordLesson(
      ctx: ActorContext,
      input: { moduleId: string; lessonId: string; kind: 'viewed' | 'completed' },
    ): Promise<unknown>;
    startAttempt(ctx: ActorContext, moduleId: string): Promise<Attempt>;
    answer(
      ctx: ActorContext,
      input: { attemptId: string; questionId: string; optionId?: string; choiceIds?: string[] },
    ): Promise<{ correct: boolean; outcome?: string }>;
    finishAttempt(ctx: ActorContext, attemptId: string): Promise<FinishResult>;
    learnMoreOpened(
      ctx: ActorContext,
      input: { moduleId: string; questionId?: string; lessonId?: string; linkId: string; attemptId?: string },
    ): Promise<unknown>;
  };
};
export type LearningAdmin = DemoAdmin & {
  listStaffUsers(clientId: string): Promise<{ userId: string; displayName: string; personId: string }[]>;
};
export type LearningHandle = {
  store: LearningStore;
  admin: LearningAdmin;
  subscribe(listener: (stores: string[]) => void): () => void;
};

// ---------------------------------------------------------------- fixtures

const link = (id: string, showFor: 'wrong' | 'all' = 'wrong') => ({
  id,
  title: `Guide ${id}`,
  url: `https://www.gov.uk/${id}`,
  publisher: 'GOV.UK',
  kind: 'official' as const,
  language: 'en-GB',
  showFor,
});
const mcq = (qid: string, withLink = false): Question => ({
  id: qid,
  type: 'mcq',
  prompt: `Question ${qid}?`,
  options: [
    { id: `${qid}-yes`, text: 'Right answer', correct: true },
    { id: `${qid}-no`, text: 'Wrong answer', correct: false },
  ],
  explanation: 'Because.',
  learnMore: withLink ? [link('gov-guide')] : [],
  tags: [],
});
export const lessonOf = (lid: string) => ({ id: lid, title: `Lesson ${lid}`, minutes: 3, blocks: [] });

export type LearningFixture = {
  moduleId: string;
  draftId: string;
  retakeId: string;
  attachmentId: string;
  overlayId: string;
  hannahAttemptId: string;
  jadeOldAttemptId: string;
  assignments: { jade: string; lucy: string; oak: string };
  notifications: { jade: string; hannah: string };
  events: { hannah: string; river: string; hillside: string; jadeLogin: string };
  module: Module;
  retakeModule: Module;
};

const QUESTION_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];

/** Adds the learning records the seed does not hold yet. Uses only DemoAdmin.bulkPut. */
export async function addLearningFixture(admin: DemoAdmin, fx: World): Promise<LearningFixture> {
  const u = fx.keys.users;
  const p = fx.keys.personas;
  const a = fx.ids.clients.a;
  const main = fx.ids.sites.main;
  const f = {
    moduleId: freshId(1),
    draftId: freshId(2),
    retakeId: freshId(3),
    attachmentId: freshId(4),
    overlayId: freshId(5),
    hannahAttemptId: freshId(6),
    jadeOldAttemptId: freshId(7),
    assignments: { jade: freshId(10), lucy: freshId(11), oak: freshId(12) },
    notifications: { jade: freshId(20), hannah: freshId(21) },
    events: { hannah: freshId(30), river: freshId(31), hillside: freshId(32), jadeLogin: freshId(33) },
  };
  const module: Module = {
    id: f.moduleId,
    owner: 'provider',
    title: 'Contract test refresher',
    description: 'A short module used only by contract tests',
    estimatedMinutes: 10,
    language: 'en-GB',
    status: 'published',
    version: 2,
    requirementIds: [fx.ids.requirementId],
    roleTags: [],
    lessons: [lessonOf('l-one'), lessonOf('l-two')],
    questions: QUESTION_IDS.map((q) => mcq(q, q === 'q1')),
    quiz: {
      mode: 'mcq',
      drawCount: 4,
      shuffleQuestions: true,
      shuffleOptions: true,
      passMark: 80,
      maxRetakes: null,
      feedback: true,
      showSourceRef: true,
      notesInQuiz: 'choice',
      learnMoreFor: 'all',
    },
  };
  const draft: Module = {
    ...module,
    id: f.draftId,
    title: 'Contract test draft',
    status: 'draft',
    version: 1,
    lessons: [],
    questions: [mcq('d1')],
    quiz: { ...module.quiz, drawCount: 1 },
  };
  const retake: Module = {
    ...module,
    id: f.retakeId,
    title: 'Contract test retakes',
    version: 1,
    lessons: [lessonOf('r-lesson')],
    questions: ['r1', 'r2', 'r3'].map((q) => mcq(q)),
    quiz: { ...module.quiz, drawCount: 2, passMark: 100, maxRetakes: 1, shuffleQuestions: false },
  };
  await admin.bulkPut('modules', [module, draft, retake]);

  await admin.bulkPut('attachments', [
    {
      id: f.attachmentId,
      clientId: a,
      title: 'Our safeguarding policy',
      mime: 'text/markdown',
      body: '# Policy',
      createdAt: TODAY,
    },
  ]);
  await admin.bulkPut('clientLinkOverlays', [
    {
      id: f.overlayId,
      clientId: a,
      moduleId: f.moduleId,
      questionId: 'q2',
      links: [
        {
          id: 'org-policy',
          title: 'Our policy',
          attachmentId: f.attachmentId,
          publisher: 'Little Acorns',
          kind: 'organisation',
          language: 'en-GB',
          showFor: 'wrong',
        },
      ],
      addedBy: u['priya'],
      addedAt: TODAY,
    },
  ]);

  const assignment = (
    id: string,
    clientId: string,
    personId: string,
    moduleId: string,
    status: Assignment['status'],
  ): Assignment => ({
    id,
    clientId,
    personId,
    target: { moduleId },
    dueAt: '2026-11-02T23:59:00.000Z',
    source: 'manual',
    assignedBy: u['priya'],
    createdAt: '2026-10-16T09:00:00.000Z',
    status,
  });
  await admin.bulkPut('assignments', [
    assignment(f.assignments.jade, a, p['jade'], f.moduleId, 'open'),
    assignment(f.assignments.lucy, a, p['lucy'], f.retakeId, 'open'),
    assignment(f.assignments.oak, fx.ids.clients.ot, fx.ids.people.otRiver, f.moduleId, 'open'),
  ]);

  const note = (id: string, userId: string): Notification => ({
    id,
    clientId: a,
    userId,
    kind: 'trainingAssigned',
    params: { moduleTitle: module.title, dueDate: '2026-11-02' },
    createdAt: '2026-10-16T09:00:00.000Z',
  });
  await admin.bulkPut('notifications', [
    note(f.notifications.jade, u['jade']),
    note(f.notifications.hannah, u['hannah']),
  ]);

  const event = (
    id: string,
    clientId: string,
    siteId: string,
    personId: string,
    type: LearningEvent['type'],
  ): LearningEvent => ({
    id,
    clientId,
    siteId,
    personId,
    at: '2026-10-16T10:00:00.000Z',
    type,
    ...(type === 'login' ? {} : { moduleId: f.moduleId, lessonId: 'l-one' }),
  });
  await admin.bulkPut('learningEvents', [
    event(f.events.hannah, a, main, p['hannah'], 'lessonCompleted'),
    event(f.events.river, fx.ids.clients.ot, fx.ids.sites.river, fx.ids.people.otRiver, 'lessonCompleted'),
    event(f.events.hillside, fx.ids.clients.ot, fx.ids.sites.hillside, fx.ids.people.otHillside, 'lessonCompleted'),
    event(f.events.jadeLogin, a, main, p['jade'], 'login'),
  ]);

  const attempt = (
    id: string,
    clientId: string,
    siteId: string,
    personId: string,
    extra: Partial<Attempt>,
  ): Attempt => ({
    id,
    clientId,
    siteId,
    personId,
    moduleId: f.moduleId,
    moduleVersion: 1,
    mode: 'open',
    questionIds: ['q1', 'q2'],
    startedAt: '2026-10-10T09:00:00.000Z',
    ...extra,
  });
  await admin.bulkPut('attempts', [
    attempt(f.hannahAttemptId, a, main, p['hannah'], {}),
    attempt(f.jadeOldAttemptId, a, main, p['jade'], {
      finishedAt: '2026-10-10T09:10:00.000Z',
      score: 50,
      passed: false,
    }),
    attempt(freshId(8), fx.ids.clients.ot, fx.ids.sites.river, fx.ids.people.otRiver, {}),
  ]);
  return { ...f, module, retakeModule: retake };
}

// ---------------------------------------------------------------- helpers

export async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be refused, but it succeeded');
}
export async function ruleOf(promise: Promise<unknown>): Promise<string> {
  const error = await refusal(promise);
  expect(error).toBeInstanceOf(DataError);
  expect((error as DataError).code).toBe('rule');
  return (error as { rule: string }).rule;
}
const errorName = async (promise: Promise<unknown>): Promise<string> => ((await refusal(promise)) as Error).name;
const forbiddenReason = async (promise: Promise<unknown>): Promise<string> => {
  const error = (await refusal(promise)) as DataError & { reason?: string };
  expect(error.code).toBe('forbidden');
  return error.reason ?? '';
};

type Dump = Record<string, unknown[]>;
const snapshot = async (admin: DemoAdmin): Promise<Dump> => await admin.dumpAll();
/** Names of the stores whose contents differ between two dumps. */
export const changedStores = (before: Dump, after: Dump): string[] =>
  Object.keys(after)
    .filter((s) => s !== 'settings' && JSON.stringify(before[s] ?? []) !== JSON.stringify(after[s]))
    .sort();

export async function completeLessons(store: LearningStore, ctx: ActorContext, m: Module): Promise<void> {
  for (const lesson of m.lessons) {
    await store.learning.recordLesson(ctx, { moduleId: m.id, lessonId: lesson.id, kind: 'completed' });
  }
}
export const answerAll = async (
  store: LearningStore,
  ctx: ActorContext,
  attempt: Attempt,
  right: boolean,
): Promise<void> => {
  for (const q of attempt.questionIds) {
    await store.learning.answer(ctx, {
      attemptId: attempt.id,
      questionId: q,
      optionId: `${q}-${right ? 'yes' : 'no'}`,
    });
  }
};

// ---------------------------------------------------------------- the suite

export function runLearningContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = (await makeStore(options)) as unknown as LearningHandle;
    const fx = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    return { store: handle.store, admin: handle.admin, handle, fx, lf, options };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
  const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });
  const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });
  const jade = (s: S) => staff(s.fx.keys.users['jade'], s.fx.ids.clients.a);
  const hannah = (s: S) => staff(s.fx.keys.users['hannah'], s.fx.ids.clients.a);
  const priya = (s: S) => client(s.fx.ids.users.priya, s.fx.ids.clients.a);
  const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();
  const due = dueAtFromLondonDate('2026-11-02');

  describe(`Learning data layer: ${name}`, () => {
    describe('reading the new stores', () => {
      it('gives actors no generic put or remove on the new stores', async () => {
        const { store } = await setup();
        for (const key of [
          'modules',
          'attachments',
          'clientLinkOverlays',
          'assignments',
          'learningEvents',
          'attempts',
          'notifications',
        ] as const) {
          expect(Object.keys(store[key]).sort(), key).not.toContain('put');
          expect(Object.keys(store[key]).sort(), key).not.toContain('remove');
        }
      });

      it('lets staff read only their own assignments, attempts, events and notifications', async () => {
        const s = await setup();
        const ctx = jade(s);
        const jadeId = s.fx.keys.personas['jade'];
        const assignments = await s.store.assignments.list(ctx);
        expect(ids(assignments)).toEqual([s.lf.assignments.jade]);
        const attempts = await s.store.attempts.list(ctx);
        expect(attempts.map((x) => x.id)).toEqual([s.lf.jadeOldAttemptId]);
        const events = await s.store.learningEvents.list(ctx);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.personId === jadeId)).toBe(true);
        expect(ids(await s.store.notifications.list(ctx))).toEqual([s.lf.notifications.jade]);
      });

      it('gives NotFound when staff get a colleague notification, attempt, assignment or event', async () => {
        const s = await setup();
        const ctx = hannah(s);
        expect(await errorName(s.store.notifications.get(ctx, s.lf.notifications.jade))).toBe('NotFoundError');
        expect(await errorName(s.store.attempts.get(ctx, s.lf.jadeOldAttemptId))).toBe('NotFoundError');
        expect(await errorName(s.store.assignments.get(ctx, s.lf.assignments.jade))).toBe('NotFoundError');
        expect(await errorName(s.store.learningEvents.get(ctx, s.lf.events.jadeLogin))).toBe('NotFoundError');
      });

      it('lets a client admin with reports.view read their client events and attempts and none from another client', async () => {
        const s = await setup();
        const events = await s.store.learningEvents.list(priya(s));
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e.clientId === s.fx.ids.clients.a)).toBe(true);
        expect(ids(events)).toContain(s.lf.events.hannah);
        expect(ids(events)).not.toContain(s.lf.events.river);
        const attempts = await s.store.attempts.list(priya(s));
        expect(ids(attempts)).toEqual([s.lf.hannahAttemptId, s.lf.jadeOldAttemptId].sort());
        expect(await errorName(s.store.learningEvents.get(priya(s), s.lf.events.river))).toBe('NotFoundError');
      });

      it('limits a site manager to events for people at their own site', async () => {
        const s = await setup();
        const mgr = client(s.fx.ids.users.riverMgr, s.fx.ids.clients.ot);
        expect(ids(await s.store.learningEvents.list(mgr))).toEqual([s.lf.events.river]);
        const group = client(s.fx.ids.users.gina, s.fx.ids.clients.ot);
        expect(ids(await s.store.learningEvents.list(group))).toEqual([s.lf.events.river, s.lf.events.hillside].sort());
      });

      it('lets a client admin list assignments for their client only', async () => {
        const s = await setup();
        const listed = await s.store.assignments.list(priya(s));
        expect(ids(listed)).toEqual([s.lf.assignments.jade, s.lf.assignments.lucy].sort());
      });

      it('refuses a client user without reports.view or assign.view the learning events and assignments', async () => {
        const s = await setup();
        // Rory's custom role holds staff.view and staff.manage only.
        const rory = client(s.fx.ids.users.rory, s.fx.ids.clients.a);
        expect(await forbiddenReason(s.store.learningEvents.list(rory))).toBe('permission');
        expect(await forbiddenReason(s.store.attempts.list(rory))).toBe('permission');
        expect(await forbiddenReason(s.store.assignments.list(rory))).toBe('permission');
      });

      it('hides organisation overlays and documents from other clients and shows them to the client and its staff', async () => {
        const s = await setup();
        const gina = client(s.fx.ids.users.gina, s.fx.ids.clients.ot);
        expect(await s.store.clientLinkOverlays.list(gina)).toEqual([]);
        expect(await s.store.attachments.list(gina)).toEqual([]);
        expect(await errorName(s.store.attachments.get(gina, s.lf.attachmentId))).toBe('NotFoundError');
        expect(ids(await s.store.clientLinkOverlays.list(priya(s)))).toEqual([s.lf.overlayId]);
        expect((await s.store.attachments.get(jade(s), s.lf.attachmentId)).id).toBe(s.lf.attachmentId);
      });

      it('shows published modules to every known actor and drafts to the provider only', async () => {
        const s = await setup();
        for (const ctx of [jade(s), priya(s), client(s.fx.ids.users.gina, s.fx.ids.clients.ot)]) {
          const listed = ids(await s.store.modules.list(ctx));
          expect(listed).toContain(s.lf.moduleId);
          expect(listed).not.toContain(s.lf.draftId);
        }
        const owner = provider(s.fx.ids.users.provOwner);
        expect(ids(await s.store.modules.list(owner))).toEqual(expect.arrayContaining([s.lf.moduleId, s.lf.draftId]));
        expect(await errorName(s.store.modules.get(jade(s), s.lf.draftId))).toBe('NotFoundError');
      });

      it('refuses the provider the learning events, attempts and assignments', async () => {
        const s = await setup();
        const owner = provider(s.fx.ids.users.provOwner);
        expect(await forbiddenReason(s.store.learningEvents.list(owner))).toBe('permission');
        expect(await forbiddenReason(s.store.attempts.list(owner))).toBe('permission');
        expect(await forbiddenReason(s.store.assignments.list(owner))).toBe('permission');
      });

      it('lets every side read only their own notifications', async () => {
        const s = await setup();
        expect(await s.store.notifications.list(priya(s))).toEqual([]);
        expect(await s.store.notifications.list(provider(s.fx.ids.users.provOwner))).toEqual([]);
        expect(await errorName(s.store.notifications.get(priya(s), s.lf.notifications.jade))).toBe('NotFoundError');
      });
    });

    describe('startAttempt', () => {
      it('refuses the quiz until every lesson is completed, and viewing a lesson does not count', async () => {
        const s = await setup();
        expect(await ruleOf(s.store.learning.startAttempt(jade(s), s.lf.moduleId))).toBe('lessonsIncomplete');
        for (const lesson of s.lf.module.lessons) {
          await s.store.learning.recordLesson(jade(s), {
            moduleId: s.lf.moduleId,
            lessonId: lesson.id,
            kind: 'viewed',
          });
        }
        expect(await ruleOf(s.store.learning.startAttempt(jade(s), s.lf.moduleId))).toBe('lessonsIncomplete');
        await s.store.learning.recordLesson(jade(s), { moduleId: s.lf.moduleId, lessonId: 'l-one', kind: 'completed' });
        expect(await ruleOf(s.store.learning.startAttempt(jade(s), s.lf.moduleId))).toBe('lessonsIncomplete');
        await s.store.learning.recordLesson(jade(s), { moduleId: s.lf.moduleId, lessonId: 'l-two', kind: 'completed' });
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        expect(attempt.moduleId).toBe(s.lf.moduleId);
      });

      it('records lesson events with the person, site, client and time from the context', async () => {
        const s = await setup();
        await s.store.learning.recordLesson(jade(s), { moduleId: s.lf.moduleId, lessonId: 'l-one', kind: 'completed' });
        const events = (await s.store.learningEvents.list(jade(s))).filter((e) => e.type === 'lessonCompleted');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          clientId: s.fx.ids.clients.a,
          siteId: s.fx.ids.sites.main,
          personId: s.fx.keys.personas['jade'],
          moduleId: s.lf.moduleId,
          lessonId: 'l-one',
          at: TODAY,
        });
      });

      it('refuses a lesson that is not in the module', async () => {
        const s = await setup();
        const before = await snapshot(s.admin);
        const error = (await refusal(
          s.store.learning.recordLesson(jade(s), { moduleId: s.lf.moduleId, lessonId: 'no-such', kind: 'completed' }),
        )) as DataError;
        expect(['validation', 'notFound']).toContain(error.code);
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('draws distinct questions from the bank following the quiz settings and records the attempt', async () => {
        const s = await setup();
        await completeLessons(s.store, jade(s), s.lf.module);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        expect(attempt).toMatchObject({
          clientId: s.fx.ids.clients.a,
          siteId: s.fx.ids.sites.main,
          personId: s.fx.keys.personas['jade'],
          moduleId: s.lf.moduleId,
          moduleVersion: 2,
          mode: 'open',
          startedAt: TODAY,
        });
        expect(attempt.finishedAt).toBeUndefined();
        expect(attempt.questionIds).toHaveLength(4);
        expect(new Set(attempt.questionIds).size).toBe(4);
        expect(attempt.questionIds.every((q) => QUESTION_IDS.includes(q))).toBe(true);
        expect(Object.keys(attempt.optionOrder ?? {}).sort()).toEqual([...attempt.questionIds].sort());
        const stored = await s.store.attempts.get(jade(s), attempt.id);
        expect(stored).toEqual(attempt);
        const started = (await s.store.learningEvents.list(jade(s))).filter((e) => e.type === 'attemptStarted');
        expect(started).toHaveLength(1);
        expect(started[0]).toMatchObject({ attemptId: attempt.id, moduleId: s.lf.moduleId, moduleVersion: 2 });
      });

      it('gives the same draw twice when the seeded RNG and the calls are the same, and uses the domain draw rules', async () => {
        const run = async () => {
          const s = await setup();
          await completeLessons(s.store, jade(s), s.lf.module);
          return { s, attempt: await s.store.learning.startAttempt(jade(s), s.lf.moduleId) };
        };
        const first = await run();
        const second = await run();
        expect(second.attempt.questionIds).toEqual(first.attempt.questionIds);
        expect(second.attempt.optionOrder).toEqual(first.attempt.optionOrder);
        expect(second.attempt.id).toBe(first.attempt.id);
        // A draw from the domain engine with any generator has the same shape (count and members).
        const reference = drawQuestions(first.s.lf.module, createRng(1));
        expect(first.attempt.questionIds).toHaveLength(reference.questionIds.length);
      });

      it('resumes an unfinished attempt for the same module and version without writing anything', async () => {
        const s = await setup();
        await completeLessons(s.store, jade(s), s.lf.module);
        const first = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        const before = await snapshot(s.admin);
        const again = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        expect(again).toEqual(first);
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('refuses an unpublished module', async () => {
        const s = await setup();
        expect(await ruleOf(s.store.learning.startAttempt(jade(s), s.lf.draftId))).toBe('moduleNotPublished');
      });

      it('stops a third attempt when the module allows one retake', async () => {
        const s = await setup();
        const ctx = jade(s);
        const m = s.lf.retakeModule;
        await completeLessons(s.store, ctx, m);
        for (let i = 0; i < 2; i++) {
          const attempt = await s.store.learning.startAttempt(ctx, m.id);
          await answerAll(s.store, ctx, attempt, false);
          const result = await s.store.learning.finishAttempt(ctx, attempt.id);
          expect(result.passed).toBe(false);
        }
        expect(await ruleOf(s.store.learning.startAttempt(ctx, m.id))).toBe('noRetakesLeft');
      });

      it('lets a new attempt start after a failed one when retakes are unlimited', async () => {
        const s = await setup();
        await completeLessons(s.store, jade(s), s.lf.module);
        const first = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        await answerAll(s.store, jade(s), first, false);
        await s.store.learning.finishAttempt(jade(s), first.id);
        const second = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        expect(second.id).not.toBe(first.id);
      });
    });

    describe('answer', () => {
      async function started(s: S) {
        await completeLessons(s.store, jade(s), s.lf.module);
        return s.store.learning.startAttempt(jade(s), s.lf.moduleId);
      }

      it('computes correctness from the stored module and writes a questionAnswered event', async () => {
        const s = await setup();
        const attempt = await started(s);
        const [q1, q2] = attempt.questionIds as [string, string];
        expect(
          await s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q1, optionId: `${q1}-yes` }),
        ).toMatchObject({
          correct: true,
        });
        expect(
          await s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q2, optionId: `${q2}-no` }),
        ).toMatchObject({
          correct: false,
        });
        const answered = (await s.store.learningEvents.list(jade(s))).filter((e) => e.type === 'questionAnswered');
        expect(answered.map((e) => [e.questionId, e.correct, e.optionId, e.attemptId])).toEqual(
          expect.arrayContaining([
            [q1, true, `${q1}-yes`, attempt.id],
            [q2, false, `${q2}-no`, attempt.id],
          ]),
        );
      });

      it('refuses a question that was not drawn', async () => {
        const s = await setup();
        const attempt = await started(s);
        const notDrawn = QUESTION_IDS.find((q) => !attempt.questionIds.includes(q))!;
        const before = await snapshot(s.admin);
        expect(
          await ruleOf(
            s.store.learning.answer(jade(s), {
              attemptId: attempt.id,
              questionId: notDrawn,
              optionId: `${notDrawn}-yes`,
            }),
          ),
        ).toBe('notInAttempt');
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('refuses answering the same question twice and keeps the first answer', async () => {
        const s = await setup();
        const attempt = await started(s);
        const q = attempt.questionIds[0]!;
        await s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q, optionId: `${q}-no` });
        expect(
          await ruleOf(
            s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q, optionId: `${q}-yes` }),
          ),
        ).toBe('alreadyAnswered');
        const events = (await s.store.learningEvents.list(jade(s))).filter(
          (e) => e.type === 'questionAnswered' && e.questionId === q,
        );
        expect(events).toHaveLength(1);
        expect(events[0]!.correct).toBe(false);
      });

      it('refuses an option that is not in the question', async () => {
        const s = await setup();
        const attempt = await started(s);
        const q = attempt.questionIds[0]!;
        expect(
          await ruleOf(
            s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q, optionId: 'nonsense' }),
          ),
        ).toBe('invalidAnswer');
      });

      it('gives NotFound when another person uses the attempt', async () => {
        const s = await setup();
        const attempt = await started(s);
        const q = attempt.questionIds[0]!;
        expect(
          await errorName(
            s.store.learning.answer(hannah(s), { attemptId: attempt.id, questionId: q, optionId: `${q}-yes` }),
          ),
        ).toBe('NotFoundError');
        expect(await errorName(s.store.learning.finishAttempt(hannah(s), attempt.id))).toBe('NotFoundError');
      });

      it('refuses an answer after the attempt is finished', async () => {
        const s = await setup();
        const attempt = await started(s);
        await answerAll(s.store, jade(s), attempt, true);
        await s.store.learning.finishAttempt(jade(s), attempt.id);
        const q = attempt.questionIds[0]!;
        expect(
          await ruleOf(
            s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q, optionId: `${q}-yes` }),
          ),
        ).toBe('attemptFinished');
      });
    });

    describe('finishAttempt', () => {
      async function started(s: S) {
        await completeLessons(s.store, jade(s), s.lf.module);
        return s.store.learning.startAttempt(jade(s), s.lf.moduleId);
      }

      it('refuses to finish while questions are unanswered and writes nothing', async () => {
        const s = await setup();
        const attempt = await started(s);
        const q = attempt.questionIds[0]!;
        await s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q, optionId: `${q}-yes` });
        const before = await snapshot(s.admin);
        expect(await ruleOf(s.store.learning.finishAttempt(jade(s), attempt.id))).toBe('notAllAnswered');
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('on a pass writes Evidence with the module version and site at the time, and marks the assignment done', async () => {
        const s = await setup();
        const attempt = await started(s);
        await answerAll(s.store, jade(s), attempt, true);
        const result = await s.store.learning.finishAttempt(jade(s), attempt.id);
        expect(result).toMatchObject({ passed: true, score: 100, missedQuestionIds: [] });
        expect(result.evidence).toHaveLength(1);
        const [ev] = result.evidence as [Evidence];
        expect(ev).toMatchObject({
          clientId: s.fx.ids.clients.a,
          personId: s.fx.keys.personas['jade'],
          requirementId: s.fx.ids.requirementId,
          kind: 'module',
          moduleId: s.lf.moduleId,
          moduleVersion: 2,
          language: 'en-GB',
          siteIdAtTime: s.fx.ids.sites.main,
          completedAt: TODAY,
        });
        expect(ev.expiresAt).toBeDefined();
        expect(await s.store.evidence.get(jade(s), ev.id)).toEqual(ev);
        const stored = await s.store.attempts.get(jade(s), attempt.id);
        expect(stored).toMatchObject({ finishedAt: TODAY, score: 100, passed: true });
        expect((await s.store.assignments.get(jade(s), s.lf.assignments.jade)).status).toBe('done');
      });

      it('records the evidence site as it was at the time, even if the person later moves', async () => {
        const s = await setup();
        const attempt = await started(s);
        await answerAll(s.store, jade(s), attempt, true);
        const { evidence } = await s.store.learning.finishAttempt(jade(s), attempt.id);
        const person = (await s.store.people.list(priya(s))).find((x) => x.id === s.fx.keys.personas['jade'])!;
        await s.store.people.put(priya(s), { ...person, primarySiteId: s.fx.ids.sites.annexe });
        expect((await s.store.evidence.get(priya(s), evidence[0]!.id)).siteIdAtTime).toBe(s.fx.ids.sites.main);
      });

      it('appends attemptFinished and moduleCompleted events and one slim audit event without a person id', async () => {
        const s = await setup();
        const attempt = await started(s);
        await answerAll(s.store, jade(s), attempt, true);
        const result = await s.store.learning.finishAttempt(jade(s), attempt.id);
        const events = (await s.store.learningEvents.list(jade(s))).filter(
          (e) => e.attemptId === attempt.id || e.type === 'moduleCompleted',
        );
        expect(events.filter((e) => e.type === 'attemptFinished')).toHaveLength(1);
        expect(events.filter((e) => e.type === 'moduleCompleted')).toHaveLength(1);
        const dump = await snapshot(s.admin);
        const audit = (
          dump['audit'] as { action: string; actorId: string; clientId?: string; after?: unknown }[]
        ).filter((e) => e.action === 'evidence.moduleCompleted');
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ actorId: s.fx.keys.users['jade'], clientId: s.fx.ids.clients.a });
        expect(audit[0]!.after).toEqual({
          attemptId: attempt.id,
          evidenceIds: [result.evidence[0]!.id],
          moduleId: s.lf.moduleId,
          moduleVersion: 2,
        });
        expect(JSON.stringify(audit[0])).not.toContain(s.fx.keys.personas['jade']);
      });

      it('refuses finishing twice', async () => {
        const s = await setup();
        const attempt = await started(s);
        await answerAll(s.store, jade(s), attempt, true);
        await s.store.learning.finishAttempt(jade(s), attempt.id);
        const before = await snapshot(s.admin);
        expect(await ruleOf(s.store.learning.finishAttempt(jade(s), attempt.id))).toBe('attemptFinished');
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('on a fail writes only the attempt and its attemptFinished event', async () => {
        const s = await setup();
        const attempt = await started(s);
        await answerAll(s.store, jade(s), attempt, false);
        const before = await snapshot(s.admin);
        const result = await s.store.learning.finishAttempt(jade(s), attempt.id);
        expect(result).toMatchObject({ passed: false, score: 0, evidence: [] });
        expect([...result.missedQuestionIds].sort()).toEqual([...attempt.questionIds].sort());
        const after = await snapshot(s.admin);
        expect(changedStores(before, after)).toEqual(['attempts', 'learningEvents']);
        const newEvents = (after['learningEvents'] as LearningEvent[]).filter(
          (e) => !(before['learningEvents'] as LearningEvent[]).some((b) => b.id === e.id),
        );
        expect(newEvents.map((e) => e.type)).toEqual(['attemptFinished']);
        expect((await s.store.assignments.get(jade(s), s.lf.assignments.jade)).status).toBe('open');
        expect(await s.store.attempts.get(jade(s), attempt.id)).toMatchObject({ passed: false, score: 0 });
      });

      it('scores a mixed attempt as the rounded-down percentage and applies the pass mark', async () => {
        const s = await setup();
        const attempt = await started(s);
        // 3 of 4 right is 75, below the 80 pass mark.
        const [wrong, ...rest] = attempt.questionIds as [string, ...string[]];
        await s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: wrong, optionId: `${wrong}-no` });
        for (const q of rest)
          await s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q, optionId: `${q}-yes` });
        const result = await s.store.learning.finishAttempt(jade(s), attempt.id);
        expect(result).toMatchObject({ score: 75, passed: false, missedQuestionIds: [wrong], evidence: [] });
      });
    });

    describe('who may call learning', () => {
      it('refuses client admins and the provider', async () => {
        const s = await setup();
        expect(await forbiddenReason(s.store.learning.startAttempt(priya(s), s.lf.moduleId))).toBe('permission');
        expect(
          await forbiddenReason(
            s.store.learning.recordLesson(priya(s), { moduleId: s.lf.moduleId, lessonId: 'l-one', kind: 'completed' }),
          ),
        ).toBe('permission');
        expect(
          await forbiddenReason(s.store.learning.startAttempt(provider(s.fx.ids.users.provOwner), s.lf.moduleId)),
        ).toBe('permission');
      });

      it('refuses staff of a Closed client with an account state error', async () => {
        const s = await setup();
        const closed = s.fx.ids.stateClients.closed;
        const ctx = staff(closed.staff.id, closed.client.id);
        expect(await errorName(s.store.learning.startAttempt(ctx, s.lf.moduleId))).toBe('AccountStateError');
      });
    });

    describe('recordLearnMoreOpened', () => {
      const opened = async (s: S, input: Parameters<LearningStore['learning']['learnMoreOpened']>[1]) => {
        const before = await snapshot(s.admin);
        await s.store.learning.learnMoreOpened(jade(s), input);
        const after = await snapshot(s.admin);
        expect(changedStores(before, after)).toEqual(['learningEvents']);
        expect(after['learningEvents']!.length).toBe(before['learningEvents']!.length + 1);
        return (after['learningEvents'] as LearningEvent[]).find(
          (e) => !(before['learningEvents'] as LearningEvent[]).some((b) => b.id === e.id),
        )!;
      };

      it('writes exactly one event and nothing else for a link on the question', async () => {
        const s = await setup();
        const event = await opened(s, { moduleId: s.lf.moduleId, questionId: 'q1', linkId: 'gov-guide' });
        expect(event).toMatchObject({
          type: 'learnMoreOpened',
          moduleId: s.lf.moduleId,
          questionId: 'q1',
          linkId: 'gov-guide',
          personId: s.fx.keys.personas['jade'],
          clientId: s.fx.ids.clients.a,
          at: TODAY,
        });
      });

      it('writes exactly one event and nothing else for a link from the client overlay', async () => {
        const s = await setup();
        const event = await opened(s, { moduleId: s.lf.moduleId, questionId: 'q2', linkId: 'org-policy' });
        expect(event.linkId).toBe('org-policy');
      });

      it('refuses a link that is not on the question or in an overlay for it, and writes nothing', async () => {
        const s = await setup();
        const before = await snapshot(s.admin);
        expect(
          await errorName(
            s.store.learning.learnMoreOpened(jade(s), { moduleId: s.lf.moduleId, questionId: 'q1', linkId: 'made-up' }),
          ),
        ).toBe('ValidationError');
        // The overlay link belongs to q2, not q1.
        expect(
          await errorName(
            s.store.learning.learnMoreOpened(jade(s), {
              moduleId: s.lf.moduleId,
              questionId: 'q1',
              linkId: 'org-policy',
            }),
          ),
        ).toBe('ValidationError');
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });
    });

    describe('assignments.assign', () => {
      const lucy = (s: S) => s.fx.keys.personas['lucy'];
      const hannahP = (s: S) => s.fx.keys.personas['hannah'];
      const chris = (s: S) => s.fx.keys.personas['chris'];

      it('creates an assignment and a notification for each person and one audit event, in the due day end', async () => {
        const s = await setup();
        const people = [lucy(s), hannahP(s), chris(s)];
        const result = await s.store.assignments.assign(priya(s), {
          moduleId: s.lf.moduleId,
          personIds: people,
          dueAt: due,
        });
        expect(result.skipped).toEqual([]);
        expect(result.created.map((a) => a.personId).sort()).toEqual([...people].sort());
        for (const a of result.created) {
          expect(a).toMatchObject({
            clientId: s.fx.ids.clients.a,
            target: { moduleId: s.lf.moduleId },
            dueAt: due,
            source: 'manual',
            assignedBy: s.fx.ids.users.priya,
            createdAt: TODAY,
            status: 'open',
          });
          expect((await s.store.assignments.get(priya(s), a.id)).id).toBe(a.id);
        }
        const dump = await snapshot(s.admin);
        const fresh = (dump['notifications'] as Notification[]).filter(
          (n) => n.id !== s.lf.notifications.jade && n.id !== s.lf.notifications.hannah,
        );
        expect(fresh.map((n) => n.userId).sort()).toEqual(
          [s.fx.keys.users['lucy'], s.fx.keys.users['hannah'], s.fx.keys.users['chris']].sort(),
        );
        for (const n of fresh) {
          expect(n).toMatchObject({
            clientId: s.fx.ids.clients.a,
            kind: 'trainingAssigned',
            params: { moduleTitle: s.lf.module.title },
            createdAt: TODAY,
          });
          expect(n.readAt).toBeUndefined();
        }
        const audit = (dump['audit'] as { action: string; after?: unknown }[]).filter(
          (e) => e.action === 'assignments.created',
        );
        expect(audit).toHaveLength(1);
        expect(audit[0]!.after).toEqual({ moduleId: s.lf.moduleId, count: 3 });
      });

      it('lets a staff member see their new assignment and notification', async () => {
        const s = await setup();
        await s.store.assignments.assign(priya(s), { moduleId: s.lf.moduleId, personIds: [hannahP(s)], dueAt: due });
        expect(await s.store.assignments.list(hannah(s))).toHaveLength(1);
        expect((await s.store.notifications.list(hannah(s))).length).toBe(2);
      });

      it('skips a person who already has an open assignment for the module and reports them', async () => {
        const s = await setup();
        const jadeP = s.fx.keys.personas['jade'];
        const result = await s.store.assignments.assign(priya(s), {
          moduleId: s.lf.moduleId,
          personIds: [jadeP, lucy(s)],
          dueAt: due,
        });
        expect(result.created.map((a) => a.personId)).toEqual([lucy(s)]);
        expect(result.skipped).toEqual([expect.objectContaining({ personId: jadeP })]);
        expect(await s.store.assignments.list(jade(s))).toHaveLength(1);
        expect(await s.store.notifications.list(jade(s))).toHaveLength(1);
      });

      it('writes nothing when one chosen person belongs to another client', async () => {
        const s = await setup();
        const before = await snapshot(s.admin);
        const error = (await refusal(
          s.store.assignments.assign(priya(s), {
            moduleId: s.lf.moduleId,
            personIds: [lucy(s), s.fx.ids.people.otRiver],
            dueAt: due,
          }),
        )) as DataError;
        expect(['notFound', 'forbidden']).toContain(error.code);
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('writes nothing when one chosen person is archived', async () => {
        const s = await setup();
        const archived = freshId(500);
        const person = (await s.store.people.list(priya(s))).find((x) => x.id === lucy(s))!;
        await s.admin.bulkPut('people', [
          { ...person, id: archived, firstName: 'Gone', status: 'archived', leftDate: '2026-09-01T09:00:00.000Z' },
        ]);
        const before = await snapshot(s.admin);
        expect(
          await ruleOf(
            s.store.assignments.assign(priya(s), {
              moduleId: s.lf.moduleId,
              personIds: [lucy(s), archived],
              dueAt: due,
            }),
          ),
        ).toBe('invalidPeople');
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('refuses a due date before today but accepts the end of today', async () => {
        const s = await setup();
        expect(
          await ruleOf(
            s.store.assignments.assign(priya(s), {
              moduleId: s.lf.moduleId,
              personIds: [lucy(s)],
              dueAt: dueAtFromLondonDate('2026-10-18'),
            }),
          ),
        ).toBe('dueInPast');
        const ok = await s.store.assignments.assign(priya(s), {
          moduleId: s.lf.moduleId,
          personIds: [lucy(s)],
          dueAt: dueAtFromLondonDate('2026-10-19'),
        });
        expect(ok.created).toHaveLength(1);
      });

      it('refuses more than 500 people in one action', async () => {
        const s = await setup();
        const many = Array.from({ length: 501 }, (_, i) => freshId(1000 + i));
        const before = await snapshot(s.admin);
        expect(
          await ruleOf(s.store.assignments.assign(priya(s), { moduleId: s.lf.moduleId, personIds: many, dueAt: due })),
        ).toBe('tooMany');
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('refuses a module that is not published', async () => {
        const s = await setup();
        expect(
          await ruleOf(
            s.store.assignments.assign(priya(s), { moduleId: s.lf.draftId, personIds: [lucy(s)], dueAt: due }),
          ),
        ).toBe('moduleNotPublished');
      });

      it('lets a supervisor assign inside their site and refuses people outside it, writing nothing', async () => {
        const s = await setup();
        const daniel = client(s.fx.ids.users.daniel, s.fx.ids.clients.a);
        const ok = await s.store.assignments.assign(daniel, {
          moduleId: s.lf.moduleId,
          personIds: [lucy(s)],
          dueAt: due,
        });
        expect(ok.created).toHaveLength(1);
        const before = await snapshot(s.admin);
        const error = (await refusal(
          s.store.assignments.assign(daniel, {
            moduleId: s.lf.moduleId,
            personIds: [hannahP(s), s.fx.ids.people.mia],
            dueAt: due,
          }),
        )) as DataError;
        expect(error.code).toBe('forbidden');
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });

      it('refuses a user without assign.manage and refuses staff', async () => {
        const s = await setup();
        const rory = client(s.fx.ids.users.rory, s.fx.ids.clients.a);
        expect(
          await forbiddenReason(
            s.store.assignments.assign(rory, { moduleId: s.lf.moduleId, personIds: [lucy(s)], dueAt: due }),
          ),
        ).toBe('permission');
        expect(
          await forbiddenReason(
            s.store.assignments.assign(jade(s), { moduleId: s.lf.moduleId, personIds: [lucy(s)], dueAt: due }),
          ),
        ).toBe('permission');
      });

      it('refuses a Read-only account with an account state error while reads still work', async () => {
        const s = await setup();
        const ro = s.fx.ids.stateClients.readOnly;
        const ctx = client(ro.owner.id, ro.client.id);
        expect(
          await errorName(
            s.store.assignments.assign(ctx, { moduleId: s.lf.moduleId, personIds: [ro.staffPerson.id], dueAt: due }),
          ),
        ).toBe('AccountStateError');
        expect(await s.store.assignments.list(ctx)).toEqual([]);
        expect(await s.store.learningEvents.list(ctx)).toEqual([]);
      });
    });

    describe('notifications.markRead', () => {
      it('sets readAt on the actor own notifications', async () => {
        const s = await setup();
        await s.store.notifications.markRead(jade(s), [s.lf.notifications.jade]);
        expect((await s.store.notifications.get(jade(s), s.lf.notifications.jade)).readAt).toBe(TODAY);
      });

      it('gives NotFound for someone else notification and changes nothing, even in a mixed list', async () => {
        const s = await setup();
        const before = await snapshot(s.admin);
        expect(
          await errorName(
            s.store.notifications.markRead(hannah(s), [s.lf.notifications.hannah, s.lf.notifications.jade]),
          ),
        ).toBe('NotFoundError');
        expect(changedStores(before, await snapshot(s.admin))).toEqual([]);
      });
    });

    describe('archiving a person', () => {
      it('cancels their open assignments in the same write and keeps their evidence readable', async () => {
        const s = await setup();
        const lucyId = s.fx.keys.personas['lucy'];
        const person = (await s.store.people.list(priya(s))).find((x) => x.id === lucyId)!;
        const evidenceBefore = await s.store.evidence.list(priya(s), { personId: lucyId });
        expect(evidenceBefore.length).toBeGreaterThan(0);
        await s.store.people.put(priya(s), { ...person, status: 'archived', leftDate: TODAY });
        expect((await s.store.assignments.get(priya(s), s.lf.assignments.lucy)).status).toBe('cancelled');
        expect((await s.store.assignments.get(priya(s), s.lf.assignments.jade)).status).toBe('open');
        expect(await s.store.evidence.list(priya(s), { personId: lucyId })).toEqual(evidenceBefore);
      });
    });

    describe('change notices', () => {
      it('tells subscribers which stores changed after a successful assign, and nothing after a failed one', async () => {
        const s = await setup();
        const calls: string[][] = [];
        const stop = s.handle.subscribe((stores) => calls.push([...stores]));
        const lucy = s.fx.keys.personas['lucy'];
        await s.store.assignments.assign(priya(s), { moduleId: s.lf.moduleId, personIds: [lucy], dueAt: due });
        expect(calls).toHaveLength(1);
        expect(new Set(calls[0])).toEqual(new Set(['assignments', 'notifications', 'audit']));
        await refusal(
          s.store.assignments.assign(priya(s), {
            moduleId: s.lf.moduleId,
            personIds: [lucy],
            dueAt: dueAtFromLondonDate('2026-10-01'),
          }),
        );
        expect(calls).toHaveLength(1);
        stop();
        await s.store.learning.recordLesson(jade(s), { moduleId: s.lf.moduleId, lessonId: 'l-one', kind: 'completed' });
        expect(calls).toHaveLength(1);
      });

      it('sends a notice for learning writes naming the learning events store', async () => {
        const s = await setup();
        const calls: string[][] = [];
        s.handle.subscribe((stores) => calls.push([...stores]));
        await s.store.learning.recordLesson(jade(s), { moduleId: s.lf.moduleId, lessonId: 'l-one', kind: 'completed' });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('learningEvents');
      });

      it('sends a notice for an ordinary put', async () => {
        const s = await setup();
        const calls: string[][] = [];
        s.handle.subscribe((stores) => calls.push([...stores]));
        const person = (await s.store.people.list(priya(s))).find((x) => x.id === s.fx.keys.personas['jade'])!;
        await s.store.people.put(priya(s), { ...person, lastName: 'Mills-Test' });
        expect(calls.flat()).toContain('people');
      });
    });

    describe('DemoAdmin.listStaffUsers', () => {
      it('lists the active staff users of one client, sorted by display name, with their person ids', async () => {
        const s = await setup();
        const a = s.fx.ids.clients.a;
        // A suspended staff user must not be listed.
        const jadeUser = s.fx.data.users.find((x) => x.id === s.fx.keys.users['jade'])!;
        const suspended: UserAccount = {
          ...jadeUser,
          id: freshId(600),
          email: 'suspended.staff@example.test',
          displayName: 'Aaron Suspended',
          status: 'suspended',
        };
        await s.admin.bulkPut('users', [suspended]);
        const listed = await s.admin.listStaffUsers(a);
        const expected = s.fx.data.users
          .filter((x) => x.clientId === a && x.side === 'staff' && x.status === 'active')
          .map((x) => ({ userId: x.id, displayName: x.displayName, personId: x.personId! }))
          .sort((x, y) => (x.displayName < y.displayName ? -1 : 1));
        expect(listed.length).toBeGreaterThan(5);
        expect(listed).toEqual(expected);
        expect(listed.map((x) => x.userId)).toContain(s.fx.keys.users['jade']);
        expect(listed.map((x) => x.userId)).not.toContain(s.fx.ids.users.priya);
        expect(listed.map((x) => x.userId)).not.toContain(suspended.id);
      });

      it('lists nobody from another client', async () => {
        const s = await setup();
        const listed = await s.admin.listStaffUsers(s.fx.ids.clients.ot);
        const mine = new Set(s.fx.data.users.filter((x) => x.clientId === s.fx.ids.clients.a).map((x) => x.id));
        expect(listed.every((x) => !mine.has(x.userId))).toBe(true);
      });
    });

    describe('evidence stays write-protected', () => {
      it('still refuses a direct evidence put from staff and from a client admin', async () => {
        const s = await setup();
        const attempt = await (async () => {
          await completeLessons(s.store, jade(s), s.lf.module);
          return s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        })();
        await answerAll(s.store, jade(s), attempt, true);
        const { evidence } = await s.store.learning.finishAttempt(jade(s), attempt.id);
        const forged = { ...evidence[0]!, id: freshId(700) };
        expect(await forbiddenReason(s.store.evidence.put(jade(s), forged))).toBe('permission');
        expect(await forbiddenReason(s.store.evidence.put(priya(s), forged))).toBe('permission');
      });
    });
  });
}

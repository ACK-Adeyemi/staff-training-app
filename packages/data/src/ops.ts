// Operations that write learning records. Each one authorises, applies the domain rules and then writes in ONE
// batch (plan Assumptions 14 and 15), so a failure leaves nothing behind. Business rules live in @sta/domain.
import {
  InvalidAnswerError,
  addMonths,
  checkAnswer,
  drawQuestions,
  isDueInPast,
  learningEventSchema,
  londonDateString,
  planAssignment,
  requirementApplies,
  scoreAttempt,
  type Answer,
  type Assignment,
  type Attempt,
  type ClientLinkOverlay,
  type Evidence,
  type LearnMoreLink,
  type LearningEvent,
  type Module,
  type Notification,
  type Person,
  type Requirement,
  type Site,
  type UserAccount,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, canAny, checkAccountState, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type DataStore,
  type FinishResult,
  type StoreOptions,
} from './types';

export type Operations = {
  learning: DataStore['learning'];
  assign: DataStore['assignments']['assign'];
  markRead: DataStore['notifications']['markRead'];
};

const MAX_PEOPLE_PER_ASSIGN = 500;

const put = (store: WriteOp['store'], record: { id: string }): WriteOp => ({
  type: 'put',
  store,
  key: record.id,
  record,
});

/** A staff actor and the person they are. Anyone else is refused. */
async function staffCall(
  backend: RawBackend,
  options: StoreOptions,
  ctx: ActorContext,
): Promise<{ call: Call; person: Person }> {
  const call = await beginCall(backend, options, ctx);
  if (call.side !== 'staff') return forbid('permission');
  const personId = call.actor.user.personId;
  const person = personId ? await call.find<Person>('people', personId) : undefined;
  if (!person || person.clientId !== call.clientId) return forbid('permission');
  return { call, person };
}

/** A module the actor may use: provider modules, or their own client's. Drafts are the caller's business. */
async function moduleFor(call: Call, moduleId: string): Promise<Module> {
  const m = await call.find<Module>('modules', moduleId);
  if (!m || (m.owner !== 'provider' && m.owner.clientId !== call.clientId)) throw new NotFoundError();
  return m;
}

async function ownAttempt(call: Call, person: Person, attemptId: string): Promise<Attempt> {
  const attempt = await call.find<Attempt>('attempts', attemptId);
  if (!attempt || attempt.personId !== person.id || attempt.clientId !== person.clientId) throw new NotFoundError();
  return attempt;
}

function eventFor(
  call: Call,
  person: Person,
  type: LearningEvent['type'],
  extra: Partial<LearningEvent>,
): LearningEvent {
  return learningEventSchema.parse({
    id: call.newId(),
    clientId: person.clientId,
    siteId: person.primarySiteId,
    personId: person.id,
    at: call.actor.ctx.now,
    type,
    ...extra,
  });
}

const doneCopy = (a: Assignment): Assignment => ({ ...a, status: 'done' });
const readCopy = (n: Notification, readAt: string): Notification => ({ ...n, readAt });

const answerOf = (input: { optionId?: string; choiceIds?: string[] }): Answer => {
  if (input.choiceIds !== undefined) return { choiceIds: input.choiceIds };
  if (input.optionId !== undefined) return { optionId: input.optionId };
  throw new RuleError('invalidAnswer');
};

const personEvents = async (call: Call, person: Person): Promise<LearningEvent[]> =>
  (await call.all<LearningEvent>('learningEvents')).filter((e) => e.personId === person.id);

export function createOperations(backend: RawBackend, options: StoreOptions): Operations {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);

  return {
    learning: {
      async recordLesson(ctx, input) {
        const { call, person } = await staffCall(backend, options, ctx);
        const module = await moduleFor(call, input.moduleId);
        if (module.status !== 'published') throw new RuleError('moduleNotPublished');
        if (!module.lessons.some((l) => l.id === input.lessonId)) {
          throw new ValidationError([`lessonId: ${input.lessonId} is not in this module`]);
        }
        const event = eventFor(call, person, input.kind === 'completed' ? 'lessonCompleted' : 'lessonViewed', {
          moduleId: module.id,
          moduleVersion: module.version,
          lessonId: input.lessonId,
        });
        await apply([put('learningEvents', event)]);
        return event;
      },

      async startAttempt(ctx, moduleId) {
        const { call, person } = await staffCall(backend, options, ctx);
        const module = await moduleFor(call, moduleId);
        if (module.status !== 'published') throw new RuleError('moduleNotPublished');
        const events = await personEvents(call, person);
        const done = new Set(
          events.filter((e) => e.type === 'lessonCompleted' && e.moduleId === module.id).map((e) => e.lessonId),
        );
        if (!module.lessons.every((l) => done.has(l.id))) throw new RuleError('lessonsIncomplete');

        const mine = (await call.all<Attempt>('attempts')).filter(
          (a) => a.personId === person.id && a.moduleId === module.id && a.moduleVersion === module.version,
        );
        const unfinished = mine.find((a) => a.finishedAt === undefined);
        if (unfinished) return unfinished;
        const { maxRetakes } = module.quiz;
        if (maxRetakes !== null && mine.length >= maxRetakes + 1) throw new RuleError('noRetakesLeft');

        const id = call.newId();
        const draw = drawQuestions(module, options.rng.fork(id));
        const attempt: Attempt = {
          id,
          clientId: person.clientId,
          siteId: person.primarySiteId,
          personId: person.id,
          moduleId: module.id,
          moduleVersion: module.version,
          mode: 'open',
          questionIds: draw.questionIds,
          ...(Object.keys(draw.optionOrder).length > 0 ? { optionOrder: draw.optionOrder } : {}),
          startedAt: ctx.now,
        };
        const started = eventFor(call, person, 'attemptStarted', {
          attemptId: id,
          moduleId: module.id,
          moduleVersion: module.version,
          attemptMode: 'open',
        });
        await apply([put('attempts', attempt), put('learningEvents', started)]);
        return structuredClone(attempt);
      },

      async answer(ctx, input) {
        const { call, person } = await staffCall(backend, options, ctx);
        const attempt = await ownAttempt(call, person, input.attemptId);
        if (attempt.finishedAt !== undefined) throw new RuleError('attemptFinished');
        if (!attempt.questionIds.includes(input.questionId)) throw new RuleError('notInAttempt');
        const events = await personEvents(call, person);
        if (
          events.some(
            (e) => e.type === 'questionAnswered' && e.attemptId === attempt.id && e.questionId === input.questionId,
          )
        ) {
          throw new RuleError('alreadyAnswered');
        }
        const module = await moduleFor(call, attempt.moduleId);
        const question = module.questions.find((q) => q.id === input.questionId);
        if (!question) throw new RuleError('notInAttempt');
        const answer = answerOf(input);
        let result: ReturnType<typeof checkAnswer>;
        try {
          result = checkAnswer(question, answer);
        } catch (error) {
          if (error instanceof InvalidAnswerError) throw new RuleError('invalidAnswer');
          throw error;
        }
        const event = eventFor(call, person, 'questionAnswered', {
          attemptId: attempt.id,
          moduleId: module.id,
          moduleVersion: attempt.moduleVersion,
          questionId: question.id,
          correct: result.correct,
          attemptMode: attempt.mode,
          ...(result.outcome ? { scenarioOutcome: result.outcome } : {}),
          ...('optionId' in answer ? { optionId: answer.optionId } : { choiceIds: answer.choiceIds }),
        });
        await apply([put('learningEvents', event)]);
        return { correct: result.correct, ...(result.outcome ? { outcome: result.outcome } : {}) };
      },

      async finishAttempt(ctx, attemptId): Promise<FinishResult> {
        const { call, person } = await staffCall(backend, options, ctx);
        const attempt = await ownAttempt(call, person, attemptId);
        if (attempt.finishedAt !== undefined) throw new RuleError('attemptFinished');
        const module = await moduleFor(call, attempt.moduleId);
        const events = await personEvents(call, person);
        const answers: Record<string, Answer> = {};
        for (const e of events) {
          if (e.type !== 'questionAnswered' || e.attemptId !== attempt.id || e.questionId === undefined) continue;
          if (e.choiceIds) answers[e.questionId] = { choiceIds: e.choiceIds };
          else if (e.optionId !== undefined) answers[e.questionId] = { optionId: e.optionId };
        }
        if (!attempt.questionIds.every((q) => answers[q] !== undefined)) throw new RuleError('notAllAnswered');

        const { score, passed, missedQuestionIds } = scoreAttempt(
          attempt.questionIds,
          answers,
          module,
          module.quiz.passMark,
        );
        const finished: Attempt = { ...attempt, finishedAt: ctx.now, score, passed };
        const ops: WriteOp[] = [
          put('attempts', finished),
          put(
            'learningEvents',
            eventFor(call, person, 'attemptFinished', {
              attemptId: attempt.id,
              moduleId: module.id,
              moduleVersion: attempt.moduleVersion,
              attemptMode: attempt.mode,
            }),
          ),
        ];
        const evidence: Evidence[] = [];
        if (passed) {
          const site = await call.find<Site>('sites', person.primarySiteId);
          const requirements = await call.all<Requirement>('requirements');
          for (const requirementId of module.requirementIds) {
            const requirement = requirements.find((r) => r.id === requirementId);
            if (!requirement || !site || !requirementApplies(requirement, person, site)) continue;
            const row: Evidence = {
              id: call.newId(),
              clientId: person.clientId,
              personId: person.id,
              requirementId,
              kind: 'module',
              completedAt: ctx.now,
              ...(requirement.renewEveryMonths !== undefined
                ? { expiresAt: addMonths(new Date(ctx.now), requirement.renewEveryMonths).toISOString() }
                : {}),
              moduleId: module.id,
              moduleVersion: attempt.moduleVersion,
              language: module.language,
              siteIdAtTime: person.primarySiteId,
            };
            evidence.push(row);
            ops.push(put('evidence', row));
          }
          for (const a of await call.all<Assignment>('assignments')) {
            if (
              a.personId === person.id &&
              a.status === 'open' &&
              'moduleId' in a.target &&
              a.target.moduleId === module.id
            ) {
              ops.push(put('assignments', doneCopy(a)));
            }
          }
          ops.push(
            put(
              'learningEvents',
              eventFor(call, person, 'moduleCompleted', {
                attemptId: attempt.id,
                moduleId: module.id,
                moduleVersion: attempt.moduleVersion,
              }),
            ),
            audit(call, person.clientId, 'evidence.moduleCompleted', `attempt:${attempt.id}`, undefined, {
              attemptId: attempt.id,
              evidenceIds: evidence.map((e) => e.id),
              moduleId: module.id,
              moduleVersion: attempt.moduleVersion,
            }),
          );
        }
        await apply(ops);
        return { attempt: structuredClone(finished), passed, score, missedQuestionIds, evidence };
      },

      async learnMoreOpened(ctx, input) {
        const { call, person } = await staffCall(backend, options, ctx);
        const module = await moduleFor(call, input.moduleId);
        const question = input.questionId ? module.questions.find((q) => q.id === input.questionId) : undefined;
        const lesson = input.lessonId ? module.lessons.find((l) => l.id === input.lessonId) : undefined;
        if ((input.questionId === undefined) === (input.lessonId === undefined)) {
          throw new ValidationError(['Give either questionId or lessonId']);
        }
        if (input.questionId !== undefined && !question) throw new ValidationError(['questionId: not in this module']);
        if (input.lessonId !== undefined && !lesson) throw new ValidationError(['lessonId: not in this module']);
        const own: LearnMoreLink[] = question ? question.learnMore : (lesson?.furtherReading ?? []);
        const overlays = (await call.all<ClientLinkOverlay>('clientLinkOverlays')).filter(
          (o) =>
            o.clientId === person.clientId &&
            o.moduleId === module.id &&
            (o.siteId === undefined ||
              o.siteId === person.primarySiteId ||
              person.additionalSiteIds.includes(o.siteId)) &&
            (question ? o.questionId === question.id : o.lessonId === lesson?.id),
        );
        const found = [...own, ...overlays.flatMap((o) => o.links)].some((l) => l.id === input.linkId);
        if (!found) throw new ValidationError([`linkId: ${input.linkId} is not a link for this item`]);
        if (input.attemptId !== undefined) await ownAttempt(call, person, input.attemptId);
        const event = eventFor(call, person, 'learnMoreOpened', {
          moduleId: module.id,
          moduleVersion: module.version,
          linkId: input.linkId,
          ...(question ? { questionId: question.id } : {}),
          ...(lesson ? { lessonId: lesson.id } : {}),
          ...(input.attemptId ? { attemptId: input.attemptId } : {}),
        });
        await apply([put('learningEvents', event)]);
        return event;
      },
    },

    assign: async (ctx, input) => {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client' || !holds(call, ['assign.manage'])) return forbid('permission');
      if (input.personIds.length > MAX_PEOPLE_PER_ASSIGN) throw new RuleError('tooMany');
      if (input.personIds.length === 0) throw new RuleError('invalidPeople');
      const clientId = call.clientId as string;
      const everyone = (await call.all<Person>('people')).filter((p) => p.clientId === clientId);
      const chosen = [...new Set(input.personIds)].map((id) => everyone.find((p) => p.id === id));
      // Unknown ids and other clients' people look the same: nothing is revealed and nothing is written.
      if (chosen.some((p) => p === undefined)) throw new NotFoundError();
      for (const p of chosen as Person[]) {
        const target = { clientId, siteIds: [p.primarySiteId, ...p.additionalSiteIds] };
        if (!canAny(call, ['assign.manage'], target, 'write')) return forbid('outOfScope');
      }
      checkAccountState(call, false);
      const module = await moduleFor(call, input.moduleId);
      if (module.status !== 'published') throw new RuleError('moduleNotPublished');
      if (Number.isNaN(new Date(input.dueAt).getTime())) throw new ValidationError(['dueAt: not a date']);
      const now = new Date(ctx.now);
      if (isDueInPast(input.dueAt, now)) throw new RuleError('dueInPast');

      const existing = (await call.all<Assignment>('assignments')).filter((a) => a.clientId === clientId);
      const plan = planAssignment({
        moduleId: module.id,
        personIds: input.personIds,
        people: everyone,
        existing,
        dueAt: input.dueAt,
        now,
      });
      if (plan.invalid.length > 0) throw new RuleError('invalidPeople');

      const users = await call.all<UserAccount>('users');
      const created: Assignment[] = [];
      const ops: WriteOp[] = [];
      for (const personId of plan.toCreate) {
        const a: Assignment = {
          id: call.newId(),
          clientId,
          personId,
          target: { moduleId: module.id },
          dueAt: input.dueAt,
          source: 'manual',
          assignedBy: call.actor.user.id,
          createdAt: ctx.now,
          status: 'open',
        };
        created.push(a);
        ops.push(put('assignments', a));
        const user = users.find((u) => u.side === 'staff' && u.personId === personId && u.status === 'active');
        if (user) {
          const note: Notification = {
            id: call.newId(),
            clientId,
            userId: user.id,
            kind: 'trainingAssigned',
            params: { moduleTitle: module.title, dueDate: londonDateString(new Date(input.dueAt)) },
            createdAt: ctx.now,
          };
          ops.push(put('notifications', note));
        }
      }
      if (created.length > 0) {
        ops.push(
          audit(call, clientId, 'assignments.created', `module:${module.id}`, undefined, {
            moduleId: module.id,
            count: created.length,
          }),
        );
        await apply(ops);
      }
      return { created, skipped: plan.skipped };
    },

    markRead: async (ctx, ids) => {
      const call = await beginCall(backend, options, ctx);
      const ops: WriteOp[] = [];
      for (const id of new Set(ids)) {
        const n = (await backend.get('notifications', id)) as Notification | undefined;
        if (!n || n.userId !== call.actor.user.id) throw new NotFoundError();
        if (n.readAt === undefined) ops.push(put('notifications', readCopy(n, ctx.now)));
      }
      if (ops.length > 0) await apply(ops);
    },
  };
}

// M2 chunk 8 contract tests: learning changes (closed-book mode, notesVisible, abandonAttempt), private notes, `me`,
// categories, groups and placements, and change notices (plan docs/plans/m2.md, "Data package" and "Contract tests").
// Runs against every adapter. Written before the implementation, so the API is described by the local types below.
// Competitions and leaderboards are chunk 9.
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock, type Attempt, type LearnerPrefs, type LearningEvent, type Person } from '@sta/domain';
import {
  AccountStateError,
  DataError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type StoreHandle,
  type StoreOptions,
} from '../types';
import {
  addLearningFixture,
  answerAll,
  changedStores,
  completeLessons,
  lessonOf,
  refusal,
  ruleOf,
  type LearningHandle,
  type LearningStore,
} from './learning';
import { buildWorld, freshId, TODAY } from './world';

// ---------------------------------------------------------------- the API under test, as the plan describes it

export type NoteRecord = {
  id: string;
  clientId: string;
  personId: string;
  moduleId: string;
  lessonId?: string;
  body: string;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
};
export type CategoryRecord = {
  id: string;
  clientId: string;
  name: string;
  colour: string;
  icon: string;
  order: number;
};
export type GroupRecord = {
  id: string;
  clientId: string;
  siteId?: string;
  name: string;
  description: string;
  moduleIds: string[];
  inOrder: boolean;
};
export type PlacementRecord = { clientId: string; moduleId: string; categoryId?: string; availableToAll: boolean };
type Reads<T> = {
  get(ctx: ActorContext, id: string): Promise<T>;
  list(ctx: ActorContext, filter?: Record<string, unknown>): Promise<T[]>;
};
export type MeRecord = { displayName: string; nickname?: string; prefs: LearnerPrefs };
export type EngagementStore = LearningStore & {
  access: { permissions(ctx: ActorContext): Promise<{ permissionId: string }[]> };
  learning: {
    startAttempt(ctx: ActorContext, moduleId: string, opts?: { mode?: 'open' | 'closed' }): Promise<Attempt>;
    answer(
      ctx: ActorContext,
      input: { attemptId: string; questionId: string; optionId?: string; choiceIds?: string[]; notesVisible?: boolean },
    ): Promise<{ correct: boolean }>;
    abandonAttempt(ctx: ActorContext, attemptId: string): Promise<Attempt>;
  };
  notes: Reads<NoteRecord> & {
    list(ctx: ActorContext, filter?: { moduleId?: string; starred?: boolean }): Promise<NoteRecord[]>;
    save(
      ctx: ActorContext,
      input: { id?: string; moduleId: string; lessonId?: string; body: string; starred?: boolean },
    ): Promise<NoteRecord>;
    remove(ctx: ActorContext, id: string): Promise<void>;
  };
  me: {
    get(ctx: ActorContext): Promise<MeRecord>;
    updatePrefs(ctx: ActorContext, patch: Partial<LearnerPrefs>): Promise<unknown>;
    updateProfile(
      ctx: ActorContext,
      patch: { nickname?: string | null; hideFromLeaderboards?: boolean },
    ): Promise<unknown>;
  };
  categories: Reads<CategoryRecord> & {
    save(
      ctx: ActorContext,
      input: { id?: string; name: string; colour: string; icon: string },
    ): Promise<CategoryRecord>;
    reorder(ctx: ActorContext, ids: string[]): Promise<void>;
    remove(ctx: ActorContext, id: string, opts?: { moveTo?: string }): Promise<void>;
    merge(ctx: ActorContext, fromId: string, intoId: string): Promise<void>;
  };
  moduleGroups: Reads<GroupRecord> & {
    save(
      ctx: ActorContext,
      input: { id?: string; siteId?: string; name: string; description: string; moduleIds: string[]; inOrder: boolean },
    ): Promise<GroupRecord>;
    remove(ctx: ActorContext, id: string): Promise<void>;
  };
  modulePlacements: Reads<PlacementRecord> & {
    setCategory(ctx: ActorContext, input: { moduleIds: string[]; categoryId?: string }): Promise<void>;
    setAvailable(ctx: ActorContext, input: { moduleIds: string[]; availableToAll: boolean }): Promise<void>;
  };
};

// ---------------------------------------------------------------- the suite

const LATER = '2026-10-20T09:00:00.000Z';

export function runEngagementContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = (await makeStore(options)) as unknown as LearningHandle;
    const fx = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const store = handle.store as unknown as EngagementStore;
    const a = fx.ids.clients.a;

    // A module that always starts closed-book, with one lesson.
    const closedOnly = {
      ...lf.module,
      id: freshId(60),
      title: 'Contract test closed-book only',
      version: 1,
      lessons: [lessonOf('c-lesson')],
      quiz: { ...lf.module.quiz, drawCount: 2, notesInQuiz: 'closedBookOnly' as const },
    };
    await handle.admin.bulkPut('modules', [closedOnly]);

    // A Viewer: a client user who can see modules and competitions but manage nothing.
    const viewerRole = {
      id: freshId(70),
      owner: { clientId: a },
      name: 'Contract viewer',
      description: 'Contract viewer',
      colour: '#996633',
      permissionIds: ['modules.view', 'competitions.view'],
      system: false,
      version: 1,
      updatedBy: fx.ids.users.priya,
      updatedAt: TODAY,
    };
    const viewerUser = {
      id: freshId(71),
      side: 'client' as const,
      clientId: a,
      email: 'viewer-contract@example.test',
      displayName: 'Viewer',
      status: 'active' as const,
      login: { method: 'emailPassword' as const, pinSet: false },
    };
    await handle.admin.bulkPut('roles', [viewerRole]);
    await handle.admin.bulkPut('users', [viewerUser]);
    await handle.admin.bulkPut('roleAssignments', [
      {
        id: freshId(72),
        userId: viewerUser.id,
        roleIds: [viewerRole.id],
        scope: { type: 'clients', ids: [a] },
        grants: [],
        denies: [],
        status: 'active',
      },
    ]);

    // Categories (two of them hold placements) for the organise tests; an Oak Tree category as the foreign one.
    const cat = (n: number, clientId: string, label: string, order: number): CategoryRecord => ({
      id: freshId(80 + n),
      clientId,
      name: label,
      colour: 'green',
      icon: 'book',
      order,
    });
    const cats = {
      one: cat(1, a, 'Contract Alpha', 901),
      two: cat(2, a, 'Contract Beta', 902),
      three: cat(3, a, 'Contract Gamma', 903),
      foreign: cat(4, fx.ids.clients.ot, 'Contract Oak', 901),
    };
    await handle.admin.bulkPut('categories', Object.values(cats));
    await handle.admin.bulkPut('modulePlacements', [
      { clientId: a, moduleId: lf.moduleId, categoryId: cats.one.id, availableToAll: false },
      { clientId: a, moduleId: lf.retakeId, categoryId: cats.one.id, availableToAll: true },
    ]);
    const group: GroupRecord = {
      id: freshId(90),
      clientId: a,
      name: 'Contract group',
      description: 'A group for tests',
      moduleIds: [lf.moduleId, lf.retakeId],
      inOrder: true,
    };
    await handle.admin.bulkPut('moduleGroups', [group]);
    return { store, admin: handle.admin, handle, fx, lf, closedOnly, cats, group, viewerUserId: viewerUser.id };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });
  const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
  const jade = (s: S) => staff(s.fx.keys.users['jade'], s.fx.ids.clients.a);
  const hannah = (s: S) => staff(s.fx.keys.users['hannah'], s.fx.ids.clients.a);
  const priya = (s: S) => client(s.fx.ids.users.priya, s.fx.ids.clients.a);
  const daniel = (s: S) => client(s.fx.ids.users.daniel, s.fx.ids.clients.a);
  const gina = (s: S) => client(s.fx.ids.users.gina, s.fx.ids.clients.ot);
  const viewer = (s: S) => client(s.viewerUserId, s.fx.ids.clients.a);
  const provider = (s: S): ActorContext => ({ userId: s.fx.ids.users.provOwner, side: 'provider', now: TODAY });
  const jadeId = (s: S) => s.fx.keys.personas['jade'];

  const expectError = async (promise: Promise<unknown>, type: new (...args: never[]) => Error): Promise<Error> => {
    const error = await refusal(promise);
    expect(error).toBeInstanceOf(type);
    return error as Error;
  };
  const forbidden = async (promise: Promise<unknown>): Promise<string> => {
    const error = (await expectError(promise, ForbiddenError)) as ForbiddenError;
    return error.reason;
  };
  const myCategories = async (s: S, ctx: ActorContext) =>
    (await s.store.categories.list(ctx))
      .filter((c) => Object.values(s.cats).some((x) => x.id === c.id))
      .sort((x, y) => x.order - y.order);

  describe(`Engagement data layer: ${name}`, () => {
    describe('startAttempt modes, notesVisible and abandonAttempt', () => {
      async function ready(s: S) {
        await completeLessons(s.store, jade(s), s.lf.module);
      }

      it('stores mode closed on the attempt and on the attemptStarted event', async () => {
        const s = await setup();
        await ready(s);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        expect(attempt.mode).toBe('closed');
        const started = (await s.store.learningEvents.list(jade(s))).filter(
          (e: LearningEvent) => e.type === 'attemptStarted' && e.attemptId === attempt.id,
        );
        expect(started).toHaveLength(1);
        expect(started[0]!.attemptMode).toBe('closed');
      });

      it('starts open by default and records attemptMode open', async () => {
        const s = await setup();
        await ready(s);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        expect(attempt.mode).toBe('open');
        const started = (await s.store.learningEvents.list(jade(s))).find(
          (e) => e.type === 'attemptStarted' && e.attemptId === attempt.id,
        );
        expect(started?.attemptMode).toBe('open');
      });

      it('keeps the stored mode when an unfinished closed attempt is resumed', async () => {
        const s = await setup();
        await ready(s);
        const first = await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        const again = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        expect(again.id).toBe(first.id);
        expect(again.mode).toBe('closed');
      });

      it('refuses open mode on a closed-book-only module and starts it closed by default', async () => {
        const s = await setup();
        await completeLessons(s.store, jade(s), s.closedOnly);
        expect(await ruleOf(s.store.learning.startAttempt(jade(s), s.closedOnly.id, { mode: 'open' }))).toBe(
          'closedBookOnly',
        );
        const attempt = await s.store.learning.startAttempt(jade(s), s.closedOnly.id);
        expect(attempt.mode).toBe('closed');
      });

      it('locks notes while a closed attempt is unfinished: list and get give notesLocked', async () => {
        const s = await setup();
        await ready(s);
        const note = await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Remember the ratios' });
        await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        expect(await ruleOf(s.store.notes.list(jade(s)))).toBe('notesLocked');
        expect(await ruleOf(s.store.notes.get(jade(s), note.id))).toBe('notesLocked');
      });

      it('does not lock notes for a different person', async () => {
        const s = await setup();
        await ready(s);
        await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        await expect(s.store.notes.list(hannah(s))).resolves.toEqual([]);
      });

      it('does not lock notes during an open attempt', async () => {
        const s = await setup();
        await ready(s);
        const note = await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Open book' });
        await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        expect((await s.store.notes.list(jade(s))).map((n) => n.id)).toEqual([note.id]);
      });

      it('refuses notesVisible true in a closed attempt with notesLocked and writes nothing', async () => {
        const s = await setup();
        await ready(s);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        const q = attempt.questionIds[0]!;
        const before = await s.admin.dumpAll();
        expect(
          await ruleOf(
            s.store.learning.answer(jade(s), {
              attemptId: attempt.id,
              questionId: q,
              optionId: `${q}-yes`,
              notesVisible: true,
            }),
          ),
        ).toBe('notesLocked');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('stores notesVisible false for a closed attempt answer', async () => {
        const s = await setup();
        await ready(s);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        const q = attempt.questionIds[0]!;
        await s.store.learning.answer(jade(s), {
          attemptId: attempt.id,
          questionId: q,
          optionId: `${q}-yes`,
          notesVisible: false,
        });
        const event = (await s.store.learningEvents.list(jade(s))).find(
          (e) => e.type === 'questionAnswered' && e.questionId === q,
        );
        expect(event?.notesVisible).toBe(false);
      });

      it('stores notesVisible as passed in an open attempt, and false when it is left out', async () => {
        const s = await setup();
        await ready(s);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        const [q1, q2] = attempt.questionIds as [string, string];
        await s.store.learning.answer(jade(s), {
          attemptId: attempt.id,
          questionId: q1,
          optionId: `${q1}-yes`,
          notesVisible: true,
        });
        await s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q2, optionId: `${q2}-yes` });
        const answered = (await s.store.learningEvents.list(jade(s))).filter((e) => e.type === 'questionAnswered');
        expect(answered.find((e) => e.questionId === q1)?.notesVisible).toBe(true);
        expect(answered.find((e) => e.questionId === q2)?.notesVisible).toBe(false);
      });

      it('refuses learnMoreOpened with closedBook while a closed attempt is unfinished, and writes nothing', async () => {
        const s = await setup();
        await ready(s);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        const before = await s.admin.dumpAll();
        expect(
          await ruleOf(
            s.store.learning.learnMoreOpened(jade(s), {
              moduleId: s.lf.moduleId,
              questionId: 'q1',
              linkId: 'gov-guide',
              attemptId: attempt.id,
            }),
          ),
        ).toBe('closedBook');
        // Also without naming the attempt: any unfinished closed attempt of the caller blocks it.
        expect(
          await ruleOf(
            s.store.learning.learnMoreOpened(jade(s), {
              moduleId: s.lf.moduleId,
              questionId: 'q1',
              linkId: 'gov-guide',
            }),
          ),
        ).toBe('closedBook');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('allows learnMoreOpened and notes again once the closed attempt is finished', async () => {
        const s = await setup();
        await ready(s);
        const note = await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Back after the quiz' });
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        await answerAll(s.store, jade(s), attempt, true);
        await s.store.learning.finishAttempt(jade(s), attempt.id);
        await expect(
          s.store.learning.learnMoreOpened(jade(s), {
            moduleId: s.lf.moduleId,
            questionId: 'q1',
            linkId: 'gov-guide',
          }),
        ).resolves.toMatchObject({ type: 'learnMoreOpened' });
        expect((await s.store.notes.get(jade(s), note.id)).body).toBe('Back after the quiz');
      });

      it('abandonAttempt marks the attempt abandoned with no score and unlocks notes', async () => {
        const s = await setup();
        await ready(s);
        await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Kept' });
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        const result = await s.store.learning.abandonAttempt(jade(s), attempt.id);
        expect(result).toMatchObject({ id: attempt.id, abandoned: true });
        expect(result.score).toBeUndefined();
        expect(result.passed).toBeUndefined();
        expect((await s.store.attempts.get(jade(s), attempt.id)).abandoned).toBe(true);
        expect(await s.store.notes.list(jade(s))).toHaveLength(1);
        await expect(
          s.store.learning.learnMoreOpened(jade(s), {
            moduleId: s.lf.moduleId,
            questionId: 'q1',
            linkId: 'gov-guide',
          }),
        ).resolves.toBeDefined();
      });

      it('starts a new attempt after an abandoned one instead of resuming it', async () => {
        const s = await setup();
        await ready(s);
        const first = await s.store.learning.startAttempt(jade(s), s.lf.moduleId, { mode: 'closed' });
        await s.store.learning.abandonAttempt(jade(s), first.id);
        const second = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        expect(second.id).not.toBe(first.id);
      });

      it('does not count an abandoned attempt towards a one-retake limit', async () => {
        const s = await setup();
        const ctx = jade(s);
        const m = s.lf.retakeModule;
        await completeLessons(s.store, ctx, m);
        const first = await s.store.learning.startAttempt(ctx, m.id);
        await answerAll(s.store, ctx, first, false);
        await s.store.learning.finishAttempt(ctx, first.id);
        const second = await s.store.learning.startAttempt(ctx, m.id);
        await s.store.learning.abandonAttempt(ctx, second.id);
        // Only one finished attempt so far, so one more is allowed.
        const third = await s.store.learning.startAttempt(ctx, m.id);
        expect(third.id).not.toBe(second.id);
        await answerAll(s.store, ctx, third, false);
        await s.store.learning.finishAttempt(ctx, third.id);
        expect(await ruleOf(s.store.learning.startAttempt(ctx, m.id))).toBe('noRetakesLeft');
      });

      it('refuses to abandon a finished attempt, and another person attempt', async () => {
        const s = await setup();
        await ready(s);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        await expectError(s.store.learning.abandonAttempt(hannah(s), attempt.id), NotFoundError);
        await answerAll(s.store, jade(s), attempt, true);
        await s.store.learning.finishAttempt(jade(s), attempt.id);
        expect(await ruleOf(s.store.learning.abandonAttempt(jade(s), attempt.id))).toBe('attemptFinished');
      });
    });

    describe('notes', () => {
      it('lets Jade save, list, update, star and remove her notes', async () => {
        const s = await setup();
        const ctx = jade(s);
        const created = await s.store.notes.save(ctx, {
          moduleId: s.lf.moduleId,
          lessonId: 'l-one',
          body: '  Ask the room lead first  ',
        });
        expect(created).toMatchObject({
          clientId: s.fx.ids.clients.a,
          personId: jadeId(s),
          moduleId: s.lf.moduleId,
          lessonId: 'l-one',
          body: 'Ask the room lead first',
          starred: false,
          createdAt: TODAY,
          updatedAt: TODAY,
        });
        expect(created.id).toMatch(/^[0-9A-Z]{26}$/);
        expect(await s.store.notes.get(ctx, created.id)).toEqual(created);

        const later = { ...ctx, now: LATER };
        const updated = await s.store.notes.save(later, {
          id: created.id,
          moduleId: s.lf.moduleId,
          lessonId: 'l-one',
          body: 'Ask the room lead first, then log it',
          starred: true,
        });
        expect(updated).toMatchObject({
          id: created.id,
          createdAt: TODAY,
          updatedAt: LATER,
          starred: true,
          body: 'Ask the room lead first, then log it',
        });
        expect(await s.store.notes.list(ctx)).toHaveLength(1);

        await s.store.notes.remove(ctx, created.id);
        expect(await s.store.notes.list(ctx)).toEqual([]);
        await expectError(s.store.notes.get(ctx, created.id), NotFoundError);
      });

      it('sets updatedAt to the context time on every save, even if nothing else changed', async () => {
        const s = await setup();
        const note = await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Same text' });
        const again = await s.store.notes.save(
          { ...jade(s), now: LATER },
          { id: note.id, moduleId: s.lf.moduleId, body: 'Same text' },
        );
        expect(again.updatedAt).toBe(LATER);
        expect(again.createdAt).toBe(TODAY);
      });

      it('filters the list by module and by starred', async () => {
        const s = await setup();
        const ctx = jade(s);
        const one = await s.store.notes.save(ctx, { moduleId: s.lf.moduleId, body: 'One', starred: true });
        const two = await s.store.notes.save(ctx, { moduleId: s.lf.retakeId, body: 'Two' });
        expect((await s.store.notes.list(ctx, { moduleId: s.lf.retakeId })).map((n) => n.id)).toEqual([two.id]);
        expect((await s.store.notes.list(ctx, { starred: true })).map((n) => n.id)).toEqual([one.id]);
        expect((await s.store.notes.list(ctx)).map((n) => n.id).sort()).toEqual([one.id, two.id].sort());
      });

      it('writes only the notes store: no audit event and no learning event', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        const note = await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Private' });
        expect(changedStores(before, await s.admin.dumpAll())).toEqual(['notes']);
        const mid = await s.admin.dumpAll();
        await s.store.notes.remove(jade(s), note.id);
        expect(changedStores(mid, await s.admin.dumpAll())).toEqual(['notes']);
      });

      it('gives Hannah NotFound for Jade note id, never lists it, and cannot update or remove it', async () => {
        const s = await setup();
        const note = await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Only Jade' });
        await expectError(s.store.notes.get(hannah(s), note.id), NotFoundError);
        expect(await s.store.notes.list(hannah(s))).toEqual([]);
        await expectError(
          s.store.notes.save(hannah(s), { id: note.id, moduleId: s.lf.moduleId, body: 'Overwritten' }),
          NotFoundError,
        );
        await expectError(s.store.notes.remove(hannah(s), note.id), NotFoundError);
        expect((await s.store.notes.get(jade(s), note.id)).body).toBe('Only Jade');
      });

      it.each([
        ['an Account Owner (Priya)', (s: S) => priya(s)],
        ['a site manager (Daniel)', (s: S) => daniel(s)],
        ['an Oak Tree admin', (s: S) => gina(s)],
        ['a client Viewer', (s: S) => viewer(s)],
        ['the provider Owner', (s: S) => provider(s)],
      ])('gives %s Forbidden on list and NotFound on get', async (_label, who) => {
        const s = await setup();
        const note = await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Not for managers' });
        expect(await forbidden(s.store.notes.list(who(s)))).toBe('permission');
        await expectError(s.store.notes.get(who(s), note.id), NotFoundError);
      });

      it('refuses client and provider actors saving or removing notes', async () => {
        const s = await setup();
        const note = await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Mine' });
        await expectError(s.store.notes.save(priya(s), { moduleId: s.lf.moduleId, body: 'Sneaky' }), DataError);
        await expectError(s.store.notes.remove(priya(s), note.id), DataError);
        expect(((await s.admin.dumpAll()) as Record<string, unknown[]>)['notes']).toHaveLength(1);
      });

      it('gives lessonMissing for a lesson that is not in the module current version', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(
          await ruleOf(s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, lessonId: 'no-such', body: 'Hi' })),
        ).toBe('lessonMissing');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('refuses 1,001 characters, an empty body and a whitespace-only body with a ValidationError', async () => {
        const s = await setup();
        const save = (body: string) => s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body });
        await expectError(save('x'.repeat(1001)), ValidationError);
        await expectError(save(''), ValidationError);
        await expectError(save('   \n  '), ValidationError);
        await expect(save('x'.repeat(1000))).resolves.toMatchObject({ body: 'x'.repeat(1000) });
      });

      it('refuses a note for a module the person cannot see (a draft) with NotFound', async () => {
        const s = await setup();
        await expectError(s.store.notes.save(jade(s), { moduleId: s.lf.draftId, body: 'Draft' }), NotFoundError);
        await expectError(s.store.notes.save(jade(s), { moduleId: freshId(999), body: 'Nothing' }), NotFoundError);
      });

      it('gives AccountStateError to staff of a Closed client', async () => {
        const s = await setup();
        const closedStaff = s.fx.ids.stateClients.closed;
        const ctx = staff(closedStaff.staff.id, closedStaff.client.id);
        await expectError(s.store.notes.save(ctx, { moduleId: s.lf.moduleId, body: 'Closed' }), AccountStateError);
      });
    });

    describe('me', () => {
      it('returns the caller own prefs, nickname and a display name', async () => {
        const s = await setup();
        const people = (await s.admin.dumpAll())['people'] as Person[];
        const stored = people.find((p) => p.id === jadeId(s))!;
        const me = await s.store.me.get(jade(s));
        expect(me.prefs).toEqual(stored.prefs);
        expect(typeof me.displayName).toBe('string');
        expect(me.displayName.length).toBeGreaterThan(0);
      });

      it('updatePrefs changes only the caller prefs and nothing else in the database', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        await s.store.me.updatePrefs(jade(s), { textScale: 1.5, simpleView: true, readAloudRate: 1.25 });
        const after = await s.admin.dumpAll();
        expect(changedStores(before, after)).toEqual(['people']);
        const was = (before['people'] as Person[]).find((p) => p.id === jadeId(s))!;
        const now = (after['people'] as Person[]).find((p) => p.id === jadeId(s))!;
        expect(now.prefs).toEqual({ ...was.prefs, textScale: 1.5, simpleView: true, readAloudRate: 1.25 });
        expect({ ...now, prefs: undefined }).toEqual({ ...was, prefs: undefined });
        for (const p of before['people'] as Person[]) {
          if (p.id === jadeId(s)) continue;
          expect((after['people'] as Person[]).find((x) => x.id === p.id)).toEqual(p);
        }
        expect((await s.store.me.get(jade(s))).prefs.textScale).toBe(1.5);
      });

      it('gives a ValidationError for textScale 3 and changes nothing', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        await expectError(s.store.me.updatePrefs(jade(s), { textScale: 3 }), ValidationError);
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('works for a client user who has a person (Priya)', async () => {
        const s = await setup();
        await s.store.me.updatePrefs(priya(s), { colourMode: 'dark' });
        expect((await s.store.me.get(priya(s))).prefs.colourMode).toBe('dark');
        const people = (await s.admin.dumpAll())['people'] as Person[];
        expect(people.find((p) => p.id === jadeId(s))!.prefs.colourMode).not.toBe('dark');
      });

      it('works for staff of a Read-only client but not a Closed one', async () => {
        const s = await setup();
        const ro = s.fx.ids.stateClients.readOnly;
        await s.store.me.updatePrefs(staff(ro.staff.id, ro.client.id), { biggerButtons: true });
        expect((await s.store.me.get(staff(ro.staff.id, ro.client.id))).prefs.biggerButtons).toBe(true);
        const closed = s.fx.ids.stateClients.closed;
        await expectError(
          s.store.me.updatePrefs(staff(closed.staff.id, closed.client.id), { biggerButtons: true }),
          AccountStateError,
        );
      });

      it('refuses the provider side, which has no person', async () => {
        const s = await setup();
        await expectError(s.store.me.get(provider(s)), ForbiddenError);
        await expectError(s.store.me.updatePrefs(provider(s), { textScale: 1.25 }), ForbiddenError);
      });

      it('updateProfile sets and clears the nickname', async () => {
        const s = await setup();
        await s.store.me.updateProfile(jade(s), { nickname: "Jade-Jay O'Neil" });
        expect((await s.store.me.get(jade(s))).nickname).toBe("Jade-Jay O'Neil");
        await s.store.me.updateProfile(jade(s), { nickname: null });
        expect((await s.store.me.get(jade(s))).nickname).toBeUndefined();
      });

      it.each(['<script>alert(1)</script>', 'http://example.test', '', 'x'.repeat(31)])(
        'refuses the nickname %j with a ValidationError',
        async (nickname) => {
          const s = await setup();
          const before = await s.admin.dumpAll();
          await expectError(s.store.me.updateProfile(jade(s), { nickname }), ValidationError);
          expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
        },
      );

      it('updateProfile hideFromLeaderboards writes the caller prefs only', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        await s.store.me.updateProfile(jade(s), { hideFromLeaderboards: true });
        expect(changedStores(before, await s.admin.dumpAll())).toEqual(['people']);
        expect((await s.store.me.get(jade(s))).prefs.hideFromLeaderboards).toBe(true);
        expect((await s.store.me.get(hannah(s))).prefs.hideFromLeaderboards).toBe(false);
      });

      it('audits a nickname change as me.profileChanged with the field name and no value', async () => {
        const s = await setup();
        await s.store.me.updateProfile(jade(s), { nickname: 'Jadey' });
        const events = (
          (await s.admin.dumpAll())['audit'] as { action: string; after?: unknown; before?: unknown }[]
        ).filter((e) => e.action === 'me.profileChanged');
        expect(events).toHaveLength(1);
        expect(events[0]!.after).toEqual({ fields: ['nickname'] });
        expect(JSON.stringify(events[0])).not.toContain('Jadey');
      });

      it('writes no audit event for display prefs', async () => {
        const s = await setup();
        const before = (await s.admin.dumpAll())['audit'].length;
        await s.store.me.updatePrefs(jade(s), { textScale: 1.25 });
        expect((await s.admin.dumpAll())['audit'].length).toBe(before);
      });
    });

    describe('categories, groups and placements', () => {
      it('lets client admins and staff of the same client read categories, groups and placements', async () => {
        const s = await setup();
        for (const ctx of [priya(s), viewer(s), jade(s)]) {
          expect((await s.store.categories.list(ctx)).map((c) => c.id)).toEqual(
            expect.arrayContaining([s.cats.one.id, s.cats.two.id, s.cats.three.id]),
          );
          expect((await s.store.categories.get(ctx, s.cats.one.id)).name).toBe('Contract Alpha');
          expect((await s.store.moduleGroups.get(ctx, s.group.id)).moduleIds).toEqual(s.group.moduleIds);
          const placement = await s.store.modulePlacements.get(ctx, `${s.fx.ids.clients.a}:${s.lf.moduleId}`);
          expect(placement).toMatchObject({ categoryId: s.cats.one.id, availableToAll: false });
        }
      });

      it('never shows another client categories, and gives NotFound on get and on writes to them', async () => {
        const s = await setup();
        const seen = (await s.store.categories.list(gina(s))).map((c) => c.id);
        expect(seen).toContain(s.cats.foreign.id);
        expect(seen).not.toContain(s.cats.one.id);
        await expectError(s.store.categories.get(gina(s), s.cats.one.id), NotFoundError);
        await expectError(s.store.moduleGroups.get(gina(s), s.group.id), NotFoundError);
        await expectError(
          s.store.categories.save(gina(s), { id: s.cats.one.id, name: 'Hijack', colour: 'blue', icon: 'book' }),
          NotFoundError,
        );
        await expectError(s.store.categories.remove(gina(s), s.cats.one.id), NotFoundError);
        expect((await s.store.categories.get(priya(s), s.cats.one.id)).name).toBe('Contract Alpha');
      });

      it('creates a category with an id, the client, and an order after the existing ones', async () => {
        const s = await setup();
        const created = await s.store.categories.save(priya(s), {
          name: 'Contract Delta',
          colour: 'teal',
          icon: 'home',
        });
        expect(created).toMatchObject({
          clientId: s.fx.ids.clients.a,
          name: 'Contract Delta',
          colour: 'teal',
          icon: 'home',
        });
        expect(created.order).toBeGreaterThan(s.cats.three.order);
        expect((await s.store.categories.get(priya(s), created.id)).name).toBe('Contract Delta');
      });

      it('renames and recolours a category without changing its order', async () => {
        const s = await setup();
        const updated = await s.store.categories.save(priya(s), {
          id: s.cats.two.id,
          name: 'Contract Beta renamed',
          colour: 'amber',
          icon: 'clock',
        });
        expect(updated).toMatchObject({
          id: s.cats.two.id,
          name: 'Contract Beta renamed',
          colour: 'amber',
          order: 902,
        });
      });

      it('gives nameTaken for a duplicate name ignoring case, but allows keeping its own name', async () => {
        const s = await setup();
        expect(
          await ruleOf(s.store.categories.save(priya(s), { name: 'contract alpha', colour: 'blue', icon: 'book' })),
        ).toBe('nameTaken');
        expect(
          await ruleOf(
            s.store.categories.save(priya(s), {
              id: s.cats.two.id,
              name: ' CONTRACT ALPHA ',
              colour: 'blue',
              icon: 'book',
            }),
          ),
        ).toBe('nameTaken');
        await expect(
          s.store.categories.save(priya(s), {
            id: s.cats.one.id,
            name: 'Contract Alpha',
            colour: 'blue',
            icon: 'book',
          }),
        ).resolves.toMatchObject({ colour: 'blue' });
        // Another client may use the same name.
        await expect(
          s.store.categories.save(gina(s), { name: 'Contract Alpha', colour: 'blue', icon: 'book' }),
        ).resolves.toMatchObject({ clientId: s.fx.ids.clients.ot });
      });

      it('refuses a colour or icon outside the fixed lists and an empty or 41 character name', async () => {
        const s = await setup();
        const save = (input: { name: string; colour: string; icon: string }) =>
          s.store.categories.save(priya(s), input);
        await expectError(save({ name: 'Ok', colour: 'hotpink', icon: 'book' }), ValidationError);
        await expectError(save({ name: 'Ok', colour: 'green', icon: 'skull' }), ValidationError);
        await expectError(save({ name: '', colour: 'green', icon: 'book' }), ValidationError);
        await expectError(save({ name: 'n'.repeat(41), colour: 'green', icon: 'book' }), ValidationError);
      });

      it('reorders categories to the given sequence', async () => {
        const s = await setup();
        await s.store.categories.reorder(priya(s), [s.cats.three.id, s.cats.one.id, s.cats.two.id]);
        expect((await myCategories(s, priya(s))).map((c) => c.id)).toEqual([
          s.cats.three.id,
          s.cats.one.id,
          s.cats.two.id,
        ]);
      });

      it('merges a category into another: placements move and the old category is gone', async () => {
        const s = await setup();
        await s.store.categories.merge(priya(s), s.cats.one.id, s.cats.two.id);
        await expectError(s.store.categories.get(priya(s), s.cats.one.id), NotFoundError);
        const placements = await s.store.modulePlacements.list(priya(s));
        for (const moduleId of [s.lf.moduleId, s.lf.retakeId]) {
          expect(placements.find((p) => p.moduleId === moduleId)?.categoryId).toBe(s.cats.two.id);
        }
        // Other placement fields are kept.
        expect(placements.find((p) => p.moduleId === s.lf.moduleId)?.availableToAll).toBe(false);
      });

      it('deletes a category and moves its placements to the chosen one', async () => {
        const s = await setup();
        await s.store.categories.remove(priya(s), s.cats.one.id, { moveTo: s.cats.three.id });
        await expectError(s.store.categories.get(priya(s), s.cats.one.id), NotFoundError);
        const placements = await s.store.modulePlacements.list(priya(s));
        expect(placements.find((p) => p.moduleId === s.lf.moduleId)?.categoryId).toBe(s.cats.three.id);
        expect(placements.find((p) => p.moduleId === s.lf.retakeId)?.categoryId).toBe(s.cats.three.id);
      });

      it('deletes a category with no moveTo and leaves its modules uncategorised but still placed', async () => {
        const s = await setup();
        await s.store.categories.remove(priya(s), s.cats.one.id);
        const placements = await s.store.modulePlacements.list(priya(s));
        const p = placements.find((x) => x.moduleId === s.lf.moduleId)!;
        expect(p.categoryId).toBeUndefined();
        expect(p.availableToAll).toBe(false);
      });

      it('refuses to move placements into a category of another client', async () => {
        const s = await setup();
        await expectError(
          s.store.categories.remove(priya(s), s.cats.one.id, { moveTo: s.cats.foreign.id }),
          NotFoundError,
        );
        await expectError(s.store.categories.merge(priya(s), s.cats.one.id, s.cats.foreign.id), NotFoundError);
        await expect(s.store.categories.get(priya(s), s.cats.one.id)).resolves.toBeDefined();
      });

      it('setCategory puts several modules into a category and keeps availableToAll', async () => {
        const s = await setup();
        await s.store.modulePlacements.setCategory(priya(s), {
          moduleIds: [s.lf.moduleId, s.lf.retakeId],
          categoryId: s.cats.three.id,
        });
        const a = s.fx.ids.clients.a;
        const first = await s.store.modulePlacements.get(priya(s), `${a}:${s.lf.moduleId}`);
        const second = await s.store.modulePlacements.get(priya(s), `${a}:${s.lf.retakeId}`);
        expect(first).toMatchObject({ categoryId: s.cats.three.id, availableToAll: false });
        expect(second).toMatchObject({ categoryId: s.cats.three.id, availableToAll: true });
      });

      it('access.permissions gives a person their own effective permissions only', async () => {
        const s = await setup();
        const mine = (await s.store.access.permissions(viewer(s))).map((p) => p.permissionId);
        expect(mine).toContain('modules.view');
        expect(mine).not.toContain('modules.manage');
        expect((await s.store.access.permissions(priya(s))).map((p) => p.permissionId)).toContain('modules.manage');
      });

      it('setCategory without a category takes the modules out of their category and keeps availableToAll', async () => {
        const s = await setup();
        await s.store.modulePlacements.setCategory(priya(s), {
          moduleIds: [s.lf.retakeId],
          categoryId: s.cats.three.id,
        });
        await s.store.modulePlacements.setCategory(priya(s), { moduleIds: [s.lf.retakeId] });
        const placement = await s.store.modulePlacements.get(priya(s), `${s.fx.ids.clients.a}:${s.lf.retakeId}`);
        expect(placement.categoryId).toBeUndefined();
        expect(placement.availableToAll).toBe(true);
      });

      it('setCategory creates a placement for a module that has none', async () => {
        const s = await setup();
        await s.store.modulePlacements.setCategory(priya(s), {
          moduleIds: [s.closedOnly.id],
          categoryId: s.cats.two.id,
        });
        const placement = await s.store.modulePlacements.get(priya(s), `${s.fx.ids.clients.a}:${s.closedOnly.id}`);
        expect(placement).toMatchObject({
          clientId: s.fx.ids.clients.a,
          moduleId: s.closedOnly.id,
          categoryId: s.cats.two.id,
        });
        expect(typeof placement.availableToAll).toBe('boolean');
      });

      it('setCategory refuses a category of another client with NotFound and changes nothing', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        await expectError(
          s.store.modulePlacements.setCategory(priya(s), { moduleIds: [s.lf.moduleId], categoryId: s.cats.foreign.id }),
          NotFoundError,
        );
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('setAvailable changes availableToAll and keeps the category', async () => {
        const s = await setup();
        await s.store.modulePlacements.setAvailable(priya(s), { moduleIds: [s.lf.moduleId], availableToAll: true });
        const placement = await s.store.modulePlacements.get(priya(s), `${s.fx.ids.clients.a}:${s.lf.moduleId}`);
        expect(placement).toMatchObject({ availableToAll: true, categoryId: s.cats.one.id });
      });

      it('saves, updates and removes a group, keeping the module order', async () => {
        const s = await setup();
        const created = await s.store.moduleGroups.save(priya(s), {
          name: 'Contract new group',
          description: 'Order matters',
          moduleIds: [s.lf.retakeId, s.lf.moduleId],
          inOrder: false,
        });
        expect(created).toMatchObject({
          clientId: s.fx.ids.clients.a,
          moduleIds: [s.lf.retakeId, s.lf.moduleId],
          inOrder: false,
        });
        const updated = await s.store.moduleGroups.save(priya(s), {
          id: created.id,
          name: 'Contract new group',
          description: 'Reordered',
          moduleIds: [s.lf.moduleId, s.lf.retakeId],
          inOrder: true,
        });
        expect(updated).toMatchObject({ id: created.id, moduleIds: [s.lf.moduleId, s.lf.retakeId], inOrder: true });
        await s.store.moduleGroups.remove(priya(s), created.id);
        await expectError(s.store.moduleGroups.get(priya(s), created.id), NotFoundError);
      });

      it('refuses a group with no modules or the same module twice', async () => {
        const s = await setup();
        const base = { name: 'Bad', description: '', inOrder: false };
        await expectError(s.store.moduleGroups.save(priya(s), { ...base, moduleIds: [] }), ValidationError);
        await expectError(
          s.store.moduleGroups.save(priya(s), { ...base, moduleIds: [s.lf.moduleId, s.lf.moduleId] }),
          ValidationError,
        );
      });

      it.each([
        ['staff (Jade)', (s: S) => jade(s)],
        ['a client Viewer', (s: S) => viewer(s)],
      ])('gives %s Forbidden on every organise write', async (_label, who) => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        const ctx = who(s);
        const writes: Promise<unknown>[] = [
          s.store.categories.save(ctx, { name: 'Nope', colour: 'blue', icon: 'book' }),
          s.store.categories.reorder(ctx, [s.cats.two.id, s.cats.one.id]),
          s.store.categories.remove(ctx, s.cats.one.id),
          s.store.categories.merge(ctx, s.cats.one.id, s.cats.two.id),
          s.store.moduleGroups.save(ctx, {
            name: 'Nope',
            description: '',
            moduleIds: [s.lf.moduleId],
            inOrder: false,
          }),
          s.store.moduleGroups.remove(ctx, s.group.id),
          s.store.modulePlacements.setCategory(ctx, { moduleIds: [s.lf.moduleId], categoryId: s.cats.two.id }),
          s.store.modulePlacements.setAvailable(ctx, { moduleIds: [s.lf.moduleId], availableToAll: true }),
        ];
        for (const write of writes) expect(await forbidden(write)).toBe('permission');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('gives AccountStateError for organise writes in a Read-only account, while reads still work', async () => {
        const s = await setup();
        const ro = s.fx.ids.stateClients.readOnly;
        const ctx = client(ro.owner.id, ro.client.id);
        await expectError(
          s.store.categories.save(ctx, { name: 'Read-only', colour: 'blue', icon: 'book' }),
          AccountStateError,
        );
        await expect(s.store.categories.list(ctx)).resolves.toEqual([]);
      });
    });

    describe('change notices', () => {
      it('notes.save notifies the notes store only', async () => {
        const s = await setup();
        const calls: string[][] = [];
        s.handle.subscribe((stores) => calls.push([...stores]));
        await s.store.notes.save(jade(s), { moduleId: s.lf.moduleId, body: 'Notice me' });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual(['notes']);
      });

      it('categories.save notifies categories, and a refused write notifies nothing', async () => {
        const s = await setup();
        const calls: string[][] = [];
        s.handle.subscribe((stores) => calls.push([...stores]));
        await s.store.categories.save(priya(s), { name: 'Contract Epsilon', colour: 'rose', icon: 'bell' });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('categories');
        await refusal(s.store.categories.save(jade(s), { name: 'Nope', colour: 'rose', icon: 'bell' }));
        expect(calls).toHaveLength(1);
      });
    });
  });
}

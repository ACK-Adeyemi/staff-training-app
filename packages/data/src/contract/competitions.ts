// M2 chunk 9 contract tests: competitions and standing leaderboards (plan docs/plans/m2.md, "Data package" and
// "Contract tests"; acceptance BP-2, F-5, F-6, F-9). Runs against every adapter. Written before the implementation,
// so the API is described by the local types below.
//
// Assumed shapes (the implementer may widen them, not narrow them):
// - competitions.standings(ctx, id) returns StandingsView. Staff get the staff projection: rows have no ids, `viewer`
//   is the private position, `winners` (once recorded) are WinnerLines. Admins (competitions.view) get `rows` with
//   personId/teamId for ranked, non-hidden people and `of`. A custom competition gives `{ visible: false }`.
// - competitions.recordWinners(ctx, id) resolves to the updated Competition (winners and finalStandings stored).
// - leaderboards.standing(ctx, { board, period }) returns BoardView, or `{ visible: false, off: true }` when off.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  type Competition,
  type LeaderboardRow,
  type Person,
  type StandingBoardSettings,
  type ViewerPosition,
} from '@sta/domain';
import {
  DataError,
  ForbiddenError,
  NotEntitledError,
  AccountStateError,
  NotFoundError,
  type ActorContext,
  type StoreHandle,
  type StoreOptions,
} from '../types';
import { addLearningFixture, completeLessons, refusal, ruleOf, type LearningHandle } from './learning';
import type { EngagementStore } from './engagement';
import { buildWorld, freshId, TODAY } from './world';

// ---------------------------------------------------------------- the API under test, as the plan describes it

export type WinnerLine = { name?: string; hidden: boolean };
export type StandingsView = {
  visible: boolean;
  rows?: (LeaderboardRow & { personId?: string; teamId?: string })[];
  viewer?: ViewerPosition | null;
  of?: number;
  winners?: WinnerLine[];
};
export type BoardView = {
  visible: boolean;
  off?: boolean;
  rows?: LeaderboardRow[];
  viewer?: ViewerPosition | null;
};
export type BoardId =
  'correctQuestions' | 'modulesCompleted' | 'modulesMastered' | 'activeWeeks' | 'refresherChampions' | 'teamBoard';
export type CompetitionStore = EngagementStore & {
  competitions: {
    list(ctx: ActorContext): Promise<Competition[]>;
    get(ctx: ActorContext, id: string): Promise<Competition>;
    save(ctx: ActorContext, competition: Competition): Promise<Competition>;
    publish(ctx: ActorContext, id: string): Promise<Competition>;
    cancel(ctx: ActorContext, id: string): Promise<Competition>;
    extend(ctx: ActorContext, id: string, endAt: string): Promise<Competition>;
    recordWinners(ctx: ActorContext, id: string): Promise<Competition>;
    standings(ctx: ActorContext, id: string): Promise<StandingsView>;
    entitlements(ctx: ActorContext): Promise<{ closedBookCompetitions?: boolean; flags: string[] }>;
  };
  leaderboards: {
    standing(
      ctx: ActorContext,
      input: { board: BoardId; period: 'allTime' | 'thisMonth' | 'thisQuarter' },
    ): Promise<BoardView>;
    settings(ctx: ActorContext): Promise<StandingBoardSettings>;
    saveSettings(ctx: ActorContext, settings: StandingBoardSettings): Promise<unknown>;
  };
};

const START = '2026-10-12T00:00:00.000Z';
const END = '2026-10-26T00:00:00.000Z';
const AFTER_END = '2026-10-27T09:00:00.000Z';
const NEXT_MONTH = '2026-11-02T09:00:00.000Z';

export function runCompetitionsContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = (await makeStore(options)) as unknown as LearningHandle;
    const fx = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const store = handle.store as unknown as CompetitionStore;
    const a = fx.ids.clients.a;

    const viewerRole = {
      id: freshId(200),
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
      id: freshId(201),
      side: 'client' as const,
      clientId: a,
      email: 'viewer-comp@example.test',
      displayName: 'Viewer',
      status: 'active' as const,
      login: { method: 'emailPassword' as const, pinSet: false },
    };
    await handle.admin.bulkPut('roles', [viewerRole]);
    await handle.admin.bulkPut('users', [viewerUser]);
    await handle.admin.bulkPut('roleAssignments', [
      {
        id: freshId(202),
        userId: viewerUser.id,
        roleIds: [viewerRole.id],
        scope: { type: 'clients', ids: [a] },
        grants: [],
        denies: [],
        status: 'active',
      },
    ]);
    return { store, admin: handle.admin, handle, fx, lf, viewerUserId: viewerUser.id, options };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });
  const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
  const jade = (s: S) => staff(s.fx.keys.users['jade'], s.fx.ids.clients.a);
  const hannah = (s: S) => staff(s.fx.keys.users['hannah'], s.fx.ids.clients.a);
  const priya = (s: S) => client(s.fx.ids.users.priya, s.fx.ids.clients.a);
  const gina = (s: S) => client(s.fx.ids.users.gina, s.fx.ids.clients.ot);
  const beth = (s: S) => client(s.fx.ids.users.beth, s.fx.ids.clients.b);
  const viewer = (s: S) => client(s.viewerUserId, s.fx.ids.clients.a);
  const readOnlyOwner = (s: S) => client(s.fx.ids.stateClients.readOnly.owner.id, s.fx.ids.clients.readOnly);
  const provider = (s: S): ActorContext => ({ userId: s.fx.ids.users.provOwner, side: 'provider', now: TODAY });
  const at = (ctx: ActorContext, now: string): ActorContext => ({ ...ctx, now });
  const jadeId = (s: S) => s.fx.keys.personas['jade'];
  const hannahId = (s: S) => s.fx.keys.personas['hannah'];

  let counter = 0;
  /** A built-in Knowledge Builder for Little Acorns, live at TODAY once published. */
  const competition = (s: S, over: Partial<Competition> = {}): Competition => ({
    id: freshId(300 + counter++),
    clientId: s.fx.ids.clients.a,
    type: 'builtIn',
    templateId: 'knowledgeBuilder',
    name: 'Contract Knowledge Builder',
    description: 'Answer questions correctly',
    startAt: START,
    endAt: END,
    prizeText: 'A box of biscuits for the staff room',
    eligibility: { excludePersonIds: [] },
    winnerSelection: 'top',
    winnerCount: 1,
    liveLeaderboard: true,
    status: 'draft',
    ...over,
  });
  const customCompetition = (s: S, over: Partial<Competition> = {}): Competition => ({
    id: freshId(300 + counter++),
    clientId: s.fx.ids.clients.a,
    type: 'custom',
    name: 'Contract custom',
    startAt: START,
    endAt: END,
    prizeText: 'Tea and cake',
    eligibility: { excludePersonIds: [] },
    status: 'draft',
    ...over,
  });
  const live = async (s: S, over: Partial<Competition> = {}): Promise<Competition> => {
    const c = await s.store.competitions.save(priya(s), competition(s, over));
    return s.store.competitions.publish(priya(s), c.id);
  };

  /** Jade answers `jadeRight` questions correctly and Hannah two, in separate attempts. */
  async function play(s: S, jadeRight = 4): Promise<void> {
    for (const [ctx, n] of [
      [jade(s), jadeRight],
      [hannah(s), 2],
    ] as const) {
      await completeLessons(s.store, ctx, s.lf.module);
      const attempt = await s.store.learning.startAttempt(ctx, s.lf.moduleId);
      for (const q of attempt.questionIds.slice(0, n)) {
        await s.store.learning.answer(ctx, { attemptId: attempt.id, questionId: q, optionId: `${q}-yes` });
      }
    }
  }

  const expectError = async (promise: Promise<unknown>, type: new (...args: never[]) => Error) => {
    const error = await refusal(promise);
    expect(error).toBeInstanceOf(type);
    return error as Error;
  };

  /** Every string key and value in a value, for deep scans. */
  const scan = (value: unknown, out: { keys: string[]; strings: string[] } = { keys: [], strings: [] }) => {
    if (typeof value === 'string') out.strings.push(value);
    else if (Array.isArray(value)) value.forEach((v) => scan(v, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        out.keys.push(k);
        scan(v, out);
      }
    }
    return out;
  };
  const activePeople = async (s: S): Promise<Person[]> =>
    ((await s.admin.dumpAll())['people'] as Person[]).filter(
      (p) => p.clientId === s.fx.ids.clients.a && p.primarySiteId === s.fx.ids.sites.main && p.status === 'active',
    );

  describe(`Competitions and leaderboards data layer: ${name}`, () => {
    describe('competitions: lifecycle and builder rules', () => {
      it('lets Priya create a draft, publish it, extend it and cancel it', async () => {
        const s = await setup();
        const saved = await s.store.competitions.save(priya(s), competition(s));
        expect(saved.status).toBe('draft');
        const published = await s.store.competitions.publish(priya(s), saved.id);
        expect(published.status).toBe('scheduled');
        expect((await s.store.competitions.list(priya(s))).map((c) => c.id)).toContain(saved.id);
        const later = '2026-10-30T00:00:00.000Z';
        expect((await s.store.competitions.extend(priya(s), saved.id, later)).endAt).toBe(later);
        expect((await s.store.competitions.get(priya(s), saved.id)).endAt).toBe(later);
        const cancelled = await s.store.competitions.cancel(priya(s), saved.id);
        expect(cancelled.status).toBe('cancelled');
      });

      it('updates an existing competition when saved again with the same id', async () => {
        const s = await setup();
        const c = await s.store.competitions.save(priya(s), competition(s));
        await s.store.competitions.save(priya(s), { ...c, name: 'Renamed contest' });
        const all = (await s.store.competitions.list(priya(s))).filter((x) => x.id === c.id);
        expect(all).toHaveLength(1);
        expect(all[0]!.name).toBe('Renamed contest');
      });

      it('lets a draft have an empty prize but refuses to publish it with prizeRequired', async () => {
        const s = await setup();
        const draft = await s.store.competitions.save(priya(s), competition(s, { prizeText: '' }));
        expect(await ruleOf(s.store.competitions.publish(priya(s), draft.id))).toBe('prizeRequired');
        expect((await s.store.competitions.get(priya(s), draft.id)).status).toBe('draft');
      });

      it('refuses an end that is not after the start with endBeforeStart', async () => {
        const s = await setup();
        expect(await ruleOf(s.store.competitions.save(priya(s), competition(s, { endAt: START })))).toBe(
          'endBeforeStart',
        );
      });

      it('refuses an invalid competition (name too long) with invalidCompetition and writes nothing', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.competitions.save(priya(s), competition(s, { name: 'x'.repeat(81) })))).toBe(
          'invalidCompetition',
        );
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('locks the template once the competition has started (metricLocked)', async () => {
        const s = await setup();
        const c = await live(s);
        expect(await ruleOf(s.store.competitions.save(priya(s), { ...c, templateId: 'scenarioSavvy' }))).toBe(
          'metricLocked',
        );
        expect(await ruleOf(s.store.competitions.save(priya(s), { ...c, moduleIds: [s.lf.moduleId] }))).toBe(
          'metricLocked',
        );
      });

      it('still lets a live competition change its name and prize', async () => {
        const s = await setup();
        const c = await live(s);
        const saved = await s.store.competitions.save(priya(s), { ...c, name: 'Live rename', prizeText: 'New prize' });
        expect(saved.name).toBe('Live rename');
      });

      it('refuses to shorten a live competition, by save or extend (endShortened)', async () => {
        const s = await setup();
        const c = await live(s);
        const earlier = '2026-10-22T00:00:00.000Z';
        expect(await ruleOf(s.store.competitions.save(priya(s), { ...c, endAt: earlier }))).toBe('endShortened');
        expect(await ruleOf(s.store.competitions.extend(priya(s), c.id, earlier))).toBe('endShortened');
        expect((await s.store.competitions.get(priya(s), c.id)).endAt).toBe(END);
      });

      it('refuses edits to a cancelled competition (competitionCancelled)', async () => {
        const s = await setup();
        const c = await live(s);
        const cancelled = await s.store.competitions.cancel(priya(s), c.id);
        expect(await ruleOf(s.store.competitions.save(priya(s), { ...cancelled, name: 'Too late' }))).toBe(
          'competitionCancelled',
        );
      });

      it('refuses to cancel or edit an ended competition (competitionEnded)', async () => {
        const s = await setup();
        const c = await live(s);
        expect(await ruleOf(s.store.competitions.cancel(at(priya(s), AFTER_END), c.id))).toBe('competitionEnded');
        expect(await ruleOf(s.store.competitions.save(at(priya(s), AFTER_END), { ...c, name: 'Late' }))).toBe(
          'competitionEnded',
        );
      });

      it('gives a custom competition no leaderboard and refuses a custom one with a template', async () => {
        const s = await setup();
        const custom = await s.store.competitions.save(priya(s), customCompetition(s));
        expect(custom.templateId).toBeUndefined();
        expect(
          await ruleOf(s.store.competitions.save(priya(s), customCompetition(s, { templateId: 'knowledgeBuilder' }))),
        ).toBe('invalidCompetition');
      });
    });

    describe('competitions: permissions, entitlements and account state', () => {
      it('refuses save and publish for a Viewer and for Jade (Forbidden)', async () => {
        const s = await setup();
        const c = await s.store.competitions.save(priya(s), competition(s));
        for (const ctx of [viewer(s), jade(s)]) {
          await expectError(s.store.competitions.save(ctx, competition(s)), ForbiddenError);
          await expectError(s.store.competitions.publish(ctx, c.id), ForbiddenError);
          await expectError(s.store.competitions.cancel(ctx, c.id), ForbiddenError);
        }
      });

      it('lets a Viewer read competitions with competitions.view', async () => {
        const s = await setup();
        const c = await live(s);
        expect((await s.store.competitions.list(viewer(s))).map((x) => x.id)).toContain(c.id);
        expect((await s.store.competitions.get(viewer(s), c.id)).id).toBe(c.id);
      });

      it('refuses a second live competition on Essentials (Willow Lane) with NotEntitledError', async () => {
        const s = await setup();
        const b = s.fx.ids.clients.b;
        const first = await s.store.competitions.save(beth(s), competition(s, { clientId: b }));
        await s.store.competitions.publish(beth(s), first.id);
        const second = await s.store.competitions.save(
          beth(s),
          competition(s, { clientId: b, name: 'Second contest' }),
        );
        await expectError(s.store.competitions.publish(beth(s), second.id), NotEntitledError);
        expect((await s.store.competitions.get(beth(s), second.id)).status).toBe('draft');
      });

      it('counts custom competitions towards the live limit on Essentials', async () => {
        const s = await setup();
        const b = s.fx.ids.clients.b;
        const first = await s.store.competitions.save(beth(s), customCompetition(s, { clientId: b }));
        await s.store.competitions.publish(beth(s), first.id);
        const second = await s.store.competitions.save(beth(s), competition(s, { clientId: b }));
        await expectError(s.store.competitions.publish(beth(s), second.id), NotEntitledError);
      });

      it('refuses a closed-book-only competition on Essentials with NotEntitledError', async () => {
        const s = await setup();
        const c = await s.store.competitions.save(
          beth(s),
          competition(s, { clientId: s.fx.ids.clients.b, closedBookOnly: true }),
        );
        await expectError(s.store.competitions.publish(beth(s), c.id), NotEntitledError);
      });

      it('tells the client admin what the package allows, and refuses staff', async () => {
        const s = await setup();
        expect((await s.store.competitions.entitlements(beth(s))).closedBookCompetitions).toBe(false);
        expect((await s.store.competitions.entitlements(viewer(s))).closedBookCompetitions).toBe(true);
        await expectError(s.store.competitions.entitlements(jade(s)), ForbiddenError);
      });

      it('lets Priya (entitled) publish a closed-book-only competition', async () => {
        const s = await setup();
        const c = await live(s, { closedBookOnly: true });
        expect(c.status).toBe('scheduled');
      });

      it('refuses creating a competition in a Read-only account (AccountStateError) while reads still work', async () => {
        const s = await setup();
        const ro = s.fx.ids.clients.readOnly;
        await expectError(
          s.store.competitions.save(readOnlyOwner(s), competition(s, { clientId: ro })),
          AccountStateError,
        );
        await expect(s.store.competitions.list(readOnlyOwner(s))).resolves.toEqual([]);
      });

      it('gives provider actors no access to competitions', async () => {
        const s = await setup();
        const c = await live(s);
        await expectError(s.store.competitions.list(provider(s)), DataError);
        await expectError(s.store.competitions.get(provider(s), c.id), DataError);
        await expectError(s.store.competitions.save(provider(s), competition(s)), DataError);
      });

      it('gives an Oak Tree admin NotFound on Little Acorns competitions and an empty list', async () => {
        const s = await setup();
        const c = await live(s);
        await expectError(s.store.competitions.get(gina(s), c.id), NotFoundError);
        expect((await s.store.competitions.list(gina(s))).map((x) => x.id)).not.toContain(c.id);
        await expectError(s.store.competitions.publish(gina(s), c.id), NotFoundError);
      });

      it('shows staff scheduled and live competitions only, never drafts or cancelled ones', async () => {
        const s = await setup();
        const draft = await s.store.competitions.save(priya(s), competition(s, { name: 'Draft one' }));
        const liveOne = await live(s, { name: 'Live one' });
        const gone = await live(s, { name: 'Gone one' });
        await s.store.competitions.cancel(priya(s), gone.id);
        const ids = (await s.store.competitions.list(hannah(s))).map((c) => c.id);
        expect(ids).toContain(liveOne.id);
        expect(ids).not.toContain(draft.id);
        expect(ids).not.toContain(gone.id);
        await expectError(s.store.competitions.get(hannah(s), draft.id), NotFoundError);
        await expectError(s.store.competitions.get(hannah(s), gone.id), NotFoundError);
        expect((await s.store.competitions.get(hannah(s), liveOne.id)).id).toBe(liveOne.id);
      });

      it('writes a slim audit event for each write, with no names or prize text', async () => {
        const s = await setup();
        const c = await live(s);
        await s.store.competitions.extend(priya(s), c.id, '2026-10-28T00:00:00.000Z');
        await s.store.competitions.cancel(priya(s), c.id);
        const events = ((await s.admin.dumpAll())['audit'] as { action: string; target: string }[]).filter((e) =>
          e.action.startsWith('competitions.'),
        );
        const actions = events.map((e) => e.action);
        for (const expected of [
          'competitions.saved',
          'competitions.published',
          'competitions.extended',
          'competitions.cancelled',
        ])
          expect(actions).toContain(expected);
        const text = JSON.stringify(events);
        expect(text).not.toContain('biscuits');
        expect(text).not.toContain('Contract Knowledge Builder');
      });

      it('notifies competitions and audit when a competition is published', async () => {
        const s = await setup();
        const c = await s.store.competitions.save(priya(s), competition(s));
        const calls: string[][] = [];
        s.handle.subscribe((stores) => calls.push([...stores]));
        await s.store.competitions.publish(priya(s), c.id);
        expect(calls).toHaveLength(1);
        expect([...calls[0]!].sort()).toEqual(['audit', 'competitions']);
        await refusal(s.store.competitions.publish(jade(s), c.id));
        expect(calls).toHaveLength(1);
      });
    });

    describe('competitions: standings and projections', () => {
      it('ranks people by the template metric: Jade 4, Hannah 2, for staff and for admins', async () => {
        const s = await setup();
        const c = await live(s);
        await play(s);
        const forHannah = await s.store.competitions.standings(hannah(s), c.id);
        expect(forHannah.visible).toBe(true);
        expect(forHannah.rows!.map((r) => [r.rank, r.name, r.value])).toEqual([
          [1, 'Jade M.', 4],
          [2, 'Hannah P.', 2],
        ]);
        expect(forHannah.rows!.find((r) => r.name === 'Hannah P.')!.isViewer).toBe(true);
        expect(forHannah.viewer).toMatchObject({ rank: 2, value: 2, toNext: 2, hidden: false });
        const forPriya = await s.store.competitions.standings(priya(s), c.id);
        expect(forPriya.rows!.map((r) => [r.rank, r.name, r.value, r.personId])).toEqual([
          [1, 'Jade M.', 4, jadeId(s)],
          [2, 'Hannah P.', 2, hannahId(s)],
        ]);
      });

      it('counts only events inside the window: nothing before the start counts', async () => {
        const s = await setup();
        const c = await live(s, { startAt: '2026-10-20T00:00:00.000Z', endAt: END });
        // TODAY is 19 October: before the start, so scheduled and not live. Play happens, nothing counts.
        await play(s);
        const view = await s.store.competitions.standings(priya(s), c.id);
        expect(view.rows ?? []).toEqual([]);
      });

      it('gives staff no other person id anywhere in the standings (deep scan)', async () => {
        const s = await setup();
        const c = await live(s);
        await play(s);
        const others = (await activePeople(s)).map((p) => p.id).filter((id) => id !== hannahId(s));
        expect(others).toContain(jadeId(s));
        for (const ctx of [hannah(s), at(hannah(s), AFTER_END)]) {
          const view = await s.store.competitions.standings(ctx, c.id);
          const found = scan(view);
          expect(found.keys).not.toContain('personId');
          expect(found.keys).not.toContain('teamId');
          for (const id of others) expect(found.strings).not.toContain(id);
        }
        await s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id);
        const afterWinners = scan(await s.store.competitions.standings(at(hannah(s), AFTER_END), c.id));
        expect(afterWinners.keys).not.toContain('personId');
        for (const id of others) expect(afterWinners.strings).not.toContain(id);
      });

      it('hides rows from staff while the live leaderboard is off, shows them after the end, admins always see rows', async () => {
        const s = await setup();
        const c = await live(s, { liveLeaderboard: false });
        await play(s);
        const during = await s.store.competitions.standings(hannah(s), c.id);
        expect(during.rows ?? []).toEqual([]);
        // They still see their own progress.
        expect(during.viewer).toMatchObject({ value: 2 });
        const admin = await s.store.competitions.standings(priya(s), c.id);
        expect(admin.rows!.map((r) => r.value)).toEqual([4, 2]);
        const after = await s.store.competitions.standings(at(hannah(s), AFTER_END), c.id);
        expect(after.rows!.map((r) => r.value)).toEqual([4, 2]);
      });

      it('gives a custom competition { visible: false } standings', async () => {
        const s = await setup();
        const c = await s.store.competitions.save(priya(s), customCompetition(s));
        await s.store.competitions.publish(priya(s), c.id);
        expect((await s.store.competitions.standings(hannah(s), c.id)).visible).toBe(false);
        expect((await s.store.competitions.standings(priya(s), c.id)).visible).toBe(false);
      });

      it('removes a hidden person from admin and staff views and from the "of" count, but not from their own', async () => {
        const s = await setup();
        const c = await live(s);
        await play(s);
        const beforeOf = (await s.store.competitions.standings(hannah(s), c.id)).viewer!.of;
        await s.store.me.updateProfile(jade(s), { hideFromLeaderboards: true });

        const forHannah = await s.store.competitions.standings(hannah(s), c.id);
        expect(forHannah.rows!.map((r) => r.name)).toEqual(['Hannah P.']);
        expect(forHannah.viewer).toMatchObject({ rank: 1, hidden: false });
        expect(forHannah.viewer!.of).toBe(beforeOf - 1);
        expect(JSON.stringify(forHannah)).not.toContain('Jade');

        const forPriya = await s.store.competitions.standings(priya(s), c.id);
        expect(forPriya.rows!.map((r) => r.name)).toEqual(['Hannah P.']);
        expect(forPriya.rows!.map((r) => r.personId)).not.toContain(jadeId(s));
        expect(JSON.stringify(forPriya)).not.toContain('Jade');

        const forJade = await s.store.competitions.standings(jade(s), c.id);
        expect(forJade.viewer).toMatchObject({ rank: 1, value: 4, hidden: true });
      });

      it('gives eligible-only rankings: an excluded person is not ranked', async () => {
        const s = await setup();
        const c = await live(s, { eligibility: { excludePersonIds: [jadeId(s)] } });
        await play(s);
        const view = await s.store.competitions.standings(priya(s), c.id);
        expect(view.rows!.map((r) => r.name)).toEqual(['Hannah P.']);
      });

      it('shows staff of another client nothing: Oak Tree staff get NotFound on standings', async () => {
        const s = await setup();
        const c = await live(s);
        await expectError(s.store.competitions.standings(gina(s), c.id), NotFoundError);
      });
    });

    describe('competitions: winners', () => {
      it('refuses recordWinners before the end with notEnded', async () => {
        const s = await setup();
        const c = await live(s);
        expect(await ruleOf(s.store.competitions.recordWinners(priya(s), c.id))).toBe('notEnded');
      });

      it('records the top winner after the end and stores final standings', async () => {
        const s = await setup();
        const c = await live(s);
        await play(s);
        const done = await s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id);
        expect(done.winners?.map((w) => w.personId)).toEqual([jadeId(s)]);
        expect(done.finalStandings).toBeDefined();
        const stored = await s.store.competitions.get(priya(s), c.id);
        expect(stored.winners).toHaveLength(1);
        expect(stored.winners![0]!.recordedAt).toBe(AFTER_END);
      });

      it('refuses to record winners twice with winnersRecorded and keeps the first result', async () => {
        const s = await setup();
        const c = await live(s);
        await play(s);
        await s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id);
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id))).toBe('winnersRecorded');
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('refuses recordWinners for staff and Viewers', async () => {
        const s = await setup();
        const c = await live(s);
        await expectError(s.store.competitions.recordWinners(at(jade(s), AFTER_END), c.id), ForbiddenError);
        await expectError(s.store.competitions.recordWinners(at(viewer(s), AFTER_END), c.id), ForbiddenError);
      });

      it('includes everyone tied at the last winning place for top selection', async () => {
        const s = await setup();
        const c = await live(s);
        await play(s, 2); // Jade 2, Hannah 2: a tie for first
        const done = await s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id);
        expect(done.winners!.map((w) => w.personId).sort()).toEqual([jadeId(s), hannahId(s)].sort());
      });

      it('draws winners reproducibly for a fixed seed, from people who qualify only', async () => {
        const runOnce = async () => {
          const s = await setup();
          const c = await live(s, { winnerSelection: 'draw', winnerCount: 1 });
          await play(s);
          const done = await s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id);
          return { winners: done.winners!.map((w) => w.personId), jade: jadeId(s), hannah: hannahId(s) };
        };
        const one = await runOnce();
        const two = await runOnce();
        expect(one.winners).toHaveLength(1);
        expect(one.winners).toEqual(two.winners);
        expect([one.jade, one.hannah]).toContain(one.winners[0]);
      });

      it('includes a hidden person in a draw but shows staff "A colleague" instead of their name', async () => {
        const s = await setup();
        // Only Jade qualifies, so the draw must pick her whether or not she hides.
        const c = await live(s, {
          winnerSelection: 'draw',
          winnerCount: 1,
          eligibility: { excludePersonIds: [hannahId(s)] },
        });
        await play(s);
        await s.store.me.updateProfile(jade(s), { hideFromLeaderboards: true });
        const done = await s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id);
        expect(done.winners!.map((w) => w.personId)).toEqual([jadeId(s)]);
        const staffView = await s.store.competitions.standings(at(hannah(s), AFTER_END), c.id);
        expect(staffView.winners).toEqual([{ hidden: true }]);
        expect(JSON.stringify(staffView)).not.toContain('Jade');
        const adminView = await s.store.competitions.standings(at(priya(s), AFTER_END), c.id);
        expect(adminView.winners).toEqual([{ name: 'Jade M.', hidden: false }]);
      });

      it('shows staff the winner by display name after the winners are recorded', async () => {
        const s = await setup();
        const c = await live(s);
        await play(s);
        await s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id);
        const view = await s.store.competitions.standings(at(hannah(s), AFTER_END), c.id);
        expect(view.winners).toEqual([{ name: 'Jade M.', hidden: false }]);
      });

      it('notifies competitions and audit when winners are recorded and audits without names', async () => {
        const s = await setup();
        const c = await live(s);
        await play(s);
        const calls: string[][] = [];
        s.handle.subscribe((stores) => calls.push([...stores]));
        await s.store.competitions.recordWinners(at(priya(s), AFTER_END), c.id);
        expect(calls.flat()).toEqual(expect.arrayContaining(['competitions', 'audit']));
        const audits = ((await s.admin.dumpAll())['audit'] as { action: string }[]).filter(
          (e) => e.action === 'competitions.winnersRecorded',
        );
        expect(audits).toHaveLength(1);
        expect(JSON.stringify(audits)).not.toContain('Jade');
      });
    });

    describe('leaderboards', () => {
      it('ranks Jade first and Hannah second on Most questions answered correctly, All time, with "of N"', async () => {
        const s = await setup();
        await play(s);
        const expectedOf = (await activePeople(s)).length;
        const forJade = await s.store.leaderboards.standing(jade(s), { board: 'correctQuestions', period: 'allTime' });
        expect(forJade.visible).toBe(true);
        expect(forJade.rows!.map((r) => [r.rank, r.name, r.value])).toEqual([
          [1, 'Jade M.', 4],
          [2, 'Hannah P.', 2],
        ]);
        expect(forJade.viewer).toMatchObject({ rank: 1, value: 4, toNext: null, hidden: false });
        expect(forJade.viewer!.of).toBe(expectedOf);
        const forHannah = await s.store.leaderboards.standing(hannah(s), {
          board: 'correctQuestions',
          period: 'allTime',
        });
        expect(forHannah.viewer).toMatchObject({ rank: 2, value: 2, toNext: 2 });
      });

      it('tells a person with nothing yet that they are not on the board', async () => {
        const s = await setup();
        const view = await s.store.leaderboards.standing(jade(s), { board: 'correctQuestions', period: 'allTime' });
        expect(view.rows ?? []).toEqual([]);
        expect(view.viewer).toMatchObject({ rank: null, value: 0 });
      });

      it('counts Most modules completed once per module', async () => {
        const s = await setup();
        await completeLessons(s.store, jade(s), s.lf.module);
        const attempt = await s.store.learning.startAttempt(jade(s), s.lf.moduleId);
        for (const q of attempt.questionIds) {
          await s.store.learning.answer(jade(s), { attemptId: attempt.id, questionId: q, optionId: `${q}-yes` });
        }
        await s.store.learning.finishAttempt(jade(s), attempt.id);
        const view = await s.store.leaderboards.standing(hannah(s), { board: 'modulesCompleted', period: 'allTime' });
        expect(view.rows!.map((r) => [r.name, r.value])).toEqual([['Jade M.', 1]]);
      });

      it('separates This month from All time by London calendar month', async () => {
        const s = await setup();
        await play(s);
        const thisMonth = await s.store.leaderboards.standing(jade(s), {
          board: 'correctQuestions',
          period: 'thisMonth',
        });
        expect(thisMonth.rows!.map((r) => r.value)).toEqual([4, 2]);
        const nextMonth = await s.store.leaderboards.standing(at(jade(s), NEXT_MONTH), {
          board: 'correctQuestions',
          period: 'thisMonth',
        });
        expect(nextMonth.rows ?? []).toEqual([]);
        const allTime = await s.store.leaderboards.standing(at(jade(s), NEXT_MONTH), {
          board: 'correctQuestions',
          period: 'allTime',
        });
        expect(allTime.rows!.map((r) => r.value)).toEqual([4, 2]);
      });

      it('gives staff no ids, and admins see only ranked people', async () => {
        const s = await setup();
        await play(s);
        const others = (await activePeople(s)).map((p) => p.id).filter((id) => id !== hannahId(s));
        const found = scan(
          await s.store.leaderboards.standing(hannah(s), { board: 'correctQuestions', period: 'allTime' }),
        );
        expect(found.keys).not.toContain('personId');
        for (const id of others) expect(found.strings).not.toContain(id);
        const admin = await s.store.leaderboards.standing(priya(s), { board: 'correctQuestions', period: 'allTime' });
        expect(admin.visible).toBe(true);
        expect(admin.rows!.map((r) => r.name)).toEqual(['Jade M.', 'Hannah P.']);
      });

      it("leaves a hidden person out of others' rows and counts but keeps their private position", async () => {
        const s = await setup();
        await play(s);
        const beforeOf = (
          await s.store.leaderboards.standing(hannah(s), { board: 'correctQuestions', period: 'allTime' })
        ).viewer!.of;
        await s.store.me.updateProfile(jade(s), { hideFromLeaderboards: true });
        const forHannah = await s.store.leaderboards.standing(hannah(s), {
          board: 'correctQuestions',
          period: 'allTime',
        });
        expect(forHannah.rows!.map((r) => r.name)).toEqual(['Hannah P.']);
        expect(forHannah.viewer!.of).toBe(beforeOf - 1);
        const forPriya = await s.store.leaderboards.standing(priya(s), {
          board: 'correctQuestions',
          period: 'allTime',
        });
        expect(forPriya.rows!.map((r) => r.name)).toEqual(['Hannah P.']);
        const forJade = await s.store.leaderboards.standing(jade(s), { board: 'correctQuestions', period: 'allTime' });
        expect(forJade.viewer).toMatchObject({ rank: 1, value: 4, hidden: true });
        expect(forJade.rows!.map((r) => r.name)).toEqual(['Hannah P.']);
      });

      it('excludes people on leave from the ranked count', async () => {
        const s = await setup();
        const people = await activePeople(s);
        const onLeave = people.find((p) => p.id !== jadeId(s) && p.id !== hannahId(s))!;
        await s.admin.bulkPut('people', [{ ...onLeave, status: 'onLeave' }]);
        const view = await s.store.leaderboards.standing(jade(s), { board: 'correctQuestions', period: 'allTime' });
        expect(view.viewer!.of).toBe((await activePeople(s)).length);
      });

      it('returns { visible: false, off: true } once a board is switched off, for staff and admins, and leaves other boards on', async () => {
        const s = await setup();
        await play(s);
        const current = await s.store.leaderboards.settings(priya(s));
        await s.store.leaderboards.saveSettings(priya(s), {
          ...current,
          boards: { ...current.boards, correctQuestions: { enabled: false, staffScopes: ['site'] } },
        });
        const off = await s.store.leaderboards.standing(jade(s), { board: 'correctQuestions', period: 'allTime' });
        expect(off).toMatchObject({ visible: false, off: true });
        expect(
          await s.store.leaderboards.standing(priya(s), { board: 'correctQuestions', period: 'allTime' }),
        ).toMatchObject({
          visible: false,
          off: true,
        });
        const other = await s.store.leaderboards.standing(jade(s), { board: 'modulesCompleted', period: 'allTime' });
        expect(other.visible).toBe(true);
        expect((await s.store.leaderboards.settings(priya(s))).boards.correctQuestions?.enabled).toBe(false);
      });

      it('refuses saveSettings without competitions.manage (Viewer, staff, provider) and changes nothing', async () => {
        const s = await setup();
        const current = await s.store.leaderboards.settings(priya(s));
        const next = {
          ...current,
          boards: { ...current.boards, correctQuestions: { enabled: false, staffScopes: ['site' as const] } },
        };
        const before = await s.admin.dumpAll();
        await expectError(s.store.leaderboards.saveSettings(viewer(s), next), ForbiddenError);
        await expectError(s.store.leaderboards.saveSettings(jade(s), next), ForbiddenError);
        await expectError(s.store.leaderboards.saveSettings(provider(s), next), DataError);
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('shows an Oak Tree admin only Oak Tree people, never Little Acorns names', async () => {
        const s = await setup();
        await play(s);
        const view = await s.store.leaderboards.standing(gina(s), { board: 'correctQuestions', period: 'allTime' });
        expect(JSON.stringify(view)).not.toMatch(/Jade|Hannah/);
        expect((await s.store.leaderboards.settings(gina(s))).clientId).toBe(s.fx.ids.clients.ot);
      });

      it('lets a Read-only account (Little Stars) staff member read the board but not change settings', async () => {
        const s = await setup();
        const ro = s.fx.ids.clients.readOnly;
        const view = await s.store.leaderboards.standing(readOnlyOwner(s), {
          board: 'correctQuestions',
          period: 'allTime',
        });
        expect(view.visible).toBe(true);
        const current = await s.store.leaderboards.settings(readOnlyOwner(s));
        expect(current.clientId).toBe(ro);
        await expectError(s.store.leaderboards.saveSettings(readOnlyOwner(s), current), AccountStateError);
      });

      it('notifies standingBoardSettings when settings are saved', async () => {
        const s = await setup();
        const current = await s.store.leaderboards.settings(priya(s));
        const calls: string[][] = [];
        s.handle.subscribe((stores) => calls.push([...stores]));
        await s.store.leaderboards.saveSettings(priya(s), current);
        expect(calls.flat()).toContain('standingBoardSettings');
      });

      it('gives provider actors no access to boards', async () => {
        const s = await setup();
        await expectError(
          s.store.leaderboards.standing(provider(s), { board: 'correctQuestions', period: 'allTime' }),
          DataError,
        );
      });
    });
  });
}

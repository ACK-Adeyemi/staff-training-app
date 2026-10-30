// M4 chunk 6b contract tests: a provider publishes a new module version to CHOSEN clients (plan docs/plans/m4.md
// chunk 6, BP-4). Written before the implementation, so the new method is described by the local types below.
//   - `store.authoring.publishToClients(ctx, moduleId, { summary, clientIds })` returns `{ module, notices }`.
//   - The module must be a provider module that is already published and has a pending draft (saved with
//     saveDraft). The call publishes that draft as the next version (snapshotting the old one in moduleVersions).
//   - It needs the provider permission content.write. Client and staff actors, and a provider user without it
//     (Support), get ForbiddenError and nothing is written.
//   - ONE batch writes: the module and its snapshot, the draft removal, a ModulePlacement (availableToAll true) for
//     each chosen client that has none, ONE ModuleNotice per chosen client (clientId, moduleId, fromVersion,
//     toVersion, summary, publishedBy, publishedAt = ctx.now) and ONE audit event 'authoring.publishToClients'.
//   - An empty or duplicated client list, an unknown client, an unknown module, an empty summary, a client-owned
//     module or a module with no pending draft is a RuleError. Nothing is written.
//   - Notice ids come from the seeded RNG, so the same seed gives the same ids.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  type AuditEvent,
  type LearningEvent,
  type Module,
  type ModuleNotice,
  type ModulePlacement,
  type ModuleVersion,
  type Question,
} from '@sta/domain';
import { ForbiddenError, type ActorContext, type ModuleInput, type StoreHandle, type StoreOptions } from '../types';
import { refusal } from './learning';
import { buildWorld, freshId, TODAY } from './world';

type PublishResult = { module: Module; notices: ModuleNotice[] };
export type ProviderPublishStore = {
  authoring: {
    create(ctx: ActorContext, input: ModuleInput): Promise<Module>;
    saveDraft(ctx: ActorContext, moduleId: string, input: ModuleInput): Promise<Module>;
    publish(ctx: ActorContext, moduleId: string, o: { reassign: boolean }): Promise<unknown>;
    getVersion(ctx: ActorContext, moduleId: string, version: number): Promise<Module>;
    publishToClients(
      ctx: ActorContext,
      moduleId: string,
      input: { summary: string; clientIds: string[] },
    ): Promise<PublishResult>;
  };
};

const NOW = '2026-10-21T10:30:00.000Z'; // differs from the clock (TODAY) so ctx.now use is provable
const SUMMARY = 'Fire exits changed: the hall door is now the main route.';

const mcq = (qid: string): Question => ({
  id: qid,
  type: 'mcq',
  prompt: `Where is the ${qid} exit?`,
  options: [
    { id: `${qid}-yes`, text: 'By the hall', correct: true },
    { id: `${qid}-no`, text: 'Behind the shed', correct: false },
  ],
  explanation: 'The hall exit is the signed one.',
  learnMore: [],
  tags: [],
});
const goodInput = (requirementId: string, over: Partial<ModuleInput> = {}): ModuleInput => ({
  title: 'Fire drills',
  description: 'How we run a fire drill',
  estimatedMinutes: 5,
  language: 'en-GB',
  requirementIds: [requirementId],
  roleTags: [],
  lessons: [
    { id: 'intro', title: 'Introduction', minutes: 3, blocks: [{ kind: 'text', markdown: 'Know the exits.' }] },
  ],
  questions: [mcq('q1'), mcq('q2')],
  quiz: {
    mode: 'mcq',
    drawCount: 2,
    shuffleQuestions: true,
    shuffleOptions: true,
    passMark: 80,
    maxRetakes: null,
    feedback: true,
    showSourceRef: true,
    notesInQuiz: 'choice',
    learnMoreFor: 'all',
  },
  ...over,
});

export function runProviderPublishContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup(seed = 7) {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(seed) });
    const fx = await buildWorld(handle.admin);
    const store = (handle.store as unknown as ProviderPublishStore).authoring;
    const u = fx.ids.users;
    const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });
    const dump = async <T>(s: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[s] ?? [];
    const owner = provider(u.provOwner);
    const req = fx.ids.requirementId;
    // A published provider module at version 1 with a pending version 2 draft.
    const m = await store.create(owner, goodInput(req));
    await store.publish(owner, m.id, { reassign: false });
    await store.saveDraft(owner, m.id, goodInput(req, { title: 'Fire drills v2' }));
    const { a, b, ot } = fx.ids.clients;
    const pub = { ...owner, now: NOW };
    return {
      handle,
      store,
      fx,
      dump,
      m,
      a,
      b,
      ot,
      req,
      owner: pub,
      support: { userId: u.support, side: 'provider', now: NOW } as ActorContext,
      priya: { userId: u.priya, side: 'client', clientId: a, now: NOW } as ActorContext,
      jade: { userId: u.jade, side: 'staff', clientId: a, now: NOW } as ActorContext,
      snapshot: async () => structuredClone(await handle.admin.dumpAll()),
    };
  }
  const placementsFor = (all: ModulePlacement[], moduleId: string) => all.filter((p) => p.moduleId === moduleId);

  describe(`M4 provider publish to chosen clients: ${name}`, () => {
    it('publishes the pending draft as the next version and returns it', async () => {
      const s = await setup();
      const r = await s.store.publishToClients(s.owner, s.m.id, { summary: SUMMARY, clientIds: [s.a, s.b] });
      expect(r.module).toMatchObject({
        id: s.m.id,
        owner: 'provider',
        status: 'published',
        version: 2,
        title: 'Fire drills v2',
      });
      const stored = (await s.dump<Module>('modules')).find((x) => x.id === s.m.id);
      expect(stored).toMatchObject({ version: 2, title: 'Fire drills v2' });
    });

    it('writes exactly one ModuleNotice per chosen client with the what-changed text and ctx.now', async () => {
      const s = await setup();
      const r = await s.store.publishToClients(s.owner, s.m.id, { summary: SUMMARY, clientIds: [s.a, s.b] });
      expect(r.notices).toHaveLength(2);
      const stored = (await s.dump<ModuleNotice>('moduleNotices')).filter((n) => n.moduleId === s.m.id);
      expect(stored.map((n) => n.clientId).sort()).toEqual([s.a, s.b].sort());
      for (const n of stored) {
        expect(n).toMatchObject({
          summary: SUMMARY,
          fromVersion: 1,
          toVersion: 2,
          publishedBy: s.fx.ids.users.provOwner,
          publishedAt: NOW,
        });
        expect(n.seenAt).toBeUndefined();
      }
      expect(r.notices.map((n) => n.id).sort()).toEqual(stored.map((n) => n.id).sort());
    });

    it('gives only the chosen clients a placement and a notice, and leaves the others unchanged', async () => {
      const s = await setup();
      const before = placementsFor(await s.dump<ModulePlacement>('modulePlacements'), s.m.id);
      expect(before).toEqual([]);
      await s.store.publishToClients(s.owner, s.m.id, { summary: SUMMARY, clientIds: [s.a] });
      const placements = placementsFor(await s.dump<ModulePlacement>('modulePlacements'), s.m.id);
      expect(placements).toHaveLength(1);
      expect(placements[0]).toMatchObject({ clientId: s.a, moduleId: s.m.id, availableToAll: true });
      const notices = (await s.dump<ModuleNotice>('moduleNotices')).filter((n) => n.moduleId === s.m.id);
      expect(notices.map((n) => n.clientId)).toEqual([s.a]);
      expect(notices.map((n) => n.clientId)).not.toContain(s.b);
      expect(notices.map((n) => n.clientId)).not.toContain(s.ot);
    });

    it('keeps an existing placement category for a chosen client', async () => {
      const s = await setup();
      await s.handle.admin.bulkPut('modulePlacements', [
        { clientId: s.a, moduleId: s.m.id, categoryId: freshId(5001), availableToAll: false },
      ]);
      await s.store.publishToClients(s.owner, s.m.id, { summary: SUMMARY, clientIds: [s.a] });
      const mine = placementsFor(await s.dump<ModulePlacement>('modulePlacements'), s.m.id).filter(
        (p) => p.clientId === s.a,
      );
      expect(mine).toHaveLength(1);
      expect(mine[0]!.categoryId).toBe(freshId(5001));
    });

    it('writes one authoring.publishToClients audit event with the actor and ctx.now', async () => {
      const s = await setup();
      await s.store.publishToClients(s.owner, s.m.id, { summary: SUMMARY, clientIds: [s.a, s.b] });
      const events = (await s.dump<AuditEvent>('audit')).filter((e) => e.action === 'authoring.publishToClients');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorId: s.fx.ids.users.provOwner, actorSide: 'provider', at: NOW });
    });

    it('is deterministic: the same seed and input give the same notice ids', async () => {
      const one = await setup(11);
      const two = await setup(11);
      const r1 = await one.store.publishToClients(one.owner, one.m.id, { summary: SUMMARY, clientIds: [one.a, one.b] });
      const r2 = await two.store.publishToClients(two.owner, two.m.id, { summary: SUMMARY, clientIds: [two.a, two.b] });
      const strip = (r: PublishResult) => r.notices.map((n) => ({ ...n, moduleId: '' }));
      expect(strip(r1).map((n) => n.id)).toEqual(strip(r2).map((n) => n.id));
      expect(strip(r1)).toEqual(strip(r2));
    });

    it('keeps version 1 readable and a learner completion on version 1 untouched', async () => {
      const s = await setup();
      const jade = s.fx.keys.personas['jade'];
      const event: LearningEvent = {
        id: freshId(5100),
        clientId: s.a,
        siteId: s.fx.ids.sites.main,
        personId: jade,
        at: TODAY,
        type: 'moduleCompleted',
        moduleId: s.m.id,
        moduleVersion: 1,
      };
      await s.handle.admin.bulkPut('learningEvents', [event]);
      await s.store.publishToClients(s.owner, s.m.id, { summary: SUMMARY, clientIds: [s.a] });
      expect((await s.store.getVersion(s.owner, s.m.id, 1)).title).toBe('Fire drills');
      expect((await s.store.getVersion(s.owner, s.m.id, 2)).title).toBe('Fire drills v2');
      const snaps = (await s.dump<ModuleVersion>('moduleVersions')).filter((v) => v.moduleId === s.m.id);
      expect(snaps.map((v) => v.version)).toEqual([1]);
      const kept = (await s.dump<LearningEvent>('learningEvents')).find((e) => e.id === event.id);
      expect(kept).toEqual(event);
    });

    describe('who may publish', () => {
      it('denies a client actor and writes nothing', async () => {
        const s = await setup();
        const before = await s.snapshot();
        const err = await refusal(s.store.publishToClients(s.priya, s.m.id, { summary: SUMMARY, clientIds: [s.a] }));
        expect(err).toBeInstanceOf(ForbiddenError);
        expect(await s.handle.admin.dumpAll()).toEqual(before);
      });

      it('denies a staff actor and writes nothing', async () => {
        const s = await setup();
        const before = await s.snapshot();
        const err = await refusal(s.store.publishToClients(s.jade, s.m.id, { summary: SUMMARY, clientIds: [s.a] }));
        expect(err).toBeInstanceOf(ForbiddenError);
        expect(await s.handle.admin.dumpAll()).toEqual(before);
      });

      it('denies a provider user without content.write (Support) and writes nothing', async () => {
        const s = await setup();
        const before = await s.snapshot();
        const err = await refusal(s.store.publishToClients(s.support, s.m.id, { summary: SUMMARY, clientIds: [s.a] }));
        expect(err).toBeInstanceOf(ForbiddenError);
        expect(await s.handle.admin.dumpAll()).toEqual(before);
        expect(await s.dump<ModuleNotice>('moduleNotices')).toEqual([]);
      });
    });

    describe('bad input', () => {
      const bad: [
        string,
        (s: Awaited<ReturnType<typeof setup>>) => { moduleId: string; summary: string; clientIds: string[] },
      ][] = [
        ['an empty client list', (s) => ({ moduleId: s.m.id, summary: SUMMARY, clientIds: [] })],
        ['an unknown client', (s) => ({ moduleId: s.m.id, summary: SUMMARY, clientIds: [s.a, freshId(5200)] })],
        ['a repeated client', (s) => ({ moduleId: s.m.id, summary: SUMMARY, clientIds: [s.a, s.a] })],
        ['an unknown module', (s) => ({ moduleId: freshId(5201), summary: SUMMARY, clientIds: [s.a] })],
        ['an empty what-changed text', (s) => ({ moduleId: s.m.id, summary: '   ', clientIds: [s.a] })],
      ];
      for (const [label, make] of bad) {
        it(`refuses ${label} with a RuleError and writes nothing`, async () => {
          const s = await setup();
          const before = await s.snapshot();
          const i = make(s);
          const err = await refusal(
            s.store.publishToClients(s.owner, i.moduleId, { summary: i.summary, clientIds: i.clientIds }),
          );
          expect((err as { code?: string }).code).toBe('rule');
          expect(await s.handle.admin.dumpAll()).toEqual(before);
        });
      }

      it('refuses a module with no pending draft with a RuleError and writes nothing', async () => {
        const s = await setup();
        await s.store.publishToClients(s.owner, s.m.id, { summary: SUMMARY, clientIds: [s.a] });
        const before = await s.snapshot();
        const err = await refusal(s.store.publishToClients(s.owner, s.m.id, { summary: SUMMARY, clientIds: [s.b] }));
        expect((err as { code?: string }).code).toBe('rule');
        expect(await s.handle.admin.dumpAll()).toEqual(before);
      });
    });
  });
}

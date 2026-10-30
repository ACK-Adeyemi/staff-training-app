// M5 chunk 10 (F-7 client admin part, plan docs/plans/m5.md; brief 20.7, brief 08): store.ai.draftFromPolicy,
// store.ai.suggestQuestions, store.authoring.markAiChecked and the publish refusal. Runs against every adapter.
// Written before the implementation, so the new methods are described by the local types below.
//   ai.draftFromPolicy(ctx, { text }) => { label: 'Demo AI'; title; lessons; questions }  (domain draftFromPolicy; the
//     draft is only RETURNED. Nothing is stored: the admin saves it through authoring.create/saveDraft.)
//   ai.suggestQuestions(ctx, { lesson }) => { label: 'Demo AI'; questions }  (domain suggestQuestions on the given lesson,
//     which may be unsaved; seeded store rng)
//   Check order for both: provider side or no modules.manage (ForbiddenError 'permission'); account state
//     (AccountStateError feature 'usageAddOns') before entitlement; the P22 kill switch and a missing add-on
//     (NotEntitledError 'aiAssistant'); input (RuleError 'policyEmpty' / 'policyTooLong' for draftFromPolicy; a lesson with
//     no text gives ValidationError); then the usage cap (RuleError 'usageCapReached'). A refused call counts nothing.
//     One successful call adds exactly one usage unit and writes nothing else (no module, draft, event; the audit log
//     holds no pasted text).
//   authoring.markAiChecked(ctx, moduleId, { kind: 'lesson' | 'question', id }) => Module: needs content.write like
//     saveDraft; sets aiReviewedBy to ctx.userId on that AI-drafted item of the working copy (the module row for a
//     never-published module, the ModuleDraft for a published one); audits 'authoring.markAiChecked' with ids only.
//     An unknown item, or one that is not aiDrafted, gives NotFoundError.
//   authoring.publish refuses with RuleError('checklistFailed') while an AI-drafted item has no aiReviewedBy.
//   authoring.saveDraft/create never accept an aiReviewedBy that markAiChecked did not set: a value on an item that was not
//     already checked in the stored copy is dropped (no forging the review through the form).
import { describe, expect, it } from 'vitest';
import { addOnIds } from '@sta/content';
import {
  createRng,
  fixedClock,
  type AddOnSubscription,
  type Lesson,
  type Module,
  type ModuleDraft,
  type Question,
} from '@sta/domain';
import {
  AccountStateError,
  ForbiddenError,
  NotEntitledError,
  NotFoundError,
  type ActorContext,
  type StoreHandle,
  type StoreOptions,
} from '../types';
import { refusal, ruleOf, addLearningFixture } from './learning';
import { buildWorld, TODAY } from './world';

type Draft = { label: string; title: string; lessons: Lesson[]; questions: Question[] };
type ModuleInput = Omit<Module, 'id' | 'owner' | 'status' | 'version' | 'updatedAt' | 'duplicatedFrom'>;
type DraftStore = {
  ai: {
    draftFromPolicy(ctx: ActorContext, input: { text: string }): Promise<Draft>;
    suggestQuestions(ctx: ActorContext, input: { lesson: Lesson }): Promise<{ label: string; questions: Question[] }>;
  };
  authoring: {
    create(ctx: ActorContext, input: ModuleInput): Promise<Module>;
    saveDraft(ctx: ActorContext, moduleId: string, input: ModuleInput): Promise<Module>;
    publish(ctx: ActorContext, moduleId: string, o: { reassign: boolean }): Promise<{ module: Module }>;
    markAiChecked(
      ctx: ActorContext,
      moduleId: string,
      item: { kind: 'lesson' | 'question'; id: string },
    ): Promise<Module>;
    drafts: { get(ctx: ActorContext, moduleId: string): Promise<ModuleDraft | null> };
  };
  aiSettings: { setKillSwitch(ctx: ActorContext, clientId: string, on: boolean): Promise<unknown> };
};
type Dumpable = { dumpAll(): Promise<unknown>; bulkPut(store: string, rows: unknown[]): Promise<void> };

const ai = addOnIds.aiAssistant;
const POLICY = [
  'Outings policy',
  '',
  '# Before we go',
  'A named adult counts the children. The first aid kit goes in the bag. Parents sign the form.',
  '',
  '# On the way',
  'Children hold hands in pairs. A leader walks at the front.',
].join('\n');
const tf = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  type: 'trueFalse',
  prompt: `Statement ${id} is true.`,
  options: [
    { id: `${id}-t`, text: 'True', correct: true },
    { id: `${id}-f`, text: 'False', correct: false },
  ],
  explanation: 'Because.',
  learnMore: [],
  tags: [],
  ...over,
});

export function runAiDraftContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    await addLearningFixture(handle.admin, fx);
    const store = handle.store as unknown as DraftStore;
    const admin = handle.admin as unknown as Dumpable;
    const a = fx.ids.clients.a;
    const req = fx.ids.requirementId;
    const dump = async <T>(st: string): Promise<T[]> => ((await admin.dumpAll()) as Record<string, T[]>)[st] ?? [];
    const setAi = async (clientId: string, status: AddOnSubscription['status'], usage = 0, cap?: number) => {
      await admin.bulkPut('addOnSubscriptions', [
        {
          clientId,
          addOnId: ai,
          status,
          ...(status === 'off' ? {} : { startedAt: TODAY }),
          usageThisPeriod: usage,
          ...(cap !== undefined ? { usageCapPence: cap } : {}),
        },
      ]);
    };
    const usage = async (clientId = a) =>
      (await dump<AddOnSubscription>('addOnSubscriptions')).find((s) => s.clientId === clientId && s.addOnId === ai)
        ?.usageThisPeriod;
    const input = (over: Partial<ModuleInput> = {}): ModuleInput => ({
      title: 'Outings',
      description: 'From a policy',
      estimatedMinutes: 5,
      language: 'en-GB',
      requirementIds: [req],
      roleTags: [],
      lessons: [{ id: 'intro', title: 'Intro', minutes: 3, blocks: [{ kind: 'text', markdown: 'Count heads.' }] }],
      questions: [tf('q1')],
      quiz: {
        mode: 'mcq',
        drawCount: 1,
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
    const priya: ActorContext = { userId: fx.ids.users.priya, side: 'client', clientId: a, now: TODAY };
    return {
      store,
      admin,
      fx,
      a,
      dump,
      setAi,
      usage,
      input,
      priya,
      jade: { userId: fx.ids.users.jade, side: 'staff', clientId: a, now: TODAY } as ActorContext,
      provider: { userId: fx.ids.users.provOwner, side: 'provider', now: TODAY } as ActorContext,
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;
  const LESSON: Lesson = {
    id: 'storage',
    title: 'Storing food',
    minutes: 3,
    blocks: [{ kind: 'text', markdown: 'Keep raw meat low. Label open tubs. Check the fridge daily.' }],
  };

  /** A draft module whose lesson and one question are AI-drafted and unchecked. */
  async function aiModule(s: S) {
    const m = await s.store.authoring.create(
      s.priya,
      s.input({
        lessons: [
          {
            id: 'intro',
            title: 'Intro',
            minutes: 3,
            blocks: [{ kind: 'text', markdown: 'Count heads.' }],
            aiDrafted: true,
          },
        ],
        questions: [tf('q1', { aiDrafted: true }), tf('q2')],
      }),
    );
    return m;
  }

  describe(`M5 Demo AI drafting: ${name}`, () => {
    describe('draftFromPolicy', () => {
      it('returns a labelled draft built from the pasted text, all items aiDrafted', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        const d = await s.store.ai.draftFromPolicy(s.priya, { text: POLICY });
        expect(d.label).toBe('Demo AI');
        expect(d.title).toBe('Outings policy');
        expect(d.lessons.map((l) => l.title)).toEqual(['Before we go', 'On the way']);
        expect(d.questions).toHaveLength(5);
        for (const x of [...d.lessons, ...d.questions]) expect(x.aiDrafted).toBe(true);
        expect(JSON.stringify(d)).not.toMatch(/eyfs/i);
      });

      it('works for a client admin during a trial', async () => {
        const s = await setup();
        await s.setAi(s.a, 'trial');
        await expect(s.store.ai.draftFromPolicy(s.priya, { text: POLICY })).resolves.toBeDefined();
      });

      it('adds exactly one usage unit and stores nothing: no module, draft, attempt or audit text', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on', 4);
        const before = {
          modules: JSON.stringify(await s.dump('modules')),
          drafts: JSON.stringify(await s.dump('moduleDrafts')),
          events: JSON.stringify(await s.dump('learningEvents')),
          audit: (await s.dump('audit')).length,
        };
        await s.store.ai.draftFromPolicy(s.priya, { text: POLICY });
        expect(await s.usage()).toBe(5);
        expect(JSON.stringify(await s.dump('modules'))).toBe(before.modules);
        expect(JSON.stringify(await s.dump('moduleDrafts'))).toBe(before.drafts);
        expect(JSON.stringify(await s.dump('learningEvents'))).toBe(before.events);
        const text = JSON.stringify((await s.dump<unknown>('audit')).slice(before.audit));
        expect(text).not.toContain('named adult');
        expect(text).not.toContain('Outings policy');
      });

      it('refuses text over 20,000 characters with policyTooLong and counts nothing', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        const long = 'Policy\n\n' + 'Staff wash hands. '.repeat(1200);
        expect(long.length).toBeGreaterThan(20000);
        expect(await ruleOf(s.store.ai.draftFromPolicy(s.priya, { text: long }))).toBe('policyTooLong');
        expect(await s.usage()).toBe(0);
      });

      it('refuses blank text with policyEmpty and counts nothing', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        expect(await ruleOf(s.store.ai.draftFromPolicy(s.priya, { text: '   \n ' }))).toBe('policyEmpty');
        expect(await s.usage()).toBe(0);
      });
    });

    describe('suggestQuestions', () => {
      it('returns up to 3 aiDrafted questions from the given lesson text, labelled Demo AI', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        const r = await s.store.ai.suggestQuestions(s.priya, { lesson: LESSON });
        expect(r.label).toBe('Demo AI');
        expect(r.questions).toHaveLength(3);
        for (const q of r.questions) {
          expect(q.aiDrafted).toBe(true);
          expect(q.prompt).toMatch(/raw meat low|open tubs|fridge daily/);
        }
      });

      it('adds exactly one usage unit and writes no module, draft or event', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on', 2);
        const before = JSON.stringify([
          await s.dump('modules'),
          await s.dump('moduleDrafts'),
          await s.dump('learningEvents'),
        ]);
        await s.store.ai.suggestQuestions(s.priya, { lesson: LESSON });
        expect(await s.usage()).toBe(3);
        expect(
          JSON.stringify([await s.dump('modules'), await s.dump('moduleDrafts'), await s.dump('learningEvents')]),
        ).toBe(before);
      });

      it('refuses a lesson with no text and counts nothing', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        const error = await refusal(s.store.ai.suggestQuestions(s.priya, { lesson: { ...LESSON, blocks: [] } }));
        expect(error).toBeDefined();
        expect(await s.usage()).toBe(0);
      });
    });

    describe.each([
      ['draftFromPolicy', (s: S, ctx: ActorContext) => s.store.ai.draftFromPolicy(ctx, { text: POLICY })],
      ['suggestQuestions', (s: S, ctx: ActorContext) => s.store.ai.suggestQuestions(ctx, { lesson: LESSON })],
    ] as const)('%s refusals count nothing', (_label, call) => {
      it('refuses the provider side and staff without modules.manage with ForbiddenError(permission)', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        for (const ctx of [s.provider, s.jade]) {
          const error = await refusal(call(s, ctx));
          expect(error).toBeInstanceOf(ForbiddenError);
          expect((error as ForbiddenError).reason).toBe('permission');
        }
        expect(await s.usage()).toBe(0);
      });

      it('refuses without the AI Assistant in words with no payment wording', async () => {
        const s = await setup();
        await s.setAi(s.a, 'off');
        const error = await refusal(call(s, s.priya));
        expect(error).toBeInstanceOf(NotEntitledError);
        expect((error as NotEntitledError).feature).toBe('aiAssistant');
        expect((error as Error).message).not.toMatch(/price|pay|invoice|billing|£|pence|cost/i);
        expect(await s.usage()).toBe(0);
      });

      it('refuses while the kill switch is on, and works again when it is off', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        await s.store.aiSettings.setKillSwitch(s.provider, s.a, true);
        expect(await refusal(call(s, s.priya))).toBeInstanceOf(NotEntitledError);
        expect(await s.usage()).toBe(0);
        await s.store.aiSettings.setKillSwitch(s.provider, s.a, false);
        await expect(call(s, s.priya)).resolves.toBeDefined();
      });

      it.each(['readOnly', 'closed', 'paused'] as const)(
        'refuses with AccountStateError(usageAddOns) in a %s account, even with the add-on on',
        async (key) => {
          const s = await setup();
          const sc = s.fx.ids.stateClients[key];
          await s.setAi(sc.client.id, 'on');
          const ctx: ActorContext = { userId: sc.owner.id, side: 'client', clientId: sc.client.id, now: TODAY };
          const error = await refusal(call(s, ctx));
          expect(error).toBeInstanceOf(AccountStateError);
          expect((error as AccountStateError).feature).toBe('usageAddOns');
          expect(await s.usage(sc.client.id)).toBe(0);
        },
      );

      it('checks the account state before the entitlement', async () => {
        const s = await setup();
        const sc = s.fx.ids.stateClients.readOnly;
        await s.setAi(sc.client.id, 'off');
        const ctx: ActorContext = { userId: sc.owner.id, side: 'client', clientId: sc.client.id, now: TODAY };
        expect(await refusal(call(s, ctx))).toBeInstanceOf(AccountStateError);
      });

      it('stops at the spending cap with usageCapReached and does not count the refused call', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on', 200, 5);
        await call(s, s.priya);
        expect(await s.usage()).toBe(201);
        expect(await ruleOf(call(s, s.priya))).toBe('usageCapReached');
        expect(await s.usage()).toBe(201);
      });
    });

    describe('markAiChecked and publishing', () => {
      it('refuses to publish a never-published module while an AI-drafted item is unchecked', async () => {
        const s = await setup();
        const m = await aiModule(s);
        expect(await ruleOf(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBe('checklistFailed');
        expect((await s.dump<Module>('modules')).find((x) => x.id === m.id)?.status).toBe('draft');
      });

      it('stores the checker in aiReviewedBy for each item, audits it, and publishes once all are checked', async () => {
        const s = await setup();
        const m = await aiModule(s);
        const one = await s.store.authoring.markAiChecked(s.priya, m.id, { kind: 'question', id: 'q1' });
        expect(one.questions.find((q) => q.id === 'q1')?.aiReviewedBy).toBe(s.fx.ids.users.priya);
        expect(one.questions.find((q) => q.id === 'q2')?.aiReviewedBy).toBeUndefined();
        expect(await ruleOf(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBe('checklistFailed');
        const two = await s.store.authoring.markAiChecked(s.priya, m.id, { kind: 'lesson', id: 'intro' });
        expect(two.lessons[0]?.aiReviewedBy).toBe(s.fx.ids.users.priya);
        const out = await s.store.authoring.publish(s.priya, m.id, { reassign: false });
        expect(out.module.status).toBe('published');
        expect(out.module.lessons[0]?.aiDrafted).toBe(true);
        const events = (await s.dump<{ action: string; target: string }>('audit')).filter(
          (e) => e.action === 'authoring.markAiChecked',
        );
        expect(events).toHaveLength(2);
        expect(JSON.stringify(events)).not.toContain('Statement');
      });

      it('works on the pending draft of a published module and leaves the published copy alone', async () => {
        const s = await setup();
        const first = await s.store.authoring.create(s.priya, s.input());
        await s.store.authoring.publish(s.priya, first.id, { reassign: false });
        await s.store.authoring.saveDraft(
          s.priya,
          first.id,
          s.input({ questions: [tf('q1'), tf('q9', { aiDrafted: true })] }),
        );
        expect(await ruleOf(s.store.authoring.publish(s.priya, first.id, { reassign: false }))).toBe('checklistFailed');
        await s.store.authoring.markAiChecked(s.priya, first.id, { kind: 'question', id: 'q9' });
        const draft = await s.store.authoring.drafts.get(s.priya, first.id);
        expect(draft?.module.questions.find((q) => q.id === 'q9')?.aiReviewedBy).toBe(s.fx.ids.users.priya);
        const live = (await s.dump<Module>('modules')).find((x) => x.id === first.id);
        expect(live?.questions.map((q) => q.id)).toEqual(['q1']);
        const out = await s.store.authoring.publish(s.priya, first.id, { reassign: false });
        expect(out.module.version).toBe(2);
      });

      it('refuses an unknown item and an item that is not AI-drafted with NotFoundError', async () => {
        const s = await setup();
        const m = await aiModule(s);
        expect(
          await refusal(s.store.authoring.markAiChecked(s.priya, m.id, { kind: 'question', id: 'nope' })),
        ).toBeInstanceOf(NotFoundError);
        expect(
          await refusal(s.store.authoring.markAiChecked(s.priya, m.id, { kind: 'question', id: 'q2' })),
        ).toBeInstanceOf(NotFoundError);
        const row = (await s.dump<Module>('modules')).find((x) => x.id === m.id);
        expect(row?.questions.find((q) => q.id === 'q2')?.aiReviewedBy).toBeUndefined();
      });

      it('refuses staff and another client with no write', async () => {
        const s = await setup();
        const m = await aiModule(s);
        const before = JSON.stringify(await s.dump('modules'));
        const gina: ActorContext = {
          userId: s.fx.ids.users.gina,
          side: 'client',
          clientId: s.fx.ids.clients.ot,
          now: TODAY,
        };
        expect(
          await refusal(s.store.authoring.markAiChecked(s.jade, m.id, { kind: 'question', id: 'q1' })),
        ).toBeInstanceOf(ForbiddenError);
        expect(
          await refusal(s.store.authoring.markAiChecked(gina, m.id, { kind: 'question', id: 'q1' })),
        ).toBeDefined();
        expect(JSON.stringify(await s.dump('modules'))).toBe(before);
      });

      it('drops an aiReviewedBy sent through saveDraft for an item nobody checked', async () => {
        const s = await setup();
        const m = await aiModule(s);
        await s.store.authoring.saveDraft(
          s.priya,
          m.id,
          s.input({
            lessons: [
              {
                id: 'intro',
                title: 'Intro',
                minutes: 3,
                blocks: [{ kind: 'text', markdown: 'Count heads.' }],
                aiDrafted: true,
                aiReviewedBy: s.fx.ids.users.priya,
              },
            ],
            questions: [tf('q1', { aiDrafted: true, aiReviewedBy: s.fx.ids.users.priya })],
          }),
        );
        expect(await ruleOf(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBe('checklistFailed');
      });

      it('keeps aiDrafted on a stored item when saveDraft sends it without the flag', async () => {
        const s = await setup();
        const m = await aiModule(s);
        await s.store.authoring.saveDraft(
          s.priya,
          m.id,
          s.input({
            lessons: [
              { id: 'intro', title: 'Intro', minutes: 3, blocks: [{ kind: 'text', markdown: 'Count heads.' }] },
            ],
            questions: [tf('q1'), tf('q2')],
          }),
        );
        expect(await ruleOf(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBe('checklistFailed');
      });

      it('keeps a real review when the form saves the same module again', async () => {
        const s = await setup();
        const m = await aiModule(s);
        const checked = await s.store.authoring.markAiChecked(s.priya, m.id, { kind: 'question', id: 'q1' });
        const saved = await s.store.authoring.saveDraft(
          s.priya,
          m.id,
          s.input({ lessons: m.lessons, questions: checked.questions }),
        );
        expect(saved.questions.find((q) => q.id === 'q1')?.aiReviewedBy).toBe(s.fx.ids.users.priya);
      });
    });

    it('does not touch another client usage count', async () => {
      const s = await setup();
      await s.setAi(s.a, 'on');
      const others = async () =>
        JSON.stringify((await s.dump<AddOnSubscription>('addOnSubscriptions')).filter((x) => x.clientId !== s.a));
      const before = await others();
      await s.store.ai.draftFromPolicy(s.priya, { text: POLICY });
      await s.store.ai.suggestQuestions(s.priya, { lesson: LESSON });
      expect(await others()).toBe(before);
    });
  });
}

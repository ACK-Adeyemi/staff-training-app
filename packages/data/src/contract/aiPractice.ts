// M5 chunk 9 (F-7, plan docs/plans/m5.md; brief 20.7): store.ai.practice, "Quiz me for practice". Runs against every
// adapter. Written before the implementation, so the new method is described by the local type below.
//   ai.practice(ctx, { moduleId }) => { label: 'Demo AI'; questions: Question[] }
//   - Draws 3 questions from that module's own bank (domain practiceQuestions, with the store's seeded rng), never more
//     than the bank holds, no repeats. A translated module keeps its own wording even though ids match the original.
//   - Writes exactly one thing: the AI usage count goes up by one. No attempt, no learning event, no audit event with
//     personal data, and no XP (XP comes from attempts, so an unchanged attempts store means unchanged XP).
//   - Check order, as ai.explain: provider side or no permission (ForbiddenError 'permission'); account state
//     (AccountStateError feature 'usageAddOns') before entitlement; the P22 kill switch and a missing add-on
//     (NotEntitledError 'aiAssistant'); an unknown or unpublished module (NotFoundError); the usage cap
//     (RuleError 'usageCapReached'). A refused call counts nothing.
import { describe, expect, it } from 'vitest';
import { addOnIds } from '@sta/content';
import { createRng, fixedClock, type AddOnSubscription, type Module, type Question } from '@sta/domain';
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
import { buildWorld, freshId, TODAY } from './world';

type PracticeStore = {
  ai: { practice(ctx: ActorContext, input: { moduleId: string }): Promise<{ label: string; questions: Question[] }> };
  aiSettings: { setKillSwitch(ctx: ActorContext, clientId: string, on: boolean): Promise<unknown> };
};
type Dumpable = { dumpAll(): Promise<unknown>; bulkPut(store: string, rows: unknown[]): Promise<void> };

const ai = addOnIds.aiAssistant;
const mcq = (id: string, prompt: string): Question => ({
  id,
  type: 'mcq',
  prompt,
  options: [
    { id: `${id}-a`, text: 'Right', correct: true },
    { id: `${id}-b`, text: 'Wrong', correct: false },
  ],
  explanation: `Because ${id}.`,
  learnMore: [],
  tags: [],
});

export function runAiPracticeContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const store = handle.store as unknown as PracticeStore;
    const admin = handle.admin as unknown as Dumpable;
    const a = fx.ids.clients.a;
    const dump = async <T>(st: string): Promise<T[]> => ((await admin.dumpAll()) as Record<string, T[]>)[st] ?? [];
    const questions = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((id) => mcq(id, `English ${id}`));
    const bankModule: Module = {
      ...lf.module,
      id: freshId(5000),
      title: 'Practice me',
      questions,
      lessons: lf.module.lessons,
    };
    const smallModule: Module = { ...bankModule, id: freshId(5001), questions: questions.slice(0, 2) };
    const plModule: Module = {
      ...bankModule,
      id: freshId(5002),
      language: 'pl-PL',
      translatedFrom: { moduleId: bankModule.id, machine: true },
      questions: questions.map((q) => ({ ...q, prompt: `Polski ${q.id}` })),
    };
    const draftModule: Module = { ...bankModule, id: freshId(5003), status: 'draft' };
    await admin.bulkPut('modules', [bankModule, smallModule, plModule, draftModule]);
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
    const staff = (userId: string, clientId = a): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });
    return {
      store,
      admin,
      fx,
      a,
      dump,
      setAi,
      usage,
      bankModule,
      smallModule,
      plModule,
      draftModule,
      jade: staff(fx.ids.users.jade),
      priya: { userId: fx.ids.users.priya, side: 'client', clientId: a, now: TODAY } as ActorContext,
      provider: { userId: fx.ids.users.provOwner, side: 'provider', now: TODAY } as ActorContext,
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  describe(`M5 Demo AI practice quiz: ${name}`, () => {
    it('returns 3 questions from the module own bank, labelled Demo AI', async () => {
      const s = await setup();
      await s.setAi(s.a, 'on');
      const result = await s.store.ai.practice(s.jade, { moduleId: s.bankModule.id });
      expect(result.label).toBe('Demo AI');
      expect(result.questions).toHaveLength(3);
      expect(new Set(result.questions.map((q) => q.id)).size).toBe(3);
      for (const q of result.questions) expect(s.bankModule.questions).toContainEqual(q);
    });

    it('returns only what a small bank holds', async () => {
      const s = await setup();
      await s.setAi(s.a, 'on');
      const result = await s.store.ai.practice(s.jade, { moduleId: s.smallModule.id });
      expect(result.questions.map((q) => q.id).sort()).toEqual(['q1', 'q2']);
    });

    it('uses the Polish module own wording although its question ids match the original', async () => {
      const s = await setup();
      await s.setAi(s.a, 'on');
      const result = await s.store.ai.practice(s.jade, { moduleId: s.plModule.id });
      expect(result.questions).toHaveLength(3);
      for (const q of result.questions) expect(q.prompt).toMatch(/^Polski /);
    });

    it('works for a client admin in preview and during a trial', async () => {
      const s = await setup();
      await s.setAi(s.a, 'trial');
      await expect(s.store.ai.practice(s.priya, { moduleId: s.bankModule.id })).resolves.toBeDefined();
    });

    it('adds exactly one usage unit and writes no attempt, learning event or note', async () => {
      const s = await setup();
      await s.setAi(s.a, 'on', 4);
      const before = {
        attempts: JSON.stringify(await s.dump('attempts')),
        events: JSON.stringify(await s.dump('learningEvents')),
        notes: JSON.stringify(await s.dump('notes')),
        evidence: JSON.stringify(await s.dump('evidence')),
        notifications: (await s.dump('notifications')).length,
      };
      await s.store.ai.practice(s.jade, { moduleId: s.bankModule.id });
      expect(await s.usage()).toBe(5);
      expect(JSON.stringify(await s.dump('attempts'))).toBe(before.attempts);
      expect(JSON.stringify(await s.dump('learningEvents'))).toBe(before.events);
      expect(JSON.stringify(await s.dump('notes'))).toBe(before.notes);
      expect(JSON.stringify(await s.dump('evidence'))).toBe(before.evidence);
      expect((await s.dump('notifications')).length).toBe(before.notifications);
    });

    it('counts one more unit on each call', async () => {
      const s = await setup();
      await s.setAi(s.a, 'on');
      await s.store.ai.practice(s.jade, { moduleId: s.bankModule.id });
      await s.store.ai.practice(s.jade, { moduleId: s.bankModule.id });
      expect(await s.usage()).toBe(2);
    });

    it('writes no questions, answers or names to the audit log', async () => {
      const s = await setup();
      await s.setAi(s.a, 'on');
      const before = (await s.dump<unknown>('audit')).length;
      await s.store.ai.practice(s.jade, { moduleId: s.bankModule.id });
      const text = JSON.stringify((await s.dump<unknown>('audit')).slice(before));
      expect(text).not.toContain('English q');
      expect(text).not.toContain('Jade');
    });

    describe('refusals count nothing and write nothing', () => {
      const expectUntouched = async (s: S, usageNow: number) => {
        expect(await s.usage()).toBe(usageNow);
      };

      it('refuses the provider side with ForbiddenError(permission)', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        const error = await refusal(s.store.ai.practice(s.provider, { moduleId: s.bankModule.id }));
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).reason).toBe('permission');
        await expectUntouched(s, 0);
      });

      it('refuses without the AI Assistant, in words with no payment wording, for staff', async () => {
        const s = await setup();
        await s.setAi(s.a, 'off');
        const error = await refusal(s.store.ai.practice(s.jade, { moduleId: s.bankModule.id }));
        expect(error).toBeInstanceOf(NotEntitledError);
        expect((error as NotEntitledError).feature).toBe('aiAssistant');
        expect((error as Error).message).not.toMatch(/price|pay|invoice|billing|£|pence|cost/i);
        await expectUntouched(s, 0);
      });

      it('refuses while the provider kill switch is on, and works again when it is off', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        await s.store.aiSettings.setKillSwitch(s.provider, s.a, true);
        expect(await refusal(s.store.ai.practice(s.jade, { moduleId: s.bankModule.id }))).toBeInstanceOf(
          NotEntitledError,
        );
        await expectUntouched(s, 0);
        await s.store.aiSettings.setKillSwitch(s.provider, s.a, false);
        await expect(s.store.ai.practice(s.jade, { moduleId: s.bankModule.id })).resolves.toBeDefined();
      });

      it.each(['readOnly', 'closed', 'paused'] as const)(
        'refuses with AccountStateError(usageAddOns) in a %s account, even with the add-on on',
        async (key) => {
          const s = await setup();
          const sc = s.fx.ids.stateClients[key];
          await s.setAi(sc.client.id, 'on');
          const ctx: ActorContext = { userId: sc.owner.id, side: 'client', clientId: sc.client.id, now: TODAY };
          const error = await refusal(s.store.ai.practice(ctx, { moduleId: s.bankModule.id }));
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
        expect(await refusal(s.store.ai.practice(ctx, { moduleId: s.bankModule.id }))).toBeInstanceOf(
          AccountStateError,
        );
      });

      it('stops at the spending cap with usageCapReached and does not count the refused call', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on', 200, 5);
        await s.store.ai.practice(s.jade, { moduleId: s.bankModule.id });
        expect(await s.usage()).toBe(201);
        expect(await ruleOf(s.store.ai.practice(s.jade, { moduleId: s.bankModule.id }))).toBe('usageCapReached');
        expect(await s.usage()).toBe(201);
      });

      it('refuses an unknown or draft module with NotFoundError', async () => {
        const s = await setup();
        await s.setAi(s.a, 'on');
        expect(await refusal(s.store.ai.practice(s.jade, { moduleId: freshId(5999) }))).toBeInstanceOf(NotFoundError);
        expect(await refusal(s.store.ai.practice(s.jade, { moduleId: s.draftModule.id }))).toBeInstanceOf(
          NotFoundError,
        );
        await expectUntouched(s, 0);
      });
    });

    it('does not touch another client usage count', async () => {
      const s = await setup();
      await s.setAi(s.a, 'on');
      const before = JSON.stringify(
        (await s.dump<AddOnSubscription>('addOnSubscriptions')).filter((x) => x.clientId !== s.a),
      );
      await s.store.ai.practice(s.jade, { moduleId: s.bankModule.id });
      const after = JSON.stringify(
        (await s.dump<AddOnSubscription>('addOnSubscriptions')).filter((x) => x.clientId !== s.a),
      );
      expect(after).toBe(before);
    });
  });
}

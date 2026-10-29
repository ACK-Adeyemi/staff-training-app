// M4 chunk 16 contract tests: P21 global content and P22 AI add-on settings (plan docs/plans/m4.md chunk 16; brief
// 13.3, 20.7). Written before the implementation, so the new services are described by local types:
//   - store.globalContent (provider only). get(ctx) needs content.read and gives { prizeSuggestions: string[] }: the
//     provider's global prize list, which starts as the nursery pack's list. addPrizeSuggestion(ctx, text) and
//     removePrizeSuggestion(ctx, text) need content.write. Add trims the text, appends it, and refuses blank text
//     (ValidationError), text over 120 characters (ValidationError) and a repeat (RuleError 'duplicate'). Remove of a
//     text not in the list is NotFoundError. Audit actions 'globalContent.prizeAdded' / 'globalContent.prizeRemoved'
//     (provider side, no clientId). The list persists in the store.
//   - store.aiSettings (provider only, ai.manage). overview(ctx) gives one row per client that has an AI Assistant
//     add-on subscription record: { clientId, clientName, status ('off'|'on'|'trial'), usageThisPeriod,
//     includedUnits, killSwitch } ordered by clientName. setKillSwitch(ctx, clientId, on) persists the switch for that
//     client, writes audit 'ai.killSwitch' (clientId set, after { on }), and while it is on access.features(...) for
//     that client's people gives { aiAssistant: false } even though the add-on is on (turning it off restores it).
//     An unknown client is NotFoundError.
import { describe, expect, it } from 'vitest';
import { addOnIds, nurseryPack } from '@sta/content';
import { createRng, fixedClock, type AuditEvent } from '@sta/domain';
import { load } from '@sta/seed';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type StoreHandle,
  type StoreOptions,
} from '../types';
import { refusal, ruleOf } from './learning';
import { SEED_VALUE, TODAY } from './world';

type AiRow = {
  clientId: string;
  clientName: string;
  status: 'off' | 'on' | 'trial';
  usageThisPeriod: number;
  includedUnits: number;
  killSwitch: boolean;
};
type GlobalAiStore = {
  globalContent: {
    get(ctx: ActorContext): Promise<{ prizeSuggestions: string[] }>;
    addPrizeSuggestion(ctx: ActorContext, text: string): Promise<{ prizeSuggestions: string[] }>;
    removePrizeSuggestion(ctx: ActorContext, text: string): Promise<{ prizeSuggestions: string[] }>;
  };
  aiSettings: {
    overview(ctx: ActorContext): Promise<AiRow[]>;
    setKillSwitch(ctx: ActorContext, clientId: string, on: boolean): Promise<AiRow>;
  };
  addOns: { turnOn(ctx: ActorContext, addOnId: string): Promise<unknown> };
  access: { features(ctx: ActorContext): Promise<{ aiAssistant: boolean }> };
};

export function runProviderGlobalAiContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const keys = await load(handle.admin, { seedValue: SEED_VALUE, today: TODAY });
    const provider = (key: string): ActorContext => ({ userId: keys.users[key]!, side: 'provider', now: TODAY });
    const dump = async <T>(st: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[st] ?? [];
    return {
      s: handle.store as unknown as GlobalAiStore,
      dump,
      little: keys.clients['littleAcorns'],
      owner: provider('providerOwner'),
      // Tom (Read-only) holds content.read but not content.write or ai.manage; Sophie (Support) holds none of them.
      tom: provider('tom'),
      sophie: provider('sophie'),
      priya: {
        userId: keys.users['priya'],
        side: 'client',
        clientId: keys.clients['littleAcorns'],
        now: TODAY,
      } as ActorContext,
      jade: {
        userId: keys.users['jade'],
        side: 'staff',
        clientId: keys.clients['littleAcorns'],
        now: TODAY,
      } as ActorContext,
    };
  }
  const audits = async (dump: <T>(n: string) => Promise<T[]>, action: string) =>
    (await dump<AuditEvent>('audit')).filter((e) => e.action === action);

  describe(`M4 global content and AI settings: ${name}`, () => {
    it('starts the prize list as the nursery pack list', async () => {
      const t = await setup();
      expect((await t.s.globalContent.get(t.owner)).prizeSuggestions).toEqual(nurseryPack.prizeSuggestions);
    });

    it('lets a content.read holder read but not write, and gives a holder of neither nothing', async () => {
      const t = await setup();
      expect((await t.s.globalContent.get(t.tom)).prizeSuggestions.length).toBeGreaterThan(0);
      expect(await refusal(t.s.globalContent.addPrizeSuggestion(t.tom, 'A new idea'))).toBeInstanceOf(ForbiddenError);
      expect(
        await refusal(t.s.globalContent.removePrizeSuggestion(t.tom, nurseryPack.prizeSuggestions[0]!)),
      ).toBeInstanceOf(ForbiddenError);
      expect(await refusal(t.s.globalContent.get(t.sophie))).toBeInstanceOf(ForbiddenError);
      expect(await audits(t.dump, 'globalContent.prizeAdded')).toHaveLength(0);
    });

    it('refuses client and staff actors', async () => {
      const t = await setup();
      for (const who of [t.priya, t.jade]) {
        expect(await refusal(t.s.globalContent.get(who))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.globalContent.addPrizeSuggestion(who, 'x'))).toBeInstanceOf(ForbiddenError);
      }
    });

    it('adds a trimmed prize suggestion at the end, persists it and writes one audit event', async () => {
      const t = await setup();
      const after = await t.s.globalContent.addPrizeSuggestion(t.owner, '  Gift hamper (up to 25 pounds)  ');
      expect(after.prizeSuggestions.at(-1)).toBe('Gift hamper (up to 25 pounds)');
      expect(after.prizeSuggestions).toHaveLength(nurseryPack.prizeSuggestions.length + 1);
      expect((await t.s.globalContent.get(t.tom)).prizeSuggestions.at(-1)).toBe('Gift hamper (up to 25 pounds)');
      const events = await audits(t.dump, 'globalContent.prizeAdded');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorId: t.owner.userId, actorSide: 'provider' });
      expect(events[0]!.clientId).toBeUndefined();
    });

    it('refuses blank, over-long and repeated suggestions and changes nothing', async () => {
      const t = await setup();
      for (const text of ['', '   ', 'x'.repeat(121)]) {
        expect(await refusal(t.s.globalContent.addPrizeSuggestion(t.owner, text))).toBeInstanceOf(ValidationError);
      }
      expect(await ruleOf(t.s.globalContent.addPrizeSuggestion(t.owner, nurseryPack.prizeSuggestions[0]!))).toBe(
        'duplicate',
      );
      expect((await t.s.globalContent.get(t.owner)).prizeSuggestions).toEqual(nurseryPack.prizeSuggestions);
      expect(await audits(t.dump, 'globalContent.prizeAdded')).toHaveLength(0);
    });

    it('removes a prize suggestion, persists it and writes one audit event; a missing one is not found', async () => {
      const t = await setup();
      const first = nurseryPack.prizeSuggestions[0]!;
      const after = await t.s.globalContent.removePrizeSuggestion(t.owner, first);
      expect(after.prizeSuggestions).not.toContain(first);
      expect((await t.s.globalContent.get(t.owner)).prizeSuggestions).toHaveLength(
        nurseryPack.prizeSuggestions.length - 1,
      );
      expect(await audits(t.dump, 'globalContent.prizeRemoved')).toHaveLength(1);
      expect(await refusal(t.s.globalContent.removePrizeSuggestion(t.owner, first))).toBeInstanceOf(NotFoundError);
    });

    it('shows the AI overview to an ai.manage holder only', async () => {
      const t = await setup();
      const rows = await t.s.aiSettings.overview(t.owner);
      const mine = rows.find((r) => r.clientId === t.little)!;
      expect(mine).toMatchObject({ status: 'off', usageThisPeriod: 0, killSwitch: false });
      expect(mine.clientName.length).toBeGreaterThan(0);
      expect(mine.includedUnits).toBeGreaterThan(0);
      for (const who of [t.tom, t.sophie, t.priya, t.jade]) {
        expect(await refusal(t.s.aiSettings.overview(who))).toBeInstanceOf(ForbiddenError);
      }
    });

    it('switches a client off, persists it, audits it with the client, and takes the feature away until switched back', async () => {
      const t = await setup();
      await t.s.addOns.turnOn(t.priya, addOnIds.aiAssistant);
      expect(await t.s.access.features(t.priya)).toEqual({ aiAssistant: true });
      const row = await t.s.aiSettings.setKillSwitch(t.owner, t.little, true);
      expect(row).toMatchObject({ clientId: t.little, killSwitch: true });
      expect((await t.s.aiSettings.overview(t.owner)).find((r) => r.clientId === t.little)!.killSwitch).toBe(true);
      expect(await t.s.access.features(t.priya)).toEqual({ aiAssistant: false });
      expect(await t.s.access.features(t.jade)).toEqual({ aiAssistant: false });
      const events = await audits(t.dump, 'ai.killSwitch');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorId: t.owner.userId, clientId: t.little, after: { on: true } });
      await t.s.aiSettings.setKillSwitch(t.owner, t.little, false);
      expect(await t.s.access.features(t.priya)).toEqual({ aiAssistant: true });
      expect(await audits(t.dump, 'ai.killSwitch')).toHaveLength(2);
    });

    it('refuses the kill switch to people without ai.manage and for an unknown client, changing nothing', async () => {
      const t = await setup();
      for (const who of [t.tom, t.sophie, t.priya, t.jade]) {
        expect(await refusal(t.s.aiSettings.setKillSwitch(who, t.little, true))).toBeInstanceOf(ForbiddenError);
      }
      expect(await refusal(t.s.aiSettings.setKillSwitch(t.owner, '0'.repeat(26), true))).toBeInstanceOf(NotFoundError);
      expect((await t.s.aiSettings.overview(t.owner)).find((r) => r.clientId === t.little)!.killSwitch).toBe(false);
      expect(await audits(t.dump, 'ai.killSwitch')).toHaveLength(0);
    });
  });
}

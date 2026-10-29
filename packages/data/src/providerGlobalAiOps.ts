// Provider global content (prize suggestions) and AI add-on settings (M4 chunk 16, brief 13.3 and 20.7).
// Both persist as records in the settings store, so no new object store is needed. Each write is ONE batch with its
// audit event. Time comes from the injected Clock through the call. Nothing here makes a network request.
import { checkPrizeSuggestion, type AddOn, type AddOnSubscription, type Client } from '@sta/domain';
import { nurseryPack } from '@sta/content';
import type { RawBackend } from './backend';
import { audit, beginCall, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type AiSettingsRow,
  type AiSettingsService,
  type GlobalContentService,
  type StoreOptions,
} from './types';

export type ProviderGlobalAiOperations = {
  globalContent: GlobalContentService;
  aiSettings: AiSettingsService;
};

const PRIZES_KEY = 'provider.prizeSuggestions';
const KILL_KEY = 'provider.aiKillSwitches';

const settingPut = (key: string, value: unknown) => ({
  type: 'put' as const,
  store: 'settings' as const,
  key,
  record: { key, value },
});

async function readList(backend: RawBackend, key: string, fallback: readonly string[]): Promise<string[]> {
  const row = (await backend.get('settings', key)) as { value?: unknown } | undefined;
  const v = row?.value;
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...v] : [...fallback];
}

/** The clients whose AI the provider has switched off. Read by access.features and ai.explain. */
export const killedClientIds = (backend: RawBackend): Promise<string[]> => readList(backend, KILL_KEY, []);

export function createProviderGlobalAiOperations(
  backend: RawBackend,
  options: StoreOptions,
): ProviderGlobalAiOperations {
  async function providerCall(ctx: ActorContext, permission: string): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
    if (!holds(call, [permission])) return forbid('permission');
    return call;
  }

  const prizes = () => readList(backend, PRIZES_KEY, nurseryPack.prizeSuggestions);

  const globalContent: GlobalContentService = {
    async get(ctx) {
      await providerCall(ctx, 'content.read');
      return { prizeSuggestions: await prizes() };
    },

    async addPrizeSuggestion(ctx, text) {
      const call = await providerCall(ctx, 'content.write');
      const list = await prizes();
      const checked = checkPrizeSuggestion(text, list);
      if (!checked.ok) {
        if (checked.reason === 'duplicate') throw new RuleError('duplicate');
        throw new ValidationError(['text: type a suggestion of 1 to 120 characters']);
      }
      const next = [...list, checked.text];
      await backend.apply([
        settingPut(PRIZES_KEY, next),
        audit(call, undefined, 'globalContent.prizeAdded', 'prizeSuggestions', undefined, { count: next.length }),
      ]);
      return { prizeSuggestions: next };
    },

    async removePrizeSuggestion(ctx, text) {
      const call = await providerCall(ctx, 'content.write');
      const list = await prizes();
      if (typeof text !== 'string' || !list.includes(text)) throw new NotFoundError();
      const next = list.filter((p) => p !== text);
      await backend.apply([
        settingPut(PRIZES_KEY, next),
        audit(call, undefined, 'globalContent.prizeRemoved', 'prizeSuggestions', undefined, { count: next.length }),
      ]);
      return { prizeSuggestions: next };
    },
  };

  async function rows(call: Call, killed: readonly string[]): Promise<AiSettingsRow[]> {
    const addOn = (await call.all<AddOn>('addOns')).find((a) => a.adds.flags?.includes('aiAssistant'));
    if (!addOn) return [];
    const included = addOn.pricing.kind === 'usage' ? addOn.pricing.includedUnits : 0;
    const clients = await call.all<Client>('clients');
    const subs = (await call.all<AddOnSubscription>('addOnSubscriptions')).filter((s) => s.addOnId === addOn.id);
    return subs
      .flatMap((s) => {
        const client = clients.find((c) => c.id === s.clientId);
        return client
          ? [
              {
                clientId: s.clientId,
                clientName: client.displayName,
                status: s.status,
                usageThisPeriod: s.usageThisPeriod,
                includedUnits: included,
                killSwitch: killed.includes(s.clientId),
              },
            ]
          : [];
      })
      .sort((a, b) => (a.clientName < b.clientName ? -1 : a.clientName > b.clientName ? 1 : 0));
  }

  const aiSettings: AiSettingsService = {
    async overview(ctx) {
      const call = await providerCall(ctx, 'ai.manage');
      return rows(call, await killedClientIds(backend));
    },

    async setKillSwitch(ctx, clientId, on) {
      const call = await providerCall(ctx, 'ai.manage');
      const client = (await call.all<Client>('clients')).find((c) => c.id === clientId);
      if (!client) throw new NotFoundError();
      const killed = await killedClientIds(backend);
      const next = on ? [...new Set([...killed, clientId])] : killed.filter((id) => id !== clientId);
      await backend.apply([
        settingPut(KILL_KEY, next),
        audit(call, clientId, 'ai.killSwitch', clientId, { on: killed.includes(clientId) }, { on }),
      ]);
      const row = (await rows(call, next)).find((r) => r.clientId === clientId);
      if (!row) throw new NotFoundError();
      return row;
    },
  };

  return { globalContent, aiSettings };
}

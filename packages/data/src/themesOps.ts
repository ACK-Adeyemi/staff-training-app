// Operations for a client's saved themes (M3 chunk 10b; plan assumptions 51 and 52, Data package `themes`).
// The rules (token allowlist, contrast, which theme is in force) live in @sta/domain; this file authorises, checks the
// package limit and writes the theme, the base-theme setting and one audit event in one batch.
import {
  activeTheme,
  checkLimit,
  featureAvailability,
  themeBases,
  themeSchema,
  validateTheme,
  type Client,
  type Theme,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, canAny, clientEntitlements, forbid, holds, type Call } from './policy';
import {
  AccountStateError,
  NotEntitledError,
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type StoreOptions,
  type ThemesService,
} from './types';

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createThemesOperations(backend: RawBackend, options: StoreOptions): { themes: ThemesService } {
  /** A client admin holding `permission` for the whole organisation (themes belong to the client, not a site). */
  async function adminCall(ctx: ActorContext, permission: string, mode: 'read' | 'write'): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    const clientId = call.clientId;
    if (call.side !== 'client' || clientId === undefined) return forbid('permission');
    // Themes belong to the whole client: anyone who may see them sees the list; changing needs whole-client scope.
    const allowed = mode === 'read' ? holds(call, [permission]) : canAny(call, [permission], { clientId }, 'write');
    if (!allowed) return forbid('permission');
    return call;
  }

  function checkEditable(call: Call): void {
    const state = call.actor.accountState;
    if (state && featureAvailability(state, 'themesEdit') !== 'yes') throw new AccountStateError(state, 'themesEdit');
  }

  const own = async (call: Call): Promise<Theme[]> =>
    (await call.all<Theme>('themes')).filter((t) => t.clientId === call.clientId);

  const put = (store: WriteOp['store'], key: string, record: unknown): WriteOp => ({
    type: 'put',
    store,
    key,
    record,
  });

  const themes: ThemesService = {
    async list(ctx) {
      const call = await adminCall(ctx, 'themes.view', 'read');
      return structuredClone((await own(call)).sort(byId));
    },

    async active(ctx, side) {
      const call = await beginCall(backend, options, ctx);
      if (call.side === 'provider') return forbid('permission');
      const client = call.actor.client as Client;
      return structuredClone(activeTheme(await own(call), client.settings, call.actor.now, side));
    },

    async save(ctx, input) {
      const call = await adminCall(ctx, 'themes.manage', 'write');
      const clientId = call.clientId as string;
      checkEditable(call);
      const parsed = themeSchema.safeParse({ ...(input as object), clientId });
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
      }
      const theme: Theme = parsed.data;
      if (!validateTheme(theme.tokens, themeBases.light).ok) throw new RuleError('invalidTheme');
      const mine = await own(call);
      const existing = mine.find((t) => t.id === theme.id);
      if (!existing) {
        if ((await call.find<Theme>('themes', theme.id)) !== undefined) throw new NotFoundError();
        const ents = await clientEntitlements(call, clientId);
        if (!ents || !checkLimit(ents, { savedThemes: mine.length }, 'savedThemes').allowed) {
          throw new NotEntitledError('savedThemes');
        }
      }
      await backend.apply([
        put('themes', theme.id, theme),
        audit(call, clientId, 'themes.save', `theme:${theme.id}`, undefined, { id: theme.id, name: theme.name }),
      ]);
      return structuredClone(theme);
    },

    async remove(ctx, id) {
      const call = await adminCall(ctx, 'themes.manage', 'write');
      const clientId = call.clientId as string;
      const theme = (await own(call)).find((t) => t.id === id);
      if (!theme) throw new NotFoundError();
      checkEditable(call);
      const client = call.actor.client as Client;
      const ops: WriteOp[] = [{ type: 'delete', store: 'themes', key: id }];
      if (client.settings.themeId === id) {
        const settings = { ...client.settings };
        delete settings.themeId;
        ops.push(put('clients', client.id, { ...client, settings }));
      }
      ops.push(audit(call, clientId, 'themes.remove', `theme:${id}`, { id, name: theme.name }, undefined));
      await backend.apply(ops);
    },

    async setBase(ctx, id) {
      const call = await adminCall(ctx, 'themes.manage', 'write');
      const clientId = call.clientId as string;
      if (id !== null && !(await own(call)).some((t) => t.id === id)) throw new NotFoundError();
      checkEditable(call);
      const client = call.actor.client as Client;
      const before = client.settings.themeId;
      const settings = { ...client.settings };
      delete settings.themeId;
      if (id !== null) settings.themeId = id;
      await backend.apply([
        put('clients', client.id, { ...client, settings }),
        audit(
          call,
          clientId,
          'themes.setBase',
          `client:${clientId}`,
          { themeId: before },
          { themeId: id ?? undefined },
        ),
      ]);
      return structuredClone(settings);
    },
  };

  return { themes };
}

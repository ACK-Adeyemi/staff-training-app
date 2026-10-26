// createStore: builds a DataStore and DemoAdmin on top of any RawBackend. Both adapters use it, so the
// policy (validation, tenancy, permissions, audit, account state, entitlements) is identical.
import {
  demoStateSchema,
  seedMetaSchema,
  type DemoState,
  type OutboxMessage,
  type SeedMeta,
  type Client,
  type UserAccount,
} from '@sta/domain';
import { createOperations } from './ops';
import { createEngagementOperations } from './engagementOps';
import { createCompetitionOperations } from './competitionOps';
import { createIdentityOperations } from './identityOps';
import { createAuthoringOperations } from './authoringOps';
import { createEvidenceOperations } from './evidenceOps';
import { createSupportOperations } from './supportOps';
import { createRulesOperations, newPersonPrefs } from './rulesOps';
import { createBillingOperations, simulateFailedPayment } from './billingOps';
import { keyOf, validate, type RawBackend, type SettingsRecord, type WriteOp } from './backend';
import {
  authorizePut,
  authorizeRemove,
  beginCall,
  canReadRecord,
  canReadStore,
  checkTenancy,
  tenantOf,
  type Call,
} from './policy';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  storeNames,
  type ActorContext,
  type DataStore,
  type DemoAdmin,
  type ChangeListener,
  type Filter,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from './types';

type Rec = Record<string, unknown>;

const byKey = (store: StoreName) => (a: unknown, b: unknown) => {
  if (store === 'audit') {
    const x = a as { at: string; id: string };
    const y = b as { at: string; id: string };
    return x.at === y.at ? (x.id < y.id ? -1 : 1) : x.at < y.at ? -1 : 1;
  }
  const ka = keyOf(store, a);
  const kb = keyOf(store, b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

const matches = (record: Rec, filter: Filter | undefined): boolean =>
  filter === undefined || Object.entries(filter).every(([k, v]) => record[k] === v);

/** Another person's personal settings are theirs alone: everyone else reads a person without `prefs`. */
function shape(call: Call, store: StoreName, record: Rec): Rec {
  if (store !== 'people' || call.actor.user.personId === record['id']) return record;
  const rest = { ...record };
  delete rest['prefs'];
  return rest;
}

function repo(backend: RawBackend, options: StoreOptions, store: StoreName) {
  const begin = (ctx: ActorContext, opts?: { allowLimited?: boolean }): Promise<Call> =>
    beginCall(backend, options, ctx, opts);

  const visible = async (call: Call, record: Rec): Promise<boolean> =>
    (await canReadStore(call, store)) && (await canReadRecord(call, store, record));

  return {
    get: async (ctx: ActorContext, id: string) => {
      // A limited admin may still read their own user record (M3 assumption 3).
      const call = await begin(ctx, { allowLimited: store === 'users' && id === ctx.userId });
      const record = (await backend.get(store, id)) as Rec | undefined;
      if (!record || !(await visible(call, record))) throw new NotFoundError();
      return shape(call, store, record);
    },

    list: async (ctx: ActorContext, filter?: Filter) => {
      const call = await begin(ctx);
      if (!(await canReadStore(call, store))) throw new ForbiddenError('permission');
      const out: Rec[] = [];
      for (const record of (await backend.getAll(store)) as Rec[]) {
        if (matches(record, filter) && (await canReadRecord(call, store, record))) out.push(shape(call, store, record));
      }
      return out.sort(byKey(store));
    },

    put: async (ctx: ActorContext, input: unknown) => {
      const call = await begin(ctx);
      let given = input;
      const stored =
        store === 'people' && typeof input === 'object' && input !== null
          ? ((await backend.get(store, String((input as Rec)['id']))) as Rec | undefined)
          : undefined;
      // Admins read people without prefs, so a write that omits them keeps the stored ones.
      if ((input as Rec | null)?.['prefs'] === undefined && typeof input === 'object' && input !== null) {
        given = { ...(input as Rec), prefs: stored ? stored['prefs'] : newPersonPrefs() };
      }
      let rec = validate(store, given) as Rec;
      const existing = (await backend.get(store, keyOf(store, rec))) as Rec | undefined;
      // Personal settings and the nickname belong to the person: nobody else's write changes them.
      if (store === 'people' && call.actor.user.personId !== rec['id']) {
        rec = { ...rec, prefs: existing ? existing['prefs'] : newPersonPrefs() };
        if (existing && existing['nickname'] === undefined) delete rec['nickname'];
        else if (existing) rec['nickname'] = existing['nickname'];
      }
      await checkTenancy(call, store, rec, existing);
      const result = await authorizePut(call, store, rec, existing);
      const ops: WriteOp[] = [{ type: 'put', store, key: keyOf(store, rec), record: result.record }, ...result.extra];
      await backend.apply(ops);
      return structuredClone(shape(call, store, result.record as Rec));
    },

    remove: async (ctx: ActorContext, id: string) => {
      const call = await begin(ctx);
      const existing = (await backend.get(store, id)) as Rec | undefined;
      if (!existing || !(await visible(call, existing))) throw new NotFoundError();
      const result = await authorizeRemove(call, store, existing);
      await backend.apply([{ type: 'delete', store, key: id }, ...result.extra]);
    },
  };
}

/** Append-only: audit events and outbox messages. */
function appendOnly(backend: RawBackend, options: StoreOptions, store: 'audit' | 'outbox') {
  return async (ctx: ActorContext, input: unknown) => {
    const rec = validate(store, input) as Rec;
    const call = await beginCall(backend, options, ctx);
    if (store === 'audit') {
      if (call.side !== 'provider' && (await tenantOf(call, store, rec)) !== call.clientId) {
        throw new ForbiddenError('tenant');
      }
      if (rec['actorId'] !== ctx.userId || rec['actorSide'] !== ctx.side) throw new ForbiddenError('permission');
    }
    // Non-provider actors cannot back-date or forward-date an audit event: time comes from the context.
    if (store === 'audit' && call.side !== 'provider') rec['at'] = ctx.now;
    const key = keyOf(store, rec);
    if ((await backend.get(store, key)) !== undefined) throw new ValidationError([`id: ${key} already exists`]);
    await backend.apply([{ type: 'put', store, key, record: rec }]);
    return structuredClone(rec);
  };
}

function demoAdmin(backend: RawBackend, options: StoreOptions, runJobs: DemoAdmin['runJobs']): DemoAdmin {
  const setting = async (key: string): Promise<unknown> => {
    const row = (await backend.get('settings', key)) as SettingsRecord | undefined;
    return row?.value;
  };
  const setSetting = (key: string, value: unknown): Promise<void> =>
    backend.apply([{ type: 'put', store: 'settings', key, record: { key, value } satisfies SettingsRecord }]);

  return {
    clearAll: () => backend.clear(),
    runJobs,
    async bulkPut(store, records) {
      const ops = records.map((record, i): WriteOp => {
        const clean = validate(store, record, `[${i}] `);
        return { type: 'put', store, key: keyOf(store, clean), record: clean };
      });
      await backend.apply(ops);
    },
    async dumpAll() {
      const out = {} as Record<StoreName, unknown[]>;
      for (const store of storeNames) out[store] = (await backend.getAll(store)).sort(byKey(store));
      return out;
    },
    async getDemoState() {
      return (await setting('demoState')) as DemoState | undefined;
    },
    async setDemoState(state) {
      const parsed = demoStateSchema.safeParse(state);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
      }
      await setSetting('demoState', parsed.data);
    },
    async getSeedMeta() {
      return (await setting('seedMeta')) as SeedMeta | undefined;
    },
    async setSeedMeta(meta) {
      const parsed = seedMetaSchema.safeParse(meta);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
      }
      await setSetting('seedMeta', parsed.data);
    },
    async listOutbox() {
      return ((await backend.getAll('outbox')) as OutboxMessage[]).sort(byKey('outbox'));
    },
    async listPersonas() {
      const clients = (await backend.getAll('clients')) as Client[];
      const nameOf = new Map(clients.map((c) => [c.id, c.displayName]));
      return ((await backend.getAll('users')) as UserAccount[])
        .filter(
          (u): u is UserAccount & { side: 'client' | 'staff'; clientId: string } =>
            (u.side === 'client' || u.side === 'staff') &&
            u.status === 'active' &&
            u.clientId !== undefined &&
            nameOf.has(u.clientId),
        )
        .map((u) => ({
          userId: u.id,
          displayName: u.displayName,
          side: u.side,
          clientId: u.clientId,
          clientName: nameOf.get(u.clientId) as string,
        }))
        .sort(
          (a, b) =>
            (a.side === b.side ? 0 : a.side === 'client' ? -1 : 1) ||
            (a.clientName < b.clientName ? -1 : a.clientName > b.clientName ? 1 : 0) ||
            (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0),
        );
    },
    simulateFailedPayment: (clientId, now) => simulateFailedPayment(backend, options, clientId, now),
    async listStaffUsers(clientId) {
      return ((await backend.getAll('users')) as UserAccount[])
        .filter(
          (u) => u.side === 'staff' && u.clientId === clientId && u.status === 'active' && u.personId !== undefined,
        )
        .map((u) => ({ userId: u.id, displayName: u.displayName, personId: u.personId as string }))
        .sort((a, b) => (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0));
    },
  };
}

/** Wraps a backend so every successful batch tells the listeners which stores changed (names only, no data). */
function notifying(inner: RawBackend): { backend: RawBackend; subscribe: StoreHandle['subscribe'] } {
  const listeners = new Set<ChangeListener>();
  const tell = (stores: StoreName[]): void => {
    if (stores.length === 0) return;
    for (const listener of [...listeners]) {
      try {
        listener([...stores]);
      } catch {
        // A broken listener must not break a write that already succeeded.
      }
    }
  };
  return {
    backend: {
      getAll: (store) => inner.getAll(store),
      get: (store, key) => inner.get(store, key),
      async apply(ops) {
        await inner.apply(ops);
        tell([...new Set(ops.map((op) => op.store))]);
      },
      async clear() {
        await inner.clear();
        tell([...storeNames]);
      },
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createStore(rawBackend: RawBackend, options: StoreOptions): StoreHandle {
  const { backend, subscribe } = notifying(rawBackend);
  const ops = createOperations(backend, options);
  const engagement = createEngagementOperations(backend, options);
  const competitionOps = createCompetitionOperations(backend, options);
  const identity = createIdentityOperations(backend, options);
  const billingOps = createBillingOperations(backend, options);
  const authoringOps = createAuthoringOperations(backend, options);
  const evidenceFlow = createEvidenceOperations(backend, options);
  const support = createSupportOperations(backend, options);
  const rules = createRulesOperations(backend, options);
  const readOnly = (name: StoreName) => {
    const full = repo(backend, options, name);
    return { get: full.get, list: full.list };
  };
  const r = (name: StoreName) => repo(backend, options, name);
  const withoutRemove = (name: StoreName) => {
    const full = r(name);
    return { get: full.get, list: full.list, put: full.put };
  };
  const audit = r('audit');
  const notificationsRepo = readOnly('notifications');
  const store = {
    clients: withoutRemove('clients'),
    sites: r('sites'),
    teams: r('teams'),
    people: { ...r('people'), ...rules.people },
    autoAssign: rules.autoAssign,
    reminders: rules.reminders,
    users: r('users'),
    jobRoles: r('jobRoles'),
    requirements: r('requirements'),
    evidence: withoutRemove('evidence'),
    evidenceSubmissions: withoutRemove('evidenceSubmissions'),
    roles: r('roles'),
    roleAssignments: r('roleAssignments'),
    packages: withoutRemove('packages'),
    addOns: { ...withoutRemove('addOns'), ...billingOps.addOnOps },
    billing: billingOps.billing,
    addOnRequests: billingOps.addOnRequests,
    account: billingOps.account,
    ai: billingOps.ai,
    subscriptions: withoutRemove('subscriptions'),
    addOnSubscriptions: withoutRemove('addOnSubscriptions'),
    paymentAttempts: withoutRemove('paymentAttempts'),
    audit: { get: audit.get, list: audit.list, append: appendOnly(backend, options, 'audit') },
    outbox: { append: appendOnly(backend, options, 'outbox') },
    modules: readOnly('modules'),
    attachments: authoringOps.attachments,
    authoring: authoringOps.authoring,
    linkOverlays: authoringOps.linkOverlays,
    clientLinkOverlays: readOnly('clientLinkOverlays'),
    assignments: { ...readOnly('assignments'), assign: ops.assign, assignGroup: authoringOps.assignGroup },
    learningEvents: readOnly('learningEvents'),
    attempts: readOnly('attempts'),
    notifications: {
      ...readOnly('notifications'),
      list: async (ctx: ActorContext, filter?: Filter) => {
        const visible = (await notificationsRepo.list(ctx, filter)) as { snoozedUntil?: string }[];
        const now = new Date(ctx.now).getTime();
        return visible.filter((n) => n.snoozedUntil === undefined || new Date(n.snoozedUntil).getTime() <= now);
      },
      markRead: ops.markRead,
      snooze: rules.snooze,
    },
    learning: ops.learning,
    ...engagement,
    access: { ...engagement.access, features: (ctx: ActorContext) => billingOps.features(ctx) },
    ...competitionOps,
    ...identity,
    evidenceFlow,
    ...support,
  };
  return {
    store: store as unknown as DataStore,
    admin: demoAdmin(backend, options, (now) => rules.runJobs(now)),
    subscribe,
  };
}

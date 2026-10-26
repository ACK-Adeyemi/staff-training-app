// createStore: builds a DataStore and DemoAdmin on top of any RawBackend. Both adapters use it, so the
// policy (validation, tenancy, permissions, audit, account state, entitlements) is identical.
import { demoStateSchema, seedMetaSchema, type DemoState, type OutboxMessage, type SeedMeta } from '@sta/domain';
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

function repo(backend: RawBackend, options: StoreOptions, store: StoreName) {
  const begin = (ctx: ActorContext): Promise<Call> => beginCall(backend, options, ctx);

  const visible = async (call: Call, record: Rec): Promise<boolean> =>
    (await canReadStore(call, store)) && (await canReadRecord(call, store, record));

  return {
    get: async (ctx: ActorContext, id: string) => {
      const call = await begin(ctx);
      const record = (await backend.get(store, id)) as Rec | undefined;
      if (!record || !(await visible(call, record))) throw new NotFoundError();
      return record;
    },

    list: async (ctx: ActorContext, filter?: Filter) => {
      const call = await begin(ctx);
      if (!(await canReadStore(call, store))) throw new ForbiddenError('permission');
      const out: Rec[] = [];
      for (const record of (await backend.getAll(store)) as Rec[]) {
        if (matches(record, filter) && (await canReadRecord(call, store, record))) out.push(record);
      }
      return out.sort(byKey(store));
    },

    put: async (ctx: ActorContext, input: unknown) => {
      const rec = validate(store, input) as Rec;
      const call = await begin(ctx);
      const existing = (await backend.get(store, keyOf(store, rec))) as Rec | undefined;
      await checkTenancy(call, store, rec, existing);
      const result = await authorizePut(call, store, rec, existing);
      const ops: WriteOp[] = [{ type: 'put', store, key: keyOf(store, rec), record: result.record }, ...result.extra];
      await backend.apply(ops);
      return structuredClone(result.record);
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

function demoAdmin(backend: RawBackend): DemoAdmin {
  const setting = async (key: string): Promise<unknown> => {
    const row = (await backend.get('settings', key)) as SettingsRecord | undefined;
    return row?.value;
  };
  const setSetting = (key: string, value: unknown): Promise<void> =>
    backend.apply([{ type: 'put', store: 'settings', key, record: { key, value } satisfies SettingsRecord }]);

  return {
    clearAll: () => backend.clear(),
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
  };
}

export function createStore(backend: RawBackend, options: StoreOptions): StoreHandle {
  const r = (name: StoreName) => repo(backend, options, name);
  const withoutRemove = (name: StoreName) => {
    const full = r(name);
    return { get: full.get, list: full.list, put: full.put };
  };
  const audit = r('audit');
  const store = {
    clients: withoutRemove('clients'),
    sites: r('sites'),
    teams: r('teams'),
    people: r('people'),
    users: r('users'),
    jobRoles: r('jobRoles'),
    requirements: r('requirements'),
    evidence: withoutRemove('evidence'),
    evidenceSubmissions: withoutRemove('evidenceSubmissions'),
    roles: r('roles'),
    roleAssignments: r('roleAssignments'),
    packages: withoutRemove('packages'),
    addOns: withoutRemove('addOns'),
    subscriptions: withoutRemove('subscriptions'),
    addOnSubscriptions: withoutRemove('addOnSubscriptions'),
    paymentAttempts: withoutRemove('paymentAttempts'),
    audit: { get: audit.get, list: audit.list, append: appendOnly(backend, options, 'audit') },
    outbox: { append: appendOnly(backend, options, 'outbox') },
  };
  return { store: store as unknown as DataStore, admin: demoAdmin(backend) };
}

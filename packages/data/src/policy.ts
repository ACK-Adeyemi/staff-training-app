// The one policy every adapter uses (plan chunk 7). Order of checks for a write:
// validate (in createStore) -> actor -> tenancy -> permission -> role rules (selfEdit, escalation, lastOwner)
// -> account state -> entitlement limits. Business rules live in @sta/domain; this file only calls them.
import {
  accountStateAt,
  defaultDunningPolicy,
  canEditRolesOf,
  canGrant,
  can,
  checkLimit,
  effectivePermissions,
  entitlements,
  featureAvailability,
  lastOwnerGuard,
  twoFactorStatus,
  ulid,
  type AccountState,
  type AddOn,
  type EffectiveEntitlements,
  type AddOnSubscription,
  type Assignment,
  type AuditEvent,
  type Client,
  type EffectivePermission,
  type Package,
  type Person,
  type Role,
  type RoleAssignment,
  type Scope,
  type Subscription,
  type Site,
  type Target,
  type UserAccount,
  type OwnerChange,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import {
  AccountStateError,
  ForbiddenError,
  NotEntitledError,
  type ActorContext,
  type ForbiddenReason,
  type StoreName,
  type StoreOptions,
} from './types';

type Rec = Record<string, unknown>;

/** Tenant marker for records that belong to the provider rather than to a client. */
const PROVIDER = 'provider';
/** Tenant marker for a record whose owner cannot be found. It matches nobody. */
const UNKNOWN = '?';

/** Stores whose records may be global (no clientId): pack-level and catalogue data. */
const GLOBAL_STORES: ReadonlySet<StoreName> = new Set(['jobRoles', 'requirements', 'packages', 'addOns', 'modules']);
/** Learning stores actors can read but never write directly; writes go through the learning operations. */
const READ_ONLY_STORES: ReadonlySet<StoreName> = new Set([
  'modules',
  'attachments',
  'clientLinkOverlays',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
]);
/** Readable by any client or staff actor of the owning client (record rules still apply). */
const OPEN_TO_OWN_CLIENT: ReadonlySet<StoreName> = new Set([
  'modules',
  'attachments',
  'clientLinkOverlays',
  'notifications',
]);
/** Learning records that belong to one person; staff read only their own. */
const PERSONAL_STORES: ReadonlySet<StoreName> = new Set(['assignments', 'learningEvents', 'attempts']);
/** Stores only the provider writes (billing.write). */
const PROVIDER_WRITE_ONLY: ReadonlySet<StoreName> = new Set([
  'subscriptions',
  'addOnSubscriptions',
  'paymentAttempts',
  'packages',
  'addOns',
]);
/** What a staff actor may read at all (Assumption 9); the record filters are in readableByStaff. */
const STAFF_STORES: ReadonlySet<StoreName> = new Set([
  'clients',
  'sites',
  'people',
  'users',
  'evidence',
  'evidenceSubmissions',
  'jobRoles',
  'requirements',
  'modules',
  'attachments',
  'clientLinkOverlays',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
]);

const CLIENT_READ: Partial<Record<StoreName, string[]>> = {
  sites: ['staff.view'],
  teams: ['staff.view'],
  people: ['staff.view'],
  users: ['staff.view'],
  roles: ['staff.view'],
  roleAssignments: ['staff.view'],
  evidence: ['evidence.view'],
  evidenceSubmissions: ['evidence.view'],
  subscriptions: ['billing.view'],
  addOnSubscriptions: ['billing.view'],
  paymentAttempts: ['billing.view'],
  packages: ['billing.view'],
  addOns: ['billing.view'],
  audit: ['settings.view'],
  assignments: ['assign.view'],
  learningEvents: ['reports.view'],
  attempts: ['reports.view'],
};

const PROVIDER_READ: Partial<Record<StoreName, string[]>> = {
  clients: ['clients.read', 'billing.read'],
  sites: ['clients.read'],
  teams: ['clients.read'],
  people: ['clients.viewPersonalRecords'],
  jobRoles: ['clients.read', 'packs.read', 'content.read'],
  requirements: ['clients.read', 'packs.read', 'content.read'],
  subscriptions: ['clients.read', 'billing.read'],
  addOnSubscriptions: ['billing.read'],
  paymentAttempts: ['billing.read'],
  packages: ['clients.read', 'billing.read'],
  addOns: ['clients.read', 'billing.read'],
  audit: ['audit.read'],
  modules: ['content.read'],
  // evidence and evidenceSubmissions are never readable by the provider (Assumption 10)
  // users, roles and roleAssignments depend on whose they are (providerReadIds)
};

const CLIENT_WRITE: Partial<Record<StoreName, string[]>> = {
  clients: ['settings.manage'],
  sites: ['staff.manage'],
  teams: ['staff.manage'],
  people: ['staff.manage'],
  users: ['staff.manage'],
  jobRoles: ['staff.manage'],
  requirements: ['assign.manage'],
  evidence: ['evidence.approve'],
};
const PROVIDER_WRITE: Partial<Record<StoreName, string[]>> = {
  clients: ['clients.write'],
  sites: ['clients.write'],
  teams: ['clients.write'],
  people: ['clients.write'],
  jobRoles: ['packs.write'],
  requirements: ['packs.write'],
};
const CLIENT_REMOVE: Partial<Record<StoreName, string[]>> = {
  people: ['staff.delete'],
  users: ['staff.delete'],
};
const PROVIDER_REMOVE: Partial<Record<StoreName, string[]>> = {
  people: ['clients.delete'],
  users: ['clients.delete'],
};

export const forbid = (reason: ForbiddenReason): never => {
  throw new ForbiddenError(reason);
};

/** The M3 stores no operation is wired to yet: every actor is refused until a later chunk adds its operations. */
const UNWIRED_STORES: ReadonlySet<StoreName> = new Set<StoreName>([
  'moduleDrafts',
  'moduleVersions',
  'autoAssignRules',
  'reminderLog',
  'themes',
  'invitations',
  'onboarding',
  'invoices',
  'billingProfiles',
  'billingChangeRequests',
  'addOnRequests',
  'moduleFeedback',
  'appFeedback',
  'tickets',
  'ticketMessages',
  'faqVotes',
]);

/**
 * The account state at `now`, derived from the subscription (M3 assumption 45). A client with no subscription
 * falls back to the stored state. Never read `client.accountState` directly for a decision.
 */
export function derivedAccountState(client: Client, subscription: Subscription | undefined, now: Date): AccountState {
  return subscription ? accountStateAt(subscription, [], defaultDunningPolicy, now) : client.accountState;
}

export type Actor = {
  ctx: ActorContext;
  user: UserAccount;
  perms: EffectivePermission[];
  now: Date;
  client?: Client;
  /** The derived account state of the actor's client (undefined for the provider). */
  accountState?: AccountState;
};

/** Everything one DataStore call needs: the resolved actor plus lazily loaded, cached reads. */
export class Call {
  private readonly cache = new Map<StoreName, Promise<unknown[]>>();
  constructor(
    readonly backend: RawBackend,
    readonly options: StoreOptions,
    readonly actor: Actor,
  ) {}

  all<T>(store: StoreName): Promise<T[]> {
    let hit = this.cache.get(store);
    if (!hit) {
      hit = this.backend.getAll(store);
      this.cache.set(store, hit);
    }
    return hit as Promise<T[]>;
  }

  async find<T extends { id: string }>(store: StoreName, id: string): Promise<T | undefined> {
    return (await this.all<T>(store)).find((r) => r.id === id);
  }

  newId(): string {
    return ulid(this.options.clock, this.options.rng);
  }

  get side(): ActorContext['side'] {
    return this.actor.ctx.side;
  }
  get clientId(): string | undefined {
    return this.actor.ctx.clientId;
  }
}

/** Resolves the actor. Unknown, suspended or mismatched users get `unknownActor` on every call. */
export async function beginCall(
  backend: RawBackend,
  options: StoreOptions,
  ctx: ActorContext,
  opts: { allowLimited?: boolean } = {},
): Promise<Call> {
  const user = (await backend.get('users', ctx.userId)) as UserAccount | undefined;
  if (
    !user ||
    user.status !== 'active' ||
    user.side !== ctx.side ||
    user.clientId !== ctx.clientId ||
    Number.isNaN(new Date(ctx.now).getTime())
  ) {
    return forbid('unknownActor');
  }
  const assignments = ((await backend.getAll('roleAssignments')) as RoleAssignment[]).filter(
    (a) => a.userId === user.id,
  );
  const roles = (await backend.getAll('roles')) as Role[];
  const now = new Date(ctx.now);
  const perms = effectivePermissions(user.id, assignments, roles, now);
  let client: Client | undefined;
  if (ctx.side !== 'provider') {
    client = (await backend.get('clients', ctx.clientId ?? '')) as Client | undefined;
    if (!client) return forbid('unknownActor');
  }
  const accountState = client
    ? derivedAccountState(client, (await backend.get('subscriptions', client.id)) as Subscription | undefined, now)
    : undefined;
  const actor: Actor = {
    ctx,
    user,
    perms,
    now,
    ...(client ? { client } : {}),
    ...(accountState ? { accountState } : {}),
  };
  const call = new Call(backend, options, actor);
  // The two-step sign-in gate (M3 assumption 3): one check here covers every operation. The few calls that must work
  // while limited (own user, own permissions, me, twoFactor) pass `allowLimited`.
  if (ctx.side === 'client' && !opts.allowLimited && twoFactorStatus(user, now).kind === 'limited') {
    return forbid('twoFactorRequired');
  }
  // Reads and exports are never blocked before Deleted; Deleted is unavailable to everyone but the provider.
  if (accountState) {
    const feature = ctx.side === 'staff' ? 'staffOwnRecord' : 'coreCompliance';
    if (featureAvailability(accountState, feature) === 'no') {
      throw new AccountStateError(accountState, feature);
    }
  }
  return call;
}

export const holds = (call: Call, ids: readonly string[]): boolean =>
  call.actor.perms.some((p) => ids.includes(p.permissionId));

export const canAny = (call: Call, ids: readonly string[], target: Target, mode: 'read' | 'write'): boolean =>
  ids.some((id) => can(call.actor.perms, id, target, mode));

// ---------------------------------------------------------------- tenancy

/** The owning client id, PROVIDER, UNKNOWN, or undefined for a global record. */
export async function tenantOf(call: Call, store: StoreName, r: Rec): Promise<string | undefined> {
  switch (store) {
    case 'clients':
      return r['id'] as string;
    case 'users':
      return (r['clientId'] as string | undefined) ?? PROVIDER;
    case 'audit':
      return (r['clientId'] as string | undefined) ?? PROVIDER;
    case 'roles': {
      const owner = r['owner'] as 'provider' | { clientId: string };
      return owner === 'provider' ? PROVIDER : owner.clientId;
    }
    case 'roleAssignments': {
      const user = await call.find<UserAccount>('users', r['userId'] as string);
      return user ? (user.clientId ?? PROVIDER) : UNKNOWN;
    }
    case 'modules': {
      const owner = r['owner'] as 'provider' | { clientId: string };
      return owner === 'provider' ? undefined : owner.clientId;
    }
    case 'packages':
    case 'addOns':
    case 'outbox':
    case 'settings':
      return undefined;
    default:
      return r['clientId'] as string | undefined;
  }
}

async function sitesOf(call: Call, store: StoreName, r: Rec): Promise<string[] | undefined> {
  switch (store) {
    case 'people':
      return [r['primarySiteId'] as string, ...(r['additionalSiteIds'] as string[])];
    case 'sites':
      return [r['id'] as string];
    case 'teams':
    case 'evidenceSubmissions':
      return [r['siteId'] as string];
    case 'evidence':
      return [r['siteIdAtTime'] as string];
    case 'learningEvents':
    case 'attempts':
      return [r['siteId'] as string];
    case 'assignments': {
      const person = await call.find<Person>('people', r['personId'] as string);
      return person ? [person.primarySiteId, ...person.additionalSiteIds] : undefined;
    }
    case 'users': {
      const personId = r['personId'] as string | undefined;
      const person = personId ? await call.find<Person>('people', personId) : undefined;
      return person ? [person.primarySiteId, ...person.additionalSiteIds] : undefined;
    }
    default:
      return undefined;
  }
}

const visibleToTenant = (call: Call, store: StoreName, tenant: string | undefined): boolean =>
  call.side === 'provider' || tenant === call.clientId || (tenant === undefined && GLOBAL_STORES.has(store));

// ---------------------------------------------------------------- reads

async function providerReadIds(call: Call, store: StoreName, r: Rec | undefined): Promise<string[]> {
  const fixed = PROVIDER_READ[store];
  if (fixed) return fixed;
  if (store === 'users' || store === 'roles' || store === 'roleAssignments') {
    if (!r) return ['clients.viewPersonalRecords', 'clients.read', 'team.read'];
    const tenant = await tenantOf(call, store, r);
    if (tenant === PROVIDER) return ['team.read'];
    return store === 'users' ? ['clients.viewPersonalRecords'] : ['clients.read'];
  }
  return [];
}

/** May this actor read the store at all? (A false answer is Forbidden for list, NotFound for get.) */
export async function canReadStore(call: Call, store: StoreName): Promise<boolean> {
  switch (call.side) {
    case 'staff':
      return STAFF_STORES.has(store);
    case 'provider':
      // Everyone can look for their own notifications; the record filter keeps it to theirs.
      return store === 'notifications' || holds(call, await providerReadIds(call, store, undefined));
    case 'client': {
      if (OPEN_TO_OWN_CLIENT.has(store)) return true;
      if (store === 'clients' || store === 'jobRoles' || store === 'requirements') return true;
      const ids = CLIENT_READ[store];
      return ids !== undefined && holds(call, ids);
    }
  }
}

export async function canReadRecord(call: Call, store: StoreName, r: Rec): Promise<boolean> {
  const tenant = await tenantOf(call, store, r);
  if (!visibleToTenant(call, store, tenant)) return false;
  const { actor } = call;
  if (store === 'notifications') return r['userId'] === actor.user.id;
  if (store === 'modules' && call.side !== 'provider') {
    const owner = r['owner'] as 'provider' | { clientId: string; siteId?: string };
    // Drafts and archived modules are for the client admins who own them; everyone else sees published modules only.
    if (
      r['status'] !== 'published' &&
      !(call.side === 'client' && owner !== 'provider' && holds(call, ['modules.view']))
    ) {
      return false;
    }
    // A site module is for that site: its people, and admins who can read modules there.
    if (owner !== 'provider' && owner.siteId !== undefined) {
      if (call.side === 'client') {
        return canAny(call, ['modules.view'], { clientId: owner.clientId, siteIds: [owner.siteId] }, 'read');
      }
      const personId = call.actor.user.personId;
      const person = personId ? await call.find<Person>('people', personId) : undefined;
      return person !== undefined && [person.primarySiteId, ...person.additionalSiteIds].includes(owner.siteId);
    }
  }
  if (call.side === 'staff') {
    if (!STAFF_STORES.has(store)) return false;
    const personId = actor.user.personId;
    if (PERSONAL_STORES.has(store)) return personId !== undefined && r['personId'] === personId;
    switch (store) {
      case 'people':
        return r['id'] === personId;
      case 'users':
        return r['id'] === actor.user.id;
      case 'evidence':
      case 'evidenceSubmissions':
        return personId !== undefined && r['personId'] === personId;
      default:
        return true; // own client record, the client's sites, and global pack data
    }
  }
  const siteIds = await sitesOf(call, store, r);
  const target: Target = {
    ...(tenant !== undefined && tenant !== PROVIDER && tenant !== UNKNOWN ? { clientId: tenant } : {}),
    ...(siteIds ? { siteIds } : {}),
  };
  if (call.side === 'provider') return canAny(call, await providerReadIds(call, store, r), target, 'read');
  if (store === 'clients' || store === 'jobRoles' || store === 'requirements' || OPEN_TO_OWN_CLIENT.has(store)) {
    return true;
  }
  const ids = CLIENT_READ[store];
  return ids !== undefined && canAny(call, ids, target, 'read');
}

// ---------------------------------------------------------------- writes

export type WriteResult = { record: unknown; extra: WriteOp[] };

/** Tenancy for a put: a client or staff actor may only write their own client's records. */
export async function checkTenancy(call: Call, store: StoreName, rec: Rec, existing: Rec | undefined): Promise<void> {
  if (call.side === 'provider' || PROVIDER_WRITE_ONLY.has(store)) {
    return;
  }
  const mine = async (r: Rec): Promise<boolean> => (await tenantOf(call, store, r)) === call.clientId;
  if (!(await mine(rec)) || (existing !== undefined && !(await mine(existing)))) forbid('tenant');
}

function requireWrite(
  call: Call,
  store: StoreName,
  sites: string[] | undefined,
  tenant: string | undefined,
  ids?: string[],
): void {
  const table = call.side === 'provider' ? PROVIDER_WRITE : CLIENT_WRITE;
  const needed = ids ?? table[store];
  const target: Target = {
    ...(tenant !== undefined && tenant !== PROVIDER && tenant !== UNKNOWN ? { clientId: tenant } : {}),
    ...(sites ? { siteIds: sites } : {}),
  };
  if (!needed || !canAny(call, needed, target, 'write')) forbid('permission');
}

/** Account state for client-side writes: creating things is `authoring`; everything else needs full compliance use. */
export function checkAccountState(call: Call, isCreate: boolean): void {
  const state = call.actor.accountState;
  if (!state) return;
  const feature = isCreate ? 'authoring' : 'coreCompliance';
  if (featureAvailability(state, feature) !== 'yes') {
    throw new AccountStateError(state, feature);
  }
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function audit(
  call: Call,
  clientId: string | undefined,
  action: string,
  target: string,
  before: unknown,
  after: unknown,
  reason?: string,
): WriteOp {
  const event: AuditEvent = {
    id: call.newId(),
    actorId: call.actor.user.id,
    actorSide: call.side,
    ...(clientId ? { clientId } : {}),
    action,
    target,
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    ...(reason ? { reason } : {}),
    at: call.actor.ctx.now,
  };
  return { type: 'put', store: 'audit', key: event.id, record: event };
}

const clientIdOf = (tenant: string | undefined): string | undefined =>
  tenant === undefined || tenant === PROVIDER || tenant === UNKNOWN ? undefined : tenant;

export async function authorizePut(
  call: Call,
  store: StoreName,
  rec: Rec,
  existing: Rec | undefined,
): Promise<WriteResult> {
  if (UNWIRED_STORES.has(store)) return forbid('permission');
  const tenant = await tenantOf(call, store, rec);
  const isCreate = existing === undefined;

  if (store === 'roles') return putRole(call, rec as unknown as Role, existing as Role | undefined);
  if (store === 'roleAssignments') {
    return putAssignment(call, rec as unknown as RoleAssignment, existing as RoleAssignment | undefined);
  }
  if (READ_ONLY_STORES.has(store)) return forbid('permission');
  // Evidence is written only by the approval flow (and seed loading through DemoAdmin.bulkPut).
  if (store === 'evidence') return forbid('permission');
  // Submissions change only through evidenceFlow (and seed loading through DemoAdmin.bulkPut): a direct put is refused.
  if (store === 'evidenceSubmissions') return forbid('permission');

  if (PROVIDER_WRITE_ONLY.has(store)) {
    if (
      call.side !== 'provider' ||
      !canAny(call, ['billing.write'], clientIdOf(tenant) ? { clientId: tenant as string } : {}, 'write')
    ) {
      forbid('permission');
    }
    return { record: rec, extra: [] };
  }
  if (call.side === 'staff') return forbid('permission');

  let ids: string[] | undefined;
  if (call.side === 'provider' && store === 'users') {
    ids = tenant === PROVIDER ? ['team.manage'] : ['clients.write'];
  }
  if (call.side === 'provider' && (store === 'jobRoles' || store === 'requirements') && tenant !== undefined) {
    ids = ['clients.write'];
  }
  const sites = await sitesOf(call, store, rec);
  requireWrite(call, store, sites, tenant, ids);
  if (existing)
    requireWrite(call, store, await sitesOf(call, store, existing), await tenantOf(call, store, existing), ids);

  if (store === 'users' && call.side !== 'provider') {
    const u = rec as unknown as UserAccount;
    if (u.side === 'provider' || (existing && (existing as unknown as UserAccount).side !== u.side)) {
      forbid('permission');
    }
  }
  if (call.side !== 'provider') {
    checkAccountState(call, isCreate && (store === 'people' || store === 'users'));
  }
  return { record: rec, extra: store === 'people' ? await cancelOpenAssignments(call, rec) : [] };
}

/** Archiving a person cancels their open assignments in the same batch (plan Data package). */
async function cancelOpenAssignments(call: Call, person: Rec): Promise<WriteOp[]> {
  if (person['status'] !== 'archived') return [];
  const open = (await call.all<Assignment>('assignments')).filter(
    (a) => a.personId === person['id'] && a.status === 'open',
  );
  return open.map((a) => ({
    type: 'put',
    store: 'assignments',
    key: a.id,
    record: { ...a, status: 'cancelled' },
  }));
}

export async function authorizeRemove(call: Call, store: StoreName, existing: Rec): Promise<WriteResult> {
  if (UNWIRED_STORES.has(store)) return forbid('permission');
  const tenant = await tenantOf(call, store, existing);
  if (READ_ONLY_STORES.has(store)) return forbid('permission');
  if (store === 'evidence') return forbid('permission');
  if (store === 'roles') return removeRole(call, existing as unknown as Role);
  if (store === 'roleAssignments') return removeAssignment(call, existing as unknown as RoleAssignment);
  if (call.side === 'staff') return forbid('permission');
  const table = call.side === 'provider' ? PROVIDER_REMOVE : CLIENT_REMOVE;
  let ids = table[store];
  if (!ids) {
    ids = (call.side === 'provider' ? PROVIDER_WRITE : CLIENT_WRITE)[store];
    if (call.side === 'provider' && store === 'users' && tenant === PROVIDER) ids = ['team.manage'];
  }
  requireWrite(call, store, await sitesOf(call, store, existing), tenant, ids);
  const extra: WriteOp[] = [];
  if (store === 'users') {
    const user = existing as unknown as UserAccount;
    const assignments = await call.all<RoleAssignment>('roleAssignments');
    const roles = await call.all<Role>('roles');
    if (!lastOwnerGuard({ type: 'deleteUser', userId: user.id }, assignments, roles, call.actor.now).ok) {
      forbid('lastOwner');
    }
    for (const a of assignments)
      if (a.userId === user.id) extra.push({ type: 'delete', store: 'roleAssignments', key: a.id });
  }
  if (call.side !== 'provider') checkAccountState(call, false);
  return { record: undefined, extra };
}

// ---------------------------------------------------------------- roles and assignments

const manageIds = (call: Call): string[] => (call.side === 'provider' ? ['roles.manage'] : ['team.manageRoles']);

function requireManage(call: Call, tenant: string | undefined): void {
  const target: Target = clientIdOf(tenant) ? { clientId: tenant as string } : {};
  if (call.side === 'staff' || !canAny(call, manageIds(call), target, 'write')) forbid('permission');
}

async function putRole(call: Call, role: Role, existing: Role | undefined): Promise<WriteResult> {
  const tenant = role.owner === 'provider' ? PROVIDER : role.owner.clientId;
  if (call.side !== 'provider' && (role.system || existing?.system)) forbid('permission');
  requireManage(call, tenant);
  // No escalation: only permissions that are new on this role must be grantable by the actor.
  const fresh = role.permissionIds.filter((p) => !existing?.permissionIds.includes(p));
  const clientId = clientIdOf(tenant);
  const scope: Scope = clientId ? { type: 'clients', ids: [clientId] } : { type: 'all' };
  if (!canGrant(call.actor.perms, fresh, scope, clientId)) forbid('escalation');
  const isCreate = existing === undefined;
  if (call.side !== 'provider') checkAccountState(call, isCreate);
  if (isCreate && clientId && !role.system) await checkCustomRoleLimit(call, clientId);
  return {
    record: role,
    extra: [audit(call, clientId, isCreate ? 'role.created' : 'role.updated', `role:${role.id}`, existing, role)],
  };
}

function removeRole(call: Call, role: Role): WriteResult {
  const tenant = role.owner === 'provider' ? PROVIDER : role.owner.clientId;
  if (call.side !== 'provider' && role.system) forbid('permission');
  requireManage(call, tenant);
  if (call.side !== 'provider') checkAccountState(call, false);
  return {
    record: undefined,
    extra: [audit(call, clientIdOf(tenant), 'role.removed', `role:${role.id}`, role, undefined)],
  };
}

/** The account's effective entitlements (package, active add-ons, account state), or undefined if it has no package. */
export async function clientEntitlements(call: Call, clientId: string): Promise<EffectiveEntitlements | undefined> {
  const client = await call.find<Client>('clients', clientId);
  // The subscription is the billing record; the client's packageId is its copy, used when there is no subscription.
  const subscription = client
    ? (await call.all<Subscription>('subscriptions')).find((x) => x.clientId === clientId)
    : undefined;
  const pkg = client ? await call.find<Package>('packages', subscription?.packageId ?? client.packageId) : undefined;
  if (!client || !pkg) return undefined;
  const packages = await call.all<Package>('packages');
  // The floor package is the cheapest one: what an account keeps when it is not on a full plan.
  const price = (p: Package): number => p.bands[0]?.pricePerSite ?? 0;
  const floor = packages.reduce((lowest, p) => (price(p) < price(lowest) ? p : lowest), pkg);
  const addOnSubs = (await call.all<AddOnSubscription>('addOnSubscriptions')).filter(
    (s) =>
      s.clientId === clientId &&
      s.status !== 'off' &&
      (s.endsAt === undefined || Date.parse(s.endsAt) > call.actor.now.getTime()),
  );
  const addOns = (await call.all<AddOn>('addOns')).filter((a) => addOnSubs.some((s) => s.addOnId === a.id));
  return entitlements(pkg, addOns, derivedAccountState(client, subscription, call.actor.now), floor);
}

export async function checkCustomRoleLimit(call: Call, clientId: string): Promise<void> {
  const ents = await clientEntitlements(call, clientId);
  if (!ents) throw new NotEntitledError('customClientRoles');
  const roles = await call.all<Role>('roles');
  const used = roles.filter((r) => r.owner !== 'provider' && r.owner.clientId === clientId && !r.system).length;
  if (!checkLimit(ents, { customClientRoles: used }, 'customClientRoles').allowed) {
    throw new NotEntitledError('customClientRoles');
  }
}

async function assignmentContext(call: Call, a: RoleAssignment) {
  const user = await call.find<UserAccount>('users', a.userId);
  const roles = await call.all<Role>('roles');
  return { user, roles, tenant: user ? (user.clientId ?? PROVIDER) : UNKNOWN };
}

/** Roles and scope must belong to the same tenant as the user they are assigned to. */
async function checkAssignmentTenancy(call: Call, a: RoleAssignment): Promise<void> {
  const { user, roles, tenant } = await assignmentContext(call, a);
  if (!user) return forbid('tenant');
  for (const roleId of a.roleIds) {
    const role = roles.find((r) => r.id === roleId);
    const owner = role ? (role.owner === 'provider' ? PROVIDER : role.owner.clientId) : UNKNOWN;
    if (owner !== tenant) forbid('tenant');
  }
  if (tenant === PROVIDER) return;
  switch (a.scope.type) {
    case 'all':
      return forbid('tenant');
    case 'clients':
      if (a.scope.ids.some((id) => id !== tenant)) forbid('tenant');
      return;
    case 'sites': {
      const sites = await call.all<Site>('sites');
      if (a.scope.ids.some((id) => sites.find((s) => s.id === id)?.clientId !== tenant)) forbid('tenant');
      return;
    }
    case 'own':
      return;
  }
}

async function permissionsOf(call: Call, a: RoleAssignment): Promise<string[]> {
  const roles = await call.all<Role>('roles');
  const fromRoles = a.roleIds.flatMap((id) => roles.find((r) => r.id === id)?.permissionIds ?? []);
  return [...new Set([...fromRoles, ...a.grants])];
}

async function putAssignment(
  call: Call,
  a: RoleAssignment,
  existing: RoleAssignment | undefined,
): Promise<WriteResult> {
  await checkAssignmentTenancy(call, a);
  const { tenant } = await assignmentContext(call, a);
  requireManage(call, tenant);
  if (!canEditRolesOf(call.actor.user.id, a.userId)) forbid('selfEdit');
  if (existing && !canEditRolesOf(call.actor.user.id, existing.userId)) forbid('selfEdit');

  const clientId = clientIdOf(tenant);
  const held =
    existing && sameJson(existing.scope, a.scope) ? new Set(await permissionsOf(call, existing)) : new Set<string>();
  const fresh = (await permissionsOf(call, a)).filter((p) => !held.has(p));
  if (!canGrant(call.actor.perms, fresh, a.scope, clientId)) forbid('escalation');

  if (existing) {
    const assignments = await call.all<RoleAssignment>('roleAssignments');
    const roles = await call.all<Role>('roles');
    const changes: OwnerChange[] = [];
    if (existing.status === 'active' && a.status === 'suspended') changes.push({ type: 'suspend', assignmentId: a.id });
    for (const roleId of existing.roleIds.filter((r) => !a.roleIds.includes(r))) {
      changes.push({ type: 'removeRole', assignmentId: a.id, roleId });
    }
    if (a.expiresAt !== undefined && a.expiresAt !== existing.expiresAt) {
      changes.push({ type: 'setExpiry', assignmentId: a.id, expiresAt: a.expiresAt });
    }
    for (const change of changes) {
      if (!lastOwnerGuard(change, assignments, roles, call.actor.now).ok) forbid('lastOwner');
    }
  }
  if (call.side !== 'provider') checkAccountState(call, false);
  return {
    record: a,
    extra: [
      audit(
        call,
        clientId,
        existing ? 'roleAssignment.updated' : 'roleAssignment.created',
        `roleAssignment:${a.id}`,
        existing,
        a,
      ),
    ],
  };
}

async function removeAssignment(call: Call, a: RoleAssignment): Promise<WriteResult> {
  const { tenant } = await assignmentContext(call, a);
  requireManage(call, tenant);
  if (!canEditRolesOf(call.actor.user.id, a.userId)) forbid('selfEdit');
  const assignments = await call.all<RoleAssignment>('roleAssignments');
  const roles = await call.all<Role>('roles');
  if (!lastOwnerGuard({ type: 'removeAssignment', assignmentId: a.id }, assignments, roles, call.actor.now).ok) {
    forbid('lastOwner');
  }
  if (call.side !== 'provider') checkAccountState(call, false);
  return {
    record: undefined,
    extra: [audit(call, clientIdOf(tenant), 'roleAssignment.removed', `roleAssignment:${a.id}`, a, undefined)],
  };
}

// ---------------------------------------------------------------- evidence submissions

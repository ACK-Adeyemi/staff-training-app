// The one policy every adapter uses (plan chunk 7). Order of checks for a write:
// validate (in createStore) -> actor -> tenancy -> permission -> role rules (selfEdit, escalation, lastOwner)
// -> account state -> entitlement limits. Business rules live in @sta/domain; this file only calls them.
import {
  canApproveEvidence,
  canEditRolesOf,
  canGrant,
  can,
  checkLimit,
  effectivePermissions,
  entitlements,
  featureAvailability,
  lastOwnerGuard,
  ulid,
  type AddOn,
  type AddOnSubscription,
  type AuditEvent,
  type Client,
  OWNER_KEYS,
  isAssignmentActive,
  type EffectivePermission,
  type Evidence,
  type EvidenceSubmission,
  type Package,
  type Person,
  type Role,
  type RoleAssignment,
  type Scope,
  type Site,
  type Target,
  type UserAccount,
  type OwnerChange,
} from '@sta/domain';
import { keyOf, type RawBackend, type WriteOp } from './backend';
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
const GLOBAL_STORES: ReadonlySet<StoreName> = new Set(['jobRoles', 'requirements', 'packages', 'addOns']);
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

const forbid = (reason: ForbiddenReason): never => {
  throw new ForbiddenError(reason);
};

export type Actor = {
  ctx: ActorContext;
  user: UserAccount;
  perms: EffectivePermission[];
  now: Date;
  client?: Client;
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
export async function beginCall(backend: RawBackend, options: StoreOptions, ctx: ActorContext): Promise<Call> {
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
  const actor: Actor = { ctx, user, perms, now, ...(client ? { client } : {}) };
  const call = new Call(backend, options, actor);
  // Reads and exports are never blocked before Deleted; Deleted is unavailable to everyone but the provider.
  if (client) {
    const feature = ctx.side === 'staff' ? 'staffOwnRecord' : 'coreCompliance';
    if (featureAvailability(client.accountState, feature) === 'no') {
      throw new AccountStateError(client.accountState, feature);
    }
  }
  return call;
}

const holds = (call: Call, ids: readonly string[]): boolean =>
  call.actor.perms.some((p) => ids.includes(p.permissionId));

const canAny = (call: Call, ids: readonly string[], target: Target, mode: 'read' | 'write'): boolean =>
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
      return holds(call, await providerReadIds(call, store, undefined));
    case 'client': {
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
  if (call.side === 'staff') {
    if (!STAFF_STORES.has(store)) return false;
    const personId = actor.user.personId;
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
  if (store === 'clients' || store === 'jobRoles' || store === 'requirements') return true;
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
function checkAccountState(call: Call, isCreate: boolean): void {
  const client = call.actor.client;
  if (!client) return;
  const feature = isCreate ? 'authoring' : 'coreCompliance';
  if (featureAvailability(client.accountState, feature) !== 'yes') {
    throw new AccountStateError(client.accountState, feature);
  }
}

const sortedKeys = (o: object): unknown => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function audit(
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
  const tenant = await tenantOf(call, store, rec);
  const isCreate = existing === undefined;

  if (store === 'roles') return putRole(call, rec as unknown as Role, existing as Role | undefined);
  if (store === 'roleAssignments') {
    return putAssignment(call, rec as unknown as RoleAssignment, existing as RoleAssignment | undefined);
  }
  // Evidence is written only by the approval flow (and seed loading through DemoAdmin.bulkPut).
  if (store === 'evidence') return forbid('permission');
  if (store === 'evidenceSubmissions') {
    return putSubmission(call, rec as unknown as EvidenceSubmission, existing as EvidenceSubmission | undefined);
  }

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
  return { record: rec, extra: [] };
}

export async function authorizeRemove(call: Call, store: StoreName, existing: Rec): Promise<WriteResult> {
  const tenant = await tenantOf(call, store, existing);
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

async function checkCustomRoleLimit(call: Call, clientId: string): Promise<void> {
  const client = await call.find<Client>('clients', clientId);
  const pkg = client ? await call.find<Package>('packages', client.packageId) : undefined;
  if (!client || !pkg) throw new NotEntitledError('customClientRoles');
  const packages = await call.all<Package>('packages');
  // The floor package is the cheapest one: what an account keeps when it is not on a full plan.
  const price = (p: Package): number => p.bands[0]?.pricePerSite ?? 0;
  const floor = packages.reduce((lowest, p) => (price(p) < price(lowest) ? p : lowest), pkg);
  const addOnSubs = (await call.all<AddOnSubscription>('addOnSubscriptions')).filter(
    (s) => s.clientId === clientId && s.status !== 'off',
  );
  const addOns = (await call.all<AddOn>('addOns')).filter((a) => addOnSubs.some((s) => s.addOnId === a.id));
  const ents = entitlements(pkg, addOns, client.accountState, floor);
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

async function putSubmission(
  call: Call,
  sub: EvidenceSubmission,
  existing: EvidenceSubmission | undefined,
): Promise<WriteResult> {
  if (call.side === 'provider') return forbid('permission');
  const { actor } = call;
  const approving = sub.status === 'approved' && existing?.status !== 'approved';

  if (approving) {
    // Identity fields come from the stored submission; the caller only decides.
    const base = existing ?? sub;
    const assignments = await call.all<RoleAssignment>('roleAssignments');
    const roles = await call.all<Role>('roles');
    const users = await call.all<UserAccount>('users');
    const activeUsers = new Set(
      users
        .filter((u) => u.clientId === base.clientId && u.side === 'client' && u.status === 'active')
        .map((u) => u.id),
    );
    const now = new Date(actor.ctx.now);
    const activeAdmins = new Set(
      assignments.filter((a) => activeUsers.has(a.userId) && isAssignmentActive(a, now)).map((a) => a.userId),
    );
    const isAccountOwner = assignments.some(
      (a) =>
        a.userId === actor.user.id &&
        isAssignmentActive(a, now) &&
        a.roleIds.some((id) => {
          const r = roles.find((x) => x.id === id);
          return r?.system === true && r.systemKey === OWNER_KEYS.client;
        }),
    );
    const result = canApproveEvidence(
      { userId: actor.user.id, personId: actor.user.personId ?? '', permissions: actor.perms, isAccountOwner },
      { clientId: base.clientId, siteId: base.siteId, personId: base.personId, uploadedBy: base.uploadedBy },
      {
        adminCount: activeAdmins.size,
        clientSettings: { allowSelfApproval: actor.client?.settings.allowSelfApproval ?? false },
      },
    );
    if (!result.allowed)
      return forbid(result.reason === 'noPermission' || !result.reason ? 'permission' : result.reason);
    checkAccountState(call, false);

    const evidenceId = existing?.evidenceId ?? call.newId();
    const stored: EvidenceSubmission = {
      ...base,
      ...(sub.decisionNote === undefined ? {} : { decisionNote: sub.decisionNote }),
      status: 'approved',
      reviewerId: actor.user.id,
      reviewedAt: actor.ctx.now,
      evidenceId,
    };
    const evidence: Evidence = {
      id: evidenceId,
      clientId: base.clientId,
      personId: base.personId,
      requirementId: base.requirementId,
      kind: 'external',
      completedAt: base.completedAt,
      ...(base.expiresAt === undefined ? {} : { expiresAt: base.expiresAt }),
      attachmentId: base.fileAttachmentId,
      siteIdAtTime: base.siteId,
      submissionId: base.id,
      approvedBy: actor.user.id,
      approvedAt: actor.ctx.now,
      ...(result.selfApproved ? { selfApproved: true } : {}),
    };
    return {
      record: stored,
      extra: [
        { type: 'put', store: 'evidence', key: keyOf('evidence', evidence), record: evidence },
        audit(
          call,
          base.clientId,
          'evidence.approved',
          `evidenceSubmission:${base.id}`,
          { submissionId: base.id, status: base.status },
          { submissionId: base.id, status: 'approved', evidenceId },
          result.selfApproved ? 'selfApproved' : undefined,
        ),
      ],
    };
  }

  // An approved submission is immutable: its evidence already exists.
  if (existing?.status === 'approved') forbid('permission');

  const decisionFields = ['reviewerId', 'reviewedAt', 'decisionNote', 'rejectionReason', 'evidenceId'] as const;
  const decisionsUnchanged = decisionFields.every((f) => sameJson(sub[f], existing?.[f]));

  if (call.side === 'staff') {
    const ownPerson = actor.user.personId;
    const own = ownPerson !== undefined && sub.personId === ownPerson && sub.uploadedBy === actor.user.id;
    if (!own) forbid('permission');
    if (existing === undefined) {
      // Staff create only their own, waiting for a check, with no decision fields.
      if (sub.status !== 'awaitingCheck' || !decisionsUnchanged) forbid('permission');
    } else {
      const ownExisting = existing.personId === ownPerson && existing.uploadedBy === actor.user.id;
      const withdrawing =
        existing.status === 'awaitingCheck' &&
        sub.status === 'withdrawn' &&
        sameJson(sortedKeys({ ...existing, status: 'withdrawn' }), sortedKeys(sub));
      if (!ownExisting || !withdrawing) forbid('permission');
    }
    checkAccountState(call, false);
    return { record: sub, extra: [] };
  }

  const scopes = (siteId: string): Target => ({ clientId: sub.clientId, siteIds: [siteId] });
  const siteIds = existing ? [existing.siteId, sub.siteId] : [sub.siteId];
  const allowed = (ids: string[]) => siteIds.every((siteId) => canAny(call, ids, scopes(siteId), 'write'));
  if (existing && (existing.clientId !== sub.clientId || existing.personId !== sub.personId)) forbid('permission');

  const statusChange = existing ? sub.status !== existing.status : sub.status !== 'awaitingCheck';
  if (statusChange) {
    // Rejecting, asking for a better copy or withdrawing is a decision: it needs evidence.approve and is audited.
    if (!allowed(['evidence.approve'])) forbid('permission');
    checkAccountState(call, false);
    const stored: EvidenceSubmission = {
      ...sub,
      reviewerId: actor.user.id,
      reviewedAt: actor.ctx.now,
    };
    return {
      record: stored,
      extra: [
        audit(
          call,
          sub.clientId,
          `evidence.${sub.status}`,
          `evidenceSubmission:${sub.id}`,
          existing ? { submissionId: sub.id, status: existing.status } : undefined,
          { submissionId: sub.id, status: sub.status },
        ),
      ],
    };
  }
  if (!allowed(['evidence.approve', 'evidence.uploadForOthers'])) forbid('permission');
  if (!decisionsUnchanged && !allowed(['evidence.approve'])) forbid('permission');
  checkAccountState(call, false);
  return { record: sub, extra: [] };
}

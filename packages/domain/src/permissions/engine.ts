// Permission engine: pure functions, no storage. Build pack section 6, brief 22.4 and 27.5.
import type { Role, RoleAssignment, Scope } from '../schemas/access';
import { clientCatalogue, providerCatalogue } from './catalogue';

/** An 'own' scope is bound to the user when permissions are computed, so can() needs no user id. */
export type EffectiveScope = Exclude<Scope, { type: 'own' }> | { type: 'own'; userId: string };

export type EffectivePermission = {
  permissionId: string;
  scopes: EffectiveScope[];
  sources: { roleId?: string; grant?: true }[];
};

export type Target = { clientId?: string; siteIds?: string[]; ownerUserId?: string };
export type Mode = 'read' | 'write';

const requiresOf = new Map([...clientCatalogue, ...providerCatalogue].map((p) => [p.id, p.requires]));
const sensitiveOf = new Map([...clientCatalogue, ...providerCatalogue].map((p) => [p.id, p.sensitive]));
const clientIds = new Set(clientCatalogue.map((p) => p.id));
const providerIds = new Set(providerCatalogue.map((p) => p.id));

const isActive = (a: RoleAssignment, now: Date): boolean =>
  a.status === 'active' && (a.expiresAt === undefined || new Date(a.expiresAt).getTime() > now.getTime());

const bindScope = (scope: Scope, userId: string): EffectiveScope =>
  scope.type === 'own' ? { type: 'own', userId } : scope;

/** Union of role permissions and grants over active assignments, minus global denies, then dependency pruning. */
export function effectivePermissions(
  userId: string,
  assignments: RoleAssignment[],
  roles: Role[],
  now: Date,
): EffectivePermission[] {
  const active = assignments.filter((a) => a.userId === userId && isActive(a, now));
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const denied = new Set(active.flatMap((a) => a.denies));
  const acc = new Map<string, EffectivePermission>();

  const add = (permissionId: string, scope: EffectiveScope, source: { roleId?: string; grant?: true }): void => {
    if (denied.has(permissionId)) return;
    let entry = acc.get(permissionId);
    if (!entry) {
      entry = { permissionId, scopes: [], sources: [] };
      acc.set(permissionId, entry);
    }
    if (!entry.scopes.some((s) => JSON.stringify(s) === JSON.stringify(scope))) entry.scopes.push(scope);
    if (!entry.sources.some((s) => s.roleId === source.roleId && s.grant === source.grant)) entry.sources.push(source);
  };

  for (const a of active) {
    const scope = bindScope(a.scope, userId);
    for (const roleId of a.roleIds) {
      const role = roleById.get(roleId);
      if (role) for (const id of role.permissionIds) add(id, scope, { roleId });
    }
    for (const id of a.grants) add(id, scope, { grant: true });
  }

  // Dependency pruning: drop anything whose requirements are not all still held, until stable.
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...acc.keys()]) {
      if ((requiresOf.get(id) ?? []).some((r) => !acc.has(r))) {
        acc.delete(id);
        changed = true;
      }
    }
  }
  return [...acc.values()];
}

const scopeMatches = (scope: EffectiveScope, target: Target, mode: Mode): boolean => {
  switch (scope.type) {
    case 'all':
      return true;
    case 'clients':
      return target.clientId !== undefined && scope.ids.includes(target.clientId);
    case 'sites': {
      const sites = target.siteIds ?? [];
      if (sites.length === 0) return false;
      return mode === 'read' ? sites.some((s) => scope.ids.includes(s)) : sites.every((s) => scope.ids.includes(s));
    }
    case 'own':
      return target.ownerUserId !== undefined && target.ownerUserId === scope.userId;
  }
};

export function can(perms: EffectivePermission[], permissionId: string, target: Target, mode: Mode = 'write'): boolean {
  const p = perms.find((x) => x.permissionId === permissionId);
  return p !== undefined && p.scopes.some((s) => scopeMatches(s, target, mode));
}

/** Does one of the granter's scopes (or their union, for sites and clients) cover the requested scope? */
const covers = (held: EffectiveScope[], requested: Scope, clientId?: string): boolean => {
  if (held.some((s) => s.type === 'all')) return true;
  switch (requested.type) {
    case 'all':
      return false;
    case 'own':
      return held.some((s) => s.type === 'own');
    case 'clients': {
      const ids = new Set(held.flatMap((s) => (s.type === 'clients' ? s.ids : [])));
      return requested.ids.length > 0 && requested.ids.every((id) => ids.has(id));
    }
    case 'sites': {
      if (requested.ids.length === 0) return false;
      const ids = new Set(held.flatMap((s) => (s.type === 'sites' ? s.ids : [])));
      if (requested.ids.every((id) => ids.has(id))) return true;
      // Sites do not carry their client here, so a client-wide holder covers them only when the caller names the client.
      return clientId !== undefined && held.some((s) => s.type === 'clients' && s.ids.includes(clientId));
    }
  }
};

/**
 * No privilege escalation: the granter must hold every permission over a scope that covers the requested one.
 * Sensitive permissions also need team.manageRoles (client) or roles.manage (provider), held over the same scope.
 * `clientId` is needed for a granter with a whole-client scope to grant on named sites.
 */
export function canGrant(
  granterPerms: EffectivePermission[],
  permissionIds: string[],
  scope: Scope,
  clientId?: string,
): boolean {
  const heldScopes = (id: string): EffectiveScope[] => granterPerms.find((p) => p.permissionId === id)?.scopes ?? [];
  for (const id of permissionIds) {
    const isClient = clientIds.has(id);
    if (!isClient && !providerIds.has(id)) return false;
    if (!covers(heldScopes(id), scope, clientId)) return false;
    if (sensitiveOf.get(id)) {
      const manager = isClient ? 'team.manageRoles' : 'roles.manage';
      if (!covers(heldScopes(manager), scope, clientId)) return false;
    }
  }
  return true;
}

export const canEditRolesOf = (actorUserId: string, targetUserId: string): boolean => actorUserId !== targetUserId;

export type OwnerChange =
  | { type: 'removeAssignment'; assignmentId: string }
  | { type: 'removeRole'; assignmentId: string; roleId: string }
  | { type: 'suspend'; assignmentId: string }
  | { type: 'setExpiry'; assignmentId: string; expiresAt: string }
  | { type: 'deleteUser'; userId: string };

/** The provider Owner or a client's Account Owner: a system role with that name. Returns its group key. */
const ownerGroup = (role: Role): string | undefined => {
  if (!role.system) return undefined;
  if (role.owner === 'provider') return role.name === 'Owner' ? 'provider' : undefined;
  return role.name === 'Account Owner' ? role.owner.clientId : undefined;
};

const applyChange = (change: OwnerChange, assignments: RoleAssignment[]): RoleAssignment[] => {
  switch (change.type) {
    case 'removeAssignment':
      return assignments.filter((a) => a.id !== change.assignmentId);
    case 'deleteUser':
      return assignments.filter((a) => a.userId !== change.userId);
    case 'removeRole':
      return assignments.map((a) =>
        a.id === change.assignmentId ? { ...a, roleIds: a.roleIds.filter((r) => r !== change.roleId) } : a,
      );
    case 'suspend':
      return assignments.map((a) => (a.id === change.assignmentId ? { ...a, status: 'suspended' as const } : a));
    case 'setExpiry':
      return assignments.map((a) => (a.id === change.assignmentId ? { ...a, expiresAt: change.expiresAt } : a));
  }
};

const activeOwners = (assignments: RoleAssignment[], roles: Role[], now: Date): Map<string, Set<string>> => {
  const groupOf = new Map<string, string>();
  for (const r of roles) {
    const g = ownerGroup(r);
    if (g) groupOf.set(r.id, g);
  }
  const owners = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!isActive(a, now)) continue;
    for (const roleId of a.roleIds) {
      const g = groupOf.get(roleId);
      if (g) owners.set(g, (owners.get(g) ?? new Set()).add(a.userId));
    }
  }
  return owners;
};

/** Refuses a change that would leave the provider, or any client, with no active owner it had before. */
export function lastOwnerGuard(
  change: OwnerChange,
  assignments: RoleAssignment[],
  roles: Role[],
  now: Date,
): { ok: true } | { ok: false; reason: 'lastOwner' } {
  const before = activeOwners(assignments, roles, now);
  const after = activeOwners(applyChange(change, assignments), roles, now);
  for (const [group, users] of before) {
    if (users.size > 0 && (after.get(group)?.size ?? 0) === 0) return { ok: false, reason: 'lastOwner' };
  }
  return { ok: true };
}

export type ApprovalActor = {
  userId: string;
  personId: string;
  permissions: EffectivePermission[];
  isAccountOwner: boolean;
};
export type ApprovalSubmission = { clientId: string; siteId: string; personId: string; uploadedBy: string };
export type ApprovalContext = { adminCount: number; clientSettings: { allowSelfApproval: boolean } };
export type ApprovalResult = {
  allowed: boolean;
  selfApproved?: boolean;
  reason?: 'noPermission' | 'ownUpload' | 'aboutSelf' | 'outOfScope';
};

/** Brief 27.5: approvers need evidence.approve in scope and may not approve their own or evidence about themselves. */
export function canApproveEvidence(
  actor: ApprovalActor,
  submission: ApprovalSubmission,
  context: ApprovalContext,
): ApprovalResult {
  const target = { clientId: submission.clientId, siteIds: [submission.siteId] };
  if (!can(actor.permissions, 'evidence.approve', target)) {
    const holdsAnywhere = actor.permissions.some((p) => p.permissionId === 'evidence.approve');
    return { allowed: false, reason: holdsAnywhere ? 'outOfScope' : 'noPermission' };
  }
  const reason =
    submission.uploadedBy === actor.userId
      ? 'ownUpload'
      : submission.personId === actor.personId
        ? 'aboutSelf'
        : undefined;
  if (!reason) return { allowed: true };
  if (context.adminCount === 1 && context.clientSettings.allowSelfApproval && actor.isAccountOwner) {
    return { allowed: true, selfApproved: true };
  }
  return { allowed: false, reason };
}

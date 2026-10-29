// Provider team and roles (M4 chunk 5b, plan "Security notes"). Provider side only: client and staff actors are
// refused. Reads need team.read, member writes team.manage, role writes roles.manage; Owner and Co-Owner roles also
// need owner.manageOwnerRoles. No escalation (canGrant) and the last Owner is protected (lastOwnerGuard, recognised by
// systemKey, never by name). Every write is ONE batch together with its audit event.
import {
  canGrant,
  closePermissions,
  invitationSchema,
  lastOwnerGuard,
  OWNER_KEYS,
  providerCatalogue,
  providerRoleTemplates,
  addDays,
  type Invitation,
  type OutboxMessage,
  type Role,
  type RoleAssignment,
  type Scope,
  type UserAccount,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type ProviderRoleInput,
  type ProviderTeamMember,
  type ProviderTeamService,
  type StoreOptions,
} from './types';

const put = (store: WriteOp['store'], key: string, record: unknown): WriteOp => ({ type: 'put', store, key, record });
const remove = (store: WriteOp['store'], key: string): WriteOp => ({ type: 'delete', store, key });
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 14;
const ALL: Scope = { type: 'all' };
const providerIds = new Set(providerCatalogue.map((p) => p.id));
const ownerRoleKeys: readonly string[] = [OWNER_KEYS.provider, 'providerCoOwner'];
const isOwnerish = (r: Role): boolean => r.system && r.systemKey !== undefined && ownerRoleKeys.includes(r.systemKey);

export function createProviderTeamOperations(backend: RawBackend, options: StoreOptions): ProviderTeamService {
  /** A provider-side actor holding `permission`. Anyone else is refused. */
  async function providerCall(ctx: ActorContext, permission: string): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
    if (!holds(call, [permission])) return forbid('permission');
    return call;
  }

  const providerRoles = (roles: Role[]): Role[] => roles.filter((r) => r.owner === 'provider');

  /** A provider system template key (owner, admin ...) or the id of a custom provider role. */
  async function resolveRole(call: Call, roleKey: unknown): Promise<Role> {
    const key = text(roleKey);
    const roles = providerRoles(await call.all<Role>('roles'));
    const template = providerRoleTemplates.find((t) => t.key === key);
    const role = template
      ? roles.find((r) => r.system && r.systemKey === template.systemKey)
      : roles.find((r) => !r.system && r.id === key);
    if (!role) throw new ValidationError(['roleKey: choose a role from the list']);
    return role;
  }

  function needOwnerRights(call: Call, roles: Role[]): void {
    if (roles.some(isOwnerish) && !holds(call, ['owner.manageOwnerRoles'])) forbid('escalation');
  }

  function checkGrant(call: Call, permissionIds: string[]): void {
    const ok =
      canGrant(call.actor.perms, permissionIds, ALL) &&
      (!permissionIds.some((p) => p.startsWith('owner.')) || holds(call, ['owner.manageOwnerRoles']));
    if (!ok) forbid('escalation');
  }

  async function target(call: Call, userId: unknown): Promise<UserAccount> {
    const user = await call.find<UserAccount>('users', text(userId));
    if (!user || user.side !== 'provider') throw new NotFoundError();
    return user;
  }

  /** Refuses (lastOwner) removing this user's owner access when they are the last active Owner. */
  async function guardOwner(call: Call, userId: string): Promise<void> {
    const guard = lastOwnerGuard(
      { type: 'deleteUser', userId },
      await call.all<RoleAssignment>('roleAssignments'),
      await call.all<Role>('roles'),
      call.actor.now,
    );
    if (!guard.ok) forbid('lastOwner');
  }

  /** Roles the target holds now, so touching an Owner or Co-Owner needs the owner-roles right. */
  async function heldRoles(call: Call, userId: string): Promise<Role[]> {
    const roles = await call.all<Role>('roles');
    const ids = (await call.all<RoleAssignment>('roleAssignments'))
      .filter((a) => a.userId === userId)
      .flatMap((a) => a.roleIds);
    return roles.filter((r) => ids.includes(r.id));
  }

  function parseRole(input: Partial<ProviderRoleInput>, partial: boolean) {
    const out: Partial<ProviderRoleInput> = {};
    if (!partial || input.name !== undefined) {
      const name = text(input.name).trim();
      if (name.length < 1 || name.length > 60) throw new ValidationError(['name: 1 to 60 characters']);
      out.name = name;
    }
    if (!partial || input.description !== undefined) {
      const description = text(input.description).trim();
      if (description.length > 300) throw new ValidationError(['description: up to 300 characters']);
      out.description = description;
    }
    if (!partial || input.permissionIds !== undefined) {
      const ids = input.permissionIds;
      if (!Array.isArray(ids) || ids.some((p) => typeof p !== 'string' || !providerIds.has(p))) {
        throw new ValidationError(['permissionIds: not a known permission']);
      }
      out.permissionIds = closePermissions(ids).sort();
    }
    return out;
  }

  async function customRole(call: Call, roleId: unknown): Promise<Role> {
    const role = await call.find<Role>('roles', text(roleId));
    if (!role || role.owner !== 'provider') throw new NotFoundError();
    if (role.system) return forbid('permission');
    return role;
  }

  return {
    async list(ctx) {
      const call = await providerCall(ctx, 'team.read');
      const roles = await call.all<Role>('roles');
      const assignments = await call.all<RoleAssignment>('roleAssignments');
      const members: ProviderTeamMember[] = (await call.all<UserAccount>('users'))
        .filter((u) => u.side === 'provider')
        .map((u) => {
          const mine = assignments.filter((a) => a.userId === u.id);
          const ids = mine.flatMap((a) => a.roleIds);
          return {
            userId: u.id,
            name: u.displayName,
            email: u.email ?? '',
            status: u.status,
            roleNames: [...new Set(ids)].flatMap((id) => roles.find((r) => r.id === id)?.name ?? []),
          };
        });
      return members.sort((a, b) => (a.name === b.name ? (a.userId < b.userId ? -1 : 1) : a.name < b.name ? -1 : 1));
    },

    async invite(ctx, input) {
      const call = await providerCall(ctx, 'team.manage');
      const email = text(input.email).trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 200) throw new ValidationError(['email: not a valid email address']);
      const name = text(input.displayName).trim();
      if (name.length < 1 || name.length > 80) throw new ValidationError(['displayName: 1 to 80 characters']);
      const role = await resolveRole(call, input.roleKey);
      const users = await call.all<UserAccount>('users');
      if (users.some((u) => u.side === 'provider' && u.email?.toLowerCase() === email)) {
        throw new ValidationError(['email: this person is already on the team']);
      }
      needOwnerRights(call, [role]);
      checkGrant(call, role.permissionIds);
      // Per-client scoping of provider users is not built (docs/decisions.md 'M4 security review'): refuse it rather
      // than store a limit that nothing enforces.
      if ('clientIds' in input)
        throw new ValidationError(['clientIds: limiting a person to selected clients is not available']);
      const scope = ALL;

      const now = ctx.now;
      const user: UserAccount = {
        id: call.newId(),
        side: 'provider',
        email,
        displayName: name,
        status: 'invited',
        login: { method: 'emailPassword', pinSet: false },
      };
      const invitation: Invitation = invitationSchema.parse({
        id: call.newId(),
        side: 'provider',
        email,
        roleIds: [role.id],
        scope,
        invitedBy: call.actor.user.id,
        expiresAt: addDays(call.actor.now, INVITE_DAYS).toISOString(),
        status: 'invited',
      });
      const access: RoleAssignment = {
        id: call.newId(),
        userId: user.id,
        roleIds: [role.id],
        scope,
        grants: [],
        denies: [],
        status: 'active',
      };
      const mail: OutboxMessage = {
        id: call.newId(),
        channel: 'email',
        to: email,
        subject: 'You have been invited to the provider team',
        body: `${call.actor.user.displayName} has invited you to join the team. Use the link in the app to accept before ${invitation.expiresAt.slice(0, 10)}.`,
        at: now,
        reason: 'team.invite',
      };
      await backend.apply([
        put('users', user.id, user),
        put('invitations', invitation.id, invitation),
        put('roleAssignments', access.id, access),
        put('outbox', mail.id, mail),
        audit(call, undefined, 'team.invite', user.id, undefined, {
          roleId: role.id,
        }),
      ]);
      return structuredClone(user);
    },

    async setRole(ctx, userId, roleKey) {
      const call = await providerCall(ctx, 'team.manage');
      const user = await target(call, userId);
      const role = await resolveRole(call, roleKey);
      const held = await heldRoles(call, user.id);
      needOwnerRights(call, [role, ...held]);
      const mine = (await call.all<RoleAssignment>('roleAssignments')).filter((a) => a.userId === user.id);
      const alreadyHeld = new Set(held.flatMap((r) => r.permissionIds));
      checkGrant(
        call,
        role.permissionIds.filter((p) => !alreadyHeld.has(p)),
      );
      if (!isOwnerish(role) || role.systemKey !== OWNER_KEYS.provider) await guardOwner(call, user.id);
      const [first, ...others] = mine;
      const next: RoleAssignment = {
        id: first?.id ?? call.newId(),
        userId: user.id,
        roleIds: [role.id],
        scope: first?.scope ?? ALL,
        grants: [],
        denies: [],
        status: first?.status ?? 'active',
      };
      await backend.apply([
        put('roleAssignments', next.id, next),
        ...others.map((a) => remove('roleAssignments', a.id)),
        audit(call, undefined, 'team.setRole', user.id, { roleIds: held.map((r) => r.id) }, { roleIds: [role.id] }),
      ]);
    },

    async suspend(ctx, userId) {
      const call = await providerCall(ctx, 'team.manage');
      const user = await target(call, userId);
      // Someone who has not accepted yet cannot be suspended: reactivating would turn them active without accepting.
      if (user.status === 'invited') throw new RuleError('notApplicable');
      needOwnerRights(call, await heldRoles(call, user.id));
      await guardOwner(call, user.id);
      const mine = (await call.all<RoleAssignment>('roleAssignments')).filter((a) => a.userId === user.id);
      await backend.apply([
        put('users', user.id, { ...user, status: 'suspended' }),
        ...mine.map((a) => put('roleAssignments', a.id, { ...a, status: 'suspended' })),
        audit(call, undefined, 'team.suspend', user.id, { status: user.status }, { status: 'suspended' }),
      ]);
    },

    async reactivate(ctx, userId) {
      const call = await providerCall(ctx, 'team.manage');
      const user = await target(call, userId);
      if (user.status !== 'suspended') throw new RuleError('notApplicable');
      needOwnerRights(call, await heldRoles(call, user.id));
      const mine = (await call.all<RoleAssignment>('roleAssignments')).filter((a) => a.userId === user.id);
      await backend.apply([
        put('users', user.id, { ...user, status: 'active' }),
        ...mine.map((a) => put('roleAssignments', a.id, { ...a, status: 'active' })),
        audit(call, undefined, 'team.reactivate', user.id, { status: 'suspended' }, { status: 'active' }),
      ]);
    },

    async createRole(ctx, input) {
      const call = await providerCall(ctx, 'roles.manage');
      const parsed = parseRole(input, false);
      const permissionIds = parsed.permissionIds as string[];
      checkGrant(call, permissionIds);
      const role: Role = {
        id: call.newId(),
        owner: 'provider',
        name: parsed.name as string,
        description: parsed.description as string,
        colour: '#4a5568',
        permissionIds,
        system: false,
        version: 1,
        updatedBy: call.actor.user.id,
        updatedAt: ctx.now,
      };
      await backend.apply([
        put('roles', role.id, role),
        audit(call, undefined, 'role.create', role.id, undefined, {
          name: role.name,
          permissionCount: permissionIds.length,
        }),
      ]);
      return structuredClone(role);
    },

    async updateRole(ctx, roleId, input) {
      const call = await providerCall(ctx, 'roles.manage');
      const before = await customRole(call, roleId);
      const parsed = parseRole(input, true);
      if (parsed.permissionIds) checkGrant(call, parsed.permissionIds);
      const role: Role = {
        ...before,
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.permissionIds ? { permissionIds: parsed.permissionIds } : {}),
        version: before.version + 1,
        updatedBy: call.actor.user.id,
        updatedAt: ctx.now,
      };
      await backend.apply([
        put('roles', role.id, role),
        audit(
          call,
          undefined,
          'role.update',
          role.id,
          { version: before.version },
          { version: role.version, permissionCount: role.permissionIds.length },
        ),
      ]);
      return structuredClone(role);
    },

    async deleteRole(ctx, roleId) {
      const call = await providerCall(ctx, 'roles.manage');
      const role = await customRole(call, roleId);
      if ((await call.all<RoleAssignment>('roleAssignments')).some((a) => a.roleIds.includes(role.id))) {
        throw new ValidationError(['roleId: someone still has this role']);
      }
      await backend.apply([
        remove('roles', role.id),
        audit(call, undefined, 'role.delete', role.id, undefined, undefined),
      ]);
    },
  };
}

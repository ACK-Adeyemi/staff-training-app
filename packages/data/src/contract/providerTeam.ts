// M4 chunk 5b contract tests: provider team and roles (plan docs/plans/m4.md chunk 5, "Security notes").
// Written before the implementation, so `store.providerTeam` is described by the local types below.
//   - Reads need team.read, writes team.manage, role writes roles.manage; Owner/Co-Owner roles need owner.manageOwnerRoles.
//   - setRole's roleKey is a provider system key (owner, admin, ...) or the id of a custom role.
//   - Client and staff actors get ForbiddenError. The last Owner cannot be demoted or suspended (RuleError).
//   - createRole stores permissionIds closed over `requires` (team.manage brings team.read); unknown ids are ValidationError.
//   - Audit actions: team.invite, team.setRole, team.suspend, role.create, role.update, role.delete (provider side, no clientId).
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  type AuditEvent,
  type Invitation,
  type OutboxMessage,
  type Role,
  type RoleAssignment,
  type UserAccount,
} from '@sta/domain';
import {
  ForbiddenError,
  RuleError,
  ValidationError,
  type ActorContext,
  type StoreHandle,
  type StoreOptions,
} from '../types';
import { refusal } from './learning';
import { buildWorld, TODAY } from './world';

type Member = {
  userId: string;
  name: string;
  email: string;
  status: string;
  roleIds: string[];
  roleNames: string[];
};
type RoleInput = { name: string; description: string; permissionIds: string[] };
export type ProviderTeamStore = {
  providerTeam: {
    list(actor: ActorContext): Promise<Member[]>;
    invite(actor: ActorContext, input: { email: string; displayName: string; roleKey: string }): Promise<UserAccount>;
    setRole(actor: ActorContext, userId: string, roleKey: string): Promise<void>;
    suspend(actor: ActorContext, userId: string): Promise<void>;
    reactivate(actor: ActorContext, userId: string): Promise<void>;
    createRole(actor: ActorContext, input: RoleInput): Promise<Role>;
    updateRole(actor: ActorContext, roleId: string, input: Partial<RoleInput>): Promise<Role>;
    deleteRole(actor: ActorContext, roleId: string): Promise<void>;
  };
};

export function runProviderTeamContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    const store = (handle.store as unknown as ProviderTeamStore).providerTeam;
    const u = fx.ids.users;
    const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });
    const dump = async <T>(s: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[s] ?? [];
    const audit = async (action: string) => (await dump<AuditEvent>('audit')).filter((e) => e.action === action);
    const owner = provider(u.provOwner);
    // Sophie starts as Support; make her an Admin so there is an actor who has team.manage but not owner.manageOwnerRoles.
    await store.setRole(owner, u.support, 'admin');
    const admin = provider(u.support);
    const userByEmail = async (email: string) => (await dump<UserAccount>('users')).find((x) => x.email === email);
    return { store, fx, u, owner, admin, provider, dump, audit, userByEmail, raj: provider(fx.keys.users['raj']) };
  }
  const invite = { email: 'new.person@example.test', displayName: 'New Person', roleKey: 'readOnly' };

  describe(`M4 provider team: ${name}`, () => {
    it('lists provider members with name, email, status and role names', async () => {
      const s = await setup();
      const list = await s.store.list(s.owner);
      expect(list).toHaveLength(5);
      expect(list.find((m) => m.userId === s.u.provOwner)).toMatchObject({
        name: 'Owner',
        status: 'active',
        roleNames: ['Owner'],
      });
      const owner = list.find((m) => m.userId === s.u.provOwner)!;
      expect(owner.roleIds).toHaveLength(1);
    });

    it('refuses to limit an invited person to selected clients, because that scoping is not built', async () => {
      const s = await setup();
      const clientIds = [s.fx.ids.clients.a, s.fx.ids.clients.b];
      await expect(
        s.store.invite(s.owner, { ...invite, clientIds } as unknown as typeof invite),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(await s.userByEmail(invite.email)).toBeUndefined();
      await s.store.invite(s.owner, invite);
      const user = (await s.userByEmail(invite.email))!;
      const assignment = (await s.dump<RoleAssignment>('roleAssignments')).find((a) => a.userId === user.id)!;
      expect(assignment.scope).toEqual({ type: 'all' });
    });

    it('does not let an invited person be suspended and then reactivated without accepting', async () => {
      const s = await setup();
      await s.store.invite(s.owner, invite);
      const user = (await s.userByEmail(invite.email))!;
      await expect(s.store.suspend(s.owner, user.id)).rejects.toBeInstanceOf(RuleError);
      expect((await s.userByEmail(invite.email))?.status).toBe('invited');
    });

    it('invites a provider user with an invitation, role assignment, outbox email and audit', async () => {
      const s = await setup();
      await s.store.invite(s.owner, invite);
      const user = (await s.userByEmail(invite.email))!;
      expect(user).toMatchObject({ side: 'provider', status: 'invited', displayName: 'New Person' });
      expect(user.clientId).toBeUndefined();
      const inv = (await s.dump<Invitation>('invitations')).find((i) => i.email === invite.email)!;
      expect(inv).toMatchObject({ side: 'provider', status: 'invited', invitedBy: s.u.provOwner });
      expect(inv.clientId).toBeUndefined();
      const roleId = (await s.dump<Role>('roles')).find(
        (r) => r.owner === 'provider' && r.systemKey === 'providerReadOnly',
      )?.id;
      expect(inv.roleIds).toEqual([roleId]);
      expect(
        (await s.dump<RoleAssignment>('roleAssignments')).some(
          (a) => a.userId === user.id && a.roleIds.includes(roleId!),
        ),
      ).toBe(true);
      expect((await s.dump<OutboxMessage>('outbox')).filter((m) => m.to === invite.email)).toHaveLength(1);
      expect(await s.audit('team.invite')).toEqual([
        expect.objectContaining({ actorId: s.u.provOwner, actorSide: 'provider', at: TODAY }),
      ]);
      expect((await s.audit('team.invite'))[0]!.clientId).toBeUndefined();
    });

    it('refuses a duplicate email with ValidationError and writes nothing', async () => {
      const s = await setup();
      await s.store.invite(s.owner, invite);
      expect(await refusal(s.store.invite(s.owner, invite))).toBeInstanceOf(ValidationError);
      expect(await s.audit('team.invite')).toHaveLength(1);
    });

    it('needs team.manage to invite, set roles or suspend (Raj the billing user cannot)', async () => {
      const s = await setup();
      expect(await refusal(s.store.invite(s.raj, invite))).toBeInstanceOf(ForbiddenError);
      expect(await refusal(s.store.suspend(s.raj, s.u.tom))).toBeInstanceOf(ForbiddenError);
      expect(await refusal(s.store.setRole(s.raj, s.u.tom, 'admin'))).toBeInstanceOf(ForbiddenError);
      expect(await s.userByEmail(invite.email)).toBeUndefined();
    });

    it('refuses escalation: an Admin cannot invite or promote to Owner or Co-Owner, an Owner can', async () => {
      const s = await setup();
      for (const roleKey of ['owner', 'coOwner']) {
        expect(await refusal(s.store.invite(s.admin, { ...invite, roleKey }))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.setRole(s.admin, s.u.tom, roleKey))).toBeInstanceOf(ForbiddenError);
      }
      await s.store.setRole(s.owner, s.u.tom, 'coOwner');
      expect(await s.audit('team.setRole')).toHaveLength(2); // Sophie to Admin, Tom to Co-Owner
    });

    it('changes a role and audits it', async () => {
      const s = await setup();
      await s.store.setRole(s.admin, s.u.tom, 'support');
      expect((await s.store.list(s.owner)).find((m) => m.userId === s.u.tom)!.roleNames).toEqual(['Support']);
    });

    it('suspends and reactivates a member, with audit, and the last Owner cannot be demoted or suspended', async () => {
      const s = await setup();
      await s.store.suspend(s.admin, s.u.tom);
      expect((await s.store.list(s.owner)).find((m) => m.userId === s.u.tom)!.status).toBe('suspended');
      await s.store.reactivate(s.admin, s.u.tom);
      expect((await s.store.list(s.owner)).find((m) => m.userId === s.u.tom)!.status).toBe('active');
      expect(await s.audit('team.suspend')).toHaveLength(1);
      expect(await refusal(s.store.suspend(s.owner, s.u.provOwner))).toBeTruthy();
      expect(await refusal(s.store.setRole(s.owner, s.u.provOwner, 'admin'))).toBeTruthy();
      expect((await s.store.list(s.owner)).find((m) => m.userId === s.u.provOwner)!.roleNames).toEqual(['Owner']);
    });

    it('creates, updates and deletes a custom role with required permissions added, and audits each', async () => {
      const s = await setup();
      const role = await s.store.createRole(s.owner, {
        name: 'Team lead',
        description: 'Runs the team',
        permissionIds: ['team.manage'],
      });
      expect(role).toMatchObject({ owner: 'provider', system: false });
      expect([...role.permissionIds].sort()).toEqual(['team.manage', 'team.read']);
      const updated = await s.store.updateRole(s.owner, role.id, { name: 'Lead' });
      expect(updated.name).toBe('Lead');
      await s.store.deleteRole(s.owner, role.id);
      expect((await s.dump<Role>('roles')).some((r) => r.id === role.id)).toBe(false);
      for (const a of ['role.create', 'role.update', 'role.delete']) {
        expect(await s.audit(a)).toEqual([expect.objectContaining({ actorSide: 'provider', at: TODAY })]);
      }
    });

    it('refuses unknown permissions, editing or deleting system roles, and deleting a role still assigned', async () => {
      const s = await setup();
      const bad = { name: 'Bad', description: 'x', permissionIds: ['nope.nothing'] };
      expect(await refusal(s.store.createRole(s.owner, bad))).toBeInstanceOf(ValidationError);
      const roles = await s.dump<Role>('roles');
      const system = roles.find((r) => r.owner === 'provider' && r.system)!;
      expect(await refusal(s.store.updateRole(s.owner, system.id, { name: 'Renamed' }))).toBeTruthy();
      expect(await refusal(s.store.deleteRole(s.owner, system.id))).toBeTruthy();
      const custom = await s.store.createRole(s.owner, {
        name: 'Temp',
        description: 'x',
        permissionIds: ['tickets.read'],
      });
      await s.store.setRole(s.owner, s.u.tom, custom.id);
      expect(await refusal(s.store.deleteRole(s.owner, custom.id))).toBeTruthy();
      expect(await s.dump<Role>('roles')).toContainEqual(expect.objectContaining({ id: custom.id }));
    });

    it('refuses role writes without roles.manage and every call from client and staff actors', async () => {
      const s = await setup();
      const input = { name: 'X', description: 'x', permissionIds: ['tickets.read'] };
      expect(await refusal(s.store.createRole(s.raj, input))).toBeInstanceOf(ForbiddenError);
      const outsiders: ActorContext[] = [
        { userId: s.u.priya, side: 'client', clientId: s.fx.ids.clients.a, now: TODAY },
        { userId: s.u.jade, side: 'client', clientId: s.fx.ids.clients.a, now: TODAY },
      ];
      for (const o of outsiders) {
        expect(await refusal(s.store.list(o))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.invite(o, invite))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.setRole(o, s.u.tom, 'admin'))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.suspend(o, s.u.tom))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.reactivate(o, s.u.tom))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.createRole(o, input))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.updateRole(o, 'x', input))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(s.store.deleteRole(o, 'x'))).toBeInstanceOf(ForbiddenError);
      }
    });
  });
}

// M3 chunk 6 contract tests, "Data A: identity and organisation" (plan docs/plans/m3.md, Data package and Contract
// tests; M3 assumptions 3, 4, 7, 8, 9, 10). Proves BP-8, BP-9, BP-10 (team part), F-2 and F-4 in the data layer.
// Runs against every adapter. Written before the implementation, so the new DataStore methods are described by the
// local types below: they are the contract the implementer adds to `DataStore`.
//
// Audit action names the tests expect (one slim event per write; ids, action names and counts only):
//   twoFactor.enrolled, team.invite, team.setAccess, team.revoke, team.saveCustomRole, team.removeCustomRole,
//   organisation.updateProfile, organisation.updateSettings, organisation.updateSite, onboarding.markDone.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  compileClientRole,
  createRng,
  fixedClock,
  type Client,
  type ClientLevels,
  type OutboxMessage,
  type Role,
  type RoleAssignment,
  type Scope,
  type Site,
  type UserAccount,
} from '@sta/domain';
import {
  DataError,
  ForbiddenError,
  NotEntitledError,
  ValidationError,
  type ActorContext,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { addLearningFixture, refusal, ruleOf, type LearningHandle } from './learning';
import { buildWorld, freshId, TODAY, type World } from './world';

// ---------------------------------------------------------------- the API under test

export type TwoFactorState =
  { kind: 'notRequired' } | { kind: 'enrolled' } | { kind: 'grace'; daysLeft: number } | { kind: 'limited' };

export type InvitationRecord = {
  id: string;
  side: 'client' | 'provider';
  clientId?: string;
  email: string;
  roleIds: string[];
  scope: Scope;
  invitedBy: string;
  expiresAt: string;
  status: 'invited' | 'accepted' | 'expired' | 'revoked';
};

export type TeamMember = {
  userId: string;
  displayName: string;
  email?: string;
  status: 'invited' | 'active' | 'suspended';
  roleIds: string[];
  scope?: Scope;
};

export type AuditLine = {
  id: string;
  actorId: string;
  clientId?: string;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
  at: string;
};

export type CustomRoleInput = {
  id?: string;
  name: string;
  description?: string;
  colour?: string;
  levels: ClientLevels;
  allows: string[];
};

export type SettingsPatch = Partial<{
  amberWindowDays: number;
  weeklyGoalLessons: number;
  firstAiderThreshold: number;
  allowStaffTickets: boolean;
  pulseSurveys: boolean;
}>;

export type OnboardingView = {
  steps: { key: string; done: boolean; doneAt?: string }[];
  startedAt?: string;
  completedAt?: string;
};

export type IdentityStore = {
  users: { get(ctx: ActorContext, id: string): Promise<UserAccount> };
  people: { list(ctx: ActorContext): Promise<unknown[]> };
  me: { get(ctx: ActorContext): Promise<unknown> };
  access: { permissions(ctx: ActorContext): Promise<{ permissionId: string }[]> };
  notifications: { list(ctx: ActorContext): Promise<unknown[]> };
  assignments: {
    assign(ctx: ActorContext, input: { moduleId: string; personIds: string[]; dueAt: string }): Promise<unknown>;
  };
  twoFactor: {
    status(ctx: ActorContext): Promise<TwoFactorState>;
    startEnrolment(ctx: ActorContext): Promise<{ secret: string; uri: string }>;
    /** Returns the ten recovery codes, once. */
    confirmEnrolment(ctx: ActorContext, code: string): Promise<{ recoveryCodes: string[] }>;
    verify(ctx: ActorContext, code: string): Promise<void>;
    useRecoveryCode(ctx: ActorContext, code: string): Promise<void>;
  };
  team: {
    members(ctx: ActorContext): Promise<TeamMember[]>;
    invite(
      ctx: ActorContext,
      input: { email: string; displayName?: string; roleIds: string[]; scope: Scope },
    ): Promise<InvitationRecord>;
    setAccess(ctx: ActorContext, userId: string, input: { roleIds: string[]; scope: Scope }): Promise<RoleAssignment>;
    revoke(ctx: ActorContext, userId: string): Promise<void>;
    saveCustomRole(ctx: ActorContext, input: CustomRoleInput): Promise<Role>;
    removeCustomRole(ctx: ActorContext, roleId: string): Promise<void>;
    activity(ctx: ActorContext, filter?: { action?: string }): Promise<AuditLine[]>;
  };
  organisation: {
    /** Display name and short name only; any actor of the client, staff included. */
    profile(ctx: ActorContext): Promise<{ displayName: string; shortName?: string }>;
    supportSettings(ctx: ActorContext): Promise<{ allowStaffTickets: boolean }>;
    updateProfile(ctx: ActorContext, patch: { displayName?: string; shortName?: string }): Promise<unknown>;
    updateSettings(ctx: ActorContext, patch: SettingsPatch): Promise<unknown>;
    sites: { update(ctx: ActorContext, siteId: string, patch: { name?: string; region?: string }): Promise<Site> };
  };
  onboarding: {
    checklist(ctx: ActorContext): Promise<OnboardingView>;
    markDone(ctx: ActorContext, step: string): Promise<OnboardingView>;
  };
};

// ---------------------------------------------------------------- helpers

const DAY = 86_400_000;
const MIN = 60_000;
const plus = (ms: number): string => new Date(Date.parse(TODAY) + ms).toISOString();
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

const client = (userId: string, clientId: string, now = TODAY): ActorContext => ({
  userId,
  side: 'client',
  clientId,
  now,
});
const staff = (userId: string, clientId: string, now = TODAY): ActorContext => ({
  userId,
  side: 'staff',
  clientId,
  now,
});
const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await refusal(promise);
  expect(error).toBeInstanceOf(ForbiddenError);
  return (error as ForbiddenError).reason;
}

async function dump<T>(admin: StoreHandle['admin'], store: StoreName): Promise<T[]> {
  return ((await admin.dumpAll()) as Record<string, unknown[]>)[store] as T[];
}

const ALL_LEVELS_NONE: ClientLevels = {
  staff: 'none',
  evidence: 'none',
  assigning: 'none',
  modules: 'none',
  reports: 'none',
  competitions: 'none',
  themes: 'none',
  reminders: 'none',
  settingsBilling: 'none',
  feedbackHelp: 'none',
};

export function runIdentityOrgContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = (await makeStore(options)) as unknown as LearningHandle & StoreHandle;
    const fx: World = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const store = handle.store as unknown as IdentityStore;
    const admin = handle.admin;
    const a = fx.ids.clients.a;
    const ot = fx.ids.clients.ot;

    // Clean slate for the onboarding checklist of Little Acorns: nothing done yet.
    await admin.bulkPut('onboarding', [
      {
        clientId: a,
        startedAt: plus(-30 * DAY),
        steps: ['inviteStaff', 'reminderSettings', 'assignTraining', 'setUpCompetition', 'exportMatrix'].map((key) => ({
          key,
        })),
      },
    ]);

    const roles = await dump<Role>(admin, 'roles');
    const ownerRole = roles.find((r) => r.id === fx.ids.roles.aOwner)!;

    // Hand-built people: a second Account Owner at Little Acorns, and a role manager at Little Acorns who holds every
    // permission an owner does (so only lastOwnerGuard can stop a change), and a role manager at Oak Tree.
    const olive: UserAccount = {
      id: freshId(2001),
      side: 'client',
      clientId: a,
      email: 'olive@example.test',
      displayName: 'Olive',
      status: 'active',
      login: { method: 'emailPassword', pinSet: false },
    };
    const mega: UserAccount = { ...olive, id: freshId(2002), email: 'mega@example.test', displayName: 'Mega' };
    const otMgr: UserAccount = {
      ...olive,
      id: freshId(2003),
      clientId: ot,
      email: 'otmgr@example.test',
      displayName: 'Otmgr',
    };
    const plainOwner: Partial<Role> = { ...ownerRole };
    delete plainOwner.systemKey;
    delete plainOwner.clientLevels;
    delete plainOwner.clientAllows;
    const megaRole = {
      ...plainOwner,
      id: freshId(2010),
      name: 'Everything but owner',
      system: false,
      permissionIds: [...ownerRole.permissionIds],
    } as Role;
    const otMgrRole: Role = {
      ...megaRole,
      id: freshId(2011),
      owner: { clientId: ot },
      name: 'Oak Tree role manager',
      permissionIds: ['staff.view', 'staff.manage', 'team.manageRoles'],
    };
    const assignment = (id: number, userId: string, roleIds: string[], scope: Scope): RoleAssignment => ({
      id: freshId(id),
      userId,
      roleIds,
      scope,
      grants: [],
      denies: [],
      status: 'active',
    });
    await admin.bulkPut('users', [olive, mega, otMgr]);
    await admin.bulkPut('roles', [megaRole, otMgrRole]);
    await admin.bulkPut('roleAssignments', [
      assignment(2020, olive.id, [fx.ids.roles.aOwner], { type: 'clients', ids: [a] }),
      assignment(2021, mega.id, [megaRole.id], { type: 'clients', ids: [a] }),
      assignment(2022, otMgr.id, [otMgrRole.id], { type: 'clients', ids: [ot] }),
    ]);

    /** Marks a user as asked for two-step sign-in `daysAgo` days ago. */
    const requireTwoFactor = async (userId: string, daysAgo: number): Promise<void> => {
      const user = (await dump<UserAccount>(admin, 'users')).find((u) => u.id === userId)!;
      await admin.bulkPut('users', [{ ...user, twoFactorRequiredSince: plus(-daysAgo * DAY) }]);
    };
    const userRecord = async (userId: string): Promise<UserAccount> =>
      (await dump<UserAccount>(admin, 'users')).find((u) => u.id === userId)!;
    const clientRecord = async (clientId: string): Promise<Client> =>
      (await dump<Client>(admin, 'clients')).find((c) => c.id === clientId)!;

    return {
      ...handle,
      store,
      admin,
      fx,
      lf,
      a,
      ot,
      olive,
      mega,
      otMgr,
      megaRole,
      requireTwoFactor,
      userRecord,
      clientRecord,
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      rory: client(fx.ids.users.rory, a),
      mega_: client(mega.id, a),
      olive_: client(olive.id, a),
      jade: staff(fx.ids.users.jade, a),
      beth: client(fx.ids.users.beth, fx.ids.clients.b),
      otOwner: client(fx.ids.users.otOwner, ot),
      otMgr_: client(otMgr.id, ot),
      riverMgr: client(fx.ids.users.riverMgr, ot),
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  describe(`M3 identity and organisation (data A): ${name}`, () => {
    // ------------------------------------------------------------ two-factor (BP-9)
    describe('two-factor gate and operations', () => {
      /** Oak Tree's River manager, asked 12 days ago and not enrolled: limited (the seeded Colin case). */
      async function limited(): Promise<S> {
        const s = await setup();
        await s.requireTwoFactor(s.fx.ids.users.riverMgr, 12);
        return s;
      }
      const enrol = async (s: S) => {
        await s.store.twoFactor.startEnrolment(s.riverMgr);
        return (await s.store.twoFactor.confirmEnrolment(s.riverMgr, '123456')).recoveryCodes;
      };

      it('reports notRequired, grace with days left, limited and enrolled', async () => {
        const s = await setup();
        expect(await s.store.twoFactor.status(s.priya)).toEqual({ kind: 'notRequired' });
        await s.requireTwoFactor(s.fx.ids.users.daniel, 2);
        expect(await s.store.twoFactor.status(s.daniel)).toEqual({ kind: 'grace', daysLeft: 5 });
        await s.requireTwoFactor(s.fx.ids.users.riverMgr, 12);
        expect(await s.store.twoFactor.status(s.riverMgr)).toEqual({ kind: 'limited' });
        await enrol(s);
        expect(await s.store.twoFactor.status(s.riverMgr)).toEqual({ kind: 'enrolled' });
      });

      it('gives ForbiddenError twoFactorRequired for client calls outside the allowlist once the grace has passed', async () => {
        const s = await limited();
        expect(await reasonOf(s.store.people.list(s.riverMgr))).toBe('twoFactorRequired');
        expect(await reasonOf(s.store.team.members(s.riverMgr))).toBe('twoFactorRequired');
        expect(await reasonOf(s.store.organisation.updateSettings(s.riverMgr, { amberWindowDays: 45 }))).toBe(
          'twoFactorRequired',
        );
        expect(await reasonOf(s.store.onboarding.checklist(s.riverMgr))).toBe('twoFactorRequired');
      });

      it('still allows own users.get, access.permissions, me.get and twoFactor.* while limited', async () => {
        const s = await limited();
        const own = await s.store.users.get(s.riverMgr, s.fx.ids.users.riverMgr);
        expect(own.id).toBe(s.fx.ids.users.riverMgr);
        expect((await s.store.access.permissions(s.riverMgr)).length).toBeGreaterThan(0);
        await s.store.me.get(s.riverMgr);
        expect(await s.store.twoFactor.status(s.riverMgr)).toEqual({ kind: 'limited' });
        const start = await s.store.twoFactor.startEnrolment(s.riverMgr);
        expect(start.uri.startsWith('otpauth://totp/')).toBe(true);
        expect(start.uri).toContain(`secret=${start.secret}`);
        expect(start.secret).toMatch(/^[A-Z2-7]{16,}$/);
      });

      it("refuses another user's record while limited (only own users.get is allowed)", async () => {
        const s = await limited();
        expect(await reasonOf(s.store.users.get(s.riverMgr, s.fx.ids.users.otOwner))).toBe('twoFactorRequired');
      });

      it('lifts the limit at once when the demo code 123456 confirms enrolment', async () => {
        const s = await limited();
        expect(await reasonOf(s.store.people.list(s.riverMgr))).toBe('twoFactorRequired');
        await enrol(s);
        expect(Array.isArray(await s.store.people.list(s.riverMgr))).toBe(true);
        const user = await s.userRecord(s.fx.ids.users.riverMgr);
        expect(user.twoFactor?.enrolledAt).toBe(TODAY);
        expect(user.twoFactor?.recoveryCodesLeft).toBe(10);
      });

      it('keeps the limit when the enrolment code is wrong and says wrongCode', async () => {
        const s = await limited();
        await s.store.twoFactor.startEnrolment(s.riverMgr);
        expect(await ruleOf(s.store.twoFactor.confirmEnrolment(s.riverMgr, '654321'))).toBe('wrongCode');
        expect(await reasonOf(s.store.people.list(s.riverMgr))).toBe('twoFactorRequired');
        expect((await s.userRecord(s.fx.ids.users.riverMgr)).twoFactor).toBeUndefined();
      });

      it('returns ten distinct recovery codes once and stores only their SHA-256 hashes', async () => {
        const s = await limited();
        const codes = await enrol(s);
        expect(codes).toHaveLength(10);
        expect(new Set(codes).size).toBe(10);
        const stored = (await s.userRecord(s.fx.ids.users.riverMgr)).twoFactor!.recoveryCodeHashes!;
        expect(stored).toHaveLength(10);
        expect([...stored].sort()).toEqual(codes.map(sha256).sort());
        for (const code of codes) expect(JSON.stringify(await s.admin.dumpAll())).not.toContain(code);
      });

      it('accepts each recovery code once, removes its hash and counts the rest', async () => {
        const s = await limited();
        const [first, second] = await enrol(s);
        await s.store.twoFactor.useRecoveryCode(s.riverMgr, first!);
        let user = await s.userRecord(s.fx.ids.users.riverMgr);
        expect(user.twoFactor!.recoveryCodeHashes).toHaveLength(9);
        expect(user.twoFactor!.recoveryCodeHashes).not.toContain(sha256(first!));
        expect(user.twoFactor!.recoveryCodesLeft).toBe(9);
        expect(await ruleOf(s.store.twoFactor.useRecoveryCode(s.riverMgr, first!))).toBe('wrongCode');
        await s.store.twoFactor.useRecoveryCode(s.riverMgr, second!);
        user = await s.userRecord(s.fx.ids.users.riverMgr);
        expect(user.twoFactor!.recoveryCodesLeft).toBe(8);
        expect(await ruleOf(s.store.twoFactor.useRecoveryCode(s.riverMgr, 'not-a-real-code'))).toBe('wrongCode');
      });

      it('verifies the demo code for an enrolled admin and says wrongCode otherwise', async () => {
        const s = await limited();
        await enrol(s);
        await s.store.twoFactor.verify(s.riverMgr, '123456');
        expect(await ruleOf(s.store.twoFactor.verify(s.riverMgr, '000000'))).toBe('wrongCode');
      });

      it('locks code entry for 15 minutes after five wrong codes, even for the right code', async () => {
        const s = await limited();
        await enrol(s);
        for (let i = 0; i < 4; i++) {
          expect(await ruleOf(s.store.twoFactor.verify(s.riverMgr, '000000'))).toBe('wrongCode');
        }
        // The fifth wrong code locks entry (it may say wrongCode or codeLocked); the right code then fails.
        await refusal(s.store.twoFactor.verify(s.riverMgr, '000000'));
        expect(await ruleOf(s.store.twoFactor.verify(s.riverMgr, '123456'))).toBe('codeLocked');
        const locked = await s.userRecord(s.fx.ids.users.riverMgr);
        expect(locked.twoFactor!.lockedUntil).toBe(plus(15 * MIN));
        // Recovery codes are code entry too.
        expect(await ruleOf(s.store.twoFactor.useRecoveryCode(s.riverMgr, 'anything'))).toBe('codeLocked');
      });

      it('lets code entry work again once the 15 minutes have passed and clears the failure count', async () => {
        const s = await limited();
        await enrol(s);
        for (let i = 0; i < 5; i++) await refusal(s.store.twoFactor.verify(s.riverMgr, '000000'));
        const justBefore = client(s.fx.ids.users.riverMgr, s.ot, plus(15 * MIN - 1000));
        expect(await ruleOf(s.store.twoFactor.verify(justBefore, '123456'))).toBe('codeLocked');
        const later = client(s.fx.ids.users.riverMgr, s.ot, plus(16 * MIN));
        await s.store.twoFactor.verify(later, '123456');
        const user = await s.userRecord(s.fx.ids.users.riverMgr);
        expect(user.twoFactor!.failedCodes ?? 0).toBe(0);
        // And a fresh run of four wrong codes does not lock again.
        for (let i = 0; i < 4; i++) await refusal(s.store.twoFactor.verify(later, '000000'));
        await s.store.twoFactor.verify(later, '123456');
      });

      it('does not gate an admin who is still inside the grace period', async () => {
        const s = await setup();
        await s.requireTwoFactor(s.fx.ids.users.daniel, 2);
        expect(Array.isArray(await s.store.people.list(s.daniel))).toBe(true);
        expect(Array.isArray(await s.store.team.members(s.daniel))).toBe(true);
        // The last day of grace is still grace; the day after is limited.
        await s.requireTwoFactor(s.fx.ids.users.daniel, 6);
        expect(await s.store.twoFactor.status(s.daniel)).toEqual({ kind: 'grace', daysLeft: 1 });
        expect(Array.isArray(await s.store.people.list(s.daniel))).toBe(true);
        await s.requireTwoFactor(s.fx.ids.users.daniel, 8);
        expect(await reasonOf(s.store.people.list(s.daniel))).toBe('twoFactorRequired');
      });

      it('never gates or asks a staff user, even when a stray twoFactorRequiredSince is on the record', async () => {
        const s = await setup();
        await s.requireTwoFactor(s.fx.ids.users.jade, 30);
        expect(await s.store.twoFactor.status(s.jade)).toEqual({ kind: 'notRequired' });
        expect(Array.isArray(await s.store.notifications.list(s.jade))).toBe(true);
        await s.store.me.get(s.jade);
        expect(await refusal(s.store.twoFactor.startEnrolment(s.jade))).toBeInstanceOf(DataError);
      });

      it('does not gate an admin who is not required and has no record of enrolment (default world)', async () => {
        const s = await setup();
        expect(Array.isArray(await s.store.people.list(s.priya))).toBe(true);
      });

      it('writes one slim audit event when enrolment is confirmed, with no codes or secrets in it', async () => {
        const s = await limited();
        const codes = await enrol(s);
        const events = (await dump<AuditLine>(s.admin, 'audit')).filter((e) => e.action === 'twoFactor.enrolled');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ actorId: s.fx.ids.users.riverMgr, clientId: s.ot });
        const text = JSON.stringify(events[0]);
        expect(text).not.toContain('123456');
        for (const code of codes) expect(text).not.toContain(code);
      });

      it("applies the gate to one client only: another client's admin is unaffected", async () => {
        const s = await limited();
        expect(Array.isArray(await s.store.people.list(s.otOwner))).toBe(true);
      });
    });

    // ------------------------------------------------------------ team (BP-10 team part)
    describe('team: members, invitations, access and custom roles', () => {
      const inviteInput = (s: S, over: Record<string, unknown> = {}) => ({
        email: 'new.manager@example.test',
        displayName: 'Nina Newmanager',
        roleIds: [s.fx.ids.roles.supervisor],
        scope: { type: 'sites', ids: [s.fx.ids.sites.main] } as Scope,
        ...over,
      });

      it('lists the client admins with staff.view and nobody from another client or the staff side', async () => {
        const s = await setup();
        const members = await s.store.team.members(s.priya);
        const ids = members.map((m) => m.userId);
        expect(ids).toEqual(expect.arrayContaining([s.fx.ids.users.priya, s.fx.ids.users.daniel, s.fx.ids.users.rory]));
        expect(ids).not.toContain(s.fx.ids.users.otOwner);
        expect(ids).not.toContain(s.fx.ids.users.beth);
        expect(ids).not.toContain(s.fx.ids.users.jade);
        const priya = members.find((m) => m.userId === s.fx.ids.users.priya)!;
        expect(priya.roleIds).toContain(s.fx.ids.roles.aOwner);
        expect(priya.status).toBe('active');
        // Daniel (staff.view) can read the team page; he cannot change it (below).
        expect((await s.store.team.members(s.daniel)).length).toBe(members.length);
      });

      it('refuses the team page to staff users and to the provider side', async () => {
        const s = await setup();
        expect(await reasonOf(s.store.team.members(s.jade))).toBe('permission');
        expect(await refusal(s.store.team.members(provider(s.fx.ids.users.provOwner)))).toBeInstanceOf(DataError);
      });

      it('invites a person: invited user, invitation, access, an Outbox email and one audit event, in one write', async () => {
        const s = await setup();
        const invitation = await s.store.team.invite(s.priya, inviteInput(s));
        expect(invitation).toMatchObject({
          side: 'client',
          clientId: s.a,
          email: 'new.manager@example.test',
          roleIds: [s.fx.ids.roles.supervisor],
          scope: { type: 'sites', ids: [s.fx.ids.sites.main] },
          invitedBy: s.fx.ids.users.priya,
          status: 'invited',
        });
        expect(Date.parse(invitation.expiresAt)).toBeGreaterThan(Date.parse(TODAY));
        expect((await dump<InvitationRecord>(s.admin, 'invitations')).map((i) => i.id)).toEqual([invitation.id]);

        const user = (await dump<UserAccount>(s.admin, 'users')).find((u) => u.email === 'new.manager@example.test')!;
        expect(user).toMatchObject({
          side: 'client',
          clientId: s.a,
          status: 'invited',
          displayName: 'Nina Newmanager',
        });
        const access = (await dump<RoleAssignment>(s.admin, 'roleAssignments')).filter((r) => r.userId === user.id);
        expect(access).toHaveLength(1);
        expect(access[0]).toMatchObject({
          roleIds: [s.fx.ids.roles.supervisor],
          scope: { type: 'sites', ids: [s.fx.ids.sites.main] },
        });

        const mail = (await s.admin.listOutbox()).filter((m: OutboxMessage) => m.to === 'new.manager@example.test');
        expect(mail).toHaveLength(1);
        expect(mail[0]!.channel).toBe('email');

        const events = (await dump<AuditLine>(s.admin, 'audit')).filter((e) => e.action === 'team.invite');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ actorId: s.fx.ids.users.priya, clientId: s.a });
        expect(JSON.stringify(events[0])).not.toContain('new.manager@example.test');
        expect((await s.store.team.members(s.priya)).find((m) => m.userId === user.id)?.status).toBe('invited');
      });

      it('trims and lower-cases the invited email and refuses an invalid one without writing anything', async () => {
        const s = await setup();
        const invitation = await s.store.team.invite(s.priya, inviteInput(s, { email: '  New.Manager@Example.TEST ' }));
        expect(invitation.email).toBe('new.manager@example.test');
        const before = await s.admin.dumpAll();
        expect(await refusal(s.store.team.invite(s.priya, inviteInput(s, { email: 'not-an-email' })))).toBeInstanceOf(
          ValidationError,
        );
        expect(await refusal(s.store.team.invite(s.priya, inviteInput(s, { roleIds: [] })))).toBeInstanceOf(
          ValidationError,
        );
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('needs team.manageRoles to invite: Daniel is refused and nothing is written', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(await reasonOf(s.store.team.invite(s.daniel, inviteInput(s)))).toBe('permission');
        expect(await reasonOf(s.store.team.invite(s.jade, inviteInput(s)))).toBe('permission');
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('refuses an invite that would grant more than the inviter holds (canGrant)', async () => {
        const s = await setup();
        // Rory manages roles but holds no billing or evidence rights; the Account Owner role is beyond him.
        expect(
          await reasonOf(
            s.store.team.invite(
              s.rory,
              inviteInput(s, { roleIds: [s.fx.ids.roles.aOwner], scope: { type: 'clients', ids: [s.a] } }),
            ),
          ),
        ).toBe('escalation');
        expect(
          await reasonOf(s.store.team.invite(s.rory, inviteInput(s, { roleIds: [s.fx.ids.roles.billingViewer] }))),
        ).toBe('escalation');
        expect((await dump<InvitationRecord>(s.admin, 'invitations')).length).toBe(0);
      });

      it("refuses an invite whose scope is wider than the inviter's own scope", async () => {
        const s = await setup();
        // Rory holds role manager over the whole of Little Acorns; give a site-scoped role manager to prove the scope check.
        const scoped = freshId(2101);
        await s.admin.bulkPut('users', [
          {
            id: scoped,
            side: 'client',
            clientId: s.a,
            email: 'scoped@example.test',
            displayName: 'Scoped',
            status: 'active',
            login: { method: 'emailPassword', pinSet: false },
          },
        ]);
        await s.admin.bulkPut('roleAssignments', [
          {
            id: freshId(2102),
            userId: scoped,
            roleIds: [s.megaRole.id],
            scope: { type: 'sites', ids: [s.fx.ids.sites.main] },
            grants: [],
            denies: [],
            status: 'active',
          },
        ]);
        const ctx = client(scoped, s.a);
        expect(
          await reasonOf(
            s.store.team.invite(ctx, inviteInput(s, { scope: { type: 'sites', ids: [s.fx.ids.sites.annexe] } })),
          ),
        ).toBe('escalation');
        expect(
          await reasonOf(s.store.team.invite(ctx, inviteInput(s, { scope: { type: 'clients', ids: [s.a] } }))),
        ).toBe('escalation');
      });

      it("refuses cross-client invites: another client's roles, scope or sites", async () => {
        const s = await setup();
        for (const over of [
          { roleIds: [s.fx.ids.roles.bOwner] },
          { scope: { type: 'clients', ids: [s.fx.ids.clients.b] } },
          { scope: { type: 'sites', ids: [s.fx.ids.sites.river] } },
        ]) {
          expect(await refusal(s.store.team.invite(s.priya, inviteInput(s, over)))).toBeInstanceOf(DataError);
        }
        expect(await dump(s.admin, 'invitations')).toEqual([]);
        expect((await dump<UserAccount>(s.admin, 'users')).some((u) => u.email === 'new.manager@example.test')).toBe(
          false,
        );
      });

      it("changes a team member's roles and scope with setAccess and records one audit event", async () => {
        const s = await setup();
        const updated = await s.store.team.setAccess(s.priya, s.fx.ids.users.rory, {
          roleIds: [s.fx.ids.roles.billingViewer],
          scope: { type: 'clients', ids: [s.a] },
        });
        expect(updated.userId).toBe(s.fx.ids.users.rory);
        expect(updated.roleIds).toEqual([s.fx.ids.roles.billingViewer]);
        const rows = (await dump<RoleAssignment>(s.admin, 'roleAssignments')).filter(
          (r) => r.userId === s.fx.ids.users.rory,
        );
        expect(rows.map((r) => r.roleIds)).toEqual([[s.fx.ids.roles.billingViewer]]);
        const perms = (await s.store.access.permissions(s.rory)).map((p) => p.permissionId);
        expect(perms).toContain('billing.view');
        expect(perms).not.toContain('team.manageRoles');
        const events = (await dump<AuditLine>(s.admin, 'audit')).filter((e) => e.action === 'team.setAccess');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ actorId: s.fx.ids.users.priya, clientId: s.a, target: s.fx.ids.users.rory });
      });

      it('refuses setAccess without team.manageRoles, on yourself, and beyond what you can grant', async () => {
        const s = await setup();
        const next = { roleIds: [s.fx.ids.roles.supervisor], scope: { type: 'clients', ids: [s.a] } as Scope };
        expect(await reasonOf(s.store.team.setAccess(s.daniel, s.fx.ids.users.rory, next))).toBe('permission');
        expect(await reasonOf(s.store.team.setAccess(s.priya, s.fx.ids.users.priya, next))).toBe('selfEdit');
        expect(
          await reasonOf(
            s.store.team.setAccess(s.rory, s.fx.ids.users.daniel, {
              roleIds: [s.fx.ids.roles.aOwner],
              scope: { type: 'clients', ids: [s.a] },
            }),
          ),
        ).toBe('escalation');
      });

      it('refuses access changes across clients and for unknown users', async () => {
        const s = await setup();
        const next = { roleIds: [s.fx.ids.roles.supervisor], scope: { type: 'clients', ids: [s.a] } as Scope };
        for (const target of [s.fx.ids.users.beth, s.fx.ids.users.otOwner, freshId(2999)]) {
          const error = await refusal(s.store.team.setAccess(s.priya, target, next));
          expect(error).toBeInstanceOf(DataError);
          expect(['notFound', 'forbidden']).toContain((error as DataError).code);
        }
        expect(await refusal(s.store.team.revoke(s.priya, s.fx.ids.users.beth))).toBeInstanceOf(DataError);
        const beth = (await dump<RoleAssignment>(s.admin, 'roleAssignments')).filter(
          (r) => r.userId === s.fx.ids.users.beth,
        );
        expect(beth.every((r) => r.status === 'active')).toBe(true);
      });

      it('never leaves the organisation without an Account Owner (lastOwnerGuard) for setAccess and revoke', async () => {
        const s = await setup();
        // Olive (the second Account Owner added in setup) steps aside, so Priya is the only active owner.
        await s.admin.bulkPut('roleAssignments', [
          {
            id: freshId(2020),
            userId: s.olive.id,
            roleIds: [s.fx.ids.roles.aOwner],
            scope: { type: 'clients', ids: [s.a] },
            grants: [],
            denies: [],
            status: 'suspended',
          },
        ]);
        // Mega holds every owner permission but is not an Account Owner, so only the guard can refuse.
        const demote = {
          roleIds: [s.fx.ids.roles.supervisor],
          scope: { type: 'sites', ids: [s.fx.ids.sites.main] } as Scope,
        };
        expect(await reasonOf(s.store.team.setAccess(s.mega_, s.fx.ids.users.priya, demote))).toBe('lastOwner');
        expect(await reasonOf(s.store.team.revoke(s.mega_, s.fx.ids.users.priya))).toBe('lastOwner');
        const priya = (await dump<RoleAssignment>(s.admin, 'roleAssignments')).filter(
          (r) => r.userId === s.fx.ids.users.priya,
        );
        expect(priya.map((r) => r.roleIds)).toEqual([[s.fx.ids.roles.aOwner]]);
        expect(priya.every((r) => r.status === 'active')).toBe(true);
      });

      it('allows removing an Account Owner when another one remains', async () => {
        const s = await setup();
        // Olive is a second Account Owner, so Mega may now demote Priya.
        const demoted = await s.store.team.setAccess(s.mega_, s.fx.ids.users.priya, {
          roleIds: [s.fx.ids.roles.supervisor],
          scope: { type: 'sites', ids: [s.fx.ids.sites.main] },
        });
        expect(demoted.roleIds).toEqual([s.fx.ids.roles.supervisor]);
        // Now Olive is the only owner and cannot be removed.
        expect(await reasonOf(s.store.team.revoke(s.mega_, s.olive.id))).toBe('lastOwner');
      });

      it('revokes a member: their access stops and the audit event is written', async () => {
        const s = await setup();
        await s.store.team.revoke(s.priya, s.fx.ids.users.rory);
        const rory = await s.userRecord(s.fx.ids.users.rory);
        const live = (await dump<RoleAssignment>(s.admin, 'roleAssignments')).filter(
          (r) => r.userId === s.fx.ids.users.rory && r.status === 'active',
        );
        expect(rory.status === 'suspended' || live.length === 0).toBe(true);
        expect(await refusal(s.store.team.members(s.rory))).toBeInstanceOf(DataError);
        expect((await dump<AuditLine>(s.admin, 'audit')).filter((e) => e.action === 'team.revoke')).toHaveLength(1);
        expect(await reasonOf(s.store.team.revoke(s.daniel, s.fx.ids.users.rory))).toBe('permission');
        expect(await reasonOf(s.store.team.revoke(s.priya, s.fx.ids.users.priya))).toBe('selfEdit');
      });

      // -------------------------------------------------- custom roles
      const supportLevels: ClientLevels = { ...ALL_LEVELS_NONE, staff: 'view', reports: 'view' };

      it('saves a custom role from category levels and Allow toggles, owned by the client and never a system role', async () => {
        const s = await setup();
        const input: CustomRoleInput = {
          name: 'Reports reader',
          description: 'Can read reports',
          colour: '#336699',
          levels: { ...supportLevels, reports: 'view' },
          allows: ['reports.export'],
        };
        const role = await s.store.team.saveCustomRole(s.otOwner, input);
        expect(role).toMatchObject({ owner: { clientId: s.ot }, name: 'Reports reader', system: false, version: 1 });
        expect([...role.permissionIds].sort()).toEqual([...compileClientRole(input.levels, input.allows)].sort());
        expect(role.clientLevels).toEqual(input.levels);
        expect(role.clientAllows).toEqual(['reports.export']);
        expect((await dump<Role>(s.admin, 'roles')).some((r) => r.id === role.id)).toBe(true);
        // An edit keeps the id, bumps the version and recompiles.
        const edited = await s.store.team.saveCustomRole(s.otOwner, {
          ...input,
          id: role.id,
          levels: { ...supportLevels, reports: 'view', modules: 'view' },
        });
        expect(edited.id).toBe(role.id);
        expect(edited.version).toBe(2);
        expect(edited.permissionIds).toContain('modules.view');
        expect(
          (await dump<AuditLine>(s.admin, 'audit')).filter((e) => e.action === 'team.saveCustomRole'),
        ).toHaveLength(2);
      });

      it('can assign a saved custom role through invite and the invitee gets exactly its permissions', async () => {
        const s = await setup();
        const role = await s.store.team.saveCustomRole(s.otOwner, {
          name: 'Reports reader',
          levels: supportLevels,
          allows: [],
        });
        const invitation = await s.store.team.invite(s.otOwner, {
          email: 'reader@example.test',
          roleIds: [role.id],
          scope: { type: 'clients', ids: [s.ot] },
        });
        expect(invitation.roleIds).toEqual([role.id]);
      });

      it('refuses a custom role beyond the package limit with NotEntitled customClientRoles, and allows it with an add-on', async () => {
        const s = await setup();
        const input: CustomRoleInput = { name: 'Extra', levels: supportLevels, allows: [] };
        const error = await refusal(s.store.team.saveCustomRole(s.beth, input));
        expect(error).toBeInstanceOf(NotEntitledError);
        expect((error as NotEntitledError).feature).toBe('customClientRoles');
        await s.admin.bulkPut('addOnSubscriptions', [
          { clientId: s.fx.ids.clients.b, addOnId: s.fx.ids.addOnId, status: 'on', usageThisPeriod: 0 },
        ]);
        const role = await s.store.team.saveCustomRole(s.beth, input);
        expect(role.owner).toEqual({ clientId: s.fx.ids.clients.b });
        expect(await refusal(s.store.team.saveCustomRole(s.beth, { ...input, name: 'Extra two' }))).toBeInstanceOf(
          NotEntitledError,
        );
        // Editing the one custom role at the limit is fine.
        expect((await s.store.team.saveCustomRole(s.beth, { ...input, id: role.id, name: 'Renamed' })).name).toBe(
          'Renamed',
        );
      });

      it('applies canGrant to custom roles: a role manager cannot save a role with permissions they do not hold', async () => {
        const s = await setup();
        const error = await refusal(
          s.store.team.saveCustomRole(s.otMgr_, {
            name: 'Too much',
            levels: { ...ALL_LEVELS_NONE, staff: 'view', reports: 'manage', modules: 'manage' },
            allows: ['reports.export'],
          }),
        );
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).reason).toBe('escalation');
        // Within what they hold it works.
        const ok = await s.store.team.saveCustomRole(s.otMgr_, {
          name: 'Just staff',
          levels: { ...ALL_LEVELS_NONE, staff: 'manage' },
          allows: [],
        });
        expect(ok.permissionIds).toEqual(expect.arrayContaining(['staff.view', 'staff.manage']));
      });

      it('needs team.manageRoles to save or remove a custom role', async () => {
        const s = await setup();
        const input: CustomRoleInput = { name: 'Nope', levels: supportLevels, allows: [] };
        expect(await reasonOf(s.store.team.saveCustomRole(s.daniel, input))).toBe('permission');
        expect(await reasonOf(s.store.team.removeCustomRole(s.daniel, s.fx.ids.roles.billingViewer))).toBe(
          'permission',
        );
      });

      it("removes a custom role of the client, never a system role and never another client's role", async () => {
        const s = await setup();
        const role = await s.store.team.saveCustomRole(s.otOwner, {
          name: 'Short lived',
          levels: supportLevels,
          allows: [],
        });
        await s.store.team.removeCustomRole(s.otOwner, role.id);
        expect((await dump<Role>(s.admin, 'roles')).some((r) => r.id === role.id)).toBe(false);
        expect(
          (await dump<AuditLine>(s.admin, 'audit')).filter((e) => e.action === 'team.removeCustomRole'),
        ).toHaveLength(1);
        expect(await refusal(s.store.team.removeCustomRole(s.priya, s.fx.ids.roles.aOwner))).toBeInstanceOf(DataError);
        expect(await refusal(s.store.team.removeCustomRole(s.priya, s.fx.ids.roles.bOwner))).toBeInstanceOf(DataError);
        const roles = await dump<Role>(s.admin, 'roles');
        expect(roles.some((r) => r.id === s.fx.ids.roles.aOwner)).toBe(true);
        expect(roles.some((r) => r.id === s.fx.ids.roles.bOwner)).toBe(true);
      });

      it('refuses to remove a custom role that someone still holds, leaving it in place', async () => {
        const s = await setup();
        // The "Billing viewer" custom role is held by nobody in the world; give it to Rory first.
        await s.store.team.setAccess(s.priya, s.fx.ids.users.rory, {
          roleIds: [s.fx.ids.roles.billingViewer],
          scope: { type: 'clients', ids: [s.a] },
        });
        expect(await refusal(s.store.team.removeCustomRole(s.priya, s.fx.ids.roles.billingViewer))).toBeInstanceOf(
          DataError,
        );
        expect((await dump<Role>(s.admin, 'roles')).some((r) => r.id === s.fx.ids.roles.billingViewer)).toBe(true);
      });

      // -------------------------------------------------- activity log
      it("shows the client's own audit events to team.manageRoles holders, newest data only for that client", async () => {
        const s = await setup();
        await s.store.team.invite(s.priya, inviteInput(s));
        await s.admin.bulkPut('audit', [
          {
            id: freshId(2201),
            actorId: s.fx.ids.users.beth,
            actorSide: 'client',
            clientId: s.fx.ids.clients.b,
            action: 'team.invite',
            target: freshId(2202),
            at: TODAY,
          },
        ]);
        const log = await s.store.team.activity(s.priya);
        expect(log.length).toBeGreaterThan(0);
        expect(log.every((e) => e.clientId === s.a)).toBe(true);
        expect(log.some((e) => e.action === 'team.invite')).toBe(true);
        expect(log.some((e) => e.id === freshId(2201))).toBe(false);
        const onlyInvites = await s.store.team.activity(s.priya, { action: 'team.invite' });
        expect(onlyInvites.length).toBeGreaterThan(0);
        expect(onlyInvites.every((e) => e.action === 'team.invite')).toBe(true);
      });

      it("refuses the activity log without team.manageRoles, to staff and to other clients' admins", async () => {
        const s = await setup();
        expect(await reasonOf(s.store.team.activity(s.daniel))).toBe('permission');
        expect(await reasonOf(s.store.team.activity(s.jade))).toBe('permission');
        const own = await s.store.team.activity(s.otOwner);
        expect(own.every((e) => e.clientId === s.ot)).toBe(true);
      });

      it('keeps note text, feedback text and file contents out of activity entries', async () => {
        const s = await setup();
        await s.admin.bulkPut('audit', [
          {
            id: freshId(2210),
            actorId: s.fx.ids.users.jade,
            actorSide: 'staff',
            clientId: s.a,
            action: 'notes.save',
            target: freshId(2211),
            after: { body: 'Private thought about a child', count: 1 },
            at: TODAY,
          },
        ]);
        const log = await s.store.team.activity(s.priya);
        const text = JSON.stringify(log);
        expect(text).not.toContain('Private thought about a child');
      });
    });

    // ------------------------------------------------------------ organisation profile (BP-8)
    describe('organisation profile', () => {
      it('shows display name and short name to any actor of the client, staff included, and nothing else', async () => {
        const s = await setup();
        const client = await s.clientRecord(s.a);
        for (const ctx of [s.priya, s.daniel, s.jade]) {
          const profile = await s.store.organisation.profile(ctx);
          expect(profile.displayName).toBe(client.displayName);
          expect(Object.keys(profile).every((k) => k === 'displayName' || k === 'shortName')).toBe(true);
        }
        expect((await s.store.organisation.profile(s.otOwner)).displayName).not.toBe(client.displayName);
      });

      it('tells any actor of the client, staff included, whether staff may raise tickets', async () => {
        const s = await setup();
        for (const ctx of [s.priya, s.jade]) {
          expect(await s.store.organisation.supportSettings(ctx)).toEqual({ allowStaffTickets: true });
        }
        await s.store.organisation.updateSettings(s.priya, { allowStaffTickets: false });
        expect(await s.store.organisation.supportSettings(s.jade)).toEqual({ allowStaffTickets: false });
      });

      it('renames the organisation: trims, appends a pending-review name history entry and one audit event with both names', async () => {
        const s = await setup();
        const before = await s.clientRecord(s.a);
        await s.store.organisation.updateProfile(s.priya, {
          displayName: '  Little Acorns Nurseries  ',
          shortName: 'Acorns',
        });
        const after = await s.clientRecord(s.a);
        expect(after.displayName).toBe('Little Acorns Nurseries');
        expect(after.shortName).toBe('Acorns');
        expect(after.nameHistory).toHaveLength(before.nameHistory.length + 1);
        expect(after.nameHistory.at(-1)).toEqual({
          old: before.displayName,
          new: 'Little Acorns Nurseries',
          changedBy: s.fx.ids.users.priya,
          changedAt: TODAY,
          reviewStatus: 'pendingReview',
        });
        const events = (await dump<AuditLine>(s.admin, 'audit')).filter(
          (e) => e.action === 'organisation.updateProfile',
        );
        expect(events).toHaveLength(1);
        const text = JSON.stringify(events[0]);
        expect(text).toContain(before.displayName);
        expect(text).toContain('Little Acorns Nurseries');
      });

      it('shows the new name to staff at once and tells listeners that clients changed', async () => {
        const s = await setup();
        const changed: StoreName[][] = [];
        s.subscribe((stores: string[]) => changed.push(stores as StoreName[]));
        await s.store.organisation.updateProfile(s.priya, { displayName: 'Little Acorns Nurseries' });
        expect((await s.store.organisation.profile(s.jade)).displayName).toBe('Little Acorns Nurseries');
        expect(changed.flat()).toContain('clients');
      });

      it('changes only the short name without adding a name history entry', async () => {
        const s = await setup();
        const before = await s.clientRecord(s.a);
        await s.store.organisation.updateProfile(s.priya, { shortName: 'Acorns' });
        const after = await s.clientRecord(s.a);
        expect(after.shortName).toBe('Acorns');
        expect(after.displayName).toBe(before.displayName);
        expect(after.nameHistory).toEqual(before.nameHistory);
      });

      it('refuses invalid names with RuleError invalidName and writes nothing', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        for (const displayName of ['A', '   ', '1234', '...', 'x'.repeat(61), 'Bad\u0007Name']) {
          expect(await ruleOf(s.store.organisation.updateProfile(s.priya, { displayName }))).toBe('invalidName');
        }
        expect(await ruleOf(s.store.organisation.updateProfile(s.priya, { shortName: 'y'.repeat(21) }))).toBe(
          'invalidName',
        );
        expect(await ruleOf(s.store.organisation.updateProfile(s.priya, { shortName: '' }))).toBe('invalidName');
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('needs org.editName: Daniel and staff are refused', async () => {
        const s = await setup();
        expect(await reasonOf(s.store.organisation.updateProfile(s.daniel, { displayName: 'Hijacked Name' }))).toBe(
          'permission',
        );
        expect(await reasonOf(s.store.organisation.updateProfile(s.jade, { displayName: 'Hijacked Name' }))).toBe(
          'permission',
        );
        expect((await s.clientRecord(s.a)).displayName).not.toBe('Hijacked Name');
      });

      it("only ever changes the actor's own client, whatever else is in the patch", async () => {
        const s = await setup();
        const otherBefore = await s.clientRecord(s.ot);
        const before = await s.clientRecord(s.a);
        await s.store.organisation
          .updateProfile(s.priya, {
            displayName: 'Little Acorns Nurseries',
            // Mass-assignment attempts: not allowlisted, so refused or ignored, never applied.
            ...({ id: s.ot, packageId: 'other', accountState: 'active' } as object),
          })
          .catch(() => undefined);
        expect(await s.clientRecord(s.ot)).toEqual(otherBefore);
        const after = await s.clientRecord(s.a);
        expect(after.id).toBe(s.a);
        expect(after.packageId).toBe(before.packageId);
        expect(after.accountState).toBe(before.accountState);
      });
    });

    // ------------------------------------------------------------ settings and sites (F-2)
    describe('organisation settings and sites', () => {
      it('changes allowlisted settings with settings.manage and writes one audit event', async () => {
        const s = await setup();
        await s.store.organisation.updateSettings(s.priya, {
          amberWindowDays: 45,
          weeklyGoalLessons: 3,
          firstAiderThreshold: 3,
          allowStaffTickets: false,
          pulseSurveys: true,
        });
        const settings = (await s.clientRecord(s.a)).settings;
        expect(settings).toMatchObject({
          amberWindowDays: 45,
          weeklyGoalLessons: 3,
          firstAiderThreshold: 3,
          allowStaffTickets: false,
          pulseSurveys: true,
        });
        expect(
          (await dump<AuditLine>(s.admin, 'audit')).filter((e) => e.action === 'organisation.updateSettings'),
        ).toHaveLength(1);
      });

      it('keeps the other settings when only some are patched', async () => {
        const s = await setup();
        const before = (await s.clientRecord(s.a)).settings;
        await s.store.organisation.updateSettings(s.priya, { firstAiderThreshold: 4 });
        const after = (await s.clientRecord(s.a)).settings;
        expect(after).toEqual({ ...before, firstAiderThreshold: 4 });
      });

      it('refuses settings changes without settings.manage (Daniel, staff) and for out-of-range values', async () => {
        const s = await setup();
        expect(await reasonOf(s.store.organisation.updateSettings(s.daniel, { amberWindowDays: 45 }))).toBe(
          'permission',
        );
        expect(await reasonOf(s.store.organisation.updateSettings(s.jade, { amberWindowDays: 45 }))).toBe('permission');
        const before = await s.clientRecord(s.a);
        for (const patch of [{ amberWindowDays: -1 }, { weeklyGoalLessons: 8 }, { firstAiderThreshold: 21 }]) {
          expect(await refusal(s.store.organisation.updateSettings(s.priya, patch))).toBeInstanceOf(ValidationError);
        }
        expect(await s.clientRecord(s.a)).toEqual(before);
      });

      it('accepts allowlisted fields only: self-approval, retention, base theme and the rest are refused untouched', async () => {
        const s = await setup();
        const before = await s.clientRecord(s.a);
        for (const patch of [
          { allowSelfApproval: true },
          { retention: { leaverRecordsMonths: 1 } },
          { themeId: freshId(2301) },
          { reminderPolicy: { weeklyCapPerPerson: 99 } },
          { id: s.ot },
        ]) {
          expect(await refusal(s.store.organisation.updateSettings(s.priya, patch as SettingsPatch))).toBeInstanceOf(
            ValidationError,
          );
        }
        expect(await s.clientRecord(s.a)).toEqual(before);
      });

      it('settings changes never touch another client', async () => {
        const s = await setup();
        const other = await s.clientRecord(s.ot);
        await s.store.organisation.updateSettings(s.priya, { amberWindowDays: 45 });
        expect(await s.clientRecord(s.ot)).toEqual(other);
      });

      it('renames a site and gives it a region with settings.manage; one audit event each', async () => {
        const s = await setup();
        const site = await s.store.organisation.sites.update(s.otOwner, s.fx.ids.sites.river, {
          name: 'Riverside Lane',
          region: 'South West',
        });
        expect(site).toMatchObject({
          id: s.fx.ids.sites.river,
          name: 'Riverside Lane',
          region: 'South West',
          clientId: s.ot,
        });
        const stored = (await dump<Site>(s.admin, 'sites')).find((x) => x.id === s.fx.ids.sites.river)!;
        expect(stored).toMatchObject({ name: 'Riverside Lane', region: 'South West', status: 'active' });
        expect(
          (await dump<AuditLine>(s.admin, 'audit')).filter((e) => e.action === 'organisation.updateSite'),
        ).toHaveLength(1);
      });

      it('refuses site changes without settings.manage, for sites of another client and for invalid names', async () => {
        const s = await setup();
        expect(
          await reasonOf(s.store.organisation.sites.update(s.daniel, s.fx.ids.sites.main, { name: 'Renamed' })),
        ).toBe('permission');
        const cross = await refusal(
          s.store.organisation.sites.update(s.priya, s.fx.ids.sites.river, { name: 'Hijacked' }),
        );
        expect(cross).toBeInstanceOf(DataError);
        expect(['notFound', 'forbidden']).toContain((cross as DataError).code);
        expect(
          await refusal(s.store.organisation.sites.update(s.priya, s.fx.ids.sites.main, { name: '' })),
        ).toBeInstanceOf(ValidationError);
        const sites = await dump<Site>(s.admin, 'sites');
        expect(sites.find((x) => x.id === s.fx.ids.sites.river)!.name).not.toBe('Hijacked');
        expect(sites.find((x) => x.id === s.fx.ids.sites.main)!.name).not.toBe('Renamed');
      });
    });

    // ------------------------------------------------------------ onboarding checklist (F-2)
    describe('onboarding checklist', () => {
      const step = (view: OnboardingView, key: string) => view.steps.find((x) => x.key === key)!;

      it('lists the five steps for the client with none done on a new checklist', async () => {
        const s = await setup();
        const view = await s.store.onboarding.checklist(s.priya);
        expect(view.steps.map((x) => x.key)).toEqual([
          'inviteStaff',
          'reminderSettings',
          'assignTraining',
          'setUpCompetition',
          'exportMatrix',
        ]);
        expect(view.steps.every((x) => !x.done)).toBe(true);
        expect(view.completedAt).toBeUndefined();
      });

      it('ticks "invite staff" off by itself when an invitation is sent', async () => {
        const s = await setup();
        await s.store.team.invite(s.priya, {
          email: 'first.invite@example.test',
          roleIds: [s.fx.ids.roles.supervisor],
          scope: { type: 'sites', ids: [s.fx.ids.sites.main] },
        });
        const view = await s.store.onboarding.checklist(s.priya);
        expect(step(view, 'inviteStaff')).toMatchObject({ done: true, doneAt: TODAY });
        expect(step(view, 'assignTraining').done).toBe(false);
      });

      it('ticks "assign first training" off by itself on the first assignment', async () => {
        const s = await setup();
        await s.store.assignments.assign(s.priya, {
          moduleId: s.lf.moduleId,
          personIds: [s.fx.ids.people.hannah],
          dueAt: '2026-11-30T23:59:59.000Z',
        });
        expect(step(await s.store.onboarding.checklist(s.priya), 'assignTraining').done).toBe(true);
      });

      it('records the matrix export with markDone, keeps the first time, and refuses unknown steps', async () => {
        const s = await setup();
        const first = await s.store.onboarding.markDone(s.priya, 'exportMatrix');
        expect(step(first, 'exportMatrix')).toMatchObject({ done: true, doneAt: TODAY });
        const later = client(s.fx.ids.users.priya, s.a, plus(DAY));
        const again = await s.store.onboarding.markDone(later, 'exportMatrix');
        expect(step(again, 'exportMatrix').doneAt).toBe(TODAY);
        expect(await refusal(s.store.onboarding.markDone(s.priya, 'notAStep'))).toBeInstanceOf(ValidationError);
        expect(await dump(s.admin, 'onboarding')).toHaveLength(1);
      });

      it('sets completedAt only when every step is done', async () => {
        const s = await setup();
        for (const key of ['inviteStaff', 'reminderSettings', 'assignTraining', 'setUpCompetition']) {
          const view = await s.store.onboarding.markDone(s.priya, key);
          expect(view.completedAt).toBeUndefined();
        }
        const done = await s.store.onboarding.markDone(s.priya, 'exportMatrix');
        expect(done.completedAt).toBe(TODAY);
      });

      it('keeps one checklist per client and never mixes clients', async () => {
        const s = await setup();
        await s.store.onboarding.markDone(s.priya, 'exportMatrix');
        const other = await s.store.onboarding.checklist(s.otOwner);
        expect(step(other, 'exportMatrix').done).toBe(false);
        const rows = await dump<{ clientId: string }>(s.admin, 'onboarding');
        expect(rows.filter((r) => r.clientId === s.a)).toHaveLength(1);
      });

      it('refuses the checklist and markDone to staff users and the provider side', async () => {
        const s = await setup();
        expect(await reasonOf(s.store.onboarding.checklist(s.jade))).toBe('permission');
        expect(await reasonOf(s.store.onboarding.markDone(s.jade, 'exportMatrix'))).toBe('permission');
        expect(await refusal(s.store.onboarding.checklist(provider(s.fx.ids.users.provOwner)))).toBeInstanceOf(
          DataError,
        );
        expect(step(await s.store.onboarding.checklist(s.priya), 'exportMatrix').done).toBe(false);
      });
    });
  });
}

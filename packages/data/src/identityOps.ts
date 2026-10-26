// Operations for identity and organisation (M3 chunk 6, "Data A"): two-step sign-in, the team page, custom roles, the
// activity log, the organisation profile, settings, sites and the onboarding checklist. Each write authorises, applies
// the domain rules and then writes in ONE batch. Business rules live in @sta/domain; the 2FA gate itself is in
// policy.ts `beginCall`, so every other operation is covered by one check.
import {
  OWNER_KEYS,
  addDays,
  canEditRolesOf,
  canGrant,
  clientAllowIds,
  codeLockMinutes,
  compileClientRole,
  demoTwoFactorCode,
  invitationSchema,
  lastOwnerGuard,
  maxWrongCodes,
  otpauthUri,
  recoveryCodeCount,
  scopeSchema,
  twoFactorStatus,
  validateOrgName,
  type Client,
  type ClientLevels,
  type Invitation,
  type OnboardingChecklist,
  type OutboxMessage,
  type Role,
  type RoleAssignment,
  type Scope,
  type Site,
  type UserAccount,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, canAny, checkAccountState, checkCustomRoleLimit, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActivityLine,
  type ActorContext,
  type OnboardingService,
  type OnboardingView,
  type OrganisationService,
  type SettingsPatch,
  type StoreOptions,
  type TeamMember,
  type TeamService,
  type TwoFactorService,
} from './types';

export type IdentityOperations = {
  twoFactor: TwoFactorService;
  team: TeamService;
  organisation: OrganisationService;
  onboarding: OnboardingService;
};

/** The five first-week steps, in display order (brief 26.1). */
export const onboardingSteps = [
  'inviteStaff',
  'reminderSettings',
  'assignTraining',
  'setUpCompetition',
  'exportMatrix',
] as const;

const INVITE_DAYS = 14;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const SECRET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_CHARS = SECRET_ALPHABET.split('');
const RECOVERY_CHARS = RECOVERY_ALPHABET.split('');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const levelNames = ['none', 'view', 'manage'];
const categories: (keyof ClientLevels)[] = [
  'staff',
  'evidence',
  'assigning',
  'modules',
  'reports',
  'competitions',
  'themes',
  'reminders',
  'settingsBilling',
  'feedbackHelp',
];
/** Activity entries show their before and after only for these actions, which carry ids and counts, never text. */
const SLIM_ACTIONS = ['team.', 'organisation.', 'onboarding.', 'twoFactor.', 'assignments.'];

const put = (store: WriteOp['store'], key: string, record: unknown): WriteOp => ({ type: 'put', store, key, record });
const remove = (store: WriteOp['store'], key: string): WriteOp => ({ type: 'delete', store, key });

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function rejectUnknown(input: object, allowed: readonly string[]): void {
  const extra = Object.keys(input).filter((k) => !allowed.includes(k));
  if (extra.length > 0) throw new ValidationError(extra.map((k) => `${k}: not a field you can change here`));
}

/** Callers outside the type system may send anything; a non-string is treated as empty. */
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A put that records `step` as done today, or nothing when it already is. Used by the operations that tick it. */
export function tickOnboarding(call: Call, clientId: string, existing: OnboardingChecklist[], step: string): WriteOp[] {
  const row = existing.find((r) => r.clientId === clientId);
  const now = call.actor.ctx.now;
  const base: OnboardingChecklist = row ?? { clientId, startedAt: now, steps: [] };
  if (base.steps.find((s) => s.key === step)?.doneAt !== undefined) return [];
  const steps = onboardingSteps.map((key) => {
    const have = base.steps.find((s) => s.key === key);
    return key === step ? { key, doneAt: now } : have ? have : { key };
  });
  const complete = steps.every((s) => 'doneAt' in s && s.doneAt !== undefined);
  const next: OnboardingChecklist = {
    ...base,
    steps,
    ...(complete && base.completedAt === undefined ? { completedAt: now } : {}),
  };
  return [put('onboarding', clientId, next)];
}

const viewOf = (row: OnboardingChecklist | undefined): OnboardingView => ({
  steps: onboardingSteps.map((key) => {
    const doneAt = row?.steps.find((s) => s.key === key)?.doneAt;
    return doneAt === undefined ? { key, done: false } : { key, done: true, doneAt };
  }),
  ...(row ? { startedAt: row.startedAt } : {}),
  ...(row?.completedAt ? { completedAt: row.completedAt } : {}),
});

export function createIdentityOperations(backend: RawBackend, options: StoreOptions): IdentityOperations {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);

  /** A client-side actor holding `permission`. Anyone else is refused. */
  async function clientCall(ctx: ActorContext, permission: string | null): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'client') return forbid('permission');
    if (permission !== null && !holds(call, [permission])) return forbid('permission');
    return call;
  }

  // ------------------------------------------------------------ two-factor

  /** Code entry for an enrolled client admin: checks the lock first, counts wrong codes, locks after five. */
  async function codeEntry(ctx: ActorContext, matches: (user: UserAccount) => Promise<UserAccount | undefined>) {
    const call = await beginCall(backend, options, ctx, { allowLimited: true });
    if (call.side !== 'client') return forbid('permission');
    const user = call.actor.user;
    const tf = user.twoFactor;
    if (!tf) throw new RuleError('wrongCode');
    const now = call.actor.now.getTime();
    if (tf.lockedUntil !== undefined && Date.parse(tf.lockedUntil) > now) throw new RuleError('codeLocked');
    const next = await matches(user);
    if (next?.twoFactor) {
      const cleaned = { ...next.twoFactor };
      delete cleaned.lockedUntil;
      delete cleaned.failedCodes;
      if (tf.lockedUntil !== undefined || tf.failedCodes !== undefined || next !== user) {
        await apply([put('users', user.id, { ...next, twoFactor: cleaned })]);
      }
      return;
    }
    // An expired lock starts a fresh count.
    const count = (tf.lockedUntil !== undefined ? 0 : (tf.failedCodes ?? 0)) + 1;
    const locking = count >= maxWrongCodes;
    const counted = { ...tf, failedCodes: count };
    delete counted.lockedUntil;
    if (locking) counted.lockedUntil = new Date(now + codeLockMinutes * 60_000).toISOString();
    await apply([put('users', user.id, { ...user, twoFactor: counted })]);
    throw new RuleError(locking ? 'codeLocked' : 'wrongCode');
  }

  const twoFactor: TwoFactorService = {
    async status(ctx) {
      const call = await beginCall(backend, options, ctx, { allowLimited: true });
      return twoFactorStatus(call.actor.user, call.actor.now);
    },

    async startEnrolment(ctx) {
      const call = await beginCall(backend, options, ctx, { allowLimited: true });
      if (call.side !== 'client') return forbid('permission');
      const rng = options.rng.fork(`twoFactor:${call.actor.user.id}`);
      const secret = Array.from({ length: 16 }, () => rng.pick(SECRET_CHARS)).join('');
      return { secret, uri: otpauthUri(secret, call.actor.user.email ?? call.actor.user.displayName) };
    },

    async confirmEnrolment(ctx, code) {
      const call = await beginCall(backend, options, ctx, { allowLimited: true });
      if (call.side !== 'client') return forbid('permission');
      const user = call.actor.user;
      if (user.twoFactor) throw new ValidationError(['code: two-step sign-in is already set up']);
      if (text(code).trim() !== demoTwoFactorCode) throw new RuleError('wrongCode');
      const rng = options.rng.fork(`recovery:${user.id}:${ctx.now}`);
      const codes = new Set<string>();
      while (codes.size < recoveryCodeCount) {
        const part = () => Array.from({ length: 5 }, () => rng.pick(RECOVERY_CHARS)).join('');
        codes.add(`${part()}-${part()}`);
      }
      const recoveryCodes = [...codes];
      const recoveryCodeHashes = await Promise.all(recoveryCodes.map(sha256Hex));
      const next: UserAccount = {
        ...user,
        twoFactor: { enrolledAt: ctx.now, recoveryCodesLeft: recoveryCodeCount, recoveryCodeHashes },
      };
      await apply([
        put('users', user.id, next),
        audit(call, call.clientId, 'twoFactor.enrolled', user.id, undefined, undefined),
      ]);
      return { recoveryCodes };
    },

    async verify(ctx, code) {
      await codeEntry(ctx, (user) => Promise.resolve(text(code).trim() === demoTwoFactorCode ? user : undefined));
    },

    async useRecoveryCode(ctx, code) {
      await codeEntry(ctx, async (user) => {
        const hash = await sha256Hex(text(code).trim());
        const hashes = user.twoFactor?.recoveryCodeHashes ?? [];
        if (!hashes.includes(hash) || !user.twoFactor) return undefined;
        const left = hashes.filter((h) => h !== hash);
        return { ...user, twoFactor: { ...user.twoFactor, recoveryCodeHashes: left, recoveryCodesLeft: left.length } };
      });
    },
  };

  // ------------------------------------------------------------ team

  /** The roles must be this client's own and the scope must lie inside it. Anything else is a tenant error. */
  async function checkRolesAndScope(call: Call, clientId: string, roleIds: string[], scope: Scope): Promise<Role[]> {
    const roles = await call.all<Role>('roles');
    const chosen = roleIds.map((id) => roles.find((r) => r.id === id));
    for (const role of chosen) {
      if (!role || role.owner === 'provider' || role.owner.clientId !== clientId) return forbid('tenant');
    }
    if (scope.type === 'all') return forbid('tenant');
    if (scope.type === 'clients' && scope.ids.some((id) => id !== clientId)) return forbid('tenant');
    if (scope.type === 'sites') {
      const sites = await call.all<Site>('sites');
      if (scope.ids.some((id) => sites.find((s) => s.id === id)?.clientId !== clientId)) return forbid('tenant');
    }
    return chosen as Role[];
  }

  function parseAccess(input: { roleIds: unknown; scope: unknown }): { roleIds: string[]; scope: Scope } {
    const roleIds = input.roleIds;
    if (!Array.isArray(roleIds) || roleIds.length === 0 || roleIds.some((r) => typeof r !== 'string' || r === '')) {
      throw new ValidationError(['roleIds: choose at least one role']);
    }
    const scope = scopeSchema.safeParse(input.scope);
    if (!scope.success) throw new ValidationError(['scope: not a valid scope']);
    return { roleIds: [...new Set(roleIds as string[])], scope: scope.data };
  }

  const permissionsOf = (roles: Role[], roleIds: string[]): string[] => [
    ...new Set(roleIds.flatMap((id) => roles.find((r) => r.id === id)?.permissionIds ?? [])),
  ];

  /** Refuses (lastOwner) a change that would leave the client without an Account Owner. */
  async function guardOwner(call: Call, userId: string, keepsOwner: boolean): Promise<void> {
    if (keepsOwner) return;
    const guard = lastOwnerGuard(
      { type: 'deleteUser', userId },
      await call.all<RoleAssignment>('roleAssignments'),
      await call.all<Role>('roles'),
      call.actor.now,
    );
    if (!guard.ok) forbid('lastOwner');
  }

  /** The target must be a client admin of the actor's own client. Other clients look the same as unknown ids. */
  async function teamTarget(call: Call, userId: string): Promise<UserAccount> {
    const target = await call.find<UserAccount>('users', userId);
    if (!target || target.side !== 'client' || target.clientId !== call.clientId) throw new NotFoundError();
    return target;
  }

  const team: TeamService = {
    async members(ctx) {
      const call = await clientCall(ctx, 'staff.view');
      const clientId = call.clientId as string;
      const assignments = await call.all<RoleAssignment>('roleAssignments');
      const members: TeamMember[] = (await call.all<UserAccount>('users'))
        .filter((u) => u.side === 'client' && u.clientId === clientId)
        .map((u) => {
          const mine = assignments.filter((a) => a.userId === u.id && a.status === 'active');
          const scope = mine[0]?.scope;
          return {
            userId: u.id,
            displayName: u.displayName,
            ...(u.email ? { email: u.email } : {}),
            status: u.status,
            roleIds: [...new Set(mine.flatMap((a) => a.roleIds))],
            ...(scope ? { scope } : {}),
          };
        });
      return members.sort((a, b) =>
        a.displayName === b.displayName ? (a.userId < b.userId ? -1 : 1) : a.displayName < b.displayName ? -1 : 1,
      );
    },

    async invite(ctx, input) {
      const call = await clientCall(ctx, 'team.manageRoles');
      const clientId = call.clientId as string;
      const email = text(input.email).trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 200) throw new ValidationError(['email: not a valid email address']);
      const name = (input.displayName ?? email.split('@')[0] ?? '').trim();
      if (name.length < 1 || name.length > 80) throw new ValidationError(['displayName: 1 to 80 characters']);
      const { roleIds, scope } = parseAccess(input);
      const users = await call.all<UserAccount>('users');
      if (users.some((u) => u.clientId === clientId && u.email?.toLowerCase() === email)) {
        throw new ValidationError(['email: this person is already on the team']);
      }
      const roles = await checkRolesAndScope(call, clientId, roleIds, scope);
      if (!canGrant(call.actor.perms, permissionsOf(roles, roleIds), scope, clientId)) return forbid('escalation');
      checkAccountState(call, true);

      const now = ctx.now;
      const user: UserAccount = {
        id: call.newId(),
        side: 'client',
        clientId,
        email,
        displayName: name,
        status: 'invited',
        login: { method: 'emailPassword', pinSet: false },
        twoFactorRequiredSince: now,
      };
      const invitation: Invitation = invitationSchema.parse({
        id: call.newId(),
        side: 'client',
        clientId,
        email,
        roleIds,
        scope,
        invitedBy: call.actor.user.id,
        expiresAt: addDays(call.actor.now, INVITE_DAYS).toISOString(),
        status: 'invited',
      });
      const access: RoleAssignment = {
        id: call.newId(),
        userId: user.id,
        roleIds,
        scope,
        grants: [],
        denies: [],
        status: 'active',
      };
      const mail: OutboxMessage = {
        id: call.newId(),
        channel: 'email',
        to: email,
        subject: `You have been invited to ${call.actor.client?.displayName ?? 'the team'}`,
        body: `${call.actor.user.displayName} has invited you to help run training. Use the link in the app to accept before ${invitation.expiresAt.slice(0, 10)}.`,
        at: now,
        reason: 'team.invite',
      };
      await apply([
        put('users', user.id, user),
        put('invitations', invitation.id, invitation),
        put('roleAssignments', access.id, access),
        put('outbox', mail.id, mail),
        audit(call, clientId, 'team.invite', user.id, undefined, { roleCount: roleIds.length, scope: scope.type }),
        ...tickOnboarding(call, clientId, await call.all<OnboardingChecklist>('onboarding'), 'inviteStaff'),
      ]);
      return structuredClone(invitation);
    },

    async setAccess(ctx, userId, input) {
      const call = await clientCall(ctx, 'team.manageRoles');
      const clientId = call.clientId as string;
      if (!canEditRolesOf(call.actor.user.id, userId)) return forbid('selfEdit');
      const target = await teamTarget(call, userId);
      const { roleIds, scope } = parseAccess(input);
      const roles = await checkRolesAndScope(call, clientId, roleIds, scope);
      const mine = (await call.all<RoleAssignment>('roleAssignments')).filter((a) => a.userId === target.id);
      const allRoles = await call.all<Role>('roles');
      // Permissions the person already holds over the same scope are not new grants.
      const held = new Set(
        mine.filter((a) => sameJson(a.scope, scope)).flatMap((a) => permissionsOf(allRoles, a.roleIds)),
      );
      const fresh = permissionsOf(roles, roleIds).filter((p) => !held.has(p));
      if (!canGrant(call.actor.perms, fresh, scope, clientId)) return forbid('escalation');
      await guardOwner(
        call,
        target.id,
        roles.some((r) => r.system && r.systemKey === OWNER_KEYS.client),
      );
      checkAccountState(call, false);

      const [first, ...others] = mine;
      const next: RoleAssignment = {
        id: first?.id ?? call.newId(),
        userId: target.id,
        roleIds,
        scope,
        grants: [],
        denies: [],
        status: 'active',
      };
      await apply([
        put('roleAssignments', next.id, next),
        ...others.map((a) => remove('roleAssignments', a.id)),
        audit(call, clientId, 'team.setAccess', target.id, undefined, { roleCount: roleIds.length, scope: scope.type }),
      ]);
      return structuredClone(next);
    },

    async revoke(ctx, userId) {
      const call = await clientCall(ctx, 'team.manageRoles');
      const clientId = call.clientId as string;
      if (!canEditRolesOf(call.actor.user.id, userId)) return forbid('selfEdit');
      const target = await teamTarget(call, userId);
      await guardOwner(call, target.id, false);
      checkAccountState(call, false);
      const mine = (await call.all<RoleAssignment>('roleAssignments')).filter((a) => a.userId === target.id);
      const invitations = (await call.all<Invitation>('invitations')).filter(
        (i) => i.clientId === clientId && i.status === 'invited' && i.email === target.email,
      );
      await apply([
        put('users', target.id, { ...target, status: 'suspended' }),
        ...mine.map((a) => put('roleAssignments', a.id, { ...a, status: 'suspended' })),
        ...invitations.map((i) => put('invitations', i.id, { ...i, status: 'revoked' })),
        audit(call, clientId, 'team.revoke', target.id, undefined, undefined),
      ]);
    },

    async saveCustomRole(ctx, input) {
      const call = await clientCall(ctx, 'team.manageRoles');
      const clientId = call.clientId as string;
      const name = text(input.name).trim();
      if (name.length < 1 || name.length > 60) throw new ValidationError(['name: 1 to 60 characters']);
      const levels = input.levels as Record<string, unknown> | undefined;
      if (!levels || categories.some((c) => !levelNames.includes(levels[c] as string))) {
        throw new ValidationError(['levels: choose none, view or manage for every category']);
      }
      if (!Array.isArray(input.allows) || input.allows.some((a) => !clientAllowIds.includes(a))) {
        throw new ValidationError(['allows: not a known permission toggle']);
      }
      const existing = input.id === undefined ? undefined : await call.find<Role>('roles', input.id);
      if (input.id !== undefined) {
        if (!existing || existing.system || existing.owner === 'provider' || existing.owner.clientId !== clientId) {
          throw new NotFoundError();
        }
      } else {
        await checkCustomRoleLimit(call, clientId);
      }
      const permissionIds = compileClientRole(input.levels, input.allows);
      if (!canGrant(call.actor.perms, permissionIds, { type: 'clients', ids: [clientId] }, clientId)) {
        return forbid('escalation');
      }
      checkAccountState(call, existing === undefined);
      const role: Role = {
        id: existing?.id ?? call.newId(),
        owner: { clientId },
        name,
        description: (input.description ?? '').trim(),
        colour: input.colour ?? existing?.colour ?? '#4a5568',
        permissionIds,
        system: false,
        version: (existing?.version ?? 0) + 1,
        clientLevels: { ...input.levels },
        clientAllows: input.allows.filter((a) => permissionIds.includes(a)),
        updatedBy: call.actor.user.id,
        updatedAt: ctx.now,
      };
      await apply([
        put('roles', role.id, role),
        audit(call, clientId, 'team.saveCustomRole', role.id, undefined, {
          version: role.version,
          permissionCount: permissionIds.length,
        }),
      ]);
      return structuredClone(role);
    },

    async removeCustomRole(ctx, roleId) {
      const call = await clientCall(ctx, 'team.manageRoles');
      const clientId = call.clientId as string;
      const role = await call.find<Role>('roles', roleId);
      if (!role || role.owner === 'provider' || role.owner.clientId !== clientId) throw new NotFoundError();
      if (role.system) return forbid('permission');
      const held = (await call.all<RoleAssignment>('roleAssignments')).some((a) => a.roleIds.includes(roleId));
      if (held) throw new ValidationError(['roleId: someone still has this role']);
      checkAccountState(call, false);
      await apply([
        remove('roles', roleId),
        audit(call, clientId, 'team.removeCustomRole', roleId, undefined, undefined),
      ]);
    },

    async activity(ctx, filter) {
      const call = await clientCall(ctx, 'team.manageRoles');
      const clientId = call.clientId as string;
      const lines: ActivityLine[] = (await call.all<ActivityLine & { actorSide: string }>('audit'))
        .filter((e) => e.clientId === clientId && (filter?.action === undefined || e.action === filter.action))
        .sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1))
        .map((e) => {
          const slim = SLIM_ACTIONS.some((p) => e.action.startsWith(p));
          return {
            id: e.id,
            actorId: e.actorId,
            clientId,
            action: e.action,
            target: e.target,
            ...(slim && e.before !== undefined ? { before: e.before } : {}),
            ...(slim && e.after !== undefined ? { after: e.after } : {}),
            at: e.at,
          };
        });
      return structuredClone(lines);
    },
  };

  // ------------------------------------------------------------ organisation

  const profileOf = (client: Client) => ({
    displayName: client.displayName,
    ...(client.shortName !== undefined ? { shortName: client.shortName } : {}),
  });

  const organisation: OrganisationService = {
    async profile(ctx) {
      const call = await beginCall(backend, options, ctx);
      if (call.side === 'provider' || !call.actor.client) return forbid('permission');
      return profileOf(call.actor.client);
    },

    async updateProfile(ctx, patch) {
      const call = await clientCall(ctx, 'org.editName');
      const client = call.actor.client as Client;
      rejectUnknown(patch, ['displayName', 'shortName']);
      if (patch.displayName === undefined && patch.shortName === undefined) {
        throw new ValidationError(['patch: nothing to change']);
      }
      let displayName = client.displayName;
      let shortName = client.shortName;
      if (patch.displayName !== undefined) {
        const checked = validateOrgName(text(patch.displayName), 'display');
        if (!checked.ok) throw new RuleError('invalidName');
        displayName = checked.value;
      }
      if (patch.shortName !== undefined) {
        const checked = validateOrgName(text(patch.shortName), 'short');
        if (!checked.ok) throw new RuleError('invalidName');
        shortName = checked.value;
      }
      checkAccountState(call, false);
      const renamed = displayName !== client.displayName;
      const next: Client = {
        ...client,
        displayName,
        ...(shortName !== undefined ? { shortName } : {}),
        nameHistory: renamed
          ? [
              ...client.nameHistory,
              {
                old: client.displayName,
                new: displayName,
                changedBy: call.actor.user.id,
                changedAt: ctx.now,
                reviewStatus: 'pendingReview' as const,
              },
            ]
          : client.nameHistory,
      };
      await apply([
        put('clients', client.id, next),
        audit(call, client.id, 'organisation.updateProfile', client.id, profileOf(client), profileOf(next)),
      ]);
      return profileOf(next);
    },

    async updateSettings(ctx, patch) {
      const call = await clientCall(ctx, 'settings.manage');
      const client = call.actor.client as Client;
      rejectUnknown(patch, [
        'amberWindowDays',
        'weeklyGoalLessons',
        'firstAiderThreshold',
        'allowStaffTickets',
        'pulseSurveys',
      ]);
      const issues: string[] = [];
      const range = (key: keyof SettingsPatch, min: number, max: number) => {
        const v = patch[key];
        if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)) {
          issues.push(`${key}: a whole number from ${min} to ${max}`);
        }
      };
      range('amberWindowDays', 1, 365);
      range('weeklyGoalLessons', 1, 7);
      range('firstAiderThreshold', 0, 20);
      for (const key of ['allowStaffTickets', 'pulseSurveys'] as const) {
        if (patch[key] !== undefined && typeof patch[key] !== 'boolean') issues.push(`${key}: true or false`);
      }
      if (issues.length > 0) throw new ValidationError(issues);
      checkAccountState(call, false);
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => (v as unknown) !== undefined));
      const settings = { ...client.settings, ...defined };
      await apply([
        put('clients', client.id, { ...client, settings }),
        audit(call, client.id, 'organisation.updateSettings', client.id, undefined, {
          fields: Object.keys(defined).sort(),
        }),
      ]);
      return structuredClone(settings);
    },

    sites: {
      async update(ctx, siteId, patch) {
        const call = await clientCall(ctx, 'settings.manage');
        const clientId = call.clientId as string;
        const site = await call.find<Site>('sites', siteId);
        if (!site || site.clientId !== clientId) throw new NotFoundError();
        if (!canAny(call, ['settings.manage'], { clientId, siteIds: [siteId] }, 'write')) return forbid('outOfScope');
        rejectUnknown(patch, ['name', 'region']);
        const name = patch.name === undefined ? site.name : text(patch.name).trim();
        if (name.length < 1 || name.length > 80) throw new ValidationError(['name: 1 to 80 characters']);
        let region = site.region;
        if (patch.region !== undefined) {
          region = text(patch.region).trim();
          if (region.length < 1 || region.length > 60) throw new ValidationError(['region: 1 to 60 characters']);
        }
        if (patch.name === undefined && patch.region === undefined)
          throw new ValidationError(['patch: nothing to change']);
        checkAccountState(call, false);
        const next: Site = { ...site, name, ...(region !== undefined ? { region } : {}) };
        await apply([
          put('sites', site.id, next),
          audit(
            call,
            clientId,
            'organisation.updateSite',
            site.id,
            { name: site.name, region: site.region },
            { name, region },
          ),
        ]);
        return structuredClone(next);
      },
    },
  };

  // ------------------------------------------------------------ onboarding

  const onboarding: OnboardingService = {
    async checklist(ctx) {
      const call = await clientCall(ctx, null);
      const rows = await call.all<OnboardingChecklist>('onboarding');
      return viewOf(rows.find((r) => r.clientId === call.clientId));
    },

    async markDone(ctx, step) {
      const call = await clientCall(ctx, null);
      if (!(onboardingSteps as readonly string[]).includes(step)) {
        throw new ValidationError([`step: ${text(step)} is not a checklist step`]);
      }
      const clientId = call.clientId as string;
      const rows = await call.all<OnboardingChecklist>('onboarding');
      const ops = tickOnboarding(call, clientId, rows, step);
      if (ops.length > 0) {
        await apply([...ops, audit(call, clientId, 'onboarding.markDone', step, undefined, undefined)]);
      }
      const updated =
        ops[0]?.type === 'put' ? (ops[0].record as OnboardingChecklist) : rows.find((r) => r.clientId === clientId);
      return viewOf(updated);
    },
  };

  return { twoFactor, team, organisation, onboarding };
}

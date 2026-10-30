// Provider client creation (M4 chunk 6a, plan BP-3). Provider side only, needs clients.write. ONE batch writes the
// client, its sites, its system roles, a subscription, starter content (a placement for each published module of the
// chosen pack), an onboarding checklist, the first admin's invitation (with their invited user and access) and the
// welcome email, together with the audit event. All times come from ctx.now and all ids from the seeded RNG.
import { nurseryModules, nurseryPack, allPacks, packages } from '@sta/content';
import {
  addDays,
  addMonths,
  clientRoleTemplates,
  clientSettingsSchema,
  compileClientRole,
  invitationSchema,
  type Client,
  type Invitation,
  type ModulePlacement,
  type OnboardingChecklist,
  type OutboxMessage,
  type Role,
  type RoleAssignment,
  type Site,
  type Subscription,
  type UserAccount,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { onboardingSteps } from './identityOps';
import { audit, beginCall, forbid, holds } from './policy';
import {
  RuleError,
  type ActorContext,
  type CreateClientInput,
  type CreateClientResult,
  type ProviderOpsService,
  type StoreOptions,
} from './types';

const put = (store: WriteOp['store'], key: string, record: unknown): WriteOp => ({ type: 'put', store, key, record });
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 14;
const DAY_MS = 86_400_000;
const MAX_SITES = 100;
const MAX_TRIAL_DAYS = 90;
const ROLE_COLOURS: Record<string, string> = {
  accountOwner: '#1f5f3f',
  groupAdmin: '#2a4f8f',
  siteManager: '#7a4a1f',
  supervisor: '#5a3a7a',
  trainer: '#8a3a4a',
  viewer: '#4a4a4a',
};

/** Starter content: the published modules of the pack. Only the nursery pack has modules yet. */
const starterModuleIds = (packId: string): string[] =>
  packId === nurseryPack.id ? nurseryModules.filter((m) => m.status === 'published').map((m) => m.id) : [];

export function createProviderOperations(backend: RawBackend, options: StoreOptions): ProviderOpsService {
  return {
    async createClient(ctx: ActorContext, input: CreateClientInput): Promise<CreateClientResult> {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'provider' || !holds(call, ['clients.write'])) return forbid('permission');

      const i = (input as Partial<CreateClientInput> | null) ?? {};
      const displayName = text(i.displayName).trim();
      if (displayName.length < 1 || displayName.length > 120) throw new RuleError('invalidClient');
      if (!allPacks.some((p) => p.id === i.industryPackId)) throw new RuleError('invalidClient');
      const packageId = text(i.packageId);
      if (!packages.some((p) => p.id === packageId)) throw new RuleError('invalidClient');
      const siteInputs = Array.isArray(i.sites) ? i.sites : [];
      if (siteInputs.length < 1 || siteInputs.length > MAX_SITES) throw new RuleError('invalidClient');
      const siteNames = siteInputs.map((s) => text((s as Partial<typeof s> | null)?.name).trim());
      if (siteNames.some((n) => n.length < 1 || n.length > 120)) throw new RuleError('invalidClient');
      const billingContact = text(i.billingContact).trim();
      const admin = i.firstAdmin;
      const email = text(admin?.email).trim().toLowerCase();
      const adminName = text(admin?.displayName).trim();
      if (!EMAIL.test(email) || email.length > 200) throw new RuleError('invalidClient');
      if (adminName.length < 1 || adminName.length > 80) throw new RuleError('invalidClient');
      if (admin?.roleKey !== 'accountOwner') throw new RuleError('invalidClient');
      const trialDays = i.trialDays ?? 0;
      if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > MAX_TRIAL_DAYS) {
        throw new RuleError('invalidClient');
      }
      const contact = billingContact === '' ? email : billingContact;
      if (!EMAIL.test(contact)) throw new RuleError('invalidClient');

      const now = ctx.now;
      const clientId = call.newId();
      const state = trialDays > 0 ? 'trial' : 'active';
      const client: Client = {
        id: clientId,
        displayName,
        industryPackId: i.industryPackId as string,
        packageId,
        accountState: state,
        createdAt: now,
        settings: clientSettingsSchema.parse({}),
        nameHistory: [],
      };
      const sites: Site[] = siteInputs.map((s, n) => ({
        id: call.newId(),
        clientId,
        name: siteNames[n] as string,
        countryCode: text(s.countryCode).trim() || 'GB',
        status: 'active',
        timezone: text(s.timezone).trim() || 'Europe/London',
      }));
      const roles: Role[] = clientRoleTemplates.map((t) => ({
        id: call.newId(),
        owner: { clientId },
        name: t.name,
        description: `${t.name} role`,
        colour: ROLE_COLOURS[t.key] ?? '#4a4a4a',
        permissionIds: compileClientRole(t.levels, t.allows),
        system: true,
        systemKey: t.key,
        version: 1,
        clientLevels: t.levels,
        clientAllows: t.allows,
        updatedBy: call.actor.user.id,
        updatedAt: now,
      }));
      const ownerRole = roles.find((r) => r.systemKey === 'accountOwner') as Role;
      const start = new Date(now);
      // A trial is a fixed number of 24 hour days from ctx.now (not London calendar days).
      const trialEnd = new Date(start.getTime() + trialDays * DAY_MS).toISOString();
      const subscription: Subscription = {
        clientId,
        packageId,
        period: 'monthly',
        renewalAt: trialDays > 0 ? trialEnd : addMonths(start, 1).toISOString(),
        state,
        stateSince: now,
        ...(trialDays > 0 ? { nextStateAt: trialEnd } : {}),
        billingContact: contact,
      };
      const placements: ModulePlacement[] = starterModuleIds(client.industryPackId).map((moduleId) => ({
        clientId,
        moduleId,
        availableToAll: true,
      }));
      const checklist: OnboardingChecklist = {
        clientId,
        startedAt: now,
        steps: onboardingSteps.map((key) => ({ key })),
      };
      const user: UserAccount = {
        id: call.newId(),
        side: 'client',
        clientId,
        email,
        displayName: adminName,
        status: 'invited',
        login: { method: 'emailPassword', pinSet: false },
        twoFactorRequiredSince: now,
      };
      const scope = { type: 'clients' as const, ids: [clientId] };
      const invitation: Invitation = invitationSchema.parse({
        id: call.newId(),
        side: 'client',
        clientId,
        email,
        roleIds: [ownerRole.id],
        scope,
        invitedBy: call.actor.user.id,
        expiresAt: addDays(start, INVITE_DAYS).toISOString(),
        status: 'invited',
      });
      const access: RoleAssignment = {
        id: call.newId(),
        userId: user.id,
        roleIds: [ownerRole.id],
        scope,
        grants: [],
        denies: [],
        status: 'active',
      };
      const mail: OutboxMessage = {
        id: call.newId(),
        channel: 'email',
        to: email,
        subject: `Welcome to ${displayName}`,
        body: `${call.actor.user.displayName} has set up ${displayName} and invited you to run it. Use the link in the app to accept before ${invitation.expiresAt.slice(0, 10)}.`,
        at: now,
        reason: 'client.welcome',
      };
      await backend.apply([
        put('clients', client.id, client),
        ...sites.map((s) => put('sites', s.id, s)),
        ...roles.map((r) => put('roles', r.id, r)),
        put('subscriptions', clientId, subscription),
        ...placements.map((p) => put('modulePlacements', `${p.clientId}:${p.moduleId}`, p)),
        put('onboarding', clientId, checklist),
        put('users', user.id, user),
        put('roleAssignments', access.id, access),
        put('invitations', invitation.id, invitation),
        put('outbox', mail.id, mail),
        audit(call, clientId, 'client.create', clientId, undefined, {
          packId: client.industryPackId,
          packageId,
          sites: sites.length,
          trialDays,
        }),
      ]);
      return structuredClone({ client, sites, subscription, placements, checklist, invitation });
    },
  };
}

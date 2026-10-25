// M1 chunk 1 contract tests (K-1, K-2): owner recognition by systemKey and the admin count used for the single-admin
// self-approval exception. Runs against every adapter. Written before the implementation.
import { describe, expect, it } from 'vitest';
import { nurseryPack, packageIds } from '@sta/content';
import {
  clientRoleTemplates,
  clientSettingsSchema,
  compileClientRole,
  createRng,
  fixedClock,
  type Client,
  type EvidenceSubmission,
  type Person,
  type Role,
  type Scope,
  type RoleAssignment,
  type Site,
  type UserAccount,
} from '@sta/domain';
import { ForbiddenError, type ActorContext, type DemoAdmin, type StoreHandle, type StoreOptions } from '../types';
import { buildWorld, id, TODAY } from './world';

type Second = 'none' | 'active' | 'suspendedUser' | 'expiredAssignment' | 'suspendedAssignment';

const base = 700_000;
const ids = {
  client: id(base + 1),
  site: id(base + 2),
  ownerPerson: id(base + 3),
  staffPerson: id(base + 4),
  secondPerson: id(base + 5),
  owner: id(base + 6),
  second: id(base + 7),
  ownerRole: id(base + 8),
  secondRole: id(base + 9),
  ownerAssignment: id(base + 10),
  secondAssignment: id(base + 11),
  submission: id(base + 12),
  attachment: id(base + 13),
};

async function addClient(
  admin: DemoAdmin,
  requirementId: string,
  opts: { second: Second; ownerRoleName?: string; allowSelfApproval?: boolean },
): Promise<void> {
  const prefs = ((await admin.dumpAll()) as unknown as { people: Person[] }).people[0]!.prefs;
  const t = clientRoleTemplates.find((x) => x.key === 'accountOwner')!;
  const ga = clientRoleTemplates.find((x) => x.key === 'groupAdmin')!;
  const client: Client = {
    id: ids.client,
    displayName: 'Admin Count Test',
    industryPackId: nurseryPack.id,
    packageId: packageIds.standard,
    accountState: 'active',
    createdAt: '2025-01-01T09:00:00.000Z',
    settings: clientSettingsSchema.parse({ allowSelfApproval: opts.allowSelfApproval ?? true }),
    nameHistory: [],
  };
  const site: Site = {
    id: ids.site,
    clientId: ids.client,
    name: 'Main',
    countryCode: 'GB',
    status: 'active',
    timezone: 'Europe/London',
  };
  const person = (pid: string, firstName: string): Person => ({
    id: pid,
    clientId: ids.client,
    primarySiteId: ids.site,
    additionalSiteIds: [],
    teamIds: [],
    firstName,
    lastName: 'Testperson',
    jobRoleIds: [],
    startDate: '2025-01-06T09:00:00.000Z',
    status: 'active',
    prefs,
  });
  const user = (uid: string, pid: string | undefined, name: string, status: UserAccount['status']): UserAccount => ({
    id: uid,
    side: 'client',
    clientId: ids.client,
    ...(pid ? { personId: pid } : {}),
    email: `${name.toLowerCase()}@example.test`,
    displayName: name,
    status,
    login: { method: 'emailPassword', pinSet: false },
  });
  const ownerRole = {
    id: ids.ownerRole,
    owner: { clientId: ids.client },
    name: opts.ownerRoleName ?? 'Account Owner',
    description: 'Runs the account',
    colour: '#336699',
    permissionIds: compileClientRole(t.levels, t.allows),
    system: true,
    systemKey: 'accountOwner',
    version: 1,
    clientLevels: t.levels,
    clientAllows: t.allows,
    updatedBy: ids.owner,
    updatedAt: TODAY,
  } as Role;
  const secondRole = {
    id: ids.secondRole,
    owner: { clientId: ids.client },
    name: 'Group Admin',
    description: 'Group Admin',
    colour: '#336699',
    permissionIds: compileClientRole(ga.levels, ga.allows),
    system: true,
    systemKey: 'groupAdmin',
    version: 1,
    clientLevels: ga.levels,
    clientAllows: ga.allows,
    updatedBy: ids.owner,
    updatedAt: TODAY,
  } as Role;
  const scope: Scope = { type: 'clients', ids: [ids.client] };
  const assignment = (
    aid: string,
    userId: string,
    roleId: string,
    more: Partial<RoleAssignment> = {},
  ): RoleAssignment => ({
    id: aid,
    userId,
    roleIds: [roleId],
    scope,
    grants: [],
    denies: [],
    status: 'active',
    ...more,
  });
  const submission: EvidenceSubmission = {
    id: ids.submission,
    clientId: ids.client,
    siteId: ids.site,
    personId: ids.staffPerson,
    requirementId,
    uploadedBy: ids.owner,
    fileAttachmentId: ids.attachment,
    providerName: 'Test Training Ltd',
    completedAt: '2026-10-01T09:00:00.000Z',
    expiresAt: '2028-10-01T09:00:00.000Z',
    status: 'awaitingCheck',
    createdAt: '2026-10-15T09:00:00.000Z',
  };
  const expiredOneMs = new Date(new Date(TODAY).getTime() - 1).toISOString();
  const users = [user(ids.owner, ids.ownerPerson, 'Admincountowner', 'active')];
  const assignments = [assignment(ids.ownerAssignment, ids.owner, ids.ownerRole)];
  const people = [person(ids.ownerPerson, 'Owner'), person(ids.staffPerson, 'Staffer')];
  if (opts.second !== 'none') {
    users.push(
      user(ids.second, ids.secondPerson, 'Admincountsecond', opts.second === 'suspendedUser' ? 'suspended' : 'active'),
    );
    people.push(person(ids.secondPerson, 'Second'));
    assignments.push(
      assignment(ids.secondAssignment, ids.second, ids.secondRole, {
        ...(opts.second === 'expiredAssignment' ? { expiresAt: expiredOneMs } : {}),
        ...(opts.second === 'suspendedAssignment' ? { status: 'suspended' as const } : {}),
      }),
    );
  }
  await admin.bulkPut('clients', [client]);
  await admin.bulkPut('sites', [site]);
  await admin.bulkPut('people', people);
  await admin.bulkPut('users', users);
  await admin.bulkPut('roles', [ownerRole, secondRole]);
  await admin.bulkPut('roleAssignments', assignments);
  await admin.bulkPut('evidenceSubmissions', [submission]);
}

export function runAdminCountContract(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup(opts: Parameters<typeof addClient>[2]) {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const { store, admin } = await makeStore(options);
    const fx = await buildWorld(admin);
    await addClient(admin, fx.ids.requirementId, opts);
    const ctx: ActorContext = { userId: ids.owner, side: 'client', clientId: ids.client, now: TODAY };
    return { store, admin, ctx };
  }

  const approveOwn = async (s: Awaited<ReturnType<typeof setup>>) => {
    const sub = await s.store.evidenceSubmissions.get(s.ctx, ids.submission);
    return s.store.evidenceSubmissions.put(s.ctx, { ...sub, status: 'approved' });
  };
  const reasonOf = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError);
      return (e as ForbiddenError).reason;
    }
    throw new Error('Expected the call to be refused');
  };
  const selfApprovedFlag = async (s: Awaited<ReturnType<typeof setup>>): Promise<boolean | undefined> => {
    const dump = (await s.admin.dumpAll()) as unknown as {
      evidence: { submissionId?: string; selfApproved?: boolean }[];
    };
    return dump.evidence.find((e) => e.submissionId === ids.submission)?.selfApproved;
  };

  describe(`Owner key and admin count: ${name}`, () => {
    it('K-2: single admin with the setting on can self-approve (selfApproved)', async () => {
      const s = await setup({ second: 'none' });
      await approveOwn(s);
      expect(await selfApprovedFlag(s)).toBe(true);
    });

    it('K-2: a second admin whose user is suspended is not counted', async () => {
      const s = await setup({ second: 'suspendedUser' });
      await approveOwn(s);
      expect(await selfApprovedFlag(s)).toBe(true);
    });

    it('K-2: a second admin whose assignment expired one millisecond ago is not counted', async () => {
      const s = await setup({ second: 'expiredAssignment' });
      await approveOwn(s);
      expect(await selfApprovedFlag(s)).toBe(true);
    });

    it('K-2: a second admin with a suspended assignment is not counted', async () => {
      const s = await setup({ second: 'suspendedAssignment' });
      await approveOwn(s);
      expect(await selfApprovedFlag(s)).toBe(true);
    });

    it('K-2: with a second active admin the owner cannot approve their own upload', async () => {
      const s = await setup({ second: 'active' });
      expect(await reasonOf(approveOwn(s))).toBe('ownUpload');
      expect(await selfApprovedFlag(s)).toBeUndefined();
    });

    it('K-2: with the setting off a single admin still cannot approve their own upload', async () => {
      const s = await setup({ second: 'none', allowSelfApproval: false });
      expect(await reasonOf(approveOwn(s))).toBe('ownUpload');
    });

    it('K-1: a renamed system Account Owner role still gets the single-admin exception', async () => {
      const s = await setup({ second: 'none', ownerRoleName: 'Head of House' });
      await approveOwn(s);
      expect(await selfApprovedFlag(s)).toBe(true);
    });

    it('K-1: renaming the seeded Account Owner role leaves last-owner results unchanged', async () => {
      const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
      const { store, admin } = await makeStore(options);
      const fx = await buildWorld(admin);
      const dump = (await admin.dumpAll()) as unknown as { roles: Role[] };
      const owner = dump.roles.find((r) => r.id === fx.ids.roles.aOwner)!;
      await admin.bulkPut('roles', [{ ...owner, name: 'Head of Setting' }]);
      const rory = { userId: fx.ids.users.rory, side: 'client', clientId: fx.ids.clients.a, now: TODAY } as const;
      expect(await reasonOf(store.roleAssignments.remove(rory, fx.ids.assignments.priya))).toBe('lastOwner');
    });
  });
}

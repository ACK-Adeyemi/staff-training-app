// The contract suite's world: the seed (fixed seed value and today) plus a few test-only records that the seed does
// not hold (an expiring assignment, a suspended user, one client in each limited account state). The extras are added
// through DemoAdmin after the seed loads, with ids that cannot collide with seeded ULIDs.
import { nurseryPack, packageIds } from '@sta/content';
import {
  clientRoleTemplates,
  clientSettingsSchema,
  compileClientRole,
  type AddOn,
  type Client,
  type Evidence,
  type EvidenceSubmission,
  type PaymentAttempt,
  type Subscription,
  type Team,
  type Person,
  type Role,
  type RoleAssignment,
  type Scope,
  type Site,
  type UserAccount,
} from '@sta/domain';
import { load } from '@sta/seed';
import type { DemoAdmin } from '../types';

export const TODAY = '2026-10-19T09:00:00.000Z';
export const SEED_VALUE = 20261019;

/** A valid ULID-shaped id from a number (leading zeros never occur in seeded ids). */
export const id = (n: number): string => String(n).padStart(26, '0');
/** Ids for records a test creates itself (never collide with the extras). */
export const freshId = (n: number): string => id(900_000 + n);

/** The stores the suite reads, typed. `dumpAll` returns unknown records; the seed validated every one of them. */
export type WorldData = {
  clients: Client[];
  sites: Site[];
  teams: Team[];
  people: Person[];
  users: UserAccount[];
  evidence: Evidence[];
  evidenceSubmissions: EvidenceSubmission[];
  roles: Role[];
  roleAssignments: RoleAssignment[];
  subscriptions: Subscription[];
  paymentAttempts: PaymentAttempt[];
};

export type StateClient = {
  client: Client;
  site: Site;
  owner: UserAccount;
  staff: UserAccount;
  ownerPerson: Person;
  staffPerson: Person;
};

const TEST_ADD_ON: AddOn = {
  id: id(800_001),
  name: 'Test extra role',
  pricing: { kind: 'flat', price: 100 },
  adds: { customClientRoles: 1 },
};

export async function buildWorld(admin: DemoAdmin) {
  const keys = await load(admin, { seedValue: SEED_VALUE, today: TODAY });
  const seeded = (await admin.dumpAll()) as unknown as WorldData;
  let n = 0;
  const nid = (): string => id(++n);
  const extra: Record<string, unknown[]> = {
    clients: [],
    sites: [],
    people: [],
    users: [],
    roles: [],
    roleAssignments: [],
    evidenceSubmissions: [],
    addOns: [TEST_ADD_ON],
  };
  const put = <T>(store: string, record: T): T => {
    (extra[store] as unknown[]).push(record);
    return record;
  };

  const prefs = seeded.people[0]!.prefs;
  const person = (clientId: string, siteId: string, firstName: string): Person =>
    put('people', {
      id: nid(),
      clientId,
      primarySiteId: siteId,
      additionalSiteIds: [],
      teamIds: [],
      firstName,
      lastName: 'Testperson',
      jobRoleIds: [],
      startDate: '2025-01-06T09:00:00.000Z',
      status: 'active',
      prefs,
    } satisfies Person);
  const user = (
    side: UserAccount['side'],
    clientId: string,
    personId: string | undefined,
    displayName: string,
    status: UserAccount['status'] = 'active',
  ): UserAccount =>
    put('users', {
      id: nid(),
      side,
      clientId,
      ...(personId ? { personId } : {}),
      email: `${displayName.toLowerCase()}${n}@example.test`,
      displayName,
      status,
      login: { method: side === 'staff' ? 'pin' : 'emailPassword', pinSet: side === 'staff' },
    } satisfies UserAccount);
  const assign = (userId: string, roleIds: string[], scope: Scope, more: Partial<RoleAssignment> = {}) =>
    put('roleAssignments', {
      id: nid(),
      userId,
      roleIds,
      scope,
      grants: [],
      denies: [],
      status: 'active',
      ...more,
    } satisfies RoleAssignment);
  const customRole = (clientId: string, updatedBy: string, name: string, permissionIds: string[]): Role =>
    put('roles', {
      id: nid(),
      owner: { clientId },
      name,
      description: name,
      colour: '#996633',
      permissionIds,
      system: false,
      version: 1,
      updatedBy,
      updatedAt: TODAY,
    } satisfies Role);
  const submission = (p: Person, uploadedBy: string, requirementId: string): EvidenceSubmission =>
    put('evidenceSubmissions', {
      id: nid(),
      clientId: p.clientId,
      siteId: p.primarySiteId,
      personId: p.id,
      requirementId,
      uploadedBy,
      fileAttachmentId: nid(),
      providerName: 'Test Training Ltd',
      completedAt: '2026-10-01T09:00:00.000Z',
      expiresAt: '2028-10-01T09:00:00.000Z',
      status: 'awaitingCheck',
      createdAt: '2026-10-15T09:00:00.000Z',
    } satisfies EvidenceSubmission);

  const a = keys.clients['littleAcorns'];
  const b = keys.clients['willowLane'];
  const ot = keys.clients['oakTree'];
  const requirementId = keys.requirements['safeguarding'];
  const mainSite = keys.sites['littleAcorns'];
  const u = keys.users;
  const p = keys.personas;
  const roleKey = (k: string): string => keys.roles[k]!;

  // Little Acorns: a second setting (outside Daniel's scope), a role manager, a billing viewer role, an assignment that
  // expires tomorrow and a suspended user.
  const annexe = put('sites', {
    id: nid(),
    clientId: a,
    name: 'Annexe',
    countryCode: 'GB',
    status: 'active',
    timezone: 'Europe/London',
  } satisfies Site);
  const mia = person(a, annexe.id, 'Mia');
  const roleManager = customRole(a, u['priya'], 'Role manager', ['staff.view', 'staff.manage', 'team.manageRoles']);
  const billingViewer = customRole(a, u['priya'], 'Billing viewer', ['billing.view']);
  const rory = user('client', a, undefined, 'Rory');
  assign(rory.id, [roleManager.id], { type: 'clients', ids: [a] });
  const tim = user('client', a, undefined, 'Tim');
  assign(
    tim.id,
    [roleKey('littleAcorns.groupAdmin')],
    { type: 'clients', ids: [a] },
    { expiresAt: '2026-10-20T00:00:00.000Z' },
  );
  const sue = user('client', a, undefined, 'Sue', 'suspended');
  const byDaniel = submission(
    seeded.people.find((x) => x.id === p['hannah'])!,
    u['daniel'],
    requirementId,
  );
  const aboutDaniel = submission(
    seeded.people.find((x) => x.id === p['daniel'])!,
    u['jade'],
    requirementId,
  );
  const otherSite = submission(mia, rory.id, requirementId);

  // Oak Tree: an Account Owner (the seed has a Group Admin and Site Managers only).
  const otOwnerPerson = person(ot, keys.sites['riverside'], 'Otowner');
  const otOwner = user('client', ot, otOwnerPerson.id, 'Otowner');
  assign(otOwner.id, [roleKey('oakTree.accountOwner')], { type: 'clients', ids: [ot] });

  // Willow Lane: one staff submission awaiting a check.
  const bobPerson = seeded.people.find((x) => x.id === p['joeBarlow'])!;
  const bobSubmission = submission(bobPerson, u['joeBarlow'], requirementId);

  // One client in each limited account state, each with an Account Owner and a staff member. The seed has no people
  // for these clients and none in the Deleted state at all, so the suite adds them.
  const stateOf = (key: string, state: Client['accountState']): StateClient => {
    let client = seeded.clients.find((c) => c.id === keys.clients[key]);
    if (!client) {
      client = put('clients', {
        id: nid(),
        displayName: `Test ${state}`,
        industryPackId: nurseryPack.id,
        packageId: packageIds.standard,
        accountState: state,
        createdAt: '2025-01-01T09:00:00.000Z',
        settings: clientSettingsSchema.parse({}),
        nameHistory: [],
      } satisfies Client);
    }
    const site = put('sites', {
      id: nid(),
      clientId: client.id,
      name: 'Main',
      countryCode: 'GB',
      status: 'active',
      timezone: 'Europe/London',
    } satisfies Site);
    const t = clientRoleTemplates.find((x) => x.key === 'accountOwner')!;
    const ownerPerson = person(client.id, site.id, 'Owner');
    const staffPerson = person(client.id, site.id, 'Staffer');
    const owner = user('client', client.id, ownerPerson.id, 'Owner');
    const staff = user('staff', client.id, staffPerson.id, 'Staffer');
    const role = put('roles', {
      id: nid(),
      owner: { clientId: client.id },
      name: t.name,
      description: t.name,
      colour: '#336699',
      permissionIds: compileClientRole(t.levels, t.allows),
      system: true,
      systemKey: 'accountOwner',
      version: 1,
      clientLevels: t.levels,
      clientAllows: t.allows,
      updatedBy: owner.id,
      updatedAt: TODAY,
    } satisfies Role);
    assign(owner.id, [role.id], { type: 'clients', ids: [client.id] });
    return { client, site, owner, staff, ownerPerson, staffPerson };
  };
  const stateClients = {
    readOnly: stateOf('littleStars', 'readOnly'),
    closed: stateOf('meadowview', 'closed'),
    paused: stateOf('pebbles', 'paused'),
    deleted: stateOf('deleted', 'deleted'),
  };

  for (const [store, records] of Object.entries(extra)) {
    await admin.bulkPut(store as Parameters<DemoAdmin['bulkPut']>[0], records);
  }
  const data = (await admin.dumpAll()) as unknown as WorldData;

  const first = <K extends keyof WorldData>(
    store: K,
    pred: (r: WorldData[K][number]) => boolean,
  ): WorldData[K][number] => {
    const hit = (data[store] as WorldData[K][number][]).find(pred);
    if (!hit) throw new Error(`Contract world: no match in ${store}`);
    return hit;
  };
  const assignmentOf = (userId: string): string => first('roleAssignments', (r) => r.userId === userId).id;

  const ids = {
    requirementId,
    addOnId: TEST_ADD_ON.id,
    clients: {
      a,
      b,
      ot,
      readOnly: stateClients.readOnly.client.id,
      closed: stateClients.closed.client.id,
      paused: stateClients.paused.client.id,
      deleted: stateClients.deleted.client.id,
    },
    sites: {
      main: mainSite,
      annexe: annexe.id,
      river: keys.sites['riverside'],
      hillside: keys.sites['hillside'],
      meadow: keys.sites['meadow'],
      willow: keys.sites['willowLane'],
    },
    people: {
      priya: p['priya'],
      daniel: p['daniel'],
      jade: p['jade'],
      hannah: p['hannah'],
      ben: p['ben'],
      mia: mia.id,
      bank: p['bankPractitioner'],
      otRiver: p['oscarFrost'],
      otHillside: p['maeveDoyle'],
      otMeadow: p['tobyAshby'],
      beth: p['gemmaHolt'],
      bob: p['joeBarlow'],
    },
    users: {
      priya: u['priya'],
      daniel: u['daniel'],
      jade: u['jade'],
      ben: u['ben'],
      gina: u['oakTreeGroupAdmin'],
      otOwner: otOwner.id,
      rory: rory.id,
      riverMgr: u['riversideManager'],
      meadowMgr: u['meadowManager'],
      tim: tim.id,
      sue: sue.id,
      beth: u['willowLaneOwner'],
      bob: u['joeBarlow'],
      provOwner: u['providerOwner'],
      support: u['sophie'],
      tom: u['tom'],
    },
    roles: {
      aOwner: roleKey('littleAcorns.accountOwner'),
      billingViewer: billingViewer.id,
      supervisor: roleKey('littleAcorns.supervisor'),
      bOwner: roleKey('willowLane.accountOwner'),
    },
    assignments: {
      priya: assignmentOf(u['priya']),
      daniel: assignmentOf(u['daniel']),
      rory: assignmentOf(rory.id),
      bBeth: assignmentOf(u['willowLaneOwner']),
    },
    evidence: {
      jade: first('evidence', (e) => e.personId === p['jade']).id,
      hannah: first('evidence', (e) => e.personId === p['hannah']).id,
      bob: first('evidence', (e) => e.clientId === b).id,
    },
    submissions: {
      ben: keys.submissions['ben'],
      byDaniel: byDaniel.id,
      otherSite: otherSite.id,
      aboutDaniel: aboutDaniel.id,
      bob: bobSubmission.id,
    },
    stateClients,
  };

  /** Which client owns a record (undefined for global records such as packages and pack requirements). */
  const tenantOf = (store: string, record: Record<string, unknown>): string | undefined => {
    if (store === 'clients') return record['id'] as string;
    if (store === 'roles') {
      const owner = record['owner'] as 'provider' | { clientId: string };
      return owner === 'provider' ? undefined : owner.clientId;
    }
    if (store === 'roleAssignments') {
      return data.users.find((x) => x.id === record['userId'])?.clientId;
    }
    return record['clientId'] as string | undefined;
  };

  return { keys, data, ids, tenantOf };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

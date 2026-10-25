// Hand-built fixture for the contract suite (plan chunk 7). Six clients, one provider team, all fictional.
// Chunk 8 replaces this with the seed. Ids are fixed 26-character Crockford strings, so every run is identical.
import {
  clientRoleTemplates,
  clientSettingsSchema,
  compileClientRole,
  providerRoleTemplates,
  type AddOn,
  type AddOnSubscription,
  type Client,
  type Entitlements,
  type Evidence,
  type EvidenceSubmission,
  type JobRole,
  type LearnerPrefs,
  type Package,
  type PaymentAttempt,
  type Person,
  type Requirement,
  type Role,
  type RoleAssignment,
  type Scope,
  type Site,
  type Subscription,
  type Team,
  type UserAccount,
} from '@sta/domain';

export const TODAY = '2026-10-19T09:00:00.000Z';

/** A valid ULID-shaped id from a number. */
export const id = (n: number): string => String(n).padStart(26, '0');
/** Ids for records a test creates itself (never collide with the fixture). */
export const freshId = (n: number): string => id(900_000 + n);

const prefs: LearnerPrefs = {
  hideFromLeaderboards: false,
  simpleView: false,
  textScale: 1,
  uiScale: 1,
  contrast: 'standard',
  colourMode: 'auto',
  reduceMotion: false,
  sound: true,
  haptics: true,
  readingFont: 'default',
  biggerButtons: false,
  language: 'en-GB',
  battleExtraTimePercent: 0,
};

const ents = (customClientRoles: number | 'unlimited'): Entitlements => ({
  ownModules: 5,
  savedThemes: 1,
  admins: 3,
  autoAssignRules: 1,
  liveCompetitions: 1,
  customClientRoles,
  closedBookCompetitions: false,
  multiSite: true,
  logoBranding: false,
  perSiteThemes: false,
  integrations: false,
  responseTargetHours: 48,
  battlesPerMonth: 2,
  maxBattlePlayers: 6,
  crossSiteBattles: false,
});

type Data = {
  clients: Client[];
  sites: Site[];
  teams: Team[];
  people: Person[];
  users: UserAccount[];
  jobRoles: JobRole[];
  requirements: Requirement[];
  evidence: Evidence[];
  evidenceSubmissions: EvidenceSubmission[];
  roles: Role[];
  roleAssignments: RoleAssignment[];
  packages: Package[];
  addOns: AddOn[];
  subscriptions: Subscription[];
  addOnSubscriptions: AddOnSubscription[];
  paymentAttempts: PaymentAttempt[];
};

export type ClientKey = 'a' | 'b' | 'readOnly' | 'closed' | 'paused' | 'deleted';

export function buildFixture() {
  let n = 0;
  const nid = (): string => id(++n);
  const d: Data = {
    clients: [],
    sites: [],
    teams: [],
    people: [],
    users: [],
    jobRoles: [],
    requirements: [],
    evidence: [],
    evidenceSubmissions: [],
    roles: [],
    roleAssignments: [],
    packages: [],
    addOns: [],
    subscriptions: [],
    addOnSubscriptions: [],
    paymentAttempts: [],
  };

  const packId = nid();
  const pkgUnlimited = nid();
  const pkgNoCustomRoles = nid();
  const addOnId = nid();
  const reqId = nid();
  d.packages.push(
    {
      id: pkgUnlimited,
      name: 'Test unlimited',
      option: 'A',
      bands: [{ maxStaff: 15, pricePerSite: 1000 }],
      entitlements: ents('unlimited'),
    },
    {
      id: pkgNoCustomRoles,
      name: 'Test none',
      option: 'A',
      bands: [{ maxStaff: 15, pricePerSite: 500 }],
      entitlements: ents(0),
    },
  );
  d.addOns.push({
    id: addOnId,
    name: 'Test extra role',
    pricing: { kind: 'flat', price: 100 },
    adds: { customClientRoles: 1 },
  });
  d.jobRoles.push({ id: nid(), packId, name: 'Practitioner' });
  d.requirements.push({
    id: reqId,
    packId,
    name: 'Safeguarding',
    appliesTo: { all: true },
    renewEveryMonths: 24,
    evidence: ['external'],
    satisfiedByModuleIds: [],
    acceptsExternal: true,
    acceptedProviders: [],
    expiryMode: 'fromCertificate',
    approverChecklist: [],
  });

  const person = (clientId: string, siteId: string, firstName: string, extra: Partial<Person> = {}): Person => ({
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
    ...extra,
  });
  const user = (
    side: UserAccount['side'],
    clientId: string | undefined,
    personId: string | undefined,
    displayName: string,
    status: UserAccount['status'] = 'active',
  ): UserAccount => ({
    id: nid(),
    side,
    ...(clientId ? { clientId } : {}),
    ...(personId ? { personId } : {}),
    email: `${displayName.toLowerCase()}${n}@example.test`,
    displayName,
    status,
    login: { method: side === 'staff' ? 'pin' : 'emailPassword', pinSet: side === 'staff' },
  });
  const clientRole = (clientId: string, key: (typeof clientRoleTemplates)[number]['key']): Role => {
    const t = clientRoleTemplates.find((x) => x.key === key)!;
    return {
      id: nid(),
      owner: { clientId },
      name: t.name,
      description: t.name,
      colour: '#336699',
      permissionIds: compileClientRole(t.levels, t.allows),
      system: true,
      version: 1,
      clientLevels: t.levels,
      clientAllows: t.allows,
      updatedBy: id(1),
      updatedAt: TODAY,
    };
  };
  const customRole = (clientId: string, name: string, permissionIds: string[]): Role => ({
    id: nid(),
    owner: { clientId },
    name,
    description: name,
    colour: '#996633',
    permissionIds,
    system: false,
    version: 1,
    updatedBy: id(1),
    updatedAt: TODAY,
  });
  const assign = (
    userId: string,
    roleIds: string[],
    scope: Scope,
    extra: Partial<RoleAssignment> = {},
  ): RoleAssignment => ({
    id: nid(),
    userId,
    roleIds,
    scope,
    grants: [],
    denies: [],
    status: 'active',
    ...extra,
  });
  const client = (key: string, state: Client['accountState'], packageId: string): Client => ({
    id: nid(),
    displayName: `Test ${key}`,
    industryPackId: packId,
    packageId,
    accountState: state,
    createdAt: '2025-01-01T09:00:00.000Z',
    settings: clientSettingsSchema.parse({}),
    nameHistory: [],
  });
  const subscription = (c: Client): Subscription => ({
    clientId: c.id,
    packageId: c.packageId,
    period: 'monthly',
    renewalAt: '2027-01-01T09:00:00.000Z',
    state: c.accountState,
    stateSince: '2026-10-14T09:00:00.000Z',
    billingContact: 'billing@example.test',
  });
  const site = (clientId: string, name: string): Site => ({
    id: nid(),
    clientId,
    name,
    countryCode: 'GB',
    status: 'active',
    timezone: 'Europe/London',
  });
  const ownerAssignment = (clientId: string, userId: string, roleId: string) =>
    assign(userId, [roleId], { type: 'clients', ids: [clientId] });

  // Client A: the main tenant (two sites, every role we test).
  const a = client('A', 'active', pkgUnlimited);
  const aRiver = site(a.id, 'Riverside');
  const aMeadow = site(a.id, 'Meadow');
  d.clients.push(a);
  d.sites.push(aRiver, aMeadow);
  d.teams.push(
    { id: nid(), clientId: a.id, siteId: aRiver.id, name: 'Baby room' },
    { id: nid(), clientId: a.id, siteId: aMeadow.id, name: 'Toddler room' },
  );
  const aRoles = {
    owner: clientRole(a.id, 'accountOwner'),
    groupAdmin: clientRole(a.id, 'groupAdmin'),
    siteManager: clientRole(a.id, 'siteManager'),
    supervisor: clientRole(a.id, 'supervisor'),
    roleManager: customRole(a.id, 'Role manager', ['staff.view', 'staff.manage', 'team.manageRoles']),
    billingViewer: customRole(a.id, 'Billing viewer', ['billing.view']),
  };
  d.roles.push(...Object.values(aRoles));
  const pPriya = person(a.id, aRiver.id, 'Priya');
  const pDaniel = person(a.id, aRiver.id, 'Daniel');
  const pJade = person(a.id, aRiver.id, 'Jade');
  const pHannah = person(a.id, aRiver.id, 'Hannah');
  const pBen = person(a.id, aRiver.id, 'Ben');
  const pGina = person(a.id, aRiver.id, 'Gina');
  const pRory = person(a.id, aRiver.id, 'Rory');
  const pRiverMgr = person(a.id, aRiver.id, 'Riverside manager');
  const pMeadowMgr = person(a.id, aMeadow.id, 'Meadow manager');
  const pMia = person(a.id, aMeadow.id, 'Mia');
  const pBank = person(a.id, aRiver.id, 'Bank', { additionalSiteIds: [aMeadow.id] });
  const pTim = person(a.id, aRiver.id, 'Tim');
  const pSue = person(a.id, aRiver.id, 'Sue');
  d.people.push(pPriya, pDaniel, pJade, pHannah, pBen, pGina, pRory, pRiverMgr, pMeadowMgr, pMia, pBank, pTim, pSue);
  const uPriya = user('client', a.id, pPriya.id, 'Priya');
  const uDaniel = user('client', a.id, pDaniel.id, 'Daniel');
  const uJade = user('staff', a.id, pJade.id, 'Jade');
  const uBen = user('staff', a.id, pBen.id, 'Ben');
  const uGina = user('client', a.id, pGina.id, 'Gina');
  const uRory = user('client', a.id, pRory.id, 'Rory');
  const uRiverMgr = user('client', a.id, pRiverMgr.id, 'RiversideManager');
  const uMeadowMgr = user('client', a.id, pMeadowMgr.id, 'MeadowManager');
  const uTim = user('client', a.id, pTim.id, 'Tim');
  const uSue = user('client', a.id, pSue.id, 'Sue', 'suspended');
  d.users.push(uPriya, uDaniel, uJade, uBen, uGina, uRory, uRiverMgr, uMeadowMgr, uTim, uSue);
  const aAssign = {
    priya: ownerAssignment(a.id, uPriya.id, aRoles.owner.id),
    daniel: assign(uDaniel.id, [aRoles.supervisor.id], { type: 'sites', ids: [aRiver.id] }),
    gina: ownerAssignment(a.id, uGina.id, aRoles.groupAdmin.id),
    rory: ownerAssignment(a.id, uRory.id, aRoles.roleManager.id),
    riverMgr: assign(uRiverMgr.id, [aRoles.siteManager.id], { type: 'sites', ids: [aRiver.id] }),
    meadowMgr: assign(uMeadowMgr.id, [aRoles.siteManager.id], { type: 'sites', ids: [aMeadow.id] }),
    // Tim's access ends the day after TODAY, so the injected clock decides whether it works.
    tim: ownerAssignment(a.id, uTim.id, aRoles.groupAdmin.id),
  };
  aAssign.tim.expiresAt = '2026-10-20T00:00:00.000Z';
  d.roleAssignments.push(...Object.values(aAssign));
  d.subscriptions.push(subscription(a));
  d.paymentAttempts.push({
    id: nid(),
    clientId: a.id,
    invoiceId: nid(),
    at: '2026-10-01T09:00:00.000Z',
    result: 'success',
  });
  const ev = (p: Person, siteId: string): Evidence => ({
    id: nid(),
    clientId: p.clientId,
    personId: p.id,
    requirementId: reqId,
    kind: 'external',
    completedAt: '2025-06-01T09:00:00.000Z',
    expiresAt: '2027-06-01T09:00:00.000Z',
    siteIdAtTime: siteId,
  });
  const eJade = ev(pJade, aRiver.id);
  const eHannah = ev(pHannah, aRiver.id);
  d.evidence.push(eJade, eHannah);
  const sub = (p: Person, siteId: string, uploadedBy: string): EvidenceSubmission => ({
    id: nid(),
    clientId: p.clientId,
    siteId,
    personId: p.id,
    requirementId: reqId,
    uploadedBy,
    fileAttachmentId: nid(),
    providerName: 'Test Training Ltd',
    completedAt: '2026-10-01T09:00:00.000Z',
    expiresAt: '2028-10-01T09:00:00.000Z',
    status: 'awaitingCheck',
    createdAt: '2026-10-15T09:00:00.000Z',
  });
  const sBen = sub(pBen, aRiver.id, uBen.id); // Daniel can approve this one
  const sByDaniel = sub(pHannah, aRiver.id, uDaniel.id); // Daniel's own upload
  const sOtherSite = sub(pMia, aMeadow.id, uMeadowMgr.id); // outside Daniel's site
  const sAboutDaniel = sub(pDaniel, aRiver.id, uJade.id); // about Daniel
  d.evidenceSubmissions.push(sBen, sByDaniel, sOtherSite, sAboutDaniel);

  // Client B: another tenant that must never leak into A.
  const b = client('B', 'active', pkgNoCustomRoles);
  const bSite = site(b.id, 'Hillside');
  d.clients.push(b);
  d.sites.push(bSite);
  d.teams.push({ id: nid(), clientId: b.id, siteId: bSite.id, name: 'Kitchen' });
  const bOwnerRole = clientRole(b.id, 'accountOwner');
  d.roles.push(bOwnerRole);
  const pBeth = person(b.id, bSite.id, 'Beth');
  const pBob = person(b.id, bSite.id, 'Bob');
  d.people.push(pBeth, pBob);
  const uBeth = user('client', b.id, pBeth.id, 'Beth');
  const uBob = user('staff', b.id, pBob.id, 'Bob');
  d.users.push(uBeth, uBob);
  const bAssign = ownerAssignment(b.id, uBeth.id, bOwnerRole.id);
  d.roleAssignments.push(bAssign);
  d.subscriptions.push(subscription(b));
  d.addOnSubscriptions.push({ clientId: b.id, addOnId, status: 'off', usageThisPeriod: 0 });
  d.paymentAttempts.push({
    id: nid(),
    clientId: b.id,
    invoiceId: nid(),
    at: '2026-10-02T09:00:00.000Z',
    result: 'success',
  });
  const eBob = ev(pBob, bSite.id);
  d.evidence.push(eBob);
  const sBob = sub(pBob, bSite.id, uBob.id);
  d.evidenceSubmissions.push(sBob);

  // One small client per account state, each with an Account Owner and a staff member.
  const stateClients = {} as Record<
    'readOnly' | 'closed' | 'paused' | 'deleted',
    { client: Client; site: Site; owner: UserAccount; staff: UserAccount; staffPerson: Person; ownerPerson: Person }
  >;
  for (const state of ['readOnly', 'closed', 'paused', 'deleted'] as const) {
    const c = client(state, state, pkgUnlimited);
    const s = site(c.id, 'Main');
    const role = clientRole(c.id, 'accountOwner');
    const ownerPerson = person(c.id, s.id, 'Owner');
    const staffPerson = person(c.id, s.id, 'Staffer');
    const owner = user('client', c.id, ownerPerson.id, 'Owner');
    const staff = user('staff', c.id, staffPerson.id, 'Staffer');
    d.clients.push(c);
    d.sites.push(s);
    d.roles.push(role);
    d.people.push(ownerPerson, staffPerson);
    d.users.push(owner, staff);
    d.roleAssignments.push(ownerAssignment(c.id, owner.id, role.id));
    d.subscriptions.push(subscription(c));
    stateClients[state] = { client: c, site: s, owner, staff, staffPerson, ownerPerson };
  }

  // Provider team.
  const providerRole = (key: string): Role => {
    const t = providerRoleTemplates.find((x) => x.key === key)!;
    return {
      id: nid(),
      owner: 'provider',
      name: t.name,
      description: t.description,
      colour: '#663399',
      permissionIds: t.permissionIds,
      system: true,
      version: 1,
      updatedBy: id(1),
      updatedAt: TODAY,
    };
  };
  const rOwner = providerRole('owner');
  const rSupport = providerRole('support');
  const rReadOnly = providerRole('readOnly');
  d.roles.push(rOwner, rSupport, rReadOnly);
  const uProvOwner = user('provider', undefined, undefined, 'Owner');
  const uSupport = user('provider', undefined, undefined, 'Sophie');
  const uTom = user('provider', undefined, undefined, 'Tom');
  d.users.push(uProvOwner, uSupport, uTom);
  d.roleAssignments.push(
    assign(uProvOwner.id, [rOwner.id], { type: 'all' }),
    assign(uSupport.id, [rSupport.id], { type: 'all' }),
    assign(uTom.id, [rReadOnly.id], { type: 'all' }),
  );

  const ids = {
    packId,
    requirementId: reqId,
    addOnId,
    clients: {
      a: a.id,
      b: b.id,
      readOnly: stateClients.readOnly.client.id,
      closed: stateClients.closed.client.id,
      paused: stateClients.paused.client.id,
      deleted: stateClients.deleted.client.id,
    },
    sites: { river: aRiver.id, meadow: aMeadow.id, hillside: bSite.id },
    people: {
      priya: pPriya.id,
      daniel: pDaniel.id,
      jade: pJade.id,
      hannah: pHannah.id,
      ben: pBen.id,
      mia: pMia.id,
      bank: pBank.id,
      beth: pBeth.id,
      bob: pBob.id,
    },
    users: {
      priya: uPriya.id,
      daniel: uDaniel.id,
      jade: uJade.id,
      ben: uBen.id,
      gina: uGina.id,
      rory: uRory.id,
      riverMgr: uRiverMgr.id,
      meadowMgr: uMeadowMgr.id,
      tim: uTim.id,
      sue: uSue.id,
      beth: uBeth.id,
      bob: uBob.id,
      provOwner: uProvOwner.id,
      support: uSupport.id,
      tom: uTom.id,
    },
    roles: {
      aOwner: aRoles.owner.id,
      billingViewer: aRoles.billingViewer.id,
      supervisor: aRoles.supervisor.id,
      bOwner: bOwnerRole.id,
    },
    assignments: {
      priya: aAssign.priya.id,
      daniel: aAssign.daniel.id,
      rory: aAssign.rory.id,
      bBeth: bAssign.id,
    },
    evidence: { jade: eJade.id, hannah: eHannah.id, bob: eBob.id },
    submissions: {
      ben: sBen.id,
      byDaniel: sByDaniel.id,
      otherSite: sOtherSite.id,
      aboutDaniel: sAboutDaniel.id,
      bob: sBob.id,
    },
    stateClients,
  };

  /** Which client owns a fixture record (undefined for global records such as packages and pack requirements). */
  const tenantOf = (store: keyof Data, record: Record<string, unknown>): string | undefined => {
    if (store === 'clients') return record['id'] as string;
    if (store === 'roles') {
      const owner = record['owner'] as 'provider' | { clientId: string };
      return owner === 'provider' ? undefined : owner.clientId;
    }
    if (store === 'roleAssignments') return d.users.find((u) => u.id === record['userId'])?.clientId;
    return record['clientId'] as string | undefined;
  };

  return { data: d, ids, tenantOf };
}

export type Fixture = ReturnType<typeof buildFixture>;
export type FixtureStoreName = keyof Data;

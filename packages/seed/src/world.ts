// The M0 seed world (build pack 7, scoped by plan Assumption 1). Pure: no store, no clock reads, no Math.random.
// Every section draws from its own forked RNG stream, so adding data to one section never moves another.
import { addOns, allPacks, nurseryPack, packageIds, packages } from '@sta/content';
import {
  addDays,
  addMonths,
  clientRoleTemplates,
  clientSettingsSchema,
  compileClientRole,
  createRng,
  daysBetween,
  fixedClock,
  mondayOfWeek,
  providerRoleTemplates,
  startOfLondonDay,
  ulid,
  type AccountState,
  type AddOnSubscription,
  type Client,
  type Clock,
  type Evidence,
  type EvidenceSubmission,
  type JobRole,
  type LearnerPrefs,
  type PaymentAttempt,
  type Person,
  type Requirement,
  type Rng,
  type Role,
  type RoleAssignment,
  type Scope,
  type SeedMeta,
  type Site,
  type Subscription,
  type Team,
  type UserAccount,
} from '@sta/domain';

/** Well-known keys are declared properties, so reading one gives a string; any other key is looked up by index. */
type KeyMap<K extends string> = Record<K, string> & Record<string, string>;

type LittleAcornsKey =
  | 'priya'
  | 'daniel'
  | 'jade'
  | 'maureen'
  | 'sam'
  | 'ellie'
  | 'hannah'
  | 'chris'
  | 'lucy'
  | 'mark'
  | 'kasia'
  | 'grace'
  | 'ben'
  | 'amira'
  | 'olivia';

export type SeedKeys = {
  clients: KeyMap<
    | 'littleAcorns'
    | 'oakTree'
    | 'willowLane'
    | 'maisonElvaro'
    | 'brookfield'
    | 'rosewood'
    | 'harbourCafe'
    | 'atelierVasquine'
    | 'summitBuilders'
    | 'sunnyDays'
    | 'littleStars'
    | 'meadowview'
    | 'pebbles'
  >;
  sites: KeyMap<'littleAcorns' | 'riverside' | 'hillside' | 'meadow' | 'willowLane'>;
  personas: KeyMap<
    LittleAcornsKey | 'bankPractitioner' | 'oscarFrost' | 'maeveDoyle' | 'tobyAshby' | 'gemmaHolt' | 'joeBarlow'
  >;
  users: KeyMap<
    | LittleAcornsKey
    | 'providerOwner'
    | 'sophie'
    | 'raj'
    | 'megan'
    | 'tom'
    | 'oakTreeGroupAdmin'
    | 'riversideManager'
    | 'hillsideManager'
    | 'meadowManager'
    | 'willowLaneOwner'
    | 'joeBarlow'
  >;
  requirements: KeyMap<'safeguarding' | 'paediatricFirstAid' | 'foodHygiene' | 'whatChanged' | 'newStarterInduction'>;
  submissions: KeyMap<'ben'>;
  /** `${clientKey}.${roleKey}`, for example `littleAcorns.accountOwner`, and `provider.owner`. */
  roles: Record<string, string>;
};

export type SeedData = {
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
  packages: typeof packages;
  addOns: typeof addOns;
  subscriptions: Subscription[];
  addOnSubscriptions: AddOnSubscription[];
  paymentAttempts: PaymentAttempt[];
};

const iso = (d: Date): string => d.toISOString();
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const BASE_PREFS: LearnerPrefs = {
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

const ROLE_COLOURS: Record<string, string> = {
  accountOwner: '#1f5f3f',
  groupAdmin: '#2a4f8f',
  siteManager: '#7a4a1f',
  supervisor: '#5a3a7a',
  trainer: '#8a3a4a',
  viewer: '#4a4a4a',
};

type ClientRoleKey = (typeof clientRoleTemplates)[number]['key'];

type PersonSpec = {
  key: string;
  first: string;
  last: string;
  jobRoles: string[];
  team?: string;
  site?: string;
  extraSites?: string[];
  status?: Person['status'];
  startDaysAgo?: number;
  leftMonthsAgo?: number;
  prefs?: Partial<LearnerPrefs>;
  admin?: { role: ClientRoleKey; scope: 'clients' | 'site' };
  userKey?: string;
};

type SiteSpec = { key: string; name: string; region: string; teams: string[]; compliance?: number };

type ClientSpec = {
  key: string;
  sites: SiteSpec[];
  people: PersonSpec[];
  ownerKey: string;
};

type Built = { people: Person[]; spec: ClientSpec; clientId: string; siteIds: Record<string, string> };

const CLIENTS: {
  key: string;
  name: string;
  pack: string;
  pkg: string;
  state: AccountState;
  sinceDaysAgo: number;
  trialEndsInDays?: number;
}[] = [
  {
    key: 'littleAcorns',
    name: 'Little Acorns Nursery',
    pack: nurseryPack.name,
    pkg: packageIds.standard,
    state: 'active',
    sinceDaysAgo: 200,
  },
  {
    key: 'oakTree',
    name: 'Oak Tree Nurseries',
    pack: nurseryPack.name,
    pkg: packageIds.group,
    state: 'active',
    sinceDaysAgo: 300,
  },
  {
    key: 'willowLane',
    name: 'Willow Lane Nursery',
    pack: nurseryPack.name,
    pkg: packageIds.essentials,
    state: 'pastDue',
    sinceDaysAgo: 10,
  },
  {
    key: 'maisonElvaro',
    name: 'Maison Elvaro',
    pack: 'Luxury retail',
    pkg: packageIds.group,
    state: 'active',
    sinceDaysAgo: 120,
  },
  {
    key: 'brookfield',
    name: 'Brookfield Primary School',
    pack: 'Schools',
    pkg: packageIds.standard,
    state: 'active',
    sinceDaysAgo: 250,
  },
  {
    key: 'rosewood',
    name: 'Rosewood Care Home',
    pack: 'Social care',
    pkg: packageIds.standard,
    state: 'trial',
    sinceDaysAgo: 12,
    trialEndsInDays: 18,
  },
  {
    key: 'harbourCafe',
    name: 'Harbour Cafe Group',
    pack: 'Hospitality',
    pkg: packageIds.group,
    state: 'active',
    sinceDaysAgo: 400,
  },
  {
    key: 'atelierVasquine',
    name: 'Atelier Vasquine',
    pack: 'Luxury retail',
    pkg: packageIds.standard,
    state: 'trial',
    sinceDaysAgo: 5,
    trialEndsInDays: 25,
  },
  {
    key: 'summitBuilders',
    name: 'Summit Builders',
    pack: 'Construction',
    pkg: packageIds.essentials,
    state: 'active',
    sinceDaysAgo: 150,
  },
  {
    key: 'sunnyDays',
    name: 'Sunny Days Pre-school',
    pack: nurseryPack.name,
    pkg: packageIds.essentials,
    state: 'limited',
    sinceDaysAgo: 5,
  },
  {
    key: 'littleStars',
    name: 'Little Stars Day Nursery',
    pack: nurseryPack.name,
    pkg: packageIds.essentials,
    state: 'readOnly',
    sinceDaysAgo: 9,
  },
  {
    key: 'meadowview',
    name: 'Meadowview Nursery',
    pack: nurseryPack.name,
    pkg: packageIds.essentials,
    state: 'closed',
    sinceDaysAgo: 50,
  },
  {
    key: 'pebbles',
    name: 'Pebbles Childcare',
    pack: nurseryPack.name,
    pkg: packageIds.standard,
    state: 'paused',
    sinceDaysAgo: 20,
  },
];

const LITTLE_ACORNS: ClientSpec = {
  key: 'littleAcorns',
  ownerKey: 'priya',
  sites: [
    {
      key: 'littleAcorns',
      name: 'Little Acorns',
      region: 'South East',
      teams: ['Baby room', 'Toddler room', 'Pre-school room', 'Kitchen'],
    },
  ],
  people: [
    {
      key: 'priya',
      first: 'Priya',
      last: 'Shah',
      jobRoles: ['Nursery Manager'],
      admin: { role: 'accountOwner', scope: 'clients' },
    },
    {
      key: 'daniel',
      first: 'Daniel',
      last: 'Hughes',
      jobRoles: ['Deputy Manager', 'Designated Safeguarding Lead'],
      admin: { role: 'supervisor', scope: 'site' },
    },
    { key: 'jade', first: 'Jade', last: 'Mills', jobRoles: ['Room Leader'], team: 'Toddler room' },
    {
      key: 'maureen',
      first: 'Maureen',
      last: 'Clarke',
      jobRoles: ['Cook'],
      team: 'Kitchen',
      prefs: { simpleView: true, textScale: 1.5 },
    },
    { key: 'sam', first: 'Sam', last: 'Okafor', jobRoles: ['Practitioner'], team: 'Baby room', startDaysAgo: 10 },
    { key: 'ellie', first: 'Ellie', last: 'Brown', jobRoles: ['Apprentice'], team: 'Toddler room' },
    { key: 'hannah', first: 'Hannah', last: 'Patel', jobRoles: ['Room Leader'], team: 'Baby room' },
    { key: 'chris', first: 'Chris', last: 'Wood', jobRoles: ['Practitioner'], team: 'Pre-school room' },
    { key: 'lucy', first: 'Lucy', last: 'Evans', jobRoles: ['Practitioner'], team: 'Toddler room' },
    { key: 'mark', first: 'Mark', last: 'Taylor', jobRoles: ['Room Leader'], team: 'Pre-school room' },
    {
      key: 'kasia',
      first: 'Kasia',
      last: 'Nowak',
      jobRoles: ['Practitioner'],
      team: 'Baby room',
      prefs: { language: 'pl-PL' },
    },
    { key: 'grace', first: 'Grace', last: 'Lee', jobRoles: ['Practitioner'], team: 'Toddler room', status: 'onLeave' },
    { key: 'ben', first: 'Ben', last: 'Carter', jobRoles: ['Bank Practitioner'] },
    { key: 'amira', first: 'Amira', last: 'Hassan', jobRoles: ['Practitioner'], team: 'Pre-school room' },
    {
      key: 'olivia',
      first: 'Olivia',
      last: 'Grant',
      jobRoles: ['Practitioner'],
      team: 'Baby room',
      status: 'archived',
      leftMonthsAgo: 2,
    },
  ],
};

const OAK_TREE: ClientSpec = {
  key: 'oakTree',
  ownerKey: 'oakTreeGroupAdmin',
  sites: [
    {
      key: 'riverside',
      name: 'Riverside',
      region: 'South East',
      teams: ['Baby room', 'Toddler room'],
      compliance: 0.95,
    },
    {
      key: 'hillside',
      name: 'Hillside',
      region: 'South East',
      teams: ['Baby room', 'Pre-school room'],
      compliance: 0.8,
    },
    { key: 'meadow', name: 'Meadow', region: 'South West', teams: ['Mixed room'], compliance: 0.55 },
  ],
  people: [
    {
      key: 'fionaMarsh',
      userKey: 'oakTreeGroupAdmin',
      first: 'Fiona',
      last: 'Marsh',
      jobRoles: ['Nursery Manager'],
      site: 'riverside',
      admin: { role: 'groupAdmin', scope: 'clients' },
    },
    {
      key: 'tariqRahman',
      userKey: 'riversideManager',
      first: 'Tariq',
      last: 'Rahman',
      jobRoles: ['Nursery Manager'],
      site: 'riverside',
      admin: { role: 'siteManager', scope: 'site' },
    },
    {
      key: 'bankPractitioner',
      first: 'Nadia',
      last: 'Bell',
      jobRoles: ['Bank Practitioner'],
      site: 'riverside',
      extraSites: ['meadow'],
    },
    {
      key: 'oscarFrost',
      first: 'Oscar',
      last: 'Frost',
      jobRoles: ['Room Leader'],
      site: 'riverside',
      team: 'Baby room',
    },
    {
      key: 'priyaNair',
      first: 'Anita',
      last: 'Nair',
      jobRoles: ['Practitioner'],
      site: 'riverside',
      team: 'Toddler room',
    },
    {
      key: 'leoWright',
      first: 'Leo',
      last: 'Wright',
      jobRoles: ['Practitioner'],
      site: 'riverside',
      team: 'Toddler room',
    },
    {
      key: 'colinReeve',
      userKey: 'hillsideManager',
      first: 'Colin',
      last: 'Reeve',
      jobRoles: ['Nursery Manager'],
      site: 'hillside',
      admin: { role: 'siteManager', scope: 'site' },
    },
    {
      key: 'maeveDoyle',
      first: 'Maeve',
      last: 'Doyle',
      jobRoles: ['Room Leader'],
      site: 'hillside',
      team: 'Baby room',
    },
    {
      key: 'imranKhalid',
      first: 'Imran',
      last: 'Khalid',
      jobRoles: ['Practitioner'],
      site: 'hillside',
      team: 'Baby room',
    },
    {
      key: 'sophieGale',
      first: 'Hettie',
      last: 'Gale',
      jobRoles: ['Practitioner'],
      site: 'hillside',
      team: 'Pre-school room',
    },
    {
      key: 'dylanPark',
      first: 'Dylan',
      last: 'Park',
      jobRoles: ['Apprentice'],
      site: 'hillside',
      team: 'Pre-school room',
    },
    {
      key: 'rosaDelgado',
      userKey: 'meadowManager',
      first: 'Rosa',
      last: 'Delgado',
      jobRoles: ['Nursery Manager'],
      site: 'meadow',
      admin: { role: 'siteManager', scope: 'site' },
    },
    { key: 'tobyAshby', first: 'Toby', last: 'Ashby', jobRoles: ['Room Leader'], site: 'meadow', team: 'Mixed room' },
    {
      key: 'yasminOkoye',
      first: 'Yasmin',
      last: 'Okoye',
      jobRoles: ['Practitioner'],
      site: 'meadow',
      team: 'Mixed room',
    },
    { key: 'henryLowe', first: 'Henry', last: 'Lowe', jobRoles: ['Cook'], site: 'meadow', team: 'Mixed room' },
  ],
};

const WILLOW_LANE: ClientSpec = {
  key: 'willowLane',
  ownerKey: 'willowLaneOwner',
  sites: [
    {
      key: 'willowLane',
      name: 'Willow Lane',
      region: 'North West',
      teams: ['Baby room', 'Toddler room'],
      compliance: 0.85,
    },
  ],
  people: [
    {
      key: 'gemmaHolt',
      userKey: 'willowLaneOwner',
      first: 'Gemma',
      last: 'Holt',
      jobRoles: ['Nursery Manager'],
      admin: { role: 'accountOwner', scope: 'clients' },
    },
    { key: 'ravinSingh', first: 'Ravi', last: 'Singh', jobRoles: ['Deputy Manager'], team: 'Toddler room' },
    { key: 'edithPryce', first: 'Edith', last: 'Pryce', jobRoles: ['Room Leader'], team: 'Baby room' },
    { key: 'joeBarlow', first: 'Joe', last: 'Barlow', jobRoles: ['Practitioner'], team: 'Baby room' },
    { key: 'zainabAli', first: 'Zainab', last: 'Ali', jobRoles: ['Practitioner'], team: 'Toddler room' },
    { key: 'carlSutton', first: 'Carl', last: 'Sutton', jobRoles: ['Apprentice'], team: 'Toddler room' },
    { key: 'ninaVolk', first: 'Nina', last: 'Volk', jobRoles: ['Practitioner'], team: 'Baby room' },
    { key: 'peterOsei', first: 'Peter', last: 'Osei', jobRoles: ['Cook'], team: 'Toddler room' },
  ],
};

const PROVIDER_TEAM = [
  { key: 'providerOwner', name: 'Owner', role: 'owner', twoFactor: true },
  { key: 'sophie', name: 'Sophie', role: 'support', twoFactor: true },
  { key: 'raj', name: 'Raj', role: 'billing', twoFactor: true },
  { key: 'megan', name: 'Megan', role: 'contentEditor', twoFactor: true },
  { key: 'tom', name: 'Tom', role: 'readOnly', twoFactor: false },
];

const reqByName = (name: string): Requirement => {
  const r = nurseryPack.requirements.find((x) => x.name === name);
  if (!r) throw new Error(`Unknown requirement ${name}`);
  return r;
};

const jobRoleByName = (name: string): JobRole => {
  const r = nurseryPack.jobRoles.find((x) => x.name === name);
  if (!r) throw new Error(`Unknown job role ${name}`);
  return r;
};

const must = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Seed: a record the world refers to is missing');
  return value;
};

/** Is this London day a weekday? */
const isWeekday = (d: Date): boolean => daysBetween(mondayOfWeek(d), d) < 5;

export function buildWorld(options: SeedMeta): { data: SeedData; keys: SeedKeys } {
  const today = new Date(options.today);
  const clock: Clock = fixedClock(options.today);
  const root = createRng(options.seedValue);
  const streams = {
    provider: root.fork('provider'),
    clients: root.fork('clients'),
    littleAcorns: root.fork('littleAcorns'),
    oakTree: root.fork('oakTree'),
    willowLane: root.fork('willowLane'),
    evidence: root.fork('evidence'),
    billing: root.fork('billing'),
  };
  const newId = (rng: Rng) => (): string => ulid(clock, rng);
  const ago = (days: number): Date => addDays(today, -days);

  // Filled in below; every declared key is set before the keys are returned.
  const keys = {
    clients: {},
    sites: {},
    personas: {},
    users: {},
    requirements: {},
    submissions: {},
    roles: {},
  } as unknown as SeedKeys;
  const data: SeedData = {
    clients: [],
    sites: [],
    teams: [],
    people: [],
    users: [],
    jobRoles: nurseryPack.jobRoles,
    requirements: nurseryPack.requirements,
    evidence: [],
    evidenceSubmissions: [],
    roles: [],
    roleAssignments: [],
    packages,
    addOns,
    subscriptions: [],
    addOnSubscriptions: [],
    paymentAttempts: [],
  };

  keys.requirements = {
    safeguarding: reqByName('Safeguarding').id,
    paediatricFirstAid: reqByName('Paediatric first aid').id,
    foodHygiene: reqByName('Food hygiene').id,
    whatChanged: reqByName('What changed in September 2026').id,
    newStarterInduction: reqByName('New starter induction').id,
  };

  // Provider: the five-person team, the system provider roles and the custom Account manager role.
  {
    const id = newId(streams.provider);
    const ownerUserId = id();
    const roleIds: Record<string, string> = {};
    for (const t of providerRoleTemplates) {
      const role: Role = {
        id: id(),
        owner: 'provider',
        name: t.name,
        description: t.description,
        colour: '#3f3f8f',
        permissionIds: t.permissionIds,
        system: true,
        version: 1,
        updatedBy: ownerUserId,
        updatedAt: iso(ago(120)),
      };
      roleIds[t.key] = role.id;
      keys.roles[`provider.${t.key}`] = role.id;
      data.roles.push(role);
    }
    const accountManager: Role = {
      id: id(),
      owner: 'provider',
      name: 'Account manager',
      description: 'Clients, tickets and support reports for selected clients only',
      colour: '#8f3f6f',
      permissionIds: ['clients.read', 'tickets.read', 'tickets.write'],
      system: false,
      version: 1,
      updatedBy: ownerUserId,
      updatedAt: iso(ago(60)),
    };
    keys.roles['provider.accountManager'] = accountManager.id;
    data.roles.push(accountManager);
    for (const m of PROVIDER_TEAM) {
      const userId = m.key === 'providerOwner' ? ownerUserId : id();
      keys.users[m.key] = userId;
      data.users.push({
        id: userId,
        side: 'provider',
        email: `${slug(m.name)}@example.test`,
        displayName: m.name,
        status: 'active',
        login: { method: 'emailPassword', pinSet: false },
        ...(m.twoFactor ? { twoFactor: { enrolledAt: iso(ago(90)), recoveryCodesLeft: 8 } } : {}),
        lastActiveAt: iso(ago(1)),
      });
      data.roleAssignments.push({
        id: id(),
        userId,
        roleIds: [must(roleIds[m.role])],
        scope: { type: 'all' },
        grants: [],
        denies: [],
        status: 'active',
      });
    }
  }

  // Clients and subscriptions.
  for (const c of CLIENTS) {
    const id = newId(streams.clients);
    const pack = allPacks.find((p) => p.name === c.pack);
    if (!pack) throw new Error(`Unknown pack ${c.pack}`);
    const clientId = id();
    keys.clients[c.key] = clientId;
    const since = ago(c.sinceDaysAgo);
    data.clients.push({
      id: clientId,
      displayName: c.name,
      industryPackId: pack.id,
      packageId: c.pkg,
      accountState: c.state,
      createdAt: iso(c.state === 'trial' ? since : ago(Math.max(c.sinceDaysAgo, 365))),
      settings: clientSettingsSchema.parse({}),
      nameHistory: [],
    });
    data.subscriptions.push({
      clientId,
      packageId: c.pkg,
      period: 'monthly',
      renewalAt: iso(addMonths(today, 1)),
      state: c.state,
      stateSince: iso(since),
      ...(c.trialEndsInDays !== undefined ? { nextStateAt: iso(addDays(today, c.trialEndsInDays)) } : {}),
      billingContact: `accounts@${slug(c.name)}.test`,
    });
  }

  // Client sections: sites, rooms, people, users, roles and role assignments.
  const buildClient = (spec: ClientSpec, rng: Rng): Built => {
    const id = newId(rng);
    const clientId = must(keys.clients[spec.key]);
    const clientName = (CLIENTS.find((c) => c.key === spec.key) as { name: string }).name;
    const domain = `${slug(clientName)}.test`;
    const siteIds: Record<string, string> = {};
    const teamIds: Record<string, string> = {};
    for (const s of spec.sites) {
      const siteId = id();
      siteIds[s.key] = siteId;
      keys.sites[s.key] = siteId;
      data.sites.push({
        id: siteId,
        clientId,
        name: s.name,
        countryCode: 'GB',
        region: s.region,
        status: 'active',
        timezone: 'Europe/London',
      });
      for (const t of s.teams) {
        const teamId = id();
        teamIds[`${s.key}/${t}`] = teamId;
        data.teams.push({ id: teamId, clientId, siteId, name: t });
      }
    }
    const firstSite = must(spec.sites[0]).key;

    // Person and user ids are drawn first so role records can name the owner as updatedBy.
    const personIds = new Map(spec.people.map((p) => [p.key, id()]));
    const userIds = new Map(spec.people.map((p) => [p.key, id()]));
    const ownerSpec = spec.people.find((p) => (p.userKey ?? p.key) === spec.ownerKey);
    if (!ownerSpec) throw new Error(`No owner ${spec.ownerKey} in ${spec.key}`);
    const ownerUserId = must(userIds.get(ownerSpec.key));

    const roleIdByKey: Record<string, string> = {};
    for (const t of clientRoleTemplates) {
      const role: Role = {
        id: id(),
        owner: { clientId },
        name: t.name,
        description: `${t.name} role`,
        colour: ROLE_COLOURS[t.key] ?? '#4a4a4a',
        permissionIds: compileClientRole(t.levels, t.allows),
        system: true,
        version: 1,
        clientLevels: t.levels,
        clientAllows: t.allows,
        updatedBy: ownerUserId,
        updatedAt: iso(ago(100)),
      };
      roleIdByKey[t.key] = role.id;
      keys.roles[`${spec.key}.${t.key}`] = role.id;
      data.roles.push(role);
    }

    const people: Person[] = [];
    for (const p of spec.people) {
      const siteKey = p.site ?? firstSite;
      const personId = must(personIds.get(p.key));
      const userId = must(userIds.get(p.key));
      const archived = p.status === 'archived';
      const person: Person = {
        id: personId,
        clientId,
        primarySiteId: must(siteIds[siteKey]),
        additionalSiteIds: (p.extraSites ?? []).map((s) => must(siteIds[s])),
        teamIds: p.team ? [must(teamIds[`${siteKey}/${p.team}`])] : [],
        firstName: p.first,
        lastName: p.last,
        jobRoleIds: p.jobRoles.map((r) => jobRoleByName(r).id),
        startDate: iso(ago(p.startDaysAgo ?? rng.int(200, 1500))),
        ...(p.leftMonthsAgo !== undefined ? { leftDate: iso(addMonths(today, -p.leftMonthsAgo)) } : {}),
        status: p.status ?? 'active',
        prefs: { ...BASE_PREFS, ...p.prefs },
      };
      people.push(person);
      data.people.push(person);
      keys.personas[p.key] = personId;
      if (archived) continue;
      const userKey = p.userKey ?? p.key;
      keys.users[userKey] = userId;
      data.users.push({
        id: userId,
        side: p.admin ? 'client' : 'staff',
        clientId,
        personId,
        email: `${slug(p.first)}.${slug(p.last)}@${domain}`,
        displayName: p.first,
        status: 'active',
        login: p.admin ? { method: 'emailPassword', pinSet: false } : { method: 'pin', pinSet: true },
        lastActiveAt: iso(ago(rng.int(0, 5))),
      });
      if (p.admin) {
        const scope: Scope =
          p.admin.scope === 'clients'
            ? { type: 'clients', ids: [clientId] }
            : { type: 'sites', ids: [person.primarySiteId] };
        data.roleAssignments.push({
          id: id(),
          userId,
          roleIds: [must(roleIdByKey[p.admin.role])],
          scope,
          grants: [],
          denies: [],
          status: 'active',
        });
      }
    }
    return { people, spec, clientId, siteIds };
  };

  const la = buildClient(LITTLE_ACORNS, streams.littleAcorns);
  const ot = buildClient(OAK_TREE, streams.oakTree);
  const wl = buildClient(WILLOW_LANE, streams.willowLane);

  // Evidence.
  const safeguarding = reqByName('Safeguarding');
  const firstAid = reqByName('Paediatric first aid');
  const foodHygiene = reqByName('Food hygiene');
  const whatChanged = reqByName('What changed in September 2026');
  const induction = reqByName('New starter induction');

  const addEvidence = (rng: Rng, person: Person, req: Requirement, completedAt: Date, expiresAt?: Date): void => {
    const external = req.evidence.includes('external') && req.name !== whatChanged.name && req.name !== induction.name;
    data.evidence.push({
      id: ulid(clock, rng),
      clientId: person.clientId,
      personId: person.id,
      requirementId: req.id,
      kind: external ? 'external' : 'module',
      completedAt: iso(completedAt),
      ...(expiresAt ? { expiresAt: iso(expiresAt) } : {}),
      ...(external ? {} : { moduleId: req.satisfiedByModuleIds[0], moduleVersion: 1 }),
      siteIdAtTime: person.primarySiteId,
    });
  };

  const currentEvidence = (rng: Rng, person: Person, req: Requirement): void => {
    const completed = ago(rng.int(30, 300));
    addEvidence(
      rng,
      person,
      req,
      completed,
      req.renewEveryMonths ? addMonths(completed, req.renewEveryMonths) : undefined,
    );
  };

  // Little Acorns: exactly the statuses in 7.3.
  {
    const rng = streams.evidence.fork('littleAcorns');
    const clusterMonday = mondayOfWeek(addDays(today, 14));
    // 23:59 London on the given day of the cluster week (offset 1 is Tuesday).
    const clusterExpiry = (offset: number): Date =>
      new Date(startOfLondonDay(addDays(clusterMonday, offset + 1)).getTime() - 60_000);
    const cluster = new Map([
      ['lucy', 1],
      ['hannah', 2],
      ['chris', 3],
    ]);
    for (const p of la.spec.people) {
      const person = must(la.people.find((x) => x.id === keys.personas[p.key]));
      if (person.status === 'archived') continue;
      const prng = rng.fork(p.key);
      const clusterOffset = cluster.get(p.key);
      if (clusterOffset !== undefined) {
        const expiry = clusterExpiry(clusterOffset);
        addEvidence(prng, person, safeguarding, addMonths(expiry, -24), expiry);
      } else if (p.key !== 'ben' && p.key !== 'sam') {
        currentEvidence(prng, person, safeguarding);
      }
      if (p.key === 'mark') {
        const expiry = ago(8);
        addEvidence(prng, person, firstAid, addMonths(expiry, -36), expiry);
      } else if (p.key !== 'sam') {
        currentEvidence(prng, person, firstAid);
      }
      if (p.key === 'maureen') {
        const expiry = addDays(today, 20);
        addEvidence(prng, person, foodHygiene, addMonths(expiry, -36), expiry);
      }
      if (p.key !== 'amira') addEvidence(prng, person, whatChanged, ago(prng.int(3, 30)));
      const inductionDone = addDays(new Date(person.startDate), 14);
      addEvidence(
        prng,
        person,
        induction,
        inductionDone.getTime() > today.getTime() ? addDays(new Date(person.startDate), 5) : inductionDone,
      );
    }

    // Ben's DfE safeguarding certificate, uploaded 4 working days ago and waiting for a check.
    let created = today;
    for (let worked = 0; worked < 4;) {
      if (isWeekday(created)) worked++;
      created = addDays(created, -1);
    }
    const ben = must(la.people.find((x) => x.id === keys.personas['ben']));
    const submissionId = ulid(clock, rng);
    keys.submissions['ben'] = submissionId;
    data.evidenceSubmissions.push({
      id: submissionId,
      clientId: la.clientId,
      siteId: ben.primarySiteId,
      personId: ben.id,
      requirementId: safeguarding.id,
      uploadedBy: keys.users['ben'],
      fileAttachmentId: ulid(clock, rng),
      providerName: 'Sample Early Years Training',
      completedAt: iso(ago(20)),
      expiresAt: iso(addMonths(ago(20), 24)),
      status: 'awaitingCheck',
      createdAt: iso(created),
    });
  }

  // Oak Tree and Willow Lane: evidence thinned per site to the stated compliance level.
  for (const built of [ot, wl]) {
    const rng = streams.evidence.fork(built.spec.key);
    for (const person of built.people) {
      const site = must(built.spec.sites.find((s) => built.siteIds[s.key] === person.primarySiteId));
      const target = site.compliance ?? 0.9;
      const prng = rng.fork(person.id);
      for (const req of [safeguarding, firstAid, whatChanged, induction]) {
        const roll = prng.next();
        if (roll < target) currentEvidence(prng, person, req);
        else if (roll < target + (1 - target) / 2 && req.renewEveryMonths) {
          const completed = addMonths(today, -(req.renewEveryMonths + 1));
          addEvidence(prng, person, req, completed, addMonths(completed, req.renewEveryMonths));
        }
      }
      if (person.jobRoleIds.includes(jobRoleByName('Cook').id) && prng.next() < target) {
        currentEvidence(prng, person, foodHygiene);
      }
    }
  }

  // Billing: Willow Lane's declined card, plus one earlier paid invoice for two active nursery clients.
  {
    const rng = streams.billing;
    const id = newId(rng);
    const willow = keys.clients['willowLane'];
    const renewalInvoice = id();
    const attempts: [number, PaymentAttempt['result']][] = [
      [10, 'softDecline'],
      [7, 'softDecline'],
      [4, 'softDecline'],
      [1, 'hardDecline'],
    ];
    for (const [daysAgo, result] of attempts) {
      data.paymentAttempts.push({
        id: id(),
        clientId: willow,
        invoiceId: renewalInvoice,
        at: iso(ago(daysAgo)),
        result,
      });
    }
    for (const key of ['littleAcorns', 'oakTree']) {
      data.paymentAttempts.push({
        id: id(),
        clientId: must(keys.clients[key]),
        invoiceId: id(),
        at: iso(ago(40)),
        result: 'success',
      });
    }
    const aiAssistant = addOns.find((a) => a.name === 'AI Assistant');
    if (aiAssistant) {
      data.addOnSubscriptions.push({
        clientId: keys.clients['littleAcorns'],
        addOnId: aiAssistant.id,
        status: 'off',
        usageThisPeriod: 0,
      });
    }
  }

  return { data, keys };
}

// F-3 (part): Zod schemas for every entity M0 stores. Field names are exactly build pack section 6.
//
// API expected (all exported from ./schemas/index):
//   idSchema, isoDateSchema, penceSchema                       (primitives)
//   <entity>Schema for: client, clientSettings, site, team, person, learnerPrefs, userAccount, jobRole,
//   industryPack, requirement, evidence, evidenceSubmission, permission, role, roleAssignment, package
//   (exported as packageSchema), entitlements, addOn, subscription, addOnSubscription, paymentAttempt,
//   dunningPolicy, auditEvent, outboxMessage, seedMeta, demoState
//   Types inferred with z.infer and exported under the PascalCase entity name (Client, Site, ...).
// Decisions made where the plan left things open:
//   - Ids are upper-case Crockford base32, 26 characters (the output of ulid()).
//   - ISODate is a full ISO 8601 date-time with a time zone designator (Z or an offset).
//   - PaymentAttempt gains `id` and `clientId` (build pack 6 only has invoiceId; invoices arrive later and the
//     data layer needs the tenant and a key).
//   - IndustryPack's defaultCategoryIds, defaultRules, faqIds and supportFeatureIds default to [].
//   - ClientSettings fields all have defaults, so clientSettingsSchema.parse({}) works.
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  addOnSchema,
  addOnSubscriptionSchema,
  auditEventSchema,
  clientSchema,
  clientSettingsSchema,
  demoStateSchema,
  dunningPolicySchema,
  entitlementsSchema,
  evidenceSchema,
  evidenceSubmissionSchema,
  idSchema,
  industryPackSchema,
  isoDateSchema,
  jobRoleSchema,
  learnerPrefsSchema,
  outboxMessageSchema,
  packageSchema,
  paymentAttemptSchema,
  penceSchema,
  permissionSchema,
  personSchema,
  requirementSchema,
  roleAssignmentSchema,
  roleSchema,
  seedMetaSchema,
  siteSchema,
  subscriptionSchema,
  teamSchema,
  userAccountSchema,
} from './schemas/index';

// ---- fixtures: 26-character Crockford ids built from one valid prefix ----
const mk = (c: string): string => `01ARZ3NDEKTSV4RRFFQ69G5FA${c}`;
const CLIENT = mk('1');
const OTHER = mk('2');
const SITE = mk('3');
const TEAM = mk('4');
const PERSON = mk('5');
const USER = mk('6');
const ROLE = mk('7');
const REQ = mk('8');
const PACK = mk('9');
const AT = '2026-10-19T09:00:00.000Z';

const prefs = {
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

const entitlements = {
  ownModules: 5,
  savedThemes: 2,
  admins: 3,
  autoAssignRules: 'unlimited',
  liveCompetitions: 1,
  customClientRoles: 0,
  closedBookCompetitions: false,
  multiSite: false,
  logoBranding: false,
  perSiteThemes: false,
  integrations: false,
  responseTargetHours: 48,
  battlesPerMonth: 4,
  maxBattlePlayers: 10,
  crossSiteBattles: false,
};

const client = {
  id: CLIENT,
  displayName: 'Little Acorns Nursery',
  industryPackId: PACK,
  packageId: mk('B'),
  accountState: 'active',
  createdAt: AT,
  settings: clientSettingsSchema.parse({}),
  nameHistory: [],
};

const site = {
  id: SITE,
  clientId: CLIENT,
  name: 'Main setting',
  countryCode: 'GB',
  status: 'active',
  timezone: 'Europe/London',
};

const team = { id: TEAM, clientId: CLIENT, siteId: SITE, name: 'Baby room' };

const person = {
  id: PERSON,
  clientId: CLIENT,
  primarySiteId: SITE,
  additionalSiteIds: [],
  teamIds: [TEAM],
  firstName: 'Jade',
  lastName: 'Mills',
  jobRoleIds: [mk('C')],
  startDate: AT,
  status: 'active',
  prefs,
};

const userAccount = {
  id: USER,
  side: 'client',
  clientId: CLIENT,
  personId: PERSON,
  email: 'priya@example.test',
  displayName: 'Priya Shah',
  status: 'active',
  login: { method: 'emailPassword', pinSet: false },
};

const jobRole = { id: mk('C'), packId: PACK, name: 'Practitioner' };

const requirement = {
  id: REQ,
  packId: PACK,
  name: 'Safeguarding',
  appliesTo: { all: true },
  renewEveryMonths: 24,
  evidence: ['module', 'external'],
  satisfiedByModuleIds: [mk('D')],
  acceptsExternal: true,
  acceptedProviders: [{ name: 'Example Training Ltd' }],
  expiryMode: 'fromCertificate',
  approverChecklist: ['Name matches', 'Date is visible'],
};

const evidence = {
  id: mk('E'),
  clientId: CLIENT,
  personId: PERSON,
  requirementId: REQ,
  kind: 'external',
  completedAt: AT,
  expiresAt: '2028-10-19T09:00:00.000Z',
  siteIdAtTime: SITE,
};

const submission = {
  id: mk('F'),
  clientId: CLIENT,
  siteId: SITE,
  personId: PERSON,
  requirementId: REQ,
  uploadedBy: USER,
  fileAttachmentId: mk('G'),
  providerName: 'Example Training Ltd',
  completedAt: AT,
  status: 'awaitingCheck',
  createdAt: AT,
};

const industryPack = {
  id: PACK,
  name: 'Nurseries',
  status: 'full',
  terminology: { site: 'setting', team: 'room', auditExport: 'Inspector-ready' },
  jobRoles: [jobRole],
  requirements: [requirement],
  prizeSuggestions: [],
};

const permission = {
  id: 'billing.manage',
  area: 'billing',
  action: 'manage',
  description: 'Change billing details',
  sensitive: true,
  requires: ['billing.view'],
};

const role = {
  id: ROLE,
  owner: { clientId: CLIENT },
  name: 'Account Owner',
  description: 'Runs the account',
  colour: '#2255aa',
  permissionIds: ['staff.view'],
  system: true,
  version: 1,
  updatedBy: USER,
  updatedAt: AT,
};

const roleAssignment = {
  id: mk('H'),
  userId: USER,
  roleIds: [ROLE],
  scope: { type: 'clients', ids: [CLIENT] },
  grants: [],
  denies: [],
  status: 'active',
};

const pkg = {
  id: mk('B'),
  name: 'Essentials',
  option: 'A',
  bands: [{ maxStaff: 15, pricePerSite: 4900 }],
  entitlements,
};

const addOn = {
  id: mk('J'),
  name: 'AI Assistant',
  pricing: { kind: 'flat', price: 1500 },
  adds: { flags: ['aiAssistant'] },
};

const subscription = {
  clientId: CLIENT,
  packageId: mk('B'),
  period: 'monthly',
  renewalAt: AT,
  state: 'active',
  stateSince: AT,
  billingContact: 'accounts@example.test',
};

const addOnSubscription = { clientId: CLIENT, addOnId: mk('J'), status: 'on', usageThisPeriod: 0 };

const paymentAttempt = {
  id: mk('K'),
  clientId: CLIENT,
  invoiceId: mk('M'),
  at: AT,
  result: 'softDecline',
};

const dunning = { graceDays: 14, limitedUntilDay: 30, readOnlyUntilDay: 60, closedUntilDay: 150, deleteWithinDays: 30 };

const audit = {
  id: mk('N'),
  actorId: USER,
  actorSide: 'client',
  clientId: CLIENT,
  action: 'evidence.approve',
  target: `evidence:${mk('E')}`,
  at: AT,
};

const outbox = {
  id: mk('P'),
  channel: 'email',
  to: 'jade@example.test',
  subject: 'Reminder',
  body: 'Hello',
  at: AT,
  reason: 'reminder',
};

const seedMeta = { seedValue: 20261019, today: AT };
const demoState = { clockOffsetMs: 0, industry: 'nursery', persona: { side: 'client', userId: USER } };

type Case = { name: string; schema: ZodType; valid: object };

const entities: Case[] = [
  { name: 'client', schema: clientSchema, valid: client },
  { name: 'site', schema: siteSchema, valid: site },
  { name: 'team', schema: teamSchema, valid: team },
  { name: 'person', schema: personSchema, valid: person },
  { name: 'learnerPrefs', schema: learnerPrefsSchema, valid: prefs },
  { name: 'userAccount', schema: userAccountSchema, valid: userAccount },
  { name: 'jobRole', schema: jobRoleSchema, valid: jobRole },
  { name: 'industryPack', schema: industryPackSchema, valid: industryPack },
  { name: 'requirement', schema: requirementSchema, valid: requirement },
  { name: 'evidence', schema: evidenceSchema, valid: evidence },
  { name: 'evidenceSubmission', schema: evidenceSubmissionSchema, valid: submission },
  { name: 'permission', schema: permissionSchema, valid: permission },
  { name: 'role', schema: roleSchema, valid: role },
  { name: 'roleAssignment', schema: roleAssignmentSchema, valid: roleAssignment },
  { name: 'package', schema: packageSchema, valid: pkg },
  { name: 'entitlements', schema: entitlementsSchema, valid: entitlements },
  { name: 'addOn', schema: addOnSchema, valid: addOn },
  { name: 'subscription', schema: subscriptionSchema, valid: subscription },
  { name: 'addOnSubscription', schema: addOnSubscriptionSchema, valid: addOnSubscription },
  { name: 'paymentAttempt', schema: paymentAttemptSchema, valid: paymentAttempt },
  { name: 'dunningPolicy', schema: dunningPolicySchema, valid: dunning },
  { name: 'auditEvent', schema: auditEventSchema, valid: audit },
  { name: 'outboxMessage', schema: outboxMessageSchema, valid: outbox },
  { name: 'seedMeta', schema: seedMetaSchema, valid: seedMeta },
  { name: 'demoState', schema: demoStateSchema, valid: demoState },
];

const without = (obj: object, key: string): object =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

const issuePaths = (schema: ZodType, value: unknown): string[] => {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('a valid sample passes for every M0 entity', () => {
  it.each(entities)('$name', ({ schema, valid }) => {
    const result = schema.safeParse(valid);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it.each(entities)('$name is not accepted when it is not an object', ({ schema }) => {
    expect(schema.safeParse(null).success).toBe(false);
    expect(schema.safeParse('x').success).toBe(false);
  });
});

describe('required fields', () => {
  it.each([
    ['client', clientSchema, client, 'displayName'],
    ['site', siteSchema, site, 'name'],
    ['person', personSchema, person, 'lastName'],
    ['person', personSchema, person, 'prefs'],
    ['userAccount', userAccountSchema, userAccount, 'displayName'],
    ['requirement', requirementSchema, requirement, 'approverChecklist'],
    ['evidence', evidenceSchema, evidence, 'requirementId'],
    ['evidenceSubmission', evidenceSubmissionSchema, submission, 'uploadedBy'],
    ['role', roleSchema, role, 'permissionIds'],
    ['subscription', subscriptionSchema, subscription, 'stateSince'],
    ['auditEvent', auditEventSchema, audit, 'action'],
  ] as const)('%s without %s fails on that field', (_name, schema, valid, field) => {
    expect(issuePaths(schema, without(valid, field))).toContain(field);
  });
});

describe('client-owned entities need a clientId', () => {
  it.each([
    ['site', siteSchema, site],
    ['team', teamSchema, team],
    ['person', personSchema, person],
    ['evidence', evidenceSchema, evidence],
    ['evidenceSubmission', evidenceSubmissionSchema, submission],
    ['subscription', subscriptionSchema, subscription],
    ['addOnSubscription', addOnSubscriptionSchema, addOnSubscription],
    ['paymentAttempt', paymentAttemptSchema, paymentAttempt],
  ] as const)('%s without clientId fails on clientId', (_name, schema, valid) => {
    expect(issuePaths(schema, without(valid, 'clientId'))).toContain('clientId');
  });

  it('rejects a malformed clientId on a person', () => {
    expect(issuePaths(personSchema, { ...person, clientId: 'not-an-id' })).toContain('clientId');
  });

  it('lets a provider user account omit clientId but not a client user', () => {
    const provider = without({ ...userAccount, side: 'provider' }, 'clientId');
    expect(userAccountSchema.safeParse(provider).success).toBe(true);
  });

  it('lets a pack-level requirement omit clientId', () => {
    expect(requirementSchema.safeParse(without(requirement, 'clientId')).success).toBe(true);
  });
});

describe('ids', () => {
  it('accepts a 26-character Crockford id', () => {
    expect(idSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAV').success).toBe(true);
    expect(idSchema.safeParse('00000000000000000000000000').success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too short', '01ARZ3NDEKTSV4RRFFQ69G5FA'],
    ['too long', '01ARZ3NDEKTSV4RRFFQ69G5FAVX'],
    ['contains I', '01ARZ3NDEKTSV4RRFFQ69G5FAI'],
    ['contains L', '01ARZ3NDEKTSV4RRFFQ69G5FAL'],
    ['contains O', '01ARZ3NDEKTSV4RRFFQ69G5FAO'],
    ['contains U', '01ARZ3NDEKTSV4RRFFQ69G5FAU'],
    ['lower case', '01arz3ndektsv4rrffq69g5fav'],
    ['has a dash', '01ARZ3NDEKTSV4RRFFQ69G5F-V'],
    ['has a space', '01ARZ3NDEKTSV4RRFFQ69G5FA '],
  ])('rejects an id that is %s', (_why, value) => {
    expect(idSchema.safeParse(value).success).toBe(false);
  });

  it('rejects a bad id on an entity and points at the field', () => {
    expect(issuePaths(siteSchema, { ...site, id: 'abc' })).toContain('id');
    expect(issuePaths(teamSchema, { ...team, siteId: 'abc' })).toContain('siteId');
  });

  it('rejects a bad id inside an array', () => {
    expect(issuePaths(personSchema, { ...person, teamIds: [TEAM, 'bad'] })).toContain('teamIds.1');
  });

  it('rejects a bad id inside a role assignment scope', () => {
    const bad = { ...roleAssignment, scope: { type: 'sites', ids: ['bad'] } };
    expect(roleAssignmentSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ISO dates', () => {
  it.each(['2026-10-19T09:00:00.000Z', '2026-10-19T09:00:00Z', '2026-10-19T23:59:00+01:00'])('accepts %s', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['words', 'yesterday'],
    ['month 13', '2026-13-01T00:00:00Z'],
    ['day 45', '2026-10-45T00:00:00Z'],
    ['not a real day', '2026-02-30T00:00:00Z'],
    ['a UK style date', '19/10/2026'],
    ['no time zone', '2026-10-19T09:00:00'],
    ['a number', 1792400400000],
  ])('rejects %s', (_why, value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(false);
  });

  it('rejects a bad date on an entity and points at the field', () => {
    expect(issuePaths(evidenceSchema, { ...evidence, completedAt: 'last week' })).toContain('completedAt');
    expect(issuePaths(subscriptionSchema, { ...subscription, renewalAt: '2026-99-99T00:00:00Z' })).toContain(
      'renewalAt',
    );
    expect(issuePaths(seedMetaSchema, { ...seedMeta, today: 'today' })).toContain('today');
  });

  it('keeps an optional date optional but validates it when present', () => {
    expect(evidenceSchema.safeParse(without(evidence, 'expiresAt')).success).toBe(true);
    expect(issuePaths(evidenceSchema, { ...evidence, expiresAt: 'soon' })).toContain('expiresAt');
  });
});

describe('money is integer pence', () => {
  it.each([0, 1, 4900, 1_000_000])('accepts %i', (value) => {
    expect(penceSchema.safeParse(value).success).toBe(true);
  });

  it.each([-1, -4900, 1.5, 49.99, Number.NaN, Number.POSITIVE_INFINITY, '4900'])('rejects %s', (value) => {
    expect(penceSchema.safeParse(value).success).toBe(false);
  });

  it('rejects negative or fractional price per site in a package band', () => {
    const band = (pricePerSite: number) => ({ ...pkg, bands: [{ maxStaff: 15, pricePerSite }] });
    expect(packageSchema.safeParse(band(4900)).success).toBe(true);
    expect(issuePaths(packageSchema, band(-1))).toContain('bands.0.pricePerSite');
    expect(issuePaths(packageSchema, band(49.5))).toContain('bands.0.pricePerSite');
  });

  it('rejects a negative or fractional flat add-on price', () => {
    const withPrice = (price: number) => ({ ...addOn, pricing: { kind: 'flat', price } });
    expect(addOnSchema.safeParse(withPrice(1500)).success).toBe(true);
    expect(addOnSchema.safeParse(withPrice(-1500)).success).toBe(false);
    expect(addOnSchema.safeParse(withPrice(15.5)).success).toBe(false);
  });

  it('rejects a fractional usage price per unit', () => {
    const usage = { kind: 'usage', unit: 'message', pricePerUnit: 2.5, includedUnits: 100 };
    expect(addOnSchema.safeParse({ ...addOn, pricing: usage }).success).toBe(false);
    expect(addOnSchema.safeParse({ ...addOn, pricing: { ...usage, pricePerUnit: 3 } }).success).toBe(true);
  });

  it('rejects a negative or fractional usage cap', () => {
    expect(addOnSubscriptionSchema.safeParse({ ...addOnSubscription, usageCapPence: 500 }).success).toBe(true);
    expect(addOnSubscriptionSchema.safeParse({ ...addOnSubscription, usageCapPence: -500 }).success).toBe(false);
    expect(addOnSubscriptionSchema.safeParse({ ...addOnSubscription, usageCapPence: 5.5 }).success).toBe(false);
  });
});

describe('enums and unions', () => {
  it.each([
    ['client accountState', clientSchema, { ...client, accountState: 'frozen' }],
    ['site status', siteSchema, { ...site, status: 'closed' }],
    ['person status', personSchema, { ...person, status: 'leaver' }],
    ['user side', userAccountSchema, { ...userAccount, side: 'admin' }],
    ['user login method', userAccountSchema, { ...userAccount, login: { method: 'sms', pinSet: false } }],
    ['evidence kind', evidenceSchema, { ...evidence, kind: 'verbal' }],
    ['submission status', evidenceSubmissionSchema, { ...submission, status: 'maybe' }],
    ['requirement expiryMode', requirementSchema, { ...requirement, expiryMode: 'never' }],
    ['requirement evidence entry', requirementSchema, { ...requirement, evidence: ['photo'] }],
    ['package option', packageSchema, { ...pkg, option: 'C' }],
    ['subscription state', subscriptionSchema, { ...subscription, state: 'cancelled' }],
    ['subscription period', subscriptionSchema, { ...subscription, period: 'weekly' }],
    ['payment result', paymentAttemptSchema, { ...paymentAttempt, result: 'declined' }],
    ['outbox channel', outboxMessageSchema, { ...outbox, channel: 'fax' }],
    ['demo industry', demoStateSchema, { ...demoState, industry: 'mining' }],
    ['demo persona side', demoStateSchema, { ...demoState, persona: { side: 'admin', userId: USER } }],
    ['role assignment status', roleAssignmentSchema, { ...roleAssignment, status: 'expired' }],
    ['role assignment scope type', roleAssignmentSchema, { ...roleAssignment, scope: { type: 'planet', ids: [] } }],
    ['role owner', roleSchema, { ...role, owner: 'client' }],
    ['learner prefs contrast', learnerPrefsSchema, { ...prefs, contrast: 'extreme' }],
    ['learner prefs battle extra time', learnerPrefsSchema, { ...prefs, battleExtraTimePercent: 25 }],
  ] as const)('rejects an unknown %s', (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it.each(['trial', 'active', 'pastDue', 'limited', 'readOnly', 'closed', 'deleted', 'paused'])(
    'accepts client account state %s',
    (accountState) => {
      expect(clientSchema.safeParse({ ...client, accountState }).success).toBe(true);
    },
  );

  it('accepts every role assignment scope shape', () => {
    for (const scope of [
      { type: 'all' },
      { type: 'clients', ids: [CLIENT] },
      { type: 'sites', ids: [SITE] },
      { type: 'own' },
    ]) {
      expect(roleAssignmentSchema.safeParse({ ...roleAssignment, scope }).success).toBe(true);
    }
  });

  it('accepts a provider-owned role', () => {
    expect(roleSchema.safeParse({ ...role, owner: 'provider' }).success).toBe(true);
  });

  it('accepts usage-based add-on pricing', () => {
    const usage = { kind: 'usage', unit: 'message', pricePerUnit: 4, includedUnits: 100 };
    expect(addOnSchema.safeParse({ ...addOn, pricing: usage }).success).toBe(true);
  });
});

describe('entitlements', () => {
  it('accepts "unlimited" or a non-negative integer for limits', () => {
    expect(entitlementsSchema.safeParse({ ...entitlements, ownModules: 'unlimited' }).success).toBe(true);
    expect(entitlementsSchema.safeParse({ ...entitlements, ownModules: 0 }).success).toBe(true);
  });

  it.each([-1, 2.5, 'lots'])('rejects %s as a limit', (value) => {
    expect(entitlementsSchema.safeParse({ ...entitlements, admins: value }).success).toBe(false);
  });

  it('requires every flag', () => {
    expect(issuePaths(entitlementsSchema, without(entitlements, 'multiSite'))).toContain('multiSite');
  });

  it('lets an add-on carry a partial set of entitlements plus flags', () => {
    const adds = { admins: 5, flags: ['aiAssistant'] };
    expect(addOnSchema.safeParse({ ...addOn, adds }).success).toBe(true);
    expect(addOnSchema.safeParse({ ...addOn, adds: { admins: -1 } }).success).toBe(false);
  });
});

describe('ClientSettings defaults', () => {
  it('fills in the documented defaults from an empty object', () => {
    const settings = clientSettingsSchema.parse({});
    expect(settings.amberWindowDays).toBe(60);
    expect(settings.allowSelfApproval).toBe(false);
    expect(settings.defaultLanguage).toBe('en-GB');
    expect(settings.battles).toMatchObject({
      allowStaffHost: true,
      allowCrossSite: true,
      speedModeAvailable: true,
      raiseTheStakesAvailable: true,
    });
    expect(Number.isInteger(settings.battles.maxRoomSize)).toBe(true);
    expect(settings.battles.maxRoomSize).toBeGreaterThan(0);
  });

  it('keeps values that are supplied', () => {
    const settings = clientSettingsSchema.parse({ amberWindowDays: 45, allowSelfApproval: true });
    expect(settings.amberWindowDays).toBe(45);
    expect(settings.allowSelfApproval).toBe(true);
  });

  it.each([-1, 0.5, 'sixty'])('rejects amberWindowDays %s', (value) => {
    expect(clientSettingsSchema.safeParse({ amberWindowDays: value }).success).toBe(false);
  });

  it('rejects a non-boolean allowSelfApproval', () => {
    expect(clientSettingsSchema.safeParse({ allowSelfApproval: 'yes' }).success).toBe(false);
  });
});

describe('IndustryPack', () => {
  const pack = industryPack;

  it('defaults the optional list fields to empty arrays', () => {
    const parsed = industryPackSchema.parse(pack) as Record<string, unknown>;
    expect(parsed['defaultCategoryIds']).toEqual([]);
    expect(parsed['defaultRules']).toEqual([]);
    expect(parsed['faqIds']).toEqual([]);
    expect(parsed['supportFeatureIds']).toEqual([]);
  });

  it('allows an empty prizeSuggestions list but requires the field', () => {
    expect(industryPackSchema.safeParse(pack).success).toBe(true);
    expect(issuePaths(industryPackSchema, without(pack, 'prizeSuggestions'))).toContain('prizeSuggestions');
  });

  it('requires terminology values to be strings', () => {
    expect(industryPackSchema.safeParse({ ...pack, terminology: { site: 3 } }).success).toBe(false);
  });

  it('validates nested requirements', () => {
    const bad = { ...requirement, renewEveryMonths: -1 };
    expect(industryPackSchema.safeParse({ ...pack, requirements: [bad] }).success).toBe(false);
  });

  it('only allows the statuses full and stub', () => {
    expect(industryPackSchema.safeParse({ ...pack, status: 'stub' }).success).toBe(true);
    expect(industryPackSchema.safeParse({ ...pack, status: 'beta' }).success).toBe(false);
  });
});

describe('numbers that must be whole and non-negative', () => {
  it.each([-1, 1.5])('rejects renewEveryMonths %s', (value) => {
    expect(requirementSchema.safeParse({ ...requirement, renewEveryMonths: value }).success).toBe(false);
  });

  it('rejects a dunning policy with a fractional or negative day count', () => {
    expect(dunningPolicySchema.safeParse({ ...dunning, graceDays: 14.5 }).success).toBe(false);
    expect(dunningPolicySchema.safeParse({ ...dunning, closedUntilDay: -1 }).success).toBe(false);
  });

  it('rejects a non-integer seed value', () => {
    expect(seedMetaSchema.safeParse({ ...seedMeta, seedValue: 1.5 }).success).toBe(false);
    expect(seedMetaSchema.safeParse({ ...seedMeta, seedValue: 'abc' }).success).toBe(false);
  });

  it('allows a negative clock offset in the demo state but not a non-number', () => {
    expect(demoStateSchema.safeParse({ ...demoState, clockOffsetMs: -86_400_000 }).success).toBe(true);
    expect(demoStateSchema.safeParse({ ...demoState, clockOffsetMs: '1d' }).success).toBe(false);
  });
});

describe('references between entities', () => {
  it('rejects a person whose additional site is not an id', () => {
    expect(issuePaths(personSchema, { ...person, additionalSiteIds: ['site'] })).toContain('additionalSiteIds.0');
  });

  it('accepts a person on two sites (the bank practitioner)', () => {
    expect(personSchema.safeParse({ ...person, additionalSiteIds: [OTHER] }).success).toBe(true);
  });

  it('accepts a leaver with a leftDate and rejects a bad one', () => {
    expect(personSchema.safeParse({ ...person, status: 'archived', leftDate: AT }).success).toBe(true);
    expect(issuePaths(personSchema, { ...person, leftDate: 'sometime' })).toContain('leftDate');
  });

  it('accepts an optional twoFactor block and rejects a malformed one', () => {
    const twoFactor = { enrolledAt: AT, recoveryCodesLeft: 8 };
    expect(userAccountSchema.safeParse({ ...userAccount, twoFactor }).success).toBe(true);
    expect(
      userAccountSchema.safeParse({ ...userAccount, twoFactor: { enrolledAt: 'x', recoveryCodesLeft: 8 } }).success,
    ).toBe(false);
  });

  it('keeps a submission linked to the evidence it produced as an id', () => {
    expect(evidenceSubmissionSchema.safeParse({ ...submission, evidenceId: mk('E') }).success).toBe(true);
    expect(issuePaths(evidenceSubmissionSchema, { ...submission, evidenceId: 'x' })).toContain('evidenceId');
  });

  it('records selfApproved only as a boolean on evidence', () => {
    expect(
      evidenceSchema.safeParse({ ...evidence, approvedBy: USER, approvedAt: AT, selfApproved: true }).success,
    ).toBe(true);
    expect(evidenceSchema.safeParse({ ...evidence, selfApproved: 'yes' }).success).toBe(false);
  });
});

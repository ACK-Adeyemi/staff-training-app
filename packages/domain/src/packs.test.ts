// Pack terminology and requirement applicability, written before the implementation (M0 chunk 5).
//
// API under test (packs.ts):
//   term(pack: Pick<IndustryPack, 'terminology'>, key: string, fallback?: string): string
//     returns pack.terminology[key]; else `fallback` if given; else `key`.
//   requirementApplies(requirement: Requirement, person: Person, site: Site): boolean
//     `site` is the person's primary site. Leavers (person.status 'archived') never apply. Otherwise a requirement applies
//     when appliesTo.all is true, OR any of appliesTo.jobRoleIds is in person.jobRoleIds, OR (appliesTo.siteAttributes is
//     non-empty and every listed attribute equals site.attributes[key]). An empty appliesTo applies to nobody.
import { describe, expect, it } from 'vitest';
import { idSchema } from './schemas/primitives';
import type { Person, Site } from './schemas/tenancy';
import type { Requirement } from './schemas/packs';
import { requirementApplies, term } from './packs';

const id = (tag: string): string => {
  const crockford = tag.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  const value = ('0'.repeat(26) + crockford).slice(-26);
  if (!idSchema.safeParse(value).success) throw new Error(`bad test id ${tag}`);
  return value;
};

const CLIENT = id('CLIENT1');
const SITE = id('SITE1');
const COOK = id('COOK');
const PRACTITIONER = id('PRACTITIONER');
const MANAGER = id('MANAGER');

const requirement = (appliesTo: Requirement['appliesTo']): Requirement => ({
  id: id('REQ1'),
  name: 'Test requirement',
  appliesTo,
  evidence: ['module'],
  satisfiedByModuleIds: [],
  acceptsExternal: false,
  acceptedProviders: [],
  expiryMode: 'fromRenewalPeriod',
  approverChecklist: [],
});

const person = (extra: Partial<Person> = {}): Person => ({
  id: id('PERSON1'),
  clientId: CLIENT,
  primarySiteId: SITE,
  additionalSiteIds: [],
  teamIds: [],
  firstName: 'Jade',
  lastName: 'Mills',
  jobRoleIds: [PRACTITIONER],
  startDate: '2024-01-08T09:00:00.000Z',
  status: 'active',
  prefs: {
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
    spacing: 'standard',
    readAloud: true,
    readAloudRate: 1,
    language: 'en-GB',
    battleExtraTimePercent: 0,
  },
  ...extra,
});

const site = (attributes?: Site['attributes']): Site => ({
  id: SITE,
  clientId: CLIENT,
  name: 'Riverside',
  countryCode: 'GB',
  status: 'active',
  timezone: 'Europe/London',
  ...(attributes ? { attributes } : {}),
});

describe('term', () => {
  const nursery = { terminology: { site: 'setting', team: 'room', auditExport: 'Inspector-ready' } };

  it('returns the pack term for a known key', () => {
    expect(term(nursery, 'site')).toBe('setting');
    expect(term(nursery, 'team')).toBe('room');
    expect(term(nursery, 'auditExport')).toBe('Inspector-ready');
  });

  it('returns the fallback for an unknown key', () => {
    expect(term(nursery, 'person', 'colleague')).toBe('colleague');
  });

  it('returns the key itself when there is no term and no fallback', () => {
    expect(term(nursery, 'person')).toBe('person');
  });

  it('prefers the pack term over the fallback', () => {
    expect(term(nursery, 'site', 'location')).toBe('setting');
  });
});

describe('requirementApplies', () => {
  it('applies to everyone when appliesTo.all is true', () => {
    expect(requirementApplies(requirement({ all: true }), person(), site())).toBe(true);
  });

  it('applies when one of the person job roles matches', () => {
    const r = requirement({ jobRoleIds: [COOK, PRACTITIONER] });
    expect(requirementApplies(r, person({ jobRoleIds: [MANAGER, PRACTITIONER] }), site())).toBe(true);
  });

  it('does not apply when no job role matches', () => {
    const r = requirement({ jobRoleIds: [COOK] });
    expect(requirementApplies(r, person({ jobRoleIds: [PRACTITIONER] }), site())).toBe(false);
  });

  it('does not apply on a job role rule to a person with no job roles', () => {
    expect(requirementApplies(requirement({ jobRoleIds: [COOK] }), person({ jobRoleIds: [] }), site())).toBe(false);
  });

  it('applies when every listed site attribute matches', () => {
    const r = requirement({ siteAttributes: { hvdRegistered: true, region: 'north' } });
    expect(requirementApplies(r, person(), site({ hvdRegistered: true, region: 'north', extra: 'x' }))).toBe(true);
  });

  it('does not apply when a site attribute differs', () => {
    const r = requirement({ siteAttributes: { hvdRegistered: true } });
    expect(requirementApplies(r, person(), site({ hvdRegistered: false }))).toBe(false);
  });

  it('does not apply when only some listed site attributes match', () => {
    const r = requirement({ siteAttributes: { hvdRegistered: true, region: 'north' } });
    expect(requirementApplies(r, person(), site({ hvdRegistered: true, region: 'south' }))).toBe(false);
  });

  it('does not apply when the site has no attributes at all', () => {
    const r = requirement({ siteAttributes: { hvdRegistered: true } });
    expect(requirementApplies(r, person(), site())).toBe(false);
  });

  it('does not apply when the appliesTo rule is empty', () => {
    expect(requirementApplies(requirement({}), person(), site())).toBe(false);
  });

  it('an archived person never applies, even for an all rule', () => {
    expect(requirementApplies(requirement({ all: true }), person({ status: 'archived' }), site())).toBe(false);
    const roleRule = requirement({ jobRoleIds: [PRACTITIONER] });
    expect(requirementApplies(roleRule, person({ status: 'archived' }), site())).toBe(false);
  });

  it('a person on leave still has requirements apply', () => {
    expect(requirementApplies(requirement({ all: true }), person({ status: 'onLeave' }), site())).toBe(true);
  });
});

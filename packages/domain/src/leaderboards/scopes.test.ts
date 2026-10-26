// BP-18: leaderboard scopes (brief 13.5; plan M3 assumption 38).
//
// API under test (leaderboards/scopes.ts), all pure:
//   availableScopes(sites: Site[], viewerSiteId: string | undefined) => LeaderboardScope[]   ('site' | 'region' | 'country' | 'all')
//     In this order. 'site' whenever the viewer has a site; 'region' when the client's ACTIVE sites have more than one
//     distinct region (sites with no region do not count as a region); 'country' when they span more than one countryCode;
//     'all' when the client has more than one active site. Archived sites are ignored. No viewer site gives [].
//   peopleInScope(scope, viewerSiteId, sites, people) => Person[]
//     People by PRIMARY site: same site, same region as the viewer's site, same country, or everyone. A viewer's site
//     with no region has no region peers, so 'region' falls back to that site only. People are not filtered by status.
//   scopedDisplayName(person, site, scope) => string
//     'site' scope: the usual display name ("Jade M."); wider scopes add the site: "Jade M., Little Acorns".
import { describe, expect, it } from 'vitest';
import { availableScopes, peopleInScope, scopedDisplayName } from './scopes';
import { siteNamed, staffAt } from '../sites/testFixtures';

const solo = siteNamed('Little Acorns', { region: 'South East' });
const oneRegionA = siteNamed('Riverside', { region: 'South East' });
const oneRegionB = siteNamed('Meadow', { region: 'South East' });
const west = siteNamed('Hilltop', { region: 'South West' });
const paris = siteNamed('Boulevard', { region: 'Ile-de-France', countryCode: 'FR' });

describe('availableScopes', () => {
  it('gives a single-site client only My site', () => {
    expect(availableScopes([solo], solo.id)).toEqual(['site']);
  });

  it('gives two sites in one region and country My site and All sites', () => {
    expect(availableScopes([oneRegionA, oneRegionB], oneRegionA.id)).toEqual(['site', 'all']);
  });

  it('adds My region when sites span more than one region in one country', () => {
    expect(availableScopes([oneRegionA, oneRegionB, west], oneRegionA.id)).toEqual(['site', 'region', 'all']);
  });

  it('adds My country when sites span more than one country', () => {
    expect(availableScopes([oneRegionA, west, paris], oneRegionA.id)).toEqual(['site', 'region', 'country', 'all']);
  });

  it('does not treat missing regions as a region', () => {
    const a = siteNamed('A');
    const b = siteNamed('B');
    expect(availableScopes([a, b], a.id)).toEqual(['site', 'all']);
  });

  it('ignores archived sites', () => {
    const closed = siteNamed('Closed', { region: 'North', status: 'archived' });
    const abroad = siteNamed('Abroad', { countryCode: 'FR', status: 'archived' });
    expect(availableScopes([solo, closed, abroad], solo.id)).toEqual(['site']);
  });

  it('gives a viewer without a site nothing', () => {
    expect(availableScopes([oneRegionA, west], undefined)).toEqual([]);
  });
});

describe('peopleInScope', () => {
  const sites = [oneRegionA, oneRegionB, west, paris];
  const a1 = staffAt(oneRegionA, 'Ann', 'One');
  const b1 = staffAt(oneRegionB, 'Bob', 'One');
  const w1 = staffAt(west, 'Wes', 'One');
  const p1 = staffAt(paris, 'Pia', 'One');
  const floater = staffAt(west, 'Flo', 'Float', { additionalSiteIds: [oneRegionA.id] });
  const people = [a1, b1, w1, p1, floater];
  const ids = (list: { id: string }[]) => list.map((p) => p.id).sort();

  it('site: only people whose primary site is the viewer site', () => {
    expect(ids(peopleInScope('site', oneRegionA.id, sites, people))).toEqual([a1.id]);
  });

  it('site: a floating person is not in their additional site', () => {
    expect(ids(peopleInScope('site', oneRegionA.id, sites, people))).not.toContain(floater.id);
  });

  it('region: people at sites sharing the viewer site region', () => {
    expect(ids(peopleInScope('region', oneRegionA.id, sites, people))).toEqual([a1.id, b1.id].sort());
  });

  it('country: people at sites in the viewer country, not abroad', () => {
    expect(ids(peopleInScope('country', oneRegionA.id, sites, people))).toEqual(
      [a1.id, b1.id, w1.id, floater.id].sort(),
    );
  });

  it('all: everyone once', () => {
    expect(ids(peopleInScope('all', oneRegionA.id, sites, people))).toEqual(ids(people));
  });

  it('region falls back to the viewer site when it has no region', () => {
    const bare = siteNamed('Bare');
    const x = staffAt(bare, 'Xan', 'One');
    const y = staffAt(oneRegionA, 'Yan', 'One');
    expect(ids(peopleInScope('region', bare.id, [bare, oneRegionA], [x, y]))).toEqual([x.id]);
  });

  it('never returns people from a site that is not in the sites list', () => {
    const stranger = staffAt(siteNamed('Elsewhere'), 'Sam', 'Stranger');
    expect(ids(peopleInScope('all', oneRegionA.id, sites, [...people, stranger]))).not.toContain(stranger.id);
  });
});

describe('scopedDisplayName', () => {
  const jade = staffAt(solo, 'Jade', 'Marsh');

  it('shows first name and initial at My site', () => {
    expect(scopedDisplayName(jade, solo, 'site')).toBe('Jade M.');
  });

  it.each(['region', 'country', 'all'] as const)('adds the site name at %s scope', (scope) => {
    expect(scopedDisplayName(jade, solo, scope)).toBe('Jade M., Little Acorns');
  });

  it('uses the nickname when there is one, still with the site at wider scopes', () => {
    const nick = staffAt(solo, 'Jade', 'Marsh', { nickname: 'Jaybird' });
    expect(scopedDisplayName(nick, solo, 'all')).toBe('Jaybird, Little Acorns');
  });

  it('never includes the full last name', () => {
    expect(scopedDisplayName(jade, solo, 'all')).not.toContain('Marsh');
  });
});

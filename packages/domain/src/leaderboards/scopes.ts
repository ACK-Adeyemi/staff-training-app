// Leaderboard scopes: My site, My region, My country, All sites (brief 13.5; plan M3 assumption 38).
// People are placed by their primary site only.
import { displayName } from '../competitions/leaderboard';
import type { LeaderboardScope } from '../schemas/engagement';
import type { Person, Site } from '../schemas/tenancy';

/** The scopes a viewer can pick, in order. Archived sites are ignored; missing regions are not a region. */
export function availableScopes(sites: Site[], viewerSiteId: string | undefined): LeaderboardScope[] {
  if (viewerSiteId === undefined) return [];
  const active = sites.filter((s) => s.status === 'active');
  const scopes: LeaderboardScope[] = ['site'];
  if (new Set(active.map((s) => s.region).filter((r) => r !== undefined)).size > 1) scopes.push('region');
  if (new Set(active.map((s) => s.countryCode)).size > 1) scopes.push('country');
  if (active.length > 1) scopes.push('all');
  return scopes;
}

/** People whose primary site is in scope. People are not filtered by status. */
export function peopleInScope(
  scope: LeaderboardScope,
  viewerSiteId: string,
  sites: readonly Site[],
  people: readonly Person[],
): Person[] {
  const viewer = sites.find((s) => s.id === viewerSiteId);
  if (!viewer) return [];
  const inScope = (s: Site): boolean => {
    switch (scope) {
      case 'site':
        return s.id === viewer.id;
      case 'region':
        return s.id === viewer.id || (viewer.region !== undefined && s.region === viewer.region);
      case 'country':
        return s.countryCode === viewer.countryCode;
      case 'all':
        return true;
    }
  };
  const ids = new Set(sites.filter(inScope).map((s) => s.id));
  return people.filter((p) => ids.has(p.primarySiteId));
}

/** "Jade M." at My site; wider scopes add the site: "Jade M., Little Acorns". */
export function scopedDisplayName(person: Person, site: Site, scope: LeaderboardScope): string {
  const name = displayName(person);
  return scope === 'site' ? name : `${name}, ${site.name}`;
}

// Shared route and label lists for the M0 e2e specs. Labels mirror packages/content/src/lang/en-GB.json.
export type NavEntry = { hash: string; label: string };

export const staffTabs: NavEntry[] = [
  { hash: '#/staff', label: 'Home' },
  { hash: '#/staff/learn', label: 'Learn' },
  { hash: '#/staff/progress', label: 'Progress' },
  { hash: '#/staff/compete', label: 'Compete' },
  { hash: '#/staff/me', label: 'Me' },
];
export const staffExtra: NavEntry[] = [
  { hash: '#/staff/notifications', label: 'Notifications' },
  { hash: '#/staff/help', label: 'Help' },
];
export const clientBar: NavEntry[] = [
  { hash: '#/client', label: 'Dashboard' },
  { hash: '#/client/people', label: 'People' },
  { hash: '#/client/modules', label: 'Training' },
  { hash: '#/client/competitions', label: 'Competitions' },
];
export const clientMore: NavEntry[] = [
  { hash: '#/client/reports', label: 'Reports' },
  { hash: '#/client/settings', label: 'Settings' },
  { hash: '#/client/help', label: 'Help' },
];
export const providerBar: NavEntry[] = [
  { hash: '#/provider', label: 'Overview' },
  { hash: '#/provider/clients', label: 'Clients' },
  { hash: '#/provider/content', label: 'Content' },
  { hash: '#/provider/packages', label: 'Commercial' },
];
export const providerMore: NavEntry[] = [
  { hash: '#/provider/tickets', label: 'Support' },
  { hash: '#/provider/comms', label: 'Comms' },
  { hash: '#/provider/team', label: 'Team and security' },
];

/** The 21 shell routes. */
export const shellRoutes: NavEntry[] = [
  ...staffTabs,
  ...staffExtra,
  ...clientBar,
  ...clientMore,
  ...providerBar,
  ...providerMore,
];

/** M2 chunk 12 routes (display and Me). The full M2 route list is added to as chunks land. */
export const displayRoutes: NavEntry[] = [
  { hash: '#/staff/me', label: 'Me' },
  { hash: '#/staff/me/display', label: 'Display and accessibility' },
  { hash: '#/client/display', label: 'Display and accessibility' },
];

/** Narrow a possibly-null value or fail the test. */
export function need<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a value');
  return value;
}

/** M2 chunk 13 routes (Learn and organise). */
export const organiseRoutes: NavEntry[] = [
  { hash: '#/staff/learn', label: 'Learn' },
  { hash: '#/client/organise', label: 'Organise modules' },
];

/** M2 chunk 16 routes (competitions and leaderboard settings). */
export const competeRoutes: NavEntry[] = [
  { hash: '#/staff/compete', label: 'Compete' },
  { hash: '#/client/competitions', label: 'Competitions' },
  { hash: '#/client/competitions/new', label: 'New competition' },
  { hash: '#/client/leaderboards', label: 'Leaderboard settings' },
];

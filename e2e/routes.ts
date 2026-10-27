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
  { hash: '#/client/team', label: 'Team and roles' },
  { hash: '#/client/settings', label: 'Settings' },
  { hash: '#/client/account-status', label: 'Account status' },
  { hash: '#/client/onboarding', label: 'Getting started' },
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

/** M2 chunk 17: every new M2 route without an id in it, once each (F-10). */
export const m2Routes: NavEntry[] = [
  { hash: '#/staff/notes', label: 'My notes' },
  ...displayRoutes,
  ...organiseRoutes,
  ...competeRoutes,
].filter((r, i, all) => all.findIndex((x) => x.hash === r.hash) === i);

/** M3 chunk 13 routes (client foundations). Sign-in sits outside the client shell. */
export const m3Routes: NavEntry[] = [
  { hash: '#/client/team', label: 'Team and roles' },
  { hash: '#/client/settings', label: 'Settings' },
  { hash: '#/client/account-status', label: 'Account status' },
  { hash: '#/client/onboarding', label: 'Getting started' },
  { hash: '#/client/signin', label: 'Two-step sign-in' },
];

/** M3 chunk 14 routes (billing, add-ons and the mock pay page). Routes with an id in them are covered in billing.spec.ts. */
export const m3BillingRoutes: NavEntry[] = [
  { hash: '#/client/billing', label: 'Plan and billing' },
  { hash: '#/client/billing/add-ons', label: 'Add-ons' },
  { hash: '#/client/billing/pay', label: 'Pay now' },
];

/** M3 chunk 16 routes (stats and feedback). P5 (Content) is already a shell route; Content now also holds module feedback. */
export const m3StatsRoutes: NavEntry[] = [
  { hash: '#/client/stats', label: 'Stats' },
  { hash: '#/client/module-feedback', label: 'Module feedback' },
  { hash: '#/provider/content', label: 'Content' },
  { hash: '#/provider/feedback', label: 'App feedback' },
];

/** M3 chunk 17 routes (evidence). Routes with an id in them (#/staff/progress/upload/:requirementId, #/client/evidence/:id) are covered in evidence.spec.ts. */
export const m3EvidenceRoutes: NavEntry[] = [
  { hash: '#/client/evidence', label: 'Evidence to check' },
  { hash: '#/print/first-aiders', label: 'First aiders' },
];

/** M3 chunk 18a routes (rules and reminders). #/staff/notifications is already a shell route. */
export const m3RulesRoutes: NavEntry[] = [
  { hash: '#/client/rules', label: 'Auto-assign rules' },
  { hash: '#/client/reminders', label: 'Reminders' },
  { hash: '#/staff/notifications', label: 'Notifications' },
];

/** M3 chunk 18b routes (calendars). */
export const m3CalendarRoutes: NavEntry[] = [
  { hash: '#/staff/calendar', label: 'Calendar' },
  { hash: '#/client/calendar', label: 'Calendar' },
];

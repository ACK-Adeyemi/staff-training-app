// Client role templates and the category-to-permission compiler. Brief 22.5, 27.5. Placeholders (decisions.md).
export type Level = 'none' | 'view' | 'manage';
export type ClientCategory =
  | 'staff'
  | 'evidence'
  | 'assigning'
  | 'modules'
  | 'reports'
  | 'competitions'
  | 'themes'
  | 'reminders'
  | 'settingsBilling'
  | 'feedbackHelp';
export type ClientLevels = Record<ClientCategory, Level>;

const rank: Record<Level, number> = { none: 0, view: 1, manage: 2 };

/** Permission ids each category gives at 'view' and at 'manage' (manage includes view). */
const categoryPermissions: Record<ClientCategory, { view: string[]; manage: string[] }> = {
  staff: { view: ['staff.view'], manage: ['staff.view', 'staff.manage'] },
  evidence: { view: ['evidence.view'], manage: ['evidence.view'] },
  assigning: { view: ['assign.view'], manage: ['assign.view', 'assign.manage'] },
  modules: { view: ['modules.view'], manage: ['modules.view', 'modules.manage'] },
  reports: { view: ['reports.view'], manage: ['reports.view'] },
  competitions: { view: ['competitions.view'], manage: ['competitions.view', 'competitions.manage'] },
  themes: { view: ['themes.view'], manage: ['themes.view', 'themes.manage'] },
  reminders: { view: ['reminders.view'], manage: ['reminders.view', 'reminders.manage'] },
  settingsBilling: { view: ['settings.view'], manage: ['settings.view', 'settings.manage'] },
  feedbackHelp: {
    view: ['support.raise', 'moduleFeedback.view'],
    manage: ['support.raise', 'moduleFeedback.view'],
  },
};

/** Each Allow toggle and the lowest category level it needs. */
const allowNeeds: Record<string, { category: ClientCategory; level: Level }> = {
  'staff.delete': { category: 'staff', level: 'manage' },
  'team.manageRoles': { category: 'staff', level: 'manage' },
  'evidence.uploadForOthers': { category: 'evidence', level: 'manage' },
  'evidence.approve': { category: 'evidence', level: 'manage' },
  'modules.addLinks': { category: 'modules', level: 'manage' },
  'reports.export': { category: 'reports', level: 'view' },
  'billing.view': { category: 'settingsBilling', level: 'view' },
  'billing.manage': { category: 'settingsBilling', level: 'manage' },
  'org.editName': { category: 'settingsBilling', level: 'manage' },
  'battles.host': { category: 'competitions', level: 'view' },
  'support.viewOrgTickets': { category: 'feedbackHelp', level: 'view' },
  'support.allowStaffTickets': { category: 'feedbackHelp', level: 'manage' },
  'moduleFeedback.respond': { category: 'feedbackHelp', level: 'manage' },
};

export const clientAllowIds = Object.keys(allowNeeds);

/** Compiles category levels and Allow toggles to permission ids. Unknown or under-levelled Allows are dropped. */
export function compileClientRole(levels: ClientLevels, allows: string[]): string[] {
  const out = new Set<string>();
  for (const category of Object.keys(categoryPermissions) as ClientCategory[]) {
    const level = levels[category];
    if (level !== 'none') for (const id of categoryPermissions[category][level]) out.add(id);
  }
  for (const allow of allows) {
    const need = allowNeeds[allow];
    if (need && rank[levels[need.category]] >= rank[need.level]) out.add(allow);
  }
  return [...out];
}

export type ClientRoleKey = 'accountOwner' | 'groupAdmin' | 'siteManager' | 'supervisor' | 'trainer' | 'viewer';

export type ClientRoleTemplate = {
  key: ClientRoleKey;
  name: string;
  levels: ClientLevels;
  allows: string[];
  scope: 'organisation' | 'site';
};

const L = (
  staff: Level,
  evidence: Level,
  assigning: Level,
  modules: Level,
  reports: Level,
  competitions: Level,
  themes: Level,
  reminders: Level,
  settingsBilling: Level,
  feedbackHelp: Level,
): ClientLevels => ({
  staff,
  evidence,
  assigning,
  modules,
  reports,
  competitions,
  themes,
  reminders,
  settingsBilling,
  feedbackHelp,
});

export const clientRoleTemplates: ClientRoleTemplate[] = [
  {
    key: 'accountOwner',
    name: 'Account Owner',
    levels: L('manage', 'manage', 'manage', 'manage', 'manage', 'manage', 'manage', 'manage', 'manage', 'manage'),
    allows: clientAllowIds,
    scope: 'organisation',
  },
  {
    key: 'groupAdmin',
    name: 'Group Admin',
    levels: L('manage', 'manage', 'manage', 'manage', 'manage', 'manage', 'manage', 'manage', 'view', 'manage'),
    allows: clientAllowIds.filter((id) => id !== 'team.manageRoles' && id !== 'billing.manage'),
    scope: 'organisation',
  },
  {
    key: 'siteManager',
    name: 'Site Manager',
    levels: L('manage', 'manage', 'manage', 'view', 'manage', 'manage', 'view', 'manage', 'none', 'manage'),
    allows: [
      'evidence.approve',
      'evidence.uploadForOthers',
      'reports.export',
      'battles.host',
      'moduleFeedback.respond',
    ],
    scope: 'site',
  },
  {
    key: 'supervisor',
    name: 'Supervisor',
    levels: L('view', 'manage', 'manage', 'view', 'view', 'view', 'none', 'view', 'none', 'view'),
    allows: ['evidence.approve', 'battles.host'],
    scope: 'site',
  },
  {
    key: 'trainer',
    name: 'Trainer',
    levels: L('none', 'none', 'view', 'manage', 'view', 'view', 'none', 'none', 'none', 'view'),
    allows: ['modules.addLinks', 'battles.host'],
    scope: 'organisation',
  },
  {
    key: 'viewer',
    name: 'Viewer',
    levels: L('view', 'view', 'view', 'view', 'view', 'view', 'view', 'view', 'view', 'view'),
    allows: [],
    scope: 'organisation',
  },
];

// BP-6: client role templates. Written before the implementation (M0 chunk 4).
//
// API under test (permissions/clientRoles.ts):
//   type Level = 'none' | 'view' | 'manage'
//   type ClientCategory = 'staff' | 'evidence' | 'assigning' | 'modules' | 'reports' | 'competitions'
//                       | 'themes' | 'reminders' | 'settingsBilling' | 'feedbackHelp'
//   compileClientRole(levels: Record<ClientCategory, Level>, allows: string[]): string[]   (permission ids, no duplicates)
//   clientRoleTemplates: { key: 'accountOwner' | 'groupAdmin' | 'siteManager' | 'supervisor' | 'trainer' | 'viewer';
//                          name: string; levels; allows: string[]; scope: 'organisation' | 'site' }[]
// Category to permission mapping chosen for these tests:
//   staff: view gives staff.view; manage adds staff.manage.   assigning: assign.view / assign.manage.
//   modules, competitions, themes, reminders: <area>.view / <area>.manage.
//   evidence: view and manage both give evidence.view only (the rest are Allows).
//   reports: view and manage both give reports.view only.
//   settingsBilling: view gives settings.view; manage adds settings.manage.
//   feedbackHelp: view and manage both give support.raise and moduleFeedback.view.
//   Any category at 'none' gives nothing. Allows are dropped when their category is below what they need
//   (evidence.* need evidence >= manage for approve/uploadForOthers; billing.view needs settingsBilling >= view;
//   billing.manage and org.editName need settingsBilling = manage; battles.host needs competitions >= view).
import { describe, expect, it } from 'vitest';
import { clientCatalogue } from './catalogue';
import { clientRoleTemplates, compileClientRole } from './clientRoles';

type Levels = Parameters<typeof compileClientRole>[0];
const none: Levels = {
  staff: 'none',
  evidence: 'none',
  assigning: 'none',
  modules: 'none',
  reports: 'none',
  competitions: 'none',
  themes: 'none',
  reminders: 'none',
  settingsBilling: 'none',
  feedbackHelp: 'none',
};
const sorted = (xs: string[]) => [...xs].sort();
const template = (key: string) => {
  const t = clientRoleTemplates.find((x) => x.key === key);
  if (!t) throw new Error(`no template ${key}`);
  return t;
};
const compiled = (key: string) => {
  const t = template(key);
  return compileClientRole(t.levels, t.allows);
};

const ACCOUNT_OWNER = [
  'staff.view',
  'staff.manage',
  'staff.delete',
  'team.manageRoles',
  'evidence.view',
  'evidence.uploadForOthers',
  'evidence.approve',
  'assign.view',
  'assign.manage',
  'modules.view',
  'modules.manage',
  'modules.addLinks',
  'reports.view',
  'reports.export',
  'competitions.view',
  'competitions.manage',
  'battles.host',
  'themes.view',
  'themes.manage',
  'reminders.view',
  'reminders.manage',
  'settings.view',
  'settings.manage',
  'org.editName',
  'billing.view',
  'billing.manage',
  'billing.manageAddOns',
  'support.raise',
  'support.viewOrgTickets',
  'support.allowStaffTickets',
  'moduleFeedback.view',
  'moduleFeedback.respond',
];
const GROUP_ADMIN = ACCOUNT_OWNER.filter(
  (p) => !['team.manageRoles', 'billing.manage', 'settings.manage', 'org.editName'].includes(p),
);
const SITE_MANAGER = [
  'staff.view',
  'staff.manage',
  'evidence.view',
  'evidence.uploadForOthers',
  'evidence.approve',
  'assign.view',
  'assign.manage',
  'modules.view',
  'reports.view',
  'reports.export',
  'competitions.view',
  'competitions.manage',
  'battles.host',
  'themes.view',
  'reminders.view',
  'reminders.manage',
  'support.raise',
  'moduleFeedback.view',
  'moduleFeedback.respond',
];
const SUPERVISOR = [
  'staff.view',
  'evidence.view',
  'evidence.approve',
  'assign.view',
  'assign.manage',
  'modules.view',
  'reports.view',
  'competitions.view',
  'battles.host',
  'reminders.view',
  'support.raise',
  'moduleFeedback.view',
];
const TRAINER = [
  'assign.view',
  'modules.view',
  'modules.manage',
  'modules.addLinks',
  'reports.view',
  'competitions.view',
  'battles.host',
  'support.raise',
  'moduleFeedback.view',
];
const VIEWER = [
  'staff.view',
  'evidence.view',
  'assign.view',
  'modules.view',
  'reports.view',
  'competitions.view',
  'themes.view',
  'reminders.view',
  'settings.view',
  'support.raise',
  'moduleFeedback.view',
];

describe('clientRoleTemplates', () => {
  it('holds exactly the six built-in roles', () => {
    expect(sorted(clientRoleTemplates.map((t) => t.key))).toEqual(
      sorted(['accountOwner', 'groupAdmin', 'siteManager', 'supervisor', 'trainer', 'viewer']),
    );
    expect(clientRoleTemplates.map((t) => t.name)).toContain('Account Owner');
  });

  it.each([
    ['accountOwner', ACCOUNT_OWNER],
    ['groupAdmin', GROUP_ADMIN],
    ['siteManager', SITE_MANAGER],
    ['supervisor', SUPERVISOR],
    ['trainer', TRAINER],
    ['viewer', VIEWER],
  ])('%s compiles to its expected permission ids', (key, expected) => {
    expect(sorted(compiled(key))).toEqual(sorted(expected));
  });

  it('compiles with no duplicate ids and only ids that exist in the client catalogue', () => {
    const catalogueIds = new Set(clientCatalogue.map((p) => p.id));
    for (const t of clientRoleTemplates) {
      const ids = compileClientRole(t.levels, t.allows);
      expect(new Set(ids).size, t.key).toBe(ids.length);
      for (const id of ids) expect(catalogueIds.has(id), `${t.key}: ${id}`).toBe(true);
    }
  });

  it('gives the Account Owner every client catalogue permission', () => {
    expect(sorted(compiled('accountOwner'))).toEqual(sorted(clientCatalogue.map((p) => p.id)));
  });

  it('only the Account Owner has team.manageRoles and billing.manage', () => {
    for (const t of clientRoleTemplates) {
      const ids = compiled(t.key);
      const isOwner = t.key === 'accountOwner';
      expect(ids.includes('team.manageRoles'), t.key).toBe(isOwner);
      expect(ids.includes('billing.manage'), t.key).toBe(isOwner);
    }
  });

  it('Supervisor and Site Manager can approve evidence; Trainer and Viewer cannot', () => {
    expect(compiled('supervisor')).toContain('evidence.approve');
    expect(compiled('siteManager')).toContain('evidence.approve');
    expect(compiled('trainer')).not.toContain('evidence.approve');
    expect(compiled('viewer')).not.toContain('evidence.approve');
  });

  it('Supervisor and Viewer cannot see billing', () => {
    expect(compiled('supervisor')).not.toContain('billing.view');
    expect(compiled('viewer')).not.toContain('billing.view');
    expect(compiled('groupAdmin')).toContain('billing.view');
  });

  it('every compiled role is closed under the catalogue requirements', () => {
    const requires = new Map(clientCatalogue.map((p) => [p.id, p.requires]));
    for (const t of clientRoleTemplates) {
      const ids = new Set(compiled(t.key));
      for (const id of ids)
        for (const req of requires.get(id) ?? []) expect(ids.has(req), `${t.key}: ${id} needs ${req}`).toBe(true);
    }
  });

  it('defaults Account Owner, Group Admin, Trainer and Viewer to the whole organisation and Site Manager and Supervisor to their own site', () => {
    expect(template('accountOwner').scope).toBe('organisation');
    expect(template('groupAdmin').scope).toBe('organisation');
    expect(template('trainer').scope).toBe('organisation');
    expect(template('viewer').scope).toBe('organisation');
    expect(template('siteManager').scope).toBe('site');
    expect(template('supervisor').scope).toBe('site');
  });
});

describe('compileClientRole', () => {
  it('gives nothing for all categories at none', () => {
    expect(compileClientRole(none, [])).toEqual([]);
  });

  it('view never yields a .manage permission', () => {
    const allView: Levels = Object.fromEntries(Object.keys(none).map((k) => [k, 'view'])) as Levels;
    const ids = compileClientRole(allView, []);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => id.endsWith('.manage'))).toEqual([]);
  });

  it('manage includes the matching view permission', () => {
    const ids = compileClientRole({ ...none, staff: 'manage' }, []);
    expect(sorted(ids)).toEqual(['staff.manage', 'staff.view']);
  });

  it('drops evidence.approve when evidence is none', () => {
    expect(compileClientRole({ ...none }, ['evidence.approve'])).toEqual([]);
    expect(compileClientRole({ ...none, staff: 'manage' }, ['evidence.approve'])).not.toContain('evidence.approve');
  });

  it('keeps evidence.approve when evidence is manage', () => {
    expect(compileClientRole({ ...none, evidence: 'manage' }, ['evidence.approve'])).toContain('evidence.approve');
  });

  it('drops billing.manage when settingsBilling is only view, but keeps billing.view', () => {
    const ids = compileClientRole({ ...none, settingsBilling: 'view' }, ['billing.view', 'billing.manage']);
    expect(ids).toContain('billing.view');
    expect(ids).not.toContain('billing.manage');
  });

  it('drops billing.view when settingsBilling is none', () => {
    expect(compileClientRole({ ...none }, ['billing.view'])).not.toContain('billing.view');
  });

  it('ignores an allow it does not know', () => {
    expect(compileClientRole({ ...none, staff: 'view' }, ['not.a.permission'])).toEqual(['staff.view']);
  });
});

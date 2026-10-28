// M4 chunk 3 (BP-8): permission matrix helpers for the role editor, compare view and effective list.
// Written before the implementation. Brief 22.3 (dependencies enforced and explained, sensitive group), 22.4, 22.7.
//
// API under test (permissions/matrix.ts):
//   permissionGrid(rolePermissionIds: string[], catalogue: Permission[]): GridRow[]
//     GridRow = { id, area, action, description, granted: boolean, sensitive: boolean, requires: string[] }, catalogue order
//   withDependencies(permissionIds: string[], catalogue: Permission[]): string[]   // adds transitive prerequisites
//   dependencyProblems(permissionIds: string[], catalogue: Permission[]): { permissionId: string; missing: string[] }[]
//   dependantsOf(permissionId: string, catalogue: Permission[]): string[]           // transitive, what would break
//   sensitiveIn(permissionIds: string[], catalogue: Permission[]): string[]
//   compareRoles(a: string[], b: string[]): { added: string[]; removed: string[] }  // going from a to b
//   effectiveWithSources(userId, assignments, roles, now): { permissionId, sources: { roleId?, roleName?, grant?: true }[] }[]
import { describe, expect, it } from 'vitest';
import { idSchema } from '../schemas/primitives';
import type { Role, RoleAssignment } from '../schemas/access';
import { clientCatalogue, providerCatalogue } from './catalogue';
import {
  compareRoles,
  dependantsOf,
  dependencyProblems,
  effectiveWithSources,
  permissionGrid,
  sensitiveIn,
  withDependencies,
} from './matrix';

const id = (tag: string): string => {
  const crockford = tag.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  const value = ('0'.repeat(26) + crockford).slice(-26);
  if (!idSchema.safeParse(value).success) throw new Error(`bad test id ${tag}`);
  return value;
};

const NOW = new Date('2026-10-19T09:00:00.000Z');
const C1 = id('CLIENT1');
const U_A = id('ADA');

const role = (tag: string, name: string, permissionIds: string[]): Role => ({
  id: id(tag),
  owner: { clientId: C1 },
  name,
  description: '',
  colour: '#000000',
  permissionIds,
  system: false,
  version: 1,
  updatedBy: U_A,
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const assignment = (roles: Role[], extra: Partial<RoleAssignment> = {}): RoleAssignment => ({
  id: id('ASSIGN1'),
  userId: U_A,
  roleIds: roles.map((r) => r.id),
  scope: { type: 'clients', ids: [C1] },
  grants: [],
  denies: [],
  status: 'active',
  ...extra,
});

describe('permissionGrid', () => {
  it('lists every catalogue permission with granted yes or no and its sensitive flag', () => {
    const grid = permissionGrid(['staff.view', 'staff.manage', 'staff.delete'], clientCatalogue);
    expect(grid.map((r) => r.id)).toEqual(clientCatalogue.map((p) => p.id));
    const row = (pid: string) => grid.find((r) => r.id === pid);
    expect(row('staff.view')).toMatchObject({ granted: true, sensitive: false, area: 'staff' });
    expect(row('staff.delete')).toMatchObject({ granted: true, sensitive: true });
    expect(row('reports.export')).toMatchObject({ granted: false, sensitive: true });
    expect(row('reports.view')).toMatchObject({ granted: false, sensitive: false });
    expect(grid.filter((r) => r.granted)).toHaveLength(3);
  });
});

describe('dependencies', () => {
  it('granting a permission adds its prerequisites, including indirect ones', () => {
    const result = withDependencies(['org.editName'], clientCatalogue);
    expect(new Set(result)).toEqual(new Set(['org.editName', 'settings.manage', 'settings.view']));
  });

  it('leaves a set that already holds its prerequisites unchanged and reports no problems', () => {
    const ids = ['staff.view', 'staff.manage'];
    expect(new Set(withDependencies(ids, clientCatalogue))).toEqual(new Set(ids));
    expect(dependencyProblems(ids, clientCatalogue)).toEqual([]);
  });

  it('lists a problem for each permission whose prerequisite is missing', () => {
    const problems = dependencyProblems(['billing.manage', 'staff.view', 'reports.export'], clientCatalogue);
    expect(problems).toHaveLength(2);
    expect(problems).toContainEqual({ permissionId: 'billing.manage', missing: ['billing.view'] });
    expect(problems).toContainEqual({ permissionId: 'reports.export', missing: ['reports.view'] });
  });

  it('reports every missing prerequisite when a permission needs more than one', () => {
    const problems = dependencyProblems(['clients.editBilling'], providerCatalogue);
    expect(problems).toHaveLength(1);
    expect(new Set(problems[0]?.missing)).toEqual(new Set(['clients.write', 'billing.read']));
  });

  it('flags dependants when a prerequisite is removed, directly and indirectly', () => {
    expect(new Set(dependantsOf('staff.view', clientCatalogue))).toEqual(new Set(['staff.manage', 'staff.delete']));
    expect(dependantsOf('support.raise', clientCatalogue)).toEqual(
      expect.arrayContaining(['support.viewOrgTickets', 'support.allowStaffTickets']),
    );
    expect(dependantsOf('staff.delete', clientCatalogue)).toEqual([]);

    const afterRemoval = ['staff.manage', 'staff.delete'];
    expect(dependencyProblems(afterRemoval, clientCatalogue)).toContainEqual({
      permissionId: 'staff.manage',
      missing: ['staff.view'],
    });
  });
});

describe('sensitiveIn', () => {
  it('lists only the sensitive permissions in a set', () => {
    const ids = ['staff.view', 'staff.delete', 'billing.view', 'reports.view', 'reports.export'];
    expect(new Set(sensitiveIn(ids, clientCatalogue))).toEqual(new Set(['staff.delete', 'billing.view', 'reports.export']));
    expect(sensitiveIn(['staff.view', 'reports.view'], clientCatalogue)).toEqual([]);
  });
});

describe('compareRoles', () => {
  it('shows what the second role adds and removes compared with the first', () => {
    const diff = compareRoles(['staff.view', 'reports.view', 'assign.view'], ['staff.view', 'assign.view', 'assign.manage']);
    expect(diff.added).toEqual(['assign.manage']);
    expect(diff.removed).toEqual(['reports.view']);
  });

  it('shows no differences for identical roles whatever the order', () => {
    expect(compareRoles(['a.x', 'b.y'], ['b.y', 'a.x'])).toEqual({ added: [], removed: [] });
  });
});

describe('effectiveWithSources', () => {
  it('unions permissions across roles and names each role that gives each permission', () => {
    const viewer = role('VIEWER', 'Viewer', ['staff.view', 'reports.view']);
    const trainer = role('TRAINER', 'Trainer', ['staff.view', 'assign.view', 'assign.manage']);
    const result = effectiveWithSources(U_A, [assignment([viewer, trainer])], [viewer, trainer], NOW);

    const byId = new Map(result.map((r) => [r.permissionId, r]));
    expect(new Set(byId.keys())).toEqual(new Set(['staff.view', 'reports.view', 'assign.view', 'assign.manage']));
    expect(byId.get('staff.view')?.sources.map((s) => s.roleName).sort()).toEqual(['Trainer', 'Viewer']);
    expect(byId.get('reports.view')?.sources).toEqual([expect.objectContaining({ roleId: viewer.id, roleName: 'Viewer' })]);
    expect(byId.get('assign.manage')?.sources.map((s) => s.roleName)).toEqual(['Trainer']);
  });

  it('leaves out denied, inactive and dependency-broken permissions and marks direct grants without a role name', () => {
    const r = role('ROLE1', 'Reporter', ['reports.export']); // reports.view missing, so export is pruned
    const granting = assignment([r], { grants: ['staff.view'], denies: [] });
    const result = effectiveWithSources(U_A, [granting], [r], NOW);
    expect(result.map((x) => x.permissionId)).toEqual(['staff.view']);
    expect(result[0]?.sources).toEqual([{ grant: true }]);

    const suspended = assignment([r], { status: 'suspended' });
    expect(effectiveWithSources(U_A, [suspended], [r], NOW)).toEqual([]);
  });
});

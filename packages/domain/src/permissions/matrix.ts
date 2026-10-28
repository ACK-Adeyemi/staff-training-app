// Permission matrix helpers for the role editor, compare view and effective list. Brief 22.3, 22.4, 22.7.
import type { Permission, Role, RoleAssignment } from '../schemas/access';
import { effectivePermissions } from './engine';

export type GridRow = {
  id: string;
  area: string;
  action: string;
  description: string;
  granted: boolean;
  sensitive: boolean;
  requires: string[];
};

export const permissionGrid = (rolePermissionIds: string[], catalogue: Permission[]): GridRow[] => {
  const held = new Set(rolePermissionIds);
  return catalogue.map((p) => ({
    id: p.id,
    area: p.area,
    action: p.action,
    description: p.description,
    granted: held.has(p.id),
    sensitive: p.sensitive,
    requires: [...p.requires],
  }));
};

const requiresMap = (catalogue: Permission[]): Map<string, string[]> =>
  new Map(catalogue.map((p) => [p.id, p.requires]));

/** Adds every prerequisite, direct and indirect. */
export const withDependencies = (permissionIds: string[], catalogue: Permission[]): string[] => {
  const requires = requiresMap(catalogue);
  const result = new Set<string>();
  const visit = (id: string): void => {
    if (result.has(id)) return;
    result.add(id);
    for (const r of requires.get(id) ?? []) visit(r);
  };
  permissionIds.forEach(visit);
  return [...result];
};

export const dependencyProblems = (
  permissionIds: string[],
  catalogue: Permission[],
): { permissionId: string; missing: string[] }[] => {
  const requires = requiresMap(catalogue);
  const held = new Set(permissionIds);
  const problems: { permissionId: string; missing: string[] }[] = [];
  for (const permissionId of permissionIds) {
    const missing = (requires.get(permissionId) ?? []).filter((r) => !held.has(r));
    if (missing.length > 0) problems.push({ permissionId, missing });
  }
  return problems;
};

/** Everything that directly or indirectly needs this permission, so what would break if it went. */
export const dependantsOf = (permissionId: string, catalogue: Permission[]): string[] => {
  const found = new Set<string>();
  const queue = [permissionId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const p of catalogue) {
      if (p.requires.includes(current) && !found.has(p.id)) {
        found.add(p.id);
        queue.push(p.id);
      }
    }
  }
  found.delete(permissionId);
  return [...found];
};

export const sensitiveIn = (permissionIds: string[], catalogue: Permission[]): string[] => {
  const sensitive = new Set(catalogue.filter((p) => p.sensitive).map((p) => p.id));
  return permissionIds.filter((id) => sensitive.has(id));
};

/** Going from role a to role b. */
export const compareRoles = (a: string[], b: string[]): { added: string[]; removed: string[] } => {
  const from = new Set(a);
  const to = new Set(b);
  return { added: b.filter((id) => !from.has(id)), removed: a.filter((id) => !to.has(id)) };
};

export type EffectiveSource = { roleId?: string; roleName?: string; grant?: true };

export const effectiveWithSources = (
  userId: string,
  assignments: RoleAssignment[],
  roles: Role[],
  now: Date,
): { permissionId: string; sources: EffectiveSource[] }[] => {
  const names = new Map(roles.map((r) => [r.id, r.name]));
  return effectivePermissions(userId, assignments, roles, now).map((p) => ({
    permissionId: p.permissionId,
    sources: p.sources.map((s): EffectiveSource => {
      if (s.roleId === undefined) return { ...s };
      const roleName = names.get(s.roleId);
      return roleName === undefined ? { roleId: s.roleId } : { roleId: s.roleId, roleName };
    }),
  }));
};

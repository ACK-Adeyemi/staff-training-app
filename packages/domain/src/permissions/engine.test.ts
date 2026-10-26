// BP-6: permission engine. Written before the implementation (M0 chunk 4).
//
// API under test (permissions/engine.ts, permissions/catalogue.ts):
//   effectivePermissions(userId, assignments, roles, now: Date): EffectivePermission[]
//   can(perms, permissionId, target, mode = 'write'): boolean
//   canGrant(granterPerms, permissionIds, scope): boolean
//   canEditRolesOf(actorUserId, targetUserId): boolean
//   lastOwnerGuard(change, assignments, roles, now: Date): { ok: true } | { ok: false; reason: 'lastOwner' }
//   canApproveEvidence(actor, submission, context): { allowed, selfApproved?, reason? }
// Owner roles are recognised by `system: true` and name 'Owner' (provider) or 'Account Owner' (client).
import { describe, expect, it } from 'vitest';
import { idSchema } from '../schemas/primitives';
import type { Role, RoleAssignment } from '../schemas/access';
import { clientCatalogue, providerCatalogue } from './catalogue';
import { can, canApproveEvidence, canEditRolesOf, canGrant, effectivePermissions, lastOwnerGuard } from './engine';

const id = (tag: string): string => {
  // Ids use Crockford base32 (no I, L, O or U), so readable tags are mapped onto valid letters.
  const crockford = tag.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  const value = ('0'.repeat(26) + crockford).slice(-26);
  if (!idSchema.safeParse(value).success) throw new Error(`bad test id ${tag}`);
  return value;
};

const NOW = new Date('2026-10-19T09:00:00.000Z');
const U_A = id('ADA');
const U_B = id('BEN');
const U_C = id('CARA');
const C1 = id('CLIENT1');
const C2 = id('CLIENT2');
const RIVERSIDE = id('RIVERSIDE');
const MEADOW = id('MEADOW1');
const P_A = id('PERSONA');
const P_B = id('PERSONB');

const role = (tag: string, permissionIds: string[], extra: Partial<Role> = {}): Role => ({
  id: id(tag),
  owner: { clientId: C1 },
  name: tag,
  description: '',
  colour: '#000000',
  permissionIds,
  system: false,
  version: 1,
  updatedBy: U_A,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...extra,
});

let counter = 0;
const assign = (
  userId: string,
  roles: Role[],
  scope: RoleAssignment['scope'],
  extra: Partial<RoleAssignment> = {},
): RoleAssignment => ({
  id: id(`ASSIGN${counter++}`),
  userId,
  roleIds: roles.map((r) => r.id),
  scope,
  grants: [],
  denies: [],
  status: 'active',
  ...extra,
});

const whole = (clientId: string): RoleAssignment['scope'] => ({ type: 'clients', ids: [clientId] });
const sites = (...ids: string[]): RoleAssignment['scope'] => ({ type: 'sites', ids });

const perms = (userId: string, assignments: RoleAssignment[], roles: Role[], now = NOW) =>
  effectivePermissions(userId, assignments, roles, now);

describe('catalogue', () => {
  it('flags the sensitive permissions and makes every client .manage require its .view', () => {
    const byId = new Map(clientCatalogue.map((p) => [p.id, p]));
    for (const id of [
      'staff.delete',
      'team.manageRoles',
      'evidence.approve',
      'reports.export',
      'billing.view',
      'billing.manage',
    ]) {
      expect(byId.get(id)?.sensitive, id).toBe(true);
    }
    expect(byId.get('staff.view')?.sensitive).toBe(false);
    for (const p of clientCatalogue.filter((p) => p.id.endsWith('.manage') && p.id !== 'team.manageRoles')) {
      expect(p.requires, p.id).toContain(p.id.replace('.manage', '.view'));
    }
    expect(byId.get('evidence.approve')?.requires).toContain('evidence.view');
    expect(byId.get('billing.manage')?.requires).toContain('billing.view');
  });

  it('has unique ids and keeps client and provider catalogues apart', () => {
    for (const cat of [clientCatalogue, providerCatalogue]) {
      expect(new Set(cat.map((p) => p.id)).size).toBe(cat.length);
    }
    const providerIds = new Set(providerCatalogue.map((p) => p.id));
    expect(providerIds.has('owner.transfer')).toBe(true);
    expect(providerIds.has('roles.manage')).toBe(true);
    expect(clientCatalogue.some((p) => providerIds.has(p.id))).toBe(false);
  });
});

describe('effectivePermissions: union and grants', () => {
  it('gives the union of two roles on one assignment', () => {
    const r1 = role('R1', ['staff.view']);
    const r2 = role('R2', ['evidence.view']);
    const a = assign(U_A, [r1, r2], whole(C1));
    const ids = perms(U_A, [a], [r1, r2]).map((p) => p.permissionId);
    expect(ids).toEqual(expect.arrayContaining(['staff.view', 'evidence.view']));
    expect(ids).toHaveLength(2);
  });

  it('keeps both sources when a permission comes from two roles', () => {
    const r1 = role('R1', ['staff.view']);
    const r2 = role('R2', ['staff.view']);
    const a = assign(U_A, [r1, r2], whole(C1));
    const p = perms(U_A, [a], [r1, r2]).find((x) => x.permissionId === 'staff.view');
    expect(p?.sources.map((s) => s.roleId).sort()).toEqual([r1.id, r2.id].sort());
  });

  it('ignores assignments that belong to other users', () => {
    const r1 = role('R1', ['staff.view']);
    const a = assign(U_B, [r1], whole(C1));
    expect(perms(U_A, [a], [r1])).toEqual([]);
  });

  it('lets a grant add a permission only within its own assignment scope', () => {
    const r1 = role('R1', ['staff.view']);
    const a1 = assign(U_A, [r1], sites(RIVERSIDE), { grants: ['evidence.view'] });
    const a2 = assign(U_A, [r1], sites(MEADOW));
    const p = perms(U_A, [a1, a2], [r1]);
    expect(can(p, 'evidence.view', { clientId: C1, siteIds: [RIVERSIDE] }, 'read')).toBe(true);
    expect(can(p, 'evidence.view', { clientId: C1, siteIds: [MEADOW] }, 'read')).toBe(false);
    expect(can(p, 'staff.view', { clientId: C1, siteIds: [MEADOW] }, 'read')).toBe(true);
    const granted = p.find((x) => x.permissionId === 'evidence.view');
    expect(granted?.sources.some((s) => s.grant === true)).toBe(true);
  });
});

describe('effectivePermissions: denies apply globally', () => {
  it('removes a permission that a role gives', () => {
    const r1 = role('R1', ['staff.view', 'evidence.view']);
    const a = assign(U_A, [r1], whole(C1), { denies: ['evidence.view'] });
    const p = perms(U_A, [a], [r1]);
    expect(can(p, 'evidence.view', { clientId: C1 }, 'read')).toBe(false);
    expect(can(p, 'staff.view', { clientId: C1 }, 'read')).toBe(true);
  });

  it('beats a grant of the same permission', () => {
    const r1 = role('R1', ['staff.view']);
    const a = assign(U_A, [r1], whole(C1), { grants: ['evidence.view'], denies: ['evidence.view'] });
    expect(can(perms(U_A, [a], [r1]), 'evidence.view', { clientId: C1 }, 'read')).toBe(false);
  });

  it('beats a grant on a different assignment', () => {
    const r1 = role('R1', ['staff.view']);
    const granting = assign(U_A, [r1], whole(C1), { grants: ['evidence.view'] });
    const denying = assign(U_A, [r1], sites(RIVERSIDE), { denies: ['evidence.view'] });
    expect(can(perms(U_A, [granting, denying], [r1]), 'evidence.view', { clientId: C1 }, 'read')).toBe(false);
  });

  it('on one assignment removes the permission from another assignment scope', () => {
    const r1 = role('R1', ['evidence.view', 'staff.view']);
    const riverside = assign(U_A, [r1], sites(RIVERSIDE), { denies: ['evidence.view'] });
    const meadow = assign(U_A, [r1], sites(MEADOW));
    const p = perms(U_A, [riverside, meadow], [r1]);
    expect(can(p, 'evidence.view', { clientId: C1, siteIds: [MEADOW] }, 'read')).toBe(false);
    expect(can(p, 'evidence.view', { clientId: C1, siteIds: [RIVERSIDE] }, 'read')).toBe(false);
    expect(p.find((x) => x.permissionId === 'evidence.view')).toBeUndefined();
    expect(can(p, 'staff.view', { clientId: C1, siteIds: [MEADOW] }, 'read')).toBe(true);
  });

  it('ignores the denies on a suspended assignment', () => {
    const r1 = role('R1', ['evidence.view']);
    const live = assign(U_A, [r1], whole(C1));
    const suspendedDeny = assign(U_A, [r1], whole(C1), { denies: ['evidence.view'], status: 'suspended' });
    expect(can(perms(U_A, [live, suspendedDeny], [r1]), 'evidence.view', { clientId: C1 }, 'read')).toBe(true);
  });

  it('prunes a dependent permission when its requirement is denied (deny billing.view removes billing.manage)', () => {
    const r1 = role('R1', ['billing.view', 'billing.manage', 'staff.view']);
    const a = assign(U_A, [r1], whole(C1), { denies: ['billing.view'] });
    const p = perms(U_A, [a], [r1]);
    expect(can(p, 'billing.manage', { clientId: C1 })).toBe(false);
    expect(can(p, 'billing.view', { clientId: C1 }, 'read')).toBe(false);
    expect(can(p, 'staff.view', { clientId: C1 }, 'read')).toBe(true);
  });

  it('prunes a permission whose requirement was never held', () => {
    const r1 = role('R1', ['billing.manage']);
    const a = assign(U_A, [r1], whole(C1));
    expect(can(perms(U_A, [a], [r1]), 'billing.manage', { clientId: C1 })).toBe(false);
  });
});

describe('can: scopes', () => {
  it('all matches any client, site and owner', () => {
    const r1 = role('R1', ['clients.read']);
    const p = perms(U_A, [assign(U_A, [r1], { type: 'all' })], [r1]);
    expect(can(p, 'clients.read', { clientId: C1, siteIds: [RIVERSIDE] }, 'read')).toBe(true);
    expect(can(p, 'clients.read', { clientId: C2 })).toBe(true);
    expect(can(p, 'clients.read', {})).toBe(true);
  });

  it('clients matches a listed client and misses an unlisted one', () => {
    const r1 = role('R1', ['staff.view']);
    const p = perms(U_A, [assign(U_A, [r1], whole(C1))], [r1]);
    expect(can(p, 'staff.view', { clientId: C1 }, 'read')).toBe(true);
    expect(can(p, 'staff.view', { clientId: C2 }, 'read')).toBe(false);
  });

  it('a client whole-organisation scope never matches another clientId, even with matching site ids', () => {
    const r1 = role('R1', ['staff.view', 'staff.manage']);
    const p = perms(U_A, [assign(U_A, [r1], whole(C1))], [r1]);
    expect(can(p, 'staff.manage', { clientId: C2, siteIds: [RIVERSIDE] })).toBe(false);
  });

  it('a target without a clientId does not match a clients scope', () => {
    const r1 = role('R1', ['staff.view']);
    const p = perms(U_A, [assign(U_A, [r1], whole(C1))], [r1]);
    expect(can(p, 'staff.view', {}, 'read')).toBe(false);
  });

  it('sites in read mode matches when any target site is listed', () => {
    const r1 = role('R1', ['staff.view']);
    const p = perms(U_A, [assign(U_A, [r1], sites(RIVERSIDE))], [r1]);
    expect(can(p, 'staff.view', { clientId: C1, siteIds: [RIVERSIDE, MEADOW] }, 'read')).toBe(true);
    expect(can(p, 'staff.view', { clientId: C1, siteIds: [MEADOW] }, 'read')).toBe(false);
  });

  it('sites in write mode needs every target site: the Riverside manager can read but not write a Riverside and Meadow person', () => {
    const r1 = role('R1', ['staff.view', 'staff.manage']);
    const p = perms(U_A, [assign(U_A, [r1], sites(RIVERSIDE))], [r1]);
    const target = { clientId: C1, siteIds: [RIVERSIDE, MEADOW] };
    expect(can(p, 'staff.view', target, 'read')).toBe(true);
    expect(can(p, 'staff.manage', target, 'write')).toBe(false);
    expect(can(p, 'staff.manage', target)).toBe(false); // write is the default mode
    expect(can(p, 'staff.manage', { clientId: C1, siteIds: [RIVERSIDE] })).toBe(true);
  });

  it('sites with several listed sites covers a two-site person in write mode', () => {
    const r1 = role('R1', ['staff.view', 'staff.manage']);
    const p = perms(U_A, [assign(U_A, [r1], sites(RIVERSIDE, MEADOW))], [r1]);
    expect(can(p, 'staff.manage', { clientId: C1, siteIds: [RIVERSIDE, MEADOW] })).toBe(true);
  });

  it('sites scope does not match a target with no sites', () => {
    const r1 = role('R1', ['staff.view']);
    const p = perms(U_A, [assign(U_A, [r1], sites(RIVERSIDE))], [r1]);
    expect(can(p, 'staff.view', { clientId: C1 }, 'read')).toBe(false);
  });

  it('own matches records owned by the user and misses others', () => {
    const r1 = role('R1', ['evidence.view']);
    const p = perms(U_A, [assign(U_A, [r1], { type: 'own' })], [r1]);
    expect(can(p, 'evidence.view', { ownerUserId: U_A }, 'read')).toBe(true);
    expect(can(p, 'evidence.view', { ownerUserId: U_B }, 'read')).toBe(false);
    expect(can(p, 'evidence.view', {}, 'read')).toBe(false);
  });

  it('denies a permission nobody holds', () => {
    expect(can([], 'staff.view', { clientId: C1 }, 'read')).toBe(false);
  });
});

describe('effectivePermissions: expiry and suspension', () => {
  const r1 = role('R1', ['staff.view']);
  const has = (a: RoleAssignment, now = NOW) => perms(U_A, [a], [r1], now).length > 0;

  it('an assignment expiring one millisecond after now is active', () => {
    expect(has(assign(U_A, [r1], whole(C1), { expiresAt: '2026-10-19T09:00:00.001Z' }))).toBe(true);
  });

  it('an assignment expiring exactly now is inactive', () => {
    expect(has(assign(U_A, [r1], whole(C1), { expiresAt: NOW.toISOString() }))).toBe(false);
  });

  it('an assignment that expired in the past is inactive', () => {
    expect(has(assign(U_A, [r1], whole(C1), { expiresAt: '2026-10-18T09:00:00.000Z' }))).toBe(false);
  });

  it('an assignment with no expiry stays active', () => {
    expect(has(assign(U_A, [r1], whole(C1)))).toBe(true);
  });

  it('a suspended assignment is inactive', () => {
    expect(has(assign(U_A, [r1], whole(C1), { status: 'suspended' }))).toBe(false);
  });

  it('is evaluated against the now it is given (fast-forwarded past the expiry)', () => {
    const a = assign(U_A, [r1], whole(C1), { expiresAt: '2026-10-25T00:00:00.000Z' });
    expect(has(a, NOW)).toBe(true);
    expect(has(a, new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000))).toBe(false);
  });
});

describe('canGrant: no privilege escalation', () => {
  const manager = role('MGR', ['staff.view', 'staff.manage', 'evidence.view', 'evidence.approve', 'team.manageRoles']);

  it('allows a subset of held permissions over a held scope', () => {
    const p = perms(U_A, [assign(U_A, [manager], whole(C1))], [manager]);
    expect(canGrant(p, ['staff.view', 'staff.manage'], whole(C1))).toBe(true);
  });

  it('refuses a permission the granter lacks', () => {
    const p = perms(U_A, [assign(U_A, [manager], whole(C1))], [manager]);
    expect(canGrant(p, ['staff.view', 'billing.view'], whole(C1))).toBe(false);
  });

  it('refuses a wider scope than the granter holds (sites to whole client)', () => {
    const p = perms(U_A, [assign(U_A, [manager], sites(RIVERSIDE))], [manager]);
    expect(canGrant(p, ['staff.view'], sites(RIVERSIDE))).toBe(true);
    expect(canGrant(p, ['staff.view'], whole(C1))).toBe(false);
    expect(canGrant(p, ['staff.view'], sites(MEADOW))).toBe(false);
    expect(canGrant(p, ['staff.view'], sites(RIVERSIDE, MEADOW))).toBe(false);
  });

  it('refuses another client even when the granter holds the permission for their own', () => {
    const p = perms(U_A, [assign(U_A, [manager], whole(C1))], [manager]);
    expect(canGrant(p, ['staff.view'], whole(C2))).toBe(false);
  });

  it('refuses a global scope from a client-scoped granter', () => {
    const p = perms(U_A, [assign(U_A, [manager], whole(C1))], [manager]);
    expect(canGrant(p, ['staff.view'], { type: 'all' })).toBe(false);
  });

  it('allows any scope when the granter holds the permission everywhere', () => {
    const prov = role('PROV', ['clients.read', 'roles.manage'], { owner: 'provider' });
    const p = perms(U_A, [assign(U_A, [prov], { type: 'all' })], [prov]);
    expect(canGrant(p, ['clients.read'], whole(C2))).toBe(true);
  });

  it('refuses a sensitive permission without team.manageRoles, even if held', () => {
    const approver = role('APPR', ['evidence.view', 'evidence.approve']);
    const p = perms(U_A, [assign(U_A, [approver], whole(C1))], [approver]);
    expect(canGrant(p, ['evidence.view'], whole(C1))).toBe(true);
    expect(canGrant(p, ['evidence.approve'], whole(C1))).toBe(false);
  });

  it('allows a sensitive permission when the granter also holds team.manageRoles', () => {
    const p = perms(U_A, [assign(U_A, [manager], whole(C1))], [manager]);
    expect(canGrant(p, ['evidence.approve'], whole(C1))).toBe(true);
  });

  it('refuses a sensitive provider permission without roles.manage, allows it with', () => {
    const without = role('NOROLES', ['clients.read', 'clients.viewPersonalRecords'], { owner: 'provider' });
    const withRoles = role('WITHROLES', ['clients.read', 'clients.viewPersonalRecords', 'roles.manage'], {
      owner: 'provider',
    });
    const p1 = perms(U_A, [assign(U_A, [without], { type: 'all' })], [without]);
    const p2 = perms(U_B, [assign(U_B, [withRoles], { type: 'all' })], [withRoles]);
    expect(canGrant(p1, ['clients.viewPersonalRecords'], { type: 'all' })).toBe(false);
    expect(canGrant(p2, ['clients.viewPersonalRecords'], { type: 'all' })).toBe(true);
  });
});

describe('canEditRolesOf', () => {
  it('is false when the actor and target are the same person', () => {
    expect(canEditRolesOf(U_A, U_A)).toBe(false);
  });
  it('is true for two different people', () => {
    expect(canEditRolesOf(U_A, U_B)).toBe(true);
  });
});

describe('lastOwnerGuard: provider Owner', () => {
  const owner = role('POWNER', ['owner.transfer'], { owner: 'provider', name: 'Owner', system: true });
  const admin = role('PADMIN', ['clients.read'], { owner: 'provider', name: 'Admin', system: true });
  const only = assign(U_A, [owner], { type: 'all' });
  const second = assign(U_B, [owner], { type: 'all' });
  const roles = [owner, admin];

  it('refuses removing the only Owner assignment', () => {
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: only.id }, [only], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });

  it('refuses removing the Owner role from the only owner', () => {
    const a = assign(U_A, [owner, admin], { type: 'all' });
    expect(lastOwnerGuard({ type: 'removeRole', assignmentId: a.id, roleId: owner.id }, [a], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });

  it('refuses suspending the only owner', () => {
    expect(lastOwnerGuard({ type: 'suspend', assignmentId: only.id }, [only], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });

  it('refuses setting an expiry at or before now on the only owner', () => {
    expect(
      lastOwnerGuard({ type: 'setExpiry', assignmentId: only.id, expiresAt: NOW.toISOString() }, [only], roles, NOW),
    ).toEqual({ ok: false, reason: 'lastOwner' });
  });

  it('refuses deleting the only owner user', () => {
    expect(lastOwnerGuard({ type: 'deleteUser', userId: U_A }, [only], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });

  it('allows each change when a second active owner exists', () => {
    const all = [only, second];
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: only.id }, all, roles, NOW)).toEqual({ ok: true });
    expect(lastOwnerGuard({ type: 'suspend', assignmentId: only.id }, all, roles, NOW)).toEqual({ ok: true });
    expect(
      lastOwnerGuard({ type: 'setExpiry', assignmentId: only.id, expiresAt: NOW.toISOString() }, all, roles, NOW),
    ).toEqual({ ok: true });
    expect(lastOwnerGuard({ type: 'deleteUser', userId: U_A }, all, roles, NOW)).toEqual({ ok: true });
    const both = assign(U_A, [owner, admin], { type: 'all' });
    expect(
      lastOwnerGuard({ type: 'removeRole', assignmentId: both.id, roleId: owner.id }, [both, second], roles, NOW),
    ).toEqual({ ok: true });
  });

  it('does not count an expired or suspended second owner', () => {
    const expired = assign(U_B, [owner], { type: 'all' }, { expiresAt: '2026-10-18T00:00:00.000Z' });
    const suspended = assign(U_C, [owner], { type: 'all' }, { status: 'suspended' });
    expect(
      lastOwnerGuard({ type: 'removeAssignment', assignmentId: only.id }, [only, expired, suspended], roles, NOW),
    ).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });

  it('allows changes to someone who is not an owner', () => {
    const adminAssignment = assign(U_C, [admin], { type: 'all' });
    expect(
      lastOwnerGuard(
        { type: 'removeAssignment', assignmentId: adminAssignment.id },
        [only, adminAssignment],
        roles,
        NOW,
      ),
    ).toEqual({
      ok: true,
    });
    expect(lastOwnerGuard({ type: 'deleteUser', userId: U_C }, [only, adminAssignment], roles, NOW)).toEqual({
      ok: true,
    });
  });
});

describe('lastOwnerGuard: client Account Owner', () => {
  const acctOwner = role('ACCTOWNER', ['staff.view'], { name: 'Account Owner', system: true });
  const otherClientOwner = role('ACCTOWNER2', ['staff.view'], {
    name: 'Account Owner',
    system: true,
    owner: { clientId: C2 },
  });
  const trainer = role('TRAINER', ['modules.view'], { name: 'Trainer', system: true });
  const roles = [acctOwner, otherClientOwner, trainer];

  it('refuses removing, suspending or deleting the only Account Owner of a client', () => {
    const only = assign(U_A, [acctOwner], whole(C1));
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: only.id }, [only], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
    expect(lastOwnerGuard({ type: 'suspend', assignmentId: only.id }, [only], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
    expect(lastOwnerGuard({ type: 'deleteUser', userId: U_A }, [only], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
    expect(
      lastOwnerGuard(
        { type: 'setExpiry', assignmentId: only.id, expiresAt: '2026-10-19T09:00:00.000Z' },
        [only],
        roles,
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'lastOwner' });
  });

  it('refuses removing the Account Owner role from the only owner', () => {
    const a = assign(U_A, [acctOwner, trainer], whole(C1));
    expect(lastOwnerGuard({ type: 'removeRole', assignmentId: a.id, roleId: acctOwner.id }, [a], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });

  it('allows the change when a second active Account Owner exists for the same client', () => {
    const only = assign(U_A, [acctOwner], whole(C1));
    const second = assign(U_B, [acctOwner], whole(C1));
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: only.id }, [only, second], roles, NOW)).toEqual({
      ok: true,
    });
  });

  it('does not count an expired second Account Owner', () => {
    const only = assign(U_A, [acctOwner], whole(C1));
    const expired = assign(U_B, [acctOwner], whole(C1), { expiresAt: '2026-10-01T00:00:00.000Z' });
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: only.id }, [only, expired], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });

  it('does not count another client Account Owner', () => {
    const only = assign(U_A, [acctOwner], whole(C1));
    const elsewhere = assign(U_B, [otherClientOwner], whole(C2));
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: only.id }, [only, elsewhere], roles, NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });
});

describe('canApproveEvidence', () => {
  const approverRole = role('APPROVER', ['evidence.view', 'evidence.approve']);
  const submission = (over: Partial<{ siteId: string; personId: string; uploadedBy: string }> = {}) => ({
    clientId: C1,
    siteId: RIVERSIDE,
    personId: P_B,
    uploadedBy: U_B,
    ...over,
  });
  const actorWith = (scope: RoleAssignment['scope'], roles: Role[] = [approverRole], isAccountOwner = false) => ({
    userId: U_A,
    personId: P_A,
    permissions: perms(U_A, [assign(U_A, roles, scope)], roles),
    isAccountOwner,
  });
  const ctx = (adminCount = 2, allowSelfApproval = false) => ({ adminCount, clientSettings: { allowSelfApproval } });

  it('allows an approver in scope', () => {
    expect(canApproveEvidence(actorWith(sites(RIVERSIDE)), submission(), ctx())).toMatchObject({ allowed: true });
    expect(canApproveEvidence(actorWith(sites(RIVERSIDE)), submission(), ctx()).selfApproved).toBeUndefined();
  });

  it('refuses an approver out of scope with outOfScope', () => {
    expect(canApproveEvidence(actorWith(sites(MEADOW)), submission(), ctx())).toEqual({
      allowed: false,
      reason: 'outOfScope',
    });
  });

  it('refuses an approver for another client with outOfScope', () => {
    expect(canApproveEvidence(actorWith(whole(C2)), submission(), ctx())).toEqual({
      allowed: false,
      reason: 'outOfScope',
    });
  });

  it('refuses someone without evidence.approve with noPermission', () => {
    const viewer = role('VIEWER', ['evidence.view']);
    expect(canApproveEvidence(actorWith(whole(C1), [viewer]), submission(), ctx())).toEqual({
      allowed: false,
      reason: 'noPermission',
    });
  });

  it('refuses the approver approving their own upload with ownUpload', () => {
    expect(canApproveEvidence(actorWith(whole(C1)), submission({ uploadedBy: U_A }), ctx())).toEqual({
      allowed: false,
      reason: 'ownUpload',
    });
  });

  it('refuses evidence about the approver uploaded by someone else with aboutSelf', () => {
    expect(canApproveEvidence(actorWith(whole(C1)), submission({ personId: P_A, uploadedBy: U_B }), ctx())).toEqual({
      allowed: false,
      reason: 'aboutSelf',
    });
  });

  it('single-admin exception: one admin, setting on, Account Owner, own certificate gives selfApproved', () => {
    const actor = actorWith(whole(C1), [approverRole], true);
    expect(canApproveEvidence(actor, submission({ personId: P_A, uploadedBy: U_A }), ctx(1, true))).toEqual({
      allowed: true,
      selfApproved: true,
    });
  });

  it('single-admin exception also covers evidence about the owner uploaded by someone else', () => {
    const actor = actorWith(whole(C1), [approverRole], true);
    expect(canApproveEvidence(actor, submission({ personId: P_A, uploadedBy: U_B }), ctx(1, true))).toEqual({
      allowed: true,
      selfApproved: true,
    });
  });

  it('refuses the same self-approval with the setting off', () => {
    const actor = actorWith(whole(C1), [approverRole], true);
    expect(canApproveEvidence(actor, submission({ personId: P_A, uploadedBy: U_A }), ctx(1, false))).toEqual({
      allowed: false,
      reason: 'ownUpload',
    });
  });

  it('refuses the same self-approval with two admins', () => {
    const actor = actorWith(whole(C1), [approverRole], true);
    const result = canApproveEvidence(actor, submission({ personId: P_A, uploadedBy: U_A }), ctx(2, true));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('ownUpload');
  });

  it('refuses a Supervisor in a single-admin client approving their own evidence (Account Owner only)', () => {
    const actor = actorWith(sites(RIVERSIDE), [approverRole], false);
    const result = canApproveEvidence(actor, submission({ personId: P_A, uploadedBy: U_A }), ctx(1, true));
    expect(result.allowed).toBe(false);
    expect(result.selfApproved).toBeUndefined();
  });

  it('does not let the exception bypass the permission check', () => {
    const viewer = role('VIEWER', ['evidence.view']);
    const actor = actorWith(whole(C1), [viewer], true);
    expect(canApproveEvidence(actor, submission({ personId: P_A, uploadedBy: U_A }), ctx(1, true))).toEqual({
      allowed: false,
      reason: 'noPermission',
    });
  });

  it('does not flag selfApproved on an ordinary approval by a single-admin Account Owner', () => {
    const actor = actorWith(whole(C1), [approverRole], true);
    const result = canApproveEvidence(actor, submission(), ctx(1, true));
    expect(result.allowed).toBe(true);
    expect(result.selfApproved).toBeUndefined();
  });
});

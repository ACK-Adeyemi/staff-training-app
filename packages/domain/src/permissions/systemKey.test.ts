// M1 chunk 1 (K-1): owner roles are recognised by `systemKey`, never by name. Written before the implementation.
import { describe, expect, it } from 'vitest';
import { idSchema } from '../schemas/primitives';
import { roleSchema, type Role, type RoleAssignment } from '../schemas/access';
import * as domain from '../index';
import { lastOwnerGuard } from './engine';

const id = (tag: string): string => {
  const crockford = tag.replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  const value = ('0'.repeat(26) + crockford).slice(-26);
  if (!idSchema.safeParse(value).success) throw new Error(`bad test id ${tag}`);
  return value;
};

const NOW = new Date('2026-10-19T09:00:00.000Z');
const U_A = id('ADA');
const U_B = id('BEN');
const C1 = id('CLIENT1');

const role = (tag: string, extra: Record<string, unknown> = {}): Role => ({
  id: id(tag),
  owner: { clientId: C1 },
  name: tag,
  description: '',
  colour: '#000000',
  permissionIds: ['staff.view'],
  system: false,
  version: 1,
  updatedBy: U_A,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...extra,
});

let counter = 0;
const assign = (userId: string, roles: Role[], extra: Partial<RoleAssignment> = {}): RoleAssignment => ({
  id: id(`SK${counter++}`),
  userId,
  roleIds: roles.map((r) => r.id),
  scope: { type: 'clients', ids: [C1] },
  grants: [],
  denies: [],
  status: 'active',
  ...extra,
});

describe('roleSchema systemKey refine', () => {
  it('accepts a system role that has a systemKey', () => {
    expect(roleSchema.safeParse(role('R1', { system: true, systemKey: 'accountOwner' })).success).toBe(true);
  });
  it('accepts a provider system role with a provider key', () => {
    const r = role('R2', { system: true, systemKey: 'providerOwner', owner: 'provider' });
    expect(roleSchema.safeParse(r).success).toBe(true);
  });
  it('refuses a system role with no systemKey', () => {
    expect(roleSchema.safeParse(role('R3', { system: true })).success).toBe(false);
  });
  it('refuses a non-system role that carries a systemKey', () => {
    expect(roleSchema.safeParse(role('R4', { system: false, systemKey: 'accountOwner' })).success).toBe(false);
  });
  it('refuses an unknown systemKey', () => {
    expect(roleSchema.safeParse(role('R5', { system: true, systemKey: 'superUser' })).success).toBe(false);
  });
  it('still accepts a plain custom role with no systemKey', () => {
    expect(roleSchema.safeParse(role('R6')).success).toBe(true);
  });
});

describe('OWNER_KEYS', () => {
  it('names the provider and client owner keys', () => {
    expect((domain as Record<string, unknown>)['OWNER_KEYS']).toEqual({
      provider: 'providerOwner',
      client: 'accountOwner',
    });
  });
});

describe('lastOwnerGuard uses systemKey, not the role name', () => {
  it('guards a renamed system Account Owner role', () => {
    const owner = role('HEADOFHOUSE', { system: true, systemKey: 'accountOwner', name: 'Head of House' });
    const a = assign(U_A, [owner]);
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: a.id }, [a], [owner], NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });
  it('does not treat a custom role named Account Owner as an owner', () => {
    const fake = role('FAKEOWNER', { name: 'Account Owner' });
    const a = assign(U_A, [fake]);
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: a.id }, [a], [fake], NOW)).toEqual({ ok: true });
  });
  it('does not treat a non-owner system role named Account Owner as an owner', () => {
    const odd = role('ODDSYS', { system: true, systemKey: 'groupAdmin', name: 'Account Owner' });
    const a = assign(U_A, [odd]);
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: a.id }, [a], [odd], NOW)).toEqual({ ok: true });
  });
  it('guards a renamed provider owner with systemKey providerOwner', () => {
    const owner = role('PROVBOSS', { owner: 'provider', system: true, systemKey: 'providerOwner', name: 'Founder' });
    const a = assign(U_A, [owner], { scope: { type: 'all' } as RoleAssignment['scope'] });
    expect(lastOwnerGuard({ type: 'suspend', assignmentId: a.id }, [a], [owner], NOW)).toEqual({
      ok: false,
      reason: 'lastOwner',
    });
  });
  it('does not treat a provider system role named Owner but keyed providerAdmin as an owner', () => {
    const admin = role('PROVADM', { owner: 'provider', system: true, systemKey: 'providerAdmin', name: 'Owner' });
    const a = assign(U_A, [admin], { scope: { type: 'all' } as RoleAssignment['scope'] });
    expect(lastOwnerGuard({ type: 'suspend', assignmentId: a.id }, [a], [admin], NOW)).toEqual({ ok: true });
  });
  it('allows the change when a second active renamed owner exists', () => {
    const owner = role('HEADOFHOUSE', { system: true, systemKey: 'accountOwner', name: 'Head of House' });
    const a = assign(U_A, [owner]);
    const b = assign(U_B, [owner]);
    expect(lastOwnerGuard({ type: 'removeAssignment', assignmentId: a.id }, [a, b], [owner], NOW)).toEqual({
      ok: true,
    });
  });
});

describe('isAssignmentActive', () => {
  const isAssignmentActive = (domain as Record<string, unknown>)['isAssignmentActive'] as (
    a: RoleAssignment,
    now: Date,
  ) => boolean;
  const base = assign(U_A, []);

  it('is exported from the domain package', () => {
    expect(typeof isAssignmentActive).toBe('function');
  });
  it('is active when status is active and there is no expiry', () => {
    expect(isAssignmentActive(base, NOW)).toBe(true);
  });
  it('is inactive when expiry equals now', () => {
    expect(isAssignmentActive({ ...base, expiresAt: NOW.toISOString() }, NOW)).toBe(false);
  });
  it('is active when expiry is one millisecond after now', () => {
    expect(isAssignmentActive({ ...base, expiresAt: new Date(NOW.getTime() + 1).toISOString() }, NOW)).toBe(true);
  });
  it('is inactive when expiry is one millisecond before now', () => {
    expect(isAssignmentActive({ ...base, expiresAt: new Date(NOW.getTime() - 1).toISOString() }, NOW)).toBe(false);
  });
  it('is inactive when suspended', () => {
    expect(isAssignmentActive({ ...base, status: 'suspended' }, NOW)).toBe(false);
  });
});

// M3 chunk 1: billing.manageAddOns (plan assumption 6, conflict 6). Written before the implementation.
import { describe, expect, it } from 'vitest';
import { clientCatalogue } from './catalogue';
import { clientRoleTemplates, compileClientRole } from './clientRoles';

const compiled = (key: string): string[] => {
  const t = clientRoleTemplates.find((x) => x.key === key);
  if (!t) throw new Error(`no template ${key}`);
  return compileClientRole(t.levels, t.allows);
};

describe('billing.manageAddOns in the client catalogue', () => {
  const perm = clientCatalogue.find((p) => p.id === 'billing.manageAddOns');

  it('exists, is sensitive and requires billing.view', () => {
    expect(perm).toBeDefined();
    expect(perm?.sensitive).toBe(true);
    expect(perm?.requires).toEqual(['billing.view']);
  });

  it('keeps billing.manage as a separate permission that still requires billing.view', () => {
    const manage = clientCatalogue.find((p) => p.id === 'billing.manage');
    expect(manage?.requires).toEqual(['billing.view']);
  });
});

describe('billing.manageAddOns in the role templates', () => {
  it('gives the Account Owner billing.view, billing.manageAddOns and billing.manage', () => {
    const ids = compiled('accountOwner');
    for (const p of ['billing.view', 'billing.manageAddOns', 'billing.manage']) expect(ids).toContain(p);
  });

  it('gives the Group Admin billing.view and billing.manageAddOns but not billing.manage', () => {
    const ids = compiled('groupAdmin');
    expect(ids).toContain('billing.view');
    expect(ids).toContain('billing.manageAddOns');
    expect(ids).not.toContain('billing.manage');
  });

  it.each(['siteManager', 'supervisor', 'trainer', 'viewer'])('%s has none of the billing permissions', (key) => {
    const ids = compiled(key);
    for (const p of ['billing.view', 'billing.manageAddOns', 'billing.manage']) expect(ids, p).not.toContain(p);
  });

  it('only the Account Owner and Group Admin hold it', () => {
    const holders = clientRoleTemplates
      .filter((t) => compiled(t.key).includes('billing.manageAddOns'))
      .map((t) => t.key);
    expect(holders.sort()).toEqual(['accountOwner', 'groupAdmin']);
  });
});

describe('compileClientRole with the billing.manageAddOns Allow', () => {
  const levels = (settingsBilling: 'none' | 'view' | 'manage') =>
    ({
      staff: 'none',
      evidence: 'none',
      assigning: 'none',
      modules: 'none',
      reports: 'none',
      competitions: 'none',
      themes: 'none',
      reminders: 'none',
      settingsBilling,
      feedbackHelp: 'none',
    }) as Parameters<typeof compileClientRole>[0];

  it('drops the Allow when Settings and billing is none', () => {
    expect(compileClientRole(levels('none'), ['billing.manageAddOns'])).not.toContain('billing.manageAddOns');
  });

  it('keeps the Allow at manage, together with billing.view that it requires', () => {
    const ids = compileClientRole(levels('manage'), ['billing.manageAddOns']);
    expect(ids).toContain('billing.manageAddOns');
    expect(ids).toContain('billing.view');
  });

  it('does not grant billing.manage by itself', () => {
    expect(compileClientRole(levels('manage'), ['billing.manageAddOns'])).not.toContain('billing.manage');
  });
});

import { describe, expect, it } from 'vitest';
import { closePermissions } from './catalogue';

describe('closePermissions', () => {
  it('adds every transitive requirement once', () => {
    expect([...closePermissions(['team.reset2fa']).sort()]).toEqual(['team.manage', 'team.read', 'team.reset2fa']);
  });
  it('leaves permissions without requirements alone', () => {
    expect(closePermissions(['ops.read'])).toEqual(['ops.read']);
  });
});

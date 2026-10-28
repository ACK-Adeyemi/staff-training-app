// BP-9 (pure part): two-step sign-in status and the authenticator link (brief 22.6; M3 assumptions 3 and 4).
//
// API under test (twoFactor.ts):
//   twoFactorStatus(user: UserAccount, now: Date):
//       { kind: 'notRequired' } | { kind: 'enrolled' } | { kind: 'grace'; daysLeft: number } | { kind: 'limited' }
//     staff users are always notRequired (even if the field is set); an enrolled user (twoFactor present) is enrolled;
//     no twoFactorRequiredSince means notRequired; otherwise grace for adminConfig.twoFactorGraceDays (7) with daysLeft
//     = 7 minus whole London days since twoFactorRequiredSince, then limited
//   otpauthUri(secret: string, label: string, issuer?: string): string
//       otpauth://totp/{issuer}:{label}?secret=...&issuer=... with the label and issuer percent-encoded; throws on an empty secret
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import type { UserAccount } from './schemas/tenancy';
import { otpauthUri, twoFactorStatus } from './twoFactor';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const user = (over: Partial<UserAccount> = {}): UserAccount => ({
  id: '01HZX0000000000000000000U1',
  side: 'client',
  clientId: '01HZX0000000000000000000C1',
  displayName: 'Daniel Okafor',
  status: 'active',
  login: { method: 'emailPassword', pinSet: false },
  ...over,
});
const since = (daysAgo: number): string => addDays(NOW, -daysAgo).toISOString();

describe('twoFactorStatus', () => {
  it('is notRequired for a client admin with no requirement date', () => {
    expect(twoFactorStatus(user(), NOW)).toEqual({ kind: 'notRequired' });
  });

  it('is enrolled once a second step is set up, whatever the date', () => {
    const enrolled = user({
      twoFactorRequiredSince: since(40),
      twoFactor: { enrolledAt: since(30), recoveryCodesLeft: 10 },
    });
    expect(twoFactorStatus(enrolled, NOW)).toEqual({ kind: 'enrolled' });
  });

  it('is in grace with the days left, 5 left two days in', () => {
    expect(twoFactorStatus(user({ twoFactorRequiredSince: since(2) }), NOW)).toEqual({ kind: 'grace', daysLeft: 5 });
  });

  it('counts down to 1 on day 6', () => {
    expect(twoFactorStatus(user({ twoFactorRequiredSince: since(6) }), NOW)).toEqual({ kind: 'grace', daysLeft: 1 });
  });

  it('has the full 7 days left on the day it is required', () => {
    expect(twoFactorStatus(user({ twoFactorRequiredSince: since(0) }), NOW)).toEqual({ kind: 'grace', daysLeft: 7 });
  });

  it('is limited after the grace period (Colin, required 12 days ago)', () => {
    expect(twoFactorStatus(user({ twoFactorRequiredSince: since(12) }), NOW)).toEqual({ kind: 'limited' });
    expect(twoFactorStatus(user({ twoFactorRequiredSince: since(8) }), NOW)).toEqual({ kind: 'limited' });
  });

  it('never asks staff users, even with the field set', () => {
    const staff = user({ side: 'staff', twoFactorRequiredSince: since(30) });
    expect(twoFactorStatus(staff, NOW)).toEqual({ kind: 'notRequired' });
  });

  it('moves from grace to limited as the clock moves on (fast-forward)', () => {
    const u = user({ twoFactorRequiredSince: since(2) });
    expect(twoFactorStatus(u, addDays(NOW, 3)).kind).toBe('grace');
    expect(twoFactorStatus(u, addDays(NOW, 10)).kind).toBe('limited');
  });
});

describe('otpauthUri', () => {
  const SECRET = 'JBSWY3DPEHPK3PXP';

  it('builds a totp link with the secret and an issuer', () => {
    const url = new URL(otpauthUri(SECRET, 'priya@example.test'));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(url.searchParams.get('secret')).toBe(SECRET);
    expect(url.searchParams.get('issuer')).toBeTruthy();
    expect(decodeURIComponent(url.pathname)).toContain('priya@example.test');
  });

  it('uses the issuer passed in, in both the path and the query', () => {
    const uri = otpauthUri(SECRET, 'a@example.test', 'Demo Training');
    const url = new URL(uri);
    expect(url.searchParams.get('issuer')).toBe('Demo Training');
    expect(decodeURIComponent(url.pathname)).toContain('Demo Training');
  });

  it('percent-encodes spaces and symbols in the label so the link stays one piece', () => {
    const uri = otpauthUri(SECRET, 'Mary Jane & Co');
    expect(uri).not.toMatch(/\s/);
    expect(uri.split('?')).toHaveLength(2);
    expect(uri).not.toContain('&Co');
  });

  it('refuses an empty secret', () => {
    expect(() => otpauthUri('', 'a@example.test')).toThrow();
  });
});

// Two-step sign-in status and the authenticator link (brief 22.6; M3 assumptions 3 and 4).
import { adminConfig } from './config/admin';
import { daysBetween } from './dates';
import type { UserAccount } from './schemas/tenancy';

export type TwoFactorStatus =
  { kind: 'notRequired' } | { kind: 'enrolled' } | { kind: 'grace'; daysLeft: number } | { kind: 'limited' };

export function twoFactorStatus(user: UserAccount, now: Date): TwoFactorStatus {
  if (user.side === 'staff') return { kind: 'notRequired' };
  if (user.twoFactor) return { kind: 'enrolled' };
  if (!user.twoFactorRequiredSince) return { kind: 'notRequired' };
  const daysLeft = adminConfig.twoFactorGraceDays - daysBetween(new Date(user.twoFactorRequiredSince), now);
  return daysLeft > 0 ? { kind: 'grace', daysLeft } : { kind: 'limited' };
}

export function otpauthUri(secret: string, label: string, issuer = 'Staff Training Demo'): string {
  if (!secret) throw new Error('A secret is needed to build the authenticator link');
  const i = encodeURIComponent(issuer);
  return `otpauth://totp/${i}:${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${i}`;
}

/** The fixed code the demo accepts as a correct authenticator code (simulated; Demo only, M3 assumption 4). */
export const demoTwoFactorCode = '123456';
export const recoveryCodeCount = 10;
/** Wrong codes in a row that lock code entry, and for how long (M3 assumption 4). */
export const maxWrongCodes = 5;
export const codeLockMinutes = 15;

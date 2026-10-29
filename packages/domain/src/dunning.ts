// Pure helpers for the provider dunning view (M4 chunk 12a, brief 24.7).
import { daysBetween } from './dates';
import type { PaymentAttempt } from './schemas/commercial';

/**
 * Share of clients that recovered, as a whole percent: clients with a success attempt later than their first failed
 * (soft or hard) attempt, over clients with at least one failed attempt. Null when no client ever failed.
 */
export function recoveryRatePercent(attempts: readonly PaymentAttempt[]): number | null {
  const firstFail = new Map<string, number>();
  for (const a of attempts) {
    if (a.result === 'success') continue;
    firstFail.set(a.clientId, Math.min(firstFail.get(a.clientId) ?? Infinity, Date.parse(a.at)));
  }
  if (firstFail.size === 0) return null;
  let recovered = 0;
  for (const [clientId, at] of firstFail) {
    if (attempts.some((a) => a.clientId === clientId && a.result === 'success' && Date.parse(a.at) > at))
      recovered += 1;
  }
  return Math.round((100 * recovered) / firstFail.size);
}

/** Whole London days from `now` to `at` (never negative). */
export function daysUntil(now: Date, at: Date): number {
  return Math.max(0, daysBetween(now, at));
}

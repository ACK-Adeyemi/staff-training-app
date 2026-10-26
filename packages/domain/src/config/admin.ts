// Placeholder numbers for the client admin features (M3 plan Design, "config/admin.ts"; brief 24.3, 22.6).
// Every value here is a placeholder the user can change in one place.
import type { DunningPolicy } from '../schemas/commercial';

/** Dunning timeline used until the provider side edits it (brief 24.3 placeholders). */
export const defaultDunningPolicy: DunningPolicy = {
  graceDays: 14,
  limitedUntilDay: 30,
  readOnlyUntilDay: 60,
  closedUntilDay: 150,
  deleteWithinDays: 30,
};

export const adminConfig = {
  /** Days a client admin may use the app before two-step sign-in is required (assumption 3). */
  twoFactorGraceDays: 7,
} as const;

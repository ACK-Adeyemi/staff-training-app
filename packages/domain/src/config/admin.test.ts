// The M3 placeholders that chunk 2 reads (plan M3 Design: config/admin.ts; brief 13.5, 14, 27.4, 28.3).
// Each is a placeholder the user can change in one place; this pins the names and current values the other modules rely on.
import { describe, expect, it } from 'vitest';
import { adminConfig } from './admin';

describe('adminConfig placeholders', () => {
  it('keeps the two-factor grace of 7 days', () => {
    expect(adminConfig.twoFactorGraceDays).toBe(7);
  });

  it.each([
    ['smallSiteMinimum', 3], // Sites with fewer eligible people are marked small (brief 13.5)
    ['newStarterDays', 14], // New starters are left out of the Sites board for this long (brief 13.5)
    ['waitingHighlightWorkingDays', 3], // More than this many working days waiting is highlighted (assumption 22)
    ['firstAiderForecastWeeks', 12], // Weeks in the first aiders forecast (assumption 23)
    ['formerlyNameDays', 90], // "formerly {old name}" shows for this long (BP-8)
  ] as const)('%s is %i', (key, value) => {
    expect((adminConfig as Record<string, unknown>)[key]).toBe(value);
  });
});

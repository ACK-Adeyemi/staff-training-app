import { describe, expect, it } from 'vitest';
import { responseStatus } from './responseTarget';

const created = '2026-10-19T09:00:00.000Z';
const base = { createdAt: created, status: 'received' as const };

describe('responseStatus', () => {
  it('is due after the target hours and not breached before then', () => {
    const r = responseStatus(base, 24, new Date('2026-10-20T08:59:59.000Z'));
    expect(r).toEqual({ responseDueAt: '2026-10-20T09:00:00.000Z', breached: false });
  });
  it('is breached once the due time has passed', () => {
    expect(responseStatus(base, 24, new Date('2026-10-20T09:00:01.000Z')).breached).toBe(true);
  });
  it('has no due time once replied, resolved or closed', () => {
    const now = new Date('2026-12-01T00:00:00.000Z');
    expect(responseStatus({ ...base, firstResponseAt: created }, 4, now)).toEqual({ breached: false });
    expect(responseStatus({ ...base, status: 'resolved' }, 4, now)).toEqual({ breached: false });
    expect(responseStatus({ ...base, status: 'closed' }, 4, now)).toEqual({ breached: false });
  });
});

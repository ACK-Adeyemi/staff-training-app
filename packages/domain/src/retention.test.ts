// BP-19 (pure part): scheduled deletion dates for the Data and retention page (brief 24.6; M3 assumption 50).
// Nothing is deleted in M3; the page only shows dates.
//
// API under test (retention.ts):
//   scheduledDeletions(input: {
//     now: Date;
//     retention: { leaverRecordsMonths; notesAfterLeaveDays; ... };          // RetentionPolicy
//     people: { id: string; leftDate?: string }[];
//     files: { id: string; kind: 'rejected' | 'superseded'; reviewedAt: string }[];   // certificate files
//     accountDeletionAt?: string;                                            // end of Closed, when the account is closing
//   }): ScheduledDeletion[]
//   ScheduledDeletion = { category: 'leaverRecords' | 'leaverNotes' | 'certificateFile' | 'account'; subjectId?: string; at: string }
//     leaverRecords: leftDate + leaverRecordsMonths months (London calendar months); leaverNotes: leftDate + notesAfterLeaveDays;
//     certificateFile: reviewedAt + 90 days; account: accountDeletionAt as given. People without a leftDate give nothing.
//     Dates already in the past are still listed. Sorted by `at` ascending, ties by category then subjectId.
import { describe, expect, it } from 'vitest';
import { addDays, addMonths, londonDateString } from './dates';
import { scheduledDeletions } from './retention';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const retention = {
  leaverRecordsMonths: 72,
  notesAfterLeaveDays: 30,
  eventDetailMonths: 24,
  feedbackMonths: 24,
  ticketMonthsAfterClose: 24,
  attachmentDaysAfterClose: 90,
  trialDeleteDays: 30,
};
const input = (over: Record<string, unknown> = {}) => ({
  now: NOW,
  retention,
  people: [] as { id: string; leftDate?: string }[],
  files: [] as { id: string; kind: 'rejected' | 'superseded'; reviewedAt: string }[],
  ...over,
});
const find = (list: ReturnType<typeof scheduledDeletions>, category: string, subjectId?: string) =>
  list.find((d) => d.category === category && (subjectId === undefined || d.subjectId === subjectId));

describe('scheduledDeletions', () => {
  it('returns nothing when there is nothing to delete', () => {
    expect(scheduledDeletions(input())).toEqual([]);
  });

  it('schedules a leaver record the configured number of months after they left', () => {
    const left = '2026-01-15T10:00:00.000Z';
    const list = scheduledDeletions(input({ people: [{ id: 'p1', leftDate: left }] }));
    const d = find(list, 'leaverRecords', 'p1');
    expect(d).toBeDefined();
    expect(londonDateString(new Date(d!.at))).toBe(londonDateString(addMonths(new Date(left), 72)));
    expect(londonDateString(new Date(d!.at))).toBe('2032-01-15');
  });

  it('schedules a leaver notes deletion the configured days after they left', () => {
    const left = '2026-10-01T10:00:00.000Z';
    const d = find(scheduledDeletions(input({ people: [{ id: 'p1', leftDate: left }] })), 'leaverNotes', 'p1');
    expect(londonDateString(new Date(d!.at))).toBe(londonDateString(addDays(new Date(left), 30)));
    expect(londonDateString(new Date(d!.at))).toBe('2026-10-31');
  });

  it('follows the retention settings when they change', () => {
    const left = '2026-01-15T10:00:00.000Z';
    const list = scheduledDeletions(
      input({
        retention: { ...retention, leaverRecordsMonths: 12, notesAfterLeaveDays: 90 },
        people: [{ id: 'p1', leftDate: left }],
      }),
    );
    expect(londonDateString(new Date(find(list, 'leaverRecords')!.at))).toBe('2027-01-15');
    expect(londonDateString(new Date(find(list, 'leaverNotes')!.at))).toBe('2026-04-15');
  });

  it('ignores people who have not left', () => {
    expect(scheduledDeletions(input({ people: [{ id: 'p1' }, { id: 'p2' }] }))).toEqual([]);
  });

  it('schedules rejected and superseded certificate files 90 days after review', () => {
    const list = scheduledDeletions(
      input({
        files: [
          { id: 'f1', kind: 'rejected', reviewedAt: '2026-10-01T09:00:00.000Z' },
          { id: 'f2', kind: 'superseded', reviewedAt: '2026-09-01T09:00:00.000Z' },
        ],
      }),
    );
    expect(londonDateString(new Date(find(list, 'certificateFile', 'f1')!.at))).toBe('2026-12-30');
    expect(londonDateString(new Date(find(list, 'certificateFile', 'f2')!.at))).toBe('2026-11-30');
  });

  it('lists the whole-account deletion date when the account is closing', () => {
    const list = scheduledDeletions(input({ accountDeletionAt: '2027-03-20T00:00:00.000Z' }));
    expect(find(list, 'account')?.at).toBe('2027-03-20T00:00:00.000Z');
    expect(scheduledDeletions(input())).not.toContainEqual(expect.objectContaining({ category: 'account' }));
  });

  it('sorts by date with the soonest first', () => {
    const list = scheduledDeletions(
      input({
        accountDeletionAt: '2027-03-20T00:00:00.000Z',
        people: [{ id: 'p1', leftDate: '2026-10-01T10:00:00.000Z' }],
        files: [{ id: 'f1', kind: 'rejected', reviewedAt: '2026-10-20T09:00:00.000Z' }],
      }),
    );
    const times = list.map((d) => Date.parse(d.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(list[0]?.category).toBe('leaverNotes');
    expect(list.at(-1)?.category).toBe('leaverRecords');
  });

  it('does not change the input', () => {
    const people = [{ id: 'p1', leftDate: '2026-01-15T10:00:00.000Z' }];
    const copy = structuredClone(people);
    scheduledDeletions(input({ people }));
    expect(people).toEqual(copy);
  });
});

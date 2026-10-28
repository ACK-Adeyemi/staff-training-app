// Scheduled deletion dates for the Data and retention page (brief 24.6; M3 assumption 50).
// Nothing is deleted in M3; the page only shows dates.
import { addDays, addMonths } from './dates';
import type { Client } from './schemas/tenancy';

export type ScheduledDeletion = {
  category: 'leaverRecords' | 'leaverNotes' | 'certificateFile' | 'account';
  subjectId?: string;
  at: string;
};

/** Rejected and superseded certificate files are kept this long after review. */
const CERTIFICATE_FILE_DAYS = 90;

export function scheduledDeletions(input: {
  now: Date;
  retention: Client['settings']['retention'];
  people: { id: string; leftDate?: string }[];
  files: { id: string; kind: 'rejected' | 'superseded'; reviewedAt: string }[];
  accountDeletionAt?: string;
}): ScheduledDeletion[] {
  const out: ScheduledDeletion[] = [];
  for (const p of input.people) {
    if (!p.leftDate) continue;
    const left = new Date(p.leftDate);
    out.push({
      category: 'leaverRecords',
      subjectId: p.id,
      at: addMonths(left, input.retention.leaverRecordsMonths).toISOString(),
    });
    out.push({
      category: 'leaverNotes',
      subjectId: p.id,
      at: addDays(left, input.retention.notesAfterLeaveDays).toISOString(),
    });
  }
  for (const f of input.files) {
    out.push({
      category: 'certificateFile',
      subjectId: f.id,
      at: addDays(new Date(f.reviewedAt), CERTIFICATE_FILE_DAYS).toISOString(),
    });
  }
  if (input.accountDeletionAt) out.push({ category: 'account', at: input.accountDeletionAt });
  return out.sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) ||
      a.category.localeCompare(b.category) ||
      (a.subjectId ?? '').localeCompare(b.subjectId ?? ''),
  );
}

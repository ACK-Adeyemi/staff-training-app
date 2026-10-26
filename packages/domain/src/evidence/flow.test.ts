// BP-15: external evidence rules (plan Assumption 22; brief 27).
//
// API under test:
//   expiryFor(requirement, completedAt: Date | string, enteredExpiry?: string):
//       { ok: true; expiresAt?: string; expected: boolean } | { ok: false; error: 'expiryRequired' | 'expiryBeforeCompleted' }
//       fromCertificate: the entered expiry is required (and not before completedAt), expected false;
//       fromRenewalPeriod: completedAt + renewEveryMonths (London months), expected true, entered value ignored;
//       fromRenewalPeriod without renewEveryMonths: ok with no expiresAt.
//   reviewTransition(submission, decision, now):
//       { ok: true; submission: EvidenceSubmission; changes: { completedAt?: { before: string; after: string }; expiresAt?: { before?: string; after: string } } }
//       | { ok: false; error: 'notAwaitingCheck' | 'noteRequired' | 'noteTooLong' | 'reasonInvalid' | 'expiryBeforeCompleted' }
//     decision = { kind: 'approve'; reviewerId; completedAt?: string; expiresAt?: string }
//              | { kind: 'betterCopy'; reviewerId; note: string }            // trimmed note 1 to 300 characters
//              | { kind: 'reject'; reviewerId; reason: RejectionReason; note?: string }
//     RejectionReason = 'notRightCourse' | 'nameMismatch' | 'expired' | 'unreadable' | 'other'
//     only a submission in awaitingCheck can be decided. Approved -> status approved; betterCopy -> needsBetterCopy with decisionNote;
//     reject -> rejected with rejectionReason (and decisionNote when given); all set reviewerId and reviewedAt = now.
//   londonWorkingDaysBetween(from: Date, to: Date): number
//       London weekdays after from's day up to and including to's day (Monday to Friday, no bank holidays); time of day ignored; 0 if to <= from.
//   isWaitingTooLong(createdAt: string | Date, now: Date, limit = 3): boolean   // more than `limit` working days
import { describe, expect, it } from 'vitest';
import type { EvidenceSubmission } from '../schemas/evidence';
import { person, requirement, submissionWaiting } from '../progress/testFixtures';
import { expiryFor, isWaitingTooLong, londonWorkingDaysBetween, reviewTransition } from './flow';

const REVIEWER = '01HZX0000000000000000000R1';
const NOW = new Date('2026-10-19T09:00:00.000Z');
const certReq = requirement('First aid', { expiryMode: 'fromCertificate', acceptsExternal: true });
const periodReq = requirement('Food hygiene', {
  expiryMode: 'fromRenewalPeriod',
  renewEveryMonths: 36,
  acceptsExternal: true,
});

describe('expiryFor', () => {
  it('needs the entered expiry for a certificate with its own expiry date', () => {
    expect(expiryFor(certReq, '2026-10-01T00:00:00.000Z')).toEqual({ ok: false, error: 'expiryRequired' });
    expect(expiryFor(certReq, '2026-10-01T00:00:00.000Z', '2029-10-01T00:00:00.000Z')).toEqual({
      ok: true,
      expiresAt: '2029-10-01T00:00:00.000Z',
      expected: false,
    });
  });

  it('refuses an entered expiry before the completion date', () => {
    expect(expiryFor(certReq, '2026-10-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toEqual({
      ok: false,
      error: 'expiryBeforeCompleted',
    });
  });

  it('works out the expiry from the renewal period and marks it expected', () => {
    const r = expiryFor(periodReq, '2026-10-01T09:00:00.000Z');
    expect(r).toMatchObject({ ok: true, expected: true });
    expect(r.ok && r.expiresAt?.slice(0, 10)).toBe('2029-10-01');
  });

  it('ignores an entered expiry when the requirement works it out', () => {
    const r = expiryFor(periodReq, '2026-10-01T09:00:00.000Z', '2027-01-01T00:00:00.000Z');
    expect(r.ok && r.expiresAt?.slice(0, 10)).toBe('2029-10-01');
  });

  it('accepts a Date for the completion date', () => {
    expect(expiryFor(periodReq, new Date('2026-10-01T09:00:00.000Z'))).toMatchObject({ ok: true, expected: true });
  });

  it('gives no expiry for a renewal-period requirement that never renews', () => {
    const never = requirement('Induction', { expiryMode: 'fromRenewalPeriod' });
    const r = expiryFor(never, '2026-10-01T09:00:00.000Z');
    expect(r.ok && r.expiresAt).toBeUndefined();
    expect(r.ok).toBe(true);
  });
});

describe('reviewTransition', () => {
  const p = person('Mark', 'Sample');
  const waiting = (over: Partial<EvidenceSubmission> = {}): EvidenceSubmission => ({
    ...submissionWaiting(p, certReq),
    completedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2029-10-01T00:00:00.000Z',
    ...over,
  });

  it('approves, recording reviewer and time, with no changes when dates are left alone', () => {
    const r = reviewTransition(waiting(), { kind: 'approve', reviewerId: REVIEWER }, NOW);
    expect(r).toMatchObject({
      ok: true,
      submission: { status: 'approved', reviewerId: REVIEWER, reviewedAt: NOW.toISOString() },
    });
    expect(r.ok && r.changes).toEqual({});
  });

  it('records corrected dates with before and after', () => {
    const r = reviewTransition(
      waiting(),
      {
        kind: 'approve',
        reviewerId: REVIEWER,
        completedAt: '2026-09-28T00:00:00.000Z',
        expiresAt: '2029-09-28T00:00:00.000Z',
      },
      NOW,
    );
    expect(r.ok && r.submission).toMatchObject({
      status: 'approved',
      completedAt: '2026-09-28T00:00:00.000Z',
      expiresAt: '2029-09-28T00:00:00.000Z',
    });
    expect(r.ok && r.changes).toEqual({
      completedAt: { before: '2026-10-01T00:00:00.000Z', after: '2026-09-28T00:00:00.000Z' },
      expiresAt: { before: '2029-10-01T00:00:00.000Z', after: '2029-09-28T00:00:00.000Z' },
    });
  });

  it('does not count a "correction" to the same date as a change', () => {
    const r = reviewTransition(
      waiting(),
      { kind: 'approve', reviewerId: REVIEWER, completedAt: '2026-10-01T00:00:00.000Z' },
      NOW,
    );
    expect(r.ok && r.changes).toEqual({});
  });

  it('refuses a corrected expiry before the completion date', () => {
    const r = reviewTransition(
      waiting(),
      { kind: 'approve', reviewerId: REVIEWER, expiresAt: '2026-01-01T00:00:00.000Z' },
      NOW,
    );
    expect(r).toEqual({ ok: false, error: 'expiryBeforeCompleted' });
  });

  it('asks for a better copy with a note, trimmed, 1 to 300 characters', () => {
    const r = reviewTransition(
      waiting(),
      { kind: 'betterCopy', reviewerId: REVIEWER, note: '  Photo is blurry  ' },
      NOW,
    );
    expect(r).toMatchObject({
      ok: true,
      submission: { status: 'needsBetterCopy', decisionNote: 'Photo is blurry', reviewerId: REVIEWER },
    });
    expect(reviewTransition(waiting(), { kind: 'betterCopy', reviewerId: REVIEWER, note: '   ' }, NOW)).toEqual({
      ok: false,
      error: 'noteRequired',
    });
    expect(
      reviewTransition(waiting(), { kind: 'betterCopy', reviewerId: REVIEWER, note: 'x'.repeat(301) }, NOW),
    ).toEqual({ ok: false, error: 'noteTooLong' });
    expect(
      reviewTransition(waiting(), { kind: 'betterCopy', reviewerId: REVIEWER, note: 'x'.repeat(300) }, NOW).ok,
    ).toBe(true);
  });

  it('rejects with a reason from the list and an optional note', () => {
    const r = reviewTransition(
      waiting(),
      { kind: 'reject', reviewerId: REVIEWER, reason: 'nameMismatch', note: 'Different surname' },
      NOW,
    );
    expect(r).toMatchObject({
      ok: true,
      submission: { status: 'rejected', rejectionReason: 'nameMismatch', decisionNote: 'Different surname' },
    });
    const bare = reviewTransition(waiting(), { kind: 'reject', reviewerId: REVIEWER, reason: 'unreadable' }, NOW);
    expect(bare.ok && bare.submission.decisionNote).toBeUndefined();
  });

  it('refuses a reason that is not on the list', () => {
    const r = reviewTransition(waiting(), { kind: 'reject', reviewerId: REVIEWER, reason: 'because' as never }, NOW);
    expect(r).toEqual({ ok: false, error: 'reasonInvalid' });
  });

  it.each(['approved', 'rejected', 'needsBetterCopy', 'withdrawn'] as const)(
    'refuses to decide a submission that is %s',
    (status) => {
      const r = reviewTransition(waiting({ status }), { kind: 'approve', reviewerId: REVIEWER }, NOW);
      expect(r).toEqual({ ok: false, error: 'notAwaitingCheck' });
    },
  );

  it('does not change the submission passed in', () => {
    const s = waiting();
    reviewTransition(s, { kind: 'approve', reviewerId: REVIEWER }, NOW);
    expect(s.status).toBe('awaitingCheck');
  });
});

describe('londonWorkingDaysBetween', () => {
  const d = (s: string): Date => new Date(s);

  it('is 0 on the same day and when the end is before the start', () => {
    expect(londonWorkingDaysBetween(d('2026-10-19T08:00:00Z'), d('2026-10-19T17:00:00Z'))).toBe(0);
    expect(londonWorkingDaysBetween(d('2026-10-20T08:00:00Z'), d('2026-10-19T08:00:00Z'))).toBe(0);
  });

  it('counts weekdays after the start day up to and including the end day', () => {
    expect(londonWorkingDaysBetween(d('2026-10-19T09:00:00Z'), d('2026-10-20T09:00:00Z'))).toBe(1);
    expect(londonWorkingDaysBetween(d('2026-10-19T09:00:00Z'), d('2026-10-22T01:00:00Z'))).toBe(3);
    expect(londonWorkingDaysBetween(d('2026-10-19T09:00:00Z'), d('2026-10-26T09:00:00Z'))).toBe(5);
  });

  it('skips weekends', () => {
    expect(londonWorkingDaysBetween(d('2026-10-16T16:00:00Z'), d('2026-10-19T08:00:00Z'))).toBe(1); // Friday to Monday
    expect(londonWorkingDaysBetween(d('2026-10-16T16:00:00Z'), d('2026-10-17T08:00:00Z'))).toBe(0); // Friday to Saturday
    expect(londonWorkingDaysBetween(d('2026-10-17T10:00:00Z'), d('2026-10-18T10:00:00Z'))).toBe(0); // Saturday to Sunday
    expect(londonWorkingDaysBetween(d('2026-10-17T10:00:00Z'), d('2026-10-19T10:00:00Z'))).toBe(1); // Saturday to Monday
  });

  it('uses London days across the clock change on Sunday 25 October', () => {
    expect(londonWorkingDaysBetween(d('2026-10-23T22:30:00Z'), d('2026-10-26T00:30:00Z'))).toBe(1);
    expect(londonWorkingDaysBetween(d('2026-10-23T09:00:00Z'), d('2026-10-27T09:00:00Z'))).toBe(2);
  });

  it('uses the London day, not the UTC day, in summer', () => {
    // 23:30 UTC on Monday 1 June is 00:30 on Tuesday in London.
    expect(londonWorkingDaysBetween(d('2026-06-01T09:00:00Z'), d('2026-06-01T23:30:00Z'))).toBe(1);
  });
});

describe('isWaitingTooLong', () => {
  // Created Monday 19 October.
  const created = '2026-10-19T10:00:00.000Z';
  it('is not highlighted up to 3 working days', () => {
    expect(isWaitingTooLong(created, new Date('2026-10-22T16:00:00Z'))).toBe(false);
  });

  it('is highlighted from more than 3 working days', () => {
    expect(isWaitingTooLong(created, new Date('2026-10-23T08:00:00Z'))).toBe(true);
  });

  it('does not count weekends', () => {
    // Created Thursday 22 October: Friday is 1, Monday is 2, Tuesday is 3, Wednesday is 4.
    const thu = '2026-10-22T10:00:00.000Z';
    expect(isWaitingTooLong(thu, new Date('2026-10-27T10:00:00Z'))).toBe(false);
    expect(isWaitingTooLong(thu, new Date('2026-10-28T10:00:00Z'))).toBe(true);
  });

  it('accepts a Date and a custom limit', () => {
    expect(isWaitingTooLong(new Date(created), new Date('2026-10-21T10:00:00Z'), 1)).toBe(true);
    expect(isWaitingTooLong(new Date(created), new Date('2026-10-20T10:00:00Z'), 1)).toBe(false);
  });
});

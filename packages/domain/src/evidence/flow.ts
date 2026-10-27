// External evidence rules: expiry, review decisions and waiting time. Brief 27; M3 plan assumption 22.
import { addMonths, daysBetween, londonDateString } from '../dates';
import type { EvidenceSubmission } from '../schemas/evidence';
import type { Requirement } from '../schemas/packs';

export type ExpiryResult =
  | { ok: true; expiresAt?: string; expected: boolean }
  | { ok: false; error: 'expiryRequired' | 'expiryBeforeCompleted' };

const ms = (value: string | Date): number => new Date(value).getTime();

export function expiryFor(
  requirement: Pick<Requirement, 'expiryMode' | 'renewEveryMonths'>,
  completedAt: Date | string,
  enteredExpiry?: string,
): ExpiryResult {
  if (requirement.expiryMode === 'fromCertificate') {
    if (enteredExpiry === undefined || Number.isNaN(ms(enteredExpiry))) return { ok: false, error: 'expiryRequired' };
    if (ms(enteredExpiry) < ms(completedAt)) return { ok: false, error: 'expiryBeforeCompleted' };
    return { ok: true, expiresAt: enteredExpiry, expected: false };
  }
  if (requirement.renewEveryMonths === undefined) return { ok: true, expected: false };
  return {
    ok: true,
    expiresAt: addMonths(new Date(completedAt), requirement.renewEveryMonths).toISOString(),
    expected: true,
  };
}

export type RejectionReason = 'notRightCourse' | 'nameMismatch' | 'expired' | 'unreadable' | 'other';
const REASONS: readonly string[] = ['notRightCourse', 'nameMismatch', 'expired', 'unreadable', 'other'];
const NOTE_MAX = 300;

export type ReviewDecision =
  | { kind: 'approve'; reviewerId: string; completedAt?: string; expiresAt?: string }
  | { kind: 'betterCopy'; reviewerId: string; note: string }
  | { kind: 'reject'; reviewerId: string; reason: RejectionReason; note?: string };

export type ReviewResult =
  | {
      ok: true;
      submission: EvidenceSubmission;
      changes: {
        completedAt?: { before: string; after: string };
        expiresAt?: { before?: string; after: string };
      };
    }
  | {
      ok: false;
      error: 'notAwaitingCheck' | 'noteRequired' | 'noteTooLong' | 'reasonInvalid' | 'expiryBeforeCompleted';
    };

export function reviewTransition(submission: EvidenceSubmission, decision: ReviewDecision, now: Date): ReviewResult {
  if (submission.status !== 'awaitingCheck') return { ok: false, error: 'notAwaitingCheck' };
  const reviewed = { reviewerId: decision.reviewerId, reviewedAt: now.toISOString() };

  if (decision.kind === 'betterCopy') {
    const note = decision.note.trim();
    if (note === '') return { ok: false, error: 'noteRequired' };
    if (note.length > NOTE_MAX) return { ok: false, error: 'noteTooLong' };
    return {
      ok: true,
      submission: { ...submission, ...reviewed, status: 'needsBetterCopy', decisionNote: note },
      changes: {},
    };
  }

  if (decision.kind === 'reject') {
    if (!REASONS.includes(decision.reason)) return { ok: false, error: 'reasonInvalid' };
    const note = decision.note?.trim() ?? '';
    if (note.length > NOTE_MAX) return { ok: false, error: 'noteTooLong' };
    return {
      ok: true,
      submission: {
        ...submission,
        ...reviewed,
        status: 'rejected',
        rejectionReason: decision.reason,
        ...(note !== '' ? { decisionNote: note } : {}),
      },
      changes: {},
    };
  }

  const completedAt = decision.completedAt ?? submission.completedAt;
  const expiresAt = decision.expiresAt ?? submission.expiresAt;
  if (expiresAt !== undefined && ms(expiresAt) < ms(completedAt)) return { ok: false, error: 'expiryBeforeCompleted' };
  const changes: Extract<ReviewResult, { ok: true }>['changes'] = {};
  if (ms(completedAt) !== ms(submission.completedAt)) {
    changes.completedAt = { before: submission.completedAt, after: completedAt };
  }
  if (expiresAt !== undefined && (submission.expiresAt === undefined || ms(expiresAt) !== ms(submission.expiresAt))) {
    changes.expiresAt = {
      ...(submission.expiresAt !== undefined ? { before: submission.expiresAt } : {}),
      after: expiresAt,
    };
  }
  return {
    ok: true,
    submission: {
      ...submission,
      ...reviewed,
      status: 'approved',
      completedAt,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    },
    changes,
  };
}

/** London weekdays after `from`'s day up to and including `to`'s day. No bank holidays. 0 when `to` is not later. */
export function londonWorkingDaysBetween(from: Date, to: Date): number {
  const days = daysBetween(from, to);
  if (days <= 0) return 0;
  const start = new Date(`${londonDateString(from)}T00:00:00.000Z`);
  let count = 0;
  for (let i = 1; i <= days; i++) {
    const weekday = new Date(start.getTime() + i * 86_400_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

/** Highlight a submission that has waited more than `limit` working days. */
export const isWaitingTooLong = (createdAt: string | Date, now: Date, limit = 3): boolean =>
  londonWorkingDaysBetween(new Date(createdAt), now) > limit;

/**
 * True when the person looking at a submission uploaded it or is the person it is about. The screen then switches the
 * decision buttons off; the data layer applies the full approval rule (including the single-admin exception).
 */
export const isOwnOrAboutSelf = (
  submission: Pick<EvidenceSubmission, 'uploadedBy' | 'personId'>,
  viewer: { userId: string; personId?: string },
): boolean =>
  submission.uploadedBy === viewer.userId || (viewer.personId !== undefined && submission.personId === viewer.personId);

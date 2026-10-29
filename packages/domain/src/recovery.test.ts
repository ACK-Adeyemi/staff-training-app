// M4 chunk 3: account recovery two-approver rule, written before the implementation.
//
// API under test (recovery.ts):
//   RECOVERY_COOLING_OFF_HOURS = 48
//   type RecoveryResult = { ok: true; request: RecoveryRequest } | { ok: false; reason: string }
//   requestRecovery(input: { id; clientId; subjectUserId; requester; reason; outcome? ; checks? }, clock): RecoveryRequest
//     -> status 'open', approvals [], coolingOffEndsAt = now + 48h
//   approveRecovery(r, approverUserId, clock): RecoveryResult   // distinct, not the subject, open only; 2nd approval -> 'approved'
//   completeRecovery(r, clock): RecoveryResult                   // needs 'approved' and cooling-off over -> 'done'
//   rejectRecovery(r, byUserId, clock): RecoveryResult           // open or approved only -> 'rejected'
import { describe, expect, it } from 'vitest';
import { fixedClock, offsetClock } from './clock';
import {
  RECOVERY_COOLING_OFF_HOURS,
  approveRecovery,
  completeRecovery,
  rejectRecovery,
  requestRecovery,
} from './recovery';
import { recoveryRequestSchema, type RecoveryRequest } from './schemas/m4';

const uid = (n: number) => String(n).padStart(26, '0'); // ids are 26-character ULIDs
const HOUR = 60 * 60 * 1000;
const start = fixedClock('2026-03-02T09:00:00.000Z');
const input = {
  id: uid(1),
  clientId: uid(2),
  subjectUserId: uid(11),
  requester: 'Priya (phone call)',
  reason: 'Lost phone, cannot use the 2FA code',
  outcome: 'reset2fa' as const,
};
const A = uid(21);
const B = uid(22);

const approvedRequest = (): RecoveryRequest => {
  const one = approveRecovery(requestRecovery(input, start), A, start);
  if (!one.ok) throw new Error('first approval failed');
  const two = approveRecovery(one.request, B, start);
  if (!two.ok) throw new Error('second approval failed');
  return two.request;
};

describe('account recovery', () => {
  it('requesting creates an open record that is valid under the schema with a 48 hour cooling-off', () => {
    const r = requestRecovery(input, start);
    expect(RECOVERY_COOLING_OFF_HOURS).toBe(48);
    expect(recoveryRequestSchema.safeParse(r).success).toBe(true);
    expect(r.status).toBe('open');
    expect(r.approvals).toEqual([]);
    expect(r.coolingOffEndsAt).toBe(new Date(start.now().getTime() + 48 * HOUR).toISOString());
  });

  it('the first approval is recorded and the request stays open', () => {
    const res = approveRecovery(requestRecovery(input, start), A, start);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.request.approvals).toEqual([A]);
      expect(res.request.status).toBe('open');
    }
  });

  it('the same approver cannot approve twice', () => {
    const one = approveRecovery(requestRecovery(input, start), A, start);
    if (!one.ok) throw new Error('first approval failed');
    const again = approveRecovery(one.request, A, start);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).not.toBe('');
    expect(one.request.approvals).toEqual([A]);
  });

  it('the person being recovered cannot approve their own recovery', () => {
    const res = approveRecovery(requestRecovery(input, start), input.subjectUserId, start);
    expect(res.ok).toBe(false);
  });

  it('the person who asked for the recovery cannot approve it', () => {
    const res = approveRecovery(requestRecovery({ ...input, requester: A }, start), A, start);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('The person who asked for this recovery cannot approve it.');
  });

  it('two different approvers move the request to approved and it stays schema valid', () => {
    const r = approvedRequest();
    expect(r.status).toBe('approved');
    expect(r.approvals).toEqual([A, B]);
    expect(recoveryRequestSchema.safeParse(r).success).toBe(true);
  });

  it('cannot complete with fewer than two approvals, even after the cooling-off', () => {
    const one = approveRecovery(requestRecovery(input, start), A, start);
    if (!one.ok) throw new Error('first approval failed');
    const res = completeRecovery(one.request, offsetClock(start, 48 * HOUR));
    expect(res.ok).toBe(false);
  });

  it('cannot complete before the 48 hour cooling-off is over', () => {
    const res = completeRecovery(approvedRequest(), offsetClock(start, 48 * HOUR - 1));
    expect(res.ok).toBe(false);
  });

  it('can complete once the cooling-off is over, and the request becomes done', () => {
    const res = completeRecovery(approvedRequest(), offsetClock(start, 48 * HOUR));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.request.status).toBe('done');
      expect(recoveryRequestSchema.safeParse(res.request).success).toBe(true);
    }
  });

  it('fast-forwarding the demo clock past the cooling-off allows completion', () => {
    const fastForwarded = offsetClock(start, 4 * 24 * HOUR);
    expect(completeRecovery(approvedRequest(), start).ok).toBe(false);
    expect(completeRecovery(approvedRequest(), fastForwarded).ok).toBe(true);
  });

  it('an open or approved request can be declined, and a declined one cannot be approved or completed', () => {
    const open = rejectRecovery(requestRecovery(input, start), A, start);
    expect(open.ok).toBe(true);
    if (open.ok) {
      expect(open.request.status).toBe('rejected');
      expect(recoveryRequestSchema.safeParse(open.request).success).toBe(true);
      expect(approveRecovery(open.request, B, start).ok).toBe(false);
    }
    const approved = rejectRecovery(approvedRequest(), A, start);
    expect(approved.ok).toBe(true);
    if (approved.ok) expect(completeRecovery(approved.request, offsetClock(start, 48 * HOUR)).ok).toBe(false);
  });

  it('a finished request cannot be declined', () => {
    const done = completeRecovery(approvedRequest(), offsetClock(start, 49 * HOUR));
    if (!done.ok) throw new Error('complete failed');
    expect(rejectRecovery(done.request, A, start).ok).toBe(false);
  });

  it('the waiting period starts at the second approval, so a late approval still leaves the full 48 hours', () => {
    const one = approveRecovery(requestRecovery(input, start), A, start);
    if (!one.ok) throw new Error('first approval failed');
    const later = offsetClock(start, 30 * HOUR);
    const two = approveRecovery(one.request, B, later);
    if (!two.ok) throw new Error('second approval failed');
    expect(two.request.coolingOffEndsAt).toBe(new Date(start.now().getTime() + 78 * HOUR).toISOString());
    expect(completeRecovery(two.request, offsetClock(start, 77 * HOUR)).ok).toBe(false);
    expect(completeRecovery(two.request, offsetClock(start, 78 * HOUR)).ok).toBe(true);
  });

  it('approving a request that has no cooling-off end sets it to 48 hours from now, and keeps one already set before approval', () => {
    const bare = { ...requestRecovery(input, start) };
    Reflect.deleteProperty(bare, 'coolingOffEndsAt');
    const res = approveRecovery(bare, A, start);
    if (!res.ok) throw new Error('approval failed');
    expect(res.request.coolingOffEndsAt).toBe(new Date(start.now().getTime() + 48 * HOUR).toISOString());
    const kept = approveRecovery(requestRecovery(input, start), A, offsetClock(start, 5 * HOUR));
    if (!kept.ok) throw new Error('approval failed');
    expect(kept.request.coolingOffEndsAt).toBe(new Date(start.now().getTime() + 48 * HOUR).toISOString());
  });
});

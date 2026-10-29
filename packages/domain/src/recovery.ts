// Account recovery: two distinct approvers plus a cooling-off (build pack M4). Pure: time comes from the Clock.
import type { Clock } from './clock';
import type { RecoveryRequest } from './schemas/m4';

export const RECOVERY_COOLING_OFF_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const APPROVALS_NEEDED = 2;

export type RecoveryResult = { ok: true; request: RecoveryRequest } | { ok: false; reason: string };

export interface RecoveryInput {
  id: string;
  clientId: string;
  subjectUserId: string;
  requester: string;
  reason: string;
  outcome?: RecoveryRequest['outcome'] | undefined;
  checks?: RecoveryRequest['checks'] | undefined;
}

const fail = (reason: string): RecoveryResult => ({ ok: false, reason });

export const requestRecovery = (input: RecoveryInput, clock: Clock): RecoveryRequest => ({
  id: input.id,
  clientId: input.clientId,
  subjectUserId: input.subjectUserId,
  requester: input.requester,
  reason: input.reason,
  checks: input.checks ?? [],
  approvals: [],
  coolingOffEndsAt: new Date(clock.now().getTime() + RECOVERY_COOLING_OFF_HOURS * HOUR_MS).toISOString(),
  ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
  status: 'open',
});

export const approveRecovery = (r: RecoveryRequest, approverUserId: string, clock: Clock): RecoveryResult => {
  if (r.status !== 'open') return fail('This recovery request is no longer open.');
  if (approverUserId === r.subjectUserId) return fail('The person being recovered cannot approve their own recovery.');
  if (approverUserId === r.requester) return fail('The person who asked for this recovery cannot approve it.');
  if (r.approvals.includes(approverUserId)) return fail('You have already approved this request.');
  const approvals = [...r.approvals, approverUserId];
  return {
    ok: true,
    request: {
      ...r,
      approvals,
      status: approvals.length >= APPROVALS_NEEDED ? 'approved' : 'open',
      // A request with no waiting period yet (such as the seeded one) starts it now; one already set is kept.
      coolingOffEndsAt:
        r.coolingOffEndsAt ?? new Date(clock.now().getTime() + RECOVERY_COOLING_OFF_HOURS * HOUR_MS).toISOString(),
    },
  };
};

export const completeRecovery = (r: RecoveryRequest, clock: Clock): RecoveryResult => {
  if (r.status !== 'approved' || r.approvals.length < APPROVALS_NEEDED)
    return fail('Two different people must approve first.');
  if (r.coolingOffEndsAt === undefined || clock.now().getTime() < new Date(r.coolingOffEndsAt).getTime())
    return fail('The waiting period has not finished yet.');
  return { ok: true, request: { ...r, status: 'done' } };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- byUserId and clock kept for a uniform lifecycle signature
export const rejectRecovery = (r: RecoveryRequest, byUserId: string, clock: Clock): RecoveryResult => {
  if (r.status !== 'open' && r.status !== 'approved') return fail('This recovery request is already finished.');
  return { ok: true, request: { ...r, status: 'rejected' } };
};

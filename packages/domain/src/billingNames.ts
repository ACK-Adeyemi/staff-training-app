// Billing-name rules (keep, update to match, ask) and billing change requests. Pure; time comes from the Clock.
import { nowIso, type Clock } from './clock';
import type { BillingChangeRequest, BillingProfile, Invoice } from './schemas/billing';
import type { ProfileChangeRequest } from './schemas/m4';

export type BillingAudit = {
  action: string;
  clientId: string;
  actorId: string;
  at: string;
  before: unknown;
  after: unknown;
};

export type NameChangeDecision = 'keep' | 'updateToMatch' | 'askClient';

export function reviewNameChange(
  req: ProfileChangeRequest,
  profile: BillingProfile,
  decision: NameChangeDecision,
  reviewerId: string,
  clock: Clock,
  invoices: Invoice[] = [],
): { request: ProfileChangeRequest; profile: BillingProfile; affectedInvoiceIds: string[]; audit: BillingAudit } {
  if (req.status !== 'pendingReview') throw new Error('This name change has already been reviewed');
  const at = nowIso(clock);
  const status = decision === 'keep' ? 'billingKept' : decision === 'askClient' ? 'clientAsked' : 'billingUpdated';
  const request: ProfileChangeRequest = { ...req, status, reviewerId, reviewedAt: at };
  const update = decision === 'updateToMatch';
  const next: BillingProfile = update
    ? { ...profile, billingName: req.newName, updatedBy: reviewerId, updatedAt: at }
    : profile;
  const now = clock.now().getTime();
  const affectedInvoiceIds = update
    ? invoices.filter((i) => new Date(i.issuedAt).getTime() >= now).map((i) => i.id)
    : [];
  return {
    request,
    profile: next,
    affectedInvoiceIds,
    audit: {
      action: `billingName.${decision}`,
      clientId: req.clientId,
      actorId: reviewerId,
      at,
      before: { billingName: profile.billingName },
      after: { billingName: next.billingName },
    },
  };
}

export function billingNamesAtIssue(profile: BillingProfile): {
  billingNameAtIssue: string;
  billingAddressAtIssue: string;
} {
  return { billingNameAtIssue: profile.billingName, billingAddressAtIssue: profile.address };
}

export type BillingChangeDecision =
  | { kind: 'approve' }
  | { kind: 'editApprove'; proposed: BillingChangeRequest['proposed'] }
  | { kind: 'decline'; reason: string };

export function decideBillingChange(
  req: BillingChangeRequest,
  profile: BillingProfile,
  decision: BillingChangeDecision,
  reviewerId: string,
  clock: Clock,
): { request: BillingChangeRequest; profile: BillingProfile; audit: BillingAudit } {
  if (req.status !== 'pending') throw new Error('This request has already been decided');
  const at = nowIso(clock);
  const audit = (action: string, before: unknown, after: unknown): BillingAudit => ({
    action,
    clientId: req.clientId,
    actorId: reviewerId,
    at,
    before,
    after,
  });
  if (decision.kind === 'decline') {
    const reason = decision.reason.trim();
    if (!reason) throw new Error('Give a reason for declining');
    return {
      request: { ...req, status: 'declined', reason, reviewerId },
      profile,
      audit: audit('billingChange.decline', req.proposed, { reason }),
    };
  }
  const proposed = decision.kind === 'editApprove' ? decision.proposed : req.proposed;
  const next: BillingProfile = {
    ...profile,
    ...(proposed.billingName !== undefined ? { billingName: proposed.billingName } : {}),
    ...(proposed.address !== undefined ? { address: proposed.address } : {}),
    ...(proposed.vatNumber !== undefined ? { vatNumber: proposed.vatNumber } : {}),
    updatedBy: reviewerId,
    updatedAt: at,
  };
  return {
    request: { ...req, proposed, status: 'approved', reviewerId },
    profile: next,
    audit: audit(`billingChange.${decision.kind}`, profile, next),
  };
}

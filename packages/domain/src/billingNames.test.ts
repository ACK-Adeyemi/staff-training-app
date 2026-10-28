// M4 chunk 3: billing-name rules (keep, update to match, ask) and billing change requests, written before the implementation.
// Plan assumptions 7 and 9: update to match affects invoices issued after the update; issued invoices are never edited.
//
// API under test (billingNames.ts), all pure; errors are thrown as Error:
//   type BillingAudit = { action: string; clientId: string; actorId: string; at: string; before: unknown; after: unknown }
//   reviewNameChange(req: ProfileChangeRequest, profile: BillingProfile, decision: 'keep' | 'updateToMatch' | 'askClient',
//     reviewerId: string, clock: Clock, invoices?: Invoice[])
//     => { request: ProfileChangeRequest; profile: BillingProfile; affectedInvoiceIds: string[]; audit: BillingAudit }
//     Throws unless req.status is 'pendingReview'. keep -> 'billingKept', askClient -> 'clientAsked', profile unchanged.
//     updateToMatch -> 'billingUpdated', profile.billingName = req.newName (updatedBy/updatedAt set), and
//     affectedInvoiceIds = ids of the given invoices with issuedAt >= clock.now(). Input invoices are never mutated.
//   billingNamesAtIssue(profile): { billingNameAtIssue: string; billingAddressAtIssue: string }
//   decideBillingChange(req: BillingChangeRequest, profile: BillingProfile,
//     decision: { kind: 'approve' } | { kind: 'editApprove'; proposed: BillingChangeRequest['proposed'] } | { kind: 'decline'; reason: string },
//     reviewerId: string, clock: Clock)
//     => { request: BillingChangeRequest; profile: BillingProfile; audit: BillingAudit }
//     Throws unless req.status is 'pending'. decline needs a non-empty reason and leaves the profile unchanged.
import { describe, expect, it } from 'vitest';
import { fixedClock } from './clock';
import { billingNamesAtIssue, decideBillingChange, reviewNameChange } from './billingNames';
import type { BillingChangeRequest, BillingProfile, Invoice } from './schemas/billing';
import type { ProfileChangeRequest } from './schemas/m4';

const uid = (n: number) => String(n).padStart(26, '0');
const clock = fixedClock('2026-03-10T12:00:00.000Z');
const at = '2026-03-10T12:00:00.000Z';

const profile: BillingProfile = {
  clientId: uid(1),
  billingName: 'Oak Tree Nurseries Ltd',
  address: '1 High Street',
  billingContactEmail: 'accounts@example.test',
  updatedBy: uid(80),
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const nameChange: ProfileChangeRequest = {
  id: uid(2),
  clientId: uid(1),
  kind: 'nameChange',
  oldName: 'Oak Tree Nurseries',
  newName: 'Oak Tree Early Years',
  requestedBy: uid(81),
  status: 'pendingReview',
  createdAt: '2026-03-09T09:00:00.000Z',
};
const invoice = (n: number, issuedAt: string): Invoice => ({
  id: uid(n),
  number: `INV-${n}`,
  clientId: uid(1),
  issuedAt,
  dueAt: '2026-04-30T00:00:00.000Z',
  billingNameAtIssue: 'Oak Tree Nurseries Ltd',
  billingAddressAtIssue: '1 High Street',
  lines: [{ label: 'Plan', amount: 10000 }],
  tax: 2000,
  total: 12000,
  status: 'due',
});
const billingReq: BillingChangeRequest = {
  id: uid(3),
  clientId: uid(1),
  requestedBy: uid(82),
  proposed: { billingName: 'Oak Tree Group Ltd', address: '2 Low Road' },
  status: 'pending',
  createdAt: '2026-03-09T10:00:00.000Z',
};

describe('billing name review', () => {
  it('update to match changes the profile and affects only invoices issued from now on', () => {
    const past = invoice(10, '2026-03-01T00:00:00.000Z');
    const future = invoice(11, '2026-04-01T00:00:00.000Z');
    const snapshot = structuredClone([past, future]);
    const r = reviewNameChange(nameChange, profile, 'updateToMatch', uid(90), clock, [past, future]);
    expect(r.profile.billingName).toBe('Oak Tree Early Years');
    expect(r.profile.updatedBy).toBe(uid(90));
    expect(r.profile.updatedAt).toBe(at);
    expect(r.request.status).toBe('billingUpdated');
    expect(r.affectedInvoiceIds).toEqual([future.id]);
    expect([past, future]).toEqual(snapshot);
    expect(past.billingNameAtIssue).toBe('Oak Tree Nurseries Ltd');
  });

  it('keep and ask the client leave the billing profile and every invoice alone', () => {
    const inv = invoice(10, '2026-04-01T00:00:00.000Z');
    const kept = reviewNameChange(nameChange, profile, 'keep', uid(90), clock, [inv]);
    expect(kept.request.status).toBe('billingKept');
    expect(kept.profile).toEqual(profile);
    expect(kept.affectedInvoiceIds).toEqual([]);
    const asked = reviewNameChange(nameChange, profile, 'askClient', uid(90), clock, [inv]);
    expect(asked.request.status).toBe('clientAsked');
    expect(asked.profile).toEqual(profile);
    expect(asked.request.reviewerId).toBe(uid(90));
    expect(asked.request.reviewedAt).toBe(at);
  });

  it('every review returns an audit record with the old and new billing name', () => {
    const r = reviewNameChange(nameChange, profile, 'updateToMatch', uid(90), clock);
    expect(r.audit).toMatchObject({ clientId: uid(1), actorId: uid(90), at });
    expect(JSON.stringify(r.audit.before)).toContain('Oak Tree Nurseries Ltd');
    expect(JSON.stringify(r.audit.after)).toContain('Oak Tree Early Years');
  });

  it('an invoice takes the billing name and address on the profile at the moment it is issued', () => {
    expect(billingNamesAtIssue(profile)).toEqual({
      billingNameAtIssue: 'Oak Tree Nurseries Ltd',
      billingAddressAtIssue: '1 High Street',
    });
    const updated = reviewNameChange(nameChange, profile, 'updateToMatch', uid(90), clock).profile;
    expect(billingNamesAtIssue(updated).billingNameAtIssue).toBe('Oak Tree Early Years');
  });

  it('refuses to review a name change that has already been decided', () => {
    const decided = { ...nameChange, status: 'billingKept' as const };
    expect(() => reviewNameChange(decided, profile, 'updateToMatch', uid(90), clock)).toThrow();
  });
});

describe('billing change requests', () => {
  it('approve applies the proposed details and records the reviewer and an audit entry', () => {
    const r = decideBillingChange(billingReq, profile, { kind: 'approve' }, uid(90), clock);
    expect(r.request).toMatchObject({ status: 'approved', reviewerId: uid(90) });
    expect(r.profile).toMatchObject({
      billingName: 'Oak Tree Group Ltd',
      address: '2 Low Road',
      updatedBy: uid(90),
      updatedAt: at,
    });
    expect(r.profile.billingContactEmail).toBe(profile.billingContactEmail);
    expect(r.audit).toMatchObject({ clientId: uid(1), actorId: uid(90), at });
  });

  it('edit then approve applies the edited details, not the originals', () => {
    const r = decideBillingChange(
      billingReq,
      profile,
      { kind: 'editApprove', proposed: { billingName: 'Oak Tree Group Limited' } },
      uid(90),
      clock,
    );
    expect(r.request.status).toBe('approved');
    expect(r.request.proposed).toEqual({ billingName: 'Oak Tree Group Limited' });
    expect(r.profile.billingName).toBe('Oak Tree Group Limited');
    expect(r.profile.address).toBe('1 High Street');
  });

  it('decline needs a reason, keeps the profile and records the reason', () => {
    expect(() => decideBillingChange(billingReq, profile, { kind: 'decline', reason: '  ' }, uid(90), clock)).toThrow();
    const r = decideBillingChange(
      billingReq,
      profile,
      { kind: 'decline', reason: 'Please send proof' },
      uid(90),
      clock,
    );
    expect(r.request).toMatchObject({ status: 'declined', reason: 'Please send proof', reviewerId: uid(90) });
    expect(r.profile).toEqual(profile);
  });

  it('refuses to approve or decline a request that was already decided', () => {
    const done = { ...billingReq, status: 'approved' as const };
    expect(() => decideBillingChange(done, profile, { kind: 'approve' }, uid(90), clock)).toThrow();
    expect(() =>
      decideBillingChange(
        { ...billingReq, status: 'declined' },
        profile,
        { kind: 'decline', reason: 'x' },
        uid(90),
        clock,
      ),
    ).toThrow();
  });
});

// M4 chunk 3: ownership transfer lifecycle, written before the implementation.
//
// API under test (ownership.ts):
//   OWNERSHIP_COOLING_OFF_DAYS = 7
//   type OwnershipResult = { ok: true; transfer: OwnershipTransfer } | { ok: false; reason: string }
//   requestTransfer(input: { id; side; clientId?; fromUserId; toUserId; demoteFromTo }, clock: Clock): OwnershipTransfer
//   acceptTransfer(t, byUserId, clock): OwnershipResult          // only toUserId may accept
//   confirmTransferTwoFactor(t, byUserId, clock): OwnershipResult // only fromUserId, only after acceptance
//   completeTransfer(t, clock): OwnershipResult                   // needs accepted + 2FA + cooling-off over
//   cancelTransfer(t, byUserId, clock): OwnershipResult           // from or to user, pending only
//   canChangeOwnerRole(owners: string[], userId, change: 'demote' | 'remove'): { allowed: boolean; reason?: string }
import { describe, expect, it } from 'vitest';
import { fixedClock, offsetClock } from './clock';
import {
  OWNERSHIP_COOLING_OFF_DAYS,
  acceptTransfer,
  canChangeOwnerRole,
  cancelTransfer,
  completeTransfer,
  confirmTransferTwoFactor,
  requestTransfer,
} from './ownership';
import { ownershipTransferSchema, type OwnershipTransfer } from './schemas/m4';

const uid = (n: number) => String(n).padStart(26, '0'); // ids are 26-character ULIDs
const DAY = 24 * 60 * 60 * 1000;
const start = fixedClock('2026-03-02T09:00:00.000Z');
const input = {
  id: uid(1),
  side: 'client' as const,
  clientId: uid(2),
  fromUserId: uid(11),
  toUserId: uid(12),
  demoteFromTo: uid(13),
};

const ready = (): OwnershipTransfer => {
  const a = acceptTransfer(requestTransfer(input, start), input.toUserId, start);
  if (!a.ok) throw new Error('accept failed');
  const c = confirmTransferTwoFactor(a.transfer, input.fromUserId, start);
  if (!c.ok) throw new Error('2FA failed');
  return c.transfer;
};

describe('ownership transfer', () => {
  it('requesting creates a valid pending transfer with a 7 day cooling-off', () => {
    const t = requestTransfer(input, start);
    expect(OWNERSHIP_COOLING_OFF_DAYS).toBe(7);
    expect(ownershipTransferSchema.safeParse(t).success).toBe(true);
    expect(t.status).toBe('pending');
    expect(t.acceptedAt).toBeUndefined();
    expect(t.coolingOffEndsAt).toBe(new Date(start.now().getTime() + 7 * DAY).toISOString());
  });

  it('the recipient can accept and the time is recorded', () => {
    const r = acceptTransfer(requestTransfer(input, start), input.toUserId, start);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transfer.acceptedAt).toBe(start.now().toISOString());
  });

  it('someone other than the recipient cannot accept', () => {
    const r = acceptTransfer(requestTransfer(input, start), uid(99), start);
    expect(r.ok).toBe(false);
  });

  it('2FA confirmation is refused before acceptance and recorded after it', () => {
    const pending = requestTransfer(input, start);
    expect(confirmTransferTwoFactor(pending, input.fromUserId, start).ok).toBe(false);
    const t = ready();
    expect(t.twoFactorConfirmedAt).toBe(start.now().toISOString());
  });

  it('completion is refused before the cooling-off ends, even when accepted and confirmed', () => {
    const r = completeTransfer(ready(), offsetClock(start, 7 * DAY - 1000));
    expect(r.ok).toBe(false);
  });

  it('a late accept and confirm still leaves the full 7 day cooling-off from the confirmation', () => {
    const a = acceptTransfer(requestTransfer(input, start), input.toUserId, offsetClock(start, 5 * DAY));
    if (!a.ok) throw new Error('accept failed');
    const confirmAt = offsetClock(start, 6 * DAY);
    const c = confirmTransferTwoFactor(a.transfer, input.fromUserId, confirmAt);
    if (!c.ok) throw new Error('2FA failed');
    expect(c.transfer.coolingOffEndsAt).toBe(new Date(start.now().getTime() + 13 * DAY).toISOString());
    expect(completeTransfer(c.transfer, offsetClock(start, 8 * DAY)).ok).toBe(false);
    expect(completeTransfer(c.transfer, offsetClock(start, 13 * DAY)).ok).toBe(true);
  });

  it('completion is refused without acceptance and 2FA, even after the cooling-off', () => {
    const late = offsetClock(start, 8 * DAY);
    expect(completeTransfer(requestTransfer(input, start), late).ok).toBe(false);
  });

  it('completion is allowed once the cooling-off has passed, and marks the transfer done', () => {
    const r = completeTransfer(ready(), offsetClock(start, 7 * DAY));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transfer.status).toBe('done');
  });

  it('fast-forwarding the clock past the cooling-off allows completion that was refused before', () => {
    const t = ready();
    expect(completeTransfer(t, start).ok).toBe(false);
    expect(completeTransfer(t, offsetClock(start, 30 * DAY)).ok).toBe(true);
  });

  it('cancelling a pending transfer marks it cancelled and it can no longer complete', () => {
    const c = cancelTransfer(ready(), input.fromUserId, start);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.transfer.status).toBe('cancelled');
    expect(completeTransfer(c.transfer, offsetClock(start, 30 * DAY)).ok).toBe(false);
  });

  it('a finished transfer cannot be cancelled', () => {
    const d = completeTransfer(ready(), offsetClock(start, 8 * DAY));
    if (!d.ok) throw new Error('complete failed');
    expect(cancelTransfer(d.transfer, input.fromUserId, start).ok).toBe(false);
  });
});

describe('canChangeOwnerRole (last Account Owner guard)', () => {
  it('refuses to demote or remove the only owner', () => {
    expect(canChangeOwnerRole([uid(11)], uid(11), 'demote').allowed).toBe(false);
    const removed = canChangeOwnerRole([uid(11)], uid(11), 'remove');
    expect(removed.allowed).toBe(false);
    expect(removed.reason).toBeTruthy();
  });

  it('allows demoting or removing an owner when another owner remains', () => {
    expect(canChangeOwnerRole([uid(11), uid(12)], uid(11), 'demote').allowed).toBe(true);
    expect(canChangeOwnerRole([uid(11), uid(12)], uid(12), 'remove').allowed).toBe(true);
  });

  it('allows changes to someone who is not an owner', () => {
    expect(canChangeOwnerRole([uid(11)], uid(50), 'remove').allowed).toBe(true);
  });
});

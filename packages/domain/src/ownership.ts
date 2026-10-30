// Ownership transfer lifecycle (build pack M4). Pure: time comes from the injected Clock.
import type { Clock } from './clock';
import type { OwnershipTransfer } from './schemas/m4';

export const OWNERSHIP_COOLING_OFF_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type OwnershipResult = { ok: true; transfer: OwnershipTransfer } | { ok: false; reason: string };

export interface TransferInput {
  id: string;
  side: 'client' | 'provider';
  clientId?: string | undefined;
  fromUserId: string;
  toUserId: string;
  demoteFromTo: string;
}

const fail = (reason: string): OwnershipResult => ({ ok: false, reason });

// The end date set here is provisional (the schema needs one); confirming with the 2FA code restarts it.
export const requestTransfer = (input: TransferInput, clock: Clock): OwnershipTransfer => ({
  id: input.id,
  side: input.side,
  ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
  fromUserId: input.fromUserId,
  toUserId: input.toUserId,
  demoteFromTo: input.demoteFromTo,
  status: 'pending',
  coolingOffEndsAt: new Date(clock.now().getTime() + OWNERSHIP_COOLING_OFF_DAYS * DAY_MS).toISOString(),
});

export const acceptTransfer = (t: OwnershipTransfer, byUserId: string, clock: Clock): OwnershipResult => {
  if (t.status !== 'pending') return fail('This transfer is no longer open.');
  if (byUserId !== t.toUserId) return fail('Only the person receiving ownership can accept.');
  if (t.acceptedAt !== undefined) return fail('This transfer has already been accepted.');
  return { ok: true, transfer: { ...t, acceptedAt: clock.now().toISOString() } };
};

export const confirmTransferTwoFactor = (t: OwnershipTransfer, byUserId: string, clock: Clock): OwnershipResult => {
  if (t.status !== 'pending') return fail('This transfer is no longer open.');
  if (byUserId !== t.fromUserId) return fail('Only the current owner can confirm.');
  if (t.acceptedAt === undefined) return fail('The new owner must accept first.');
  // The waiting period runs from this confirmation, so a late accept or confirm still leaves the full period.
  const now = clock.now();
  return {
    ok: true,
    transfer: {
      ...t,
      twoFactorConfirmedAt: now.toISOString(),
      coolingOffEndsAt: new Date(now.getTime() + OWNERSHIP_COOLING_OFF_DAYS * DAY_MS).toISOString(),
    },
  };
};

export const completeTransfer = (t: OwnershipTransfer, clock: Clock): OwnershipResult => {
  if (t.status !== 'pending') return fail('This transfer is no longer open.');
  if (t.acceptedAt === undefined) return fail('The new owner must accept first.');
  if (t.twoFactorConfirmedAt === undefined) return fail('The current owner must confirm with their code first.');
  if (clock.now().getTime() < new Date(t.coolingOffEndsAt).getTime())
    return fail('The waiting period has not finished yet.');
  return { ok: true, transfer: { ...t, status: 'done' } };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- clock kept for a uniform lifecycle signature
export const cancelTransfer = (t: OwnershipTransfer, byUserId: string, clock: Clock): OwnershipResult => {
  if (t.status !== 'pending') return fail('This transfer is no longer open.');
  if (byUserId !== t.fromUserId && byUserId !== t.toUserId) return fail('Only the people involved can cancel.');
  return { ok: true, transfer: { ...t, status: 'cancelled' } };
};

export const canChangeOwnerRole = (
  owners: string[],
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- demote and remove are guarded the same way
  change: 'demote' | 'remove',
): { allowed: boolean; reason?: string } => {
  if (owners.includes(userId) && owners.every((o) => o === userId))
    return { allowed: false, reason: 'There must always be at least one Account Owner.' };
  return { allowed: true };
};

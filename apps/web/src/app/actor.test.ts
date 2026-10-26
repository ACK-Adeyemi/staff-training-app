// M3 chunk 1: the actor's clientId comes from the chosen user's record, not from a hard-coded Little Acorns key
// (plan assumption 1). resolveActor is the pure helper App.tsx calls. Written before the implementation.
import { describe, expect, it } from 'vitest';
import type { DemoState } from '@sta/domain';
import { resolveActor, type PersonaEntry } from './actor';

const NOW = '2026-10-19T09:00:00.000Z';
const LA = '01HZX000000000000000000LA1';
const OT = '01HZX000000000000000000OT1';
const WL = '01HZX000000000000000000WL1';

const personas: PersonaEntry[] = [
  { userId: 'u-priya', displayName: 'Priya Shah', side: 'client', clientId: LA, clientName: 'Little Acorns Nursery' },
  { userId: 'u-fiona', displayName: 'Fiona Marsh', side: 'client', clientId: OT, clientName: 'Oak Tree Nurseries' },
  { userId: 'u-gemma', displayName: 'Gemma Holt', side: 'client', clientId: WL, clientName: 'Willow Lane Nursery' },
  { userId: 'u-jade', displayName: 'Jade Mills', side: 'staff', clientId: LA, clientName: 'Little Acorns Nursery' },
  { userId: 'u-oscar', displayName: 'Oscar Frost', side: 'staff', clientId: OT, clientName: 'Oak Tree Nurseries' },
];
const fallback = { clientUserId: 'u-priya', staffUserId: 'u-jade', providerUserId: 'u-prov' };
const state = (over: Partial<DemoState> = {}): DemoState => ({
  clockOffsetMs: 0,
  industry: 'nursery',
  persona: { side: 'staff', userId: 'u-jade' },
  ...over,
});

describe('resolveActor', () => {
  it("uses the default client admin and that admin's own client when no client persona is chosen", () => {
    const a = resolveActor({ side: 'client', state: state(), personas, fallback, now: NOW });
    expect(a).toEqual({ userId: 'u-priya', side: 'client', clientId: LA, now: NOW });
  });

  it('takes the client id from the chosen client persona, not from Little Acorns', () => {
    const a = resolveActor({
      side: 'client',
      state: state({ clientPersona: { userId: 'u-fiona' } }),
      personas,
      fallback,
      now: NOW,
    });
    expect(a).toEqual({ userId: 'u-fiona', side: 'client', clientId: OT, now: NOW });
    const b = resolveActor({
      side: 'client',
      state: state({ clientPersona: { userId: 'u-gemma' } }),
      personas,
      fallback,
      now: NOW,
    });
    expect(b.clientId).toBe(WL);
  });

  it('takes the staff client id from the staff persona record, so Oscar is at Oak Tree', () => {
    const a = resolveActor({
      side: 'staff',
      state: state({ persona: { side: 'staff', userId: 'u-oscar' } }),
      personas,
      fallback,
      now: NOW,
    });
    expect(a).toEqual({ userId: 'u-oscar', side: 'staff', clientId: OT, now: NOW });
  });

  it('falls back to the default staff user when the stored persona is not a staff user', () => {
    const a = resolveActor({
      side: 'staff',
      state: state({ persona: { side: 'client', userId: 'u-priya' } }),
      personas,
      fallback,
      now: NOW,
    });
    expect(a.userId).toBe('u-jade');
    expect(a.clientId).toBe(LA);
  });

  it('gives the provider no client id even when a client persona is chosen', () => {
    const a = resolveActor({
      side: 'provider',
      state: state({ clientPersona: { userId: 'u-fiona' } }),
      personas,
      fallback,
      now: NOW,
    });
    expect(a).toEqual({ userId: 'u-prov', side: 'provider', now: NOW });
    expect('clientId' in a).toBe(false);
  });

  it('falls back to the default client admin when the chosen persona no longer exists', () => {
    const a = resolveActor({
      side: 'client',
      state: state({ clientPersona: { userId: 'u-gone' } }),
      personas,
      fallback,
      now: NOW,
    });
    expect(a.userId).toBe('u-priya');
    expect(a.clientId).toBe(LA);
  });

  it('does not use the staff persona for the client side', () => {
    const a = resolveActor({
      side: 'client',
      state: state({ persona: { side: 'staff', userId: 'u-oscar' } }),
      personas,
      fallback,
      now: NOW,
    });
    expect(a.userId).toBe('u-priya');
  });
});

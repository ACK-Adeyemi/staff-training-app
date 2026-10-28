// Works out who the app acts as (M3 assumption 1). The client id always comes from the chosen user's own record.
import type { ActorContext, PersonaListing } from '@sta/data';
import type { DemoState } from '@sta/domain';

export type PersonaEntry = PersonaListing;

export type ResolveActorInput = {
  side: 'staff' | 'client' | 'provider';
  state: DemoState;
  personas: readonly PersonaEntry[];
  /** Used when nothing valid is chosen: the default client admin, staff user and provider owner. */
  fallback: { clientUserId: string; staffUserId: string; providerUserId: string };
  now: string;
};

export function resolveActor({ side, state, personas, fallback, now }: ResolveActorInput): ActorContext {
  if (side === 'provider') return { userId: fallback.providerUserId, side, now };
  const find = (userId: string | undefined) =>
    userId === undefined ? undefined : personas.find((p) => p.userId === userId && p.side === side);
  const chosen =
    side === 'client' ? state.clientPersona?.userId : state.persona.side === 'staff' ? state.persona.userId : undefined;
  const fallbackId = side === 'client' ? fallback.clientUserId : fallback.staffUserId;
  const entry = find(chosen) ?? find(fallbackId);
  return {
    userId: entry?.userId ?? fallbackId,
    side,
    ...(entry ? { clientId: entry.clientId } : {}),
    now,
  };
}

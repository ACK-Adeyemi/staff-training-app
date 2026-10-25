// Test helpers for the web app's component tests (chunk 11). Not part of the app.
// Contract the implementer must provide:
//   ../app/providers  exports AppProviders({ store, clock, actor, demo, children })
//   ../app/routes     exports routes (react-router RouteObject[]), including the three shells, Not found and the route error element
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { createMemoryStore } from '@sta/data';
import type { ActorContext, StoreHandle } from '@sta/data';
import { createRng, fixedClock, type OutboxMessage } from '@sta/domain';
import { load, type SeedKeys } from '@sta/seed';
import { createT, languages } from '@sta/content';
import { AppProviders } from '../app/providers';
import { routes } from '../app/routes';

export const TODAY = '2026-10-19T09:00:00.000Z';
export const t = createT(languages['en-GB'].messages);

function need(v: string | undefined): string {
  if (v === undefined) throw new Error('missing seed key');
  return v;
}

export type Side = 'staff' | 'client' | 'provider';

export async function seededStore(): Promise<{ handle: StoreHandle; keys: SeedKeys }> {
  const handle = createMemoryStore({ clock: fixedClock(TODAY), rng: createRng(1) });
  const keys = await load(handle.admin, { seedValue: 20261019, today: TODAY });
  return { handle, keys };
}

export function actorFor(side: Side, keys: SeedKeys): ActorContext {
  if (side === 'staff')
    return { userId: need(keys.users.jade), side, clientId: need(keys.clients.littleAcorns), now: TODAY };
  if (side === 'client')
    return { userId: need(keys.users.priya), side, clientId: need(keys.clients.littleAcorns), now: TODAY };
  return { userId: need(keys.users.providerOwner), side, now: TODAY };
}

export function makeDemo(side: Side, keys: SeedKeys, handle?: StoreHandle) {
  const actor = actorFor(side, keys);
  return {
    state: { clockOffsetMs: 0, industry: 'nursery' as const, persona: { side, userId: actor.userId } },
    reset: vi.fn(),
    fastForward: vi.fn(),
    backToToday: vi.fn(),
    setIndustry: vi.fn(),
    // Chunk 8 contract: the sign-in screen lists staff and switches persona through these.
    listStaffUsers: (clientId: string) => (handle ? handle.admin.listStaffUsers(clientId) : Promise.resolve([])),
    signInAs: vi.fn(),
    listOutbox: () => Promise.resolve([] as OutboxMessage[]),
  };
}

export async function renderRoute(path: string, side: Side) {
  const { handle, keys } = await seededStore();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const demo = makeDemo(side, keys, handle);
  const view = render(
    <AppProviders
      store={handle.store}
      clock={fixedClock(TODAY)}
      actor={actorFor(side, keys)}
      demo={demo}
      subscribe={(l) => handle.subscribe(l)}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, demo, keys, handle };
}

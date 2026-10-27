import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import type { PersonaListing, StoreHandle } from '@sta/data';
import { offsetClock, systemClock, type DemoState } from '@sta/domain';
import { reset } from '@sta/seed';
import { resolveActor } from './app/actor';
import { AppProviders } from './app/providers';
import type { DemoApi } from './app/context';
import { routes } from './app/routes';
import type { Booted } from './demo/bootstrap';

const router = createHashRouter(routes);
const DAY_MS = 86_400_000;

type Side = 'staff' | 'client' | 'provider';
const sideOf = (pathname: string): Side => {
  const first = pathname.split('/')[1];
  // /print/... pages (the first aiders list) are client pages outside the client chrome.
  if (first === 'print') return 'client';
  return first === 'client' || first === 'provider' ? first : 'staff';
};

function Inner({ booted }: { booted: Booted }) {
  const { handle, keys, setOffset } = booted;
  const [state, setState] = useState<DemoState>(booted.state);
  const [personas, setPersonas] = useState<PersonaListing[]>(booted.personas);
  const pathname = useSyncExternalStore(
    (cb) => router.subscribe(cb),
    () => router.state.location.pathname,
  );
  const clock = useMemo(() => offsetClock(systemClock, state.clockOffsetMs), [state.clockOffsetMs]);
  const side = sideOf(pathname);
  const actor = useMemo(
    () =>
      resolveActor({
        side,
        state,
        personas,
        fallback: {
          clientUserId: keys.users['priya'],
          staffUserId: keys.users['jade'],
          providerUserId: keys.users['providerOwner'],
        },
        now: clock.now().toISOString(),
      }),
    [side, clock, keys, state, personas],
  );

  const demo = useMemo<DemoApi>(() => {
    const save = async (next: DemoState) => {
      await handle.admin.setDemoState(next);
      setOffset(next.clockOffsetMs);
      setState(next);
    };
    return {
      state,
      reset: async () => {
        await reset(handle.admin);
        setPersonas(await handle.admin.listPersonas());
        const next: DemoState = { ...state, clockOffsetMs: 0, persona: { side: 'staff', userId: keys.users['jade'] } };
        delete next.clientPersona;
        await save(next);
      },
      fastForward: (days) => save({ ...state, clockOffsetMs: state.clockOffsetMs + days * DAY_MS }),
      backToToday: () => save({ ...state, clockOffsetMs: 0 }),
      listOutbox: () => handle.admin.listOutbox(),
      listStaffUsers: (clientId) => handle.admin.listStaffUsers(clientId),
      listPersonas: () => handle.admin.listPersonas(),
      signInAsClient: (userId) => save({ ...state, clientPersona: { userId } }),
      signInAs: (userId) => save({ ...state, persona: { side: 'staff', userId } }),
      setDisplayPrefs: (displayPrefs) => save({ ...state, displayPrefs }),
      setIndustry: (industry) => save({ ...state, industry }),
      simulateFailedPayment: async () => {
        const chosen = state.clientPersona?.userId ?? keys.users['priya'];
        const clientId = personas.find((p) => p.userId === chosen && p.side === 'client')?.clientId;
        if (clientId) await handle.admin.simulateFailedPayment(clientId, clock.now().toISOString());
      },
    };
  }, [handle, keys.users, setOffset, state, personas, clock]);

  const subscribe = useCallback<StoreHandle['subscribe']>((l) => handle.subscribe(l), [handle]);

  return (
    <AppProviders store={handle.store} clock={clock} actor={actor} demo={demo} subscribe={subscribe}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export function App({ booted }: { booted: Booted }) {
  return <Inner booted={booted} />;
}

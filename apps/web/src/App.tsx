import { useMemo, useState, useSyncExternalStore } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import type { ActorContext } from '@sta/data';
import { offsetClock, systemClock, type DemoState } from '@sta/domain';
import { reset } from '@sta/seed';
import { AppProviders } from './app/providers';
import type { DemoApi } from './app/context';
import { routes } from './app/routes';
import type { Booted } from './demo/bootstrap';

const router = createHashRouter(routes);
const DAY_MS = 86_400_000;

type Side = 'staff' | 'client' | 'provider';
const sideOf = (pathname: string): Side => {
  const first = pathname.split('/')[1];
  return first === 'client' || first === 'provider' ? first : 'staff';
};

function Inner({ booted }: { booted: Booted }) {
  const { handle, keys, setOffset } = booted;
  const [state, setState] = useState<DemoState>(booted.state);
  const pathname = useSyncExternalStore(
    (cb) => router.subscribe(cb),
    () => router.state.location.pathname,
  );
  const clock = useMemo(() => offsetClock(systemClock, state.clockOffsetMs), [state.clockOffsetMs]);
  const side = sideOf(pathname);
  const actor = useMemo<ActorContext>(() => {
    const now = clock.now().toISOString();
    const clientId = keys.clients['littleAcorns'];
    if (side === 'provider') return { userId: keys.users['providerOwner'], side, now };
    const userId = side === 'client' ? keys.users['priya'] : keys.users['jade'];
    return { userId, side, ...(clientId ? { clientId } : {}), now };
  }, [side, clock, keys]);

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
        await save({ ...state, clockOffsetMs: 0 });
        window.location.reload();
      },
      fastForward: (days) => save({ ...state, clockOffsetMs: state.clockOffsetMs + days * DAY_MS }),
      backToToday: () => save({ ...state, clockOffsetMs: 0 }),
      setIndustry: (industry) => save({ ...state, industry }),
    };
  }, [handle, setOffset, state]);

  return (
    <AppProviders store={handle.store} clock={clock} actor={actor} demo={demo}>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export function App({ booted }: { booted: Booted }) {
  return <Inner booted={booted} />;
}

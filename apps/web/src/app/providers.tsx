import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createT, languages } from '@sta/content';
import type { ActorContext, DataStore, StoreHandle } from '@sta/data';
import type { Clock } from '@sta/domain';
import { DisplayPrefsProvider } from './display/DisplayPrefsProvider';
import { connectLiveUpdates } from './liveUpdates';
import { ActorCtx, ClockContext, DataStoreContext, DemoContext, I18nContext, type DemoApi } from './context';

const t = createT(languages['en-GB'].messages);

export function AppProviders({
  store,
  clock,
  actor,
  demo,
  subscribe,
  children,
}: {
  store: DataStore;
  clock: Clock;
  actor: ActorContext;
  demo: DemoApi;
  /** The store handle's change feed; when given, queries refresh after writes (M1 chunk 8). */
  subscribe?: StoreHandle['subscribe'];
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  useEffect(() => {
    if (!subscribe) return undefined;
    return connectLiveUpdates({
      subscribe,
      invalidate: () => {
        void queryClient.invalidateQueries();
      },
    });
  }, [subscribe, queryClient]);
  return (
    <DataStoreContext value={store}>
      <ClockContext value={clock}>
        <ActorCtx value={actor}>
          <I18nContext value={t}>
            <DemoContext value={demo}>
              <QueryClientProvider client={queryClient}>
                <DisplayPrefsProvider>{children}</DisplayPrefsProvider>
              </QueryClientProvider>
            </DemoContext>
          </I18nContext>
        </ActorCtx>
      </ClockContext>
    </DataStoreContext>
  );
}

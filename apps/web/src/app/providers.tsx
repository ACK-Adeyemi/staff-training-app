import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createT, languages } from '@sta/content';
import type { ActorContext, DataStore } from '@sta/data';
import type { Clock } from '@sta/domain';
import { ActorCtx, ClockContext, DataStoreContext, DemoContext, I18nContext, type DemoApi } from './context';

const t = createT(languages['en-GB'].messages);

export function AppProviders({
  store,
  clock,
  actor,
  demo,
  children,
}: {
  store: DataStore;
  clock: Clock;
  actor: ActorContext;
  demo: DemoApi;
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <DataStoreContext value={store}>
      <ClockContext value={clock}>
        <ActorCtx value={actor}>
          <I18nContext value={t}>
            <DemoContext value={demo}>
              <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            </DemoContext>
          </I18nContext>
        </ActorCtx>
      </ClockContext>
    </DataStoreContext>
  );
}

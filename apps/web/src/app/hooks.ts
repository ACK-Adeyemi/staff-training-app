import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ActorContext, DataStore } from '@sta/data';
import type { Clock } from '@sta/domain';
import type { TFunction } from '@sta/content';
import type { Speech } from './speech';
import {
  ActorCtx,
  ClockContext,
  SpeechContext,
  DataStoreContext,
  DemoContext,
  I18nContext,
  type DemoApi,
} from './context';

function need<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} is missing. Wrap the app in AppProviders.`);
  return value;
}

export const useStore = (): DataStore => need(useContext(DataStoreContext), 'DataStore');
export const useClock = (): Clock => need(useContext(ClockContext), 'Clock');
export const useActor = (): ActorContext => need(useContext(ActorCtx), 'Actor');
export const useT = (): TFunction => need(useContext(I18nContext), 'I18n');
export const useSpeech = (): Speech => useContext(SpeechContext);
export const useDemo = (): DemoApi => need(useContext(DemoContext), 'Demo');

/** The acting persona's user record, loaded through the data layer. */
export function useCurrentUser() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['currentUser', actor.userId, actor.side],
    queryFn: () => store.users.get(actor, actor.userId),
  });
}

/** The current app date (the injected clock, so Fast-forward shows through). */
export function useAppDate(): Date {
  return useClock().now();
}

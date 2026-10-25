import { createContext } from 'react';
import type { ActorContext, DataStore } from '@sta/data';
import type { Clock, DemoState } from '@sta/domain';
import type { TFunction } from '@sta/content';

export type DemoApi = {
  state: DemoState;
  reset: () => void | Promise<void>;
  fastForward: (days: number) => void | Promise<void>;
  backToToday: () => void | Promise<void>;
  setIndustry: (industry: DemoState['industry']) => void | Promise<void>;
};

export const DataStoreContext = createContext<DataStore | null>(null);
export const ClockContext = createContext<Clock | null>(null);
export const ActorCtx = createContext<ActorContext | null>(null);
export const I18nContext = createContext<TFunction | null>(null);
export const DemoContext = createContext<DemoApi | null>(null);

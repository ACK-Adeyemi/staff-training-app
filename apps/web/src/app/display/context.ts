import { createContext, useContext } from 'react';
import type { AppliedDisplayPrefs, DisplayPatch } from '@sta/domain';

export type DisplayPrefsApi = {
  prefs: AppliedDisplayPrefs;
  /** False until the saved settings have loaded, so one-off effects (such as haptics) wait for them. */
  ready: boolean;
  /** True after a save failed and the setting was put back. */
  saveFailed: boolean;
  update: (patch: DisplayPatch) => Promise<void>;
  reset: () => Promise<void>;
};

export const DisplayPrefsContext = createContext<DisplayPrefsApi | null>(null);

export function useDisplayPrefs(): DisplayPrefsApi {
  const api = useContext(DisplayPrefsContext);
  if (!api) throw new Error('DisplayPrefs is missing. Wrap the app in AppProviders.');
  return api;
}

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DISPLAY_KEYS,
  defaultDisplayPrefs,
  displayAttributes,
  mergeDisplayPrefs,
  type AppliedDisplayPrefs,
  type DisplayPatch,
  type LearnerPrefs,
} from '@sta/domain';
import { DemoContext } from '../context';
import { useActor, useStore } from '../hooks';
import { addPending, applyToHtml, clearPending, readPending, rememberApplied } from './applied';
import { DisplayPrefsContext, type DisplayPrefsApi } from './context';

const pickDisplay = (source: Partial<Record<string, unknown>> | undefined): AppliedDisplayPrefs => {
  const picked: Record<string, unknown> = {};
  for (const key of DISPLAY_KEYS) if (source?.[key] !== undefined) picked[key] = source[key];
  return mergeDisplayPrefs(undefined, picked);
};

const definedOnly = (patch: DisplayPatch): Partial<LearnerPrefs> =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

/**
 * Holds the active display settings and applies them to the html element (brief 19.3; plan assumption 29).
 * Staff and client admins use their own person's prefs; the provider side uses the device prefs in the demo state.
 * Changes show first and are saved after; a failed save puts the setting back.
 */
export function DisplayPrefsProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const actor = useActor();
  const demo = useContext(DemoContext);
  const personal = actor.side !== 'provider';
  const me = useQuery({
    queryKey: ['me', actor.userId],
    queryFn: () => store.me.get(actor),
    enabled: personal,
  });
  const base = personal ? me.data?.prefs : demo?.state.displayPrefs;
  const loaded = personal ? me.isSuccess || me.isError : true;

  const [prefs, setPrefs] = useState<AppliedDisplayPrefs>(defaultDisplayPrefs);
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const current = useRef(prefs);
  const saving = useRef(0);

  useEffect(() => {
    if (!loaded || saving.current > 0) return;
    const unsaved = personal ? readPending(actor.userId) : undefined;
    if (unsaved) {
      // A reload cut the last save short: save it now and show it.
      void store.me.updatePrefs(actor, unsaved as Partial<LearnerPrefs>).then(clearPending, clearPending);
    }
    const next = pickDisplay({ ...base, ...unsaved });
    current.current = next;
    setPrefs(next);
    setReady(true);
  }, [base, loaded, personal, actor, store]);

  useLayoutEffect(() => {
    // Until the saved settings load, keep what main.tsx applied from the device copy.
    if (!ready) return;
    const applied = displayAttributes(prefs);
    applyToHtml(applied);
    rememberApplied(applied);
  }, [prefs, ready]);

  // The font file is requested only when the dyslexia-friendly font is chosen.
  useEffect(() => {
    if (prefs.readingFont === 'dyslexiaFriendly')
      void import('@fontsource/opendyslexic/400.css').catch(() => undefined);
  }, [prefs.readingFont]);

  const update = useCallback(
    async (patch: DisplayPatch) => {
      const before = current.current;
      const next = mergeDisplayPrefs(before, patch);
      current.current = next;
      setPrefs(next);
      setSaveFailed(false);
      saving.current += 1;
      try {
        if (personal) {
          const saved = definedOnly(patch);
          addPending(actor.userId, saved);
          await store.me.updatePrefs(actor, saved);
          if (saving.current === 1) clearPending();
        } else await demo?.setDisplayPrefs?.(next);
      } catch {
        if (personal) clearPending();
        current.current = before;
        setPrefs(before);
        setSaveFailed(true);
      } finally {
        saving.current -= 1;
      }
    },
    [actor, demo, personal, store],
  );
  const reset = useCallback(() => update(defaultDisplayPrefs), [update]);

  const api = useMemo<DisplayPrefsApi>(
    () => ({ prefs, ready, saveFailed, update, reset }),
    [prefs, ready, saveFailed, update, reset],
  );
  return <DisplayPrefsContext value={api}>{children}</DisplayPrefsContext>;
}

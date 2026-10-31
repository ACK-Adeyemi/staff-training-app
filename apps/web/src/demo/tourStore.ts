import { useMemo, useSyncExternalStore } from 'react';
import { skip, start, tourStateSchema, type TourState } from '@sta/domain';
import { tours, type Tour } from '@sta/content';

/** Tour progress lives on this device only (brief 9). */
export const TOUR_KEY = 'sta.tour.v1';

const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(TOUR_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Saves the tour (or clears it with null) and tells every open part of the app. Never throws. */
export function saveTour(state: TourState | null): void {
  try {
    if (state) window.localStorage.setItem(TOUR_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(TOUR_KEY);
  } catch {
    // Storage is blocked or full: the tour simply is not remembered.
  }
  listeners.forEach((l) => {
    l();
  });
}

export const findTour = (id: string): Tour | undefined => tours.find((x) => x.id === id);

/** Reads stored text into a tour state. Unreadable or unknown means no tour; a mismatch starts the tour again. */
export function parseStoredTour(raw: string | null): TourState | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = tourStateSchema.safeParse(json);
  if (!parsed.success) return null;
  const stored = parsed.data;
  const tour = findTour(stored.tourId);
  if (!tour) return null;
  const count = tour.steps.length;
  const fits = stored.stepCount === count && (stored.status === 'complete' || stored.index < count);
  if (fits) return stored;
  return stored.status === 'skipped' ? skip(start(tour.id, count)) : start(tour.id, count);
}

/** The stored tour and its definition, or null. Updates when any part of the app saves. */
export function useStoredTour(): { state: TourState; tour: Tour } | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => {
    const state = parseStoredTour(raw);
    const tour = state ? findTour(state.tourId) : undefined;
    return state && tour ? { state, tour } : null;
  }, [raw]);
}

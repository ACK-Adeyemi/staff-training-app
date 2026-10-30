import { z } from 'zod';

// Pure guided-tour engine (build pack 8.4). Plain JSON state, no timers, no storage. Functions never mutate input.
export type TourStatus = 'active' | 'complete' | 'skipped';
export type TourState = { tourId: string; stepCount: number; index: number; status: TourStatus };

/** Shape of a stored tour (the app parses localStorage with this; anything else means "no tour"). */
export const tourStateSchema = z.object({
  tourId: z.string().min(1),
  stepCount: z.number().int().min(1),
  index: z.number().int().min(0),
  status: z.enum(['active', 'complete', 'skipped']),
});

export function start(tourId: string, stepCount: number): TourState {
  if (!Number.isInteger(stepCount) || stepCount < 1) throw new RangeError('A tour needs at least one step');
  return { tourId, stepCount, index: 0, status: 'active' };
}

export function next(state: TourState): TourState {
  if (state.status !== 'active') return state;
  if (state.index >= state.stepCount - 1) return { ...state, status: 'complete' };
  return { ...state, index: state.index + 1 };
}

export function back(state: TourState): TourState {
  if (state.status === 'complete') return { ...state, status: 'active', index: state.stepCount - 1 };
  if (state.status !== 'active' || state.index === 0) return state;
  return { ...state, index: state.index - 1 };
}

export function skip(state: TourState): TourState {
  return state.status === 'complete' ? state : { ...state, status: 'skipped' };
}

export function restart(state: TourState): TourState {
  return start(state.tourId, state.stepCount);
}

export function resume(stored: unknown, tourId: string, stepCount: number): TourState {
  if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
    const s = stored as Record<string, unknown>;
    const { index } = s;
    if (
      s['tourId'] === tourId &&
      s['stepCount'] === stepCount &&
      (s['status'] === 'active' || s['status'] === 'skipped') &&
      typeof index === 'number' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < stepCount
    )
      return { tourId, stepCount, index, status: 'active' };
  }
  return start(tourId, stepCount);
}

export function isComplete(state: TourState): boolean {
  return state.status === 'complete';
}

export function stepNumber(state: TourState): number {
  return state.index + 1;
}

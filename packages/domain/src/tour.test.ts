// M5 chunk 1, F-3 (build pack 8.4): the pure tour engine in packages/domain/src/tour.ts. No timers, no storage.
//
// API assumed (the implementer builds exactly this; names may only change by editing this test):
//   type TourStatus = 'active' | 'complete' | 'skipped';
//   type TourState = { tourId: string; stepCount: number; index: number; status: TourStatus };  // plain JSON data
//   start(tourId, stepCount): TourState          // index 0, active. Throws RangeError if stepCount is not an integer >= 1.
//   next(state): TourState                       // active and not last: index + 1. Active at the last step: status 'complete'
//                                                // (index stays on the last step; the UI then shows "Try this next").
//                                                // Complete or skipped: returned unchanged.
//   back(state): TourState                       // active and index > 0: index - 1. At the first step: unchanged.
//                                                // Complete: active again on the last step. Skipped: unchanged.
//   skip(state): TourState                       // status 'skipped', index kept. Skipping a complete tour leaves it complete.
//   restart(state): TourState                    // start(state.tourId, state.stepCount)
//   resume(stored: unknown, tourId, stepCount): TourState
//        // stored is JSON-parsed localStorage content (or anything at all). A valid active or skipped state for the same
//        // tourId and stepCount with an integer index in range resumes active at that index. Anything else (null, text,
//        // wrong tour, changed step count, out-of-range or fractional index, unknown status, complete) starts afresh.
//        // Never throws.
//   isComplete(state): boolean                   // status === 'complete'
//   stepNumber(state): number                    // index + 1, for "step 3 of 9"
// Functions never mutate their input.
import { describe, expect, it } from 'vitest';
import { back, isComplete, next, restart, resume, skip, start, stepNumber } from './tour';

const ID = 'track-a';
const fresh = (): ReturnType<typeof start> => start(ID, 9);
const at = (n: number): ReturnType<typeof start> => {
  let s = fresh();
  for (let i = 0; i < n; i++) s = next(s);
  return s;
};

describe('start', () => {
  it('opens on the first step, active', () => {
    expect(start(ID, 9)).toEqual({ tourId: ID, stepCount: 9, index: 0, status: 'active' });
    expect(stepNumber(start(ID, 9))).toBe(1);
    expect(isComplete(start(ID, 9))).toBe(false);
  });
  it.each([0, -1, 2.5, Number.NaN])('rejects a step count of %s', (n) => {
    expect(() => start(ID, n)).toThrow(RangeError);
  });
});

describe('next', () => {
  it.each([0, 3, 7])('moves from step index %s to the following step', (i) => {
    const s = at(i);
    expect(next(s)).toMatchObject({ index: i + 1, status: 'active' });
  });
  it('completes when pressed at the last step and keeps the index on the last step', () => {
    const last = at(8);
    expect(last).toMatchObject({ index: 8, status: 'active' });
    const done = next(last);
    expect(done).toMatchObject({ index: 8, status: 'complete' });
    expect(isComplete(done)).toBe(true);
  });
  it('does nothing once complete', () => {
    const done = next(at(8));
    expect(next(done)).toEqual(done);
  });
  it('does nothing once skipped', () => {
    const s = skip(at(2));
    expect(next(s)).toEqual(s);
  });
  it('completes a one-step tour on the first press', () => {
    expect(next(start('tiny', 1))).toMatchObject({ index: 0, status: 'complete' });
  });
  it('does not mutate its input', () => {
    const s = at(2);
    const copy = { ...s };
    next(s);
    expect(s).toEqual(copy);
  });
});

describe('back', () => {
  it('moves to the previous step', () => {
    expect(back(at(4))).toMatchObject({ index: 3, status: 'active' });
  });
  it('stays on the first step', () => {
    expect(back(fresh())).toEqual(fresh());
  });
  it('returns from the finished list to the last step', () => {
    expect(back(next(at(8)))).toMatchObject({ index: 8, status: 'active' });
  });
  it('does nothing once skipped', () => {
    const s = skip(at(4));
    expect(back(s)).toEqual(s);
  });
});

describe('skip', () => {
  it('marks the tour skipped and remembers where it was', () => {
    const s = skip(at(4));
    expect(s).toMatchObject({ index: 4, status: 'skipped' });
    expect(isComplete(s)).toBe(false);
  });
  it('leaves a completed tour complete', () => {
    expect(skip(next(at(8))).status).toBe('complete');
  });
});

describe('restart', () => {
  it.each([
    ['mid-tour', at(5)],
    ['skipped', skip(at(5))],
    ['complete', next(at(8))],
  ])('goes back to step 1, active, from %s', (_name, s) => {
    expect(restart(s)).toEqual(start(ID, 9));
  });
});

describe('resume', () => {
  const stored = (over: Record<string, unknown> = {}): unknown => JSON.parse(JSON.stringify({ ...at(4), ...over }));

  it('continues from the stored step after a JSON round trip', () => {
    expect(resume(stored(), ID, 9)).toEqual({ tourId: ID, stepCount: 9, index: 4, status: 'active' });
  });
  it('re-opens a skipped tour at the step it was skipped on', () => {
    expect(resume(stored({ status: 'skipped' }), ID, 9)).toMatchObject({ index: 4, status: 'active' });
  });
  it('accepts the first and last step', () => {
    expect(resume(stored({ index: 0 }), ID, 9).index).toBe(0);
    expect(resume(stored({ index: 8 }), ID, 9).index).toBe(8);
  });
  it('starts afresh when the stored tour was finished', () => {
    expect(resume(stored({ status: 'complete', index: 8 }), ID, 9)).toEqual(start(ID, 9));
  });
  it.each([
    ['too high', { index: 9 }],
    ['negative', { index: -1 }],
    ['fractional', { index: 2.5 }],
    ['not a number', { index: '3' }],
    ['missing', { index: undefined }],
    ['an unknown status', { status: 'paused' }],
    ['another tour', { tourId: 'track-b' }],
    ['a different step count', { stepCount: 7 }],
  ])('starts afresh when the stored index or fields are unusable (%s)', (_name, over) => {
    expect(resume(stored(over), ID, 9)).toEqual(start(ID, 9));
  });
  it.each([null, undefined, 'garbage', 42, [], true, {}, '{"index":3}'])(
    'starts afresh for unreadable stored value %j',
    (value) => {
      expect(resume(value, ID, 9)).toEqual(start(ID, 9));
    },
  );
});

describe('stepNumber', () => {
  it('counts from 1 for the "step 3 of 9" label', () => {
    expect(stepNumber(at(2))).toBe(3);
    expect(stepNumber(at(8))).toBe(9);
  });
});

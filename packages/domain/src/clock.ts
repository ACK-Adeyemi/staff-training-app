// The injected clock (brief 9, build pack 4.2). All domain code reads time through a Clock.
export interface Clock {
  now(): Date;
}

/** A clock that always returns the same instant. Each call returns a fresh Date. */
export const fixedClock = (iso: string): Clock => {
  const ms = new Date(iso).getTime();
  return { now: () => new Date(ms) };
};

/** A clock that follows `base` plus `offsetMs` (Fast-forward in the demo shell; 0 is "Back to today"). */
export const offsetClock = (base: Clock, offsetMs: number): Clock => ({
  now: () => new Date(base.now().getTime() + offsetMs),
});

/** The real time. The only permitted use of Date.now() in the code base. */
export const systemClock: Clock = {
  // eslint-disable-next-line no-restricted-properties -- systemClock is the single allowed wall-clock read; everything else injects a Clock.
  now: () => new Date(Date.now()),
};

/** ISO 8601 in UTC with milliseconds and a Z suffix. */
export const nowIso = (clock: Clock): string => clock.now().toISOString();

// London-aware date helpers built on Intl.DateTimeFormat (no date library). Build pack 4.2.
// addDays and addMonths move by calendar days or months in the zone and keep the wall-clock time.
// When a wall-clock time happens twice (the repeated 01:xx hour when clocks go back) the earlier
// instant is used. When it never happens (the skipped hour in March) the time moves forward.

const LONDON = 'Europe/London';
const DAY_MS = 86_400_000;

interface Wall {
  y: number;
  m: number; // 1 to 12
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (tz: string): Intl.DateTimeFormat => {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
};

const wallOf = (date: Date, tz: string): Wall => {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    y: out['year'] ?? 0,
    m: out['month'] ?? 1,
    d: out['day'] ?? 1,
    h: out['hour'] ?? 0,
    mi: out['minute'] ?? 0,
    s: out['second'] ?? 0,
    ms: date.getUTCMilliseconds(),
  };
};

const wallAsUtcMs = (w: Wall): number => Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s, w.ms);

/** Offset of the zone from UTC in ms at an instant (positive when ahead of UTC). */
const offsetAt = (ms: number, tz: string): number => wallAsUtcMs(wallOf(new Date(ms), tz)) - ms;

/** The instant at which the zone's clock shows the wall time. */
const fromWall = (w: Wall, tz: string): Date => {
  const wallMs = wallAsUtcMs(w);
  const offsets = new Set([offsetAt(wallMs - DAY_MS, tz), offsetAt(wallMs + DAY_MS, tz)]);
  const valid = [...offsets].map((o) => wallMs - o).filter((c) => offsetAt(c, tz) === wallMs - c);
  if (valid.length > 0) return new Date(Math.min(...valid));
  // Skipped hour: use the offset in force before the change, which moves the time forward.
  return new Date(wallMs - Math.min(...offsets));
};

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Add calendar days in London, keeping the London wall-clock time. */
export const addDays = (date: Date, days: number, tz: string = LONDON): Date => {
  const w = wallOf(date, tz);
  const moved = new Date(Date.UTC(w.y, w.m - 1, w.d + days));
  return fromWall({ ...w, y: moved.getUTCFullYear(), m: moved.getUTCMonth() + 1, d: moved.getUTCDate() }, tz);
};

/** Add calendar months in London, clamping to the end of a shorter month (31 Jan + 1 month = 28 Feb). */
export const addMonths = (date: Date, months: number, tz: string = LONDON): Date => {
  const w = wallOf(date, tz);
  const index = w.y * 12 + (w.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  return fromWall({ ...w, y, m, d: Math.min(w.d, daysInMonth(y, m)) }, tz);
};

/** Signed whole London calendar days from `from` to `to`. Time of day is ignored. */
export const daysBetween = (from: Date, to: Date, tz: string = LONDON): number => {
  const a = wallOf(from, tz);
  const b = wallOf(to, tz);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
};

/** 00:00 London time on the same London calendar day. */
export const startOfLondonDay = (date: Date, tz: string = LONDON): Date => {
  const w = wallOf(date, tz);
  return fromWall({ y: w.y, m: w.m, d: w.d, h: 0, mi: 0, s: 0, ms: 0 }, tz);
};

/** 00:00 on the Monday of the week containing the date, in the zone (default London). */
export const mondayOfWeek = (date: Date, tz: string = LONDON): Date => {
  const w = wallOf(date, tz);
  const weekday = new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay(); // 0 is Sunday
  const back = (weekday + 6) % 7;
  const monday = new Date(Date.UTC(w.y, w.m - 1, w.d - back));
  return fromWall(
    { y: monday.getUTCFullYear(), m: monday.getUTCMonth() + 1, d: monday.getUTCDate(), h: 0, mi: 0, s: 0, ms: 0 },
    tz,
  );
};

/** The instant at which London's clock shows the given wall time. */
export const fromLondonWall = (w: {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
}): Date => fromWall(w, LONDON);

/** The London calendar day of an instant, as YYYY-MM-DD. */
export const londonDateString = (date: Date): string => {
  const w = wallOf(date, LONDON);
  return `${String(w.y).padStart(4, '0')}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
};

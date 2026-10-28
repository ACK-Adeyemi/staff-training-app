// When the scheduled jobs run for a Fast-forward (M3 review fix, BP-6). A real server would run them every day at one
// fixed time. Running each skipped day at its London midday keeps a presenter who fast-forwards at night from losing
// every reminder to quiet hours; the last run is at the new "now", as the app would see it.
import { addDays, fromLondonWall, londonDateString } from '@sta/domain';

const MIDDAY = 12;

export function fastForwardRunTimes(from: Date, days: number): string[] {
  const times: string[] = [];
  for (let day = 1; day < days; day++) {
    const [y, m, d] = londonDateString(addDays(from, day)).split('-').map(Number) as [number, number, number];
    times.push(fromLondonWall({ y, m, d, h: MIDDAY, mi: 0, s: 0, ms: 0 }).toISOString());
  }
  if (days >= 1) times.push(addDays(from, days).toISOString());
  return times;
}

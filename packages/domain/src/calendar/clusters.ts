// Expiry clusters by requirement and London week, for "Assign refresher for a week" (brief 28.3; plan M3 assumptions 31, 34).
import type { CalendarItem } from './items';

export type Cluster = {
  requirementId: string;
  /** The London Monday, YYYY-MM-DD. */
  weekStart: string;
  count: number;
  personIds: string[];
  itemIds: string[];
  /** The earliest expiry in the cluster: the due date for the refresher assignment. */
  earliestDate: string;
};

/** Monday of the week containing a calendar date. Pure calendar arithmetic, so clock changes cannot move it. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const back = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

export function expiryClusters(items: CalendarItem[]): Cluster[] {
  const groups = new Map<string, Cluster>();
  for (const item of items) {
    if (item.kind !== 'expiry' || item.requirementId === undefined || item.personId === undefined) continue;
    const weekStart = mondayOf(item.date);
    const key = `${item.requirementId}|${weekStart}`;
    const c = groups.get(key) ?? {
      requirementId: item.requirementId,
      weekStart,
      count: 0,
      personIds: [],
      itemIds: [],
      earliestDate: item.date,
    };
    if (!c.personIds.includes(item.personId)) c.personIds.push(item.personId);
    c.count = c.personIds.length;
    c.itemIds.push(item.id);
    if (item.date < c.earliestDate) c.earliestDate = item.date;
    groups.set(key, c);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.weekStart.localeCompare(b.weekStart) || b.count - a.count || a.requirementId.localeCompare(b.requirementId),
  );
}

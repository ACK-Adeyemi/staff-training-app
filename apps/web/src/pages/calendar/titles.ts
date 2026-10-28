// Item titles from the language file (the domain gives a titleKey and parameters; the text lives in en-GB).
import type { MessageKey, TFunction } from '@sta/content';
import { expiryClusters, type CalendarItem, type IcsItem } from '@sta/domain';

/** Admins see the person's name in their own list; everyone else, and every .ics file, gets the title without it. */
export function itemTitle(t: TFunction, item: CalendarItem, named = false): string {
  const params = { ...item.params };
  if (typeof params.state === 'string') params.state = t(`account.state.${params.state}` as MessageKey);
  const key = named && 'person' in item.params ? `calendar.admin.${item.kind}` : item.titleKey;
  return t(key as MessageKey, params);
}

/**
 * The events for a team .ics file: no names. Expiries become "3 Safeguarding expiries" for the week; other items that
 * read the same on the same day are folded into one with a count.
 */
export function teamIcsItems(t: TFunction, items: CalendarItem[], requirementName: (id: string) => string): IcsItem[] {
  const out: IcsItem[] = [];
  for (const c of expiryClusters(items)) {
    const requirement = requirementName(c.requirementId);
    out.push({
      id: `cluster:${c.requirementId}:${c.weekStart}`,
      title:
        c.count === 1
          ? t('calendar.clusterOne', { requirement })
          : t('calendar.clusterTitle', { count: c.count, requirement }),
      date: c.earliestDate,
    });
  }
  const folded = new Map<string, { id: string; title: string; date: string; count: number }>();
  for (const item of items) {
    if (item.kind === 'expiry') continue;
    const title = itemTitle(t, item);
    const key = `${item.kind}|${item.date}|${title}`;
    const seen = folded.get(key);
    if (seen) seen.count += 1;
    else folded.set(key, { id: item.id, title, date: item.date, count: 1 });
  }
  for (const f of folded.values()) {
    out.push({
      id: f.id,
      title: f.count > 1 ? t('calendar.manyPeople', { title: f.title, count: f.count }) : f.title,
      date: f.date,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

// Ranking with shared ties, the staff top-10 view with a private position, and the admin view (plan M2 assumptions 8, 9, 17).
// Ties share a rank (1, 2, 2, 4) and are ordered by display name, never by who got there first.
// Staff views carry no ids at all, so nothing identifies another person.
import { engagementConfig } from '../engagement/config';
import type { Person } from '../schemas/tenancy';

export type Entry = { id: string; name: string; value: number };
export type Ranked = Entry & { rank: number };

/** Nickname if set, else first name plus last initial ("Jade M."). */
export function displayName(p: Pick<Person, 'nickname' | 'firstName' | 'lastName'>): string {
  if (p.nickname) return p.nickname;
  const initial = p.lastName.trim().charAt(0).toUpperCase();
  return initial === '' ? p.firstName : `${p.firstName} ${initial}.`;
}

const byValueThenName = (a: Entry, b: Entry): number =>
  b.value - a.value || a.name.localeCompare(b.name, 'en-GB') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function rankSorted(entries: readonly Entry[]): Ranked[] {
  const sorted = [...entries].sort(byValueThenName);
  let rank = 0;
  return sorted.map((e, i) => {
    if (i === 0 || e.value !== (sorted[i - 1] as Entry).value) rank = i + 1;
    return { ...e, rank };
  });
}

/** Zeros stay in the ranking (they count towards "of N"); they share the last rank. */
export function rankEntries(values: ReadonlyMap<string, number>, names: ReadonlyMap<string, string>): Ranked[] {
  return rankSorted([...values].map(([id, value]) => ({ id, name: names.get(id) ?? '', value })));
}

export type LeaderboardRow = { rank: number; name: string; value: number; isViewer: boolean };
export type ViewerPosition = { rank: number | null; of: number; value: number; toNext: number | null; hidden: boolean };
export type LeaderboardView = { visible: boolean; rows: LeaderboardRow[]; viewer: ViewerPosition | null };

export function leaderboardView(input: {
  entries: readonly Entry[];
  viewerId: string;
  hiddenIds: ReadonlySet<string>;
  rowsVisible: boolean;
  limit?: number;
}): LeaderboardView {
  const limit = input.limit ?? engagementConfig.competitions.topRows;
  const shown = input.entries.filter((e) => !input.hiddenIds.has(e.id));
  const ranked = rankSorted(shown);
  const viewerHidden = input.hiddenIds.has(input.viewerId);
  const me = input.entries.find((e) => e.id === input.viewerId);

  const rows: LeaderboardRow[] = input.rowsVisible
    ? ranked
        .filter((r) => r.value > 0 && r.rank <= limit)
        .map((r) => ({ rank: r.rank, name: r.name, value: r.value, isViewer: r.id === input.viewerId }))
    : [];

  let viewer: ViewerPosition | null = null;
  if (me) {
    const own = viewerHidden ? rankSorted([...shown, me]) : ranked;
    const mine = own.find((r) => r.id === me.id) as Ranked;
    const better = own.filter((r) => r.value > mine.value).map((r) => r.value);
    viewer = {
      rank: mine.value > 0 ? mine.rank : null,
      of: own.length,
      value: mine.value,
      toNext: mine.value > 0 && better.length > 0 ? Math.min(...better) - mine.value : null,
      hidden: viewerHidden,
    };
  }
  return { visible: input.rowsVisible, rows, viewer };
}

export type AdminRow = {
  rank: number;
  name: string;
  value: number;
  personId?: string;
  teamId?: string;
  siteId?: string;
};

/** Admins see ids and names (to hand over prizes), but still not people who hide from leaderboards. */
export function adminLeaderboardView(input: {
  entries: readonly Entry[];
  hiddenIds: ReadonlySet<string>;
  idKey?: 'personId' | 'teamId' | 'siteId';
}): { rows: AdminRow[]; of: number } {
  const key = input.idKey ?? 'personId';
  const ranked = rankSorted(input.entries.filter((e) => !input.hiddenIds.has(e.id)));
  return {
    rows: ranked.filter((r) => r.value > 0).map((r) => ({ rank: r.rank, name: r.name, value: r.value, [key]: r.id })),
    of: ranked.length,
  };
}

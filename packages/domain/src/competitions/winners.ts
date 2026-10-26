// Choosing winners and announcing them (plan M2 assumption 15).
// Hidden people are filtered out of `standing` by the caller; they stay in the draw's qualifiers.
import { engagementConfig } from '../engagement/config';
import type { Competition } from '../schemas/engagement';
import type { Rng } from '../rng';
import type { Person, Team } from '../schemas/tenancy';
import { displayName, type Ranked } from './leaderboard';

export type Winner = { personId: string } | { teamId: string };

/** n distinct qualifiers. The same seed gives the same winners whatever order the qualifiers arrive in. */
export function drawWinners(qualifiers: readonly string[], count: number, rng: Rng): string[] {
  const ordered = [...new Set(qualifiers)].sort();
  return rng.shuffle(ordered).slice(0, Math.max(0, count));
}

export function selectWinners(
  c: Pick<Competition, 'id' | 'templateId' | 'winnerSelection' | 'winnerCount' | 'teamTarget'>,
  standing: readonly Ranked[],
  qualifiers: readonly string[],
  rng: Rng,
): Winner[] {
  const cfg = engagementConfig.competitions;
  const asWinner = (id: string): Winner => (c.templateId === 'teamShowdown' ? { teamId: id } : { personId: id });
  const count = c.winnerCount ?? cfg.defaultWinnerCount;
  switch (c.winnerSelection) {
    case 'top':
      return standing.filter((r) => r.rank <= count && r.value > 0).map((r) => asWinner(r.id));
    case 'teamTarget': {
      const target = c.teamTarget ?? cfg.defaultTeamTarget;
      return standing.filter((r) => r.value >= target).map((r) => asWinner(r.id));
    }
    case 'draw':
      return drawWinners(qualifiers, count, rng.fork(c.id)).map(asWinner);
    default:
      return [];
  }
}

export type WinnerLine = { name?: string; hidden: boolean };

/** Staff see display names, with hidden winners withheld; admins see every name. */
export function winnerNames(input: {
  winners: readonly { personId?: string; teamId?: string }[];
  people: readonly Person[];
  teams: readonly Pick<Team, 'id' | 'name'>[];
  audience: 'staff' | 'admin';
}): WinnerLine[] {
  return input.winners.map((w): WinnerLine => {
    if (w.teamId !== undefined) {
      const t = input.teams.find((x) => x.id === w.teamId);
      return t ? { name: t.name, hidden: false } : { hidden: true };
    }
    const p = input.people.find((x) => x.id === w.personId);
    if (!p || (input.audience === 'staff' && p.prefs.hideFromLeaderboards)) return { hidden: true };
    return { name: displayName(p), hidden: false };
  });
}

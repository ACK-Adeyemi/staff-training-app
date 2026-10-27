import type { MessageKey, TFunction } from '@sta/content';
import { Icon, type IconName } from '@sta/ui';
import {
  fromLondonWall,
  type BoardId,
  type Competition,
  type CompetitionStatus,
  type CompetitionTemplateId,
} from '@sta/domain';
import { formatLondonDate } from '../../demo/format';

export const BOARD_ORDER: readonly BoardId[] = [
  'correctQuestions',
  'modulesCompleted',
  'modulesMastered',
  'activeWeeks',
  'refresherChampions',
  'teamBoard',
];

/** The language file calls the closed-book template `closedBook`. */
const templateSlug = (id: CompetitionTemplateId): string => (id === 'closedBookChallenge' ? 'closedBook' : id);

export const templateText = (t: TFunction, id: CompetitionTemplateId, part: 'name' | 'howToWin' | 'why'): string =>
  t(`competition.templates.${templateSlug(id)}.${part}` as MessageKey);

export const ordinalText = (t: TFunction, n: number): string => {
  const rule = new Intl.PluralRules('en-GB', { type: 'ordinal' }).select(n) as 'one' | 'two' | 'few' | 'other';
  return t(`leaderboard.ordinal.${rule}`, { n });
};

export const boardTitle = (t: TFunction, board: BoardId): string => t(`compete.boardTitles.${board}` as MessageKey);

export const unitText = (t: TFunction, board: BoardId | 'competition', n: number): string =>
  t(`compete.units.${board}.${n === 1 ? 'one' : 'other'}` as MessageKey, { n });

export const dateRange = (t: TFunction, c: Pick<Competition, 'startAt' | 'endAt'>): string =>
  t('compete.dates', { start: formatLondonDate(c.startAt), end: formatLondonDate(c.endAt) });

const STATUS_ICON: Record<CompetitionStatus, IconName> = {
  live: 'check',
  scheduled: 'clock',
  ended: 'minus-circle',
  draft: 'help',
  cancelled: 'x-circle',
};

/** A status as an icon and a word, never colour alone. */
export function StatusWord({ status, t }: { status: CompetitionStatus; t: TFunction }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border-2 border-[var(--color-border)] px-2 py-1 text-sm font-semibold">
      <Icon name={STATUS_ICON[status]} size={16} />
      <span>{t(`competition.status.${status}` as MessageKey)}</span>
    </span>
  );
}

const parts = (date: string): { y: number; m: number; d: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};

/** The start of a London calendar day (yyyy-mm-dd) as an ISO instant, or null when the text is not a date. */
export function londonDayStart(date: string): string | null {
  const p = parts(date);
  return p ? fromLondonWall({ ...p, h: 0, mi: 0, s: 0, ms: 0 }).toISOString() : null;
}

/** The last second of a London calendar day, so an end date includes its whole day. */
export function londonDayEnd(date: string): string | null {
  const p = parts(date);
  return p ? fromLondonWall({ ...p, h: 23, mi: 59, s: 59, ms: 0 }).toISOString() : null;
}

export const SITE_MEASURES = ['compliance', 'onTime', 'participation', 'knowledge'] as const;

export const measureLabel = (t: TFunction, measure: string): string =>
  t(`sitesBoard.measures.${measure}` as MessageKey);

export const scopeLabel = (t: TFunction, scope: string): string => t(`leaderboard.scopes.${scope}` as MessageKey);

/** A Sites board value: a percentage, or the Knowledge measure to one decimal place. */
export const siteValueText = (measure: string, value: number): string =>
  measure === 'knowledge' ? value.toFixed(1) : `${String(value)}%`;

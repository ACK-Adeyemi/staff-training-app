import { Icon } from './Icon';

export interface LeaderboardRow {
  id: string;
  rank: number;
  tied: boolean;
  name: string;
  /** Value with its unit, for example "42 correct". */
  valueText: string;
  isViewer?: boolean;
}
export interface LeaderboardListProps {
  label: string;
  rows: LeaderboardRow[];
  jointLabel: string;
  youLabel: string;
  /** The viewer's own position when they are not shown in the list. Kept out of the list. */
  privatePositionText?: string;
  /** Optional test id put on every row. */
  rowTestId?: string;
}

export function LeaderboardList({
  label,
  rows,
  jointLabel,
  youLabel,
  privatePositionText,
  rowTestId,
}: LeaderboardListProps) {
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label={label} className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => (
          <li
            key={r.id}
            data-viewer={r.isViewer ? 'true' : undefined}
            data-testid={rowTestId}
            aria-current={r.isViewer ? 'true' : undefined}
            className={`flex min-h-[var(--target-min)] flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2 ${r.isViewer ? 'border-4 border-[var(--color-accent)]' : 'border-2 border-[var(--color-border)]'}`}
          >
            <span className="min-w-8 font-bold">{r.tied ? `${r.rank} (${jointLabel})` : r.rank}</span>
            <span className="flex-1 font-semibold">{r.name}</span>
            {r.isViewer ? (
              <span className="inline-flex items-center gap-1 font-bold">
                <Icon name="user" size={16} />
                {youLabel}
              </span>
            ) : null}
            <span>{r.valueText}</span>
          </li>
        ))}
      </ol>
      {privatePositionText ? <p className="m-0 font-semibold">{privatePositionText}</p> : null}
    </div>
  );
}

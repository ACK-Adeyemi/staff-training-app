import { useState } from 'react';
import { Button } from './Button';
import { DataTable } from './DataTable';

export type StatusBarTone = 'current' | 'expiring' | 'overdue' | 'not-assigned' | 'awaiting';

export interface StatusBarSegment {
  label: string;
  value: number;
  tone?: StatusBarTone;
}
export interface StatusBarProps {
  description: string;
  segments: StatusBarSegment[];
  labelHeader: string;
  valueHeader: string;
  tableCaption: string;
  showTableLabel: string;
  hideTableLabel: string;
}

const defaultTones: StatusBarTone[] = ['current', 'expiring', 'overdue', 'not-assigned', 'awaiting'];

/** A stacked bar. The legend gives every segment in words and numbers; a table gives the same figures. */
export function StatusBar(props: StatusBarProps) {
  const [table, setTable] = useState(false);
  const segs = props.segments.map((s, i) => ({
    ...s,
    value: Number.isFinite(s.value) ? Math.max(0, s.value) : 0,
    tone: s.tone ?? defaultTones[i % defaultTones.length] ?? 'current',
  }));
  const total = segs.reduce((n, s) => n + s.value, 0);
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={props.description}
        className="flex h-6 w-full overflow-hidden rounded-[var(--radius-sm)] border-2 border-[var(--color-text)] bg-[var(--color-surface)]"
      >
        {segs.map((s, i) =>
          s.value > 0 && total > 0 ? (
            <div
              key={i}
              style={{ flexGrow: s.value, background: `var(--status-${s.tone})` }}
              className="min-w-1 border-e-2 border-[var(--color-bg)] last:border-e-0"
            />
          ) : null,
        )}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
        {segs.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              style={{ background: `var(--status-${s.tone})` }}
              className="inline-block h-3 w-3 border border-[var(--color-text)]"
            />
            {`${s.label} ${s.value}`}
          </li>
        ))}
      </ul>
      <div>
        <Button
          variant="secondary"
          aria-expanded={table}
          onClick={() => {
            setTable((t) => !t);
          }}
        >
          {table ? props.hideTableLabel : props.showTableLabel}
        </Button>
      </div>
      {table ? (
        <DataTable
          caption={props.tableCaption}
          columns={[
            { key: 'label', header: props.labelHeader },
            { key: 'value', header: props.valueHeader },
          ]}
          rows={segs.map((s, i) => ({ id: String(i), cells: { label: s.label, value: String(s.value) } }))}
        />
      ) : null}
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { DataTable } from './DataTable';

export interface ChartPoint {
  label: string;
  value: number;
  /** Shorter text under the mark when the full label would not fit; the table always shows `label`. */
  axisLabel?: string;
}
export interface ChartProps {
  /** Full sentence naming the values, used as the image's accessible name. */
  description: string;
  data: ChartPoint[];
  labelHeader: string;
  valueHeader: string;
  tableCaption: string;
  showTableLabel: string;
  hideTableLabel: string;
  /** Added to each value in the table only (for example "%"). */
  valueSuffix?: string;
}

export const CHART_W = 320;
export const CHART_H = 180;

/** Shared frame: the SVG as an image, and a toggle that swaps in a data table with the same numbers. */
export function ChartShell({
  props,
  children,
  rowHeader = true,
}: {
  props: ChartProps;
  children: ReactNode;
  rowHeader?: boolean;
}) {
  const [table, setTable] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={props.description}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-auto w-full max-w-lg text-[var(--color-text)]"
      >
        {children}
      </svg>
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
          rows={props.data.map((d, i) => ({
            id: String(i),
            cells: { label: d.label, value: `${String(d.value)}${props.valueSuffix ?? ''}` },
          }))}
          rowHeader={rowHeader}
        />
      ) : null}
    </div>
  );
}

export function maxOf(data: ChartPoint[]): number {
  return Math.max(1, ...data.map((d) => (Number.isFinite(d.value) ? d.value : 0)));
}

import { useRef, useState, type KeyboardEvent } from 'react';
import { Button, focusClasses } from './Button';

export interface MonthGridProps {
  label: string;
  year: number;
  /** 1 to 12. */
  month: number;
  weekStartsOn: 1;
  dayNames: string[];
  counts: Record<string, number>;
  countLabel: (n: number, isoDate: string) => string;
  selected?: string | undefined;
  onSelect: (isoDate: string) => void;
  listLabel: string;
  showListLabel: string;
  hideListLabel: string;
  listItems?: { date: string; text: string }[];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function MonthGrid(props: MonthGridProps) {
  const { year, month, counts, selected } = props;
  const [list, setList] = useState(false);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const iso = (d: number) => `${String(year).padStart(4, '0')}-${pad(month)}-${pad(d)}`;
  // getUTCDay: 0 is Sunday. The grid starts on Monday.
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const selectedDay = selected && selected.startsWith(iso(1).slice(0, 8)) ? Number(selected.slice(8, 10)) : undefined;
  const [focusDay, setFocusDay] = useState<number>(selectedDay ?? 1);
  const active = Math.min(Math.max(focusDay, 1), days);
  const refs = useRef(new Map<number, HTMLTableCellElement>());

  const rows: (number | null)[][] = [];
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const move = (to: number) => {
    const next = Math.min(Math.max(to, 1), days);
    setFocusDay(next);
    refs.current.get(next)?.focus();
  };
  const onKey = (e: KeyboardEvent, day: number) => {
    const col = (lead + day - 1) % 7;
    const keys: Record<string, number> = {
      ArrowRight: day + 1,
      ArrowLeft: day - 1,
      ArrowDown: day + 7,
      ArrowUp: day - 7,
      Home: day - col,
      End: day + (6 - col),
    };
    const target = keys[e.key];
    if (target !== undefined) {
      e.preventDefault();
      move(target);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      props.onSelect(iso(day));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {list ? (
        <ul aria-label={props.listLabel} className="m-0 flex list-none flex-col gap-1 p-0">
          {(props.listItems ?? []).map((it, i) => (
            <li key={i} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
              <span className="font-semibold">{it.date}</span> {it.text}
            </li>
          ))}
        </ul>
      ) : (
        <table role="grid" aria-label={props.label} className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {props.dayNames.map((n, i) => (
                <th key={i} scope="col" className="px-0 py-2 text-center text-sm font-semibold">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((d, ci) =>
                  d === null ? (
                    <td key={ci} role="gridcell" aria-hidden="true" className="p-0" />
                  ) : (
                    <td
                      key={ci}
                      role="gridcell"
                      ref={(el) => {
                        if (el) refs.current.set(d, el);
                        else refs.current.delete(d);
                      }}
                      tabIndex={d === active ? 0 : -1}
                      aria-selected={selectedDay === d}
                      aria-label={(counts[iso(d)] ?? 0) > 0 ? props.countLabel(counts[iso(d)] ?? 0, iso(d)) : `${d}`}
                      onFocus={() => {
                        setFocusDay(d);
                      }}
                      onClick={() => {
                        setFocusDay(d);
                        props.onSelect(iso(d));
                      }}
                      onKeyDown={(e) => {
                        onKey(e, d);
                      }}
                      className={`h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer border border-[var(--color-border)] p-1 text-center align-middle ${focusClasses} ${selectedDay === d ? 'bg-[var(--color-accent)] font-bold text-[var(--color-on-accent)] underline' : ''}`}
                    >
                      <span>{d}</span>
                      {counts[iso(d)] ? (
                        <span
                          aria-hidden="true"
                          data-count={counts[iso(d)]}
                          className="mx-auto block w-fit rounded-full border border-current px-1 text-xs font-bold before:content-[attr(data-count)]"
                        />
                      ) : null}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <Button
          variant="secondary"
          aria-expanded={list}
          onClick={() => {
            setList((l) => !l);
          }}
        >
          {list ? props.hideListLabel : props.showListLabel}
        </Button>
      </div>
    </div>
  );
}

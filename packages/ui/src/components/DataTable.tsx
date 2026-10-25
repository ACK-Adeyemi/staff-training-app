import type { ReactNode } from 'react';

export interface DataTableColumn {
  key: string;
  header: string;
}
export interface DataTableRow {
  id: string;
  cells: Record<string, ReactNode>;
  /** A group heading row: one cell spanning every column (for example a team name). `cells` is ignored. */
  heading?: ReactNode;
}
export interface DataTableProps {
  caption: string;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  /** Make the first body cell of each row a row header. */
  rowHeader?: boolean;
  stickyFirstColumn?: boolean;
  /** Plain black on white, borders, no sticky columns when printed. */
  printFriendly?: boolean;
}

const sticky = 'sticky start-0 z-[1] bg-[var(--color-bg)]';

export function DataTable({ caption, columns, rows, rowHeader, stickyFirstColumn, printFriendly }: DataTableProps) {
  const cell = (first: boolean) =>
    ['border-b border-[var(--color-border)] px-3 py-2 text-start align-top', first && stickyFirstColumn ? sticky : '']
      .filter(Boolean)
      .join(' ');
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full border-collapse" data-print={printFriendly ? 'friendly' : undefined}>
        <caption className="pb-2 text-start font-semibold">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col" className={cell(i === 0) + ' font-semibold'}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            r.heading !== undefined ? (
              <tr key={r.id}>
                <td
                  colSpan={columns.length}
                  className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-start font-bold"
                >
                  {r.heading}
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                {columns.map((c, i) =>
                  i === 0 && rowHeader ? (
                    <th key={c.key} scope="row" className={cell(true) + ' font-semibold'}>
                      {r.cells[c.key]}
                    </th>
                  ) : (
                    <td key={c.key} className={cell(i === 0)}>
                      {r.cells[c.key]}
                    </td>
                  ),
                )}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

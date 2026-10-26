import { Button } from './Button';

export interface AgendaItem {
  id: string;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}
export interface AgendaGroup {
  heading: string;
  items: AgendaItem[];
}
export interface AgendaProps {
  groups: AgendaGroup[];
  emptyText: string;
}

export function Agenda({ groups, emptyText }: AgendaProps) {
  const shown = groups.filter((g) => g.items.length > 0);
  if (shown.length === 0) return <p className="m-0 text-[var(--color-text-muted)]">{emptyText}</p>;
  return (
    <div className="flex flex-col gap-4">
      {shown.map((g, gi) => (
        <section key={gi} className="flex flex-col gap-2">
          <h3 className="m-0 text-lg font-bold">{g.heading}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {g.items.map((it) => (
              <li
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div className="min-w-0">
                  <p className="m-0 font-semibold">{it.title}</p>
                  {it.detail ? <p className="m-0 text-sm text-[var(--color-text-muted)]">{it.detail}</p> : null}
                </div>
                {it.actionLabel && it.onAction ? (
                  <Button variant="secondary" onClick={it.onAction}>
                    {it.actionLabel}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// A filtered list of tickets: My tickets (S14, C23) and Organisation tickets (C23).
import { useId, useState } from 'react';
import type { Ticket } from '@sta/domain';
import { Badge, Button } from '@sta/ui';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { helpHref, isOpen, statusKey, useHelpSide } from './shared';

type Filter = 'open' | 'resolved' | 'all';
const FILTERS: Filter[] = ['open', 'resolved', 'all'];
const matches = (f: Filter, t: Ticket): boolean => (f === 'all' ? true : f === 'open' ? isOpen(t) : !isOpen(t));

export function TicketList({
  title,
  tickets,
  failed,
  raisers,
}: {
  title: string;
  tickets: Ticket[] | undefined;
  failed: boolean;
  /** When given, each ticket also names who raised it (user id to display name). */
  raisers?: Map<string, string>;
}) {
  const t = useT();
  const side = useHelpSide();
  const headingId = useId();
  const [filter, setFilter] = useState<Filter>('open');
  const shown = (tickets ?? [])
    .filter((x) => matches(filter, x))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (tickets === undefined && !failed) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="m-0 text-xl font-bold">
        {title}
      </h2>
      <div role="group" aria-label={t('tickets.filters.label')} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            variant="secondary"
            aria-pressed={filter === f}
            className={filter === f ? 'border-[var(--color-accent)] font-bold underline' : undefined}
            onClick={() => {
              setFilter(f);
            }}
          >
            {t(`tickets.filters.${f}`)}
          </Button>
        ))}
      </div>
      {failed ? <p role="alert">{t('help.loadError')}</p> : null}
      {tickets && shown.length === 0 ? <p className="m-0">{t('tickets.empty')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {shown.map((x) => (
          <li key={x.id}>
            <a
              href={helpHref(side, `/ticket/${x.id}`)}
              className="flex min-h-[var(--target-min)] flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            >
              <span className="font-bold">{x.number}</span> <span>{x.title}</span>{' '}
              <Badge>{t(statusKey(x.status))}</Badge>{' '}
              {raisers ? (
                <span className="text-sm">{t('tickets.raisedBy', { name: raisers.get(x.raisedBy) ?? '' })}</span>
              ) : null}{' '}
              <span className="text-sm">{formatLondonDate(x.createdAt)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

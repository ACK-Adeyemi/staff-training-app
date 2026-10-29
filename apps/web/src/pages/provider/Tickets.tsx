import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { holdsAnywhere, type Ticket } from '@sta/domain';
import type { ProviderTicketFilter } from '@sta/data';
import { PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';
import { useProviderClients } from './queries';

type View = 'needsReply' | 'breached';
const STATUSES: Ticket['status'][] = ['received', 'inProgress', 'waitingForCustomer', 'resolved', 'closed'];
const IMPACTS: Ticket['impact'][] = ['blocked', 'workaround', 'question'];
const HOUR = 3_600_000;
const hours = (ms: number) => Math.max(1, Math.round(ms / HOUR));

const btn =
  'min-h-[var(--target-min)] min-w-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-bold';

/** P11: the provider ticket inbox, with filters, built-in saved views and Assign to me. */
export function Tickets() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canRead = perms.data ? holdsAnywhere(perms.data, 'tickets.read') : false;
  const canWrite = perms.data ? holdsAnywhere(perms.data, 'tickets.write') : false;
  const [status, setStatus] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [impact, setImpact] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);

  const filter: ProviderTicketFilter = {
    ...(status ? { status: status as Ticket['status'] } : {}),
    ...(clientId ? { clientId } : {}),
    ...(assigneeId ? { assigneeId } : {}),
    ...(impact ? { impact: impact as Ticket['impact'] } : {}),
  };
  const list = useQuery({
    queryKey: ['providerTickets', actor.userId, filter],
    queryFn: () => store.providerTickets.list(actor, filter),
    enabled: canRead,
  });
  const team = useQuery({
    queryKey: ['providerTeam', actor.userId],
    queryFn: () => store.providerTeam.list(actor),
    enabled: canRead,
  });
  const clients = useProviderClients();
  const assign = useMutation({
    mutationFn: (id: string) => store.providerTickets.assign(actor, id, actor.userId),
    onSuccess: async () => {
      setError(false);
      await queryClient.invalidateQueries({ queryKey: ['providerTickets'] });
    },
    onError: () => {
      setError(true);
    },
  });

  const clientName = (id: string) => clients.data?.find((c) => c.clientId === id)?.displayName ?? id;
  const personName = (id: string) => team.data?.find((m) => m.userId === id)?.name ?? id;
  const now = Date.parse(actor.now);

  const select = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
        className={fieldClass}
      >
        <option value="">{t('provider.tickets.filters.all')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const rows = (list.data ?? []).filter((r) =>
    view === 'needsReply'
      ? (r.ticket.status === 'received' || r.ticket.status === 'inProgress') && !r.ticket.firstResponseAt
      : view === 'breached'
        ? r.breached
        : true,
  );

  return (
    <>
      <PageHeader title={t('provider.tickets.heading')} />
      {!perms.data ? (
        <p>{t('shell.loading')}</p>
      ) : !canRead ? (
        <p role="alert">{t('provider.tickets.noPermission')}</p>
      ) : (
        <>
          <section aria-label={t('provider.tickets.savedViews')} className="mb-4 flex flex-wrap gap-3">
            {(['needsReply', 'breached'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                className={`${btn} ${view === v ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]' : ''}`}
                onClick={() => {
                  setView(view === v ? null : v);
                }}
              >
                {t(`provider.tickets.views.${v}`)}
              </button>
            ))}
          </section>
          <div className="mb-4 flex flex-wrap gap-4">
            {select(
              'ticket-status',
              t('provider.tickets.filters.status'),
              status,
              setStatus,
              STATUSES.map((s) => ({ value: s, label: t(`provider.tickets.status.${s}` as MessageKey) })),
            )}
            {select(
              'ticket-client',
              t('provider.tickets.filters.client'),
              clientId,
              setClientId,
              (clients.data ?? []).map((c) => ({ value: c.clientId, label: c.displayName })),
            )}
            {select(
              'ticket-assignee',
              t('provider.tickets.filters.assignee'),
              assigneeId,
              setAssigneeId,
              (team.data ?? []).map((m) => ({ value: m.userId, label: m.name })),
            )}
            {select(
              'ticket-impact',
              t('provider.tickets.filters.impact'),
              impact,
              setImpact,
              IMPACTS.map((i) => ({ value: i, label: t(`provider.tickets.impact.${i}` as MessageKey) })),
            )}
          </div>
          {error ? <p role="alert">{t('provider.tickets.assignFailed')}</p> : null}
          {!list.data ? <p>{t('shell.loading')}</p> : null}
          {list.data && rows.length === 0 ? <p>{t('provider.tickets.empty')}</p> : null}
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {rows.map((r) => {
              const tk = r.ticket;
              let countdown: string | null = null;
              if (r.responseDueAt && !tk.firstResponseAt) {
                const diff = Date.parse(r.responseDueAt) - now;
                const n = hours(Math.abs(diff));
                countdown = r.breached
                  ? n === 1
                    ? t('provider.tickets.overdueByOne')
                    : t('provider.tickets.overdueBy', { count: n })
                  : n === 1
                    ? t('provider.tickets.dueInOne')
                    : t('provider.tickets.dueIn', { count: n });
              } else if (tk.firstResponseAt || !r.responseDueAt) {
                countdown = t('provider.tickets.responded');
              }
              return (
                <li
                  key={tk.id}
                  data-testid="ticket-row"
                  data-ticket-id={tk.id}
                  {...(r.breached ? { 'data-breached': 'true' } : {})}
                  className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <h2 className="mt-0 mb-1 text-lg font-bold">
                    <a
                      href={`#/provider/tickets/${tk.id}`}
                      className="inline-flex min-h-[var(--target-min)] items-center underline"
                    >
                      {tk.title}
                    </a>
                  </h2>
                  <p className="m-0">{clientName(tk.clientId)}</p>
                  <p className="m-0">
                    {t(`provider.tickets.status.${tk.status}` as MessageKey)}
                    {'. '}
                    {t(`provider.tickets.impact.${tk.impact}` as MessageKey)}
                  </p>
                  <p className="m-0">{tk.assigneeId ? personName(tk.assigneeId) : t('provider.tickets.unassigned')}</p>
                  {countdown ? <p className={`m-0 ${r.breached ? 'font-bold' : ''}`}>{countdown}</p> : null}
                  {canWrite && !tk.assigneeId ? (
                    <button
                      type="button"
                      className={`${btn} mt-3`}
                      disabled={assign.isPending}
                      onClick={() => {
                        assign.mutate(tk.id);
                      }}
                    >
                      {t('provider.tickets.assignToMe')}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

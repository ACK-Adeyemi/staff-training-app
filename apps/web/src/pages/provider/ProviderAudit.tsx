// P20 Audit log (M4 chunk 15b, BP-8, brief 22). Read-only list of events, newest first. Rows show who, when, the action
// and its target only: never the before/after values or the reason, which can hold personal data.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { holdsAnywhere } from '@sta/domain';
import { PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { inputClass } from '../client/foundationsErrors';
import { usePermissions } from '../client/queries';

const when = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });

export function Audit() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const perms = usePermissions();
  const canRead = perms.data ? holdsAnywhere(perms.data, 'audit.read') : false;
  const [action, setAction] = useState('');
  const [clientId, setClientId] = useState('');

  const data = useQuery({
    queryKey: ['providerAudit', actor.userId],
    enabled: canRead,
    queryFn: async () => ({
      events: await store.audit.list(actor),
      users: await store.users.list(actor).catch(() => []),
      clients: await store.clients.list(actor).catch(() => []),
    }),
  });

  if (!perms.data)
    return (
      <>
        <PageHeader title={t('provider.audit.heading')} />
        <p>{t('shell.loading')}</p>
      </>
    );
  if (!canRead)
    return (
      <>
        <PageHeader title={t('provider.audit.heading')} />
        <p role="status">{t('provider.audit.noAccess')}</p>
      </>
    );
  if (data.isError)
    return (
      <>
        <PageHeader title={t('provider.audit.heading')} />
        <p role="alert">{t('provider.loadError')}</p>
      </>
    );
  if (!data.data)
    return (
      <>
        <PageHeader title={t('provider.audit.heading')} />
        <p>{t('shell.loading')}</p>
      </>
    );

  const { events, users, clients } = data.data;
  const actions = [...new Set(events.map((e) => e.action))].sort();
  const nameOf = (id: string): string =>
    users.find((u) => u.id === id)?.displayName ?? t('provider.audit.unknownActor');
  const shown = events
    .filter((e) => (action ? e.action === action : true))
    .filter((e) => (clientId ? e.clientId === clientId : true))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <>
      <PageHeader title={t('provider.audit.heading')} />
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="p20-action" className="font-semibold">
            {t('provider.audit.action')}
          </label>
          <select
            id="p20-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
            }}
            className={inputClass}
          >
            <option value="">{t('provider.audit.allActions')}</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="p20-client" className="font-semibold">
            {t('provider.audit.client')}
          </label>
          <select
            id="p20-client"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
            }}
            className={inputClass}
          >
            <option value="">{t('provider.audit.allClients')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>
      {shown.length === 0 ? (
        <p>{t('provider.audit.empty')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {shown.map((e) => (
            <li
              key={e.id}
              data-testid="audit-row"
              data-event-id={e.id}
              className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <p className="m-0 font-semibold">{e.action}</p>
              <p className="m-0 break-words">{e.target}</p>
              <p className="m-0 text-sm">
                {t('provider.audit.actor')}: {nameOf(e.actorId)}
                {'. '}
                {t('provider.audit.when')}: <time dateTime={e.at}>{when.format(new Date(e.at))}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

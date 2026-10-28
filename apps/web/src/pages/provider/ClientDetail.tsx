import { useState } from 'react';
import { useParams } from 'react-router';
import type { MessageKey } from '@sta/content';
import { Card, PageHeader, focusClasses } from '@sta/ui';
import { useT } from '../../app/hooks';
import { ClientsReadGate } from './Gate';
import { useClientTelemetry, useLocalTelemetry, useProviderClients } from './queries';

const TABS = [
  'overview',
  'sites',
  'staff',
  'usage',
  'api',
  'errors',
  'tickets',
  'billing',
  'modules',
  'competitions',
  'audit',
  'device',
] as const;
type Tab = (typeof TABS)[number];

function Usage({ clientId }: { clientId: string }) {
  const t = useT();
  const q = useClientTelemetry(clientId);
  if (q.isError) return <p role="alert">{t('provider.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const totals = new Map<string, { count: number; users: number }>();
  for (const u of q.data.usageDaily) {
    const cur = totals.get(u.feature) ?? { count: 0, users: 0 };
    totals.set(u.feature, { count: cur.count + u.count, users: Math.max(cur.users, u.activeUsers) });
  }
  if (totals.size === 0) return <p>{t('provider.client.usageNone')}</p>;
  return (
    <ul>
      {[...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([feature, v]) => (
          <li key={feature}>{t('provider.client.usageLine', { feature, count: v.count, users: v.users })}</li>
        ))}
    </ul>
  );
}

function Errors({ clientId }: { clientId: string }) {
  const t = useT();
  const q = useClientTelemetry(clientId);
  if (q.isError) return <p role="alert">{t('provider.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  if (q.data.errorGroups.length === 0) return <p>{t('provider.client.errorsNone')}</p>;
  return (
    <ul className="list-none p-0">
      {q.data.errorGroups.map((g) => (
        <li key={g.id} className="mb-3">
          <Card>
            <p className="m-0">
              {t('provider.client.errorLine', { message: g.message, count: g.count, users: g.usersAffected })}
            </p>
            <p className="m-0">
              {t('provider.client.errorStatus', { status: t(`provider.errorStatus.${g.status}` as MessageKey) })}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ThisDevice() {
  const t = useT();
  const q = useLocalTelemetry();
  if (q.isError) return <p role="alert">{t('provider.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  return (
    <>
      <p className="mt-0">{t('provider.thisDevice.intro')}</p>
      {q.data.length === 0 ? <p>{t('provider.thisDevice.empty')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {q.data.map((e) => (
          <li key={e.id} data-testid="local-telemetry-entry">
            <Card>
              <p className="m-0 font-bold">
                {`${t(e.kind === 'error' ? 'provider.thisDevice.error' : 'provider.thisDevice.event')}: ${e.name}`}
              </p>
              {e.message ? <p className="my-1">{e.message}</p> : null}
              <p className="m-0 text-sm">{e.at}</p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

function Detail({ id }: { id: string }) {
  const t = useT();
  const clients = useProviderClients();
  const [tab, setTab] = useState<Tab>('overview');
  if (clients.isError) return <p role="alert">{t('provider.loadError')}</p>;
  if (!clients.data) return <p>{t('shell.loading')}</p>;
  const row = clients.data.find((c) => c.clientId === id);
  if (!row)
    return (
      <>
        <PageHeader title={t('provider.client.notFound')} />
        <a href="#/provider/clients" className="inline-flex min-h-[var(--target-min)] items-center underline">
          {t('provider.client.back')}
        </a>
      </>
    );
  const label = (k: Tab) => t(`provider.client.tabs.${k}` as MessageKey);
  const move = (from: number, by: number) => {
    const next = TABS[(from + by + TABS.length) % TABS.length];
    if (!next) return;
    setTab(next);
    document.getElementById(`client-tab-${next}`)?.focus();
  };
  return (
    <>
      <PageHeader title={row.displayName} />
      <div role="tablist" aria-label={t('provider.client.tabsLabel')} className="mb-4 flex flex-wrap gap-2">
        {TABS.map((k, i) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`client-tab-${k}`}
            aria-selected={tab === k}
            aria-controls="client-tabpanel"
            tabIndex={tab === k ? 0 : -1}
            onClick={() => {
              setTab(k);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(i, 1);
              else if (e.key === 'ArrowLeft') move(i, -1);
              else return;
              e.preventDefault();
            }}
            className={`min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-3 py-2 aria-selected:bg-[var(--color-surface)] aria-selected:font-bold aria-selected:underline ${focusClasses}`}
          >
            {label(k)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="client-tabpanel" aria-labelledby={`client-tab-${tab}`}>
        {tab === 'overview' ? (
          <Card>
            <p className="m-0">{t(`provider.accountState.${row.accountState}` as MessageKey)}</p>
            <p className="my-1">{t('provider.clients.sites', { count: row.siteCount })}</p>
            <p className="my-1">{t('provider.clients.people', { count: row.peopleCount })}</p>
            <p className="mb-0">
              {row.healthScore === undefined
                ? t('provider.clients.noHealth')
                : t('provider.clients.health', { score: row.healthScore })}
            </p>
          </Card>
        ) : tab === 'usage' ? (
          <Usage clientId={id} />
        ) : tab === 'errors' ? (
          <Errors clientId={id} />
        ) : tab === 'device' ? (
          <ThisDevice />
        ) : (
          <p>{t('provider.client.laterStep')}</p>
        )}
      </div>
      <p>
        <a href="#/provider/clients" className="inline-flex min-h-[var(--target-min)] items-center underline">
          {t('provider.client.back')}
        </a>
      </p>
    </>
  );
}

/** P3: one client, with tabs. Usage and errors are simulated; This device is real and local. */
export function ClientDetail() {
  const { id = '' } = useParams();
  return (
    <ClientsReadGate>
      <Detail id={id} />
    </ClientsReadGate>
  );
}

import { Card, PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { ClientsReadGate } from './Gate';
import { useProviderClients, useProviderOverview } from './queries';
import type { MessageKey } from '@sta/content';

function Body() {
  const t = useT();
  const q = useProviderOverview();
  const clients = useProviderClients();
  if (q.isError) return <p role="alert">{t('provider.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const o = q.data;
  const nameOf = (id: string) => clients.data?.find((c) => c.clientId === id)?.displayName ?? id;
  const reasonText = (r: string) =>
    r.startsWith('accountState.') ? t(`provider.accountState.${r.slice('accountState.'.length)}` as MessageKey) : r;
  const totals: [string, string, number][] = [
    ['overview-total-clients', t('provider.overview.clientsTotal'), o.clientCount],
    ['overview-total-sites', t('provider.overview.sitesTotal'), o.siteCount],
    ['overview-total-people', t('provider.overview.peopleTotal'), o.peopleCount],
  ];
  return (
    <>
      <p className="mt-0">{t('provider.overview.simulatedNote')}</p>
      <ul className="m-0 mb-4 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
        {totals.map(([id, label, n]) => (
          <li key={id}>
            <Card data-testid={id}>
              <p className="m-0 text-sm">{label}</p>
              <p className="m-0 text-3xl font-bold">{n}</p>
            </Card>
          </li>
        ))}
      </ul>
      <section aria-labelledby="by-state" className="mb-4">
        <h2 id="by-state" className="text-xl font-bold">
          {t('provider.overview.byState')}
        </h2>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {Object.entries(o.byAccountState).map(([state, n]) => (
            <li key={state} className="rounded-[var(--radius-sm)] border-2 border-[var(--color-border)] px-2 py-1">
              {`${t(`provider.accountState.${state}` as MessageKey)}: ${String(n)}`}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="attention">
        <h2 id="attention" className="text-xl font-bold">
          {t('provider.overview.attention')}
        </h2>
        {o.attention.length === 0 ? <p>{t('provider.overview.attentionNone')}</p> : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {o.attention.map((a) => (
            <li key={a.clientId} data-testid="attention-item" data-client-id={a.clientId}>
              <Card>
                <a
                  href={`#/provider/clients/${a.clientId}`}
                  className="inline-flex min-h-[var(--target-min)] items-center font-bold underline"
                >
                  {nameOf(a.clientId)}
                </a>
                <ul className="my-1">
                  {a.reasons.map((r) => (
                    <li key={r}>{reasonText(r)}</li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** P1: totals from real records, and the clients needing attention (simulated health scores). */
export function Overview() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('provider.overview.title')} />
      <ClientsReadGate>
        <Body />
      </ClientsReadGate>
    </>
  );
}

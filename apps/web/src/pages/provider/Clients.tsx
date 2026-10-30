import { useState } from 'react';
import type { MessageKey } from '@sta/content';
import { accountStateSchema, type AccountState } from '@sta/domain';
import { Card, LinkButton, PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { ClientsReadGate } from './Gate';
import { useProviderClients } from './queries';

const ALL = 'all';

function Body() {
  const t = useT();
  const q = useProviderClients();
  const [state, setState] = useState(ALL);
  if (q.isError) return <p role="alert">{t('provider.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const shown = q.data.filter((c) => state === ALL || c.accountState === state);
  return (
    <>
      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor="client-state" className="font-semibold">
          {t('provider.clients.stateFilter')}
        </label>
        <select
          id="client-state"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
          }}
          className={`${fieldClass} self-start`}
        >
          <option value={ALL}>{t('provider.clients.allStates')}</option>
          {accountStateSchema.options.map((s: AccountState) => (
            <option key={s} value={s}>
              {t(`provider.accountState.${s}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? <p>{t('provider.clients.none')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((c) => (
          <li key={c.clientId} data-testid="client-row" data-client-id={c.clientId}>
            <Card>
              <a
                href={`#/provider/clients/${c.clientId}`}
                className="inline-flex min-h-[var(--target-min)] items-center text-lg font-bold underline"
              >
                {c.displayName}
              </a>
              <p className="my-1">{t(`provider.accountState.${c.accountState}` as MessageKey)}</p>
              <p className="my-1">
                {`${t('provider.clients.sites', { count: c.siteCount })}. ${t('provider.clients.people', { count: c.peopleCount })}`}
              </p>
              <p className="mb-0">
                {c.healthScore === undefined
                  ? t('provider.clients.noHealth')
                  : t('provider.clients.health', { score: c.healthScore })}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

/** P2: every client, filtered by account state. */
export function Clients() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('provider.clients.title')} />
      <ClientsReadGate>
        <LinkButton href="#/provider/clients/new" variant="secondary" className="mb-4">
          {t('provider.clients.new')}
        </LinkButton>
        <Body />
      </ClientsReadGate>
    </>
  );
}

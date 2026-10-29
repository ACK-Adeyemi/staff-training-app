// P22 AI add-on settings (M4 chunk 16, brief 20.7). Demo AI only: guardrails, usage by client and a per-client kill
// switch (ai.manage). Nothing here calls a model or makes a network request.
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { holdsAnywhere } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { Button, PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { usePermissions } from '../client/queries';

const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';

function Region({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={box}>
      <h2 id={id} className="mt-0 mb-2 text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const GUARDRAILS = ['grounded', 'noAdvice', 'personalData', 'draft'] as const;

export function AiSettings() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canManage = perms.data ? holdsAnywhere(perms.data, 'ai.manage') : false;
  const [message, setMessage] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ['providerAi', actor.userId],
    enabled: canManage,
    queryFn: () => store.aiSettings.overview(actor),
  });

  const toggle = useMutation({
    mutationFn: (input: { clientId: string; name: string; on: boolean }) =>
      store.aiSettings.setKillSwitch(actor, input.clientId, input.on),
    onSuccess: async (_row, input) => {
      setMessage(t(input.on ? 'provider.ai.switchedOff' : 'provider.ai.switchedOn', { name: input.name }));
      await queryClient.invalidateQueries({ queryKey: ['providerAi'] });
    },
    onError: () => {
      setMessage(null);
    },
  });

  const heading = <PageHeader title={t('provider.ai.heading')} />;
  // The heading waits for the data, so the regions are there as soon as the page title is.
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (!canManage)
    return (
      <>
        {heading}
        <p role="status">{t('provider.ai.noAccess')}</p>
      </>
    );
  if (data.isError)
    return (
      <>
        {heading}
        <p role="alert">{t('provider.ai.loadError')}</p>
      </>
    );
  if (!data.data) return <p>{t('shell.loading')}</p>;

  return (
    <>
      {heading}
      <p className="mb-2 font-semibold">{t('provider.ai.demo')}</p>
      <p className="mb-6">{t('provider.ai.demoNote')}</p>
      <Region id="p22-guardrails" title={t('provider.ai.guardrails')}>
        <ul className="m-0 pl-5">
          {GUARDRAILS.map((g) => (
            <li key={g}>{t(`provider.ai.guardrail.${g}` as MessageKey)}</li>
          ))}
        </ul>
      </Region>
      <Region id="p22-usage" title={t('provider.ai.usage')}>
        <ul className="m-0 list-none p-0">
          {data.data.map((r) => (
            <li
              key={r.clientId}
              data-testid="ai-client-row"
              data-client-id={r.clientId}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] py-2 last:border-b-0"
            >
              <span className="font-semibold">{r.clientName}</span>
              <span>{t(`provider.ai.status.${r.status}` as MessageKey)}</span>
              <span>{t('provider.ai.used', { used: r.usageThisPeriod, included: r.includedUnits })}</span>
              {r.killSwitch ? <span className="font-semibold">{t('provider.ai.killSwitchOn')}</span> : null}
              <Button
                variant="secondary"
                onClick={() => {
                  setMessage(null);
                  toggle.mutate({ clientId: r.clientId, name: r.clientName, on: !r.killSwitch });
                }}
              >
                {t(r.killSwitch ? 'provider.ai.switchBackOn' : 'provider.ai.switchOff', { name: r.clientName })}
              </Button>
            </li>
          ))}
        </ul>
        {toggle.isError ? (
          <p role="alert" className="mt-2 mb-0">
            {t('provider.ai.loadError')}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="mt-2 mb-0">
            {message}
          </p>
        ) : null}
      </Region>
    </>
  );
}

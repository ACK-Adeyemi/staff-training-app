import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { holdsAnywhere } from '@sta/domain';
import type { DunningRow } from '@sta/data';
import { Button, Dialog, PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatPounds } from '../../demo/format';
import { usePermissions } from '../client/queries';

const inputClass =
  'min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]';

/** P9: accounts that are not active, with the two sensitive provider actions (extend grace, pause the timeline). */
export function ProviderDunning() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canRead = perms.data ? holdsAnywhere(perms.data, 'billing.read') : false;
  const canManage = perms.data ? holdsAnywhere(perms.data, 'billing.manageDunning') : false;
  const overview = useQuery({
    queryKey: ['dunning', actor.userId],
    queryFn: () => store.dunning.overview(actor),
    enabled: canRead,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dunning'] });
  const [target, setTarget] = useState<DunningRow | null>(null);
  const [days, setDays] = useState('7');
  const [error, setError] = useState<string | null>(null);

  const extend = useMutation({
    mutationFn: ({ clientId, n }: { clientId: string; n: number }) => store.dunning.extendGrace(actor, clientId, n),
    onSuccess: async () => {
      setTarget(null);
      setError(null);
      await refresh();
    },
    onError: () => {
      setError(t('provider.dunning.failed'));
    },
  });
  const pause = useMutation({
    mutationFn: ({ clientId, paused }: { clientId: string; paused: boolean }) =>
      store.dunning.setPaused(actor, clientId, paused),
    onSuccess: refresh,
  });

  const onConfirm = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!target) return;
    extend.mutate({ clientId: target.clientId, n: Number(days) });
  };

  const plural = (n: number, one: string, many: string, extra: Record<string, string | number> = {}) =>
    n === 1
      ? t(one as 'provider.dunning.nextStateOne', extra)
      : t(many as 'provider.dunning.nextState', { ...extra, count: n });

  const btn =
    'min-h-[var(--target-min)] min-w-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-bold';

  return (
    <>
      <PageHeader title={t('provider.dunning.heading')} />
      {!perms.data ? (
        <p>{t('shell.loading')}</p>
      ) : !canRead ? (
        <p role="alert">{t('provider.dunning.noPermission')}</p>
      ) : !overview.data ? (
        <p>{t('shell.loading')}</p>
      ) : (
        <>
          <section data-testid="dunning-summary" className="mb-4 flex flex-col gap-1">
            <p className="m-0 font-bold">
              {t('provider.dunning.outstanding', { amount: formatPounds(overview.data.outstandingPence) })}
            </p>
            <p className="m-0">
              {overview.data.recoveryRatePercent === null
                ? t('provider.dunning.noFailures')
                : t('provider.dunning.recoveryRate', { percent: overview.data.recoveryRatePercent })}
            </p>
          </section>
          {overview.data.rows.length === 0 ? <p>{t('provider.dunning.empty')}</p> : null}
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {overview.data.rows.map((r) => {
              const eligible = r.state === 'pastDue' || r.state === 'limited';
              return (
                <li
                  key={r.clientId}
                  data-testid="dunning-row"
                  data-client-id={r.clientId}
                  className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <h2 className="mt-0 mb-1 text-lg font-bold">{r.clientName}</h2>
                  <p className="m-0 font-bold">{t(`provider.accountState.${r.state}`)}</p>
                  <p className="m-0">
                    {t('provider.dunning.amount', { amount: formatPounds(r.amountOutstandingPence) })}
                  </p>
                  {r.nextState && r.daysToNextState !== undefined ? (
                    <p className="m-0">
                      {plural(r.daysToNextState, 'provider.dunning.nextStateOne', 'provider.dunning.nextState', {
                        state: t(`provider.accountState.${r.nextState.state}`),
                      })}
                    </p>
                  ) : null}
                  {r.state === 'closed' && r.daysToDeletion !== undefined ? (
                    <p className="m-0">
                      {plural(r.daysToDeletion, 'provider.dunning.deletionOne', 'provider.dunning.deletion')}
                    </p>
                  ) : null}
                  {r.paused ? <p className="m-0 font-bold">{t('provider.dunning.paused')}</p> : null}
                  {canManage && eligible ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="font-bold">{t('provider.dunning.sensitive')}</span>
                      <button
                        type="button"
                        className={btn}
                        onClick={() => {
                          setDays('7');
                          setError(null);
                          setTarget(r);
                        }}
                      >
                        {t('provider.dunning.extendGrace')}
                      </button>
                      <button
                        type="button"
                        className={btn}
                        onClick={() => {
                          pause.mutate({ clientId: r.clientId, paused: !r.paused });
                        }}
                      >
                        {r.paused ? t('provider.dunning.resume') : t('provider.dunning.pause')}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <Dialog
            open={target !== null}
            title={t('provider.dunning.dialogTitle', { client: target?.clientName ?? '' })}
            onClose={() => {
              setTarget(null);
            }}
          >
            {target ? (
              <form onSubmit={onConfirm} noValidate className="flex flex-col gap-3">
                <label htmlFor="dunning-days" className="font-semibold">
                  {t('provider.dunning.daysLabel')}
                </label>
                <input
                  id="dunning-days"
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={days}
                  onChange={(e) => {
                    setDays(e.target.value);
                  }}
                  className={inputClass}
                />
                {error ? <p role="alert">{error}</p> : null}
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={extend.isPending}>
                    {t('provider.dunning.confirm')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTarget(null);
                    }}
                  >
                    {t('provider.dunning.cancel')}
                  </Button>
                </div>
              </form>
            ) : null}
          </Dialog>
        </>
      )}
    </>
  );
}

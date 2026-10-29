import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { holdsAnywhere, type RecoveryRequest } from '@sta/domain';
import { Button, PageHeader } from '@sta/ui';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';

type Outcome = NonNullable<RecoveryRequest['outcome']>;
const OUTCOMES: { id: Outcome; key: MessageKey }[] = [
  { id: 'reset2fa', key: 'provider.recovery.outcomeReset2fa' },
  { id: 'transferOwner', key: 'provider.recovery.outcomeTransferOwner' },
];
const HOUR_MS = 3_600_000;

const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const btn =
  'min-h-[var(--target-min)] min-w-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-bold disabled:opacity-60';

/** P15: account recovery. Two different approvers, then a cooling-off period, then completion. */
export function Recovery() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canStart = perms.data ? holdsAnywhere(perms.data, 'recovery.start') : false;
  const canApprove = perms.data ? holdsAnywhere(perms.data, 'recovery.approve') : false;

  const [clientId, setClientId] = useState('');
  const [personId, setPersonId] = useState('');
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [chosen, setChosen] = useState<Record<string, Outcome | undefined>>({});
  const [error, setError] = useState(false);

  const requests = useQuery({
    queryKey: ['recovery', actor.userId],
    queryFn: () => store.recovery.list(actor),
    enabled: canStart,
  });
  const clients = useQuery({
    queryKey: ['providerClients', actor.userId],
    queryFn: () => store.providerOverview.clients(actor),
    enabled: canStart,
  });
  const people = useQuery({
    queryKey: ['recoveryPeople', actor.userId],
    queryFn: async () => {
      try {
        return (await store.users.list(actor)).filter((u) => u.side === 'client');
      } catch {
        return [];
      }
    },
    enabled: canStart,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['recovery'] });
  const failed = () => {
    setError(true);
  };
  const create = useMutation({
    mutationFn: () =>
      store.recovery.request(actor, {
        clientId,
        subjectUserId: personId,
        reason: reason.trim(),
        ...(outcome ? { outcome } : {}),
      }),
    onSuccess: async () => {
      setReason('');
      setError(false);
      await refresh();
    },
    onError: failed,
  });
  const approve = useMutation({
    mutationFn: (id: string) => store.recovery.approve(actor, id),
    onSuccess: refresh,
    onError: failed,
  });
  const complete = useMutation({
    mutationFn: ({ id, picked }: { id: string; picked: Outcome | undefined }) =>
      store.recovery.complete(actor, id, picked),
    onSuccess: refresh,
    onError: failed,
  });
  const reject = useMutation({
    mutationFn: (id: string) => store.recovery.reject(actor, id),
    onSuccess: refresh,
    onError: failed,
  });

  const onSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!clientId || !personId || !reason.trim()) {
      setError(true);
      return;
    }
    create.mutate();
  };

  if (!perms.data || (canStart && !requests.data)) return <p>{t('shell.loading')}</p>;

  const now = clock.now().getTime();
  const clientName = (id: string) => clients.data?.find((c) => c.clientId === id)?.displayName ?? '';
  const personName = (id: string) => people.data?.find((u) => u.id === id)?.displayName ?? '';
  const peopleHere = (people.data ?? []).filter((u) => u.clientId === clientId);

  const coolingText = (r: RecoveryRequest): string | null => {
    if (r.coolingOffEndsAt === undefined) return r.status === 'open' ? t('provider.recovery.coolingOffNotSet') : null;
    if (r.status !== 'approved') return null;
    const left = new Date(r.coolingOffEndsAt).getTime() - now;
    if (left <= 0) return t('provider.recovery.coolingOffEnded');
    const hours = Math.ceil(left / HOUR_MS);
    return hours === 1 ? t('provider.recovery.coolingOffOne') : t('provider.recovery.coolingOff', { hours });
  };

  return (
    <>
      <PageHeader title={t('provider.recovery.heading')} />
      {!canStart ? (
        <p role="alert">{t('provider.recovery.noAccess')}</p>
      ) : (
        <>
          <section aria-label={t('provider.recovery.checklist.heading')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.recovery.checklist.heading')}</h2>
            <ul className="m-0 pl-5">
              <li>{t('provider.recovery.checklist.callBack')}</li>
              <li>{t('provider.recovery.checklist.otherAdmin')}</li>
              <li>{t('provider.recovery.checklist.documented')}</li>
            </ul>
          </section>

          <section aria-label={t('provider.recovery.requests')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.recovery.requests')}</h2>
            {(requests.data ?? []).length === 0 ? <p>{t('provider.recovery.none')}</p> : null}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {(requests.data ?? []).map((r) => {
                const cooling = coolingText(r);
                const ended = r.coolingOffEndsAt !== undefined && now >= new Date(r.coolingOffEndsAt).getTime();
                const picked = chosen[r.id] ?? r.outcome ?? '';
                return (
                  <li
                    key={r.id}
                    data-testid="recovery-row"
                    data-request-id={r.id}
                    className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
                  >
                    <p className="m-0 font-bold">
                      {clientName(r.clientId)}
                      {' - '}
                      {personName(r.subjectUserId)}
                    </p>
                    <p className="m-0">{r.reason}</p>
                    <p className="m-0">{t('provider.recovery.approvals', { count: r.approvals.length })}</p>
                    <p className="m-0 font-semibold">{t(`provider.recovery.status.${r.status}` as MessageKey)}</p>
                    {cooling ? <p className="m-0">{cooling}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {canApprove && r.status === 'open' && !r.approvals.includes(actor.userId) ? (
                        <button
                          type="button"
                          className={btn}
                          disabled={approve.isPending}
                          onClick={() => {
                            approve.mutate(r.id);
                          }}
                        >
                          {t('provider.recovery.approve')}
                        </button>
                      ) : null}
                      {canApprove && r.status === 'approved' ? (
                        <>
                          <label className="inline-flex flex-wrap items-center gap-2 font-semibold">
                            {t('provider.recovery.outcomeLabel')}
                            <select
                              value={picked}
                              onChange={(e) => {
                                setChosen({ ...chosen, [r.id]: e.target.value as Outcome });
                              }}
                              className={fieldClass}
                            >
                              {r.outcome === undefined ? (
                                <option value="">{t('provider.recovery.outcomeNone')}</option>
                              ) : null}
                              {OUTCOMES.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {t(o.key)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className={btn}
                            disabled={!ended || complete.isPending}
                            onClick={() => {
                              complete.mutate({ id: r.id, picked: picked || undefined });
                            }}
                          >
                            {t('provider.recovery.complete')}
                          </button>
                          {!ended ? <p className="m-0">{t('provider.recovery.completeWaiting')}</p> : null}
                        </>
                      ) : null}
                      {r.status === 'open' || r.status === 'approved' ? (
                        <button
                          type="button"
                          className={btn}
                          disabled={reject.isPending}
                          onClick={() => {
                            reject.mutate(r.id);
                          }}
                        >
                          {t('provider.recovery.reject')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <form onSubmit={onSubmit} noValidate className={`${box} flex flex-col gap-3`}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.recovery.new.heading')}</h2>
            <label htmlFor="rec-client" className="font-semibold">
              {t('provider.recovery.new.client')}
            </label>
            <select
              id="rec-client"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setPersonId('');
              }}
              className={fieldClass}
            >
              <option value="">{t('provider.recovery.new.choose')}</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.clientId} value={c.clientId}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <label htmlFor="rec-person" className="font-semibold">
              {t('provider.recovery.new.person')}
            </label>
            <select
              id="rec-person"
              value={personId}
              onChange={(e) => {
                setPersonId(e.target.value);
              }}
              className={fieldClass}
            >
              <option value="">{t('provider.recovery.new.choose')}</option>
              {peopleHere.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
            <label htmlFor="rec-reason" className="font-semibold">
              {t('provider.recovery.new.reason')}
            </label>
            <input
              id="rec-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              className={fieldClass}
            />
            <label htmlFor="rec-outcome" className="font-semibold">
              {t('provider.recovery.outcomeLabel')}
            </label>
            <select
              id="rec-outcome"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value as Outcome | '');
              }}
              className={fieldClass}
            >
              <option value="">{t('provider.recovery.outcomeNone')}</option>
              {OUTCOMES.map((o) => (
                <option key={o.id} value={o.id}>
                  {t(o.key)}
                </option>
              ))}
            </select>
            {error ? <p role="alert">{t('provider.recovery.failed')}</p> : null}
            <div>
              <Button type="submit" disabled={create.isPending}>
                {t('provider.recovery.new.submit')}
              </Button>
            </div>
          </form>
        </>
      )}
    </>
  );
}

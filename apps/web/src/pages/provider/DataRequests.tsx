import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { holdsAnywhere, type DataRequest } from '@sta/domain';
import { Badge, Button, PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';

type Kind = DataRequest['kind'];
type Row = DataRequest & { dueInDays: number };
const KINDS: Kind[] = ['access', 'correction', 'erasure', 'other'];
const DUE_SOON_DAYS = 7;

const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';

function RequestRow({
  row,
  clientName,
  onChanged,
}: {
  row: Row;
  clientName?: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [mode, setMode] = useState<'done' | 'reject' | null>(null);
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  const open = row.status === 'open';

  const save = useMutation({
    mutationFn: () =>
      mode === 'done'
        ? store.dataRequests.complete(actor, row.id, { evidence: text.trim() })
        : store.dataRequests.reject(actor, row.id, { notes: text.trim() }),
    onSuccess: async () => {
      setMode(null);
      setText('');
      setFailed(false);
      await onChanged();
    },
    onError: () => {
      setFailed(true);
    },
  });

  const n = Math.abs(row.dueInDays);
  const dueWords =
    row.dueInDays < 0
      ? t('provider.dataRequests.overdue', { count: n })
      : row.dueInDays === 0
        ? t('provider.dataRequests.dueToday')
        : row.dueInDays === 1
          ? t('provider.dataRequests.dueInOne')
          : t('provider.dataRequests.dueIn', { count: n });
  const fieldId = `dr-${row.id}-text`;

  return (
    <li
      data-testid="dr-row"
      data-request-id={row.id}
      className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
    >
      <p className="m-0 font-bold">
        {t(`provider.dataRequests.kind.${row.kind}` as MessageKey)}: {row.requester}
      </p>
      {clientName ? <p className="m-0">{clientName}</p> : null}
      <p className="m-0">{t('provider.dataRequests.received', { date: row.receivedAt.slice(0, 10) })}</p>
      <p className="m-0">{t('provider.dataRequests.due', { date: row.dueAt.slice(0, 10) })}</p>
      <p className="m-0 flex flex-wrap items-center gap-2">
        <Badge>{t(`provider.dataRequests.status.${row.status}` as MessageKey)}</Badge>
        {open ? <span>{dueWords}</span> : null}
        {open && row.dueInDays <= DUE_SOON_DAYS ? (
          <Badge tone="simulated">{t('provider.dataRequests.dueSoon')}</Badge>
        ) : null}
      </p>
      {row.notes ? <p className="m-0">{row.notes}</p> : null}
      {row.status === 'done' && row.evidence ? (
        <p className="m-0">{t('provider.dataRequests.evidenceShown', { text: row.evidence })}</p>
      ) : null}
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setMode('done');
                setText('');
              }}
            >
              {t('provider.dataRequests.done')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setMode('reject');
                setText('');
              }}
            >
              {t('provider.dataRequests.reject')}
            </Button>
          </div>
          {mode ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={fieldId} className="font-semibold">
                {mode === 'done' ? t('provider.dataRequests.evidence') : t('provider.dataRequests.reason')}
              </label>
              <textarea
                id={fieldId}
                rows={2}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                }}
                className={fieldClass}
              />
              {failed ? <p role="alert">{t('provider.dataRequests.failed')}</p> : null}
              <div>
                <Button
                  type="button"
                  disabled={!text.trim() || save.isPending}
                  onClick={() => {
                    save.mutate();
                  }}
                >
                  {t('provider.dataRequests.confirm')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** P16: the data request log (the client is the controller; the provider helps). */
export function DataRequests() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const can = perms.data ? holdsAnywhere(perms.data, 'dataRequests.manage') : false;

  const [kind, setKind] = useState<Kind>('access');
  const [requester, setRequester] = useState('');
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['dataRequests', actor.userId],
    queryFn: () => store.dataRequests.list(actor),
    enabled: can,
  });
  const clients = useQuery({
    queryKey: ['providerClients', actor.userId],
    queryFn: () => store.providerOverview.clients(actor),
    enabled: can,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dataRequests'] });

  const create = useMutation({
    mutationFn: () =>
      store.dataRequests.create(actor, {
        kind,
        requester: requester.trim(),
        ...(clientId ? { clientId } : {}),
        notes: notes.trim(),
      }),
    onSuccess: async () => {
      setRequester('');
      setNotes('');
      setClientId('');
      setKind('access');
      setError(null);
      await refresh();
    },
    onError: () => {
      setError(t('provider.dataRequests.failed'));
    },
  });

  const onSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!requester.trim()) {
      setError(t('provider.dataRequests.requesterError'));
      return;
    }
    create.mutate();
  };

  if (!perms.data || (can && (!list.data || !clients.data))) return <p>{t('shell.loading')}</p>;
  const names = new Map((clients.data ?? []).map((c) => [c.clientId, c.displayName]));
  const clientNameOf = (id?: string) => (id ? names.get(id) : undefined);

  return (
    <>
      <PageHeader title={t('provider.dataRequests.heading')} />
      {!can ? (
        <p role="alert">{t('provider.dataRequests.noAccess')}</p>
      ) : (
        <>
          <p data-testid="dr-note">{t('provider.dataRequests.note')}</p>
          <section aria-label={t('provider.dataRequests.list')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.dataRequests.list')}</h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {(list.data ?? []).map((r) => (
                <RequestRow key={r.id} row={r} clientName={clientNameOf(r.clientId)} onChanged={refresh} />
              ))}
            </ul>
          </section>
          <section aria-label={t('provider.dataRequests.new')} className={box}>
            <h2 className="mt-0 text-lg font-bold">{t('provider.dataRequests.new')}</h2>
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
              <label htmlFor="dr-kind" className="font-semibold">
                {t('provider.dataRequests.newKind')}
              </label>
              <select
                id="dr-kind"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as Kind);
                }}
                className={fieldClass}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`provider.dataRequests.kind.${k}` as MessageKey)}
                  </option>
                ))}
              </select>
              <label htmlFor="dr-requester" className="font-semibold">
                {t('provider.dataRequests.newRequester')}
              </label>
              <input
                id="dr-requester"
                value={requester}
                onChange={(e) => {
                  setRequester(e.target.value);
                }}
                className={fieldClass}
              />
              <label htmlFor="dr-client" className="font-semibold">
                {t('provider.dataRequests.newClient')}
              </label>
              <select
                id="dr-client"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                }}
                className={fieldClass}
              >
                <option value="">{t('provider.dataRequests.noClient')}</option>
                {(clients.data ?? []).map((c) => (
                  <option key={c.clientId} value={c.clientId}>
                    {c.displayName}
                  </option>
                ))}
              </select>
              <label htmlFor="dr-notes" className="font-semibold">
                {t('provider.dataRequests.newNotes')}
              </label>
              <textarea
                id="dr-notes"
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
                className={fieldClass}
              />
              {error ? <p role="alert">{error}</p> : null}
              <div>
                <Button type="submit" disabled={create.isPending}>
                  {t('provider.dataRequests.submit')}
                </Button>
              </div>
            </form>
          </section>
        </>
      )}
    </>
  );
}

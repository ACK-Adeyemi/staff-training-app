import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { holdsAnywhere, type BillingChangeRequest, type ProfileChangeRequest } from '@sta/domain';
import { PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';

const box = 'mb-4 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const btn =
  'min-h-[var(--target-min)] min-w-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-bold disabled:opacity-60';

type NameAction = 'keep' | 'update' | 'ask' | 'revert';
const NAME_ACTIONS: { id: NameAction; label: MessageKey; done: MessageKey }[] = [
  { id: 'keep', label: 'provider.profileChanges.keep', done: 'provider.profileChanges.confirm.kept' },
  { id: 'update', label: 'provider.profileChanges.update', done: 'provider.profileChanges.confirm.updated' },
  { id: 'ask', label: 'provider.profileChanges.ask', done: 'provider.profileChanges.confirm.asked' },
  { id: 'revert', label: 'provider.profileChanges.revert', done: 'provider.profileChanges.confirm.reverted' },
];

function BillingRow({
  row,
  clientName,
  canEdit,
  onDone,
}: {
  row: BillingChangeRequest;
  clientName: string;
  canEdit: boolean;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'edit' | 'decline' | null>(null);
  const [name, setName] = useState(row.proposed.billingName ?? '');
  const [address, setAddress] = useState(row.proposed.address ?? '');
  const [vat, setVat] = useState(row.proposed.vatNumber ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);

  const run = useMutation({
    mutationFn: async (kind: 'approve' | 'save' | 'decline') => {
      if (kind === 'approve') await store.billingChanges.approve(actor, row.id);
      else if (kind === 'save')
        await store.billingChanges.editThenApprove(actor, row.id, {
          ...(name.trim() ? { billingName: name.trim() } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(vat.trim() ? { vatNumber: vat.trim() } : {}),
        });
      else await store.billingChanges.decline(actor, row.id, reason.trim());
      return kind;
    },
    onSuccess: async (kind) => {
      setError(false);
      setMode(null);
      onDone(
        t(
          kind === 'decline'
            ? 'provider.profileChanges.billing.confirm.declined'
            : 'provider.profileChanges.billing.confirm.approved',
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ['billingChanges'] });
    },
    onError: () => {
      setError(true);
    },
  });

  const fields: [MessageKey, string][] = [
    ['provider.profileChanges.billing.fieldName', row.proposed.billingName ?? ''],
    ['provider.profileChanges.billing.fieldAddress', row.proposed.address ?? ''],
    ['provider.profileChanges.billing.fieldVat', row.proposed.vatNumber ?? ''],
  ];
  const pending = row.status === 'pending';
  const off = !canEdit || run.isPending;

  return (
    <li className={box} data-testid="bc-row" data-request-id={row.id}>
      <h3 className="m-0 text-lg font-bold">{clientName}</h3>
      <p className="m-0 font-semibold">{t(`provider.profileChanges.billing.status.${row.status}` as MessageKey)}</p>
      <p className="m-0">
        <span className="font-semibold">{t('provider.profileChanges.billing.proposed')}</span>
      </p>
      <ul className="m-0 list-none p-0">
        {fields
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <li key={k}>
              {t(k)}: {v}
            </li>
          ))}
      </ul>
      {row.reason ? (
        <p className="m-0">
          {t('provider.profileChanges.billing.reason')}: {row.reason}
        </p>
      ) : null}
      {pending ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            disabled={off}
            onClick={() => {
              run.mutate('approve');
            }}
          >
            {t('provider.profileChanges.billing.approve')}
          </button>
          <button
            type="button"
            className={btn}
            disabled={off}
            onClick={() => {
              setMode('edit');
            }}
          >
            {t('provider.profileChanges.billing.edit')}
          </button>
          <button
            type="button"
            className={btn}
            disabled={off}
            onClick={() => {
              setMode('decline');
            }}
          >
            {t('provider.profileChanges.billing.decline')}
          </button>
        </div>
      ) : null}
      {pending && mode === 'edit' ? (
        <div className="mt-2 grid gap-2">
          {(
            [
              ['provider.profileChanges.billing.fieldName', name, setName],
              ['provider.profileChanges.billing.fieldAddress', address, setAddress],
              ['provider.profileChanges.billing.fieldVat', vat, setVat],
            ] as const
          ).map(([k, value, set]) => (
            <label key={k} className="grid gap-1 font-semibold">
              {t(k)}
              <input
                type="text"
                className={fieldClass}
                value={value}
                onChange={(e) => {
                  set(e.target.value);
                }}
              />
            </label>
          ))}
          <button
            type="button"
            className={btn}
            disabled={off}
            onClick={() => {
              run.mutate('save');
            }}
          >
            {t('provider.profileChanges.billing.save')}
          </button>
        </div>
      ) : null}
      {pending && mode === 'decline' ? (
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1 font-semibold">
            {t('provider.profileChanges.billing.declineReason')}
            <input
              type="text"
              className={fieldClass}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className={btn}
            disabled={off || !reason.trim()}
            onClick={() => {
              run.mutate('decline');
            }}
          >
            {t('provider.profileChanges.billing.confirmDecline')}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert">{t('provider.profileChanges.failed')}</p> : null}
    </li>
  );
}

/** P24: organisation name changes and billing detail requests (brief 30). */
export function ProfileChanges() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canRead = perms.data ? holdsAnywhere(perms.data, 'clients.read') : false;
  const canEdit = perms.data ? holdsAnywhere(perms.data, 'clients.editBilling') : false;
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  // The service lists only name changes still waiting. Reviewed ones stay on screen for this visit with their result.
  const [reviewed, setReviewed] = useState<Record<string, ProfileChangeRequest & { billingName: string }>>({});

  const names = useQuery({
    queryKey: ['profileChanges', actor.userId],
    queryFn: () => store.profileChanges.list(actor),
    enabled: canRead,
  });
  const billing = useQuery({
    queryKey: ['billingChanges', actor.userId],
    queryFn: () => store.billingChanges.list(actor),
    enabled: canRead,
  });
  const clients = useQuery({
    queryKey: ['providerClients', actor.userId, 'profileChanges'],
    queryFn: () => store.providerOverview.clients(actor),
    enabled: canRead,
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: NameAction }) => {
      if (action === 'keep') return store.profileChanges.keepBillingName(actor, id);
      if (action === 'update') return store.profileChanges.updateBillingName(actor, id);
      if (action === 'ask') return store.profileChanges.askClient(actor, id);
      return store.profileChanges.revertDisplayName(actor, id);
    },
    onSuccess: async (result, { id, action }) => {
      setError(false);
      const before = names.data?.find((r) => r.id === id);
      setReviewed((m) => ({
        ...m,
        [id]: { ...result, billingName: action === 'update' ? result.newName : (before?.billingName ?? '') },
      }));
      const done = NAME_ACTIONS.find((a) => a.id === action)?.done ?? 'provider.profileChanges.confirm.kept';
      setMessages((m) => ({ ...m, [id]: t(done) }));
      await queryClient.invalidateQueries({ queryKey: ['profileChanges'] });
      await queryClient.invalidateQueries({ queryKey: ['providerClients'] });
    },
    onError: () => {
      setError(true);
    },
  });

  const heading = <PageHeader title={t('provider.profileChanges.heading')} />;
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (!canRead)
    return (
      <>
        {heading}
        <p>{t('provider.profileChanges.noAccess')}</p>
      </>
    );
  if (names.isError || billing.isError)
    return (
      <>
        {heading}
        <p role="alert">{t('provider.profileChanges.loadError')}</p>
      </>
    );
  if (!names.data || !billing.data) return <p>{t('shell.loading')}</p>;

  const rows = [...names.data.filter((r) => !(r.id in reviewed)), ...Object.values(reviewed)].sort((a, b) =>
    a.id < b.id ? -1 : 1,
  );
  const clientName = (id: string) => clients.data?.find((c) => c.clientId === id)?.displayName ?? '';
  const done = (m: string) => {
    setMessages((prev) => ({ ...prev, billing: m }));
  };

  return (
    <>
      {heading}
      <section aria-labelledby="pc-names" className="mb-8">
        <h2 id="pc-names" className="mb-3 text-xl font-bold">
          {t('provider.profileChanges.names.heading')}
        </h2>
        <ul className="m-0 list-none p-0">
          {rows.map((r) => (
            <li key={r.id} className={box} data-testid="pc-row" data-request-id={r.id}>
              <h3 className="m-0 text-lg font-bold">{clientName(r.clientId)}</h3>
              <p className="m-0">
                {t('provider.profileChanges.oldName')}: {r.oldName}
              </p>
              <p className="m-0">
                {t('provider.profileChanges.newName')}: {r.newName}
              </p>
              <p className="m-0">
                {t('provider.profileChanges.billingName')}: {r.billingName}
              </p>
              <p className="m-0 font-semibold">{t(`provider.profileChanges.status.${r.status}` as MessageKey)}</p>
              {r.status === 'pendingReview' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {NAME_ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={btn}
                      disabled={!canEdit || act.isPending}
                      onClick={() => {
                        act.mutate({ id: r.id, action: a.id });
                      }}
                    >
                      {t(a.label)}
                    </button>
                  ))}
                </div>
              ) : null}
              {messages[r.id] ? <p role="status">{messages[r.id]}</p> : null}
            </li>
          ))}
        </ul>
        {error ? <p role="alert">{t('provider.profileChanges.failed')}</p> : null}
      </section>
      <section aria-labelledby="pc-billing">
        <h2 id="pc-billing" className="mb-3 text-xl font-bold">
          {t('provider.profileChanges.billing.heading')}
        </h2>
        <ul className="m-0 list-none p-0">
          {billing.data.map((r) => (
            <BillingRow key={r.id} row={r} clientName={clientName(r.clientId)} canEdit={canEdit} onDone={done} />
          ))}
        </ul>
        {messages['billing'] ? <p role="status">{messages['billing']}</p> : null}
      </section>
    </>
  );
}

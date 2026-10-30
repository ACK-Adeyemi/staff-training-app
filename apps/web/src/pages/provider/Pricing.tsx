import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { addOns } from '@sta/content';
import { RuleError, type PricingDraftInput } from '@sta/data';
import { holdsAnywhere, type PriceAdjustment } from '@sta/domain';
import { PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate, formatPounds } from '../../demo/format';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';

const box = 'mb-4 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const btn =
  'min-h-[var(--target-min)] min-w-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 py-2 font-bold focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] disabled:opacity-60';
const cell = 'border-b border-[var(--color-border)] px-2 py-1 text-left';

const GROUPS = ['draft', 'submitted', 'scheduled', 'active', 'ended'] as const;
type Group = (typeof GROUPS)[number];
const groupOf = (s: PriceAdjustment['status']): Group => (s === 'cancelled' ? 'ended' : s);

const valueText = (a: PriceAdjustment): string =>
  a.type === 'override' ? formatPounds(a.value) : `${a.value > 0 ? '+' : ''}${a.value}%`;

type Client = { clientId: string; displayName: string };

function usePricingData(enabled: boolean) {
  const store = useStore();
  const actor = useActor();
  const list = useQuery({
    queryKey: ['priceAdjustments', actor.userId],
    queryFn: () => store.pricing.list(actor),
    enabled,
  });
  const clients = useQuery({
    queryKey: ['providerClients', actor.userId, 'pricing'],
    queryFn: () => store.providerOverview.clients(actor),
    enabled,
  });
  return { list, clients };
}

function Row({
  adjustment,
  clientNames,
  canDraft,
  canConfirm,
  onDone,
}: {
  adjustment: PriceAdjustment;
  clientNames: string;
  canDraft: boolean;
  canConfirm: boolean;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const status = adjustment.status;

  const run = useMutation({
    mutationFn: async (kind: 'submit' | 'confirm' | 'cancel') => {
      if (kind === 'submit') await store.pricing.submit(actor, adjustment.id);
      else if (kind === 'cancel') await store.pricing.cancel(actor, adjustment.id);
      else await store.pricing.confirm(actor, adjustment.id, code);
      return kind;
    },
    onSuccess: async (kind) => {
      setError(null);
      setAsking(false);
      setCode('');
      onDone(
        t(`provider.pricing.done.${kind === 'submit' ? 'submitted' : kind === 'confirm' ? 'confirmed' : 'cancelled'}`),
      );
      await queryClient.invalidateQueries({ queryKey: ['priceAdjustments'] });
    },
    onError: (e) => {
      setError(
        e instanceof RuleError && e.rule === 'stepUpRequired'
          ? 'provider.pricing.stepUpRequired'
          : e instanceof RuleError && e.rule === 'wrongCode'
            ? 'provider.pricing.wrongCode'
            : 'provider.pricing.failed',
      );
    },
  });
  const off = run.isPending;

  return (
    <li className={box} data-testid="price-row" data-adjustment-id={adjustment.id}>
      <h3 className="m-0 text-lg font-bold">{clientNames}</h3>
      <p className="m-0 font-semibold">{t(`provider.pricing.status.${status}` as MessageKey)}</p>
      <p className="m-0">{valueText(adjustment)}</p>
      {adjustment.endsAt ? (
        <p className="m-0">{t('provider.pricing.endsOn', { date: formatLondonDate(adjustment.endsAt) })}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {status === 'draft' && canDraft ? (
          <button
            type="button"
            className={btn}
            disabled={off}
            onClick={() => {
              run.mutate('submit');
            }}
          >
            {t('provider.pricing.submit')}
          </button>
        ) : null}
        {status === 'submitted' && canConfirm ? (
          <button
            type="button"
            className={btn}
            disabled={off}
            onClick={() => {
              setAsking(true);
            }}
          >
            {t('provider.pricing.confirm')}
          </button>
        ) : null}
        {(status === 'draft' || status === 'submitted' || status === 'scheduled') && canDraft ? (
          <button
            type="button"
            className={btn}
            disabled={off}
            onClick={() => {
              run.mutate('cancel');
            }}
          >
            {t('provider.pricing.cancel')}
          </button>
        ) : null}
      </div>
      {status === 'submitted' && canConfirm && asking ? (
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1 font-semibold">
            {t('provider.pricing.stepUp')}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className={fieldClass}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className={btn}
            disabled={off}
            onClick={() => {
              run.mutate('confirm');
            }}
          >
            {t('provider.pricing.confirmNow')}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert">{t(error)}</p> : null}
    </li>
  );
}

function ChangeList({
  rows,
  clients,
  canDraft,
  canConfirm,
  onDone,
}: {
  rows: PriceAdjustment[];
  clients: Client[];
  canDraft: boolean;
  canConfirm: boolean;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const nameOf = (id: string) => clients.find((c) => c.clientId === id)?.displayName ?? '';
  return (
    <>
      {GROUPS.map((g) => {
        const inGroup = rows.filter((r) => groupOf(r.status) === g);
        if (inGroup.length === 0) return null;
        return (
          <section key={g} data-testid="price-group" data-status={g} aria-labelledby={`price-group-${g}`}>
            <h2 id={`price-group-${g}`} className="mb-3 text-xl font-bold">
              {t(`provider.pricing.group.${g}` as MessageKey)}
            </h2>
            <ul className="m-0 list-none p-0">
              {inGroup.map((a) => (
                <Row
                  key={a.id}
                  adjustment={a}
                  clientNames={a.clientIds.map(nameOf).join(', ')}
                  canDraft={canDraft}
                  canConfirm={canConfirm}
                  onDone={onDone}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

type Audience = 'one' | 'several' | 'all';
const TYPES = ['override', 'discount', 'increase'] as const;
const SCOPES = ['plan', 'addOn', 'invoice'] as const;
const REASONS = ['loyalty', 'retention', 'introductory', 'annualReview', 'correction', 'other'] as const;

function NewChange({ clients, onDone }: { clients: Client[]; onDone: (message: string) => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<Audience>('one');
  const [one, setOne] = useState('');
  const [several, setSeveral] = useState<string[]>([]);
  const [type, setType] = useState<(typeof TYPES)[number]>('override');
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('plan');
  const [addOnId, setAddOnId] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState<(typeof REASONS)[number]>('loyalty');
  const [notice, setNotice] = useState('30');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof store.pricing.preview>> | null>(null);

  const clientIds =
    audience === 'all'
      ? clients.map((c) => c.clientId)
      : audience === 'several'
        ? several
        : [one || clients[0]?.clientId].filter((x): x is string => !!x);
  const number = Number(value);
  const noticeDays =
    notice.trim() !== '' && Number.isInteger(Number(notice)) && Number(notice) >= 0 ? Number(notice) : null;
  const input = (): PricingDraftInput => ({
    clientIds,
    scope: scope === 'addOn' ? { kind: 'addOn', addOnId: addOnId || addOns[0]?.id || '' } : { kind: scope },
    type: type === 'override' ? 'override' : 'percent',
    value: type === 'override' ? Math.round(number * 100) : type === 'discount' ? -number : number,
    reason,
    noticeDays: noticeDays ?? 0,
    ...(endsAt ? { endsAt: `${endsAt}T00:00:00.000Z` } : {}),
  });
  const valid =
    noticeDays !== null && clientIds.length > 0 && value.trim() !== '' && Number.isFinite(number) && number >= 0;

  const previewing = useMutation({
    mutationFn: () => store.pricing.preview(actor, input()),
    onSuccess: (result) => {
      setError(false);
      setPreview(result);
    },
    onError: () => {
      setError(true);
    },
  });
  const saving = useMutation({
    mutationFn: () => store.pricing.draft(actor, input()),
    onSuccess: async () => {
      setError(false);
      setPreview(null);
      onDone(t('provider.pricing.done.saved'));
      await queryClient.invalidateQueries({ queryKey: ['priceAdjustments'] });
    },
    onError: () => {
      setError(true);
    },
  });
  const nameOf = (id: string) => clients.find((c) => c.clientId === id)?.displayName ?? '';

  return (
    <form
      className={`${box} grid gap-3`}
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="font-bold">{t('provider.pricing.clientsLegend')}</legend>
        {(['one', 'several', 'all'] as const).map((a) => (
          <label key={a} className="flex min-h-[var(--target-min)] items-center gap-2">
            <input
              type="radio"
              name="price-audience"
              checked={audience === a}
              onChange={() => {
                setAudience(a);
                setPreview(null);
              }}
            />
            {t(`provider.pricing.clients.${a}` as MessageKey)}
          </label>
        ))}
        {audience === 'one' ? (
          <label className="grid gap-1 font-semibold">
            {t('provider.pricing.client')}
            <select
              className={fieldClass}
              value={one || clients[0]?.clientId || ''}
              onChange={(e) => {
                setOne(e.target.value);
              }}
            >
              {clients.map((c) => (
                <option key={c.clientId} value={c.clientId}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {audience === 'several'
          ? clients.map((c) => (
              <label key={c.clientId} className="flex min-h-[var(--target-min)] items-center gap-2">
                <input
                  type="checkbox"
                  checked={several.includes(c.clientId)}
                  onChange={(e) => {
                    setSeveral((s) => (e.target.checked ? [...s, c.clientId] : s.filter((x) => x !== c.clientId)));
                  }}
                />
                {c.displayName}
              </label>
            ))
          : null}
      </fieldset>
      <label className="grid gap-1 font-semibold">
        {t('provider.pricing.typeLabel')}
        <select
          className={fieldClass}
          value={type}
          onChange={(e) => {
            setType(e.target.value as (typeof TYPES)[number]);
          }}
        >
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`provider.pricing.type.${x}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 font-semibold">
        {t('provider.pricing.scopeLabel')}
        <select
          className={fieldClass}
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as (typeof SCOPES)[number]);
          }}
        >
          {SCOPES.map((x) => (
            <option key={x} value={x}>
              {t(`provider.pricing.scope.${x}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      {scope === 'addOn' ? (
        <label className="grid gap-1 font-semibold">
          {t('provider.pricing.addOnLabel')}
          <select
            className={fieldClass}
            value={addOnId || addOns[0]?.id || ''}
            onChange={(e) => {
              setAddOnId(e.target.value);
            }}
          >
            {addOns.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1 font-semibold">
        {t('provider.pricing.value')}
        <input
          type="number"
          min={0}
          step="any"
          className={fieldClass}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      </label>
      <label className="grid gap-1 font-semibold">
        {t('provider.pricing.reasonLabel')}
        <select
          className={fieldClass}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value as (typeof REASONS)[number]);
          }}
        >
          {REASONS.map((x) => (
            <option key={x} value={x}>
              {t(`provider.pricing.reason.${x}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 font-semibold">
        {t('provider.pricing.noticeDays')}
        <input
          type="number"
          min={0}
          step={1}
          className={fieldClass}
          value={notice}
          aria-invalid={noticeDays === null}
          aria-describedby={noticeDays === null ? 'price-notice-days-error' : undefined}
          onChange={(e) => {
            setNotice(e.target.value);
            setPreview(null);
          }}
        />
        {noticeDays === null ? (
          <span id="price-notice-days-error" role="alert" className="font-normal">
            {t('provider.pricing.noticeInvalid')}
          </span>
        ) : null}
      </label>
      <label className="grid gap-1 font-semibold">
        {t('provider.pricing.endsAt')}
        <input
          type="date"
          className={fieldClass}
          value={endsAt}
          onChange={(e) => {
            setEndsAt(e.target.value);
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={!valid || previewing.isPending}
          onClick={() => {
            previewing.mutate();
          }}
        >
          {t('provider.pricing.preview')}
        </button>
        <button
          type="button"
          className={btn}
          disabled={!valid || saving.isPending}
          onClick={() => {
            saving.mutate();
          }}
        >
          {t('provider.pricing.saveDraft')}
        </button>
      </div>
      {error ? <p role="alert">{t('provider.pricing.failed')}</p> : null}
      {preview ? (
        <div
          data-testid="price-preview"
          className="overflow-x-auto"
          role="region"
          tabIndex={0}
          aria-label={t('provider.pricing.preview')}
        >
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {(['client', 'current', 'new', 'effective', 'effect'] as const).map((k) => (
                  <th key={k} scope="col" className={cell}>
                    {t(`provider.pricing.previewCols.${k}` as MessageKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.clientId} data-testid="preview-row" data-client-id={r.clientId}>
                  <td className={cell}>{nameOf(r.clientId)}</td>
                  <td className={cell}>{formatPounds(r.currentPrice)}</td>
                  <td className={cell}>{formatPounds(r.newPrice)}</td>
                  <td className={cell}>{formatLondonDate(r.effectiveAt)}</td>
                  <td className={cell}>
                    {r.monthlyEffect > 0 ? '+' : r.monthlyEffect < 0 ? '-' : ''}
                    {formatPounds(Math.abs(r.monthlyEffect))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.warnings.map((w) => (
            <p key={w} data-testid="preview-warning" className="font-bold">
              {t(`provider.pricing.warning.${w}` as MessageKey)}
            </p>
          ))}
        </div>
      ) : null}
    </form>
  );
}

function usePricingAccess() {
  const perms = usePermissions();
  const has = (id: string) => (perms.data ? holdsAnywhere(perms.data, id) : false);
  return {
    ready: !!perms.data,
    canRead: has('billing.read'),
    canDraft: has('billing.draftPriceChanges'),
    canConfirm: has('billing.confirmPriceChanges'),
  };
}

/** P25: price overrides, discounts and increases for every client (brief 23.11). */
export function Pricing() {
  const t = useT();
  const access = usePricingAccess();
  const { list, clients } = usePricingData(access.canRead);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const heading = <PageHeader title={t('provider.pricing.heading')} />;
  if (!access.ready) return <p>{t('shell.loading')}</p>;
  if (!access.canRead)
    return (
      <>
        {heading}
        <p>{t('provider.pricing.noAccess')}</p>
      </>
    );
  if (list.isError || clients.isError)
    return (
      <>
        {heading}
        <p role="alert">{t('provider.pricing.loadError')}</p>
      </>
    );
  if (!list.data || !clients.data) return <p>{t('shell.loading')}</p>;
  const done = (m: string) => {
    setMessage(m);
  };
  return (
    <>
      {heading}
      {access.canDraft ? (
        <p>
          <button
            type="button"
            className={btn}
            aria-expanded={open}
            onClick={() => {
              setOpen(true);
            }}
          >
            {t('provider.pricing.new')}
          </button>
        </p>
      ) : null}
      {access.canDraft && open ? (
        <NewChange
          clients={clients.data}
          onDone={(m) => {
            done(m);
            setOpen(false);
          }}
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <ChangeList
        rows={list.data}
        clients={clients.data}
        canDraft={access.canDraft}
        canConfirm={access.canConfirm}
        onDone={done}
      />
    </>
  );
}

/** The price changes that touch one client, for the P3 Billing tab. */
export function PriceChangesPanel({ clientId }: { clientId: string }) {
  const t = useT();
  const access = usePricingAccess();
  const { list, clients } = usePricingData(access.canRead);
  const [message, setMessage] = useState('');
  if (!access.canRead) return null;
  if (list.isError || clients.isError) return <p role="alert">{t('provider.pricing.loadError')}</p>;
  if (!list.data || !clients.data) return <p>{t('shell.loading')}</p>;
  const rows = list.data.filter((a) => a.clientIds.includes(clientId));
  return (
    <section data-testid="price-panel" aria-labelledby="price-panel-heading" className="mt-4">
      <h2 id="price-panel-heading" className="mb-3 text-xl font-bold">
        {t('provider.pricing.heading')}
      </h2>
      {message ? <p role="status">{message}</p> : null}
      {rows.length === 0 ? <p>{t('provider.pricing.noChanges')}</p> : null}
      <ChangeList
        rows={rows}
        clients={clients.data}
        canDraft={access.canDraft}
        canConfirm={access.canConfirm}
        onDone={setMessage}
      />
    </section>
  );
}

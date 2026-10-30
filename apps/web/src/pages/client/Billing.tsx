// C19 Plan and billing: plan, price, renewal, usage against the limits, add-on meters, invoices, payment method (brand and
// last four digits only), plan change with a step-up code, and billing details changed by request (brief 24, M3 40 to 42).
import { useState, type SyntheticEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, DescriptionList, Dialog, LinkButton, PageHeader } from '@sta/ui';
import { holdsAnywhere } from '@sta/domain';
import type { BillingOverview, PlanPreview } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate, formatPounds } from '../../demo/format';
import { foundationsErrorKey, inputClass } from './foundationsErrors';
import { useAddOns, useBillingOverview, useInvoices, usePlanOptions, usePriceNotices } from './billingQueries';
import { Section } from './billingShared';
import { PermissionGate } from './PermissionGate';
import { usePermissions } from './queries';

const focusLink =
  'focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]';

function UsageSection() {
  const t = useT();
  const overview = useBillingOverview();
  const plans = usePlanOptions();
  const addOns = useAddOns();
  const usage = overview.data?.usage;
  const limits = plans.data?.limits as unknown as Record<string, number | 'unlimited'> | undefined;
  const meters = (addOns.data ?? []).filter((a) => a.status !== 'off' && a.pricing.kind === 'usage');
  return (
    <>
      <Section id="c19-usage" title={t('billing.usage')}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {Object.entries(usage ?? {}).map(([key, used]) => {
            const limit = limits?.[key];
            if (limit === undefined) return null;
            return (
              <li key={key}>
                <span className="font-semibold">{t(`billing.limit.${key}` as MessageKey)}</span>
                {': '}
                {limit === 'unlimited' ? t('billing.unlimited') : t('billing.used', { used, limit })}
              </li>
            );
          })}
        </ul>
      </Section>
      {meters.length > 0 ? (
        <Section id="c19-meters" title={t('billing.addOnUsage')}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {meters.map((listing) => (
              <li key={listing.addOnId}>
                <span className="font-semibold">{listing.name}</span>
                {': '}
                {t('addOns.usage', { used: listing.usageThisPeriod })}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function InvoicesSection() {
  const t = useT();
  const invoices = useInvoices();
  return (
    <Section id="c19-invoices" title={t('billing.invoices')}>
      {invoices.data && invoices.data.length === 0 ? <p className="m-0">{t('billing.empty')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(invoices.data ?? []).map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3">
            <a
              href={`#/client/billing/invoices/${inv.id}/print`}
              className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
            >
              {t('billing.invoice', { number: inv.number })}
            </a>
            <span>{formatLondonDate(inv.issuedAt)}</span>
            <span>{formatPounds(inv.total)}</span>
            <Badge>{t(`billing.status.${inv.status}` as MessageKey)}</Badge>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PlanChange({ currentPackageId, renewalAt }: { currentPackageId: string; renewalAt: string }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const plans = usePlanOptions();
  const [choice, setChoice] = useState('');
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string; note?: string } | null>(null);
  const options = (plans.data?.packages ?? []).filter((p) => p.id !== currentPackageId);

  const showPreview = async () => {
    setMessage(null);
    try {
      setPreview(await store.billing.previewPlanChange(actor, choice));
    } catch (e) {
      setPreview(null);
      setMessage({ kind: 'error', text: t(foundationsErrorKey(e)) });
    }
  };
  const confirm = async (e: SyntheticEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await store.billing.changePlan(actor, choice, code);
      setMessage({
        kind: 'ok',
        text: t('billing.changed'),
        ...(preview?.applies === 'atRenewal'
          ? { note: t('billing.appliesAtRenewal', { date: formatLondonDate(renewalAt) }) }
          : {}),
      });
      setPreview(null);
      setChoice('');
      setCode('');
      await queryClient.invalidateQueries();
    } catch (err) {
      setMessage({ kind: 'error', text: t(foundationsErrorKey(err)) });
    }
  };

  return (
    <Section id="c19-change" title={t('billing.changePlan')}>
      <div className="flex flex-col gap-3">
        <label htmlFor="c19-new-plan" className="font-semibold">
          {t('billing.newPlan')}
        </label>
        <select
          id="c19-new-plan"
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setPreview(null);
            setMessage(null);
          }}
          className={inputClass}
        >
          <option value="">{t('billing.choosePlan')}</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div>
          <Button
            variant="secondary"
            disabled={choice === ''}
            onClick={() => {
              void showPreview();
            }}
          >
            {t('billing.preview')}
          </Button>
        </div>
        {preview ? (
          <div data-testid="plan-preview" className="flex flex-col gap-2">
            <p className="m-0 font-semibold">{t('billing.newPrice', { amount: formatPounds(preview.newPrice) })}</p>
            <p className="m-0">
              {preview.applies === 'now'
                ? t('billing.appliesNow')
                : t('billing.appliesAtRenewal', { date: formatLondonDate(renewalAt) })}
            </p>
            {preview.becomesReadOnly.length > 0 ? (
              <p className="m-0">
                {t('billing.readOnlyItems', {
                  items: preview.becomesReadOnly.map((r) => t(`billing.limit.${r.key}` as MessageKey)).join(', '),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
        {preview ? (
          <form
            onSubmit={(e) => {
              void confirm(e);
            }}
            className="flex flex-col gap-3"
          >
            <label htmlFor="c19-code" className="font-semibold">
              {t('billing.stepUpCode')}
            </label>
            <p id="c19-code-help" className="m-0 text-sm">
              {t('twoFactor.stepUp')}
            </p>
            <input
              id="c19-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              aria-describedby="c19-code-help"
              onChange={(e) => {
                setCode(e.target.value);
              }}
              className={inputClass}
            />
            <div>
              <Button type="submit">{t('billing.confirmChange')}</Button>
            </div>
          </form>
        ) : null}
        {message ? (
          <div role={message.kind === 'error' ? 'alert' : 'status'}>
            <p className="m-0 font-semibold">{message.text}</p>
            {message.note ? <p className="m-0">{message.note}</p> : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function DetailsSection({ canManage }: { canManage: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const overview = useBillingOverview();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = overview.data?.profile;
  const [form, setForm] = useState({ billingName: '', address: '', vatNumber: '' });

  const start = () => {
    setForm({
      billingName: profile?.billingName ?? '',
      address: profile?.address ?? '',
      vatNumber: profile?.vatNumber ?? '',
    });
    setError(null);
    setSent(false);
    setOpen(true);
  };
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    const proposed: { billingName?: string; address?: string; vatNumber?: string } = {};
    if (form.billingName.trim() !== (profile?.billingName ?? '')) proposed.billingName = form.billingName.trim();
    if (form.address.trim() !== (profile?.address ?? '')) proposed.address = form.address.trim();
    if (form.vatNumber.trim() !== (profile?.vatNumber ?? '')) proposed.vatNumber = form.vatNumber.trim();
    if (Object.keys(proposed).length === 0) {
      setError(t('billing.nothingChanged'));
      return;
    }
    try {
      await store.billing.requestDetailsChange(actor, proposed);
      setOpen(false);
      setSent(true);
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(t(foundationsErrorKey(err)));
    }
  };
  const field = (id: string, key: 'billingName' | 'address' | 'vatNumber', label: string) => (
    <>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={form[key]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [key]: e.target.value }));
        }}
        className={inputClass}
      />
    </>
  );

  return (
    <Section id="c19-details" title={t('billing.details')}>
      <DescriptionList
        items={[
          { term: t('billing.billingName'), description: profile?.billingName ?? t('billing.notSet') },
          { term: t('billing.address'), description: profile?.address || t('billing.notSet') },
          { term: t('billing.vatNumber'), description: profile?.vatNumber ?? t('billing.notSet') },
          { term: t('billing.contact'), description: overview.data?.billingContact ?? '' },
        ]}
      />
      {canManage ? (
        <div className="mt-3">
          <Button variant="secondary" onClick={start}>
            {t('billing.requestChange')}
          </Button>
        </div>
      ) : null}
      {sent ? (
        <p role="status" className="mt-3 mb-0 font-semibold">
          {t('billing.requested')}
        </p>
      ) : null}
      <Dialog
        open={open}
        title={t('billing.requestTitle')}
        onClose={() => {
          setOpen(false);
        }}
      >
        {open ? (
          <form
            onSubmit={(e) => {
              void submit(e);
            }}
            className="flex flex-col gap-3"
          >
            <p className="m-0">{t('billing.requestHelp')}</p>
            {field('c19-req-name', 'billingName', t('billing.billingName'))}
            {field('c19-req-address', 'address', t('billing.address'))}
            {field('c19-req-vat', 'vatNumber', t('billing.vatNumber'))}
            {error ? <p role="alert">{error}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit">{t('billing.sendRequest')}</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </Section>
  );
}

/** The list price, the separate discount or increase line, and what is paid (brief 23.11). */
export function AdjustedPrice({ overview: o }: { overview: BillingOverview }) {
  const t = useT();
  const a = o.adjustment;
  if (!a) return null;
  const size = String(Math.abs(a.value));
  const detail =
    a.type === 'override'
      ? t('billing.adjustment.fixed')
      : t(a.value < 0 ? 'billing.adjustment.minus' : 'billing.adjustment.plus', { size });
  const signed = `${a.amount < 0 ? '-' : '+'}${formatPounds(Math.abs(a.amount))}`;
  return (
    <div data-testid="adjusted-price">
      <p className="m-0">{t('billing.listPrice', { amount: formatPounds(o.planPrice.total) })}</p>
      <p className="m-0" data-testid="adjustment-line">
        {t(a.direction === 'discount' ? 'billing.adjustment.discount' : 'billing.adjustment.increase', {
          reason: t(`billing.adjustment.reason.${a.reason}` as MessageKey),
          detail,
          amount: signed,
        })}
      </p>
      <p className="m-0 text-xl font-bold">{t('billing.yourPrice', { amount: formatPounds(o.yourPrice) })}</p>
    </div>
  );
}

function PriceNotices() {
  const t = useT();
  const notices = usePriceNotices();
  if (!notices.data || notices.data.length === 0) return null;
  return (
    <>
      {notices.data.map((n) => {
        const amount = n.type === 'percent' ? `${String(n.value)}%` : formatPounds(n.value);
        const what =
          n.scope.kind === 'addOn'
            ? t('client.priceNotice.addOn')
            : n.scope.kind === 'invoice'
              ? t('client.priceNotice.invoice')
              : t('client.priceNotice.plan');
        const headingId = `price-notice-${n.id}`;
        return (
          <section
            key={n.id}
            data-testid="price-notice"
            aria-labelledby={headingId}
            className="mt-3 rounded-md border border-current p-3"
          >
            <h3 id={headingId} className="mt-0 mb-1 text-base font-bold">
              {t('client.priceNotice.title')}
            </h3>
            <p className="m-0">
              {t(n.type === 'percent' ? 'client.priceNotice.percent' : 'client.priceNotice.amount', {
                what,
                amount,
                date: formatLondonDate(n.effectiveAt),
              })}
            </p>
            {n.endAt ? (
              <p className="mt-1 mb-0">{t('client.priceNotice.until', { date: formatLondonDate(n.endAt) })}</p>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

function BillingBody() {
  const t = useT();
  const perms = usePermissions();
  const overview = useBillingOverview();
  const plans = usePlanOptions();
  if (overview.isError) return <p role="alert">{t(foundationsErrorKey(overview.error))}</p>;
  if (!overview.data || !perms.data) return <p>{t('shell.loading')}</p>;
  const o = overview.data;
  const canManage = holdsAnywhere(perms.data, 'billing.manage');
  const currentName = plans.data?.packages.find((p) => p.id === o.packageId)?.name;
  const pendingName = plans.data?.packages.find((p) => p.id === o.pendingPackageId)?.name;
  return (
    <>
      <PageHeader title={t('billing.title')} />
      <Section id="c19-plan" title={t('billing.plan')}>
        {currentName ? <p className="mt-0 mb-1 font-semibold">{t('billing.planName', { name: currentName })}</p> : null}
        {o.adjustment ? <AdjustedPrice overview={o} /> : null}
        {o.adjustment ? null : (
          <p className="m-0 text-xl font-bold">{t('billing.price', { amount: formatPounds(o.planPrice.total) })}</p>
        )}
        <p className="mt-1 mb-0">{t('billing.renews', { date: formatLondonDate(o.renewalAt) })}</p>
        {pendingName ? (
          <p className="mt-1 mb-0">
            {t('billing.pending', { name: pendingName, date: formatLondonDate(o.renewalAt) })}
          </p>
        ) : null}
        <PriceNotices />
        <div className="mt-3" data-testid="payment-method">
          <span className="font-semibold">{t('billing.paymentMethod')}: </span>
          {o.paymentMethod
            ? t('billing.cardEnding', { brand: o.paymentMethod.brand, last4: o.paymentMethod.last4 })
            : t('billing.notSet')}
        </div>
        {canManage && o.state !== 'active' && o.state !== 'trial' ? (
          <div className="mt-3">
            <LinkButton href="#/client/billing/pay" variant="secondary">
              {t('billing.payNow')}
            </LinkButton>
          </div>
        ) : null}
      </Section>
      <UsageSection />
      <InvoicesSection />
      {canManage && plans.data ? <PlanChange currentPackageId={o.packageId} renewalAt={o.renewalAt} /> : null}
      <DetailsSection canManage={canManage} />
    </>
  );
}

/** C19. */
export function Billing() {
  return (
    <PermissionGate permission="billing.view" message="errors.forbidden" anyScope>
      <BillingBody />
    </PermissionGate>
  );
}

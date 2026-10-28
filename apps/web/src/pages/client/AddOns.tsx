// C20 Add-ons: a card per add-on with what it does, its state and what the person may do about it (brief 24.8, M3 42, 43).
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, PageHeader } from '@sta/ui';
import { addOnCopy } from '@sta/content';
import { holdsAnywhere } from '@sta/domain';
import type { AddOnListing } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate, formatPounds } from '../../demo/format';
import { foundationsErrorKey } from './foundationsErrors';
import { useAddOnRequests, useAddOns, useBillingOverview } from './billingQueries';
import { RequestAddOnDialog, Section } from './billingShared';
import { PermissionGate } from './PermissionGate';
import { usePermissions } from './queries';

type Entry = AddOnListing;

function ConfirmDialog({
  entry,
  mode,
  renewalAt,
  onClose,
}: {
  entry: Entry | null;
  mode: 'on' | 'off';
  renewalAt: string;
  onClose: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = entry?.name ?? '';
  const pricing = entry?.pricing;
  const price = pricing
    ? pricing.kind === 'flat'
      ? t('addOns.confirmPriceFlat', { price: formatPounds(pricing.price) })
      : t('addOns.confirmPriceUsage', {
          price: formatPounds(pricing.pricePerUnit),
          unit: pricing.unit,
          included: pricing.includedUnits,
        })
    : '';
  const close = () => {
    setError(null);
    onClose();
  };
  const confirm = async () => {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'on') await store.addOns.turnOn(actor, entry.addOnId);
      else await store.addOns.turnOff(actor, entry.addOnId);
      onClose();
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(t(foundationsErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={entry !== null}
      title={t(mode === 'on' ? 'addOns.turnOnTitle' : 'addOns.turnOffTitle', { name })}
      onClose={close}
    >
      {entry ? (
        <div className="flex flex-col gap-3">
          {mode === 'on' ? (
            <>
              <p data-testid="addon-confirm-price" className="m-0">
                {price}
              </p>
              <p data-testid="addon-confirm-start" className="m-0">
                {t('addOns.confirmStart')}
              </p>
              <p data-testid="addon-confirm-proration" className="m-0">
                {t(pricing?.kind === 'flat' ? 'addOns.confirmProrationFlat' : 'addOns.confirmProrationUsage')}
              </p>
              <p data-testid="addon-confirm-invoice" className="m-0">
                {t('addOns.confirmInvoice', { date: formatLondonDate(renewalAt) })}
              </p>
            </>
          ) : (
            <p className="m-0">{t('addOns.turnOffNote', { date: formatLondonDate(renewalAt) })}</p>
          )}
          {error ? <p role="alert">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() => {
                void confirm();
              }}
            >
              {t('addOns.confirm')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function AddOnCard({
  entry,
  canTurn,
  onTurnOn,
  onTurnOff,
  onRequest,
}: {
  entry: Entry;
  canTurn: boolean;
  onTurnOn: () => void;
  onTurnOff: () => void;
  onRequest: () => void;
}) {
  const t = useT();
  const listing = entry;
  const on = listing.status !== 'off';
  const copy = addOnCopy[listing.addOnId];
  const headingId = `c20-${listing.addOnId}`;
  return (
    <section aria-labelledby={headingId} className="mb-4">
      <div className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 id={headingId} className="mt-0 mb-1 text-lg font-bold">
          {listing.name}
        </h2>
        <p className="mt-0 mb-2 font-semibold">
          {on ? t('addOns.on') : t('addOns.off')}
          {on && listing.endsAt ? ` (${t('addOns.onUntil', { date: formatLondonDate(listing.endsAt) })})` : ''}
        </p>
        {copy ? (
          <>
            <p className="m-0">{t(copy.whatKey as MessageKey)}</p>
            <p className="mt-2 mb-0">
              <span className="font-semibold">{t('addOns.forExample')}: </span>
              {t(copy.exampleKey as MessageKey)}
            </p>
          </>
        ) : null}
        {!on && !canTurn ? <p className="mt-2 mb-0">{t('addOns.locked')}</p> : null}
        <div className="mt-3">
          {canTurn && !on ? <Button onClick={onTurnOn}>{t('addOns.turnOn')}</Button> : null}
          {canTurn && on && !listing.endsAt ? (
            <Button variant="secondary" onClick={onTurnOff}>
              {t('addOns.turnOff')}
            </Button>
          ) : null}
          {!canTurn && !on ? (
            <Button variant="secondary" onClick={onRequest}>
              {t('addOns.request')}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RequestsSection({
  entries,
  requests,
}: {
  entries: Entry[];
  requests: NonNullable<ReturnType<typeof useAddOnRequests>['data']>;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const pending = requests.filter((r) => r.request.status === 'pending');
  const decide = async (id: string, decision: 'approved' | 'declined') => {
    setError(null);
    try {
      await store.addOnRequests.decide(actor, id, decision);
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(t(foundationsErrorKey(e)));
    }
  };
  return (
    <Section id="c20-requests" title={t('addOns.requests')}>
      {pending.length === 0 ? <p className="m-0">{t('addOns.noRequests')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {pending.map(({ request, firstName }) => (
          <li key={request.id} className="flex flex-col gap-2">
            <span>
              {t('addOns.requestLine', {
                person: firstName ?? t('addOns.someone'),
                addOn: entries.find((e) => e.addOnId === request.addOnId)?.name ?? '',
              })}
            </span>
            {request.note ? <span>{t('addOns.requestNote', { note: request.note })}</span> : null}
            <span className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  void decide(request.id, 'approved');
                }}
              >
                {t('addOns.approve')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  void decide(request.id, 'declined');
                }}
              >
                {t('addOns.decline')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {error ? <p role="alert">{error}</p> : null}
    </Section>
  );
}

function AddOnsBody() {
  const t = useT();
  const perms = usePermissions();
  const addOns = useAddOns();
  const overview = useBillingOverview();
  const requests = useAddOnRequests();
  const [confirming, setConfirming] = useState<{ entry: Entry; mode: 'on' | 'off' } | null>(null);
  const [requesting, setRequesting] = useState<Entry | null>(null);
  const [sent, setSent] = useState(false);
  if (addOns.isError) return <p role="alert">{t(foundationsErrorKey(addOns.error))}</p>;
  if (!addOns.data || !perms.data || !overview.data) return <p>{t('shell.loading')}</p>;
  const canTurn = holdsAnywhere(perms.data, 'billing.manageAddOns');
  return (
    <>
      <PageHeader title={t('addOns.title')} />
      <p className="mt-0">{t('addOns.intro')}</p>
      {sent ? (
        <p role="status" className="font-semibold">
          {t('addOns.requested')}
        </p>
      ) : null}
      {canTurn && requests.data ? <RequestsSection entries={addOns.data} requests={requests.data} /> : null}
      {addOns.data.map((entry) => (
        <AddOnCard
          key={entry.addOnId}
          entry={entry}
          canTurn={canTurn}
          onTurnOn={() => {
            setConfirming({ entry, mode: 'on' });
          }}
          onTurnOff={() => {
            setConfirming({ entry, mode: 'off' });
          }}
          onRequest={() => {
            setSent(false);
            setRequesting(entry);
          }}
        />
      ))}
      <ConfirmDialog
        entry={confirming?.entry ?? null}
        mode={confirming?.mode ?? 'on'}
        renewalAt={overview.data.renewalAt}
        onClose={() => {
          setConfirming(null);
        }}
      />
      <RequestAddOnDialog
        open={requesting !== null}
        addOnId={requesting?.addOnId ?? ''}
        addOnName={requesting?.name ?? ''}
        onClose={() => {
          setRequesting(null);
        }}
        onSent={() => {
          setSent(true);
        }}
      />
    </>
  );
}

/** C20. */
export function AddOns() {
  return (
    <PermissionGate permission="billing.view" message="errors.forbidden" anyScope>
      <AddOnsBody />
    </PermissionGate>
  );
}

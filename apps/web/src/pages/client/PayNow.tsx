// Mock pay page (brief 24.3 "pays at any point"): a fixed demo card and a Pay now button. Nothing is typed in and no
// card number is stored. Paying returns the account to Active at once.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, PageHeader } from '@sta/ui';
import { RuleError } from '@sta/data';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatPounds } from '../../demo/format';
import { foundationsErrorKey } from './foundationsErrors';
import { useAccountStatus } from './foundationsQueries';
import { PermissionGate } from './PermissionGate';

function PayBody() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const status = useAccountStatus();
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const paid = result?.kind === 'ok';
  const pay = async () => {
    setBusy(true);
    setResult(null);
    try {
      await store.billing.payNow(actor);
      setResult({ kind: 'ok', text: t('billing.paid') });
      await queryClient.invalidateQueries();
    } catch (e) {
      const nothing = e instanceof RuleError && e.rule === 'notApplicable';
      setResult({ kind: 'error', text: t(nothing ? 'billing.nothingToPay' : foundationsErrorKey(e)) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title={t('billing.payTitle')} />
      <p className="mt-0">{t('billing.payIntro')}</p>
      <Card className="mb-4 flex max-w-md flex-col gap-3">
        <p className="m-0 font-semibold">{t('billing.demoNote')}</p>
        {status.data?.amountDuePence ? (
          <p className="m-0 text-xl font-bold">
            {t('billing.amountDue', { amount: formatPounds(status.data.amountDuePence) })}
          </p>
        ) : null}
        <p className="m-0">{t('billing.fakeCard')}</p>
        <div>
          <Button
            disabled={busy || paid}
            onClick={() => {
              void pay();
            }}
          >
            {t('billing.payNow')}
          </Button>
        </div>
      </Card>
      {result ? (
        <p role={result.kind === 'ok' ? 'status' : 'alert'} className="font-semibold">
          {result.text}
        </p>
      ) : null}
      {paid ? (
        <a
          href="#/client/billing"
          className="inline-flex min-h-[var(--target-min)] items-center underline focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          {t('billing.backToBilling')}
        </a>
      ) : null}
    </>
  );
}

/** Needs billing.manage. */
export function PayNow() {
  return (
    <PermissionGate permission="billing.manage" message="errors.forbidden" anyScope>
      <PayBody />
    </PermissionGate>
  );
}

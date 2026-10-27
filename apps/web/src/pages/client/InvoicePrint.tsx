// Invoice print view: the invoice as issued, outside the client chrome so it prints cleanly (M3 assumption 40).
import { useParams } from 'react-router';
import { Button } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useT } from '../../app/hooks';
import { formatLondonDate, formatPounds } from '../../demo/format';
import { foundationsErrorKey } from './foundationsErrors';
import { useInvoice } from './billingQueries';
import { PermissionGate } from './PermissionGate';

function InvoiceBody({ id }: { id: string }) {
  const t = useT();
  const q = useInvoice(id);
  if (q.isError) return <p role="alert">{t(foundationsErrorKey(q.error))}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const inv = q.data;
  const cell = 'border-b-2 border-[var(--color-border)] py-2 text-start';
  return (
    <>
      <h1 className="mt-0 text-2xl font-bold">{t('billing.invoice', { number: inv.number })}</h1>
      <p className="m-0 font-semibold">{inv.billingNameAtIssue}</p>
      <p className="mt-0 whitespace-pre-line">{inv.billingAddressAtIssue}</p>
      <p className="m-0">{t('billing.issued', { date: formatLondonDate(inv.issuedAt) })}</p>
      <p className="mt-0">{t('billing.dueOn', { date: formatLondonDate(inv.dueAt) })}</p>
      <p className="font-semibold">{t(`billing.status.${inv.status}` as MessageKey)}</p>
      <table className="my-4 w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={cell}>
              {t('billing.line')}
            </th>
            <th scope="col" className={`${cell} text-end`}>
              {t('billing.amount')}
            </th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((line, i) => (
            <tr key={i}>
              <td className={cell}>{line.label}</td>
              <td className={`${cell} text-end`}>{formatPounds(line.amount)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className={cell}>
              {t('billing.tax')}
            </th>
            <td className={`${cell} text-end`}>{formatPounds(inv.tax)}</td>
          </tr>
          <tr>
            <th scope="row" className={`${cell} font-bold`}>
              {t('billing.total')}
            </th>
            <td className={`${cell} text-end font-bold`}>{formatPounds(inv.total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button
          onClick={() => {
            window.print();
          }}
        >
          {t('billing.print')}
        </Button>
        <a
          href="#/client/billing"
          className="inline-flex min-h-[var(--target-min)] items-center underline focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          {t('billing.backToBilling')}
        </a>
      </div>
    </>
  );
}

/** Outside the client shell. Needs billing.view. */
export function InvoicePrint() {
  const { invoiceId } = useParams();
  return (
    <main className="mx-auto max-w-2xl p-4">
      <PermissionGate permission="billing.view" message="errors.forbidden" anyScope>
        <InvoiceBody id={invoiceId ?? ''} />
      </PermissionGate>
    </main>
  );
}

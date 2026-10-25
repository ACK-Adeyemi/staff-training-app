import { PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { focusLink } from '../staff/styles';
import { PermissionGate } from './PermissionGate';

/** C15: the reports a client admin can open. */
export function Reports() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('nav.client.reports')} />
      <PermissionGate permission="reports.view" message="client.reports.noPermission">
        <p className="mt-0">{t('client.reports.indexIntro')}</p>
        <ul className="m-0 list-none p-0">
          <li>
            <a
              href="#/client/reports/matrix"
              className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
            >
              {t('client.reports.matrixLink')}
            </a>
            <p className="m-0">{t('client.reports.matrixLinkHint')}</p>
          </li>
        </ul>
      </PermissionGate>
    </>
  );
}

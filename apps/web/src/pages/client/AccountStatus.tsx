// C21 Account status: where the account is, what works now and what happens next (brief 24.3, 24.4).
import { useNavigate } from 'react-router';
import { Button, Card, Icon, PageHeader } from '@sta/ui';
import { can, type AccountState } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useT } from '../../app/hooks';
import { formatLondonDate, formatPounds } from '../../demo/format';
import { useAccountStatus } from './foundationsQueries';
import { focusLink } from '../staff/styles';
import { usePermissions } from './queries';

const STEPS: AccountState[] = ['active', 'pastDue', 'limited', 'readOnly', 'closed'];

/** The five usual states, plus the current one when it is a different state (a trial or a pause). */
function timelineFor(state: AccountState): AccountState[] {
  if (STEPS.includes(state)) return STEPS;
  if (state === 'trial') return ['trial', ...STEPS];
  if (state === 'paused') return ['active', 'pastDue', 'limited', 'readOnly', 'paused', 'closed'];
  return STEPS;
}

export function AccountStatus() {
  const t = useT();
  const actor = useActor();
  const navigate = useNavigate();
  const status = useAccountStatus();
  const perms = usePermissions();
  if (status.isError) return <p role="alert">{t('account.loadError')}</p>;
  if (!status.data || !perms.data) return <p>{t('shell.loading')}</p>;
  const s = status.data;
  const target = { clientId: actor.clientId ?? '' };
  const canFix = can(perms.data, 'billing.manage', target);
  const needsFixing = s.state !== 'active' && s.state !== 'trial';
  const stateName = (state: AccountState) => t(`account.state.${state}` as MessageKey);

  return (
    <>
      <PageHeader title={t('account.statusTitle')} />
      <p className="mt-0">{t('account.statusIntro')}</p>
      <section aria-labelledby="c21-timeline" className="mb-4">
        <Card>
          <h2 id="c21-timeline" className="mt-0 mb-3 text-lg font-bold">
            {t('account.timeline')}
          </h2>
          <ol data-testid="account-timeline" className="m-0 flex list-none flex-col gap-2 p-0">
            {timelineFor(s.state).map((state) => {
              const isCurrent = state === s.state;
              return (
                <li
                  key={state}
                  {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
                  className={`flex min-h-[var(--target-min)] flex-wrap items-center gap-2 rounded-[var(--radius-md)] border-2 px-3 py-1 ${isCurrent ? 'border-[var(--color-accent)] font-bold' : 'border-[var(--color-border)]'}`}
                >
                  <Icon name={isCurrent ? 'check' : 'minus-circle'} size={18} />
                  <span>{stateName(state)}</span>
                  <span className="font-normal">{t(`account.days.${state}` as MessageKey)}</span>
                  {isCurrent ? <span>{t('account.current')}</span> : null}
                </li>
              );
            })}
          </ol>
        </Card>
      </section>

      <section aria-labelledby="c21-next" className="mb-4">
        <Card>
          <h2 id="c21-next" className="mt-0 mb-3 text-lg font-bold">
            {t('account.since', { date: formatLondonDate(s.since) })}
          </h2>
          <p className="m-0">
            {s.nextChange
              ? t('account.nextChange', {
                  change: stateName(s.nextChange.state),
                  date: formatLondonDate(s.nextChange.at),
                })
              : t('account.noChange')}
          </p>
          {s.amountDuePence ? (
            <p className="mt-2 mb-0 font-semibold">
              {t('account.amountDue', { amount: formatPounds(s.amountDuePence) })}
            </p>
          ) : null}
          {needsFixing && canFix ? (
            <div className="mt-3">
              <Button
                onClick={() => {
                  void navigate('/client/billing/pay');
                }}
              >
                {t('account.fixNow')}
              </Button>
            </div>
          ) : null}
          {needsFixing && !canFix ? <p className="mt-2 mb-0">{t('account.askBilling')}</p> : null}
        </Card>
      </section>

      <section aria-labelledby="c21-works" className="mb-4">
        <Card>
          <h2 id="c21-works" className="mt-0 mb-3 text-lg font-bold">
            {t('account.whatWorks')}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {s.whatWorks.map((entry) => (
              <li key={entry.feature}>
                <span className="font-semibold">{t(`account.works.${entry.feature}.label` as MessageKey)}</span>
                {': '}
                {t(entry.key as MessageKey)}
              </li>
            ))}
          </ul>
          <p className="mt-3 mb-0">{t('account.exportsNote')}</p>
        </Card>
      </section>
      <p>
        <a href="#/client/data" className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}>
          {t('dataPage.linkFrom')}
        </a>
      </p>
    </>
  );
}

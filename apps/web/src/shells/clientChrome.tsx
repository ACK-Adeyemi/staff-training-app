// Client shell pieces (M3 chunk 13): the two-step banner, the account banner and the site switcher.
import { useLocation, useNavigate } from 'react-router';
import { Banner, SiteSwitcher, type BannerTone } from '@sta/ui';
import { accountBanner, type AccountBanner } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useClock, useT } from '../app/hooks';
import { formatLondonDate, formatPounds } from '../demo/format';
import { focusLink } from '../pages/staff/styles';
import { usePermissions } from '../pages/client/queries';
import { useAccountStatus, useSites } from '../pages/client/foundationsQueries';

export function TwoFactorBanner({ daysLeft }: { daysLeft: number }) {
  const t = useT();
  return (
    <div data-testid="two-factor-banner">
      <Banner tone="info">
        <a
          href="#/client/signin?setup=1"
          className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
        >
          {daysLeft === 1 ? t('twoFactor.daysLeftOne') : t('twoFactor.daysLeft', { days: daysLeft })}
        </a>
      </Banner>
    </div>
  );
}

const tones: Record<AccountBanner['kind'], BannerTone> = {
  trial: 'info',
  pastDue: 'warning',
  limited: 'warning',
  readOnly: 'danger',
  paused: 'danger',
  closed: 'danger',
};

/** One banner for the account state, with the next change, the amount and what to do (brief 24.3). */
export function AccountBannerView() {
  const t = useT();
  const clock = useClock();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const status = useAccountStatus();
  const perms = usePermissions();
  // The account status page already says all of this in full.
  if (pathname === '/client/account-status' || !status.data || !perms.data) return null;
  const s = status.data;
  const banner = accountBanner({
    state: s.state,
    stateSince: s.since,
    nextChange: s.nextChange ? { state: s.nextChange.state, at: new Date(s.nextChange.at) } : null,
    perms: perms.data,
    now: clock.now(),
  });
  if (!banner) return null;
  const pay = banner.fixNow === 'payNow';
  const next = banner.nextChange;
  return (
    <div data-testid="account-banner">
      <Banner
        tone={tones[banner.kind]}
        {...(pay && banner.kind !== 'trial'
          ? {
              action: {
                label: t('account.fixNow'),
                onClick: () => {
                  void navigate('/client/billing/pay');
                },
              },
            }
          : {})}
      >
        <p className="m-0">{t(`account.banner.${banner.kind}` as MessageKey)}</p>
        {banner.daysLeft !== undefined ? (
          <p className="m-0">{t('account.trialDays', { days: banner.daysLeft })}</p>
        ) : null}
        {next ? (
          <p className="m-0">
            {t('account.changesOn', {
              change: t(`account.state.${next.state}` as MessageKey),
              date: formatLondonDate(next.at.toISOString()),
            })}
          </p>
        ) : null}
        {banner.showAmounts && s.amountDuePence ? (
          <p className="m-0">{t('account.amountDue', { amount: formatPounds(s.amountDuePence) })}</p>
        ) : null}
        {!pay && banner.kind !== 'trial' ? <p className="m-0">{t('account.askBilling')}</p> : null}
      </Banner>
    </div>
  );
}

/** Shown only to someone who can see more than one site. */
export function SiteSwitch({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const t = useT();
  const sites = useSites();
  if (!sites.data || sites.data.length < 2) return null;
  const options = [{ id: 'all', name: t('sites.all') }, ...sites.data.map((s) => ({ id: s.id, name: s.name }))];
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SiteSwitcher label={t('sites.switcher')} sites={options} value={current?.id ?? 'all'} onChange={onChange} />
      <p className="m-0 pb-2">{t('sites.current', { name: current?.name ?? '' })}</p>
    </div>
  );
}

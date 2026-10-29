import { useState } from 'react';
import { Navigate } from 'react-router';
import type { NavItem } from '@sta/ui';
import type { TwoFactorStatus } from '@sta/domain';
import { holdsAnywhere } from '@sta/domain';
import { useT } from '../app/hooks';
import { SetSiteScopeContext, SiteScopeContext } from '../app/siteScope';
import { useTwoFactorStatus } from '../pages/client/foundationsQueries';
import { useClientData, usePermissions } from '../pages/client/queries';
import { AccountBannerView, SiteSwitch, TwoFactorBanner } from './clientChrome';
import { ProviderStatus } from './providerChrome';
import { Shell } from './Shell';

const item = (path: string, label: string, icon: NavItem['icon']): NavItem => ({
  id: path,
  label,
  href: `#${path}`,
  icon,
});

export function StaffShell() {
  const t = useT();
  return (
    <Shell
      config={{
        side: 'staff',
        bar: [
          item('/staff', t('nav.staff.home'), 'home'),
          item('/staff/learn', t('nav.staff.learn'), 'book'),
          item('/staff/progress', t('nav.staff.progress'), 'chart'),
          item('/staff/compete', t('nav.staff.compete'), 'trophy'),
          item('/staff/me', t('nav.staff.me'), 'user'),
        ],
        more: [],
        headerLinks: [
          item('/staff/notifications', t('shell.notifications'), 'bell'),
          item('/staff/help', t('shell.help'), 'help'),
        ],
      }}
    />
  );
}

/** Gate: an admin who has not set up two-step sign-in in time can only reach the sign-in screen (brief 22.6). */
export function ClientShell() {
  const t = useT();
  const twoFactor = useTwoFactorStatus();
  if (twoFactor.isError)
    return (
      <p role="alert" className="p-4">
        {t('twoFactor.loadError')}
      </p>
    );
  if (!twoFactor.data) return <p className="p-4">{t('shell.loading')}</p>;
  if (twoFactor.data.kind === 'limited') return <Navigate to="/client/signin?setup=1" replace />;
  return <ClientFrame twoFactor={twoFactor.data} />;
}

function ClientFrame({ twoFactor }: { twoFactor: TwoFactorStatus }) {
  const t = useT();
  const [site, setSite] = useState('all');
  // Load the organisation data once, up front, so every client screen opens with its content rather than a spinner.
  const data = useClientData();
  const perms = usePermissions();
  if (data.isPending) return <p className="p-4">{t('shell.loading')}</p>;
  return (
    <SiteScopeContext value={site}>
      <SetSiteScopeContext value={setSite}>
        <Shell
          config={{
            side: 'client',
            bar: [
              item('/client', t('nav.client.dashboard'), 'home'),
              item('/client/people', t('nav.client.people'), 'user'),
              item('/client/modules', t('nav.client.training'), 'book'),
              item('/client/competitions', t('nav.client.engage'), 'trophy'),
            ],
            more: [
              ...(perms.data && holdsAnywhere(perms.data, 'assign.view')
                ? [item('/client/calendar', t('calendar.title'), 'clock')]
                : []),
              item('/client/organise', t('organise.title'), 'book'),
              item('/client/reports', t('nav.client.reports'), 'chart'),
              ...(perms.data && holdsAnywhere(perms.data, 'reports.view')
                ? [item('/client/stats', t('stats.title'), 'chart')]
                : []),
              ...(perms.data && holdsAnywhere(perms.data, 'moduleFeedback.view')
                ? [item('/client/module-feedback', t('feedback.inbox.title'), 'help')]
                : []),
              ...(perms.data && holdsAnywhere(perms.data, 'evidence.view')
                ? [item('/client/evidence', t('evidenceFlow.queueTitle'), 'check')]
                : []),
              ...(perms.data && holdsAnywhere(perms.data, 'assign.manage')
                ? [item('/client/rules', t('rules.title'), 'check')]
                : []),
              ...(perms.data && holdsAnywhere(perms.data, 'reminders.view')
                ? [item('/client/reminders', t('reminders.title'), 'bell')]
                : []),
              ...(perms.data && holdsAnywhere(perms.data, 'themes.view')
                ? [item('/client/themes', t('themes.title'), 'more')]
                : []),
              item('/client/team', t('team.title'), 'user'),
              item('/client/settings', t('nav.client.settings'), 'more'),
              ...(perms.data && holdsAnywhere(perms.data, 'settings.view')
                ? [item('/client/data', t('dataPage.title'), 'more')]
                : []),
              ...(perms.data && holdsAnywhere(perms.data, 'billing.view')
                ? [
                    item('/client/billing', t('nav.client.billing'), 'chart'),
                    item('/client/billing/add-ons', t('addOns.title'), 'more'),
                  ]
                : []),
              item('/client/account-status', t('account.statusTitle'), 'clock'),
              item('/client/onboarding', t('onboarding.title'), 'check'),
              item('/client/help', t('nav.client.help'), 'help'),
            ],
            headerLinks: [],
            headerExtra: <SiteSwitch value={site} onChange={setSite} />,
            top: (
              <>
                {twoFactor.kind === 'grace' ? <TwoFactorBanner daysLeft={twoFactor.daysLeft} /> : null}
                <AccountBannerView />
              </>
            ),
          }}
        />
      </SetSiteScopeContext>
    </SiteScopeContext>
  );
}

export function ProviderShell() {
  const t = useT();
  return (
    <Shell
      config={{
        side: 'provider',
        bar: [
          item('/provider', t('nav.provider.overview'), 'home'),
          item('/provider/clients', t('nav.provider.clients'), 'user'),
          item('/provider/content', t('nav.provider.content'), 'book'),
          item('/provider/packages', t('nav.provider.commercial'), 'chart'),
        ],
        more: [
          item('/provider/tickets', t('nav.provider.support'), 'help'),
          item('/provider/comms', t('nav.provider.comms'), 'bell'),
          item('/provider/recovery', t('nav.provider.recovery'), 'user'),
          item('/provider/team', t('nav.provider.teamSecurity'), 'user'),
        ],
        headerLinks: [item('/provider/comms', t('provider.shell.notifications'), 'bell')],
        headerExtra: <ProviderStatus />,
      }}
    />
  );
}

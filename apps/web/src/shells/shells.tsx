import type { NavItem } from '@sta/ui';
import { useT } from '../app/hooks';
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

export function ClientShell() {
  const t = useT();
  return (
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
          item('/client/reports', t('nav.client.reports'), 'chart'),
          item('/client/settings', t('nav.client.settings'), 'more'),
          item('/client/help', t('nav.client.help'), 'help'),
        ],
        headerLinks: [],
      }}
    />
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
          item('/provider/team', t('nav.provider.teamSecurity'), 'user'),
        ],
        headerLinks: [],
      }}
    />
  );
}

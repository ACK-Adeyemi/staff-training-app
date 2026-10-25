import type { RouteObject } from 'react-router';
import type { MessageKey } from '@sta/content';
import { Landing, NotFound, Outbox, Placeholder } from '../pages/pages';
import { RouteError } from './RouteError';

const page = (path: string, title: MessageKey, body: MessageKey): RouteObject => ({
  path,
  element: <Placeholder titleKey={title} bodyKey={body} />,
});

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/demo/outbox', element: <Outbox /> },
      {
        path: '/staff',
        lazy: async () => ({ Component: (await import('../shells/shells')).StaffShell }),
        children: [
          { index: true, element: <Placeholder titleKey="nav.staff.home" bodyKey="placeholder.staff.home" /> },
          page('learn', 'nav.staff.learn', 'placeholder.staff.learn'),
          page('progress', 'nav.staff.progress', 'placeholder.staff.progress'),
          page('compete', 'nav.staff.compete', 'placeholder.staff.compete'),
          page('me', 'nav.staff.me', 'placeholder.staff.me'),
          page('notifications', 'shell.notifications', 'placeholder.staff.notifications'),
          page('help', 'shell.help', 'placeholder.staff.help'),
        ],
      },
      {
        path: '/client',
        lazy: async () => ({ Component: (await import('../shells/shells')).ClientShell }),
        children: [
          {
            index: true,
            element: <Placeholder titleKey="nav.client.dashboard" bodyKey="placeholder.client.dashboard" />,
          },
          page('people', 'nav.client.people', 'placeholder.client.people'),
          page('modules', 'nav.client.training', 'placeholder.client.training'),
          page('competitions', 'nav.client.engage', 'placeholder.client.engage'),
          page('reports', 'nav.client.reports', 'placeholder.client.reports'),
          page('settings', 'nav.client.settings', 'placeholder.client.settings'),
          page('help', 'nav.client.help', 'placeholder.client.help'),
        ],
      },
      {
        path: '/provider',
        lazy: async () => ({ Component: (await import('../shells/shells')).ProviderShell }),
        children: [
          {
            index: true,
            element: <Placeholder titleKey="nav.provider.overview" bodyKey="placeholder.provider.overview" />,
          },
          page('clients', 'nav.provider.clients', 'placeholder.provider.clients'),
          page('content', 'nav.provider.content', 'placeholder.provider.content'),
          page('packages', 'nav.provider.commercial', 'placeholder.provider.commercial'),
          page('tickets', 'nav.provider.support', 'placeholder.provider.support'),
          page('comms', 'nav.provider.comms', 'placeholder.provider.comms'),
          page('team', 'nav.provider.teamSecurity', 'placeholder.provider.teamSecurity'),
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];

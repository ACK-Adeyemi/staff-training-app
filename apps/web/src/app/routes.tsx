import type { RouteObject } from 'react-router';
import type { MessageKey } from '@sta/content';
import { NotFound, Placeholder } from '../pages/pages';
import { Landing } from '../demo/pages/Landing';
import { Outbox } from '../demo/pages/Outbox';
import { RootLayout } from '../demo/RootLayout';
import { Home } from '../pages/staff/Home';
import { Learn } from '../pages/staff/Learn';
import { Notifications } from '../pages/staff/Notifications';
import { Progress } from '../pages/staff/Progress';
import { SignIn } from '../pages/staff/SignIn';
import { RouteError } from './RouteError';

const page = (path: string, title: MessageKey, body: MessageKey): RouteObject => ({
  path,
  element: <Placeholder titleKey={title} bodyKey={body} />,
});

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/demo/outbox', element: <Outbox /> },
      { path: '/staff/signin', element: <SignIn /> },
      {
        path: '/staff',
        lazy: async () => ({ Component: (await import('../shells/shells')).StaffShell }),
        children: [
          { index: true, element: <Home /> },
          { path: 'learn', element: <Learn /> },
          { path: 'progress', element: <Progress /> },
          page('compete', 'nav.staff.compete', 'placeholder.staff.compete'),
          page('me', 'nav.staff.me', 'placeholder.staff.me'),
          { path: 'notifications', element: <Notifications /> },
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

import type { RouteObject } from 'react-router';
import type { MessageKey } from '@sta/content';
import { NotFound, Placeholder } from '../pages/pages';
import { Landing } from '../demo/pages/Landing';
import { Outbox } from '../demo/pages/Outbox';
import { RootLayout } from '../demo/RootLayout';
import { OrgDoc } from '../pages/doc/OrgDoc';
import { Assign } from '../pages/client/Assign';
import { Dashboard } from '../pages/client/Dashboard';
import { Matrix } from '../pages/client/Matrix';
import { ModuleStats } from '../pages/client/ModuleStats';
import { Reports } from '../pages/client/Reports';
import { People } from '../pages/client/People';
import { PersonRecord } from '../pages/client/Person';
import { Certificate } from '../pages/staff/Certificate';
import { Home } from '../pages/staff/Home';
import { LessonPlayer } from '../pages/staff/LessonPlayer';
import { ModuleOverview } from '../pages/staff/ModuleOverview';
import { Quiz } from '../pages/staff/Quiz';
import { Results } from '../pages/staff/Results';
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
      // Outside the staff chrome: a certificate prints cleanly and an organisation document opens in its own tab.
      { path: '/staff/module/:moduleId/certificate', element: <Certificate /> },
      { path: '/doc/:attachmentId', element: <OrgDoc /> },
      {
        path: '/staff',
        lazy: async () => ({ Component: (await import('../shells/shells')).StaffShell }),
        children: [
          { index: true, element: <Home /> },
          { path: 'learn', element: <Learn /> },
          { path: 'module/:moduleId', element: <ModuleOverview /> },
          { path: 'module/:moduleId/lesson/:lessonId', element: <LessonPlayer /> },
          { path: 'module/:moduleId/quiz', element: <Quiz /> },
          { path: 'module/:moduleId/done', element: <Results /> },
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
          { index: true, element: <Dashboard /> },
          { path: 'people', element: <People /> },
          { path: 'people/:personId', element: <PersonRecord /> },
          { path: 'assign', element: <Assign /> },
          page('modules', 'nav.client.training', 'placeholder.client.training'),
          page('competitions', 'nav.client.engage', 'placeholder.client.engage'),
          { path: 'reports', element: <Reports /> },
          { path: 'reports/matrix', element: <Matrix /> },
          { path: 'modules/:moduleId/stats', element: <ModuleStats /> },
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

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
import { Competitions } from '../pages/client/Competitions';
import { AccountStatus } from '../pages/client/AccountStatus';
import { Onboarding } from '../pages/client/Onboarding';
import { Settings } from '../pages/client/Settings';
import { SignIn as ClientSignIn } from '../pages/client/SignIn';
import { Team } from '../pages/client/Team';
import { Display } from '../pages/me/Display';
import { Me } from '../pages/me/Me';
import { Compete } from '../pages/staff/Compete';
import { Certificate } from '../pages/staff/Certificate';
import { Home } from '../pages/staff/Home';
import { LessonPlayer } from '../pages/staff/LessonPlayer';
import { ModuleOverview } from '../pages/staff/ModuleOverview';
import { Quiz } from '../pages/staff/Quiz';
import { Results } from '../pages/staff/Results';
import { Learn } from '../pages/staff/Learn';
import { MyNotes } from '../pages/staff/MyNotes';
import { Notifications } from '../pages/staff/Notifications';
import { TrainingRecord } from '../pages/staff/Record';
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
      // Outside the client shell, so an admin who must set up two-step sign-in can still reach it.
      { path: '/client/signin', element: <ClientSignIn /> },
      // Outside the staff chrome: a certificate prints cleanly and an organisation document opens in its own tab.
      { path: '/staff/module/:moduleId/certificate', element: <Certificate /> },
      { path: '/staff/progress/record', element: <TrainingRecord /> },
      {
        path: '/client/billing/invoices/:invoiceId/print',
        lazy: async () => ({ Component: (await import('../pages/client/InvoicePrint')).InvoicePrint }),
      },
      { path: '/doc/:attachmentId', element: <OrgDoc /> },
      {
        path: '/print/first-aiders',
        lazy: async () => ({ Component: (await import('../pages/client/FirstAiders')).FirstAiders }),
      },
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
          { path: 'notes', element: <MyNotes /> },
          { path: 'progress', element: <Progress /> },
          {
            path: 'progress/upload/:requirementId',
            lazy: async () => ({
              Component: (await import('../pages/staff/UploadCertificate')).UploadCertificate,
            }),
          },
          { path: 'compete', element: <Compete /> },
          { path: 'me', element: <Me /> },
          { path: 'me/display', element: <Display /> },
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
          {
            path: 'modules',
            lazy: async () => ({ Component: (await import('../pages/client/ModuleLibrary')).ModuleLibrary }),
          },
          {
            path: 'modules/new',
            lazy: async () => ({ Component: (await import('../pages/client/ModuleBuilder')).ModuleBuilder }),
          },
          {
            path: 'modules/:moduleId/edit',
            lazy: async () => ({ Component: (await import('../pages/client/ModuleBuilder')).ModuleBuilder }),
          },
          {
            path: 'modules/:moduleId/preview',
            lazy: async () => ({ Component: (await import('../pages/client/ModulePreview')).ModulePreview }),
          },
          { path: 'competitions', element: <Competitions /> },
          {
            path: 'competitions/new',
            lazy: async () => ({
              Component: (await import('../pages/client/CompetitionBuilder')).CompetitionBuilder,
            }),
          },
          {
            path: 'competitions/:id/edit',
            lazy: async () => ({
              Component: (await import('../pages/client/CompetitionBuilder')).CompetitionBuilder,
            }),
          },
          {
            path: 'competitions/:id',
            lazy: async () => ({
              Component: (await import('../pages/client/CompetitionDetail')).CompetitionDetail,
            }),
          },
          {
            path: 'leaderboards',
            lazy: async () => ({
              Component: (await import('../pages/client/LeaderboardSettings')).LeaderboardSettings,
            }),
          },
          {
            path: 'organise',
            lazy: async () => ({ Component: (await import('../pages/client/Organise')).Organise }),
          },
          {
            path: 'evidence',
            lazy: async () => ({ Component: (await import('../pages/client/Evidence')).Evidence }),
          },
          {
            path: 'evidence/:id',
            lazy: async () => ({ Component: (await import('../pages/client/EvidenceReview')).EvidenceReview }),
          },
          { path: 'reports', element: <Reports /> },
          {
            path: 'stats',
            lazy: async () => ({ Component: (await import('../pages/client/StatsOverview')).StatsOverview }),
          },
          {
            path: 'module-feedback',
            lazy: async () => ({ Component: (await import('../pages/client/ModuleFeedback')).ModuleFeedback }),
          },
          { path: 'reports/matrix', element: <Matrix /> },
          { path: 'modules/:moduleId/stats', element: <ModuleStats /> },
          {
            path: 'billing',
            lazy: async () => ({ Component: (await import('../pages/client/Billing')).Billing }),
          },
          {
            path: 'billing/add-ons',
            lazy: async () => ({ Component: (await import('../pages/client/AddOns')).AddOns }),
          },
          {
            path: 'billing/pay',
            lazy: async () => ({ Component: (await import('../pages/client/PayNow')).PayNow }),
          },
          {
            path: 'modules/:moduleId/preview/:lessonId',
            lazy: async () => ({ Component: (await import('../pages/client/ModulePreview')).ModulePreview }),
          },
          { path: 'display', element: <Display /> },
          { path: 'settings', element: <Settings /> },
          { path: 'team', element: <Team /> },
          { path: 'account-status', element: <AccountStatus /> },
          { path: 'onboarding', element: <Onboarding /> },
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
          {
            path: 'content',
            lazy: async () => ({ Component: (await import('../pages/provider/ProviderContent')).ProviderContent }),
          },
          {
            path: 'feedback',
            lazy: async () => ({ Component: (await import('../pages/provider/AppFeedback')).AppFeedback }),
          },
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

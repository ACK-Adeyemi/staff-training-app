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
import { DataRetention } from '../pages/client/DataRetention';
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
import { Help } from '../pages/help/Help';
import { TicketThread } from '../pages/help/TicketThread';
import { TicketWizard } from '../pages/help/TicketWizard';
import { Overview } from '../pages/provider/Overview';
import { Clients } from '../pages/provider/Clients';
import { ClientDetail } from '../pages/provider/ClientDetail';
import { RouteError } from './RouteError';

const page = (path: string, title: MessageKey, body: MessageKey): RouteObject => ({
  path,
  element: <Placeholder titleKey={title} bodyKey={body} />,
});

// S14 to S16 for staff and C23 for admins: the same components, told apart by the signed-in side.
const helpRoutes: RouteObject[] = [
  { path: 'help', element: <Help /> },
  { path: 'help/ticket/new', element: <TicketWizard /> },
  { path: 'help/ticket/:ticketId', element: <TicketThread /> },
];

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
          {
            path: 'calendar',
            lazy: async () => ({ Component: (await import('../pages/staff/Calendar')).Calendar }),
          },
          { path: 'compete', element: <Compete /> },
          { path: 'me', element: <Me /> },
          { path: 'me/display', element: <Display /> },
          { path: 'notifications', element: <Notifications /> },
          ...helpRoutes,
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
            path: 'rules',
            lazy: async () => ({ Component: (await import('../pages/client/Rules')).Rules }),
          },
          {
            path: 'calendar',
            lazy: async () => ({ Component: (await import('../pages/client/Calendar')).Calendar }),
          },
          {
            path: 'themes',
            lazy: async () => ({ Component: (await import('../pages/client/Themes')).Themes }),
          },
          {
            path: 'reminders',
            lazy: async () => ({ Component: (await import('../pages/client/Reminders')).Reminders }),
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
          { path: 'data', element: <DataRetention /> },
          { path: 'team', element: <Team /> },
          { path: 'account-status', element: <AccountStatus /> },
          { path: 'onboarding', element: <Onboarding /> },
          ...helpRoutes,
        ],
      },
      {
        path: '/provider',
        lazy: async () => ({ Component: (await import('../shells/shells')).ProviderShell }),
        children: [
          { index: true, element: <Overview /> },
          { path: 'clients', element: <Clients /> },
          {
            path: 'clients/new',
            lazy: async () => ({ Component: (await import('../pages/provider/NewClient')).NewClient }),
          },
          { path: 'clients/:id', element: <ClientDetail /> },
          {
            path: 'content',
            lazy: async () => ({ Component: (await import('../pages/provider/ProviderContent')).ProviderContent }),
          },
          {
            path: 'feedback',
            lazy: async () => ({ Component: (await import('../pages/provider/AppFeedback')).AppFeedback }),
          },
          {
            path: 'packs',
            lazy: async () => ({ Component: (await import('../pages/provider/Packs')).Packs }),
          },
          {
            path: 'packages',
            lazy: async () => ({ Component: (await import('../pages/provider/ProviderPackages')).ProviderPackages }),
          },
          {
            path: 'add-ons',
            lazy: async () => ({ Component: (await import('../pages/provider/ProviderAddOns')).ProviderAddOns }),
          },
          {
            path: 'dunning',
            lazy: async () => ({ Component: (await import('../pages/provider/ProviderDunning')).ProviderDunning }),
          },
          page('tickets', 'nav.provider.support', 'placeholder.provider.support'),
          page('comms', 'nav.provider.comms', 'placeholder.provider.comms'),
          page('team', 'nav.provider.teamSecurity', 'placeholder.provider.teamSecurity'),
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];

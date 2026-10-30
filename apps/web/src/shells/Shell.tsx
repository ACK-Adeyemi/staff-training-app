import { useState, type MouseEvent, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Badge, BottomTabBar, Icon, MoreSheet, SideNav, focusClasses, type NavItem } from '@sta/ui';
import { useCurrentUser, useT } from '../app/hooks';
import { useDesktop } from '../app/useDesktop';
import { useUnreadCount } from '../pages/staff/queries';
import { DemoBadgeSlot } from '../demo/RootLayout';
import { SkipLink } from './SkipLink';
import { SystemBanners, SystemStatus } from './systemNotices';

export type ShellConfig = {
  side: 'staff' | 'client' | 'provider';
  /** Items in the phone bottom bar. */
  bar: readonly NavItem[];
  /** Items reached through More on phones. */
  more: readonly NavItem[];
  /** Links shown in the header (staff: notifications and help). */
  headerLinks: readonly NavItem[];
  /** Banners shown above the page (account state, two-step sign-in). */
  top?: ReactNode;
  /** Extra controls in the header, such as the site switcher. */
  headerExtra?: ReactNode;
};

function currentId(items: readonly NavItem[], pathname: string): string {
  let best = '';
  let bestLen = -1;
  for (const item of items) {
    const path = item.href.slice(1);
    const matches = pathname === path || (item.id !== items[0]?.id && pathname.startsWith(`${path}/`));
    if (matches && path.length > bestLen) {
      best = item.id;
      bestLen = path.length;
    }
  }
  return best;
}

export function Shell({ config }: { config: ShellConfig }) {
  const t = useT();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const desktop = useDesktop();
  const [moreOpen, setMoreOpen] = useState(false);
  const all = [...config.bar, ...config.more];
  const current = currentId([...all, ...config.headerLinks], pathname);
  const staff = config.more.length === 0;
  const unread = useUnreadCount(config.side === 'staff');

  // Route plain hash links through the router, so navigation works with any router type.
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('#/')) return;
    e.preventDefault();
    setMoreOpen(false);
    void navigate(href.slice(1));
  };

  const sidebar = !staff || desktop;
  const bottom = staff ? !desktop : true;

  return (
    <div onClick={onClick} className="min-h-screen md:flex">
      <SkipLink />
      {sidebar ? (
        <aside
          className={`border-[var(--color-border)] p-3 print:hidden md:w-60 md:shrink-0 md:border-r-2 ${staff ? '' : 'hidden md:block'}`}
        >
          <SideNav label={t('shell.mainNavigation')} items={staff ? config.bar : all} currentId={current} />
        </aside>
      ) : null}
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-2 print:hidden border-b-2 border-[var(--color-border)] px-4 py-2">
          <span className="font-semibold">{user.data?.displayName ?? t('shell.loading')}</span>
          <div className="flex flex-wrap items-center gap-2">
            {config.headerExtra}
            <SystemStatus side={config.side} />
            {config.side === 'provider' ? <Badge tone="simulated">{t('demo.simulatedData')}</Badge> : null}
            <DemoBadgeSlot />
            {config.headerLinks.map((item) => {
              const count = item.id === '/staff/notifications' ? unread : 0;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  aria-label={count > 0 ? t('staff.notifications.bellWithCount', { count }) : item.label}
                  aria-current={item.id === current ? 'page' : undefined}
                  className={`inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] items-center justify-center px-1 rounded-[var(--radius-md)] aria-[current=page]:bg-[var(--color-surface)] ${focusClasses}`}
                >
                  <Icon name={item.icon} />
                  {count > 0 ? (
                    <span aria-hidden="true" className="ms-1 text-sm font-bold">
                      {count}
                    </span>
                  ) : null}
                </a>
              );
            })}
          </div>
        </header>
        <SystemBanners side={config.side} />
        <main className="px-4 pb-28 print:p-0 md:pb-6">
          {config.top ? <div className="mt-3 flex flex-col gap-2 print:hidden">{config.top}</div> : null}
          <Outlet />
        </main>
      </div>
      {bottom ? (
        <div className={staff ? 'print:hidden' : 'print:hidden md:hidden'}>
          <BottomTabBar
            label={t('shell.mainNavigation')}
            items={config.bar}
            currentId={current}
            {...(staff
              ? {}
              : {
                  more: {
                    label: t('shell.more'),
                    onClick: () => {
                      setMoreOpen(true);
                    },
                  },
                })}
          />
        </div>
      ) : null}
      {staff ? null : (
        <MoreSheet
          open={moreOpen}
          title={t('shell.more')}
          onClose={() => {
            setMoreOpen(false);
          }}
          items={config.more}
          currentId={current}
        />
      )}
    </div>
  );
}

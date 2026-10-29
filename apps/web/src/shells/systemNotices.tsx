// System notices in every shell (M4 chunk 14d, brief 26.2 and 26.5): the header status, a banner for each active
// maintenance flag or open incident, and dismissible announcement banners. None of them replace page content.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon, focusClasses } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../app/hooks';

type Side = 'staff' | 'client' | 'provider';

/** Flags, the open incident and live banner announcements. Refreshed with the other shell queries. */
function useSystemNotices(side: Side) {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['systemNotices', actor.userId, side],
    queryFn: async () => {
      const [flags, incident, announcements] = await Promise.all([
        store.maintenance.flags(actor),
        store.incidents.current(actor),
        side === 'provider' ? Promise.resolve([]) : store.providerComms.banners(actor),
      ]);
      return { flags, incident, announcements };
    },
  });
}

/** The status word and any open incident title, for the header. */
export function SystemStatus({ side }: { side: Side }) {
  const t = useT();
  const notices = useSystemNotices(side);
  if (!notices.data) return null;
  const { incident } = notices.data;
  return (
    <span
      data-testid="system-status"
      {...(side === 'provider' ? { role: 'group', 'aria-label': t('systemNotices.statusLabel') } : {})}
      className="inline-flex min-h-[var(--target-min)] flex-wrap items-center gap-1 rounded-[var(--radius-sm)] border-2 border-[var(--color-border)] px-2 text-sm font-semibold"
    >
      <Icon name={incident.level === 'normal' ? 'check' : 'alert'} />
      <span>{t(`systemNotices.level.${incident.level}` as MessageKey)}</span>
      {incident.title ? <span className="font-normal">{incident.title}</span> : null}
    </span>
  );
}

function SystemBanner({ children }: { children: string }) {
  return (
    <div
      data-testid="system-banner"
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] border-2 border-[var(--status-expiring)] bg-[var(--color-surface)] p-3 text-[var(--color-text)]"
    >
      <Icon name="alert" size={24} className="mt-0.5 shrink-0" />
      <p className="m-0 min-w-0 flex-1">{children}</p>
    </div>
  );
}

/** Sits outside <main>. Announcements can be hidden for this visit; system notices cannot. */
export function SystemBanners({ side }: { side: Side }) {
  const t = useT();
  const notices = useSystemNotices(side);
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  if (!notices.data) return null;
  const { flags, incident, announcements } = notices.data;
  const live = announcements.filter((a) => !dismissed.includes(a.id));
  const hasIncident = incident.level !== 'normal';
  if (!flags[side] && !hasIncident && live.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3 print:hidden">
      {flags[side] ? <SystemBanner>{t('systemNotices.maintenanceBanner')}</SystemBanner> : null}
      {hasIncident ? (
        <SystemBanner>
          {[
            t('systemNotices.incidentBanner', {
              level: t(`systemNotices.level.${incident.level}` as MessageKey),
              title: incident.title ?? '',
            }),
            incident.message,
          ]
            .filter(Boolean)
            .join(' ')}
        </SystemBanner>
      ) : null}
      {live.map((a) => (
        <div key={a.id} data-testid="announcement-banner">
          <section
            aria-label={a.title}
            className="flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-accent)] bg-[var(--color-surface)] p-3 text-[var(--color-text)]"
          >
            <Icon name="help" size={24} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="m-0 font-bold">{a.title}</p>
              <p className="m-0">{a.body}</p>
              <button
                type="button"
                aria-label={t('systemNotices.announcementDismissFor', { title: a.title })}
                onClick={() => {
                  setDismissed((d) => [...d, a.id]);
                }}
                className={`mt-2 inline-flex min-h-11 min-w-[var(--target-min)] items-center justify-center rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-3 font-semibold ${focusClasses}`}
              >
                {t('systemNotices.announcementDismiss')}
              </button>
            </div>
          </section>
        </div>
      ))}
    </div>
  );
}

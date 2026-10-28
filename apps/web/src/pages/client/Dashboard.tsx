import type { ReactNode } from 'react';
import { Badge, Button, Card, LinkButton, PageHeader, ProgressRing, StatusBadge } from '@sta/ui';
import {
  can,
  needsAttention,
  openAssignmentsForActivePeople,
  percentOf,
  siteComparison,
  orgCompliance,
  recentlyCompleted,
  waitingForCheck,
  type AttentionItem,
  type SiteView,
} from '@sta/domain';
import { useActor, useT } from '../../app/hooks';
import { useSetSiteScope, useSiteScope } from '../../app/siteScope';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { fullName, moduleTitleOf, useClientData, usePermissions } from './queries';
import { scopeClientData, useSiteEvents } from './siteViews';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <Card className="h-full">
        <h2 id={id} className="mt-0 mb-3 text-lg font-bold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

const list = 'm-0 flex list-none flex-col gap-3 p-0';

function PersonLink({ id, name }: { id: string; name: string }) {
  return (
    <a href={`#/client/people/${id}`} className={`font-semibold underline ${focusLink}`}>
      {name}
    </a>
  );
}

/** One card per site, the one needing most attention first, with a button that opens the dashboard for that site. */
function SiteComparison({ data }: { data: SiteView }) {
  const t = useT();
  const setSite = useSetSiteScope();
  const names = new Map(data.sites.map((s) => [s.id, s.name]));
  return (
    <section aria-labelledby="c1-sites" className="mb-4">
      <h2 id="c1-sites" className="mt-0 mb-3 text-xl font-bold">
        {t('sites.comparisonTitle')}
      </h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
        {siteComparison(data).map((r) => {
          const name = names.get(r.siteId) ?? '';
          return (
            <li key={r.siteId} data-testid="site-card">
              <Card className="flex h-full flex-col gap-2">
                <h3 className="m-0 text-lg font-bold">{name}</h3>
                <p className="m-0 font-semibold">{t('sites.complianceFigure', { percent: r.compliancePercent })}</p>
                <p className="m-0">{t('sites.overdueFigure', { count: r.overdue })}</p>
                <p className="m-0">{t('sites.expiringFigure', { count: r.expiring })}</p>
                <p className="m-0">{t('sites.completionFigure', { percent: r.completionRate })}</p>
                <p className="m-0">{t('sites.staffFigure', { count: r.staff })}</p>
                <div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSite(r.siteId);
                    }}
                  >
                    {t('sites.open', { name })}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** C1. */
export function Dashboard() {
  const t = useT();
  const actor = useActor();
  const q = useClientData();
  const perms = usePermissions();
  const site = useSiteScope();
  const compare = site === 'all' && (q.data?.view.sites.length ?? 0) > 1;
  const events = useSiteEvents(compare);
  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data || !perms.data || (compare && !events.data)) return <p>{t('shell.loading')}</p>;
  const { modules } = q.data;
  const { view, assignments } = scopeClientData(q.data, site);

  const attention = needsAttention(view);
  const waiting = waitingForCheck(view);
  const org = orgCompliance(view);
  const recent = recentlyCompleted(view.evidence, view.people, view.now);
  const names = new Map(view.people.map((p) => [p.id, p]));
  const open = openAssignmentsForActivePeople(assignments, view.people);

  const detail = (item: AttentionItem): string => {
    const n = Math.abs(item.daysLeft ?? 0);
    if (item.status === 'overdue')
      return n === 1 ? t('client.dashboard.overdueByOne') : t('client.dashboard.overdueBy', { count: n });
    if (item.status === 'expiringSoon') {
      if (n === 0) return t('client.dashboard.dueToday');
      return n === 1 ? t('client.dashboard.daysLeftOne') : t('client.dashboard.daysLeft', { count: n });
    }
    return '';
  };
  const resultsFor = can(perms.data, 'reports.view', actor.clientId ? { clientId: actor.clientId } : {})
    ? modules.filter((m) => m.status === 'published')
    : [];
  const canAssign = can(perms.data, 'assign.manage', actor.clientId ? { clientId: actor.clientId } : {});

  return (
    <>
      <PageHeader title={t('nav.client.dashboard')}>
        {canAssign ? <LinkButton href="#/client/assign">{t('client.dashboard.assignAction')}</LinkButton> : null}
      </PageHeader>
      {compare ? (
        <SiteComparison data={{ ...q.data.view, assignments: q.data.assignments, events: events.data ?? [] }} />
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Section id="c1-needs" title={t('client.dashboard.needs')}>
            {attention.length === 0 ? (
              <p className="m-0">{t('client.dashboard.needsEmpty')}</p>
            ) : (
              <ul className={list}>
                {attention.map((item) => (
                  <li
                    key={`${item.person.id}-${item.requirement.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1"
                  >
                    <PersonLink id={item.person.id} name={fullName(item.person)} />
                    <span>{item.requirement.name}</span>
                    <StatusBadge status={item.status} label={t(`client.status.${item.status}`)} />
                    {detail(item) ? <span className="text-sm">{detail(item)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <div className="lg:col-span-2">
          <Section id="c1-waiting" title={t('client.dashboard.waiting')}>
            {waiting.length === 0 ? (
              <p className="m-0">{t('client.dashboard.waitingEmpty')}</p>
            ) : (
              <ul className={list}>
                {waiting.map((w) => (
                  <li
                    key={`${w.person.id}-${w.requirement.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1"
                  >
                    <PersonLink id={w.person.id} name={fullName(w.person)} />
                    <span>{w.requirement.name}</span>
                    <StatusBadge status="awaitingCheck" label={t('client.status.awaitingCheck')} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <Section id="c1-compliance" title={t('client.dashboard.compliance')}>
          <div className="flex flex-col items-center gap-2">
            <ProgressRing
              percent={percentOf(org.compliant, org.total)}
              valueText={t('client.dashboard.ringValue', { done: org.compliant, total: org.total })}
              description={t('client.dashboard.ringDescription', { done: org.compliant, total: org.total })}
              completeLabel={t('client.dashboard.complete')}
              size={140}
            />
            <p className="m-0 text-center">{t('client.dashboard.ringLabel')}</p>
            {resultsFor.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {resultsFor.map((m) => (
                  <li key={m.id}>
                    <a
                      href={`#/client/modules/${m.id}/stats`}
                      className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
                    >
                      {t('client.moduleStats.viewResults', { title: m.title })}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Section>
        <Section id="c1-recent" title={t('client.dashboard.recent')}>
          {recent.length === 0 ? (
            <p className="m-0">{t('client.dashboard.recentEmpty')}</p>
          ) : (
            <ul className={list}>
              {recent.map(({ person, evidence }) => (
                <li key={evidence.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <PersonLink id={person.id} name={fullName(person)} />
                  <span>{view.requirements.find((r) => r.id === evidence.requirementId)?.name ?? ''}</span>
                  <StatusBadge status="current" label={t('client.status.current')} />
                  <span className="text-sm">
                    {t('client.dashboard.completedOn', { date: formatLondonDate(evidence.completedAt) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <div className="lg:col-span-2">
          <Section id="c1-assigned" title={t('client.dashboard.assigned')}>
            {open.length === 0 ? (
              <p className="m-0">{t('client.dashboard.assignedEmpty')}</p>
            ) : (
              <ul className={list}>
                {open.map((a) => {
                  const person = names.get(a.personId);
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {person ? <PersonLink id={person.id} name={fullName(person)} /> : null}
                      <span>{moduleTitleOf(modules, a)}</span>
                      <Badge>{t('client.dashboard.dueOn', { date: formatLondonDate(a.dueAt) })}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

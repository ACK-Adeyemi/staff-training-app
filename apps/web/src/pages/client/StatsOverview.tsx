import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Card, LineChart, PageHeader, SegmentedControl, type ChartPoint } from '@sta/ui';
import {
  complianceTrend,
  mostAndLeastCompleted,
  overdueAndExpiring,
  overviewByRequirement,
  overviewByRole,
  overviewBySite,
  overviewByTeam,
  type AttentionRow,
  type BreakdownRow,
  type ModuleCompletionRow,
  type OverviewView,
} from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { useSiteScope } from '../../app/siteScope';
import { formatLondonShort } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { PermissionGate } from './PermissionGate';
import { fullName, orEmpty, useClientData } from './queries';

const ATTENTION_LIMIT = 10;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-6">
      <h2 id={id} className="mt-0 mb-3 text-lg font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Breakdown({ id, title, rows }: { id: string; title: string; rows: BreakdownRow[] }) {
  const t = useT();
  const data: ChartPoint[] = rows.map((r) => ({ label: r.name, axisLabel: r.name.slice(0, 8), value: r.percent }));
  return (
    <Section id={id} title={title}>
      <BarChart
        description={t('client.stats.sentence', {
          title,
          list: rows.map((r) => `${r.name} ${String(r.percent)}%`).join(', '),
        })}
        data={data}
        valueSuffix="%"
        labelHeader={t('client.stats.name')}
        valueHeader={t('client.stats.percent')}
        tableCaption={t('client.stats.caption', { title })}
        showTableLabel={t('stats.tableView')}
        hideTableLabel={t('stats.chartView')}
      />
    </Section>
  );
}

function Attention({
  id,
  title,
  rows,
  names,
  requirements,
  daysKey,
}: {
  id: string;
  title: string;
  rows: AttentionRow[];
  names: Map<string, string>;
  requirements: Map<string, string>;
  daysKey: 'client.stats.daysOverdue' | 'client.stats.daysLeft';
}) {
  const t = useT();
  return (
    <Section id={id} title={title}>
      {rows.length === 0 ? (
        <p className="m-0">{t('stats.noData')}</p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.slice(0, ATTENTION_LIMIT).map((r) => (
              <li key={`${r.personId}-${r.requirementId}`}>
                <a
                  href={`#/client/people/${r.personId}`}
                  className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
                >
                  {names.get(r.personId) ?? r.personId}
                </a>
                {`: ${requirements.get(r.requirementId) ?? ''}. ${t(daysKey, { count: Math.abs(r.daysLeft) })}`}
              </li>
            ))}
          </ul>
          {rows.length > ATTENTION_LIMIT ? (
            <p className="mb-0">{t('client.stats.showingFirst', { count: ATTENTION_LIMIT })}</p>
          ) : null}
        </>
      )}
    </Section>
  );
}

function Completed({ id, title, rows }: { id: string; title: string; rows: ModuleCompletionRow[] }) {
  const t = useT();
  return (
    <Section id={id} title={title}>
      {rows.length === 0 ? (
        <p className="m-0">{t('stats.noData')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((r) => (
            <li key={r.moduleId}>{t('client.stats.moduleItem', { title: r.title, percent: r.percent })}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Body() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const site = useSiteScope();
  const [days, setDays] = useState<'30' | '90'>('30');
  const data = useClientData();
  const extra = useQuery({
    queryKey: ['statsOverviewData', actor.userId],
    queryFn: async () => {
      const [jobRoles, teams] = await Promise.all([
        orEmpty(store.jobRoles.list(actor)),
        orEmpty(store.teams.list(actor)),
      ]);
      return { jobRoles, teams };
    },
  });
  if (data.isError || extra.isError) return <p role="alert">{t('client.stats.loadError')}</p>;
  if (!data.data || !extra.data) return <p>{t('shell.loading')}</p>;

  const { view: base, assignments, modules } = data.data;
  const scoped = site === 'all' ? base.people : base.people.filter((p) => p.primarySiteId === site);
  const view: OverviewView = {
    ...base,
    people: scoped,
    sites: site === 'all' ? base.sites : base.sites.filter((s) => s.id === site),
    jobRoles: extra.data.jobRoles,
    teams: extra.data.teams,
  };
  const scopedIds = new Set(scoped.map((p) => p.id));
  const scopedAssignments = assignments.filter((a) => scopedIds.has(a.personId));
  const names = new Map(base.people.map((p) => [p.id, fullName(p)]));
  const requirements = new Map(base.requirements.map((r) => [r.id, r.name]));
  const { overdue, expiring } = overdueAndExpiring(view);
  const { most, least } = mostAndLeastCompleted({ modules, assignments: scopedAssignments });
  const trendDays = days === '30' ? 30 : 90;
  const trend = complianceTrend(view, trendDays);
  const step = trend.length > 6 ? 4 : 1;
  const trendData: ChartPoint[] = trend.map((p, i) => ({
    label: formatLondonShort(p.at),
    axisLabel: i % step === 0 || i === trend.length - 1 ? formatLondonShort(p.at) : '',
    value: p.percent,
  }));

  return (
    <>
      <p className="mt-0">{t('stats.adminOnlyNote')}</p>
      <Breakdown id="stats-req" title={t('stats.byRequirement')} rows={overviewByRequirement(view)} />
      <Breakdown id="stats-role" title={t('stats.byRole')} rows={overviewByRole(view)} />
      <Breakdown id="stats-team" title={t('stats.byTeam')} rows={overviewByTeam(view)} />
      {base.sites.length > 1 ? (
        <Breakdown id="stats-site" title={t('stats.bySite')} rows={overviewBySite(view)} />
      ) : null}
      <Attention
        id="stats-overdue"
        title={t('stats.overdue')}
        rows={overdue}
        names={names}
        requirements={requirements}
        daysKey="client.stats.daysOverdue"
      />
      <Attention
        id="stats-expiring"
        title={t('stats.expiring')}
        rows={expiring}
        names={names}
        requirements={requirements}
        daysKey="client.stats.daysLeft"
      />
      <Completed id="stats-most" title={t('stats.mostCompleted')} rows={most} />
      <Completed id="stats-least" title={t('stats.leastCompleted')} rows={least} />
      <Section id="stats-trend" title={t('stats.trend')}>
        <Card className="mb-3">
          <SegmentedControl
            legend={t('client.stats.range')}
            options={[
              { value: '30', label: t('stats.days30') },
              { value: '90', label: t('stats.days90') },
            ]}
            value={days}
            onChange={(v) => {
              setDays(v === '90' ? '90' : '30');
            }}
          />
        </Card>
        <LineChart
          description={t('client.stats.trendSentence', {
            days: trendDays,
            list: trendData.map((d) => `${d.label} ${String(d.value)}%`).join(', '),
          })}
          data={trendData}
          valueSuffix="%"
          labelHeader={t('client.stats.date')}
          valueHeader={t('client.stats.percentShort')}
          tableCaption={t('client.stats.trendCaption')}
          showTableLabel={t('stats.tableView')}
          hideTableLabel={t('stats.chartView')}
        />
      </Section>
    </>
  );
}

/** C9: compliance breakdowns, what needs attention and the trend. Never ranks people. */
export function StatsOverview() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('stats.title')} />
      <PermissionGate permission="reports.view" anyScope message="feedback.inbox.noPermission">
        <Body />
      </PermissionGate>
    </>
  );
}

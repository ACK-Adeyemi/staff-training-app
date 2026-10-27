// C28 Calendar (brief 28.3): the team's dates in a list or month, filters, expiries grouped by week with one-step
// "Assign refresher for a week", the first aiders forecast, billing dates (only with billing.view), .ics and print.
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { firstAidRequirementKey } from '@sta/content';
import {
  calendarItems,
  currentFirstAiders,
  dueAtFromLondonDate,
  expiryClusters,
  firstAiderForecast,
  holdsAnywhere,
  londonDateString,
  type CalendarItem,
  type CalendarRange,
  type Cluster,
} from '@sta/domain';
import { Button, Card, DataTable, Dialog, PageHeader } from '@sta/ui';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { useSiteScope } from '../../app/siteScope';
import { formatLondonDate } from '../../demo/format';
import { CalendarBody } from '../calendar/CalendarBody';
import { itemTitle, teamIcsItems } from '../calendar/titles';
import { useClientCalendar, type ClientCalendarData } from './calendarQueries';
import { field } from './organiseShared';
import { fullName, usePermissions } from './queries';

const ALL = '';
const shiftDay = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** The heading shows at once; the rest waits for the permission check, and a user with no access gets the alert. */
export function Calendar() {
  const t = useT();
  const actor = useActor();
  const perms = usePermissions();
  if (!perms.data) {
    return (
      <>
        <PageHeader title={t('calendar.title')} />
        <p>{t('shell.loading')}</p>
      </>
    );
  }
  if (actor.clientId === undefined || !holdsAnywhere(perms.data, 'assign.view')) {
    return (
      <>
        <PageHeader title={t('calendar.title')} />
        <p role="alert">{t('errors.forbidden')}</p>
      </>
    );
  }
  return <CalendarContent />;
}

function CalendarContent() {
  const t = useT();
  const clock = useClock();
  const q = useClientCalendar();
  const now = clock.now();
  return (
    <>
      <PageHeader title={t('calendar.title')} />
      {q.isError ? <p role="alert">{t('calendar.loadError')}</p> : null}
      {q.data ? <Loaded data={q.data} now={now} /> : q.isError ? null : <p>{t('shell.loading')}</p>}
    </>
  );
}

function Loaded({ data, now }: { data: ClientCalendarData; now: Date }) {
  const t = useT();
  const scope = useSiteScope();
  const [teamId, setTeamId] = useState(ALL);
  const [requirementId, setRequirementId] = useState(ALL);
  // A site chosen here holds until the header switcher changes.
  const [choice, setChoice] = useState<{ scope: string; site: string } | null>(null);
  const [notice, setNotice] = useState('');
  const site = choice && choice.scope === scope ? choice.site : scope;
  const siteId = site === 'all' ? undefined : site;
  const nowKey = now.getTime();
  const today = londonDateString(now);

  const compute = useCallback(
    (range: CalendarRange): CalendarItem[] =>
      calendarItems(
        {
          audience: 'admin',
          people: data.people,
          sites: data.sites,
          requirements: data.requirements,
          evidence: data.evidence,
          submissions: data.submissions,
          assignments: data.assignments,
          modules: data.modules,
          competitions: data.competitions,
          rules: data.rules,
          themes: data.themes,
          amberWindowDays: data.amberWindowDays,
          now: new Date(nowKey),
          ...(data.billing ? { billing: data.billing } : {}),
        },
        range,
        {
          ...(siteId ? { siteId } : {}),
          ...(teamId !== ALL ? { teamId } : {}),
          ...(requirementId !== ALL ? { requirementId } : {}),
        },
      ),
    [data, nowKey, siteId, teamId, requirementId],
  );
  const requirementName = useCallback(
    (id: string) => data.requirements.find((r) => r.id === id)?.name ?? '',
    [data.requirements],
  );
  const clusters = useMemo(
    () => expiryClusters(compute({ from: today, to: shiftDay(today, 90) })).filter((c) => c.count >= 2),
    [compute, today],
  );

  return (
    <>
      <p className="mt-0">{t('calendar.intro')}</p>
      {notice ? <p role="status">{notice}</p> : null}
      <Card>
        <div role="group" aria-label={t('calendar.filters')} className="flex flex-wrap items-end gap-3">
          <Select label={t('calendar.team')} value={teamId} onChange={setTeamId}>
            <option value={ALL}>{t('calendar.allTeams')}</option>
            {data.teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          <Select label={t('calendar.training')} value={requirementId} onChange={setRequirementId}>
            <option value={ALL}>{t('calendar.anyTraining')}</option>
            {data.requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          {data.sites.length > 1 ? (
            <Select
              label={t('calendar.site')}
              value={site}
              onChange={(v) => {
                setChoice({ scope, site: v });
              }}
            >
              <option value="all">{t('calendar.allSites')}</option>
              {data.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </Card>
      <div className="mt-4 flex flex-col gap-6">
        <CalendarBody
          now={now}
          compute={compute}
          titleOf={(item) => itemTitle(t, item, true)}
          perItemIcs={false}
          icsItems={(items) => teamIcsItems(t, items, requirementName)}
          toolbar={
            <Button
              variant="secondary"
              onClick={() => {
                window.print();
              }}
            >
              {t('calendar.print')}
            </Button>
          }
        />
        <Clusters data={data} clusters={clusters} onDone={setNotice} />
        <Forecast data={data} now={now} siteId={siteId} />
      </div>
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex max-w-full min-w-0 flex-col gap-1 font-semibold">
      {label}
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={`${field} max-w-full min-w-0`}
      >
        {children}
      </select>
    </label>
  );
}

function Clusters({
  data,
  clusters,
  onDone,
}: {
  data: ClientCalendarData;
  clusters: Cluster[];
  onDone: (message: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<Cluster | null>(null);
  const requirement = (id: string) => data.requirements.find((r) => r.id === id);
  return (
    <section aria-labelledby="c28-clusters" className="flex flex-col gap-2">
      <h2 id="c28-clusters" className="m-0 text-xl font-bold">
        {t('calendar.clusters')}
      </h2>
      {clusters.length === 0 ? (
        <p className="m-0">{t('calendar.noClusters')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {clusters.map((c) => (
            <li
              key={`${c.requirementId}|${c.weekStart}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
            >
              <div>
                <p className="m-0 font-semibold">
                  {t('calendar.clusterTitle', {
                    count: c.count,
                    requirement: requirement(c.requirementId)?.name ?? '',
                  })}
                </p>
                <p className="m-0 text-sm">{t('calendar.weekOf', { date: formatLondonDate(c.weekStart) })}</p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(c);
                }}
              >
                {t('calendar.assignWeek')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AssignDialog
        data={data}
        cluster={open}
        onClose={() => {
          setOpen(null);
        }}
        onDone={(message) => {
          setOpen(null);
          onDone(message);
        }}
      />
    </section>
  );
}

function AssignDialog({
  data,
  cluster,
  onClose,
  onDone,
}: {
  data: ClientCalendarData;
  cluster: Cluster | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const perms = usePermissions();
  const qc = useQueryClient();
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plan = useMemo(() => {
    if (!cluster) return null;
    const req = data.requirements.find((r) => r.id === cluster.requirementId);
    const module = data.modules.find((m) => m.status === 'published' && req?.satisfiedByModuleIds.includes(m.id));
    const people = cluster.personIds.flatMap((id) => data.people.filter((p) => p.id === id));
    const has = new Set(
      data.assignments
        .filter(
          (a) =>
            a.status === 'open' && module !== undefined && 'moduleId' in a.target && a.target.moduleId === module.id,
        )
        .map((a) => a.personId),
    );
    return {
      module,
      people,
      skipped: people.filter((p) => has.has(p.id)),
      assignable: people.filter((p) => !has.has(p.id)),
    };
  }, [cluster, data]);

  const allowed =
    perms.data !== undefined && actor.clientId !== undefined && holdsAnywhere(perms.data, 'assign.manage');
  const assign = async () => {
    if (!cluster || !plan?.module || plan.assignable.length === 0) return;
    setBusy(true);
    setFailedFor(null);
    try {
      const result = await store.assignments.assign(actor, {
        moduleId: plan.module.id,
        personIds: plan.assignable.map((p) => p.id),
        dueAt: dueAtFromLondonDate(cluster.earliestDate),
      });
      const n = result.created.length;
      await qc.invalidateQueries({ queryKey: ['clientCalendar'] });
      await qc.invalidateQueries({ queryKey: ['clientData'] });
      onDone(n === 1 ? t('calendar.assignedOne') : t('calendar.assigned', { count: n }));
    } catch {
      setFailedFor(`${cluster.requirementId}|${cluster.weekStart}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={cluster !== null} title={t('calendar.assignWeek')} onClose={onClose}>
      {cluster && plan ? (
        <div className="flex flex-col gap-4">
          <p className="m-0">{t('calendar.weekOf', { date: formatLondonDate(cluster.weekStart) })}</p>
          <div>
            <h3 id="c28-people" className="mt-0 mb-1 text-base font-bold">
              {t('calendar.people')}
            </h3>
            <ul aria-labelledby="c28-people" className="m-0 list-disc pl-6">
              {plan.people.map((p) => (
                <li key={p.id}>{fullName(p)}</li>
              ))}
            </ul>
          </div>
          <p className="m-0">
            <span className="font-semibold">{t('calendar.module')}: </span>
            {plan.module ? plan.module.title : t('calendar.noModule')}
          </p>
          <p className="m-0">
            <span className="font-semibold">{t('calendar.dueDate')}: </span>
            {formatLondonDate(cluster.earliestDate)}
          </p>
          {plan.skipped.length > 0 ? (
            <div>
              <h3 id="c28-skipped" className="mt-0 mb-1 text-base font-bold">
                {t('calendar.skipped')}
              </h3>
              <p className="mt-0 mb-1">{t('calendar.skippedNote')}</p>
              <ul aria-labelledby="c28-skipped" className="m-0 list-disc pl-6">
                {plan.skipped.map((p) => (
                  <li key={p.id}>{fullName(p)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {failedFor === `${cluster.requirementId}|${cluster.weekStart}` ? (
            <p role="alert">{t('calendar.assignError')}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {allowed && plan.module && plan.assignable.length > 0 ? (
              <Button disabled={busy} onClick={() => void assign()}>
                {t('calendar.assign')}
              </Button>
            ) : null}
            <Button variant="quiet" onClick={onClose}>
              {t('calendar.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function Forecast({ data, now, siteId }: { data: ClientCalendarData; now: Date; siteId: string | undefined }) {
  const t = useT();
  const requirement = data.requirements.find((r) => r.id === firstAidRequirementKey);
  if (!requirement) return null;
  const people = siteId ? data.people.filter((p) => p.primarySiteId === siteId) : data.people;
  const input = { people, sites: data.sites, requirement, evidence: data.evidence, now };
  const current = currentFirstAiders(input).length;
  const weeks = firstAiderForecast({ ...input, threshold: data.firstAiderThreshold }).all;
  return (
    <section aria-labelledby="c28-forecast" className="flex flex-col gap-2">
      <h2 id="c28-forecast" className="m-0 text-xl font-bold">
        {t('calendar.forecast')}
      </h2>
      <p className="m-0">{t('calendar.forecastIntro')}</p>
      <p className="m-0 font-semibold">{t('calendar.firstAiders', { count: current })}</p>
      <DataTable
        caption={t('calendar.forecastTable')}
        columns={[
          { key: 'week', header: t('calendar.weekStarting') },
          { key: 'count', header: t('calendar.firstAiderCount') },
        ]}
        rows={weeks.map((w) => ({
          id: w.weekStart,
          cells: {
            week: (
              <>
                {formatLondonDate(w.weekStart)}
                {w.belowThreshold ? (
                  <span className="block text-sm font-bold">
                    {t('calendar.belowMinimum', { minimum: data.firstAiderThreshold })}
                  </span>
                ) : null}
              </>
            ),
            count: String(w.count),
          },
        }))}
      />
    </section>
  );
}

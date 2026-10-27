import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Button, Card, DataTable, Histogram, PageHeader, StatusBar, type DataTableRow } from '@sta/ui';
import {
  completionsByWeek,
  holdsAnywhere,
  lessonFunnel,
  moduleStats,
  peopleRows,
  scoreDistribution,
  statusBar,
  toCsv,
  type EffectivePermission,
  type Module,
  type ModuleStatsInput,
  type PersonRow,
} from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate, formatLondonShort } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { FeedbackRegion } from './FeedbackRegion';
import { PermissionGate } from './PermissionGate';
import { fullName, useClientData, usePermissions } from './queries';

const WEEKS = 8;

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

function StatsBody({ moduleId }: { moduleId: string | undefined }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const data = useClientData();
  const perms = usePermissions();
  const extra = useQuery({
    queryKey: ['moduleStatsData', actor.userId],
    queryFn: async () => {
      const [attempts, events] = await Promise.all([store.attempts.list(actor), store.learningEvents.list(actor)]);
      return { attempts, events };
    },
  });
  if (data.isError || extra.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!data.data || !extra.data || !perms.data) return <p>{t('shell.loading')}</p>;
  const { view, assignments, modules } = data.data;
  const module = modules.find((m) => m.id === moduleId);
  if (!module) return <p role="alert">{t('client.moduleStats.notFound')}</p>;

  // All versions count: the page does not narrow the inputs to the current version (decision, M3 chunk 16).
  const input: ModuleStatsInput = {
    module,
    assignments,
    attempts: extra.data.attempts,
    events: extra.data.events,
    evidence: view.evidence,
    now: view.now,
  };
  return <StatsContent module={module} input={input} people={view.people} perms={perms.data} />;
}

function StatsContent({
  module,
  input,
  people,
  perms,
}: {
  module: Module;
  input: ModuleStatsInput;
  people: Parameters<typeof peopleRows>[0]['people'];
  perms: EffectivePermission[];
}) {
  const t = useT();
  const stats = moduleStats(input);
  const h = stats.headline;
  const bar = statusBar(input);
  const funnel = lessonFunnel(input);
  const dist = scoreDistribution(input);
  const weeks = completionsByWeek(input, WEEKS);
  const rows = peopleRows({ ...input, people });

  const pct = (n: number | null) => (n === null ? t('client.moduleStats.noScores') : `${String(n)}%`);
  const numbers: [string, string][] = [
    [t('client.moduleStats.assigned'), String(h.assigned)],
    [t('client.moduleStats.started'), String(h.started)],
    [t('client.moduleStats.completed'), String(h.completed)],
    [t('client.moduleStats.completionRate'), `${String(h.completionRate)}%`],
    [t('client.moduleStats.overdue'), String(h.overdue)],
    [t('client.moduleStats.averageScore'), pct(h.averageScore)],
    [t('client.moduleStats.passRate'), pct(h.passRate)],
    [t('client.moduleStats.firstAttemptPassRate'), pct(h.firstTimePassPercent)],
    [
      t('stats.averageTime'),
      h.averageMinutes === null
        ? t('client.moduleStats.noScores')
        : t('client.moduleStats.minutes', { count: h.averageMinutes }),
    ],
  ];

  const tableText = {
    showTableLabel: t('stats.tableView'),
    hideTableLabel: t('stats.chartView'),
  };
  const statusSegments = [
    { label: t('stats.done'), value: bar.completed, tone: 'current' as const },
    { label: t('stats.inProgress'), value: bar.inProgress, tone: 'awaiting' as const },
    { label: t('stats.notStarted'), value: bar.notStarted, tone: 'not-assigned' as const },
    { label: t('stats.overdue'), value: bar.overdue, tone: 'overdue' as const },
  ];
  const list = (items: { label: string; value: number }[]) =>
    items.map((x) => `${x.label} ${String(x.value)}`).join(', ');

  const columns = [
    { key: 'question', header: t('client.moduleStats.question') },
    { key: 'answered', header: t('client.moduleStats.answered') },
    { key: 'percent', header: t('client.moduleStats.percentCorrect') },
    { key: 'source', header: t('client.moduleStats.source') },
    { key: 'opened', header: t('client.moduleStats.learnMoreOpened') },
  ];
  const questionRows: DataTableRow[] = stats.questions.map((r) => {
    const q = module.questions.find((x) => x.id === r.questionId);
    return {
      id: r.questionId,
      cells: {
        question: q?.prompt ?? r.questionId,
        answered: String(r.answered),
        percent: r.percentCorrect === null ? t('client.moduleStats.noAnswers') : `${String(r.percentCorrect)}%`,
        source: q?.sourceRef ?? t('client.moduleStats.noSource'),
        opened: String(r.learnMoreOpened),
      },
    };
  });

  const statusWord = (s: PersonRow['status']) =>
    s === 'completed'
      ? t('stats.done')
      : s === 'inProgress'
        ? t('stats.inProgress')
        : s === 'overdue'
          ? t('stats.overdue')
          : t('stats.notStarted');
  const notYet = t('client.moduleStats.notYet');
  const scoreText = (r: PersonRow) => (r.score === null ? notYet : `${String(r.score)}%`);
  const dateText = (r: PersonRow) => (r.completedAt === null ? notYet : formatLondonDate(r.completedAt));
  const minutesText = (r: PersonRow) =>
    r.minutes === null ? notYet : t('client.moduleStats.minutes', { count: r.minutes });
  const peopleTable: DataTableRow[] = rows.map((r) => ({
    id: r.person.id,
    cells: {
      name: (
        <a href={`#/client/people/${r.person.id}`} className={`underline ${focusLink}`}>
          {fullName(r.person)}
        </a>
      ),
      status: statusWord(r.status),
      score: scoreText(r),
      date: dateText(r),
      time: minutesText(r),
    },
  }));

  const download = () => {
    const csv = toCsv(
      [
        { key: 'name', header: t('client.moduleStats.person') },
        { key: 'status', header: t('client.moduleStats.stage') },
        { key: 'score', header: t('client.moduleStats.score') },
        { key: 'date', header: t('client.moduleStats.completedOn') },
        { key: 'time', header: t('client.moduleStats.timeTaken') },
      ],
      rows.map((r) => ({
        name: fullName(r.person),
        status: statusWord(r.status),
        score: scoreText(r),
        date: dateText(r),
        time: minutesText(r),
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('client.moduleStats.csvName');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const funnelData = funnel.map((f, i) => ({ label: f.title, axisLabel: String(i + 1), value: f.reached }));
  const bandData = dist.buckets.map((b) => ({
    label: `${String(b.from)} to ${String(b.to)}`,
    axisLabel: String(b.from),
    value: b.count,
  }));
  const weekData = weeks.map((w) => ({ label: formatLondonShort(w.weekStart), value: w.completed }));

  return (
    <>
      <PageHeader title={t('client.moduleStats.viewResults', { title: module.title })}>
        <div className="flex flex-wrap gap-3 print:hidden">
          <Button variant="secondary" onClick={download}>
            {t('client.moduleStats.download')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              window.print();
            }}
          >
            {t('client.moduleStats.print')}
          </Button>
        </div>
      </PageHeader>
      <section aria-labelledby="stats-headline" className="mb-6">
        <Card>
          <h2 id="stats-headline" className="mt-0 mb-3 text-lg font-bold">
            {t('client.moduleStats.headline')}
          </h2>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            {numbers.map(([term, value]) => (
              <div key={term}>
                <dt className="text-sm font-semibold">{term}</dt>
                <dd className="m-0 text-xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <Section id="stats-status" title={t('stats.statusBar')}>
        <StatusBar
          description={t('client.moduleStats.statusSentence', {
            completed: bar.completed,
            inProgress: bar.inProgress,
            notStarted: bar.notStarted,
            overdue: bar.overdue,
          })}
          segments={statusSegments}
          labelHeader={t('client.moduleStats.statusLabel')}
          valueHeader={t('client.moduleStats.statusValue')}
          tableCaption={t('client.moduleStats.statusCaption')}
          {...tableText}
        />
      </Section>

      <Section id="stats-lessons" title={t('stats.lessonFunnel')}>
        <BarChart
          description={t('client.moduleStats.funnelSentence', {
            list: list(funnelData.map((d) => ({ label: d.label, value: d.value }))),
          })}
          data={funnelData}
          labelHeader={t('client.moduleStats.funnelLabel')}
          valueHeader={t('client.moduleStats.funnelValue')}
          tableCaption={t('client.moduleStats.funnelCaption')}
          {...tableText}
        />
      </Section>

      <Section id="stats-questions" title={t('stats.hardQuestions')}>
        <DataTable caption={t('client.moduleStats.questions')} columns={columns} rows={questionRows} />
      </Section>

      <Section id="stats-scores" title={t('stats.scores')}>
        <Histogram
          description={t('client.moduleStats.scoresSentence', { list: list(bandData) })}
          data={bandData}
          labelHeader={t('client.moduleStats.scoresLabel')}
          valueHeader={t('client.moduleStats.scoresValue')}
          tableCaption={t('client.moduleStats.scoresCaption')}
          {...tableText}
        />
        <p data-testid="retakes" className="mb-0">
          {t('client.moduleStats.retakesCount', { count: dist.retakes })}
        </p>
      </Section>

      <Section id="stats-weeks" title={t('stats.byWeek')}>
        <BarChart
          description={t('client.moduleStats.weeksSentence', { count: WEEKS, list: list(weekData) })}
          data={weekData}
          labelHeader={t('client.moduleStats.weeksLabel')}
          valueHeader={t('client.moduleStats.weeksValue')}
          tableCaption={t('client.moduleStats.weeksCaption')}
          {...tableText}
        />
      </Section>

      <Section id="stats-people" title={t('stats.people')}>
        {rows.length === 0 ? (
          <p>{t('client.moduleStats.noPeople')}</p>
        ) : (
          <DataTable
            caption={t('client.moduleStats.peopleCaption')}
            columns={[
              { key: 'name', header: t('client.moduleStats.person') },
              { key: 'status', header: t('client.moduleStats.stage') },
              { key: 'score', header: t('client.moduleStats.score') },
              { key: 'date', header: t('client.moduleStats.completedOn') },
              { key: 'time', header: t('client.moduleStats.timeTaken') },
            ]}
            rows={peopleTable}
          />
        )}
      </Section>

      {holdsAnywhere(perms, 'moduleFeedback.view') ? (
        <FeedbackRegion moduleId={module.id} perms={perms} people={people} />
      ) : null}

      <a href="#/client" className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}>
        {t('client.moduleStats.back')}
      </a>
    </>
  );
}

/** C8: results for one module (headline numbers, charts with table alternatives, people and staff feedback). */
export function ModuleStats() {
  const { moduleId } = useParams();
  return (
    <PermissionGate permission="reports.view" anyScope message="client.moduleStats.noPermission">
      <StatsBody moduleId={moduleId} />
    </PermissionGate>
  );
}

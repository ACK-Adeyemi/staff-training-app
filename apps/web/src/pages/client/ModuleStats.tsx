import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, DataTable, PageHeader, type DataTableRow } from '@sta/ui';
import { moduleStats } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { focusLink } from '../staff/styles';
import { PermissionGate } from './PermissionGate';
import { useClientData } from './queries';

function StatsBody({ moduleId }: { moduleId: string | undefined }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const data = useClientData();
  const extra = useQuery({
    queryKey: ['moduleStatsData', actor.userId],
    queryFn: async () => {
      const [attempts, events] = await Promise.all([store.attempts.list(actor), store.learningEvents.list(actor)]);
      return { attempts, events };
    },
  });
  if (data.isError || extra.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!data.data || !extra.data) return <p>{t('shell.loading')}</p>;
  const { view, assignments, modules } = data.data;
  const module = modules.find((m) => m.id === moduleId);
  if (!module) return <p role="alert">{t('client.moduleStats.notFound')}</p>;

  const stats = moduleStats({
    module,
    assignments,
    attempts: extra.data.attempts,
    events: extra.data.events,
    evidence: view.evidence,
    now: view.now,
  });
  const h = stats.headline;
  const started = h.assigned - h.notStarted;
  const pct = (n: number | null) => (n === null ? t('client.moduleStats.noScores') : `${String(n)}%`);

  const numbers: [string, string][] = [
    [t('client.moduleStats.assigned'), String(h.assigned)],
    [t('client.moduleStats.started'), String(started)],
    [t('client.moduleStats.completed'), String(h.completed)],
    [t('client.moduleStats.completionRate'), `${String(h.completionRate)}%`],
    [t('client.moduleStats.overdue'), String(h.overdue)],
    [t('client.moduleStats.averageScore'), pct(h.averageScore)],
    [t('client.moduleStats.passRate'), pct(h.firstTimePassPercent)],
  ];

  const columns = [
    { key: 'question', header: t('client.moduleStats.question') },
    { key: 'answered', header: t('client.moduleStats.answered') },
    { key: 'percent', header: t('client.moduleStats.percentCorrect') },
    { key: 'source', header: t('client.moduleStats.source') },
    { key: 'opened', header: t('client.moduleStats.learnMoreOpened') },
  ];
  const rows: DataTableRow[] = stats.questions.map((r) => {
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

  return (
    <>
      <PageHeader title={t('client.moduleStats.viewResults', { title: module.title })} />
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
      <section aria-labelledby="stats-questions" className="mb-6">
        <h2 id="stats-questions" className="mt-0 mb-3 text-lg font-bold">
          {t('client.moduleStats.questions')}
        </h2>
        <DataTable caption={t('client.moduleStats.questionsCaption')} columns={columns} rows={rows} />
      </section>
      <a href="#/client" className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}>
        {t('client.moduleStats.back')}
      </a>
    </>
  );
}

/** C8 (basic): headline numbers and question results for one module. */
export function ModuleStats() {
  const { moduleId } = useParams();
  return (
    <PermissionGate permission="reports.view" message="client.moduleStats.noPermission">
      <StatsBody moduleId={moduleId} />
    </PermissionGate>
  );
}

import { Button, DataTable } from '@sta/ui';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { useRewards } from './rewardsQueries';
import { focusLink } from './styles';

/** The person's own training record, laid out to print. Never includes notes. Sits outside the staff chrome. */
export function TrainingRecord() {
  const t = useT();
  const q = useRewards();
  const data = q.data;
  const rows = data
    ? [...data.evidence]
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .map((e) => ({
          id: e.id,
          cells: {
            name:
              data.modules.find((m) => m.id === e.moduleId)?.title ??
              data.requirements.find((r) => r.id === e.requirementId)?.name ??
              '',
            date: formatLondonDate(e.completedAt),
          },
        }))
    : [];
  return (
    <main className="mx-auto max-w-2xl p-4">
      {data || q.isError ? <h1 className="text-2xl font-bold">{t('staff.progress.recordTitle')}</h1> : null}
      {q.isError ? <p role="alert">{t('staff.progress.recordLoadError')}</p> : null}
      {data ? (
        <>
          <p className="text-lg font-semibold">{`${data.person.firstName} ${data.person.lastName}`}</p>
          <p>{t('staff.progress.recordLevel', { level: data.level.level })}</p>
          <p>{t('xp.total', { xp: data.totalXp })}</p>
          {rows.length === 0 ? (
            <p>{t('staff.progress.recordNone')}</p>
          ) : (
            <DataTable
              caption={t('staff.progress.recordCompleted')}
              rowHeader
              printFriendly
              columns={[
                { key: 'name', header: t('staff.progress.recordModule') },
                { key: 'date', header: t('staff.progress.recordDate') },
              ]}
              rows={rows}
            />
          )}
        </>
      ) : q.isError ? null : (
        <p>{t('shell.loading')}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4 print:hidden">
        <Button
          onClick={() => {
            window.print();
          }}
        >
          {t('staff.progress.print')}
        </Button>
        <a
          href="#/staff/progress"
          className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
        >
          {t('staff.progress.backToProgress')}
        </a>
      </div>
    </main>
  );
}

import { useState } from 'react';
import { BarChart, DataTable, LineChart } from '@sta/ui';
import { historyTimeline, londonDateString, scoreTrend, weeklyActivity } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useClock, useT } from '../../app/hooks';
import { formatLondonDate, formatLondonDateTime } from '../../demo/format';
import { badgeDefinitionFor, type RewardsData } from './rewardsQueries';
import { focusLink } from './styles';

const selectClass = `min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-[var(--color-text)] ${focusLink}`;

/** S8 History tab: a timeline you can filter, with the weekly and score charts and their tables. */
export function ProgressHistory({ data }: { data: RewardsData }) {
  const t = useT();
  const now = useClock().now();
  const [year, setYear] = useState('');
  const [moduleId, setModuleId] = useState('');
  const titleOf = (id: string | undefined): string => data.modules.find((m) => m.id === id)?.title ?? '';
  const badgeRows = data.badges;
  const all = historyTimeline(data.events, data.attempts, badgeRows, {});
  const years = [...new Set(all.map((i) => londonDateString(new Date(i.at)).slice(0, 4)))].sort().reverse();
  const moduleIds = [...new Set(all.flatMap((i) => (i.moduleId ? [i.moduleId] : [])))].filter((id) => titleOf(id));
  const items = historyTimeline(data.events, data.attempts, badgeRows, {
    ...(year ? { year: Number(year) } : {}),
    ...(moduleId ? { moduleId } : {}),
  });
  const weeks = weeklyActivity(data.events, now, 12);
  const scores = scoreTrend(data.attempts);

  const describe = (i: (typeof items)[number]): string => {
    if (i.kind === 'lesson') return t('staff.progress.timelineLesson', { module: titleOf(i.moduleId) });
    if (i.kind === 'attempt') {
      return t('staff.progress.timelineAttempt', {
        module: titleOf(i.moduleId),
        score: i.score ?? 0,
        result: i.passed ? t('staff.progress.resultPassed') : t('staff.progress.resultNotPassed'),
      });
    }
    const def = badgeDefinitionFor(i.badgeId);
    const name = def ? t(def.nameKey as MessageKey) : '';
    const text = t('staff.progress.timelineBadge', { name });
    return i.moduleId && titleOf(i.moduleId) ? `${text}: ${titleOf(i.moduleId)}` : text;
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="history-title">
        <h2 id="history-title" className="mt-0 text-xl font-bold">
          {t('staff.progress.timelineTitle')}
        </h2>
        <div className="mb-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 font-semibold">
            {t('staff.progress.year')}
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
              }}
              className={selectClass}
            >
              <option value="">{t('staff.progress.allYears')}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 font-semibold">
            {t('staff.progress.module')}
            <select
              value={moduleId}
              onChange={(e) => {
                setModuleId(e.target.value);
              }}
              className={selectClass}
            >
              <option value="">{t('staff.progress.allModules')}</option>
              {moduleIds.map((id) => (
                <option key={id} value={id}>
                  {titleOf(id)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {items.length === 0 ? (
          <p>{t('staff.progress.noHistory')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((i, n) => (
              <li
                key={`${i.kind}-${i.at}-${n}`}
                data-testid="timeline-item"
                data-kind={i.kind}
                data-at={i.at}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] py-2"
              >
                <span>{describe(i)}</span>
                <span className="text-sm font-semibold">{formatLondonDateTime(i.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <BarChart
          description={t('staff.progress.weeklyChartDescription')}
          data={weeks.map((w) => ({ label: formatLondonDate(`${w.weekStart}T12:00:00.000Z`), value: w.lessons }))}
          labelHeader={t('staff.progress.weekStarting')}
          valueHeader={t('staff.progress.lessons')}
          tableCaption={t('staff.progress.weeklyChartTable')}
          showTableLabel={t('staff.progress.showTable')}
          hideTableLabel={t('staff.progress.hideTable')}
        />
        <DataTable
          caption={t('staff.progress.weeklyActivity')}
          rowHeader
          columns={[
            { key: 'week', header: t('staff.progress.weekStarting') },
            { key: 'lessons', header: t('staff.progress.lessons') },
            { key: 'attempts', header: t('staff.progress.quizzes') },
          ]}
          rows={weeks.map((w) => ({
            id: w.weekStart,
            cells: {
              week: formatLondonDate(`${w.weekStart}T12:00:00.000Z`),
              lessons: String(w.lessons),
              attempts: String(w.attempts),
            },
          }))}
        />
      </section>
      <section className="flex flex-col gap-3">
        {scores.length === 0 ? (
          <p>{t('staff.progress.noScores')}</p>
        ) : (
          <>
            <LineChart
              description={t('staff.progress.scoreChartDescription')}
              data={scores.map((s) => ({ label: formatLondonDate(s.at), value: s.score }))}
              labelHeader={t('staff.progress.dateCol')}
              valueHeader={t('staff.progress.scoreCol')}
              tableCaption={t('staff.progress.scoreChartTable')}
              showTableLabel={t('staff.progress.showTable')}
              hideTableLabel={t('staff.progress.hideTable')}
            />
            <DataTable
              caption={t('staff.progress.scoreTrend')}
              rowHeader
              columns={[
                { key: 'date', header: t('staff.progress.dateCol') },
                { key: 'module', header: t('staff.progress.module') },
                { key: 'score', header: t('staff.progress.scoreCol') },
              ]}
              rows={scores.map((s) => ({
                id: s.attemptId,
                cells: { date: formatLondonDate(s.at), module: titleOf(s.moduleId), score: `${s.score}%` },
              }))}
            />
          </>
        )}
      </section>
      <a
        href="#/staff/progress/record"
        className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
      >
        {t('staff.progress.downloadRecord')}
      </a>
    </div>
  );
}

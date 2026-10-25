import { useState } from 'react';
import { Badge, DataTable, PageHeader, StatusBadge } from '@sta/ui';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from './styles';
import { useStaffData } from './queries';

type Tab = 'compliance' | 'completed';

/** S8. History, trend and XP tabs arrive with later milestones. */
export function Progress() {
  const t = useT();
  const q = useStaffData();
  const [tab, setTab] = useState<Tab>('compliance');
  if (q.isError) return <p role="alert">{t('staff.progress.loadError')}</p>;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'compliance', label: t('staff.progress.myCompliance') },
    { id: 'completed', label: t('staff.progress.completed') },
  ];
  const data = q.data;
  return (
    <>
      <PageHeader title={t('staff.progress.title')} />
      <div role="tablist" aria-label={t('staff.progress.tabs')} className="mb-4 flex gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`progress-tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls="progress-panel"
            onClick={() => {
              setTab(x.id);
            }}
            className={`min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-4 font-semibold aria-selected:bg-[var(--color-surface)] aria-selected:underline ${focusLink}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="progress-panel" aria-labelledby={`progress-tab-${tab}`}>
        {!data ? <p>{t('shell.loading')}</p> : null}
        {data && tab === 'compliance' ? (
          data.summary.rows.length === 0 ? (
            <p>{t('staff.progress.noRows')}</p>
          ) : (
            <DataTable
              caption={t('staff.progress.myCompliance')}
              rowHeader
              columns={[
                { key: 'name', header: t('staff.progress.requirement') },
                { key: 'status', header: t('staff.progress.status') },
                { key: 'last', header: t('staff.progress.lastDone') },
                { key: 'next', header: t('staff.progress.nextRenewal') },
                { key: 'cadence', header: t('staff.progress.cadence') },
                { key: 'action', header: t('staff.progress.action') },
              ]}
              rows={data.summary.rows.map((r) => ({
                id: r.requirement.id,
                cells: {
                  name: r.requirement.name,
                  status: <StatusBadge status={r.status} label={t(`staff.progress.statusWord.${r.status}`)} />,
                  last: r.lastDoneAt ? formatLondonDate(r.lastDoneAt) : t('staff.progress.never'),
                  next: r.nextRenewalAt ? formatLondonDate(r.nextRenewalAt) : t('staff.progress.none'),
                  cadence:
                    r.cadenceMonths !== undefined
                      ? t('staff.progress.everyMonths', { count: r.cadenceMonths })
                      : t('staff.progress.none'),
                  action: r.moduleId ? (
                    <a
                      href={`#/staff/module/${r.moduleId}`}
                      aria-label={`${t('staff.progress.startTraining')}: ${r.requirement.name}`}
                      className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
                    >
                      {t('staff.progress.startTraining')}
                    </a>
                  ) : null,
                },
              }))}
            />
          )
        ) : null}
        {data && tab === 'completed' ? (
          data.evidence.length === 0 ? (
            <p>{t('staff.progress.noCompleted')}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data.evidence
                .slice()
                .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
                .map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {data.summary.rows.find((r) => r.requirement.id === e.requirementId)?.requirement.name ??
                        data.modules.find((m) => m.id === e.moduleId)?.title ??
                        ''}
                    </span>
                    <Badge>{`${t('staff.progress.completedOn')} ${formatLondonDate(e.completedAt)}`}</Badge>
                  </li>
                ))}
            </ul>
          )
        ) : null}
      </div>
    </>
  );
}

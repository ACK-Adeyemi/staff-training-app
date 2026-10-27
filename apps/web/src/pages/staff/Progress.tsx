import { useState } from 'react';
import type { MessageKey } from '@sta/content';
import { Badge, DataTable, PageHeader, StatusBadge } from '@sta/ui';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from './styles';
import { useStaffData } from './queries';
import { ProgressHistory } from './ProgressHistory';
import { ProgressXp } from './ProgressXp';
import { useRewards } from './rewardsQueries';

type Tab = 'compliance' | 'completed' | 'history' | 'xp';

/** S8. */
export function Progress() {
  const t = useT();
  const q = useStaffData();
  const rewards = useRewards();
  const [tab, setTab] = useState<Tab>('compliance');
  if (q.isError) return <p role="alert">{t('staff.progress.loadError')}</p>;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'compliance', label: t('staff.progress.myCompliance') },
    { id: 'completed', label: t('staff.progress.completed') },
    { id: 'history', label: t('staff.progress.history') },
    { id: 'xp', label: t('staff.progress.xpAndLevel') },
  ];
  const data = q.data;
  return (
    <>
      <PageHeader title={t('staff.progress.title')} />
      <a
        href="#/staff/calendar"
        className={`mb-4 inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
      >
        {t('calendar.title')}
      </a>
      <div role="tablist" aria-label={t('staff.progress.tabs')} className="mb-4 flex flex-wrap gap-2">
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
        {data && tab === 'history' ? (
          rewards.data ? (
            <ProgressHistory data={rewards.data} />
          ) : (
            <p>{t('shell.loading')}</p>
          )
        ) : null}
        {data && tab === 'xp' ? rewards.data ? <ProgressXp data={rewards.data} /> : <p>{t('shell.loading')}</p> : null}
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
              rows={data.summary.rows.map((r) => {
                const open = data.submissions.find(
                  (s) =>
                    s.requirementId === r.requirement.id &&
                    (s.status === 'awaitingCheck' || s.status === 'needsBetterCopy' || s.status === 'rejected'),
                );
                const uploadHref = `#/staff/progress/upload/${r.requirement.id}`;
                const courseUrl = r.requirement.acceptedProviders.find((p) => p.courseUrl)?.courseUrl;
                const linkClass = `inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`;
                return {
                  id: r.requirement.id,
                  cells: {
                    name: r.requirement.name,
                    status: (
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={r.status} label={t(`staff.progress.statusWord.${r.status}`)} />
                        {open?.status === 'awaitingCheck' && r.status !== 'awaitingCheck' ? (
                          <StatusBadge status="awaitingCheck" label={t('staff.progress.statusWord.awaitingCheck')} />
                        ) : null}
                        {open && open.status !== 'awaitingCheck' ? (
                          <>
                            <Badge>
                              {open.status === 'rejected'
                                ? t('evidenceFlow.rejected')
                                : t('evidenceFlow.needsBetterCopy')}
                            </Badge>
                            {open.status === 'rejected' && open.rejectionReason ? (
                              <span>{t(`evidenceFlow.reasons.${open.rejectionReason}` as MessageKey)}</span>
                            ) : null}
                            {open.decisionNote ? <span>{open.decisionNote}</span> : null}
                          </>
                        ) : null}
                      </div>
                    ),
                    last: r.lastDoneAt ? formatLondonDate(r.lastDoneAt) : t('staff.progress.never'),
                    next: r.nextRenewalAt ? formatLondonDate(r.nextRenewalAt) : t('staff.progress.none'),
                    cadence:
                      r.cadenceMonths !== undefined
                        ? t('staff.progress.everyMonths', { count: r.cadenceMonths })
                        : t('staff.progress.none'),
                    action: (
                      <div className="flex flex-col items-start">
                        {r.moduleId ? (
                          <a
                            href={`#/staff/module/${r.moduleId}`}
                            aria-label={`${t('staff.progress.startTraining')}: ${r.requirement.name}`}
                            className={linkClass}
                          >
                            {t('staff.progress.startTraining')}
                          </a>
                        ) : null}
                        {r.requirement.acceptsExternal && open?.status !== 'awaitingCheck' ? (
                          <a
                            href={uploadHref}
                            aria-label={t(open ? 'evidenceFlow.resubmitLink' : 'evidenceFlow.uploadLink', {
                              requirement: r.requirement.name,
                            })}
                            className={linkClass}
                          >
                            {t(open ? 'evidenceFlow.resubmit' : 'evidenceFlow.uploadTitle')}
                          </a>
                        ) : null}
                        {courseUrl ? (
                          <a
                            href={courseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('evidenceFlow.goToCourse', { requirement: r.requirement.name })}
                            className={linkClass}
                          >
                            {t('evidenceFlow.goToCourseShort')}
                          </a>
                        ) : null}
                      </div>
                    ),
                  },
                };
              })}
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

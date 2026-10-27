import { DataTable, PageHeader } from '@sta/ui';
import { isWaitingTooLong, londonWorkingDaysBetween } from '@sta/domain';
import { useT } from '../../app/hooks';
import { useSiteScope } from '../../app/siteScope';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { useEvidenceQueue } from './evidenceQueries';
import { PermissionGate } from './PermissionGate';
import { fullName } from './queries';

function Queue() {
  const t = useT();
  const site = useSiteScope();
  const q = useEvidenceQueue(site);
  if (q.isError) return <p role="alert">{t('evidenceFlow.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const { queue, people, requirements, now } = q.data;
  if (queue.length === 0) return <p>{t('evidenceFlow.empty')}</p>;
  return (
    <DataTable
      caption={t('evidenceFlow.queueTitle')}
      columns={[
        { key: 'person', header: t('evidenceFlow.colPerson') },
        { key: 'requirement', header: t('evidenceFlow.colRequirement') },
        { key: 'sent', header: t('evidenceFlow.colSent') },
        { key: 'waiting', header: t('evidenceFlow.colWaiting') },
      ]}
      rows={queue.map((s) => {
        const person = people.find((p) => p.id === s.personId);
        const days = londonWorkingDaysBetween(new Date(s.createdAt), now);
        return {
          id: s.id,
          cells: {
            person: (
              <a
                href={`#/client/evidence/${s.id}`}
                className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
              >
                {person ? fullName(person) : t('evidenceFlow.someone')}
              </a>
            ),
            requirement: requirements.find((r) => r.id === s.requirementId)?.name ?? '',
            sent: formatLondonDate(s.createdAt),
            waiting: (
              <>
                <span>
                  {days === 0
                    ? t('evidenceFlow.waitingToday')
                    : days === 1
                      ? t('evidenceFlow.waitingOne')
                      : t('evidenceFlow.waitingDays', { count: days })}
                </span>
                {isWaitingTooLong(s.createdAt, now) ? (
                  <strong className="block">{t('evidenceFlow.tooLong')}</strong>
                ) : null}
              </>
            ),
          },
        };
      })}
    />
  );
}

/** C27, the queue: certificates from outside courses that wait for a check. Needs evidence.view. */
export function Evidence() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('evidenceFlow.queueTitle')} />
      <PermissionGate permission="evidence.view" message="errors.forbidden" anyScope>
        <Queue />
      </PermissionGate>
    </>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { holdsAnywhere, type AppFeedback as AppFeedbackItem } from '@sta/domain';
import { PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { fieldClass } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';

const STATUSES: AppFeedbackItem['status'][] = ['new', 'triaged', 'planned', 'done', 'wontDo'];
const ALL = 'all';

function List() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [status, setStatus] = useState(ALL);
  const q = useQuery({
    queryKey: ['appFeedback', actor.userId],
    queryFn: () => store.appFeedback.providerList(actor),
  });
  if (q.isError) return <p role="alert">{t('provider.feedback.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const shown = q.data
    .filter((f) => status === ALL || f.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return (
    <>
      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor="app-feedback-status" className="font-semibold">
          {t('provider.feedback.status')}
        </label>
        <select
          id="app-feedback-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
          }}
          className={`${fieldClass} self-start`}
        >
          <option value={ALL}>{t('provider.feedback.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`provider.feedback.appStatus.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? <p>{t('provider.feedback.none')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((f) => (
          <li
            key={f.id}
            data-testid="app-feedback-item"
            data-feedback-id={f.id}
            className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p className="mt-0 mb-1 font-bold">{t(`feedback.app.${f.kind}`)}</p>
            {f.rating !== undefined ? <p className="my-1">{t('feedback.ratingOf', { rating: f.rating })}</p> : null}
            <p className="my-1">{f.text}</p>
            <p className="my-1">{`${t('feedback.statusLabel')}: ${t(`provider.feedback.appStatus.${f.status}`)}`}</p>
            {f.context['screen'] ? (
              <p className="mb-0">{t('provider.feedback.screen', { screen: f.context['screen'] })}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/** P10 (minimal in M3): app feedback from staff and managers, read only. Triage and ticket conversion are M4. */
export function AppFeedback() {
  const t = useT();
  const perms = usePermissions();
  return (
    <>
      <PageHeader title={t('provider.feedback.appTitle')} />
      <p className="mt-0">{t('provider.feedback.appIntro')}</p>
      {!perms.data ? (
        <p>{t('shell.loading')}</p>
      ) : holdsAnywhere(perms.data, 'feedback.read') ? (
        <List />
      ) : (
        <p role="alert">{t('provider.feedback.noPermission')}</p>
      )}
    </>
  );
}

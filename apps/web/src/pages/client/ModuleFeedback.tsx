import { useState } from 'react';
import { feedbackTags } from '@sta/content';
import { PageHeader } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useT } from '../../app/hooks';
import { FeedbackItemCard } from './FeedbackItemCard';
import { FEEDBACK_STATUSES, fieldClass, useFeedbackData } from './feedbackShared';
import { PermissionGate } from './PermissionGate';
import { fullName, usePermissions } from './queries';

const ALL = 'all';

function Inbox() {
  const t = useT();
  const q = useFeedbackData();
  const perms = usePermissions();
  const [moduleId, setModuleId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [tag, setTag] = useState(ALL);
  if (q.isError) return <p role="alert">{t('feedback.inbox.loadError')}</p>;
  if (!q.data || !perms.data) return <p>{t('shell.loading')}</p>;
  const { items, people, modules } = q.data;
  const names = new Map(people.map((p) => [p.id, fullName(p)]));
  const moduleOf = new Map(modules.map((m) => [m.id, m]));
  const withFeedback = [...new Set(items.map((f) => f.moduleId))]
    .map((id) => ({ id, title: moduleOf.get(id)?.title ?? id }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const shown = items.filter(
    (f) =>
      (moduleId === ALL || f.moduleId === moduleId) &&
      (status === ALL || f.status === status) &&
      (tag === ALL || f.tags.includes(tag)),
  );
  const select = (id: string, label: string, value: string, set: (v: string) => void, options: [string, string][]) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
        className={`${fieldClass} max-w-full`}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <>
      <div role="group" aria-label={t('feedback.inbox.filters')} className="mb-4 flex flex-wrap gap-4">
        {select('fb-module', t('feedback.inbox.module'), moduleId, setModuleId, [
          [ALL, t('feedback.inbox.allModules')],
          ...withFeedback.map((m): [string, string] => [m.id, m.title]),
        ])}
        {select('fb-status', t('feedback.inbox.status'), status, setStatus, [
          [ALL, t('feedback.inbox.allStatuses')],
          ...FEEDBACK_STATUSES.map((s): [string, string] => [s.id, t(s.key)]),
        ])}
        {select('fb-tag', t('feedback.inbox.tag'), tag, setTag, [
          [ALL, t('feedback.inbox.allTags')],
          ...feedbackTags.map((x): [string, string] => [x.id, t(x.labelKey as MessageKey)]),
        ])}
      </div>
      <p data-testid="feedback-count" className="font-semibold">
        {shown.length === 1 ? t('feedback.inbox.countOne') : t('feedback.inbox.count', { count: shown.length })}
      </p>
      {shown.length === 0 ? <p>{t('feedback.empty')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((item) => (
          <FeedbackItemCard
            key={item.id}
            item={item}
            module={moduleOf.get(item.moduleId)}
            personName={item.personId ? names.get(item.personId) : undefined}
            perms={perms.data}
            showModule
          />
        ))}
      </ul>
    </>
  );
}

/** C29: every piece of module feedback the manager may read, with filters. App feedback is never shown here. */
export function ModuleFeedback() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('feedback.inbox.title')} />
      <PermissionGate permission="moduleFeedback.view" anyScope message="feedback.inbox.noPermission">
        <Inbox />
      </PermissionGate>
    </>
  );
}

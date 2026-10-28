import { feedbackSummary, type EffectivePermission, type Person } from '@sta/domain';
import { useT } from '../../app/hooks';
import { FeedbackItemCard } from './FeedbackItemCard';
import { tagKey, useFeedbackData } from './feedbackShared';
import { fullName } from './queries';

/** The "Feedback" region of the module results page (C8): summary, tag counts and every item for this module. */
export function FeedbackRegion({
  moduleId,
  perms,
  people,
}: {
  moduleId: string;
  perms: EffectivePermission[];
  people: Person[];
}) {
  const t = useT();
  const q = useFeedbackData(moduleId);
  const label = (id: string): string => {
    const key = tagKey(id);
    return key ? t(key) : id;
  };
  const names = new Map(people.map((p) => [p.id, fullName(p)]));
  if (!q.data && !q.isError) return null;
  const items = q.data?.items ?? [];
  const summary = feedbackSummary(items);
  const module = q.data?.modules.find((m) => m.id === moduleId);
  const tags = Object.entries(summary.tagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return (
    <section aria-labelledby="stats-feedback" className="mb-6">
      <h2 id="stats-feedback" className="mt-0 mb-3 text-lg font-bold">
        {t('stats.feedback')}
      </h2>
      {q.isError ? <p role="alert">{t('feedback.inbox.loadError')}</p> : null}
      {q.data ? (
        <>
          <p data-testid="feedback-average" className="mt-0 font-semibold">
            {summary.averageRating === null
              ? t('feedback.noRatings')
              : t('feedback.averageRating', { rating: summary.averageRating })}
          </p>
          {tags.length > 0 ? (
            <ul className="m-0 mb-4 flex list-none flex-wrap gap-2 p-0">
              {tags.map(([id, count]) => (
                <li
                  key={id}
                  data-testid="tag-count"
                  data-tag={id}
                  className="rounded-full border-2 border-[var(--color-border)] px-3 py-1"
                >
                  {t('feedback.tagCount', { tag: label(id), count })}
                </li>
              ))}
            </ul>
          ) : null}
          {items.length === 0 ? <p>{t('feedback.empty')}</p> : null}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {items.map((item) => (
              <FeedbackItemCard
                key={item.id}
                item={item}
                module={module}
                personName={item.personId ? names.get(item.personId) : undefined}
                perms={perms}
                showModule={false}
              />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { holdsAnywhere, type ProviderFeedbackItem } from '@sta/domain';
import { feedbackTags, type MessageKey } from '@sta/content';
import { PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { statusKey } from '../client/feedbackShared';
import { usePermissions } from '../client/queries';
import { focusLink } from '../staff/styles';

function Item({ item }: { item: ProviderFeedbackItem }) {
  const t = useT();
  const tags = item.tags.map((id) => {
    const key = feedbackTags.find((x) => x.id === id)?.labelKey;
    return key ? t(key as MessageKey) : id;
  });
  return (
    <li
      data-testid="provider-feedback-item"
      className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3"
    >
      <p className="mt-0 mb-1 font-semibold">{t(`feedback.kind.${item.kind}`)}</p>
      {item.lessonId ? <p className="my-1">{t('provider.feedback.lessonKey', { key: item.lessonId })}</p> : null}
      {item.questionId ? <p className="my-1">{t('provider.feedback.questionKey', { key: item.questionId })}</p> : null}
      {item.rating !== undefined ? <p className="my-1">{t('feedback.ratingOf', { rating: item.rating })}</p> : null}
      {item.thumb ? (
        <p className="my-1">{item.thumb === 'up' ? t('feedback.thumbUp') : t('feedback.thumbDown')}</p>
      ) : null}
      {tags.length > 0 ? <p className="my-1">{tags.join(', ')}</p> : null}
      {item.text ? <p className="my-1">{item.text}</p> : null}
      <p className="mb-0">{`${t('feedback.statusLabel')}: ${t(statusKey(item.status))}`}</p>
    </li>
  );
}

function FeedbackRegions() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const q = useQuery({
    queryKey: ['providerFeedback', actor.userId],
    queryFn: () => store.moduleFeedback.providerView(actor),
  });
  if (q.isError) return <p role="alert">{t('provider.feedback.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const noun = (n: number, one: MessageKey, many: MessageKey) => (n === 1 ? t(one) : t(many, { count: n }));
  return (
    <>
      <section aria-labelledby="pf-modules" className="mb-6">
        <h2 id="pf-modules" className="text-lg font-bold">
          {t('provider.feedback.moduleRegion')}
        </h2>
        {q.data.modules.length === 0 ? <p>{t('provider.feedback.none')}</p> : null}
        <div className="flex flex-col gap-4">
          {q.data.modules.map((m) => (
            <div key={m.moduleId} data-testid="provider-feedback-module" data-module-id={m.moduleId}>
              <h3 className="mt-0 mb-1 text-base font-bold">{m.title}</h3>
              <p className="mt-0 mb-2">
                {noun(m.itemCount, 'provider.feedback.itemCountOne', 'provider.feedback.itemCount')}
                {m.averageRating === null ? '' : `. ${t('feedback.averageRating', { rating: m.averageRating })}`}
              </p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {m.items.map((item) => (
                  <Item key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="pf-own" className="mb-6">
        <h2 id="pf-own" className="text-lg font-bold">
          {t('provider.feedback.ownRegion')}
        </h2>
        <p className="mt-0">{t('provider.feedback.ownNote')}</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {q.data.ownModules.map((o) => (
            <li key={o.clientId} data-testid="own-module-counts">
              {t('provider.feedback.ownCounts', {
                modules: noun(o.moduleCount, 'provider.feedback.moduleCountOne', 'provider.feedback.moduleCount'),
                items: noun(o.itemCount, 'provider.feedback.itemCountOne', 'provider.feedback.itemCount'),
              })}
            </li>
          ))}
        </ul>
      </section>
      <p>
        <a
          href="#/provider/feedback"
          className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
        >
          {t('provider.feedback.appLink')}
        </a>
      </p>
    </>
  );
}

function LinksPanel() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const qc = useQueryClient();
  const counts = useQuery({
    queryKey: ['learnMoreCounts', actor.userId],
    queryFn: () => store.learnMore.counts(actor),
  });
  const run = useMutation({
    mutationFn: () => store.linkCheck.run(actor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['learnMoreCounts', actor.userId] }),
  });
  const result = run.data;
  return (
    <section aria-labelledby="pl-links" className="mb-6">
      <h2 id="pl-links" className="text-lg font-bold">
        {t('provider.links.region')}
      </h2>
      <p className="mt-0">{t('provider.links.simulated')}</p>
      <button
        type="button"
        onClick={() => {
          run.mutate();
        }}
        disabled={run.isPending}
        className="min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {run.isPending ? t('provider.links.checking') : t('provider.links.check')}
      </button>
      {run.isError ? <p role="alert">{t('provider.links.loadError')}</p> : null}
      {result ? (
        <div aria-live="polite">
          <p>{t('provider.links.result', { checked: result.results.length, broken: result.broken.length })}</p>
          {result.broken.length === 0 ? (
            <p>{t('provider.links.noneBroken')}</p>
          ) : (
            <>
              <h3 className="text-base font-bold">{t('provider.links.brokenHeading')}</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {result.broken.map((b) => (
                  <li
                    key={b.linkId}
                    data-testid="broken-link"
                    data-link-id={b.linkId}
                    className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3 break-all"
                  >
                    {b.url}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
      <h3 className="text-base font-bold">{t('provider.links.opensHeading')}</h3>
      {counts.isError ? <p role="alert">{t('provider.links.loadError')}</p> : null}
      {!counts.data && !counts.isError ? <p>{t('shell.loading')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(counts.data ?? []).map((c) => (
          <li key={c.linkId} data-testid="link-open-count" data-link-id={c.linkId} data-opens={c.opens}>
            <span className="break-all">{c.linkId}</span>
            {': '}
            {t('provider.links.opens', { count: c.opens })}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** P5 (minimal in M3): the Content page plus module feedback on provider modules. The rest of P5 is M4. */
export function ProviderContent() {
  const t = useT();
  const perms = usePermissions();
  return (
    <>
      <PageHeader title={t('nav.provider.content')} />
      <p className="mt-0">{t('placeholder.provider.content')}</p>
      {!perms.data ? (
        <p>{t('shell.loading')}</p>
      ) : holdsAnywhere(perms.data, 'feedback.read') ? (
        <FeedbackRegions />
      ) : (
        <p role="alert">{t('provider.feedback.noPermission')}</p>
      )}
      {!perms.data ? null : holdsAnywhere(perms.data, 'content.write') ? (
        <LinksPanel />
      ) : (
        <p role="alert">{t('provider.links.noPermission')}</p>
      )}
    </>
  );
}

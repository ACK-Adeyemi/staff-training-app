// P21 Global content (M4 chunk 16, brief 13.3, 16.3, 19.2, 19.4). Seasonal themes, global FAQs, badges and levels are
// read from the content package; the prize suggestion list is the one thing the provider edits here (content.write).
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RuleError, ValidationError } from '@sta/data';
import { badgeDefinitions, faqs, levelConfig, themePresets, type MessageKey } from '@sta/content';
import { holdsAnywhere } from '@sta/domain';
import { Button, PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { inputClass } from '../client/foundationsErrors';
import { usePermissions } from '../client/queries';

const box = 'mb-6 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const list = 'm-0 list-none p-0';
const row = 'border-b border-[var(--color-border)] py-2 last:border-b-0';

function Region({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={box}>
      <h2 id={id} className="mt-0 mb-2 text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function GlobalContent() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const canRead = perms.data ? holdsAnywhere(perms.data, 'content.read') : false;
  const canWrite = perms.data ? holdsAnywhere(perms.data, 'content.write') : false;
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ kind: 'status' | 'alert'; message: string } | null>(null);

  const data = useQuery({
    queryKey: ['providerGlobalContent', actor.userId],
    enabled: canRead,
    queryFn: () => store.globalContent.get(actor),
  });

  const save = useMutation({
    mutationFn: async (change: { add: string } | { remove: string }) =>
      'add' in change
        ? store.globalContent.addPrizeSuggestion(actor, change.add)
        : store.globalContent.removePrizeSuggestion(actor, change.remove),
    onSuccess: async (_result, change) => {
      if ('add' in change) setText('');
      setNote({
        kind: 'status',
        message: t('add' in change ? 'provider.global.prizeAdded' : 'provider.global.prizeRemoved'),
      });
      await queryClient.invalidateQueries({ queryKey: ['providerGlobalContent'] });
    },
    onError: (e) => {
      setNote({
        kind: 'alert',
        message: t(
          e instanceof RuleError && e.rule === 'duplicate'
            ? 'provider.global.prizeDuplicate'
            : e instanceof ValidationError
              ? 'provider.global.prizeInvalid'
              : 'provider.global.loadError',
        ),
      });
    },
  });

  const heading = <PageHeader title={t('provider.global.heading')} />;
  // The heading waits for the data, so the regions are there as soon as the page title is.
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (!canRead)
    return (
      <>
        {heading}
        <p role="status">{t('provider.global.noAccess')}</p>
      </>
    );
  if (data.isError)
    return (
      <>
        {heading}
        <p role="alert">{t('provider.global.loadError')}</p>
      </>
    );
  if (!data.data) return <p>{t('shell.loading')}</p>;

  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    setNote(null);
    save.mutate({ add: text });
  };
  const key = (k: string) => k as MessageKey;

  return (
    <>
      {heading}
      {canWrite ? null : <p className="mb-4 font-semibold">{t('provider.global.readOnly')}</p>}
      <Region id="p21-themes" title={t('provider.global.themes')}>
        <ul className={list}>
          {themePresets.map((p) => (
            <li key={p.id} data-testid="theme-preset" data-theme-id={p.id} className={row}>
              {t(key(p.nameKey))}
            </li>
          ))}
        </ul>
      </Region>
      <Region id="p21-prizes" title={t('provider.global.prizes')}>
        <p className="mt-0">{t('provider.global.prizeDisclaimer')}</p>
        <ul className={list}>
          {data.data.prizeSuggestions.map((p) => (
            <li key={p} className={`${row} flex flex-wrap items-center gap-2`}>
              <span data-testid="prize-suggestion">{p}</span>
              {canWrite ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNote(null);
                    save.mutate({ remove: p });
                  }}
                >
                  {t('provider.global.removePrize', { text: p })}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
            <label htmlFor="p21-new" className="font-semibold">
              {t('provider.global.newPrize')}
            </label>
            <input
              id="p21-new"
              type="text"
              className={inputClass}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
            />
            <div>
              <Button type="submit">{t('provider.global.addPrize')}</Button>
            </div>
          </form>
        ) : null}
        {note ? (
          <p role={note.kind} className="mt-2 mb-0">
            {note.message}
          </p>
        ) : null}
      </Region>
      <Region id="p21-faqs" title={t('provider.global.faqs')}>
        <ul className={list}>
          {faqs.map((f) => (
            <li key={f.id} data-testid="global-faq" data-faq-id={f.id} className={row}>
              {t(key(f.questionKey))}
            </li>
          ))}
        </ul>
      </Region>
      <Region id="p21-badges" title={t('provider.global.badges')}>
        <ul className={list}>
          {badgeDefinitions.map((b) => (
            <li key={b.id} data-testid="badge-definition" data-badge-id={b.id} className={row}>
              {t(key(b.nameKey))}
            </li>
          ))}
        </ul>
      </Region>
      <Region id="p21-levels" title={t('provider.global.levels')}>
        <ul className={list}>
          {levelConfig.thresholds.map((xp, i) => (
            <li key={xp} data-testid="level-definition" className={row}>
              {t('provider.global.level', { level: i + 1 })}: {t('provider.global.levelFrom', { xp })}
            </li>
          ))}
        </ul>
      </Region>
    </>
  );
}

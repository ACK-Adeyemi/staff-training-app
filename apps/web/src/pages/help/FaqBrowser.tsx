// The FAQ list: search, categories, open-and-read answers and "Was this helpful?" (brief 19.2; S14, C23, S15 step 1).
import { useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { faqs, type Faq, type MessageKey } from '@sta/content';
import { Button } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { EnglishOnly } from '../../app/EnglishOnly';
import { inputClass } from '../client/foundationsErrors';
import type { HelpSide } from './shared';

/** Search matches the question and the answer, ignoring case. */
export function useFaqSearch(audience: HelpSide, query: string, category: string | null) {
  const t = useT();
  const list = useMemo(() => faqs.filter((f) => f.audience === audience), [audience]);
  const needle = query.trim().toLowerCase();
  const shown = list.filter(
    (f) =>
      (category === null || f.categoryKey === category) &&
      (needle === '' ||
        t(f.questionKey as MessageKey)
          .toLowerCase()
          .includes(needle) ||
        t(f.answerKey as MessageKey)
          .toLowerCase()
          .includes(needle)),
  );
  return { list, shown };
}

function Answer({
  faq,
  vote,
}: {
  faq: Faq;
  vote?: { current: boolean | undefined; onVote: (helpful: boolean) => void };
}) {
  const t = useT();
  const press = (helpful: boolean, label: string) => (
    <Button
      variant="secondary"
      aria-pressed={vote?.current === helpful}
      className={vote?.current === helpful ? 'border-[var(--color-accent)] font-bold underline' : undefined}
      onClick={() => {
        vote?.onVote(helpful);
      }}
    >
      {label}
    </Button>
  );
  return (
    <div className="flex flex-col gap-3 border-s-4 border-[var(--color-border)] ps-3">
      <p className="m-0">{t(faq.answerKey as MessageKey)}</p>
      {vote ? (
        <div role="group" aria-label={t('help.helpful')} className="flex flex-wrap items-center gap-3">
          <span aria-hidden="true" className="font-semibold">
            {t('help.helpful')}
          </span>
          {press(true, t('help.yes'))}
          {press(false, t('help.no'))}
        </div>
      ) : null}
    </div>
  );
}

/** One question as a disclosure. */
export function FaqItem({
  faq,
  vote,
}: {
  faq: Faq;
  vote?: { current: boolean | undefined; onVote: (helpful: boolean) => void };
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="flex flex-col gap-2">
      <EnglishOnly className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen(!open);
          }}
          className="flex min-h-[var(--target-min)] w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-start font-semibold text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          <span>{t(faq.questionKey as MessageKey)}</span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
        <div id={id} hidden={!open}>
          {open ? <Answer faq={faq} {...(vote ? { vote } : {})} /> : null}
        </div>
      </EnglishOnly>
    </li>
  );
}

/** S14 and C23: the audience's own FAQs only. */
export function FaqBrowser({ audience }: { audience: HelpSide }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  const [failed, setFailed] = useState(false);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const votes = useQuery({ queryKey: ['faqVotes', actor.userId], queryFn: () => store.faqs.myVotes(actor) });
  const { list, shown } = useFaqSearch(audience, query, category);
  const categories = [...new Set(list.map((f) => f.categoryKey))];
  const saved = (id: string): boolean | undefined => local[id] ?? votes.data?.find((v) => v.faqId === id)?.helpful;

  const onVote = async (faqId: string, helpful: boolean) => {
    setFailed(false);
    try {
      await store.faqs.vote(actor, faqId, helpful);
      setLocal((l) => ({ ...l, [faqId]: helpful }));
      setThanks(true);
    } catch {
      setFailed(true);
    }
  };

  const catButton = (key: string | null, label: string) => (
    <Button
      key={key ?? 'all'}
      variant="secondary"
      aria-pressed={category === key}
      className={category === key ? 'border-[var(--color-accent)] font-bold underline' : undefined}
      onClick={() => {
        setCategory(key);
      }}
    >
      {label}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="font-semibold">
          {t('help.search')}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setThanks(false);
          }}
          className={inputClass}
        />
      </div>
      <div role="group" aria-label={t('help.categories')} className="flex flex-wrap gap-2">
        {catButton(null, t('help.all'))}
        {categories.map((c) => catButton(c, t(c as MessageKey)))}
      </div>
      {shown.length === 0 ? (
        <p className="m-0">{t('help.noResults')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {shown.map((f) => (
            <FaqItem
              key={f.id}
              faq={f}
              vote={{
                current: saved(f.id),
                onVote: (h) => {
                  void onVote(f.id, h);
                },
              }}
            />
          ))}
        </ul>
      )}
      {thanks ? (
        <p role="status" className="m-0 font-semibold">
          {t('help.thanks')}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="m-0">
          {t('tickets.errors.action')}
        </p>
      ) : null}
    </div>
  );
}

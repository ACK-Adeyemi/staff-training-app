import { useId, useState } from 'react';
import { feedbackTags, type MessageKey } from '@sta/content';
import { Button, Card, Dialog, RatingInput, TagPicker } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';

const fieldClass =
  'min-h-[var(--target-min)] w-full rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]';

/** S5: "Was this lesson helpful?" on the last step. One item is stored per visit, however often it is pressed. */
export function LessonThumbs({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [chosen, setChosen] = useState<'up' | 'down' | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const press = async (thumb: 'up' | 'down') => {
    if (chosen !== null || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await store.moduleFeedback.submit(actor, {
        kind: 'lessonThumb',
        moduleId,
        lessonId,
        thumb,
        tags: [],
        anonymous: false,
      });
      setChosen(thumb);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const button = (thumb: 'up' | 'down') => (
    <Button
      variant="secondary"
      aria-pressed={chosen === thumb}
      className={chosen === thumb ? 'border-[var(--color-accent)] font-bold underline' : undefined}
      onClick={() => {
        void press(thumb);
      }}
    >
      {thumb === 'up' ? t('feedback.lesson.up') : t('feedback.lesson.down')}
    </Button>
  );
  return (
    <div role="group" aria-label={t('feedback.lesson.question')} className="my-4 flex flex-col gap-2">
      <span aria-hidden="true" className="font-semibold">
        {t('feedback.lesson.question')}
      </span>
      <div className="flex flex-wrap gap-3">
        {button('up')}
        {button('down')}
      </div>
      {chosen !== null ? (
        <p role="status" className="m-0 font-semibold">
          {t('feedback.lesson.thanks')}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="m-0">
          {t('feedback.lesson.sendError')}
        </p>
      ) : null}
    </div>
  );
}

/** S6: report a mistake in the question on screen. The quiz carries on underneath. */
export function ReportQuestion({ moduleId, questionId }: { moduleId: string; questionId: string }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const textId = useId();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(['mistakeInQuestion']);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setFailed(false);
  };
  const send = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await store.moduleFeedback.submit(actor, {
        kind: 'questionReport',
        moduleId,
        questionId,
        tags,
        ...(text.trim() !== '' ? { text: text.trim() } : {}),
        anonymous: false,
      });
      setOpen(false);
      setSent(true);
      setText('');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="my-3">
      <Button
        variant="quiet"
        onClick={() => {
          setSent(false);
          setOpen(true);
        }}
      >
        {t('feedback.report.open')}
      </Button>
      {sent ? (
        <p role="status" className="mt-1 mb-0 font-semibold">
          {t('feedback.report.thanks')}
        </p>
      ) : null}
      <Dialog open={open} title={t('feedback.report.title')} onClose={close}>
        {open ? (
          <div className="flex flex-col gap-3">
            <TagPicker
              legend={t('feedback.report.kind')}
              options={[{ id: 'mistakeInQuestion', label: t('feedback.tags.mistakeInQuestion') }]}
              value={tags}
              onChange={setTags}
            />
            <label htmlFor={textId} className="font-semibold">
              {t('feedback.report.what')}
            </label>
            <textarea
              id={textId}
              rows={3}
              maxLength={500}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
              className={fieldClass}
            />
            <p className="m-0 text-sm">{t('feedback.app.noNames')}</p>
            {failed ? (
              <p role="alert" className="m-0">
                {t('feedback.report.sendError')}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy}
                onClick={() => {
                  void send();
                }}
              >
                {t('feedback.report.submit')}
              </Button>
              <Button variant="secondary" onClick={close}>
                {t('feedback.report.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/** S7: the end-of-module card. Rating needed, everything else optional. Shown after a pass and after a fail. */
export function ModuleFeedbackCard({ moduleId }: { moduleId: string }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const textId = useId();
  const noteId = useId();
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (rating === null) return;
    setBusy(true);
    setFailed(false);
    try {
      await store.moduleFeedback.submit(actor, {
        kind: 'moduleCard',
        moduleId,
        rating,
        tags,
        ...(text.trim() !== '' ? { text: text.trim() } : {}),
        anonymous,
      });
      setDone(true);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="module-feedback-heading" className="mb-4">
      <Card>
        <h2 id="module-feedback-heading" className="mt-0 mb-3 text-xl font-bold">
          {t('feedback.module.title')}
        </h2>
        {done ? (
          <p role="status" className="m-0 font-semibold">
            {t('feedback.module.thanks')}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <RatingInput
              legend={t('feedback.module.rating')}
              labels={[1, 2, 3, 4, 5].map((n) => t(`feedback.module.ratings.${String(n)}` as MessageKey))}
              value={rating}
              onChange={setRating}
            />
            <TagPicker
              legend={t('feedback.module.tags')}
              options={feedbackTags
                .filter((x) => x.id !== 'mistakeInQuestion')
                .map((x) => ({ id: x.id, label: t(x.labelKey as MessageKey) }))}
              value={tags}
              onChange={setTags}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor={textId} className="font-semibold">
                {t('feedback.module.comment')}
              </label>
              <textarea
                id={textId}
                rows={3}
                maxLength={500}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                }}
                className={fieldClass}
              />
              <p className="m-0 text-sm">{t('feedback.app.noNames')}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]">
                <input
                  type="checkbox"
                  checked={anonymous}
                  aria-describedby={noteId}
                  onChange={(e) => {
                    setAnonymous(e.target.checked);
                  }}
                  className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
                />
                <span>{t('feedback.module.anonymous')}</span>
              </label>
              <p id={noteId} className="m-0 text-sm">
                {t('feedback.module.anonymousNote')}
              </p>
            </div>
            {failed ? (
              <p role="alert" className="m-0">
                {t('feedback.module.sendError')}
              </p>
            ) : null}
            <div>
              <Button
                disabled={rating === null || busy}
                onClick={() => {
                  void send();
                }}
              >
                {t('feedback.module.submit')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

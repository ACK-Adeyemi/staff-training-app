import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@sta/ui';
import {
  can,
  canReplyToFeedback,
  holdsAnywhere,
  type EffectivePermission,
  type Module,
  type ModuleFeedback,
} from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { FEEDBACK_STATUSES, fieldClass, statusKey, tagKey } from './feedbackShared';
import { focusLink } from '../staff/styles';

type Props = {
  item: ModuleFeedback;
  module: Module | undefined;
  /** The person's full name, from the people list. Never used for anonymous items. */
  personName: string | undefined;
  perms: EffectivePermission[];
  showModule: boolean;
};

/** One piece of module feedback for a manager (C8 and C29). Anonymous items show no name and no id. */
export function FeedbackItemCard({ item, module, personName, perms, showModule }: Props) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const ids = useId();
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySent, setReplySent] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState('');
  const [sentNote, setSentNote] = useState(item.escalatedToProvider !== undefined);
  const [failed, setFailed] = useState(false);

  const canRespond =
    actor.clientId !== undefined &&
    can(perms, 'moduleFeedback.respond', { clientId: actor.clientId, siteIds: [item.siteId] }, 'write');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['moduleFeedback'] });
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setFailed(false);
    try {
      await action();
      await refresh();
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  };

  const lessonIndex = module?.lessons.findIndex((l) => l.id === item.lessonId) ?? -1;
  const lesson = lessonIndex >= 0 ? module?.lessons[lessonIndex] : undefined;
  const question = module?.questions.find((q) => q.id === item.questionId);
  const ownModule = module !== undefined && module.owner !== 'provider';
  const editHref =
    ownModule && holdsAnywhere(perms, 'modules.manage') && (lesson !== undefined || item.kind === 'questionReport')
      ? `#/client/modules/${module.id}/edit${lesson ? `?lesson=${String(lessonIndex + 1)}` : ''}`
      : undefined;
  const tags = item.tags.map((id) => {
    const key = tagKey(id);
    return key ? t(key) : id;
  });
  const who =
    item.anonymous || item.personId === undefined
      ? t('feedback.who.anonymous')
      : (personName ?? t('feedback.who.unknown'));
  const statusId = `${ids}-status`;
  const replyId = `${ids}-reply`;
  const noteId = `${ids}-note`;
  const buttonLink = `inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`;

  return (
    <li
      data-testid="feedback-item"
      data-feedback-id={item.id}
      data-kind={item.kind}
      data-lesson-id={item.lessonId}
      data-tags={item.tags.join(' ')}
      className="list-none rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <p className="mt-0 mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold">{who}</span>
        <span>{t(`feedback.kind.${item.kind}`)}</span>
        <span>{formatLondonDate(item.createdAt)}</span>
      </p>
      {showModule && module ? <p className="my-1 font-semibold">{module.title}</p> : null}
      {lesson ? <p className="my-1">{t('feedback.lessonName', { title: lesson.title })}</p> : null}
      {question ? <p className="my-1">{t('feedback.questionName', { prompt: question.prompt })}</p> : null}
      {item.rating !== undefined ? <p className="my-1">{t('feedback.ratingOf', { rating: item.rating })}</p> : null}
      {item.thumb ? (
        <p className="my-1">{item.thumb === 'up' ? t('feedback.thumbUp') : t('feedback.thumbDown')}</p>
      ) : null}
      {tags.length > 0 ? <p className="my-1">{tags.join(', ')}</p> : null}
      {item.text ? <p className="my-2">{item.text}</p> : null}
      {item.reply ? <p className="my-2 font-semibold">{t('feedback.theirReply', { text: item.reply.text })}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canRespond ? (
          <>
            <label htmlFor={statusId} className="font-semibold">
              {t('feedback.statusLabel')}
            </label>
            <select
              id={statusId}
              value={item.status}
              className={`${fieldClass} max-w-full`}
              onChange={(e) => {
                const status = e.target.value as ModuleFeedback['status'];
                void run(() => store.moduleFeedback.setStatus(actor, item.id, status));
              }}
            >
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.key)}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="m-0">{`${t('feedback.statusLabel')}: ${t(statusKey(item.status))}`}</p>
        )}
        {editHref ? (
          <a href={editHref} className={buttonLink}>
            {t('feedback.editModule')}
          </a>
        ) : null}
      </div>

      {!canReplyToFeedback(item) ? <p className="mb-0">{t('feedback.noReplyAnonymous')}</p> : null}
      {canRespond && canReplyToFeedback(item) && !item.reply && !replying ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() => {
              setReplying(true);
            }}
          >
            {t('feedback.reply')}
          </Button>
        </div>
      ) : null}
      {replying && !item.reply ? (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={replyId} className="font-semibold">
            {t('feedback.reply')}
          </label>
          <textarea
            id={replyId}
            rows={3}
            maxLength={500}
            value={replyText}
            placeholder={t('feedback.replyPlaceholder')}
            onChange={(e) => {
              setReplyText(e.target.value);
            }}
            className={`${fieldClass} py-2`}
          />
          <div>
            <Button
              disabled={replyText.trim() === ''}
              onClick={() => {
                void run(() => store.moduleFeedback.reply(actor, item.id, replyText)).then((ok) => {
                  if (ok) {
                    setReplying(false);
                    setReplySent(true);
                  }
                });
              }}
            >
              {t('feedback.sendReply')}
            </Button>
          </div>
        </div>
      ) : null}
      {replySent ? (
        <p role="status" className="mb-0 font-semibold">
          {t('feedback.replySent')}
        </p>
      ) : null}

      {canRespond && module?.owner === 'provider' && !sentNote && !escalating ? (
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() => {
              setEscalating(true);
            }}
          >
            {t('feedback.escalate')}
          </Button>
        </div>
      ) : null}
      {escalating && !sentNote ? (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={noteId} className="font-semibold">
            {t('feedback.escalateNote')}
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            className={`${fieldClass} py-2`}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={note.trim() === ''}
              onClick={() => {
                void run(() => store.moduleFeedback.escalate(actor, item.id, note)).then((ok) => {
                  if (ok) {
                    setEscalating(false);
                    setSentNote(true);
                  }
                });
              }}
            >
              {t('feedback.sendNote')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEscalating(false);
              }}
            >
              {t('feedback.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      {sentNote ? <p className="mb-0 font-semibold">{t('feedback.escalated')}</p> : null}
      {failed ? (
        <p role="alert" className="mb-0">
          {t('feedback.actionError')}
        </p>
      ) : null}
    </li>
  );
}

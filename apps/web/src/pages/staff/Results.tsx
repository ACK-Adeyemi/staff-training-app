import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge, Button, Card, LinkButton, PageHeader } from '@sta/ui';
import { missedQuestionIds, retakesLeft, visibleLearnMore, type LearnMoreLink } from '@sta/domain';
import { RuleError } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { useDisplayPrefs } from '../../app/display/context';
import { celebrate } from '../../app/feedback';
import { LearnMoreGroups } from './LearnMoreList';
import { LearningFrame } from './LearningFrame';
import { useModuleId } from './learningQueries';
import { focusLink } from './styles';

/** Vibration and sound for a pass, once the person's settings have loaded. Draws nothing. */
function CelebrateOnPass() {
  const { prefs, ready } = useDisplayPrefs();
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    celebrate(prefs);
  }, [ready, prefs]);
  return null;
}

/** S7. */
export function Results() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const navigate = useNavigate();
  const moduleId = useModuleId();
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `#/staff/module/${moduleId}`;

  return (
    <LearningFrame>
      {({ module, attempts, events, overlays, client }) => {
        const finished = attempts
          .filter((a) => a.finishedAt !== undefined)
          .sort((a, b) =>
            (a.finishedAt ?? '') < (b.finishedAt ?? '')
              ? -1
              : (a.finishedAt ?? '') > (b.finishedAt ?? '')
                ? 1
                : a.id < b.id
                  ? -1
                  : 1,
          );
        const attempt = finished[finished.length - 1];
        const back = (
          <a href={base} className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}>
            {t('staff.results.backToModule')}
          </a>
        );
        if (!attempt) {
          return (
            <>
              <PageHeader title={module.title} />
              <p>{t('staff.results.noAttempt')}</p>
              {back}
            </>
          );
        }
        const passed = attempt.passed === true;
        const total = attempt.questionIds.length;
        const missed = missedQuestionIds(attempt, events);
        const mayRetake = retakesLeft(module, finished.length);
        const retake = async () => {
          setBusy(true);
          setError(null);
          try {
            await store.learning.startAttempt(actor, module.id);
            await navigate(`/staff/module/${module.id}/quiz`);
          } catch (e) {
            setError(e instanceof RuleError ? (`errors.rule.${e.rule}` as MessageKey) : 'staff.quiz.saveError');
            setBusy(false);
          }
        };
        const opened = (questionId: string) => (l: LearnMoreLink) => {
          void store.learning
            .learnMoreOpened(actor, { moduleId: module.id, questionId, linkId: l.id, attemptId: attempt.id })
            .catch(() => undefined);
        };
        return (
          <>
            {passed ? <CelebrateOnPass /> : null}
            <PageHeader title={passed ? t('staff.results.passed') : t('staff.results.failed')}>
              {module.draftContent ? <Badge>{t('staff.module.draft')}</Badge> : null}
            </PageHeader>
            <Card className="mb-4">
              <p className="m-0 text-sm font-semibold">{t('staff.results.score')}</p>
              <p className="my-1 text-4xl font-bold">{`${attempt.score ?? 0}%`}</p>
              <p className="m-0">
                {t('staff.results.detail', {
                  right: total - missed.length,
                  total,
                  passMark: module.quiz.passMark,
                })}
              </p>
            </Card>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {passed ? (
                <LinkButton href={`${base}/certificate`}>{t('staff.results.viewCertificate')}</LinkButton>
              ) : mayRetake ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void retake();
                  }}
                >
                  {t('staff.results.retake')}
                </Button>
              ) : (
                <p role="status" className="m-0">
                  {t('staff.results.noRetakes')}
                </p>
              )}
              {back}
            </div>
            {error ? <p role="alert">{t(error)}</p> : null}
            {!passed ? <p>{t('staff.results.failedHelp')}</p> : null}
            {missed.length > 0 ? (
              <section aria-labelledby="review-heading">
                <h2 id="review-heading" className="text-xl font-bold">
                  {t('staff.results.review')}
                </h2>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {missed.map((qid) => {
                    const question = module.questions.find((q) => q.id === qid);
                    if (!question) return null;
                    const links = visibleLearnMore({
                      question,
                      overlays,
                      correct: false,
                      settings: module.quiz,
                      phase: 'results',
                      attemptMode: attempt.mode,
                    });
                    return (
                      <li key={qid}>
                        <Card>
                          <p className="mt-0 font-bold">{question.prompt}</p>
                          <p>{question.explanation}</p>
                          {module.quiz.showSourceRef && question.sourceRef ? (
                            <p className="text-sm">{t('staff.quiz.source', { ref: question.sourceRef })}</p>
                          ) : null}
                          <LearnMoreGroups
                            official={links.official}
                            organisation={links.organisation}
                            organisationName={client.displayName}
                            onOpen={opened(qid)}
                          />
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        );
      }}
    </LearningFrame>
  );
}

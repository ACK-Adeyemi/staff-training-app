import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RuleError } from '@sta/data';
import { Badge, Button, ChoiceList, Icon, PageHeader, Stepper } from '@sta/ui';
import {
  answeredQuestionIds,
  closedBookChoiceApplies,
  retakesLeft,
  visibleLearnMore,
  type Attempt,
  type LearnMoreLink,
  type Question,
} from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { ConfirmDialog } from './ConfirmDialog';
import { ReportQuestion } from './FeedbackWidgets';
import { NotesPanel } from './Notes';
import { ReadAloud } from './ReadAloud';
import { LearnMoreGroups } from './LearnMoreList';
import { LearningFrame } from './LearningFrame';
import { useModuleId, type LearningData } from './learningQueries';
import { focusLink } from './styles';

type Step = NonNullable<Question['scenario']>['steps'][number];
type Choice = Step['choices'][number];

type Feedback = {
  correct: boolean;
  chosenOptionId?: string;
  /** The scenario choice just submitted, shown with its feedback and outcome word. */
  choice?: Choice;
  /** True when the question itself is finished (otherwise the person presses Continue to the next scenario step). */
  final: boolean;
};

const ruleKey = (e: unknown): MessageKey =>
  e instanceof RuleError ? (`errors.rule.${e.rule}` as MessageKey) : 'staff.quiz.saveError';

function QuestionView({
  data,
  attempt,
  question,
  index,
  total,
  isLast,
  onNext,
}: {
  data: LearningData;
  attempt: Attempt;
  question: Question;
  index: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { module, overlays, client } = data;
  const [picked, setPicked] = useState<string[]>([]);
  const [stepId, setStepId] = useState<string | undefined>(question.scenario?.steps[0]?.id);
  const [path, setPath] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Notes count as shown for the whole question once the panel has been opened (it costs the bonus XP).
  const [notesSeen, setNotesSeen] = useState(false);
  const closed = attempt.mode === 'closed';
  const feedbackRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  const steps = question.scenario?.steps;
  const step = steps?.find((s) => s.id === stepId);
  const order = attempt.optionOrder?.[question.id];
  const options = useMemo(() => {
    const all = question.options ?? [];
    if (!order) return all;
    return order.flatMap((id) => all.filter((o) => o.id === id));
  }, [question.options, order]);
  const choices = step?.choices ?? [];
  const items = (question.type === 'scenario' ? choices : options).map((o) => ({ id: o.id, label: o.text }));

  const submit = async () => {
    const id = picked[0];
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (question.type === 'scenario') {
        const choice = choices.find((c) => c.id === id);
        if (!choice) return;
        const nextPath = [...path, choice.id];
        if (choice.next !== undefined) {
          setPath(nextPath);
          setFeedback({ correct: choice.outcome === 'best', choice, final: false });
        } else {
          const res = await store.learning.answer(actor, {
            attemptId: attempt.id,
            questionId: question.id,
            choiceIds: nextPath,
            notesVisible: notesSeen,
          });
          setPath(nextPath);
          setFeedback({ correct: res.correct, choice, final: true });
        }
      } else {
        const res = await store.learning.answer(actor, {
          attemptId: attempt.id,
          questionId: question.id,
          optionId: id,
          notesVisible: notesSeen,
        });
        setFeedback({ correct: res.correct, chosenOptionId: id, final: true });
      }
    } catch (e) {
      setError(ruleKey(e));
    } finally {
      setBusy(false);
    }
  };

  const goOn = () => {
    if (feedback?.choice?.next !== undefined && !feedback.final) {
      setStepId(feedback.choice.next);
      setPicked([]);
      setFeedback(null);
      return;
    }
    onNext();
  };

  const links = feedback?.final
    ? visibleLearnMore({
        question,
        overlays,
        correct: feedback.correct,
        settings: module.quiz,
        phase: 'feedback',
        attemptMode: attempt.mode,
      })
    : { official: [], organisation: [] };
  const opened = (l: LearnMoreLink) => {
    void store.learning
      .learnMoreOpened(actor, { moduleId: module.id, questionId: question.id, linkId: l.id, attemptId: attempt.id })
      .catch(() => undefined);
  };
  // Read aloud covers the question and its answers only, never the learner's notes.
  const spokenText = [
    question.prompt,
    ...(question.type === 'scenario' && step ? [step.text] : []),
    ...items.map((i) => i.label),
  ].join('. ');
  const correctOptionIds = options.filter((o) => o.correct).map((o) => o.id);

  return (
    <>
      <Stepper
        current={index + 1}
        total={total}
        label={t('staff.quiz.question', { current: index + 1, total })}
        progressLabel={t('staff.quiz.progress')}
      />
      {closed ? (
        <p data-testid="notes-locked" className="my-3 flex items-center gap-2 font-semibold">
          <Icon name="alert" />
          <span>{t('staff.quiz.notesLocked')}</span>
        </p>
      ) : (
        <div className="my-3">
          <Button
            variant="secondary"
            onClick={() => {
              setNotesSeen(true);
              setNotesOpen(true);
            }}
          >
            {notesSeen ? t('staff.quiz.notesShown') : t('staff.quiz.notesHidden')}
          </Button>
          <NotesPanel
            module={module}
            open={notesOpen}
            onClose={() => {
              setNotesOpen(false);
            }}
          />
        </div>
      )}
      <h2 data-testid="question-prompt" className="my-4 text-xl font-bold">
        {question.prompt}
      </h2>
      <div className="mb-3">
        <ReadAloud text={spokenText} />
      </div>
      {question.type === 'scenario' && step ? <p className="mt-0 text-lg">{step.text}</p> : null}
      {question.type !== 'scenario' && feedback ? (
        <ChoiceList
          name={`q-${question.id}`}
          legend={t('staff.quiz.chooseOne')}
          type="single"
          radioGroup
          options={items}
          value={picked}
          onChange={() => undefined}
          result={{ correctIds: correctOptionIds }}
          stateLabels={{ correct: t('staff.quiz.answerRight'), incorrect: t('staff.quiz.answerWrong') }}
        />
      ) : null}
      {!feedback ? (
        <ChoiceList
          key={step?.id ?? question.id}
          name={`q-${question.id}-${step?.id ?? ''}`}
          legend={t('staff.quiz.chooseOne')}
          type="single"
          radioGroup
          options={items}
          value={picked}
          onChange={setPicked}
          stateLabels={{ correct: '', incorrect: '' }}
        />
      ) : null}
      {error ? <p role="alert">{t(error)}</p> : null}
      {feedback ? (
        <section
          ref={feedbackRef}
          tabIndex={-1}
          aria-label={t('staff.quiz.feedback')}
          className="mt-4 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4 focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          {feedback.choice ? (
            <div className="mb-3">
              <p className="m-0">{t('staff.quiz.yourChoice', { text: feedback.choice.text })}</p>
              <p className="my-1 flex items-center gap-2 font-bold">
                <Icon name={feedback.choice.outcome === 'poor' ? 'x-circle' : 'check'} />
                <span>{t(`staff.quiz.outcome.${feedback.choice.outcome}`)}</span>
              </p>
              <p className="m-0">{feedback.choice.feedback}</p>
            </div>
          ) : null}
          {feedback.final ? (
            <>
              <p className="my-1 flex items-center gap-2 text-lg font-bold">
                <Icon name={feedback.correct ? 'check' : 'x-circle'} />
                <span>{feedback.correct ? t('staff.quiz.correct') : t('staff.quiz.notQuite')}</span>
              </p>
              {module.quiz.feedback ? <p className="mt-1">{question.explanation}</p> : null}
              {module.quiz.showSourceRef && question.sourceRef ? (
                <p className="m-0 text-sm">{t('staff.quiz.source', { ref: question.sourceRef })}</p>
              ) : null}
              <LearnMoreGroups
                official={links.official}
                organisation={links.organisation}
                organisationName={client.displayName}
                onOpen={opened}
              />
            </>
          ) : null}
        </section>
      ) : null}
      <div className="mt-4">
        {!feedback ? (
          <Button
            disabled={picked.length === 0 || busy}
            onClick={() => {
              void submit();
            }}
          >
            {t('staff.quiz.submit')}
          </Button>
        ) : (
          <Button onClick={goOn}>
            {!feedback.final
              ? t('staff.quiz.continue')
              : isLast
                ? t('staff.quiz.finish')
                : t('staff.quiz.nextQuestion')}
          </Button>
        )}
      </div>
      <ReportQuestion moduleId={module.id} questionId={question.id} />
    </>
  );
}

function Runner({ data }: { data: LearningData }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const navigate = useNavigate();
  const clock = useClock();
  const queryClient = useQueryClient();
  const { module, attempts, events, person } = data;
  const unfinished = attempts.find((a) => a.finishedAt === undefined);
  const [mode, setMode] = useState<'open' | 'closed' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const competitions = useQuery({
    queryKey: ['competitions', actor.userId],
    queryFn: () => store.competitions.list(actor).catch(() => []),
  });
  const now = clock.now();
  // Live closed-book competitions the person can enter for this module. A closed-book-only module needs no choice.
  const closedBookNames =
    module.quiz.notesInQuiz === 'closedBookOnly' || unfinished
      ? []
      : (competitions.data ?? [])
          .filter((c) => closedBookChoiceApplies([c], person, module.id, now))
          .map((c) => c.name);
  const mustChoose = closedBookNames.length > 0;
  const finishedCount = attempts.filter((a) => a.finishedAt !== undefined).length;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const answeredCount = unfinished ? answeredQuestionIds(unfinished, events).size : 0;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const a = await store.learning.startAttempt(actor, module.id, mustChoose && mode ? { mode } : undefined);
      const answered = answeredQuestionIds(a, events);
      const first = a.questionIds.findIndex((q) => !answered.has(q));
      setIndex(first === -1 ? a.questionIds.length : first);
      setAttempt(a);
    } catch (e) {
      setError(ruleKey(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async (a: Attempt) => {
    setBusy(true);
    try {
      await store.learning.abandonAttempt(actor, a.id);
      await queryClient.invalidateQueries({ queryKey: ['learning'] });
      await navigate(`/staff/module/${module.id}`);
    } catch (e) {
      setLeaving(false);
      setError(ruleKey(e));
      setBusy(false);
    }
  };

  const finish = async (a: Attempt) => {
    setBusy(true);
    setError(null);
    try {
      await store.learning.finishAttempt(actor, a.id);
      await queryClient.invalidateQueries({ queryKey: ['learning'] });
      await navigate(`/staff/module/${module.id}/done`);
    } catch (e) {
      setError(ruleKey(e));
      setBusy(false);
    }
  };

  if (!attempt) {
    const canStart = unfinished !== undefined || retakesLeft(module, finishedCount);
    return (
      <>
        <p>
          {t('staff.quiz.intro', {
            count: Math.min(module.quiz.drawCount, module.questions.length),
            passMark: module.quiz.passMark,
          })}
        </p>
        {module.quiz.maxRetakes !== 0 ? <p>{t('staff.quiz.introRetakes')}</p> : null}
        {!canStart ? <p role="alert">{t('staff.quiz.noRetakesLeft')}</p> : null}
        {error ? <p role="alert">{t(error)}</p> : null}
        {mustChoose ? (
          <>
            <p>{t('staff.quiz.modeIntro', { names: closedBookNames.join(', ') })}</p>
            <ChoiceList
              name="quiz-mode"
              legend={t('staff.quiz.modeTitle')}
              type="single"
              radioGroup
              options={[
                { id: 'closed', label: t('staff.quiz.modeClosed') },
                { id: 'open', label: t('staff.quiz.modeOpen') },
              ]}
              value={mode ? [mode] : []}
              onChange={([id]) => {
                if (id === 'closed' || id === 'open') setMode(id);
              }}
              stateLabels={{ correct: '', incorrect: '' }}
            />
          </>
        ) : null}
        <Button
          disabled={!canStart || busy || (mustChoose && mode === null)}
          onClick={() => {
            void start();
          }}
        >
          {unfinished && answeredCount > 0 ? t('staff.quiz.resume') : t('staff.quiz.start')}
        </Button>
      </>
    );
  }

  const total = attempt.questionIds.length;
  const qid = attempt.questionIds[index];
  const question = module.questions.find((q) => q.id === qid);
  const leaveControl = (
    <>
      <div className="mt-6">
        <Button
          variant="quiet"
          onClick={() => {
            setLeaving(true);
          }}
        >
          {t('staff.quiz.leave')}
        </Button>
      </div>
      <ConfirmDialog
        open={leaving}
        title={t('staff.quiz.leaveTitle')}
        body={t('staff.quiz.leaveBody')}
        confirmLabel={t('staff.quiz.leaveYes')}
        cancelLabel={t('staff.quiz.leaveStay')}
        busy={busy}
        onCancel={() => {
          setLeaving(false);
        }}
        onConfirm={() => {
          void leave(attempt);
        }}
      />
    </>
  );
  if (!qid || !question) {
    return (
      <>
        <p>{t('staff.quiz.allAnswered')}</p>
        {error ? <p role="alert">{t(error)}</p> : null}
        <Button
          disabled={busy}
          onClick={() => {
            void finish(attempt);
          }}
        >
          {t('staff.quiz.finish')}
        </Button>
        {leaveControl}
      </>
    );
  }
  const isLast = index >= total - 1;
  return (
    <>
      <QuestionView
        key={qid}
        data={data}
        attempt={attempt}
        question={question}
        index={index}
        total={total}
        isLast={isLast}
        onNext={() => {
          if (isLast) void finish(attempt);
          else setIndex(index + 1);
        }}
      />
      {leaveControl}
    </>
  );
}

/** S6. */
export function Quiz() {
  const t = useT();
  const moduleId = useModuleId();
  return (
    <LearningFrame>
      {(data) => (
        <>
          <PageHeader title={t('staff.quiz.title', { title: data.module.title })}>
            {data.module.draftContent ? <Badge>{t('staff.module.draft')}</Badge> : null}
          </PageHeader>
          {data.allLessonsDone ? (
            <Runner data={data} />
          ) : (
            <>
              <p>{t('staff.quiz.blocked')}</p>
              <a
                href={`#/staff/module/${moduleId}`}
                className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
              >
                {t('staff.module.back')}
              </a>
            </>
          )}
        </>
      )}
    </LearningFrame>
  );
}

// "Quiz me for practice" (F-7, brief 20.7): three Demo AI questions from the module's own bank. Answers are checked on
// the screen only. Nothing is recorded: no XP, no attempt, no learning event. The only write is one AI usage unit.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, LinkButton, PageHeader } from '@sta/ui';
import { checkAnswer, type Question } from '@sta/domain';
import { AccountStateError, NotEntitledError } from '@sta/data';
import { useActor, useStore, useT } from '../../app/hooks';
import { useFeatures } from '../client/billingQueries';
import { LearningFrame } from './LearningFrame';
import { useModuleId } from './learningQueries';

const choiceLabel =
  'flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-2 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]';

/** One question. The pick lives in this component only. */
function PracticeQuestion({ question, onAnswered }: { question: Question; onAnswered: (correct: boolean) => void }) {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const correct = picked === null ? null : checkAnswer(question, { optionId: picked }).correct;
  return (
    <fieldset className="m-0 mb-4 min-w-0 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3">
      <legend className="px-1 font-bold">{question.prompt}</legend>
      <div className="flex flex-col gap-2">
        {(question.options ?? []).map((o) => (
          <label key={o.id} className={choiceLabel}>
            <input
              type="radio"
              name={question.id}
              value={o.id}
              checked={picked === o.id}
              onChange={() => {
                if (picked !== null) return;
                setPicked(o.id);
                onAnswered(checkAnswer(question, { optionId: o.id }).correct);
              }}
              className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
            />
            <span>{o.text}</span>
          </label>
        ))}
      </div>
      {correct !== null ? (
        <div
          data-testid="practice-feedback"
          data-correct={correct ? 'true' : 'false'}
          className="mt-3"
          aria-live="polite"
        >
          <p className="m-0 font-bold">{correct ? t('aiPractice.correct') : t('aiPractice.notQuite')}</p>
          <p className="mt-1 mb-0">{question.explanation}</p>
        </div>
      ) : null}
    </fieldset>
  );
}

function PracticeRun({ moduleId }: { moduleId: string }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  // One call per round: staleTime Infinity and no retry, so a refresh of the cache never counts a second unit.
  const q = useQuery({
    queryKey: ['aiPractice', actor.userId, moduleId, round],
    queryFn: async () => {
      const res = await store.ai.practice(actor, { moduleId });
      await queryClient.invalidateQueries({ queryKey: ['addOns'] });
      return res;
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (q.isError) {
    const unavailable = q.error instanceof NotEntitledError || q.error instanceof AccountStateError;
    return <p role="alert">{t(unavailable ? 'aiPractice.off' : 'aiPractice.error')}</p>;
  }
  if (!q.data) return <p>{t('aiPractice.loading')}</p>;
  const { questions } = q.data;
  const right = results.filter(Boolean).length;
  return (
    <>
      <p className="mt-0 mb-1 font-bold">{t('aiPractice.label')}</p>
      <p className="mt-0">{t('aiPractice.notice')}</p>
      {questions.length === 0 ? (
        <p>{t('aiPractice.empty')}</p>
      ) : (
        <>
          <p className="mt-0">{t('aiPractice.intro')}</p>
          {questions.map((question) => (
            <PracticeQuestion
              key={`${String(round)}-${question.id}`}
              question={question}
              onAnswered={(correct) => {
                setResults((r) => [...r, correct]);
              }}
            />
          ))}
        </>
      )}
      <div aria-live="polite">
        {questions.length > 0 && results.length === questions.length ? (
          <Card data-testid="practice-summary" className="mb-4">
            <p className="m-0 font-bold">{t('aiPractice.summary', { right, total: questions.length })}</p>
          </Card>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {results.length === questions.length && questions.length > 0 ? (
          <Button
            variant="secondary"
            onClick={() => {
              setResults([]);
              setRound(round + 1);
            }}
          >
            {t('aiPractice.again')}
          </Button>
        ) : null}
        <LinkButton variant="secondary" href={`#/staff/module/${moduleId}`}>
          {t('aiPractice.back')}
        </LinkButton>
      </div>
    </>
  );
}

/** The practice page. Staff without the AI Assistant get one plain sentence and no call is made. */
export function Practice() {
  const t = useT();
  const moduleId = useModuleId();
  const features = useFeatures();
  return (
    <LearningFrame>
      {({ module }) => (
        <>
          <PageHeader title={module.title} />
          {!features.data ? (
            <p>{t('aiPractice.loading')}</p>
          ) : features.data.aiAssistant ? (
            <PracticeRun moduleId={moduleId} />
          ) : (
            <p role="alert">{t('aiPractice.off')}</p>
          )}
        </>
      )}
    </LearningFrame>
  );
}

/** "Quiz me for practice" link. Staff see it only when the AI Assistant is on, and never a locked card. */
export function PracticeButton({ moduleId }: { moduleId: string }) {
  const t = useT();
  const features = useFeatures();
  if (!features.data?.aiAssistant) return null;
  return (
    <LinkButton variant="secondary" href={`#/staff/module/${moduleId}/practice`}>
      {t('aiPractice.button')}
    </LinkButton>
  );
}

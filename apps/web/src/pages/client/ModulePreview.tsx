// C6 Preview as a learner: the whole module in a phone-sized frame (lessons, then a Quiz tab), or one lesson when the
// route names it. Nothing is recorded: answers stay on the screen only.
import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, PageHeader, PhoneFrame } from '@sta/ui';
import type { Module, Question } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { ExplainThis } from '../ExplainThis';
import { Block } from '../staff/LessonPlayer';
import { focusLink } from '../staff/styles';
import { foundationsErrorKey } from './foundationsErrors';
import { PermissionGate } from './PermissionGate';

function LessonView({ module, index }: { module: Module; index: number }) {
  const lesson = module.lessons[index];
  if (!lesson) return null;
  return (
    <>
      <h2 className="mt-0 text-xl font-bold">{lesson.title}</h2>
      {lesson.blocks.map((block, i) => (
        <div key={i} className="mb-3">
          <Block block={block} acknowledged={false} onAcknowledge={() => undefined} />
        </div>
      ))}
      <ExplainThis moduleId={module.id} lessonId={lesson.id} admin />
    </>
  );
}

const choiceLabel =
  'flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-2 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]';

type Choice = { id: string; text: string; good: boolean; feedback: string | null };
type Group = { key: string; heading: string | null; choices: Choice[] };

/** One question. The pick is kept in this component only. */
function QuestionView({ question }: { question: Question }) {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const groups: Group[] =
    question.type === 'scenario'
      ? (question.scenario?.steps ?? []).map((s, i) => ({
          key: s.id,
          heading: `${t('preview.stepLabel', { number: i + 1 })}. ${s.text}`,
          choices: s.choices.map((c) => ({ id: c.id, text: c.text, good: c.outcome === 'best', feedback: c.feedback })),
        }))
      : [
          {
            key: question.id,
            heading: null,
            choices: (question.options ?? []).map((o) => ({
              id: o.id,
              text: o.text,
              good: o.correct,
              feedback: null,
            })),
          },
        ];
  const chosen = groups.flatMap((g) => g.choices).find((c) => c.id === picked);
  return (
    <fieldset className="m-0 mb-4 min-w-0 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3">
      <legend className="px-1 font-bold">{question.prompt}</legend>
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          {g.heading ? <p className="m-0 font-semibold">{g.heading}</p> : null}
          {g.choices.map((c) => (
            <label key={c.id} className={choiceLabel}>
              <input
                type="radio"
                name={question.id}
                value={c.id}
                checked={picked === c.id}
                onChange={() => {
                  setPicked(c.id);
                }}
                className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
              />
              <span>{c.text}</span>
            </label>
          ))}
        </div>
      ))}
      {chosen ? (
        <div className="mt-3" aria-live="polite">
          <p className="m-0 font-bold">{chosen.good ? t('preview.correct') : t('preview.notQuite')}</p>
          {chosen.feedback ? <p className="mt-1 mb-0">{chosen.feedback}</p> : null}
          <p data-testid="preview-explanation" className="mt-1 mb-0">
            {question.explanation}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}

function ModuleWalk({ module }: { module: Module }) {
  const t = useT();
  const [tab, setTab] = useState<'lessons' | 'quiz'>('lessons');
  const [index, setIndex] = useState(0);
  const tabClass = (on: boolean) =>
    `inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer items-center justify-center rounded-[var(--radius-md)] border-2 px-4 py-2 font-semibold ${focusLink} ${on ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)] underline underline-offset-4' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'}`;
  return (
    <PhoneFrame title={t('preview.lessonTitle', { title: module.title })}>
      <div role="tablist" aria-label={t('preview.tabsLabel')} className="mb-3 flex gap-2">
        {(['lessons', 'quiz'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`preview-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="preview-panel"
            onClick={() => {
              setTab(id);
            }}
            className={tabClass(tab === id)}
          >
            {t(id === 'lessons' ? 'preview.lessonsTab' : 'preview.quizTab')}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="preview-panel" aria-labelledby={`preview-tab-${tab}`}>
        {tab === 'lessons' ? (
          module.lessons.length === 0 ? (
            <p>{t('preview.noLessons')}</p>
          ) : (
            <>
              <p className="mt-0 mb-2 font-semibold">
                {t('preview.lessonCount', { number: index + 1, total: module.lessons.length })}
              </p>
              <LessonView module={module} index={index} />
              <div className="mt-3 flex flex-wrap gap-2">
                {index > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIndex(index - 1);
                    }}
                  >
                    {t('preview.previousLesson')}
                  </Button>
                ) : null}
                {index < module.lessons.length - 1 ? (
                  <Button
                    onClick={() => {
                      setIndex(index + 1);
                    }}
                  >
                    {t('preview.nextLesson')}
                  </Button>
                ) : null}
              </div>
            </>
          )
        ) : module.questions.length === 0 ? (
          <p>{t('preview.noQuestions')}</p>
        ) : (
          <>
            <p className="mt-0">{t('preview.quizNote')}</p>
            {module.questions.map((q) => (
              <QuestionView key={q.id} question={q} />
            ))}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

function PreviewBody() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { moduleId = '', lessonId } = useParams();
  const q = useQuery({
    queryKey: ['modulePreview', actor.userId, moduleId],
    queryFn: () => store.modules.get(actor, moduleId),
  });
  if (q.isError) return <p role="alert">{t(foundationsErrorKey(q.error))}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const module = q.data;
  if (lessonId === undefined) {
    return (
      <>
        <PageHeader title={t('preview.title')} />
        <p className="mt-0">{t('preview.intro')}</p>
        <ModuleWalk key={module.id} module={module} />
      </>
    );
  }
  const lesson = module.lessons.find((l) => l.id === lessonId);
  if (!lesson) return <p role="alert">{t('preview.notFound')}</p>;
  return (
    <>
      <PageHeader title={t('preview.title')} />
      <p className="mt-0">{t('preview.intro')}</p>
      <PhoneFrame title={t('preview.lessonTitle', { title: lesson.title })}>
        <LessonView module={module} index={module.lessons.indexOf(lesson)} />
      </PhoneFrame>
    </>
  );
}

export function ModulePreview() {
  return (
    <PermissionGate permission="modules.view" message="errors.forbidden" anyScope>
      <PreviewBody />
    </PermissionGate>
  );
}

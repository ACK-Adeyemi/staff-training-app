// The lessons list of the Module Builder: Markdown paste, one card per lesson, warnings for what was left out.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@sta/ui';
import { suggestQuestions, type Lesson } from '@sta/domain';
import { useActor, useStore, useT } from '../../../app/hooks';
import { foundationsErrorKey, inputClass } from '../foundationsErrors';
import { useFeatures } from '../billingQueries';
import { AiLabel } from './AiLabel';
import { addDraftedQuestions, pasteLessons, setLesson } from './builderForm';
import { LinkPanel } from './LinkPanel';
import { cardClass, labelClass, type AiCheck, type OwnLinks, type Update } from './shared';
import type { Form } from './builderForm';
import type { MarkdownWarning } from '@sta/domain';

export function LessonsSection({
  form,
  update,
  links,
  onShow,
  check,
}: {
  form: Form;
  update: Update;
  links: OwnLinks;
  onShow: (index: number) => void;
  check: AiCheck;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const aiOn = useFeatures().data?.aiAssistant === true;
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<{ lessonId: string; text: string } | null>(null);
  const [text, setText] = useState('');
  const [warnings, setWarnings] = useState<MarkdownWarning[]>([]);

  const turn = () => {
    const result = pasteLessons(form, text);
    update((f) => ({ ...f, lessons: result.form.lessons }));
    setWarnings(result.warnings);
    setText('');
    onShow(0);
  };

  const suggest = async (lesson: Lesson) => {
    setSuggestError(null);
    // Checked here first so an empty lesson uses nothing.
    if (suggestQuestions(lesson).length === 0) {
      setSuggestError({ lessonId: lesson.id, text: t('aiDraft.noText') });
      return;
    }
    setSuggesting(true);
    try {
      const result = await store.ai.suggestQuestions(actor, { lesson });
      update((f) => addDraftedQuestions(f, result.questions, new Map()));
      await queryClient.invalidateQueries({ queryKey: ['addOns'] });
    } catch (e) {
      setSuggestError({ lessonId: lesson.id, text: t(foundationsErrorKey(e)) });
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <section aria-labelledby="builder-lessons" className="flex flex-col gap-3">
      <h2 id="builder-lessons" className="m-0 text-xl font-bold">
        {t('client.builder.lessonsHeading')}
      </h2>
      <label className={labelClass}>
        {t('client.builder.paste')}
        <textarea
          value={text}
          rows={8}
          onChange={(e) => {
            setText(e.target.value);
          }}
          aria-describedby="builder-paste-help"
          className={`${inputClass} max-w-none py-2`}
        />
      </label>
      <p id="builder-paste-help" className="m-0">
        {t('client.builder.pasteHelp')}
      </p>
      <div>
        <Button variant="secondary" onClick={turn}>
          {t('client.builder.turn')}
        </Button>
      </div>
      {warnings.length > 0 ? (
        <div className={cardClass}>
          <h3 className="m-0 mb-2 font-bold">{t('client.builder.warningsHeading')}</h3>
          <ul className="m-0 list-disc pl-6">
            {warnings.map((w, i) => (
              <li key={i} data-testid="markdown-warning">
                {t(`client.builder.warning.${w.kind}`, { line: w.line })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {form.lessons.length === 0 ? <p className="m-0">{t('client.builder.noLessons')}</p> : null}
      {form.lessons.map((lesson, index) => (
        <div key={lesson.id} data-testid="builder-lesson" className={cardClass}>
          <h3 className="m-0 mb-2 font-bold">{t('client.builder.lessonNumber', { number: index + 1 })}</h3>
          <label className={labelClass}>
            {t('client.builder.lessonTitle')}
            <input
              type="text"
              value={lesson.title}
              onChange={(e) => {
                const title = e.target.value;
                update((f) => setLesson(f, lesson.id, { title }));
              }}
              className={inputClass}
            />
          </label>
          <p className="mt-2 mb-2">{t('client.builder.lessonMinutes', { minutes: lesson.minutes })}</p>
          <div className="mb-2">
            <AiLabel item={lesson} kind="lesson" check={check} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                onShow(index);
              }}
            >
              {t('client.builder.showInPreview')}
            </Button>
            {aiOn ? (
              <Button
                variant="secondary"
                disabled={suggesting}
                onClick={() => {
                  void suggest(lesson);
                }}
              >
                {t('aiDraft.suggestButton')}
              </Button>
            ) : null}
          </div>
          {suggestError?.lessonId === lesson.id ? (
            <p role="alert" className="mt-2 mb-0 font-semibold">
              {suggestError.text}
            </p>
          ) : null}
          <LinkPanel
            kind="lesson"
            targetId={lesson.id}
            name={lesson.title || t('client.builder.lessonNumber', { number: index + 1 })}
            links={links.of(lesson.furtherReading)}
            onAdd={(l) => {
              links.add('lesson', lesson.id, l);
            }}
            onRemove={(id) => {
              links.remove('lesson', lesson.id, id);
            }}
          />
        </div>
      ))}
    </section>
  );
}

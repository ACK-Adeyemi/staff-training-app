// The questions of the Module Builder: multiple choice and true or false, each with its own Learn more panel.
import { Button } from '@sta/ui';
import type { Question } from '@sta/domain';
import { useT } from '../../../app/hooks';
import { inputClass } from '../foundationsErrors';
import {
  addOption,
  addQuestion,
  removeOption,
  removeQuestion,
  setCorrect,
  setOptionText,
  setQuestion,
  type Form,
} from './builderForm';
import { LinkPanel } from './LinkPanel';
import { cardClass, checkBox, checkLabel, labelClass, type OwnLinks, type Update } from './shared';

function QuestionCard({
  question,
  index,
  update,
  links,
}: {
  question: Question;
  index: number;
  update: Update;
  links: OwnLinks;
}) {
  const t = useT();
  const options = question.options ?? [];
  const area = (label: string, value: string, hint: boolean, patch: (v: string) => Partial<Question>) => (
    <label className={labelClass}>
      <span>
        {label}
        {hint ? <span className="font-normal"> {t('client.builder.optionalHint')}</span> : null}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          update((f) => setQuestion(f, question.id, patch(v)));
        }}
        className={`${inputClass} max-w-none`}
      />
    </label>
  );
  return (
    <div data-testid="builder-question" data-question-id={question.id} className={`${cardClass} flex flex-col gap-3`}>
      <h3 className="m-0 font-bold">{t('client.builder.questionNumber', { number: index + 1 })}</h3>
      {area(t('client.builder.question'), question.prompt, false, (prompt) => ({ prompt }))}
      {question.type === 'scenario' ? <p className="m-0">{t('client.builder.scenarioNote')}</p> : null}
      {question.type === 'mcq'
        ? options.map((o, n) => (
            <div key={o.id} className="flex flex-wrap items-end gap-3">
              <label className={`${labelClass} min-w-0 flex-1`}>
                {t('client.builder.option', { number: n + 1 })}
                <input
                  type="text"
                  value={o.text}
                  onChange={(e) => {
                    const text = e.target.value;
                    update((f) => setOptionText(f, question.id, o.id, text));
                  }}
                  className={`${inputClass} max-w-none`}
                />
              </label>
              <label className={checkLabel}>
                <input
                  type="checkbox"
                  checked={o.correct}
                  onChange={(e) => {
                    const on = e.target.checked;
                    update((f) => setCorrect(f, question.id, o.id, on));
                  }}
                  className={checkBox}
                />
                {t('client.builder.optionCorrect', { number: n + 1 })}
              </label>
            </div>
          ))
        : null}
      {question.type === 'mcq' ? (
        <div className="flex flex-wrap gap-3">
          {options.length < 6 ? (
            <Button
              variant="secondary"
              onClick={() => {
                update((f) => addOption(f, question.id));
              }}
            >
              {t('client.builder.addOption')}
            </Button>
          ) : null}
          {options.length > 2 ? (
            <Button
              variant="secondary"
              onClick={() => {
                const last = options[options.length - 1];
                if (last) update((f) => removeOption(f, question.id, last.id));
              }}
            >
              {t('client.builder.removeOption', { number: options.length })}
            </Button>
          ) : null}
        </div>
      ) : null}
      {question.type === 'trueFalse' ? (
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="font-semibold">{t('client.builder.correctAnswer')}</legend>
          {options.map((o) => (
            <label key={o.id} className={checkLabel}>
              <input
                type="radio"
                name={`${question.id}-correct`}
                checked={o.correct}
                onChange={() => {
                  update((f) => setCorrect(f, question.id, o.id, true));
                }}
                className={checkBox}
              />
              {o.text === 'True' ? t('client.builder.trueCorrect') : t('client.builder.falseCorrect')}
            </label>
          ))}
        </fieldset>
      ) : null}
      {area(t('client.builder.explanation'), question.explanation, false, (explanation) => ({ explanation }))}
      {area(t('client.builder.sourceRef'), question.sourceRef ?? '', true, (sourceRef) => ({ sourceRef }))}
      <LinkPanel
        kind="question"
        targetId={question.id}
        name={question.prompt || t('client.builder.questionNumber', { number: index + 1 })}
        links={links.of(question.learnMore)}
        onAdd={(l) => {
          links.add('question', question.id, l);
        }}
        onRemove={(id) => {
          links.remove('question', question.id, id);
        }}
      />
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            update((f) => removeQuestion(f, question.id));
          }}
        >
          {t('client.builder.removeQuestion')}
        </Button>
      </div>
    </div>
  );
}

export function QuestionsSection({ form, update, links }: { form: Form; update: Update; links: OwnLinks }) {
  const t = useT();
  return (
    <section aria-labelledby="builder-questions" className="flex flex-col gap-3">
      <h2 id="builder-questions" className="m-0 text-xl font-bold">
        {t('client.builder.questionsHeading')}
      </h2>
      {form.questions.length === 0 ? <p className="m-0">{t('client.builder.noQuestions')}</p> : null}
      {form.questions.map((q, i) => (
        <QuestionCard key={q.id} question={q} index={i} update={update} links={links} />
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            update((f) => addQuestion(f, 'mcq'));
          }}
        >
          {t('client.builder.addMcq')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            update((f) => addQuestion(f, 'trueFalse'));
          }}
        >
          {t('client.builder.addTrueFalse')}
        </Button>
      </div>
    </section>
  );
}

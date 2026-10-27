// Who the module is for, what it counts towards, its category and the quiz settings.
import type { Category, JobRole, QuizSettings, Requirement } from '@sta/domain';
import { useT } from '../../../app/hooks';
import { inputClass } from '../foundationsErrors';
import { toggle, type Form } from './builderForm';
import { checkBox, checkLabel, groupClass, labelClass, type Update } from './shared';

export function SettingsSection({
  form,
  quiz,
  update,
  jobRoles,
  requirements,
  categories,
}: {
  form: Form;
  /** The quiz settings as shown (the default Questions per attempt is worked out from the questions). */
  quiz: QuizSettings;
  update: Update;
  jobRoles: JobRole[];
  requirements: Requirement[];
  categories: Category[];
}) {
  const t = useT();
  const setQuiz = (patch: Partial<QuizSettings>, touchDraw = false) => {
    update((f) => ({
      ...f,
      quiz: { ...quiz, ...patch },
      drawTouched: f.drawTouched || touchDraw,
    }));
  };
  const number = (raw: string): number => {
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  };
  const check = (label: string, on: boolean, change: (on: boolean) => void) => (
    <label className={checkLabel}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          change(e.target.checked);
        }}
        className={checkBox}
      />
      {label}
    </label>
  );

  return (
    <section aria-labelledby="builder-settings" className="flex flex-col gap-3">
      <h2 id="builder-settings" className="m-0 text-xl font-bold">
        {t('client.builder.settingsHeading')}
      </h2>
      <fieldset className={groupClass}>
        <legend className="px-1 font-semibold">{t('client.builder.jobRoles')}</legend>
        {jobRoles.map((r) =>
          check(r.name, form.roleTags.includes(r.id), () => {
            update((f) => ({ ...f, roleTags: toggle(f.roleTags, r.id) }));
          }),
        )}
      </fieldset>
      <fieldset className={groupClass}>
        <legend className="px-1 font-semibold">{t('client.builder.counts')}</legend>
        {requirements.map((r) =>
          check(r.name, form.requirementIds.includes(r.id), () => {
            update((f) => ({ ...f, requirementIds: toggle(f.requirementIds, r.id) }));
          }),
        )}
        {check(t('client.builder.optional'), form.optional, (on) => {
          update((f) => ({ ...f, optional: on }));
        })}
      </fieldset>
      <label className={labelClass}>
        {t('client.builder.category')}
        <select
          value={form.categoryId}
          onChange={(e) => {
            const categoryId = e.target.value;
            update((f) => ({ ...f, categoryId }));
          }}
          className={inputClass}
        >
          <option value="">{t('client.builder.noCategory')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className={`${groupClass} flex flex-col gap-3`}>
        <legend className="px-1 font-semibold">{t('client.builder.quizSettings')}</legend>
        <label className={labelClass}>
          {t('client.builder.mode')}
          <select
            value={quiz.mode}
            onChange={(e) => {
              const mode = e.target.value as QuizSettings['mode'];
              setQuiz({ mode, ...(mode === 'mix' ? { mixScenarioShare: quiz.mixScenarioShare ?? 0.5 } : {}) });
            }}
            className={inputClass}
          >
            <option value="mcq">{t('client.builder.modeMcq')}</option>
            <option value="scenario">{t('client.builder.modeScenario')}</option>
            <option value="mix">{t('client.builder.modeMix')}</option>
          </select>
        </label>
        <label className={labelClass}>
          {t('client.builder.drawCount')}
          <input
            type="number"
            min={1}
            value={quiz.drawCount}
            onChange={(e) => {
              setQuiz({ drawCount: number(e.target.value) }, true);
            }}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          {t('client.builder.passMark')}
          <input
            type="number"
            min={1}
            max={100}
            value={quiz.passMark}
            onChange={(e) => {
              setQuiz({ passMark: number(e.target.value) });
            }}
            className={inputClass}
          />
        </label>
        <div>
          {check(t('client.builder.shuffleQuestions'), quiz.shuffleQuestions, (on) => {
            setQuiz({ shuffleQuestions: on });
          })}
          {check(t('client.builder.shuffleAnswers'), quiz.shuffleOptions, (on) => {
            setQuiz({ shuffleOptions: on });
          })}
          {check(t('client.builder.feedback'), quiz.feedback, (on) => {
            setQuiz({ feedback: on });
          })}
          {check(t('client.builder.showSource'), quiz.showSourceRef, (on) => {
            setQuiz({ showSourceRef: on });
          })}
        </div>
        <label className={labelClass}>
          {t('client.builder.notes')}
          <select
            value={quiz.notesInQuiz}
            onChange={(e) => {
              setQuiz({ notesInQuiz: e.target.value as QuizSettings['notesInQuiz'] });
            }}
            className={inputClass}
          >
            <option value="choice">{t('client.builder.notesChoice')}</option>
            <option value="closedBookOnly">{t('client.builder.notesClosed')}</option>
          </select>
        </label>
        <label className={labelClass}>
          {t('client.builder.learnMoreFor')}
          <select
            value={quiz.learnMoreFor}
            onChange={(e) => {
              setQuiz({ learnMoreFor: e.target.value as QuizSettings['learnMoreFor'] });
            }}
            className={inputClass}
          >
            <option value="wrong">{t('client.builder.learnMoreWrong')}</option>
            <option value="all">{t('client.builder.learnMoreAll')}</option>
          </select>
        </label>
      </fieldset>
    </section>
  );
}

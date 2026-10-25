import { Badge, Card, LinkButton, PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { LearningFrame } from './LearningFrame';
import { useModuleId } from './learningQueries';
import { focusLink } from './styles';

function renewalText(months: number, t: ReturnType<typeof useT>): string {
  const period =
    months % 12 === 0
      ? months === 12
        ? t('staff.module.renewYear')
        : t('staff.module.renewYears', { count: months / 12 })
      : t('staff.module.renewMonths', { count: months });
  return t('staff.module.renewEvery', { period });
}

/** S4. */
export function ModuleOverview() {
  const t = useT();
  const moduleId = useModuleId();
  return (
    <LearningFrame>
      {({ module, doneLessons, allLessonsDone, renewMonths }) => {
        const firstTodo = module.lessons.find((l) => !doneLessons.has(l.id));
        const base = `#/staff/module/${module.id}`;
        return (
          <>
            <PageHeader title={module.title}>
              {module.draftContent ? <Badge>{t('staff.module.draft')}</Badge> : null}
            </PageHeader>
            {module.description ? <p className="mt-0">{module.description}</p> : null}
            <p className="mt-0">{t('staff.module.minutesTotal', { count: module.estimatedMinutes })}</p>
            {renewMonths !== undefined ? <p className="mt-0">{renewalText(renewMonths, t)}</p> : null}
            {module.sourceAttribution ? (
              <p className="mt-0 text-sm text-[var(--color-text-muted)]">{module.sourceAttribution}</p>
            ) : null}
            <div className="mb-4">
              {allLessonsDone ? (
                <LinkButton href={`${base}/quiz`}>{t('staff.module.startQuiz')}</LinkButton>
              ) : firstTodo ? (
                <LinkButton href={`${base}/lesson/${firstTodo.id}`}>
                  {doneLessons.size === 0 ? t('staff.module.start') : t('staff.module.resume')}
                </LinkButton>
              ) : null}
              {!allLessonsDone ? <p className="mb-0 text-sm">{t('staff.module.quizHint')}</p> : null}
            </div>
            <section aria-labelledby={`lessons-${moduleId}`}>
              <h2 id={`lessons-${moduleId}`} className="text-lg font-bold">
                {t('staff.module.lessons')}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {module.lessons.map((l) => (
                  <li key={l.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-2">
                      <a
                        href={`${base}/lesson/${l.id}`}
                        className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
                      >
                        {l.title}
                      </a>
                      <span className="flex items-center gap-2">
                        <span>{t('staff.module.lessonMinutes', { count: l.minutes })}</span>
                        {doneLessons.has(l.id) ? <Badge tone="demo">{t('staff.module.lessonDone')}</Badge> : null}
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          </>
        );
      }}
    </LearningFrame>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Icon, LinkButton, PageHeader, Sheet } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { useDisplayPrefs } from '../../app/display/context';
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

/** The entry point to the learner's private notes for this course; adding and editing notes arrive with the lesson player. */
function NotesButton({ moduleId, title }: { moduleId: string; title: string }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [open, setOpen] = useState(false);
  const notes = useQuery({
    queryKey: ['moduleNotes', actor.userId, moduleId],
    queryFn: () => store.notes.list(actor, { moduleId }),
    enabled: open,
  });
  return (
    <>
      <Button
        variant="secondary"
        data-testid="module-notes-button"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('staff.module.notes')}
      </Button>
      <Sheet
        open={open}
        title={t('staff.module.notesFor', { course: title })}
        onClose={() => {
          setOpen(false);
        }}
      >
        {open ? (
          <>
            <p className="mt-0">{t('notes.private')}</p>
            {notes.isError ? <p role="alert">{t('notes.lockedInQuiz')}</p> : null}
            {notes.data && notes.data.length === 0 ? <p>{t('notes.empty')}</p> : null}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {(notes.data ?? []).map((n) => (
                <li key={n.id}>
                  <Card>{n.body}</Card>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Sheet>
    </>
  );
}

/** S4. */
export function ModuleOverview() {
  const t = useT();
  const moduleId = useModuleId();
  const { prefs } = useDisplayPrefs();
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
            <div className="mb-4">
              <NotesButton moduleId={module.id} title={module.title} />
            </div>
            <section aria-labelledby={`lessons-${moduleId}`}>
              <h2 id={`lessons-${moduleId}`} className="text-lg font-bold">
                {t('staff.module.lessons')}
              </h2>
              <ul data-testid="lesson-path" className="m-0 flex list-none flex-col gap-2 p-0">
                {module.lessons.map((l) => {
                  const state = doneLessons.has(l.id) ? 'done' : l.id === firstTodo?.id ? 'current' : 'next';
                  const word =
                    state === 'done'
                      ? t('staff.module.stateDone')
                      : state === 'current'
                        ? t('staff.module.stateCurrent')
                        : t('staff.module.stateNext');
                  return (
                    <li key={l.id} data-testid="path-node" data-state={state} className="flex items-stretch gap-3">
                      {prefs.simpleView ? null : (
                        <span aria-hidden="true" className="flex flex-col items-center">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)]">
                            <Icon
                              name={state === 'done' ? 'check' : state === 'current' ? 'clock' : 'book'}
                              size={16}
                            />
                          </span>
                          <span className="w-0.5 flex-1 bg-[var(--color-border)]" />
                        </span>
                      )}
                      <Card className="flex flex-1 flex-wrap items-center justify-between gap-2">
                        <a
                          href={`${base}/lesson/${l.id}`}
                          className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
                        >
                          {l.title}
                        </a>
                        <span className="flex items-center gap-2">
                          <span>{t('staff.module.lessonMinutes', { count: l.minutes })}</span>
                          <Badge tone={state === 'done' ? 'demo' : 'neutral'}>{word}</Badge>
                        </span>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        );
      }}
    </LearningFrame>
  );
}

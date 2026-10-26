import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CourseChip, PageHeader, Switch } from '@sta/ui';
import { groupNotesByCourse, noteTarget, searchNotes, type Module } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { catToken } from '../organise/queries';

const ALL = 'all';
const field =
  'min-h-[var(--target-min)] w-full rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]';

function useMyNotes() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['notes', actor.userId, 'all'],
    queryFn: async () => {
      const [notes, modules, placements, categories] = await Promise.all([
        store.notes.list(actor),
        store.modules.list(actor),
        store.modulePlacements.list(actor),
        store.categories.list(actor),
      ]);
      return { notes, modules, placements, categories };
    },
  });
}

/** S9. The learner's own notes, grouped by course. */
export function MyNotes() {
  const t = useT();
  const q = useMyNotes();
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState(ALL);
  const [starred, setStarred] = useState(false);

  const data = q.data;
  const shown = useMemo(() => {
    if (!data) return [];
    const notes = searchNotes(data.notes, search, {
      ...(starred ? { starred: true } : {}),
      ...(course !== ALL ? { moduleIds: [course] } : {}),
    });
    return groupNotesByCourse(notes, data.modules, data.placements, data.categories);
  }, [data, search, course, starred]);
  const allGroups = useMemo(
    () => (data ? groupNotesByCourse(data.notes, data.modules, data.placements, data.categories) : []),
    [data],
  );
  const moduleOf = (id: string): Module | undefined => data?.modules.find((m) => m.id === id);

  return (
    <>
      <PageHeader title={t('notes.title')} />
      <p className="mt-0">{t('notes.private')}</p>
      {q.isError ? <p role="alert">{t('notes.loadError')}</p> : null}
      {data ? (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 font-semibold">
              {t('notes.search')}
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              {t('notes.course')}
              <select
                value={course}
                onChange={(e) => {
                  setCourse(e.target.value);
                }}
                className={field}
              >
                <option value={ALL}>{t('notes.allCourses')}</option>
                {allGroups.map((g) => (
                  <option key={g.moduleId} value={g.moduleId}>
                    {g.available ? g.title : t('notes.unavailable')}
                  </option>
                ))}
              </select>
            </label>
            <Switch
              label={t('notes.starredOnly')}
              checked={starred}
              onLabel={t('notes.on')}
              offLabel={t('notes.off')}
              onChange={setStarred}
            />
          </div>
          {data.notes.length === 0 ? <p>{t('notes.empty')}</p> : null}
          {data.notes.length > 0 && shown.length === 0 ? <p role="status">{t('notes.noMatches')}</p> : null}
          {shown.map((g) => (
            <section key={g.moduleId} className="mb-6">
              <h2 className="text-lg font-bold">{g.available ? g.title : t('notes.unavailable')}</h2>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {g.notes.map((n) => {
                  const module = moduleOf(n.moduleId);
                  const target = noteTarget(n, module);
                  const lesson = module?.lessons.find((l) => l.id === n.lessonId);
                  const href =
                    target.kind === 'lesson'
                      ? `#/staff/module/${target.moduleId}/lesson/${target.lessonId}`
                      : target.kind === 'module'
                        ? `#/staff/module/${target.moduleId}`
                        : undefined;
                  return (
                    <li key={n.id}>
                      <Card data-testid="note-card">
                        <CourseChip
                          name={g.title}
                          icon={g.category?.icon ?? 'book'}
                          colour={g.category ? catToken(g.category.colour) : 'cat-7'}
                          {...(href ? { href } : {})}
                          unavailableLabel={t('notes.unavailable')}
                        />
                        {lesson ? <p className="my-1 text-sm font-semibold">{lesson.title}</p> : null}
                        <p className="my-1 text-sm">{t('notes.written', { date: formatLondonDate(n.createdAt) })}</p>
                        <p className="mb-0 whitespace-pre-wrap break-words">{n.body}</p>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      ) : null}
    </>
  );
}

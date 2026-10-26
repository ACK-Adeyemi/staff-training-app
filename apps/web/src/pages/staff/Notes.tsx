import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Sheet, Switch } from '@sta/ui';
import { NOTE_MAX_LENGTH, type Module, type Note } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { ConfirmDialog } from './ConfirmDialog';
import { focusLink } from './styles';

const AUTOSAVE_MS = 800;

/** The learner's own notes for one course. Fails (and says so) while a closed-book attempt is running. */
export function useCourseNotes(moduleId: string, enabled: boolean) {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['notes', actor.userId, moduleId],
    queryFn: () => store.notes.list(actor, { moduleId }),
    enabled,
  });
}

type EditorApi = {
  /** Saves any waiting text (autosave pending) without complaining about an empty note. */
  flush: () => Promise<void>;
  /** Saves now. False (with a message shown) when there is nothing to save. */
  saveNow: () => Promise<boolean>;
};

/** What a note editor is working on: a new note for a lesson, or an existing note. */
export type NoteTarget = { note?: Note; lessonId?: string };

function Editor({
  module,
  target,
  onReady,
}: {
  module: Module;
  target: NoteTarget;
  onReady: (api: EditorApi) => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [body, setBody] = useState(target.note?.body ?? '');
  const [error, setError] = useState<MessageKey | null>(null);
  const noteId = useRef<string | undefined>(target.note?.id);
  const lastSaved = useRef<string>(target.note?.body.trim() ?? '');
  const latest = useRef(body);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const lessonId = target.note ? target.note.lessonId : target.lessonId;
  const lessonTitle = module.lessons.find((l) => l.id === lessonId)?.title;

  // Saves run one after another, so the first creates the note and the rest update that same note.
  const save = useCallback((): Promise<void> => {
    const text = latest.current.trim();
    if (text === '' || text === lastSaved.current) return chain.current;
    chain.current = chain.current.then(async () => {
      try {
        const saved = await store.notes.save(actor, {
          ...(noteId.current ? { id: noteId.current } : {}),
          moduleId: module.id,
          ...(lessonId ? { lessonId } : {}),
          body: text,
        });
        noteId.current = saved.id;
        lastSaved.current = text;
        setError(null);
        await queryClient.invalidateQueries({ queryKey: ['notes'] });
      } catch {
        setError('notes.saveError');
      }
    });
    return chain.current;
  }, [store, actor, module.id, lessonId, queryClient]);

  // Leaving the lesson with a save still waiting: save it now.
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
        void save();
      }
    },
    [save],
  );

  useEffect(() => {
    const flush = async () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
      await save();
    };
    onReady({
      flush,
      saveNow: async () => {
        if (latest.current.trim() === '') {
          setError('notes.emptyError');
          return false;
        }
        await flush();
        return true;
      },
    });
  }, [onReady, save]);

  return (
    <>
      <p className="my-1 font-semibold">{module.title}</p>
      {lessonTitle ? <p className="my-1">{lessonTitle}</p> : null}
      <p className="text-sm">{t('notes.reminder')}</p>
      <label htmlFor="note-body" className="block font-semibold">
        {t('notes.noteLabel')}
      </label>
      <textarea
        id="note-body"
        value={body}
        maxLength={NOTE_MAX_LENGTH}
        rows={6}
        onChange={(e) => {
          const next = e.target.value.slice(0, NOTE_MAX_LENGTH);
          setBody(next);
          latest.current = next;
          setError(null);
          if (timer.current !== undefined) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = undefined;
            void save();
          }, AUTOSAVE_MS);
        }}
        className="w-full rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      />
      <p data-testid="note-count" className="my-1 text-sm">
        {t('notes.count', { n: body.length.toLocaleString('en-GB') })}
      </p>
      {error ? <p role="alert">{t(error)}</p> : null}
    </>
  );
}

/** S5 Add note / Edit note sheet. Typing autosaves 800 ms after it stops; Save note saves at once and closes. */
export function NoteSheet({
  module,
  target,
  onClose,
}: {
  module: Module;
  target: NoteTarget | null;
  onClose: () => void;
}) {
  const t = useT();
  const api = useRef<EditorApi | null>(null);
  const register = useCallback((next: EditorApi) => {
    api.current = next;
  }, []);
  return (
    <Sheet
      open={target !== null}
      title={target?.note ? t('notes.edit') : t('notes.add')}
      onClose={() => {
        void (api.current?.flush() ?? Promise.resolve()).then(onClose);
      }}
    >
      {target ? (
        <>
          <Editor key={target.note?.id ?? 'new'} module={module} target={target} onReady={register} />
          <div className="mt-3 flex gap-3">
            <Button
              onClick={() => {
                void (api.current?.saveNow() ?? Promise.resolve(true)).then((ok) => {
                  if (ok) onClose();
                });
              }}
            >
              {t('notes.save')}
            </Button>
          </div>
        </>
      ) : null}
    </Sheet>
  );
}

function NoteRow({
  module,
  note,
  onEdit,
  onDelete,
}: {
  module: Module;
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const lesson = module.lessons.find((l) => l.id === note.lessonId);
  return (
    <li>
      <Card>
        {lesson ? <p className="mt-0 mb-1 text-sm font-semibold">{lesson.title}</p> : null}
        <p className="mt-0 whitespace-pre-wrap break-words">{note.body}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onEdit}>
            {t('notes.edit')}
          </Button>
          <Button variant="secondary" onClick={onDelete}>
            {t('notes.remove')}
          </Button>
        </div>
        <div className="mt-2">
          <Switch
            label={note.starred ? t('notes.unstar') : t('notes.star')}
            checked={note.starred}
            onLabel={t('notes.starred')}
            offLabel={t('notes.notStarred')}
            onChange={(starred) => {
              void store.notes
                .save(actor, { id: note.id, moduleId: note.moduleId, body: note.body, starred })
                .then(() => queryClient.invalidateQueries({ queryKey: ['notes'] }));
            }}
          />
        </div>
      </Card>
    </li>
  );
}

/** "Notes for <course>": this course's notes with edit, star and delete. */
export function NotesPanel({ module, open, onClose }: { module: Module; open: boolean; onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const notes = useCourseNotes(module.id, open);
  const [editing, setEditing] = useState<NoteTarget | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  return (
    <>
      <Sheet open={open} title={t('notes.panelTitle', { course: module.title })} onClose={onClose}>
        {open ? (
          <>
            <p className="mt-0">{t('notes.private')}</p>
            {notes.isError ? <p role="alert">{t('notes.lockedInQuiz')}</p> : null}
            {notes.data && notes.data.length === 0 ? <p>{t('notes.empty')}</p> : null}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {(notes.data ?? []).map((n) => (
                <NoteRow
                  key={n.id}
                  module={module}
                  note={n}
                  onEdit={() => {
                    setEditing({ note: n });
                  }}
                  onDelete={() => {
                    setDeleting(n);
                  }}
                />
              ))}
            </ul>
            <p className="mb-0">
              <a
                href="#/staff/notes"
                className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
              >
                {t('notes.all')}
              </a>
            </p>
          </>
        ) : null}
      </Sheet>
      <NoteSheet
        module={module}
        target={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={t('notes.deleteTitle')}
        body={t('notes.deleteBody')}
        confirmLabel={t('notes.deleteYes')}
        cancelLabel={t('notes.cancel')}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          const note = deleting;
          setDeleting(null);
          if (!note) return;
          void store.notes.remove(actor, note.id).then(() => queryClient.invalidateQueries({ queryKey: ['notes'] }));
        }}
      />
    </>
  );
}

/** The "Notes" button and its panel, for the module overview and lessons. */
export function NotesButton({ module }: { module: Module }) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
      <NotesPanel
        module={module}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

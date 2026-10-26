// Learner notes: validation, grouping, search and privacy (brief 18.1, 18.2; plan M2 assumptions 20 to 23).
import { findRanges, fold, searchTerms } from './catalogue/text';
import type { Category, ModulePlacement, Note } from './schemas/engagement';
import type { Attempt, Module } from './schemas/learning';

export const NOTE_MAX_LENGTH = 1000;

export type NoteValidation = { ok: true; body: string } | { ok: false; error: 'empty' | 'tooLong' | 'lessonMissing' };

/** Notes are plain text: the body is trimmed and otherwise kept exactly as typed. */
export function validateNote(input: { body: string; lessonId?: string }, module: Module): NoteValidation {
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, error: 'empty' };
  if (body.length > NOTE_MAX_LENGTH) return { ok: false, error: 'tooLong' };
  if (input.lessonId !== undefined && !module.lessons.some((l) => l.id === input.lessonId)) {
    return { ok: false, error: 'lessonMissing' };
  }
  return { ok: true, body };
}

export type NoteTarget =
  | { kind: 'lesson'; moduleId: string; lessonId: string }
  | { kind: 'module'; moduleId: string }
  | { kind: 'unavailable' };

export function noteTarget(note: Note, module: Module | undefined): NoteTarget {
  if (!module || module.status === 'archived') return { kind: 'unavailable' };
  if (note.lessonId !== undefined && module.lessons.some((l) => l.id === note.lessonId)) {
    return { kind: 'lesson', moduleId: module.id, lessonId: note.lessonId };
  }
  return { kind: 'module', moduleId: module.id };
}

export type NoteGroup = {
  moduleId: string;
  title: string;
  category?: Category;
  available: boolean;
  notes: Note[];
};

export function groupNotesByCourse(
  notes: readonly Note[],
  modules: readonly Module[],
  placements: readonly ModulePlacement[],
  categories: readonly Category[],
): NoteGroup[] {
  const byModule = new Map<string, Note[]>();
  for (const n of notes) byModule.set(n.moduleId, [...(byModule.get(n.moduleId) ?? []), n]);
  const groups: NoteGroup[] = [];
  for (const [moduleId, list] of byModule) {
    const module = modules.find((m) => m.id === moduleId);
    const categoryId = placements.find((p) => p.moduleId === moduleId)?.categoryId;
    const category = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
    groups.push({
      moduleId,
      title: module?.title ?? '',
      ...(category ? { category } : {}),
      available: module !== undefined && module.status !== 'archived',
      notes: [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    });
  }
  return groups.sort((a, b) => Number(b.available) - Number(a.available) || a.title.localeCompare(b.title, 'en-GB'));
}

export type NoteFilters = { starred?: boolean; moduleIds?: readonly string[] };

export function searchNotes(notes: readonly Note[], query: string, filters: NoteFilters): Note[] {
  const terms = searchTerms(query);
  return notes.filter((n) => {
    if (filters.starred && !n.starred) return false;
    if (filters.moduleIds && !filters.moduleIds.includes(n.moduleId)) return false;
    const body = fold(n.body);
    return terms.every((t) => findRanges(body, t).length > 0);
  });
}

/** Notes are private: only the person who wrote one can read it. Fails closed. */
export const canReadNote = (note: Note, personId: string | undefined): boolean =>
  personId !== undefined && note.personId === personId;

export const visibleNotes = (notes: readonly Note[], personId: string | undefined): Note[] =>
  notes.filter((n) => canReadNote(n, personId));

/** Notes are shut during an unfinished closed-book attempt. */
export const notesLocked = (attempts: readonly Attempt[], personId: string | undefined): boolean =>
  personId !== undefined &&
  attempts.some((a) => a.personId === personId && a.mode === 'closed' && a.finishedAt === undefined && !a.abandoned);

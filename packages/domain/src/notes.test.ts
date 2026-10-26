// BP-5, F-7: learner notes (brief 18.1, 18.2; plan M2 assumptions 20 to 23).
import { describe, expect, it } from 'vitest';
import {
  canReadNote,
  groupNotesByCourse,
  noteTarget,
  notesLocked,
  searchNotes,
  validateNote,
  visibleNotes,
} from './notes';
import type { Note } from './schemas/engagement';
import type { Attempt } from './schemas/learning';
import { CLIENT, SITE_ID, category, nextId, placement } from './catalogue/testFixtures';
import { moduleFor } from './progress/testFixtures';

const lesson = (id: string, title: string) => ({ id, title, minutes: 3, blocks: [] });
const safeguarding = moduleFor({
  id: nextId(),
  title: 'Safeguarding and whistleblowing',
  lessons: [lesson('l1', 'Spotting signs'), lesson('l2', 'Reporting')],
} as Parameters<typeof moduleFor>[0]);
const sleep = moduleFor({ id: nextId(), title: 'Safer sleep', lessons: [lesson('l1', 'Cots')] } as Parameters<
  typeof moduleFor
>[0]);
const ME = nextId();

const note = (over: Partial<Note> = {}): Note => ({
  id: nextId(),
  clientId: CLIENT,
  personId: ME,
  moduleId: safeguarding.id,
  lessonId: 'l1',
  body: 'Remember to tell the DSL',
  starred: false,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
  ...over,
});

describe('validateNote (assumption 22)', () => {
  it('accepts plain text and returns the trimmed body', () => {
    expect(validateNote({ body: '  hello  ', lessonId: 'l1' }, safeguarding)).toEqual({ ok: true, body: 'hello' });
  });

  it('refuses an empty body and a whitespace-only body', () => {
    expect(validateNote({ body: '' }, safeguarding)).toEqual({ ok: false, error: 'empty' });
    expect(validateNote({ body: '   \n ' }, safeguarding)).toEqual({ ok: false, error: 'empty' });
  });

  it('accepts exactly 1,000 characters and refuses 1,001', () => {
    expect(validateNote({ body: 'a'.repeat(1000) }, safeguarding).ok).toBe(true);
    expect(validateNote({ body: 'a'.repeat(1001) }, safeguarding)).toEqual({ ok: false, error: 'tooLong' });
  });

  it('measures the length after trimming', () => {
    expect(validateNote({ body: ` ${'a'.repeat(1000)} ` }, safeguarding).ok).toBe(true);
  });

  it('keeps markup as text; it never rewrites or strips it', () => {
    expect(validateNote({ body: '<b>**bold**</b>' }, safeguarding)).toEqual({ ok: true, body: '<b>**bold**</b>' });
  });

  it('refuses a lesson that is not in the module', () => {
    expect(validateNote({ body: 'x', lessonId: 'nope' }, safeguarding)).toEqual({ ok: false, error: 'lessonMissing' });
  });

  it('allows a note with no lesson (module-level)', () => {
    expect(validateNote({ body: 'x' }, safeguarding).ok).toBe(true);
  });
});

describe('noteTarget', () => {
  it('opens the lesson when it still exists', () => {
    expect(noteTarget(note({ lessonId: 'l2' }), safeguarding)).toEqual({
      kind: 'lesson',
      moduleId: safeguarding.id,
      lessonId: 'l2',
    });
  });

  it('opens the start of the module when the lesson was removed in a newer version', () => {
    expect(noteTarget(note({ lessonId: 'gone' }), safeguarding)).toEqual({ kind: 'module', moduleId: safeguarding.id });
  });

  it('opens the module for a note that has no lesson', () => {
    expect(noteTarget(note({ lessonId: undefined }), safeguarding)).toEqual({
      kind: 'module',
      moduleId: safeguarding.id,
    });
  });

  it('is unavailable (no link) when the module is archived or missing', () => {
    expect(noteTarget(note(), { ...safeguarding, status: 'archived' })).toEqual({ kind: 'unavailable' });
    expect(noteTarget(note(), undefined)).toEqual({ kind: 'unavailable' });
  });
});

describe('groupNotesByCourse (BP-5)', () => {
  const cat = category('Safeguarding', { colour: 'rose', icon: 'alert' });
  const placements = [placement(safeguarding.id, { categoryId: cat.id })];
  const modules = [safeguarding, sleep];

  it('groups notes under the module title with the category, newest note first', () => {
    const older = note({ updatedAt: '2026-10-01T10:00:00.000Z' });
    const newer = note({ updatedAt: '2026-10-12T10:00:00.000Z' });
    const groups = groupNotesByCourse([older, newer, note({ moduleId: sleep.id })], modules, placements, [cat]);
    const g = groups.find((x) => x.moduleId === safeguarding.id);
    expect(g?.title).toBe('Safeguarding and whistleblowing');
    expect(g?.category?.id).toBe(cat.id);
    expect(g?.available).toBe(true);
    expect(g?.notes.map((n) => n.id)).toEqual([newer.id, older.id]);
  });

  it('orders the course headings A to Z and has no empty groups', () => {
    const groups = groupNotesByCourse([note({ moduleId: sleep.id }), note()], modules, placements, [cat]);
    expect(groups.map((g) => g.title)).toEqual(['Safeguarding and whistleblowing', 'Safer sleep']);
    expect(groupNotesByCourse([], modules, placements, [cat])).toEqual([]);
  });

  it('keeps notes of an archived or removed module with an unavailable flag', () => {
    const gone = nextId();
    const groups = groupNotesByCourse(
      [note({ moduleId: gone }), note({ moduleId: sleep.id })],
      [safeguarding, { ...sleep, status: 'archived' }],
      placements,
      [cat],
    );
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.available === false)).toBe(true);
  });

  it('has no category when the module has no placement', () => {
    const [g] = groupNotesByCourse([note({ moduleId: sleep.id })], modules, placements, [cat]);
    expect(g?.category).toBeUndefined();
  });
});

describe('searchNotes', () => {
  const a = note({ body: 'Café rules for allergies', starred: true });
  const b = note({ body: 'Cot checks every ten minutes', moduleId: sleep.id });
  const notes = [a, b];

  it('returns everything for an empty query and no filter', () => {
    expect(searchNotes(notes, '', {})).toHaveLength(2);
  });

  it('matches by case-insensitive, accent-insensitive substring', () => {
    expect(searchNotes(notes, 'CAFE', {})).toEqual([a]);
    expect(searchNotes(notes, 'cot ch', {})).toEqual([b]);
  });

  it('requires every term to match', () => {
    expect(searchNotes(notes, 'cot every', {})).toEqual([b]);
    expect(searchNotes(notes, 'cot allergies', {})).toEqual([]);
  });

  it('does not treat the query as a regular expression', () => {
    expect(() => searchNotes(notes, '(', {})).not.toThrow();
    expect(searchNotes(notes, '.*', {})).toEqual([]);
  });

  it('filters by starred and by the module ids the UI resolved from a course or category', () => {
    expect(searchNotes(notes, '', { starred: true })).toEqual([a]);
    expect(searchNotes(notes, '', { moduleIds: [sleep.id] })).toEqual([b]);
    expect(searchNotes(notes, 'cot', { starred: true })).toEqual([]);
  });
});

describe('privacy: own notes only (assumption 21)', () => {
  const mine = note();
  const theirs = note({ personId: nextId() });

  it('only the owning person can read a note', () => {
    expect(canReadNote(mine, ME)).toBe(true);
    expect(canReadNote(theirs, ME)).toBe(false);
  });

  it("visibleNotes returns only the person's own notes", () => {
    expect(visibleNotes([mine, theirs], ME)).toEqual([mine]);
  });

  it('returns nothing for someone with no person (provider, unknown)', () => {
    expect(visibleNotes([mine, theirs], undefined)).toEqual([]);
    expect(canReadNote(mine, undefined)).toBe(false);
  });
});

describe('closed-book lock (assumption 20)', () => {
  const attempt = (over: Partial<Attempt> = {}): Attempt => ({
    id: nextId(),
    clientId: CLIENT,
    siteId: SITE_ID,
    personId: ME,
    moduleId: safeguarding.id,
    moduleVersion: 1,
    mode: 'closed',
    questionIds: ['q1'],
    startedAt: '2026-10-20T10:00:00.000Z',
    ...over,
  });

  it('locks notes while the person has an unfinished closed attempt', () => {
    expect(notesLocked([attempt()], ME)).toBe(true);
  });

  it('unlocks when the attempt is finished or abandoned', () => {
    expect(notesLocked([attempt({ finishedAt: '2026-10-20T10:05:00.000Z' })], ME)).toBe(false);
    expect(notesLocked([attempt({ abandoned: true, finishedAt: '2026-10-20T10:05:00.000Z' })], ME)).toBe(false);
  });

  it('does not lock for open-book attempts', () => {
    expect(notesLocked([attempt({ mode: 'open' })], ME)).toBe(false);
  });

  it("does not lock because of someone else's closed attempt", () => {
    expect(notesLocked([attempt({ personId: nextId() })], ME)).toBe(false);
  });

  it('is unlocked with no attempts', () => {
    expect(notesLocked([], ME)).toBe(false);
  });
});

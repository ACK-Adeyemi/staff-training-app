// M2 chunk 14 (BP-5, F-7): S5 Add note sheet and Notes for this course panel, S9 My notes.
// Contract the implementer must provide (all text from language files; the English strings below are the contract):
//   S5  /staff/module/:id/lesson/:lessonId
//     - a button "Add note" (always visible, not inside a step). It opens a dialog named "Add note" that shows the module
//       title and the lesson title as text, a textbox "Note", a live count (data-testid="note-count") reading
//       "<n> of 1,000 characters", a reminder containing "personal details", and a button "Save note".
//       The textbox has maxLength 1000. Typing autosaves through notes.save 800 ms after typing stops (the first save
//       creates the note, later saves update the same note). "Save note" saves at once and closes the dialog.
//     - a button "Notes" opens a dialog named "Notes for <module title>" that lists only this course's notes, with a link
//       "All my notes" (href ends /staff/notes). Each note is a listitem showing the body as plain text and the buttons
//       "Edit note", "Delete note" (opens a confirm dialog; its button "Yes, delete" removes it, "Cancel" keeps it) and a
//       star switch named "Star this note" (becomes "Remove star" once starred).
//       Editing: "Edit note" opens the same sheet, named "Edit note", with the body filled in; Save note updates in place.
//   S9  /staff/notes   h1 "My notes", textbox "Search notes", combobox "Course" (first option "All courses"),
//       switch "Starred only". One heading level 2 per course (the course title), each followed by note cards
//       (data-testid="note-card") showing: a course chip (a link named with the course title, href ending
//       /staff/module/<id>/lesson/<lessonId> when the lesson exists, /staff/module/<id> when it does not), the lesson
//       title, the date written like "19 October 2026", and the body. For an archived module the chip is text
//       "Course no longer available" and there is no link. Empty state "You have no notes yet. Notes are private to you."
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';
import { sgModule } from '../../test/quizHelpers';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(cleanup);

const lesson = sgModule.lessons[0]!;
const lessonPath = `/staff/module/${sgModule.id}/lesson/${lesson.id}`;
type Dump = Record<string, Record<string, unknown>[]>;
const dumpNotes = async (h: StoreHandle) => ((await h.admin.dumpAll()) as Dump).notes!;
const jadeNotes = async (h: StoreHandle, keys: SeedKeys) => h.store.notes.list(actorFor('staff', keys), {});

async function openAddNote(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Add note' }));
  return screen.findByRole('dialog', { name: 'Add note' });
}

describe('S5 Add note sheet', () => {
  it('shows the module and lesson names, the privacy reminder and a live character count', async () => {
    const user = userEvent.setup();
    await renderRoute(lessonPath, 'staff');
    const dialog = await openAddNote(user);
    expect(within(dialog).getByText(sgModule.title)).toBeTruthy();
    expect(within(dialog).getByText(lesson.title)).toBeTruthy();
    expect(within(dialog).getByText(/personal details/i)).toBeTruthy();
    expect(within(dialog).getByTestId('note-count').textContent).toBe('0 of 1,000 characters');
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Hello');
    expect(within(dialog).getByTestId('note-count').textContent).toBe('5 of 1,000 characters');
  });

  it('stops at 1,000 characters', async () => {
    const user = userEvent.setup();
    await renderRoute(lessonPath, 'staff');
    const dialog = await openAddNote(user);
    const box = within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });
    await user.click(box);
    await user.paste('a'.repeat(1001));
    expect(box.value.length).toBe(1000);
    expect(within(dialog).getByTestId('note-count').textContent).toBe('1,000 of 1,000 characters');
  });

  it('Save note stores the note against the module and lesson, closes the sheet, and the panel lists it', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(lessonPath, 'staff');
    const dialog = await openAddNote(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), '  Ask the DSL first  ');
    await user.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add note' })).toBeNull();
    });
    const mine = (await jadeNotes(handle, keys)).filter((n) => n.moduleId === sgModule.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ body: 'Ask the DSL first', lessonId: lesson.id, starred: false });

    await user.click(screen.getByRole('button', { name: 'Notes' }));
    const panel = await screen.findByRole('dialog', { name: `Notes for ${sgModule.title}` });
    expect(await within(panel).findByText('Ask the DSL first')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'All my notes' }).getAttribute('href')).toMatch(/\/staff\/notes$/);
  });

  it('autosaves 800 ms after typing stops, creating once and then updating the same note', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(lessonPath, 'staff');
    const dialog = await openAddNote(user);
    const box = within(dialog).getByRole('textbox', { name: 'Note' });
    await user.type(box, 'First');
    // Nothing is saved while typing is still going on.
    expect((await jadeNotes(handle, keys)).filter((n) => n.moduleId === sgModule.id)).toHaveLength(0);
    await waitFor(
      async () => {
        expect((await jadeNotes(handle, keys)).filter((n) => n.moduleId === sgModule.id).map((n) => n.body)).toEqual([
          'First',
        ]);
      },
      { timeout: 4000 },
    );
    await user.type(box, ' and second');
    await waitFor(
      async () => {
        expect((await jadeNotes(handle, keys)).filter((n) => n.moduleId === sgModule.id).map((n) => n.body)).toEqual([
          'First and second',
        ]);
      },
      { timeout: 4000 },
    );
  });

  it('keeps the text when the learner leaves mid-lesson without pressing Save note', async () => {
    const user = userEvent.setup();
    const { handle, keys, unmount } = await renderRoute(lessonPath, 'staff');
    const dialog = await openAddNote(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Unsaved thought');
    await waitFor(
      async () => {
        expect((await jadeNotes(handle, keys)).some((n) => n.body === 'Unsaved thought')).toBe(true);
      },
      { timeout: 4000 },
    );
    unmount();
    expect((await dumpNotes(handle)).some((n) => n['body'] === 'Unsaved thought')).toBe(true);
  });

  it('does not save an empty or whitespace-only note', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(lessonPath, 'staff');
    const before = (await jadeNotes(handle, keys)).length;
    const dialog = await openAddNote(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Save note' }));
    expect((await jadeNotes(handle, keys)).length).toBe(before);
  });
});

describe('S5 Notes for this course panel', () => {
  const seedNotes = async ({ handle, keys }: { handle: StoreHandle; keys: SeedKeys }) => {
    const jade = actorFor('staff', keys);
    await handle.store.notes.save(jade, { moduleId: sgModule.id, lessonId: lesson.id, body: 'Panel note one' });
  };

  it('is headed "Notes for <module title>" and lists only this course notes', async () => {
    const user = userEvent.setup();
    await renderRoute(lessonPath, 'staff', { prepare: seedNotes });
    await user.click(await screen.findByRole('button', { name: 'Notes' }));
    const panel = await screen.findByRole('dialog', { name: `Notes for ${sgModule.title}` });
    expect(await within(panel).findByText('Panel note one')).toBeTruthy();
    // Jade's seeded notes belong to other courses and must not appear here.
    expect(within(panel).getAllByRole('listitem')).toHaveLength(1);
  });

  it('edits a note in place', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(lessonPath, 'staff', { prepare: seedNotes });
    await user.click(await screen.findByRole('button', { name: 'Notes' }));
    const panel = await screen.findByRole('dialog', { name: `Notes for ${sgModule.title}` });
    await within(panel).findByText('Panel note one');
    await user.click(within(panel).getByRole('button', { name: 'Edit note' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit note' });
    const box = within(edit).getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });
    expect(box.value).toBe('Panel note one');
    await user.clear(box);
    await user.type(box, 'Edited note');
    await user.click(within(edit).getByRole('button', { name: 'Save note' }));
    await waitFor(async () => {
      const mine = (await jadeNotes(handle, keys)).filter((n) => n.moduleId === sgModule.id);
      expect(mine.map((n) => n.body)).toEqual(['Edited note']);
    });
  });

  it('stars and unstars a note', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(lessonPath, 'staff', { prepare: seedNotes });
    await user.click(await screen.findByRole('button', { name: 'Notes' }));
    const panel = await screen.findByRole('dialog', { name: `Notes for ${sgModule.title}` });
    await user.click(await within(panel).findByRole('switch', { name: 'Star this note' }));
    await waitFor(async () => {
      expect((await jadeNotes(handle, keys)).find((n) => n.body === 'Panel note one')?.starred).toBe(true);
    });
    await user.click(await within(panel).findByRole('switch', { name: 'Remove star' }));
    await waitFor(async () => {
      expect((await jadeNotes(handle, keys)).find((n) => n.body === 'Panel note one')?.starred).toBe(false);
    });
  });

  it('asks before deleting: Cancel keeps the note, Yes, delete removes it', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(lessonPath, 'staff', { prepare: seedNotes });
    await user.click(await screen.findByRole('button', { name: 'Notes' }));
    const panel = await screen.findByRole('dialog', { name: `Notes for ${sgModule.title}` });
    await within(panel).findByText('Panel note one');
    await user.click(within(panel).getByRole('button', { name: 'Delete note' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect((await jadeNotes(handle, keys)).some((n) => n.body === 'Panel note one')).toBe(true);
    await user.click(within(panel).getByRole('button', { name: 'Delete note' }));
    await user.click(await screen.findByRole('button', { name: 'Yes, delete' }));
    await waitFor(async () => {
      expect((await jadeNotes(handle, keys)).some((n) => n.body === 'Panel note one')).toBe(false);
    });
  });
});

describe('S9 My notes', () => {
  const prepare = async ({ handle, keys }: { handle: StoreHandle; keys: SeedKeys }) => {
    const jade = actorFor('staff', keys);
    await handle.store.notes.save(jade, {
      moduleId: sgModule.id,
      lessonId: lesson.id,
      body: 'Starred safeguarding thought',
      starred: true,
    });
    await handle.store.notes.save(jade, { moduleId: sgModule.id, body: 'Plain safeguarding thought' });
  };

  it('shows the heading, the private reminder and notes grouped under their course heading with a chip, lesson and date', async () => {
    await renderRoute('/staff/notes', 'staff', { prepare });
    expect(await screen.findByRole('heading', { level: 1, name: 'My notes' })).toBeTruthy();
    const heading = await screen.findByRole('heading', { level: 2, name: sgModule.title });
    expect(heading).toBeTruthy();
    const cards = screen.getAllByTestId('note-card').filter((c) => c.textContent.includes('safeguarding thought'));
    expect(cards).toHaveLength(2);
    const starred = cards.find((c) => c.textContent.includes('Starred safeguarding thought'))!;
    const chip = within(starred).getByRole('link', { name: sgModule.title });
    expect(chip.getAttribute('href')).toMatch(new RegExp(`/staff/module/${sgModule.id}/lesson/${lesson.id}$`));
    expect(within(starred).getByText(lesson.title)).toBeTruthy();
    expect(starred.textContent).toMatch(/\d{1,2} [A-Z][a-z]+ 2026/);
  });

  it('a note without a lesson links the chip to the module start', async () => {
    await renderRoute('/staff/notes', 'staff', { prepare });
    const plain = (await screen.findAllByTestId('note-card')).find((c) =>
      c.textContent.includes('Plain safeguarding thought'),
    )!;
    expect(within(plain).getByRole('link', { name: sgModule.title }).getAttribute('href')).toMatch(
      new RegExp(`/staff/module/${sgModule.id}$`),
    );
  });

  it('searches note text and filters by course and by starred', async () => {
    const user = userEvent.setup();
    await renderRoute('/staff/notes', 'staff', { prepare });
    await screen.findByRole('heading', { level: 2, name: sgModule.title });
    const total = screen.getAllByTestId('note-card').length;
    expect(total).toBeGreaterThan(2);

    await user.type(screen.getByRole('textbox', { name: 'Search notes' }), 'Plain safeguarding');
    await waitFor(() => {
      expect(screen.getAllByTestId('note-card')).toHaveLength(1);
    });
    await user.clear(screen.getByRole('textbox', { name: 'Search notes' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('note-card')).toHaveLength(total);
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Course' }), sgModule.title);
    await waitFor(() => {
      expect(screen.getAllByTestId('note-card')).toHaveLength(2);
    });
    await user.click(screen.getByRole('switch', { name: 'Starred only' }));
    await waitFor(() => {
      const cards = screen.getAllByTestId('note-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]!.textContent).toContain('Starred safeguarding thought');
    });
  });

  it('shows only the learner own notes: another staff member with notes sees none of Jade notes', async () => {
    const { keys } = await renderRoute('/staff/notes', 'staff', { prepare });
    await screen.findAllByTestId('note-card');
    cleanup();
    // Hannah has her own seeded notes; none of Jade's text may appear for her.
    expect(keys.users.hannah).toBeTruthy();
    await renderRoute('/staff/notes', 'staff', {
      prepare,
      actor: (k) => ({ ...actorFor('staff', k), userId: k.users.hannah }),
    });
    await screen.findByRole('heading', { level: 1, name: 'My notes' });
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('safeguarding thought');
    });
  });

  it('labels notes of an archived course "Course no longer available" with no link', async () => {
    await renderRoute('/staff/notes', 'staff', {
      prepare: async ({ handle, keys }) => {
        await prepare({ handle, keys });
        const dump = (await handle.admin.dumpAll()) as Dump;
        const sleep = dump.modules!.find((m) => m['title'] === 'Safer sleep')!;
        await handle.store.notes.save(actorFor('staff', keys), {
          moduleId: sleep['id'] as string,
          body: 'Note on a course that goes away',
        });
        await handle.admin.bulkPut('modules', [{ ...sleep, status: 'archived' }]);
      },
    });
    const card = (await screen.findAllByTestId('note-card')).find((c) =>
      c.textContent.includes('Note on a course that goes away'),
    )!;
    expect(within(card).getByText('Course no longer available')).toBeTruthy();
    expect(within(card).queryByRole('link')).toBeNull();
  });

  it('shows the empty state when the learner has no notes', async () => {
    await renderRoute('/staff/notes', 'staff', {
      prepare: async ({ handle, keys }) => {
        const jade = actorFor('staff', keys);
        for (const n of await handle.store.notes.list(jade, {})) await handle.store.notes.remove(jade, n.id);
      },
    });
    expect(await screen.findByText('You have no notes yet. Notes are private to you.')).toBeTruthy();
    expect(screen.queryAllByTestId('note-card')).toHaveLength(0);
  });
});

// M3 chunk 15b (BP-1 builder and overlay parts, BP-2, BP-3 C7 part): the Module Builder C7 at
// /client/modules/new and /client/modules/:id/edit (optional ?lesson=2, one based, opens with that lesson in the
// preview: the Edit module shortcut of C29 uses it).
// Written before the implementation. New text goes in language files; the strings below are the English values.
//
// UI CONTRACT (the implementer must provide; data layer = store.authoring, store.linkOverlays, store.attachments,
// store.modulePlacements, store.assignments.assign):
//   Access. New and edit of an own module need modules.manage. Edit of a provider module needs modules.addLinks.
//     Without it: role=alert "You don't have access to this. Ask your manager." and none of the fields below.
//   h1 "Module builder" (both routes). Library page /client/modules has a link "New module" to #/client/modules/new
//     (modules.manage).
//   OWN MODULE FIELDS (textboxes unless said):
//     "Title", "Description", "Paste your lessons" (textarea) with button "Turn into lessons" (replaces the lessons
//     with markdownToLessons of the text). Each lesson is data-testid="builder-lesson" with a textbox "Lesson title".
//     Each Markdown warning is data-testid="markdown-warning". The lessons list is rebuilt from the module on load.
//     "Add multiple choice question" and "Add true or false question" buttons append a data-testid="builder-question"
//     (data-question-id) with: textbox "Question", textbox "Explanation", textbox "Source reference" (optional),
//       multiple choice: textboxes "Option 1", "Option 2" ... each with a checkbox "Option N is correct", buttons
//       "Add option" (up to 6) and "Remove option N" (down to 2); two options at the start.
//       true or false: two radios "True is correct" and "False is correct" (the options are stored as True and False).
//     button "Remove question".
//     group "Job roles": one checkbox per job role name. group "Counts towards": one checkbox per requirement name.
//     checkbox "This module is optional". select "Category" (option "No category" plus category names; saved through
//     modulePlacements.setCategory when the draft is saved).
//     group "Quiz settings": select "Quiz mode" (Multiple choice, Scenarios, Mix), spinbutton "Questions per attempt"
//     (default 5 capped to the number of questions until the author changes it), spinbutton "Pass mark (%)"
//     (default 80), checkboxes "Shuffle questions", "Shuffle answers", "Show feedback", "Show source references",
//     select "Notes in quizzes" (options "Learner's choice" = choice, "Closed book only" = closedBookOnly), select
//     "Learn more links shown" (options "After a wrong answer" = wrong, "Always" = all).
//   LEARN MORE PANEL (own lessons and questions, and provider modules in the overlay panel): data-testid="link-target"
//     with data-target-kind="lesson"|"question" and data-target-id="<local key>", one per lesson and per question,
//     holding textboxes "Link title" and "Web address", a button "Add link", a file input labelled "Choose a PDF"
//     (type=file, accept application/pdf; uploads a learningDocument with the typed title, then adds the link), the
//     existing links as data-testid="link-item" (text: title) each with a button "Remove link", and an inline
//     role=alert "Links must start with https://." when the address is not https (nothing is added or stored).
//     In an own module links are held in the form (lesson.furtherReading, question.learnMore, kind organisation,
//     publisher the client display name, language en-GB, showFor from "Learn more links shown") until Save draft.
//     In the overlay panel "Add link" and the PDF upload save at once through linkOverlays.save.
//   BUTTONS. "Save draft" (role=status "Draft saved." on success; creates the module with authoring.create the first
//     time, authoring.saveDraft after; never runs the checklist). "Publish" (see below). Clicking Publish when the live
//     checklist has failures does not call authoring.publish.
//   PHONE PREVIEW. PhoneFrame with title "Phone preview" (region "Phone preview", data-phone-frame, 390px) showing the
//     current lesson: an h2 with the lesson title and its text, buttons "Previous lesson" and "Next lesson". A lesson
//     card has a button "Show in preview". The current lesson starts at lesson 1 or at ?lesson=n.
//   CHECKLIST. heading "Before you publish"; six items always listed in this order, each data-testid="checklist-item"
//     with data-item-id (title, lesson, question, quiz, requirement, links), data-passed="true"|"false", and the
//     words "Done" or "To do" in its text. Text of each item (all failing or passing the same text):
//       title "Give it a title of 3 to 100 characters"; lesson "Add at least one lesson with text";
//       question "Add at least one question"; quiz "Check the quiz settings";
//       requirement "Link a requirement or mark the module optional"; links "Every link must start with https://".
//     It is computed live from the form with publishChecklist. When Publish is clicked with failures: role=alert
//     containing "This can't be published yet. Fix the items listed first." and the failing items stay listed.
//     A checklistFailed RuleError from the data layer shows the same alert inline.
//   PUBLISH. With a passing checklist "Publish" opens a dialog (role=dialog, name "Publish as version N") with buttons
//     "Publish now" and "Cancel". When N > 1 it also has a checkbox "Ask people who completed version N-1 to take it
//     again" (unchecked), passed as reassign. After success: role=status "Published." with a button "Assign to
//     everyone" (assignments.assign to every active person, due 30 days on, and role=status "Assigned to N people.").
//     Nothing is assigned unless that button is pressed.
//   VERSIONS (edit of a published own module). data-testid="version-row" for each earlier version from
//     authoring.versions, newest first, text "Version n" and the published date, plus the current one.
//   PROVIDER MODULE (read only). Text "This training belongs to the provider, so you cannot change it. You can make
//     your own copy." (en-GB builder.readOnly). No "Title", "Paste your lessons", "Save draft", "Publish", question
//     or quiz controls. Heading "Add our own links" and the link-target panels. Section "No longer in this module"
//     with data-testid="orphan-overlay" per stored overlay whose target is gone, each with a button "Remove".
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RuleError, type ActorContext, type StoreHandle } from '@sta/data';
import { moduleIds } from '@sta/content';
import { type ClientLinkOverlay, type Module, type ModuleDraft, type Role, type RoleAssignment } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, TODAY } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
type Ctx = { handle: StoreHandle; keys: SeedKeys };
const priya = (keys: SeedKeys): ActorContext => actorFor('client', keys);
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];

const FORBIDDEN = "You don't have access to this. Ask your manager.";
const NOT_HTTPS = 'Links must start with https://.';
const CANT_PUBLISH = "This can't be published yet. Fix the items listed first.";
const READ_ONLY = 'This training belongs to the provider, so you cannot change it. You can make your own copy.';
const PROVIDER = moduleIds.safeguardingAndWhistleblowing;

const MARKDOWN = [
  '# Raise the alarm',
  'Shout fire and press the nearest call point.',
  '',
  '# Leave the building',
  'Lead the children to the assembly point.',
  '> Take the register with you.',
  '',
  '# Check everyone is out',
  'Count heads against the register.',
].join('\n');

/** Daniel gets exactly the permissions given. */
const danielWith =
  (permissionIds: string[]) =>
  async ({ handle, keys }: Ctx) => {
    const userId = need(keys.users['daniel']);
    const role: Role = {
      id: '01TEST0000000000000000C7C7',
      owner: { clientId: need(keys.clients['littleAcorns']) },
      name: 'Builder test role',
      description: 'Test only',
      colour: '#336699',
      permissionIds,
      system: false,
      version: 1,
      updatedBy: need(keys.users['priya']),
      updatedAt: TODAY,
    };
    const mine = (await dump<RoleAssignment>(handle, 'roleAssignments'))
      .filter((a) => a.userId === userId)
      .map((a) => ({ ...a, roleIds: [role.id] }));
    await handle.admin.bulkPut('roles', [role]);
    await handle.admin.bulkPut('roleAssignments', mine);
  };
const daniel = (keys: SeedKeys): ActorContext => ({
  userId: need(keys.users['daniel']),
  side: 'client',
  clientId: need(keys.clients['littleAcorns']),
  now: TODAY,
});

const ownModules = async ({ handle, keys }: Ctx): Promise<Module[]> =>
  (await handle.store.modules.list(priya(keys))).filter((m) => typeof m.owner !== 'string');
const fireOf = async (c: Ctx) => need((await ownModules(c)).find((m) => m.status === 'published'));
const loneOf = async (c: Ctx) => need((await ownModules(c)).find((m) => m.status === 'draft'));
const requirementsOf = async ({ handle, keys }: Ctx) => handle.store.requirements.list(priya(keys));

/** Opens the builder for a module picked after seeding, by navigating inside one store (ids are generated). */
async function openEdit(pick: (c: Ctx) => Promise<Module>, query = '', prepare?: (c: Ctx) => Promise<void>) {
  let id = '';
  const c = await renderRoute('/client/modules/new', 'client', {
    prepare: async (x) => {
      if (prepare) await prepare(x);
      id = (await pick(x)).id;
    },
  });
  await act(async () => {
    await c.router.navigate(`/client/modules/${id}/edit${query}`);
  });
  return { c, id };
}

const field = (name: string | RegExp) => screen.findByRole('textbox', { name });
const paste = async (text: string) => {
  fireEvent.change(await field('Paste your lessons'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Turn into lessons' }));
};
const lessons = () => screen.findAllByTestId('builder-lesson');
const questions = () => screen.queryAllByTestId('builder-question');
const targets = () => screen.findAllByTestId('link-target');
const targetOf = async (kind: 'lesson' | 'question', id: string) =>
  need(
    (await targets()).find(
      (el) => el.getAttribute('data-target-kind') === kind && el.getAttribute('data-target-id') === id,
    ),
  );
const status = (text: string) => screen.findByText(text, { selector: '[role="status"], [role="status"] *' });

/** Adds a multiple choice question: prompt, two options (the first correct) and an explanation. */
async function addMcq(prompt: string, right: string, wrong: string, explanation: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Add multiple choice question' }));
  const card = need(questions().at(-1));
  fireEvent.change(within(card).getByRole('textbox', { name: 'Question' }), { target: { value: prompt } });
  fireEvent.change(within(card).getByRole('textbox', { name: 'Option 1' }), { target: { value: right } });
  fireEvent.change(within(card).getByRole('textbox', { name: 'Option 2' }), { target: { value: wrong } });
  await user.click(within(card).getByRole('checkbox', { name: 'Option 1 is correct' }));
  fireEvent.change(within(card).getByRole('textbox', { name: 'Explanation' }), { target: { value: explanation } });
  return card;
}
async function addTrueFalse(prompt: string, explanation: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Add true or false question' }));
  const card = need(questions().at(-1));
  fireEvent.change(within(card).getByRole('textbox', { name: 'Question' }), { target: { value: prompt } });
  await user.click(within(card).getByRole('radio', { name: 'False is correct' }));
  fireEvent.change(within(card).getByRole('textbox', { name: 'Explanation' }), { target: { value: explanation } });
  return card;
}
const checklist = () => screen.getAllByTestId('checklist-item');
const failing = () =>
  checklist()
    .filter((el) => el.getAttribute('data-passed') === 'false')
    .map((el) => el.getAttribute('data-item-id'));

const pdfBytes = (): File =>
  new File([new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')], 'guide.pdf', {
    type: 'application/pdf',
  });

describe('C7 Module Builder: access', () => {
  it('shows the no-access message and no fields without modules.manage', async () => {
    await renderRoute('/client/modules/new', 'client', {
      prepare: danielWith(['modules.view']),
      actor: daniel,
    });
    expect((await screen.findByRole('alert')).textContent).toContain(FORBIDDEN);
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
  });

  it('shows the no-access message when editing an own module without modules.manage', async () => {
    const perms = danielWith(['modules.view', 'modules.addLinks']);
    let id = '';
    const c = await renderRoute('/client/modules/new', 'client', {
      prepare: async (x) => {
        await perms(x);
        id = (await fireOf(x)).id;
      },
      actor: daniel,
    });
    await act(async () => {
      await c.router.navigate(`/client/modules/${id}/edit`);
    });
    expect((await screen.findByRole('alert')).textContent).toContain(FORBIDDEN);
  });

  it('shows the no-access message on a provider module without modules.addLinks, even with modules.manage', async () => {
    await renderRoute(`/client/modules/${PROVIDER}/edit`, 'client', {
      prepare: danielWith(['modules.view', 'modules.manage']),
      actor: daniel,
    });
    expect((await screen.findByRole('alert')).textContent).toContain(FORBIDDEN);
    expect(screen.queryByRole('heading', { name: 'Add our own links' })).toBeNull();
  });

  it('is reached from the library through a New module link', async () => {
    await renderRoute('/client/modules', 'client');
    const link = await screen.findByRole('link', { name: 'New module' });
    expect(link.getAttribute('href')).toMatch(/\/client\/modules\/new$/);
  });
});

describe('C7 Module Builder: Markdown to lessons (BP-2)', () => {
  it('turns pasted text with three headings into three lessons, with titles from the headings', async () => {
    await renderRoute('/client/modules/new', 'client');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Module builder');
    await paste(
      [
        '# Raise the alarm',
        'Shout fire.',
        '# Leave the building',
        'Go to the assembly point.',
        '# Check everyone is out',
        'Count heads.',
      ].join('\n'),
    );
    const found = await lessons();
    expect(found).toHaveLength(3);
    expect(
      found.map((el) => within(el).getByRole<HTMLInputElement>('textbox', { name: 'Lesson title' }).value),
    ).toEqual(['Raise the alarm', 'Leave the building', 'Check everyone is out']);
  });

  it('puts text before the first heading into an Introduction lesson', async () => {
    await renderRoute('/client/modules/new', 'client');
    await paste('Welcome to the fire drill.\n\n# Raise the alarm\nShout fire.');
    const found = await lessons();
    expect(found).toHaveLength(2);
    expect(within(found[0]!).getByRole<HTMLInputElement>('textbox', { name: 'Lesson title' }).value).toBe(
      'Introduction',
    );
  });

  it('lists dropped images, html and non-https links as warnings and keeps them out of the lessons', async () => {
    await renderRoute('/client/modules/new', 'client');
    await paste(
      [
        '# Intro',
        'See ![plan](https://example.invalid/plan.png) for the layout.',
        '<script>alert(1)</script>',
        'Read [the site](http://example.invalid/a) too.',
      ].join('\n'),
    );
    await lessons();
    expect(screen.getAllByTestId('markdown-warning')).toHaveLength(3);
    expect(document.body.textContent).not.toContain('<script>');
    expect(document.body.textContent).not.toContain('http://example.invalid/a');
  });

  it('stores key points, a callout and paragraphs as blocks when the draft is saved', async () => {
    const c = await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    fireEvent.change(await field('Title'), { target: { value: 'Fire drill basics' } });
    // A list only becomes key points inside a lesson called Key points (domain rule, assumption 12).
    await paste(`${MARKDOWN}\n\n## Key points\n- Stay calm\n- Do not use the lifts`);
    expect(await lessons()).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await status('Draft saved.');
    const saved = need((await ownModules(c)).find((m) => m.title === 'Fire drill basics'));
    expect(saved.lessons.map((l) => l.title)).toEqual([
      'Raise the alarm',
      'Leave the building',
      'Check everyone is out',
      'Key points',
    ]);
    const kinds = saved.lessons.flatMap((l) => l.blocks.map((b) => b.kind));
    expect(kinds).toContain('keyPoints');
    expect(kinds).toContain('callout');
    expect(kinds).toContain('text');
    expect(saved.lessons.every((l) => l.minutes >= 1)).toBe(true);
  });
});

describe('C7 Module Builder: questions, roles, category and quiz settings (BP-2)', () => {
  it('saves a multiple choice and a true or false question with explanations', async () => {
    const c = await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    fireEvent.change(await field('Title'), { target: { value: 'Quiz authoring' } });
    await paste('# One\nText.');
    await addMcq('Where do you meet?', 'The assembly point', 'The kitchen', 'The assembly point is outside and safe.');
    await addTrueFalse('Lifts are fine in a fire. True or false?', 'Never use the lifts.');
    expect(questions()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await status('Draft saved.');
    const saved = need((await ownModules(c)).find((m) => m.title === 'Quiz authoring'));
    const [mcq, tf] = saved.questions;
    expect(mcq?.type).toBe('mcq');
    expect(mcq?.prompt).toBe('Where do you meet?');
    expect(mcq?.explanation).toBe('The assembly point is outside and safe.');
    expect(mcq?.options?.map((o) => [o.text, o.correct])).toEqual([
      ['The assembly point', true],
      ['The kitchen', false],
    ]);
    expect(tf?.type).toBe('trueFalse');
    expect(tf?.options?.map((o) => [o.text, o.correct])).toEqual([
      ['True', false],
      ['False', true],
    ]);
    expect(tf?.explanation).toBe('Never use the lifts.');
  });

  it('allows 2 to 6 options on a multiple choice question', async () => {
    await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add multiple choice question' }));
    const card = need(questions()[0]);
    for (let i = 0; i < 4; i += 1) await user.click(within(card).getByRole('button', { name: 'Add option' }));
    expect(within(card).getByRole('textbox', { name: 'Option 6' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Add option' })).toBeNull();
    for (let i = 0; i < 4; i += 1) await user.click(within(card).getByRole('button', { name: /^Remove option/ }));
    expect(within(card).queryByRole('button', { name: /^Remove option/ })).toBeNull();
    expect(within(card).getAllByRole('textbox', { name: /^Option \d$/ })).toHaveLength(2);
  });

  it('removes a question', async () => {
    await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add true or false question' }));
    expect(questions()).toHaveLength(1);
    await user.click(within(need(questions()[0])).getByRole('button', { name: 'Remove question' }));
    expect(questions()).toHaveLength(0);
  });

  it('saves job roles, requirement, category and quiz settings', async () => {
    const c = await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    const role = need((await c.handle.store.jobRoles.list(priya(c.keys)))[0]);
    const req = need((await requirementsOf(c))[0]);
    const cat = need((await c.handle.store.categories.list(priya(c.keys)))[0]);
    fireEvent.change(await field('Title'), { target: { value: 'Settings module' } });
    await paste('# One\nText.');
    await addMcq('Q one?', 'Yes', 'No', 'Because.');
    await addTrueFalse('Q two?', 'Because two.');
    await user.click(
      within(screen.getByRole('group', { name: 'Job roles' })).getByRole('checkbox', { name: role.name }),
    );
    await user.click(
      within(screen.getByRole('group', { name: 'Counts towards' })).getByRole('checkbox', { name: req.name }),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), cat.name);
    const quiz = screen.getByRole('group', { name: 'Quiz settings' });
    fireEvent.change(within(quiz).getByRole('spinbutton', { name: 'Questions per attempt' }), {
      target: { value: '2' },
    });
    fireEvent.change(within(quiz).getByRole('spinbutton', { name: 'Pass mark (%)' }), { target: { value: '70' } });
    await user.click(within(quiz).getByRole('checkbox', { name: 'Shuffle answers' }));
    await user.selectOptions(within(quiz).getByRole('combobox', { name: 'Notes in quizzes' }), 'Closed book only');
    await user.selectOptions(within(quiz).getByRole('combobox', { name: 'Learn more links shown' }), 'Always');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await status('Draft saved.');
    const saved = need((await ownModules(c)).find((m) => m.title === 'Settings module'));
    expect(saved.roleTags).toEqual([role.id]);
    expect(saved.requirementIds).toEqual([req.id]);
    expect(saved.quiz.drawCount).toBe(2);
    expect(saved.quiz.passMark).toBe(70);
    expect(saved.quiz.notesInQuiz).toBe('closedBookOnly');
    expect(saved.quiz.learnMoreFor).toBe('all');
    expect(saved.quiz.shuffleOptions).toBe(false);
    const placements = await c.handle.store.modulePlacements.list(priya(c.keys));
    expect(placements.find((p) => p.moduleId === saved.id)?.categoryId).toBe(cat.id);
  });

  it('saves the optional choice instead of a requirement', async () => {
    const c = await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    fireEvent.change(await field('Title'), { target: { value: 'Optional module' } });
    await user.click(screen.getByRole('checkbox', { name: 'This module is optional' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await status('Draft saved.');
    expect(need((await ownModules(c)).find((m) => m.title === 'Optional module')).optional).toBe(true);
  });
});

describe('C7 Module Builder: save draft (BP-2)', () => {
  it('creates one draft module, version 1, and saving again updates it instead of adding another', async () => {
    const c = await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    const before = (await ownModules(c)).length;
    fireEvent.change(await field('Title'), { target: { value: 'My new module' } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await status('Draft saved.');
    const first = await ownModules(c);
    expect(first).toHaveLength(before + 1);
    const saved = need(first.find((m) => m.title === 'My new module'));
    expect(saved.status).toBe('draft');
    expect(saved.version).toBe(1);
    fireEvent.change(await field('Title'), { target: { value: 'My new module, renamed' } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(async () => {
      expect((await ownModules(c)).find((m) => m.id === saved.id)?.title).toBe('My new module, renamed');
    });
    expect(await ownModules(c)).toHaveLength(before + 1);
  });

  it('does not run the checklist when saving: an empty title still saves a draft or shows an inline message, never a crash', async () => {
    const c = await renderRoute('/client/modules/new', 'client');
    const publish = vi.spyOn(c.handle.store.authoring, 'publish');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(screen.queryByRole('status') ?? screen.queryByRole('alert')).not.toBeNull();
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('opens a saved draft with its title, lessons and questions filled in (what a reload shows)', async () => {
    const { c } = await openEdit(loneOf);
    const lone = await loneOf(c);
    expect((await screen.findByRole<HTMLInputElement>('textbox', { name: 'Title' })).value).toBe(lone.title);
    expect(
      (await lessons()).map((el) => within(el).getByRole<HTMLInputElement>('textbox', { name: 'Lesson title' }).value),
    ).toEqual(lone.lessons.map((l) => l.title));
    expect(await screen.findAllByTestId('builder-question')).toHaveLength(lone.questions.length);
  });

  it('shows an unknown module as an alert, not an empty page', async () => {
    await renderRoute('/client/modules/01NOSUCHMODULE0000000000000/edit', 'client');
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('C7 Module Builder: phone preview (BP-2)', () => {
  it('shows the first lesson in a 390px phone frame and steps through the lessons', async () => {
    await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    await paste(MARKDOWN);
    const region = await screen.findByRole('region', { name: 'Phone preview' });
    const frame = need(region.closest<HTMLElement>('[data-phone-frame]'));
    expect(frame.style.width).toBe('390px');
    expect(within(region).getByRole('heading', { level: 2, name: 'Raise the alarm' })).toBeTruthy();
    expect(region.textContent).toContain('Shout fire and press the nearest call point.');
    await user.click(within(region).getByRole('button', { name: 'Next lesson' }));
    expect(within(region).getByRole('heading', { level: 2, name: 'Leave the building' })).toBeTruthy();
    await user.click(within(region).getByRole('button', { name: 'Previous lesson' }));
    expect(within(region).getByRole('heading', { level: 2, name: 'Raise the alarm' })).toBeTruthy();
  });

  it('follows Show in preview on a lesson card and updates when the lesson title is edited', async () => {
    await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    await paste(MARKDOWN);
    const cards = await lessons();
    await user.click(within(need(cards[2])).getByRole('button', { name: 'Show in preview' }));
    const region = screen.getByRole('region', { name: 'Phone preview' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Check everyone is out' })).toBeTruthy();
    fireEvent.change(within(need(cards[2])).getByRole('textbox', { name: 'Lesson title' }), {
      target: { value: 'Count everyone' },
    });
    expect(within(region).getByRole('heading', { level: 2, name: 'Count everyone' })).toBeTruthy();
  });

  it('opens at the lesson named by ?lesson=2 (Edit module from module feedback)', async () => {
    const { c } = await openEdit(fireOf, '?lesson=2');
    const fire = await fireOf(c);
    const region = await screen.findByRole('region', { name: 'Phone preview' });
    expect(within(region).getByRole('heading', { level: 2, name: need(fire.lessons[1]).title })).toBeTruthy();
  });
});

describe('C7 Module Builder: publish checklist (BP-2)', () => {
  it('always lists the six items in order, all To do on an empty module', async () => {
    await renderRoute('/client/modules/new', 'client');
    expect((await screen.findByRole('heading', { name: 'Before you publish' })).textContent).toBe('Before you publish');
    expect(checklist().map((el) => el.getAttribute('data-item-id'))).toEqual([
      'title',
      'lesson',
      'question',
      'quiz',
      'requirement',
      'links',
    ]);
    expect(failing()).toEqual(expect.arrayContaining(['title', 'lesson', 'question', 'quiz', 'requirement']));
    const byId = (id: string) => need(checklist().find((el) => el.getAttribute('data-item-id') === id));
    expect(byId('title').textContent).toContain('Give it a title of 3 to 100 characters');
    expect(byId('lesson').textContent).toContain('Add at least one lesson with text');
    expect(byId('question').textContent).toContain('Add at least one question');
    expect(byId('quiz').textContent).toContain('Check the quiz settings');
    expect(byId('requirement').textContent).toContain('Link a requirement or mark the module optional');
    expect(byId('links').textContent).toContain('Every link must start with https://');
    expect(byId('title').textContent).toContain('To do');
  });

  it('turns items to Done as the form is filled in, with words and not colour alone', async () => {
    const c = await renderRoute('/client/modules/new', 'client');
    const user = userEvent.setup();
    fireEvent.change(await field('Title'), { target: { value: 'Fire drill' } });
    await waitFor(() => {
      expect(failing()).not.toContain('title');
    });
    const title = need(checklist().find((el) => el.getAttribute('data-item-id') === 'title'));
    expect(title.textContent).toContain('Done');
    await paste('# One\nSome text.');
    await addMcq('Where?', 'Outside', 'Inside', 'Outside is safe.');
    await user.click(screen.getByRole('checkbox', { name: 'This module is optional' }));
    await waitFor(() => {
      expect(failing()).toEqual([]);
    });
    const req = need((await requirementsOf(c))[0]);
    expect(req.name.length).toBeGreaterThan(0);
  });

  it('lists exactly the failing item for the seeded draft, and blocks Publish without calling the data layer', async () => {
    let publishCalls = (): number => -1;
    const { c } = await openEdit(loneOf, '', ({ handle }) => {
      const spy = vi.spyOn(handle.store.authoring, 'publish');
      publishCalls = () => spy.mock.calls.length;
      return Promise.resolve();
    });
    await field('Title');
    expect(failing()).toEqual(['requirement']);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(CANT_PUBLISH);
    expect(failing()).toEqual(['requirement']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(publishCalls()).toBe(0);
    expect((await loneOf(c)).status).toBe('draft');
  });

  it('shows a checklistFailed refusal from the data layer inline', async () => {
    await openEdit(loneOf, '', ({ handle }) => {
      vi.spyOn(handle.store.authoring, 'publish').mockRejectedValue(new RuleError('checklistFailed'));
      return Promise.resolve();
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'This module is optional' }));
    await waitFor(() => {
      expect(failing()).toEqual([]);
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(await screen.findByRole('button', { name: 'Publish now' }));
    expect((await screen.findByRole('alert')).textContent).toContain(CANT_PUBLISH);
  });
});

describe('C7 Module Builder: publish, version n+1 and re-assign (BP-2)', () => {
  const assignmentsFor = async (c: Ctx, moduleId: string) =>
    (await dump<{ target: { moduleId?: string } }>(c.handle, 'assignments')).filter(
      (a) => a.target.moduleId === moduleId,
    );

  it('publishes a valid never-published module at version 1 and creates no assignments by itself', async () => {
    const { c, id } = await openEdit(loneOf);
    const user = userEvent.setup();
    const req = need((await requirementsOf(c))[0]);
    await user.click(
      within(await screen.findByRole('group', { name: 'Counts towards' })).getByRole('checkbox', { name: req.name }),
    );
    await waitFor(() => {
      expect(failing()).toEqual([]);
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish as version 1' });
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Publish now' }));
    await status('Published.');
    const published = need((await ownModules(c)).find((m) => m.id === id));
    expect(published.status).toBe('published');
    expect(published.version).toBe(1);
    expect(published.requirementIds).toEqual([req.id]);
    expect(await assignmentsFor(c, id)).toHaveLength(0);
  });

  it('assigns to everyone only when Assign to everyone is chosen after publishing', async () => {
    const { c, id } = await openEdit(loneOf);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'This module is optional' }));
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish now' }));
    await status('Published.');
    expect(await assignmentsFor(c, id)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Assign to everyone' }));
    await waitFor(async () => {
      expect((await assignmentsFor(c, id)).length).toBeGreaterThanOrEqual(10);
    });
    expect(await screen.findByText(/^Assigned to \d+ people\.$/)).toBeTruthy();
  });

  it('edits a published own module as a draft: the published record stays at its version until publish', async () => {
    const { c, id } = await openEdit(fireOf);
    const user = userEvent.setup();
    const before = await fireOf(c);
    fireEvent.change(await field('Title'), { target: { value: `${before.title} (edited)` } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await status('Draft saved.');
    const draft: ModuleDraft | null = await c.handle.store.authoring.drafts.get(priya(c.keys), id);
    expect(draft?.module.title).toBe(`${before.title} (edited)`);
    const after = await fireOf(c);
    expect(after.title).toBe(before.title);
    expect(after.version).toBe(before.version);
  });

  it('publishes the edit as version n+1 with a snapshot of the previous version and no re-assign by default', async () => {
    const { c, id } = await openEdit(fireOf);
    const user = userEvent.setup();
    const before = await fireOf(c);
    expect(before.version).toBe(2);
    const assignmentsBefore = (await assignmentsFor(c, id)).length;
    fireEvent.change(await field('Title'), { target: { value: `${before.title} v3` } });
    await user.click(await screen.findByRole('checkbox', { name: 'This module is optional' }));
    await waitFor(() => {
      expect(failing()).toEqual([]);
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish as version 3' });
    const ask = within(dialog).getByRole<HTMLInputElement>('checkbox', {
      name: 'Ask people who completed version 2 to take it again',
    });
    expect(ask.checked).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Publish now' }));
    await status('Published.');
    const after = await fireOf(c);
    expect(after.version).toBe(3);
    expect(after.title).toBe(`${before.title} v3`);
    const versions = await c.handle.store.authoring.versions(priya(c.keys), id);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[1]?.module.title).toBe(before.title);
    expect(await c.handle.store.authoring.drafts.get(priya(c.keys), id)).toBeNull();
    expect((await assignmentsFor(c, id)).length).toBe(assignmentsBefore);
  });

  it('creates assignments for earlier completers only when the re-assign box is ticked', async () => {
    const { c, id } = await openEdit(fireOf);
    const user = userEvent.setup();
    const assignmentsBefore = (await assignmentsFor(c, id)).length;
    await field('Title');
    await user.click(await screen.findByRole('checkbox', { name: 'This module is optional' }));
    await waitFor(() => {
      expect(failing()).toEqual([]);
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish as version 3' });
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Ask people who completed version 2 to take it again' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Publish now' }));
    await status('Published.');
    await waitFor(async () => {
      expect((await assignmentsFor(c, id)).length).toBeGreaterThan(assignmentsBefore);
    });
  });

  it('lists the earlier versions, newest first', async () => {
    await openEdit(fireOf);
    const rows = await screen.findAllByTestId('version-row');
    expect(rows.map((r) => /Version (\d+)/.exec(r.textContent)?.[1])).toEqual(['2', '1']);
  });
});

describe('C7 Module Builder: Learn more links on an own module (BP-1)', () => {
  const openLone = async () => {
    const { c, id } = await openEdit(loneOf);
    return { c, id, lone: await loneOf(c) };
  };

  it('adds an https link to a lesson and a question and keeps them in the module when saved', async () => {
    const { c, id, lone } = await openLone();
    const user = userEvent.setup();
    const lessonKey = need(lone.lessons[0]).id;
    const questionKey = need(lone.questions[0]).id;
    for (const [kind, key, title] of [
      ['lesson', lessonKey, 'HSE fire guidance'],
      ['question', questionKey, 'GOV.UK fire safety'],
    ] as const) {
      const panel = await targetOf(kind, key);
      fireEvent.change(within(panel).getByRole('textbox', { name: 'Link title' }), { target: { value: title } });
      fireEvent.change(within(panel).getByRole('textbox', { name: 'Web address' }), {
        target: { value: 'https://www.gov.uk/workplace-fire-safety-your-responsibilities' },
      });
      await user.click(within(panel).getByRole('button', { name: 'Add link' }));
      expect(within(await targetOf(kind, key)).getByTestId('link-item').textContent).toContain(title);
    }
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await status('Draft saved.');
    const saved = need((await ownModules(c)).find((m) => m.id === id));
    const lessonLink = saved.lessons[0]?.furtherReading?.[0];
    expect(lessonLink?.url).toBe('https://www.gov.uk/workplace-fire-safety-your-responsibilities');
    expect(lessonLink?.kind).toBe('organisation');
    expect(saved.questions[0]?.learnMore[0]?.title).toBe('GOV.UK fire safety');
  });

  it.each([['http://example.invalid/a'], ['javascript:alert(1)'], ['data:text/html,hi'], ['/relative/path']])(
    'refuses %s inline with the https message and adds nothing',
    async (url) => {
      const { c, id, lone } = await openLone();
      const user = userEvent.setup();
      const panel = await targetOf('lesson', need(lone.lessons[0]).id);
      fireEvent.change(within(panel).getByRole('textbox', { name: 'Link title' }), { target: { value: 'Bad link' } });
      fireEvent.change(within(panel).getByRole('textbox', { name: 'Web address' }), { target: { value: url } });
      await user.click(within(panel).getByRole('button', { name: 'Add link' }));
      expect((await within(await targetOf('lesson', need(lone.lessons[0]).id)).findByRole('alert')).textContent).toBe(
        NOT_HTTPS,
      );
      expect(within(await targetOf('lesson', need(lone.lessons[0]).id)).queryAllByTestId('link-item')).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Save draft' }));
      await status('Draft saved.');
      expect(need((await ownModules(c)).find((m) => m.id === id)).lessons[0]?.furtherReading ?? []).toHaveLength(0);
    },
  );

  it('uploads a PDF learning document and links it from a question', async () => {
    const { c, id, lone } = await openLone();
    const user = userEvent.setup();
    const key = need(lone.questions[0]).id;
    const panel = await targetOf('question', key);
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Link title' }), {
      target: { value: 'Our lone working policy' },
    });
    await user.upload(within(panel).getByLabelText('Choose a PDF'), pdfBytes());
    await waitFor(async () => {
      expect(within(await targetOf('question', key)).getAllByTestId('link-item')).toHaveLength(1);
    });
    const docs = (await dump<{ purpose?: string; mime?: string; clientId: string }>(c.handle, 'attachments')).filter(
      (a) => a.purpose === 'learningDocument',
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]?.mime).toBe('application/pdf');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await status('Draft saved.');
    const link = need((await ownModules(c)).find((m) => m.id === id)).questions[0]?.learnMore[0];
    expect(link?.attachmentId).toBeTruthy();
    expect(link?.url).toBeUndefined();
  });

  it('removes a link it added', async () => {
    const { lone } = await openLone();
    const user = userEvent.setup();
    const key = need(lone.lessons[0]).id;
    const panel = await targetOf('lesson', key);
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Link title' }), { target: { value: 'To remove' } });
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Web address' }), {
      target: { value: 'https://www.hse.gov.uk/' },
    });
    await user.click(within(panel).getByRole('button', { name: 'Add link' }));
    await user.click(within(await targetOf('lesson', key)).getByRole('button', { name: 'Remove link' }));
    expect(within(await targetOf('lesson', key)).queryAllByTestId('link-item')).toHaveLength(0);
  });
});

describe('C7 Module Builder: provider module overlay panel only (BP-1, BP-3)', () => {
  const open = (extra: Parameters<typeof renderRoute>[2] = {}) =>
    renderRoute(`/client/modules/${PROVIDER}/edit`, 'client', extra);
  const provider = (c: Ctx) => c.handle.store.modules.get(priya(c.keys), PROVIDER);
  const overlays = (c: Ctx) => dump<ClientLinkOverlay>(c.handle, 'clientLinkOverlays');

  it('shows the read-only note and the Add our own links panels, with no edit controls', async () => {
    await open();
    expect(await screen.findByRole('heading', { name: 'Add our own links' })).toBeTruthy();
    expect(screen.getByText(READ_ONLY)).toBeTruthy();
    for (const name of ['Title', 'Description', 'Paste your lessons']) {
      expect(screen.queryByRole('textbox', { name }), name).toBeNull();
    }
    for (const name of ['Save draft', 'Publish', 'Turn into lessons', 'Add multiple choice question']) {
      expect(screen.queryByRole('button', { name }), name).toBeNull();
    }
    expect(screen.queryByRole('group', { name: 'Quiz settings' })).toBeNull();
    expect(screen.queryAllByTestId('builder-question')).toHaveLength(0);
    expect(screen.queryAllByTestId('builder-lesson')).toHaveLength(0);
  });

  it('has one link panel per lesson and per question of the module', async () => {
    const c = await open();
    const m = await provider(c);
    const found = await targets();
    expect(
      found
        .filter((el) => el.getAttribute('data-target-kind') === 'lesson')
        .map((el) => el.getAttribute('data-target-id'))
        .sort(),
    ).toEqual(m.lessons.map((l) => l.id).sort());
    expect(
      found
        .filter((el) => el.getAttribute('data-target-kind') === 'question')
        .map((el) => el.getAttribute('data-target-id'))
        .sort(),
    ).toEqual(m.questions.map((q) => q.id).sort());
  });

  it('saves an https link and a PDF as overlays on a lesson and a question and leaves the module unchanged', async () => {
    const c = await open();
    const user = userEvent.setup();
    const before = JSON.stringify(await provider(c));
    const m = await provider(c);
    const lessonKey = need(m.lessons[0]).id;
    const questionKey = need(m.questions[0]).id;
    let panel = await targetOf('lesson', lessonKey);
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Link title' }), {
      target: { value: 'Our safeguarding lead' },
    });
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Web address' }), {
      target: { value: 'https://example.invalid/our-lead' },
    });
    await user.click(within(panel).getByRole('button', { name: 'Add link' }));
    panel = await targetOf('question', questionKey);
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Link title' }), {
      target: { value: 'Our policy PDF' },
    });
    await user.upload(within(panel).getByLabelText('Choose a PDF'), pdfBytes());
    // The seed already holds two overlays on this module (the client's safeguarding policy on two questions), so
    // the new links are looked up by title; a link added to a target that has an overlay joins it.
    const titles = async () =>
      (await overlays(c)).filter((o) => o.moduleId === PROVIDER).flatMap((o) => o.links.map((l) => l.title));
    await waitFor(async () => {
      expect(await titles()).toEqual(expect.arrayContaining(['Our safeguarding lead', 'Our policy PDF']));
    });
    const stored = (await overlays(c)).filter((o) => o.moduleId === PROVIDER);
    const onLesson = stored.find((o) => o.lessonId === lessonKey);
    const onQuestion = stored.find((o) => o.questionId === questionKey);
    expect(onLesson?.links[0]).toMatchObject({
      title: 'Our safeguarding lead',
      url: 'https://example.invalid/our-lead',
      kind: 'organisation',
    });
    expect(onQuestion?.links.find((l) => l.title === 'Our policy PDF')?.attachmentId).toBeTruthy();
    expect(JSON.stringify(await provider(c))).toBe(before);
    expect(within(await targetOf('lesson', lessonKey)).getAllByTestId('link-item')).toHaveLength(1);
  });

  it.each([['http://example.invalid/a'], ['javascript:alert(1)'], ['data:text/html,hi'], ['relative/path']])(
    'refuses %s with the inline https message and stores nothing',
    async (url) => {
      const c = await open();
      const user = userEvent.setup();
      const count = async () => (await overlays(c)).filter((o) => o.moduleId === PROVIDER).length;
      const seeded = await count(); // the seed already has two overlays on this module
      const key = need((await provider(c)).lessons[0]).id;
      const panel = await targetOf('lesson', key);
      fireEvent.change(within(panel).getByRole('textbox', { name: 'Link title' }), { target: { value: 'Bad' } });
      fireEvent.change(within(panel).getByRole('textbox', { name: 'Web address' }), { target: { value: url } });
      await user.click(within(panel).getByRole('button', { name: 'Add link' }));
      expect((await within(await targetOf('lesson', key)).findByRole('alert')).textContent).toBe(NOT_HTTPS);
      expect(await count()).toBe(seeded);
    },
  );

  it('removes a saved link', async () => {
    const c = await open();
    const user = userEvent.setup();
    const key = need((await provider(c)).lessons[0]).id;
    const panel = await targetOf('lesson', key);
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Link title' }), { target: { value: 'Short lived' } });
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Web address' }), {
      target: { value: 'https://example.invalid/x' },
    });
    await user.click(within(panel).getByRole('button', { name: 'Add link' }));
    await waitFor(() => {
      expect(
        within(
          screen.getAllByTestId('link-target').find((el) => el.getAttribute('data-target-id') === key)!,
        ).queryAllByTestId('link-item'),
      ).toHaveLength(1);
    });
    await user.click(within(await targetOf('lesson', key)).getByRole('button', { name: 'Remove link' }));
    await waitFor(async () => {
      const left = (await overlays(c)).filter((o) => o.moduleId === PROVIDER && o.lessonId === key);
      expect(left.flatMap((o) => o.links)).toHaveLength(0);
    });
  });

  it('lists links of a dropped question under No longer in this module, with Remove', async () => {
    const c = await open({
      prepare: async ({ handle, keys }) => {
        const overlay: ClientLinkOverlay = {
          id: '01TEST0000000000000000AB01',
          clientId: need(keys.clients['littleAcorns']),
          moduleId: PROVIDER,
          questionId: 'q-dropped-in-v2',
          links: [
            {
              id: 'orphan-1',
              title: 'Old question link',
              url: 'https://example.invalid/old',
              publisher: 'Little Acorns',
              kind: 'organisation',
              language: 'en-GB',
              showFor: 'wrong',
            },
          ],
          addedBy: need(keys.users['priya']),
          addedAt: TODAY,
        };
        await handle.admin.bulkPut('clientLinkOverlays', [overlay]);
      },
    });
    const user = userEvent.setup();
    const orphan = await screen.findByTestId('orphan-overlay');
    expect(screen.getByRole('heading', { name: 'No longer in this module' })).toBeTruthy();
    expect(orphan.textContent).toContain('Old question link');
    expect((await targets()).every((el) => el.getAttribute('data-target-id') !== 'q-dropped-in-v2')).toBe(true);
    await user.click(within(orphan).getByRole('button', { name: 'Remove' }));
    await waitFor(async () => {
      expect((await overlays(c)).filter((o) => o.id === '01TEST0000000000000000AB01')).toHaveLength(0);
    });
    expect(screen.queryByTestId('orphan-overlay')).toBeNull();
  });
});

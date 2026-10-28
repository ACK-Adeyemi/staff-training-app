// M3 chunk 15a (BP-1 C6 parts, BP-3 UI, C4 group option): C6 Module Library, Preview as a learner, Assign by group.
// Preview as a learner at /client/modules/:id/preview (no lessonId): h1 t('preview.title'), PhoneFrame with an h2 per
// lesson, buttons "Previous lesson" (hidden on the first) and "Next lesson", a tab "Quiz" listing the module's
// questions as radio options; picking one shows its explanation (data-testid="preview-explanation") and writes
// nothing. Missing module: role=alert. Needs modules.view held anywhere, else the no-access alert.
// Written before the implementation. Contract the implementer must provide (new text goes in language files; the
// strings below are the English values the tests look for).
//   C6 /client/modules   needs modules.view (without it: role=alert t('errors.forbidden'), no list).
//     h1 "Training". A search box (textbox "Search"), selects "Source" (All, Provider, Own), "Status" (All, Draft,
//     Published, Archived), "Category" (All plus the client's category names), "Sort by" (Last edited, Title,
//     Completion rate, Overdue), and a view toggle of two buttons "Cards" and "Table" (aria-pressed).
//     Every module (and nothing else) is one element with data-testid="module-item" and data-module-id="<id>" in
//     both views (a card or a table row). Its text holds the title, a badge "Provider" or "Own", a status word
//     (Draft, Published, Archived), "Version n", the last edited date (formatLondonDate) and a rating line
//     "Rating: 4.5 out of 5" (one decimal) or "No ratings yet".
//     Actions inside the item, by accessible name:
//       "Preview as a learner"  link to /client/modules/:id/preview     (everyone with modules.view)
//       "Duplicate"             button                                  (modules.manage; provider and own)
//       "Edit"                  link to /client/modules/:id/edit        (own, modules.manage)
//       "Archive"               button                                  (own, modules.manage, not archived)
//       "Delete"                button, opens a dialog with /confirm/i and /cancel/i (own, modules.manage)
//       "Export JSON"           button, downloads the module JSON via a Blob object URL (own, modules.manage)
//       "Add our own links"     link to /client/modules/:id/edit...     (provider modules, modules.addLinks)
//     Provider modules never show Edit, Archive, Delete or Export JSON (BP-3).
//     Duplicate success: role=status containing the responsibility note
//     "This copy is yours. It will not get our updates and you are responsible for keeping it accurate." and the new
//     own draft appears in the list. A refusal shows role=alert with the matching errors.* message, inline.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import { moduleIds, packageIds } from '@sta/content';
import type { Client, Module, Role, RoleAssignment } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { formatLondonDate } from '../../demo/format';
import { actorFor, renderRoute, t, TODAY } from '../../test/harness';

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
  vi.unstubAllGlobals();
});

const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
type Ctx = { handle: StoreHandle; keys: SeedKeys };
const priya = (keys: SeedKeys) => actorFor('client', keys);
const danielActor = (keys: SeedKeys): ActorContext => ({
  userId: need(keys.users['daniel']),
  side: 'client',
  clientId: need(keys.clients['littleAcorns']),
  now: TODAY,
});
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];

const NOTE = 'This copy is yours. It will not get our updates and you are responsible for keeping it accurate.';
const FORBIDDEN = "You don't have access to this. Ask your manager.";

/** Daniel gets exactly the permissions given, so the library's gating can be checked per permission. */
const danielWith =
  (permissionIds: string[]) =>
  async ({ handle, keys }: Ctx) => {
    const userId = need(keys.users['daniel']);
    const role: Role = {
      id: '01TEST0000000000000000C6C6',
      owner: { clientId: need(keys.clients['littleAcorns']) },
      name: 'Library test role',
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

async function ownModules({ handle, keys }: Ctx): Promise<Module[]> {
  const all = await handle.store.modules.list(priya(keys));
  return all.filter((m) => typeof m.owner !== 'string' && 'clientId' in m.owner);
}
const fireOf = async (c: Ctx) => need((await ownModules(c)).find((m) => m.status === 'published'));
const loneOf = async (c: Ctx) => need((await ownModules(c)).find((m) => m.status === 'draft'));
const items = () => screen.findAllByTestId('module-item');
const itemFor = async (id: string) => {
  const all = await items();
  return need(all.find((el) => el.getAttribute('data-module-id') === id));
};
const action = (el: HTMLElement, name: string | RegExp) =>
  within(el).queryByRole('button', { name }) ?? within(el).queryByRole('link', { name });

describe('C6 Module Library', () => {
  it('lists every provider module and the client own modules, each with an Own or Provider badge', async () => {
    const c = await renderRoute('/client/modules', 'client');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Training');
    const shown = await items();
    const stored = await c.handle.store.modules.list(priya(c.keys));
    expect(shown.map((el) => el.getAttribute('data-module-id')).sort()).toEqual(stored.map((m) => m.id).sort());
    const fire = await fireOf(c);
    expect(within(await itemFor(fire.id)).getByText('Own')).toBeTruthy();
    expect(within(await itemFor(moduleIds.safeguardingAndWhistleblowing)).getByText('Provider')).toBeTruthy();
  });

  it('shows status, version, last edited date and a rating line on each item', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const fire = await fireOf(c);
    const el = await itemFor(fire.id);
    expect(el.textContent).toContain('Published');
    expect(el.textContent).toContain(`Version ${fire.version}`);
    expect(el.textContent).toContain(formatLondonDate(need(fire.updatedAt)));
    expect(el.textContent).toMatch(/Rating: \d\.\d out of 5|No ratings yet/);
    const lone = await loneOf(c);
    const draft = await itemFor(lone.id);
    expect(draft.textContent).toContain('Draft');
    expect(draft.textContent).toContain('Version 1');
  });

  it('shows the average of the staff ratings from module feedback', async () => {
    const c = await renderRoute('/client/modules', 'client', {
      prepare: async ({ handle, keys }) => {
        const jade = actorFor('staff', keys);
        for (const rating of [5, 4]) {
          await handle.store.moduleFeedback.submit(jade, {
            kind: 'moduleCard',
            moduleId: moduleIds.safeguardingAndWhistleblowing,
            rating,
            tags: [],
            anonymous: false,
          });
        }
      },
    });
    const rated = (
      await c.handle.store.moduleFeedback.list(priya(c.keys), { moduleId: moduleIds.safeguardingAndWhistleblowing })
    )
      .filter((f) => f.kind === 'moduleCard' && f.rating !== undefined)
      .map((f) => need(f.rating));
    expect(rated.length).toBeGreaterThanOrEqual(2);
    const average = (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1);
    const el = await itemFor(moduleIds.safeguardingAndWhistleblowing);
    expect(el.textContent).toContain(`Rating: ${average} out of 5`);
  });

  it('switches between cards and a table showing the same modules', async () => {
    await renderRoute('/client/modules', 'client');
    const user = userEvent.setup();
    const cards = await screen.findByRole('button', { name: 'Cards' });
    const table = screen.getByRole('button', { name: 'Table' });
    await user.click(table);
    expect(table.getAttribute('aria-pressed')).toBe('true');
    expect(cards.getAttribute('aria-pressed')).toBe('false');
    const count = (await items()).length;
    expect(screen.getByRole('table')).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByTestId('module-item')).toHaveLength(count);
    await user.click(cards);
    expect(screen.queryByRole('table')).toBeNull();
    expect(await items()).toHaveLength(count);
  });

  it('filters by source and by status', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const user = userEvent.setup();
    await items();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'Own');
    const own = await ownModules(c);
    await waitFor(async () => {
      expect((await items()).map((el) => el.getAttribute('data-module-id')).sort()).toEqual(
        own.map((m) => m.id).sort(),
      );
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Draft');
    await waitFor(async () => {
      expect((await items()).map((el) => el.getAttribute('data-module-id'))).toEqual([(await loneOf(c)).id]);
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'Provider');
    expect(await screen.findByText(/no training matches/i)).toBeTruthy();
    expect(screen.queryAllByTestId('module-item')).toHaveLength(0);
  });

  it('filters by category', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const user = userEvent.setup();
    await items();
    const cats = await c.handle.store.categories.list(priya(c.keys));
    const placements = await dump<{ clientId: string; moduleId: string; categoryId?: string }>(
      c.handle,
      'modulePlacements',
    );
    const cat = need(cats.find((x) => placements.some((p) => p.categoryId === x.id)));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), cat.name);
    const expected = placements
      .filter((p) => p.clientId === need(c.keys.clients['littleAcorns']) && p.categoryId === cat.id)
      .map((p) => p.moduleId)
      .sort();
    await waitFor(async () => {
      expect((await items()).map((el) => el.getAttribute('data-module-id')).sort()).toEqual(expected);
    });
  });

  it('searches by title', async () => {
    await renderRoute('/client/modules', 'client');
    await items();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'fire evacuation');
    await waitFor(async () => {
      const shown = await items();
      expect(shown).toHaveLength(1);
      expect(shown[0]?.textContent).toMatch(/fire evacuation/i);
    });
  });

  it('sorts by title and by last edited', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const user = userEvent.setup();
    await items();
    const stored = await c.handle.store.modules.list(priya(c.keys));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'Title');
    const byTitle = [...stored].sort((a, b) => a.title.localeCompare(b.title)).map((m) => m.id);
    await waitFor(async () => {
      expect((await items()).map((el) => el.getAttribute('data-module-id'))).toEqual(byTitle);
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'Last edited');
    await waitFor(async () => {
      const ids = (await items()).map((el) => el.getAttribute('data-module-id'));
      const times = ids.map((id) => need(stored.find((m) => m.id === id)).updatedAt);
      expect(times).toEqual([...times].sort().reverse());
    });
  });

  it('shows no edit controls on a provider module, only Preview, Duplicate and Add our own links (BP-3)', async () => {
    await renderRoute('/client/modules', 'client');
    const el = await itemFor(moduleIds.safeguardingAndWhistleblowing);
    for (const name of ['Edit', 'Archive', 'Delete', 'Export JSON']) {
      expect(action(el, new RegExp(`^${name}$`)), name).toBeNull();
    }
    expect(action(el, 'Preview as a learner')?.getAttribute('href')).toMatch(
      new RegExp(`/client/modules/${moduleIds.safeguardingAndWhistleblowing}/preview$`),
    );
    expect(action(el, 'Duplicate')).toBeTruthy();
    expect(action(el, 'Add our own links')?.getAttribute('href')).toMatch(
      new RegExp(`/client/modules/${moduleIds.safeguardingAndWhistleblowing}/edit`),
    );
  });

  it('shows the full set of actions on an own module, with Edit going to the builder', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const fire = await fireOf(c);
    const el = await itemFor(fire.id);
    for (const name of ['Preview as a learner', 'Duplicate', 'Edit', 'Archive', 'Delete', 'Export JSON']) {
      expect(action(el, new RegExp(`^${name}$`)), name).toBeTruthy();
    }
    expect(action(el, 'Edit')?.getAttribute('href')).toMatch(new RegExp(`/client/modules/${fire.id}/edit$`));
    expect(action(el, 'Add our own links')).toBeNull();
  });

  it('gives a view-only role Preview and nothing else', async () => {
    await renderRoute('/client/modules', 'client', {
      actor: danielActor,
      prepare: danielWith(['modules.view']),
    });
    const all = await items();
    expect(all.length).toBeGreaterThan(0);
    for (const el of all) {
      expect(action(el, 'Preview as a learner')).toBeTruthy();
      for (const name of ['Duplicate', 'Edit', 'Archive', 'Delete', 'Export JSON', 'Add our own links']) {
        expect(action(el, new RegExp(`^${name}$`)), name).toBeNull();
      }
    }
  });

  it('shows Add our own links to a role with modules.addLinks, on provider modules only', async () => {
    await renderRoute('/client/modules', 'client', {
      actor: danielActor,
      prepare: danielWith(['modules.view', 'modules.addLinks']),
    });
    const provider = await itemFor(moduleIds.safeguardingAndWhistleblowing);
    expect(action(provider, 'Add our own links')).toBeTruthy();
    expect(action(provider, 'Duplicate')).toBeNull();
  });

  it('shows the no-access message, and no list, without modules.view', async () => {
    await renderRoute('/client/modules', 'client', {
      actor: danielActor,
      prepare: danielWith(['billing.view']),
    });
    expect((await screen.findByRole('alert')).textContent).toBe(FORBIDDEN);
    expect(screen.queryAllByTestId('module-item')).toHaveLength(0);
  });

  it('duplicates a provider module into an own draft, shows the responsibility note and lists the copy', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const before = (await ownModules(c)).map((m) => m.id);
    const el = await itemFor(moduleIds.safeguardingAndWhistleblowing);
    await userEvent.click(need(action(el, 'Duplicate')));
    expect((await screen.findByRole('status')).textContent).toContain(NOTE);
    const after = await ownModules(c);
    const copy = need(after.find((m) => !before.includes(m.id)));
    expect(copy).toMatchObject({
      status: 'draft',
      version: 1,
      duplicatedFrom: { moduleId: moduleIds.safeguardingAndWhistleblowing },
    });
    const row = await itemFor(copy.id);
    expect(row.textContent).toContain('Own');
    expect(row.textContent).toContain('Draft');
    expect(action(row, 'Edit')).toBeTruthy();
  });

  it('duplicates an own module too', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const fire = await fireOf(c);
    const before = (await ownModules(c)).length;
    await userEvent.click(need(action(await itemFor(fire.id), 'Duplicate')));
    await screen.findByRole('status');
    expect(await ownModules(c)).toHaveLength(before + 1);
  });

  it('counts a duplicate against the ownModules limit and shows the refusal inline', async () => {
    const c = await renderRoute('/client/modules', 'client', {
      prepare: async ({ handle, keys }) => {
        const clientId = need(keys.clients['littleAcorns']);
        const sub = (await dump<Record<string, unknown> & { clientId: string }>(handle, 'subscriptions')).find(
          (x) => x.clientId === clientId,
        );
        await handle.admin.bulkPut('subscriptions', [{ ...need(sub), packageId: packageIds.essentials }]);
        const client = need((await dump<Client>(handle, 'clients')).find((x) => x.id === clientId));
        await handle.admin.bulkPut('clients', [{ ...client, packageId: packageIds.essentials }]);
      },
    });
    const user = userEvent.setup();
    await user.click(need(action(await itemFor(moduleIds.safeguardingAndWhistleblowing), 'Duplicate')));
    await screen.findByRole('status');
    const afterOne = (await ownModules(c)).length;
    await user.click(need(action(await itemFor(moduleIds.safeguardingAndWhistleblowing), 'Duplicate')));
    expect((await screen.findByRole('alert')).textContent).toBe(t('errors.notEntitled.other'));
    expect(await ownModules(c)).toHaveLength(afterOne);
  });

  it('archives an own module after one press and shows it as Archived', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const lone = await loneOf(c);
    await userEvent.click(need(action(await itemFor(lone.id), 'Archive')));
    await waitFor(async () => {
      expect((await itemFor(lone.id)).textContent).toContain('Archived');
    });
    expect(need((await ownModules(c)).find((m) => m.id === lone.id)).status).toBe('archived');
    expect(action(await itemFor(lone.id), 'Archive')).toBeNull();
  });

  it('deletes a module nobody has completed, only after confirming', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const lone = await loneOf(c);
    const user = userEvent.setup();
    await user.click(need(action(await itemFor(lone.id), 'Delete')));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect((await ownModules(c)).some((m) => m.id === lone.id)).toBe(true);
    await user.click(need(action(await itemFor(lone.id), 'Delete')));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /confirm/i }));
    await waitFor(async () => {
      expect((await ownModules(c)).some((m) => m.id === lone.id)).toBe(false);
    });
    await waitFor(() => {
      expect(screen.queryAllByTestId('module-item').some((el) => el.getAttribute('data-module-id') === lone.id)).toBe(
        false,
      );
    });
  });

  it('refuses to delete a completed module with the hasCompletions message and keeps it', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const fire = await fireOf(c);
    const user = userEvent.setup();
    await user.click(need(action(await itemFor(fire.id), 'Delete')));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /confirm/i }));
    expect((await screen.findByRole('alert')).textContent).toContain(t('errors.rule.hasCompletions'));
    expect((await ownModules(c)).some((m) => m.id === fire.id)).toBe(true);
  });

  it('exports an own module as JSON through a downloaded file', async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:test';
    });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const c = await renderRoute('/client/modules', 'client');
    const fire = await fireOf(c);
    await userEvent.click(need(action(await itemFor(fire.id), 'Export JSON')));
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.readAsText(need(created[0]));
    });
    expect(JSON.parse(text)).toMatchObject({ id: fire.id, title: fire.title });
    expect(text).toBe(await c.handle.store.authoring.exportJson(priya(c.keys), fire.id));
  });
});

describe('C6 Preview as a learner', () => {
  const lessonsOf = (m: Module) => m.lessons;

  it('opens the first lesson in a phone frame and walks forward and back through the lessons', async () => {
    const c = await renderRoute(`/client/modules/${moduleIds.safeguardingAndWhistleblowing}/preview`, 'client');
    const mod = await c.handle.store.modules.get(priya(c.keys), moduleIds.safeguardingAndWhistleblowing);
    const lessons = lessonsOf(mod);
    expect(lessons.length).toBeGreaterThan(1);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(t('preview.title'));
    expect(await screen.findByRole('heading', { level: 2, name: need(lessons[0]).title })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Previous lesson' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next lesson' }));
    expect(await screen.findByRole('heading', { level: 2, name: need(lessons[1]).title })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Previous lesson' }));
    expect(await screen.findByRole('heading', { level: 2, name: need(lessons[0]).title })).toBeTruthy();
  });

  it('shows the quiz questions with answers and explanations, and records nothing', async () => {
    const c = await renderRoute(`/client/modules/${moduleIds.safeguardingAndWhistleblowing}/preview`, 'client');
    const mod = await c.handle.store.modules.get(priya(c.keys), moduleIds.safeguardingAndWhistleblowing);
    const mcq = need(mod.questions.find((q) => q.type === 'mcq'));
    const attemptsBefore = (await dump(c.handle, 'attempts')).length;
    const eventsBefore = (await dump(c.handle, 'learningEvents')).length;
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Quiz' }));
    expect(await screen.findByText(mcq.prompt)).toBeTruthy();
    const wrong = need(mcq.options?.find((o) => !o.correct));
    await user.click(screen.getByRole('radio', { name: wrong.text }));
    expect(await screen.findByText(mcq.explanation)).toBeTruthy();
    expect(await dump(c.handle, 'attempts')).toHaveLength(attemptsBefore);
    expect(await dump(c.handle, 'learningEvents')).toHaveLength(eventsBefore);
  });

  it('previews a draft own module that staff cannot see yet', async () => {
    const c = await renderRoute('/client/modules', 'client');
    const lone = await loneOf(c);
    cleanup();
    await renderRoute(`/client/modules/${lone.id}/preview`, 'client');
    expect(await screen.findByRole('heading', { level: 2, name: need(lone.lessons[0]).title })).toBeTruthy();
  });

  it('keeps the single-lesson route and its Explain this locked card', async () => {
    await renderRoute(`/client/modules/${moduleIds.safeguardingAndWhistleblowing}/preview/lesson-1`, 'client');
    expect(await screen.findByTestId('explain-locked')).toBeTruthy();
  });

  it('says so in plain words for a module that does not exist', async () => {
    await renderRoute('/client/modules/01NOSUCHMODULE0000000000/preview', 'client');
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('shows the no-access message without modules.view', async () => {
    await renderRoute(`/client/modules/${moduleIds.safeguardingAndWhistleblowing}/preview`, 'client', {
      actor: danielActor,
      prepare: danielWith(['billing.view']),
    });
    expect((await screen.findByRole('alert')).textContent).toBe(FORBIDDEN);
  });
});

// C4 Assign (group option). Contract: a combobox "Group" next to "Module", with a "Choose a group" empty option and
// one option per module group of the client. Choosing a group clears "Module" (and the reverse); the existing
// people, due date and "Assign" button are unchanged. Submitting calls assignments.assignGroup, and the success status
// reads t('client.assign.assigned', { count }) with count the number of assignments created (people times group
// modules, minus open duplicates), plus the skipped note when some were skipped.
describe('C4 Assign by group', () => {
  const setDue = (value: string) => {
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value } });
  };

  it('offers the client groups beside the module list', async () => {
    const c = await renderRoute('/client/assign', 'client');
    const groups = await c.handle.store.moduleGroups.list(priya(c.keys));
    expect(groups.length).toBeGreaterThan(0);
    const select = await screen.findByRole('combobox', { name: 'Group' });
    for (const g of groups) expect(within(select).getByRole('option', { name: g.name })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Module' })).toBeTruthy();
  });

  it('clears the module when a group is chosen, and the group when a module is chosen', async () => {
    const c = await renderRoute('/client/assign', 'client');
    const groups = await c.handle.store.moduleGroups.list(priya(c.keys));
    const user = userEvent.setup();
    const group = await screen.findByRole('combobox', { name: 'Group' });
    const module = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Module' });
    await user.selectOptions(module, within(module).getByRole('option', { name: /Safeguarding and whistleblowing/ }));
    await user.selectOptions(group, need(groups[0]).name);
    expect(module.value).toBe('');
    await user.selectOptions(module, within(module).getByRole('option', { name: /Safeguarding and whistleblowing/ }));
    expect((group as HTMLSelectElement).value).toBe('');
  });

  it('assigns every module of the group to each chosen person in one press', async () => {
    const c = await renderRoute('/client/assign', 'client');
    const groups = await c.handle.store.moduleGroups.list(priya(c.keys));
    const g = need(groups.find((x) => x.name === 'New starter induction'));
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Group' }), g.name);
    await user.click(screen.getByRole('checkbox', { name: /Lucy Evans/ }));
    await user.click(screen.getByRole('checkbox', { name: /Hannah Patel/ }));
    setDue('2026-11-02');
    const before = await dump<{ id: string; status: string; target: { moduleId?: string }; personId: string }>(
      c.handle,
      'assignments',
    );
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    const status = await screen.findByRole('status');
    const after = await dump<{ id: string; status: string; target: { moduleId?: string }; personId: string }>(
      c.handle,
      'assignments',
    );
    const created = after.length - before.length;
    expect(created).toBeGreaterThan(0);
    expect(created).toBeLessThanOrEqual(g.moduleIds.length * 2);
    expect(status.textContent).toContain(t('client.assign.assigned', { count: created }));
    const people = await c.handle.store.people.list(priya(c.keys));
    for (const name of ['Lucy', 'Hannah']) {
      const p = need(people.find((x) => x.firstName === name));
      for (const moduleId of g.moduleIds) {
        expect(after.some((a) => a.personId === p.id && a.target.moduleId === moduleId && a.status === 'open')).toBe(
          true,
        );
      }
    }
  });

  it('needs a group or a module before it will assign', async () => {
    const c = await renderRoute('/client/assign', 'client');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /Lucy Evans/ }));
    setDue('2026-11-02');
    const before = (await dump(c.handle, 'assignments')).length;
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await dump(c.handle, 'assignments')).toHaveLength(before);
  });
});

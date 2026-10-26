// M2 chunk 13 (F-4): C10 Organise modules, /client/organise. Contract the implementer must provide:
//   h1 "Organise modules" (one). Gate with can(): modules.view shows the lists, modules.manage shows the action controls.
//   Without modules.view: role alert, no lists.
//   Region "Categories": ul with li data-testid="category-row" per category in order; each row shows the name and "N module(s)".
//     Row buttons (names start with): "Move up", "Move down", "Edit", "Merge", "Delete" (managers only).
//     Button "New category" (managers only) opens dialog "New category": textbox "Name", radiogroup "Colour" (radios named
//     by colour: Green, Blue, Amber, Purple, Rose, Teal, Slate, Brown), radiogroup "Icon" (radios named by icon: Book, Check, ...),
//     button "Save category". Errors (empty name, duplicate ignoring case, over 40 characters) show role alert in the dialog.
//     "Edit" opens dialog "Edit category" with the same fields prefilled.
//     "Merge" opens dialog "Merge category" with a select "Merge into" and button "Merge categories".
//     "Delete" opens dialog "Delete category" with a select "Move modules to" (other categories, plus "No category") and
//     button "Delete category"; it deletes and moves the modules in one batch.
//   Region "Modules": ul with li data-testid="module-row" per published module with title, a select "Category for {title}"
//     (options: categories plus "No category"), a switch "Available to all staff: {title}", a checkbox "Select {title}".
//     Bulk bar (managers only): select "Move selected to" + button "Move selected"; select "Add selected to group" + button "Add to group".
//   Region "Groups": ul with li data-testid="group-row": name, "N module(s)", "In order" or "Any order".
//     Button "New group" opens dialog "New group": textbox "Name", textbox "Description", checkboxes "Modules" fieldset (one per
//     module title), radiogroup "Order" (radios "In order", "Any order"), ordered list "Modules in this group" whose items have buttons
//     "Move up: {title}" and "Move down: {title}", button "Save group". Row buttons "Edit" (dialog "Edit group") and "Delete"
//     (dialog "Delete group" with button "Delete group").
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { actorFor, renderRoute, TODAY } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Rendered = Awaited<ReturnType<typeof renderRoute>>;
const priyaOf = (r: Rendered) => actorFor('client', r.keys);
const categoriesIn = async (r: Rendered) =>
  (await r.handle.store.categories.list(priyaOf(r))).sort((a, b) => a.order - b.order);
const idOf = async (r: Rendered, title: string) =>
  (await r.handle.store.modules.list(priyaOf(r))).find((m) => m.title === title)?.id as string;
const placementOf = async (r: Rendered, title: string) => {
  const id = await idOf(r, title);
  return (await r.handle.store.modulePlacements.list(priyaOf(r))).find((p) => p.moduleId === id);
};

const catRows = () => within(screen.getByRole('region', { name: 'Categories' })).getAllByTestId('category-row');
const rowFor = (testid: string, name: string) =>
  within(
    screen.getByRole('region', {
      name: testid === 'category-row' ? 'Categories' : testid === 'group-row' ? 'Groups' : 'Modules',
    }),
  )
    .getAllByTestId(testid)
    .find((r) => r.textContent.includes(name)) as HTMLElement;
const ready = async () => {
  await screen.findByRole('heading', { level: 1, name: 'Organise modules' });
  await screen.findAllByTestId('category-row');
};
const dialogNamed = (name: string) => screen.findByRole('dialog', { name });

// A Viewer (modules.view only) and someone with no modules permission, as client users of Little Acorns.
const ID = {
  viewerRole: '01ZZ0C100000000000000000R1',
  viewerUser: '01ZZ0C100000000000000000V1',
  viewerAssign: '01ZZ0C100000000000000000A1',
  noneRole: '01ZZ0C100000000000000000R2',
  noneUser: '01ZZ0C100000000000000000V2',
  noneAssign: '01ZZ0C100000000000000000A2',
};
async function addClientUser(
  r: { handle: Rendered['handle']; keys: Rendered['keys'] },
  ids: { role: string; user: string; assign: string },
  permissionIds: string[],
) {
  const clientId = r.keys.clients['littleAcorns'];
  const priya = r.keys.users['priya'];
  await r.handle.admin.bulkPut('roles', [
    {
      id: ids.role,
      owner: { clientId },
      name: 'Test role',
      description: 'Test role',
      colour: '#996633',
      permissionIds,
      system: false,
      version: 1,
      updatedBy: priya,
      updatedAt: TODAY,
    },
  ]);
  await r.handle.admin.bulkPut('users', [
    {
      id: ids.user,
      side: 'client',
      clientId,
      email: `${ids.user.toLowerCase()}@example.test`,
      displayName: 'Test user',
      status: 'active',
      login: { method: 'emailPassword', pinSet: false },
    },
  ]);
  await r.handle.admin.bulkPut('roleAssignments', [
    {
      id: ids.assign,
      userId: ids.user,
      roleIds: [ids.role],
      scope: { type: 'clients', ids: [clientId] },
      grants: [],
      denies: [],
      status: 'active',
    },
  ]);
}
const asUser = (userId: string) => (k: Rendered['keys']) => ({
  userId,
  side: 'client' as const,
  clientId: k.clients['littleAcorns'],
  now: actorFor('client', k).now,
});

describe('C10 Organise: reading', () => {
  it('lists the six categories in order with module counts, the modules, and the three groups', async () => {
    await renderRoute('/client/organise', 'client');
    await ready();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const names = [
      'Safeguarding',
      'Health and safety',
      'Food and nutrition',
      'Sleep and wellbeing',
      'Induction',
      'Our policies',
    ];
    names.forEach((n, i) => {
      expect(catRows()[i]?.textContent, n).toContain(n);
    });
    expect(rowFor('category-row', 'Sleep and wellbeing').textContent).toMatch(/1 module\b/);
    expect(rowFor('category-row', 'Induction').textContent).toMatch(/0 modules/);
    expect(within(screen.getByRole('region', { name: 'Modules' })).getAllByTestId('module-row')).toHaveLength(6); // M3 adds Little Acorns' own Fire evacuation module
    const groups = within(screen.getByRole('region', { name: 'Groups' })).getAllByTestId('group-row');
    expect(groups).toHaveLength(3);
    expect(rowFor('group-row', 'New starter induction').textContent).toMatch(/5 modules/);
    expect(rowFor('group-row', 'New starter induction').textContent).toContain('In order');
    expect(rowFor('group-row', 'Baby room essentials').textContent).toContain('Any order');
  });
});

describe('C10 Organise: categories', () => {
  it('creates a category with a colour and an icon, appended last', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'New category' }));
    const dialog = await dialogNamed('New category');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Rest and rhythm');
    await userEvent.click(
      within(within(dialog).getByRole('radiogroup', { name: 'Colour' })).getByRole('radio', { name: 'Teal' }),
    );
    await userEvent.click(
      within(within(dialog).getByRole('radiogroup', { name: 'Icon' })).getByRole('radio', { name: 'Book' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));
    await waitFor(async () => {
      expect((await categoriesIn(r)).map((c) => c.name)).toContain('Rest and rhythm');
    });
    const made = (await categoriesIn(r)).find((c) => c.name === 'Rest and rhythm');
    expect(made).toMatchObject({ colour: 'teal', icon: 'book', clientId: r.keys.clients['littleAcorns'] });
    expect(made?.order).toBe(6);
    await waitFor(() => {
      expect(catRows()).toHaveLength(7);
    });
    expect(catRows()[6]?.textContent).toContain('Rest and rhythm');
  });

  it('refuses a duplicate name ignoring case, with an inline alert, and creates nothing', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'New category' }));
    const dialog = await dialogNamed('New category');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'safeguarding');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(await categoriesIn(r)).toHaveLength(6);
  });

  it('refuses an empty name with an inline alert', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'New category' }));
    const dialog = await dialogNamed('New category');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(await categoriesIn(r)).toHaveLength(6);
  });

  it('renames, recolours and re-icons a category', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(within(rowFor('category-row', 'Induction')).getByRole('button', { name: /^Edit/ }));
    const dialog = await dialogNamed('Edit category');
    const name = within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Name' });
    expect(name.value).toBe('Induction');
    await userEvent.clear(name);
    await userEvent.type(name, 'Starting out');
    await userEvent.click(
      within(within(dialog).getByRole('radiogroup', { name: 'Colour' })).getByRole('radio', { name: 'Rose' }),
    );
    await userEvent.click(
      within(within(dialog).getByRole('radiogroup', { name: 'Icon' })).getByRole('radio', { name: 'Alert' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));
    await waitFor(async () => {
      expect((await categoriesIn(r))[4]).toMatchObject({ name: 'Starting out', colour: 'rose', icon: 'alert' });
    });
    await waitFor(() => {
      expect(catRows()[4]?.textContent).toContain('Starting out');
    });
  });

  it('reorders with Move down and Move up buttons', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(within(rowFor('category-row', 'Safeguarding')).getByRole('button', { name: /^Move down/ }));
    await waitFor(async () => {
      expect((await categoriesIn(r)).map((c) => c.name).slice(0, 2)).toEqual(['Health and safety', 'Safeguarding']);
    });
    await waitFor(() => {
      expect(catRows()[0]?.textContent).toContain('Health and safety');
    });
    await userEvent.click(within(rowFor('category-row', 'Safeguarding')).getByRole('button', { name: /^Move up/ }));
    await waitFor(async () => {
      expect((await categoriesIn(r)).map((c) => c.name).slice(0, 2)).toEqual(['Safeguarding', 'Health and safety']);
    });
  });

  it('offers no Move up on the first category and no Move down on the last', async () => {
    await renderRoute('/client/organise', 'client');
    await ready();
    const first = within(catRows()[0] as HTMLElement).getByRole('button', { name: /^Move up/ });
    const last = within(catRows()[5] as HTMLElement).getByRole('button', { name: /^Move down/ });
    expect((first as HTMLButtonElement).disabled).toBe(true);
    expect((last as HTMLButtonElement).disabled).toBe(true);
  });

  it('merges one category into another and moves its modules', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(
      within(rowFor('category-row', 'Sleep and wellbeing')).getByRole('button', { name: /^Merge/ }),
    );
    const dialog = await dialogNamed('Merge category');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Merge into' }), 'Food and nutrition');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge categories' }));
    const food = (await categoriesIn(r)).find((c) => c.name === 'Food and nutrition');
    await waitFor(async () => {
      expect((await categoriesIn(r)).map((c) => c.name)).not.toContain('Sleep and wellbeing');
    });
    expect((await placementOf(r, 'Safer sleep'))?.categoryId).toBe(food?.id);
    await waitFor(() => {
      expect(rowFor('category-row', 'Food and nutrition').textContent).toMatch(/2 modules/);
    });
  });

  it('asks where to move the modules when deleting, and moves them in one batch', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(
      within(rowFor('category-row', 'Sleep and wellbeing')).getByRole('button', { name: /^Delete/ }),
    );
    const dialog = await dialogNamed('Delete category');
    const select = within(dialog).getByRole('combobox', { name: 'Move modules to' });
    expect(within(select).queryByRole('option', { name: 'Sleep and wellbeing' })).toBeNull();
    await userEvent.selectOptions(select, 'Induction');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete category' }));
    const induction = (await categoriesIn(r)).find((c) => c.name === 'Induction');
    await waitFor(async () => {
      expect((await categoriesIn(r)).map((c) => c.name)).not.toContain('Sleep and wellbeing');
    });
    expect((await placementOf(r, 'Safer sleep'))?.categoryId).toBe(induction?.id);
    expect((await placementOf(r, 'Safer sleep'))?.availableToAll).toBe(true);
  });

  it('can delete a category and leave its modules without a category', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(
      within(rowFor('category-row', 'Sleep and wellbeing')).getByRole('button', { name: /^Delete/ }),
    );
    const dialog = await dialogNamed('Delete category');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Move modules to' }), 'No category');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete category' }));
    await waitFor(async () => {
      expect((await categoriesIn(r)).map((c) => c.name)).not.toContain('Sleep and wellbeing');
    });
    expect((await placementOf(r, 'Safer sleep'))?.categoryId).toBeUndefined();
  });
});

describe('C10 Organise: modules', () => {
  it('moves a module to another category from its row', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Category for Safer sleep' }),
      'Induction',
    );
    const induction = (await categoriesIn(r)).find((c) => c.name === 'Induction');
    await waitFor(async () => {
      expect((await placementOf(r, 'Safer sleep'))?.categoryId).toBe(induction?.id);
    });
    await waitFor(() => {
      expect(rowFor('category-row', 'Induction').textContent).toMatch(/1 module\b/);
    });
  });

  it('moves several selected modules to a category in one go', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Safer sleep' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Safer eating, allergies and choking' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Move selected to' }), 'Induction');
    await userEvent.click(screen.getByRole('button', { name: 'Move selected' }));
    const induction = (await categoriesIn(r)).find((c) => c.name === 'Induction');
    await waitFor(async () => {
      expect((await placementOf(r, 'Safer sleep'))?.categoryId).toBe(induction?.id);
      expect((await placementOf(r, 'Safer eating, allergies and choking'))?.categoryId).toBe(induction?.id);
    });
    expect((await placementOf(r, 'Safeguarding and whistleblowing'))?.categoryId).not.toBe(induction?.id);
  });

  it('turns availability to all staff off and on from the module row', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    const sw = await screen.findByRole('switch', { name: 'Available to all staff: Safer sleep' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(sw);
    await waitFor(async () => {
      expect((await placementOf(r, 'Safer sleep'))?.availableToAll).toBe(false);
    });
    await userEvent.click(screen.getByRole('switch', { name: 'Available to all staff: Safer sleep' }));
    await waitFor(async () => {
      expect((await placementOf(r, 'Safer sleep'))?.availableToAll).toBe(true);
    });
  });
});

describe('C10 Organise: groups', () => {
  it('creates a group from chosen modules, in order, and saves their order', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'New group' }));
    const dialog = await dialogNamed('New group');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Kitchen basics');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'For the kitchen team.');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Safer eating, allergies and choking' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Safer sleep' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'In order' }));
    const list = within(dialog).getByRole('list', { name: 'Modules in this group' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('Safer eating'), expect.stringContaining('Safer sleep')]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move up: Safer sleep' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save group' }));
    const sleepId = await idOf(r, 'Safer sleep');
    const eatingId = await idOf(r, 'Safer eating, allergies and choking');
    await waitFor(async () => {
      const g = (await r.handle.store.moduleGroups.list(priyaOf(r))).find((x) => x.name === 'Kitchen basics');
      expect(g).toMatchObject({ inOrder: true, moduleIds: [sleepId, eatingId], description: 'For the kitchen team.' });
    });
    await waitFor(() => {
      expect(rowFor('group-row', 'Kitchen basics').textContent).toContain('2 modules');
    });
  });

  it('edits a group: reorders its modules, switches it to In order and renames it', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(within(rowFor('group-row', 'Baby room essentials')).getByRole('button', { name: /^Edit/ }));
    const dialog = await dialogNamed('Edit group');
    const name = within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Baby room must-knows');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move up: Safer eating, allergies and choking' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'In order' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save group' }));
    const sleepId = await idOf(r, 'Safer sleep');
    const eatingId = await idOf(r, 'Safer eating, allergies and choking');
    const paedId = await idOf(r, 'Paediatric first aid and accidents');
    await waitFor(async () => {
      const g = (await r.handle.store.moduleGroups.list(priyaOf(r))).find((x) => x.name === 'Baby room must-knows');
      expect(g?.moduleIds).toEqual([eatingId, sleepId, paedId]);
      expect(g?.inOrder).toBe(true);
    });
  });

  it('removes a module from a group by unticking it', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(within(rowFor('group-row', 'Annual refreshers')).getByRole('button', { name: /^Edit/ }));
    const dialog = await dialogNamed('Edit group');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Paediatric first aid and accidents' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save group' }));
    await waitFor(async () => {
      const g = (await r.handle.store.moduleGroups.list(priyaOf(r))).find((x) => x.name === 'Annual refreshers');
      expect(g?.moduleIds).toEqual([await idOf(r, 'Safeguarding and whistleblowing')]);
    });
  });

  it('adds selected modules to a group in one go (bulk add)', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Safer sleep' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select What changed in September 2026' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Add selected to group' }), 'Annual refreshers');
    await userEvent.click(screen.getByRole('button', { name: 'Add to group' }));
    await waitFor(async () => {
      const g = (await r.handle.store.moduleGroups.list(priyaOf(r))).find((x) => x.name === 'Annual refreshers');
      expect(g?.moduleIds).toEqual(
        expect.arrayContaining([await idOf(r, 'Safer sleep'), await idOf(r, 'What changed in September 2026')]),
      );
      expect(g?.moduleIds).toHaveLength(4);
    });
  });

  it('deletes a group after confirming, leaving its modules alone', async () => {
    const r = await renderRoute('/client/organise', 'client');
    await ready();
    await userEvent.click(within(rowFor('group-row', 'Annual refreshers')).getByRole('button', { name: /^Delete/ }));
    const dialog = await dialogNamed('Delete group');
    expect((await r.handle.store.moduleGroups.list(priyaOf(r))).length).toBe(3);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete group' }));
    await waitFor(async () => {
      expect((await r.handle.store.moduleGroups.list(priyaOf(r))).map((g) => g.name)).not.toContain(
        'Annual refreshers',
      );
    });
    expect(await idOf(r, 'Safeguarding and whistleblowing')).toBeTruthy();
  });
});

describe('C10 Organise: who can change things (can(), not role names)', () => {
  it('lets a Viewer (modules.view) read everything but shows no way to change it', async () => {
    const r = await renderRoute('/client/organise', 'client', {
      prepare: (ctx) =>
        addClientUser(ctx, { role: ID.viewerRole, user: ID.viewerUser, assign: ID.viewerAssign }, ['modules.view']),
      actor: asUser(ID.viewerUser),
    });
    await ready();
    expect(catRows()).toHaveLength(6);
    expect(within(screen.getByRole('region', { name: 'Groups' })).getAllByTestId('group-row')).toHaveLength(3);
    expect(
      screen.queryByRole('button', {
        name: /^(New category|New group|Edit|Delete|Merge|Move up|Move down|Move selected|Add to group)/,
      }),
    ).toBeNull();
    expect(screen.queryByRole('switch', { name: /^Available to all staff/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /^Select / })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /^Category for / })).toBeNull();
    expect(await categoriesIn(r)).toHaveLength(6);
  });

  it('refuses a Viewer in the data layer too', async () => {
    const r = await renderRoute('/client/organise', 'client', {
      prepare: (ctx) =>
        addClientUser(ctx, { role: ID.viewerRole, user: ID.viewerUser, assign: ID.viewerAssign }, ['modules.view']),
    });
    const viewer = { ...priyaOf(r), userId: ID.viewerUser };
    await expect(
      r.handle.store.categories.save(viewer, { name: 'Nope', colour: 'teal', icon: 'book' }),
    ).rejects.toBeTruthy();
  });

  it('shows someone without modules.view a plain message and no lists', async () => {
    await renderRoute('/client/organise', 'client', {
      prepare: (ctx) =>
        addClientUser(ctx, { role: ID.noneRole, user: ID.noneUser, assign: ID.noneAssign }, ['reports.view']),
      actor: asUser(ID.noneUser),
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByTestId('category-row')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New category' })).toBeNull();
  });

  it('shows the Account Owner every action control', async () => {
    await renderRoute('/client/organise', 'client');
    await ready();
    for (const n of ['New category', 'New group']) expect(screen.getByRole('button', { name: n }), n).toBeTruthy();
    const row = catRows()[1] as HTMLElement;
    for (const n of [/^Move up/, /^Move down/, /^Edit/, /^Merge/, /^Delete/])
      expect(within(row).getByRole('button', { name: n }), String(n)).toBeTruthy();
  });
});

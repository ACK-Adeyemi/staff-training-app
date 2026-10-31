// M2 chunk 13 (BP-6, F-4 staff side): S3 Learn (search, filters, categories, groups, path and Simple view, Coming soon) and S4 path nodes.
// Contract the implementer must provide. Jade's seeded Learn list (Little Acorns, today 2026-10-19) is:
//   Safeguarding and whistleblowing (Required, due soon, 10 min, Safeguarding), Paediatric first aid and accidents (Required),
//   What changed in September 2026 (Required), Safer eating, allergies and choking (Optional, 8 min), Safer sleep (Optional, 6 min).
//   Categories in order: Safeguarding, Health and safety, Food and nutrition, Sleep and wellbeing, Induction, Our policies.
//   Groups: New starter induction (5 modules, in order), Baby room essentials (3), Annual refreshers (2).
// S3 /staff/learn, one h1 "Learn":
//   textbox role searchbox, name "Search"; live count data-testid="learn-count" with text "5 modules" / "1 module" / "0 modules".
//   Results are a list: data-testid="learn-path" (ul, each child li data-testid="path-node") normally;
//   data-testid="learn-simple-list" (the existing Simple view list, no learn-path and no path-node) when prefs.simpleView.
//   Each row li has a link to #/staff/module/:id whose text is the title (matches wrapped in <mark>), and a "Required" or "Optional" badge.
//   Rows are ordered required and due first, then other required, then optional, whatever the sort.
//   No match: role status "Nothing matches your search." and a button "Clear search".
//   Button "Filters" opens a dialog "Filters" with radiogroups "Category", "Group", "Status", "Requirement", "Sort by" (each filter
//   group has an "All" radio; Status: Not started, In progress, Completed; Requirement: Required, Optional; Sort by: Due date,
//   Recently active, A to Z), switches "Due soon or overdue" and "Under 10 minutes", a button "Reset filters" and the apply button
//   named "Show N modules" (live count: singular "Show 1 module"). Pressing apply closes the dialog.
//   Active filters: region data-testid="learn-active-filters" with Chips labelled by the value ("Required", "Sleep and wellbeing",
//   "Due soon or overdue", ...) each with a remove button named "Remove filter: <label>".
//   Region "Categories": a button per category (name starts with the category name, text "N module(s)") in category order; pressing
//   one applies that category filter. Region "Groups": a button per group (name starts with the group name) with text
//   "N of M complete", and "Next in this group" plus the module title for an in-order group that is not finished.
//   Region "Coming soon": ten non-link cards (title and category name and the words "Coming soon") shown only when no search or filter is active.
// S4 /staff/module/:id: ul data-testid="lesson-path" whose li children are data-testid="path-node" with data-state "done" | "current" | "next",
//   the state word visible ("Done", "Current", "Next"), a lesson link; a button named "Notes" (data-testid="module-notes-button").
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { actorFor, renderRoute, seededStore } from '../../test/harness';

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

const SAFEGUARDING = 'Safeguarding and whistleblowing';
const PAED = 'Paediatric first aid and accidents';
const WHAT_CHANGED = 'What changed in September 2026';
const EATING = 'Safer eating, allergies and choking';
const SLEEP = 'Safer sleep';
const INDUCTION = 'New starter induction'; // published provider module, required for Jade by the induction requirement
const REQUIRED = [SAFEGUARDING, PAED, WHAT_CHANGED, INDUCTION];
// M3 seed version 4 adds Little Acorns' own published module Fire evacuation (optional, 8 minutes).
const FIRE = 'Fire evacuation at Little Acorns';
// M5 chunk 2 adds three optional Tier 2 provider modules.
const SUITABLE = 'Suitable people and vetting';
const RATIOS = 'Ratios and qualifications';
const RISK = 'Risk assessment and outings';
// M5 chunk 3 adds Medicines and Records (two more optional Tier 2 modules).
const MEDICINES = 'Medicines';
const RECORDS = 'Records, confidentiality and data protection';
// Ordering (partition in catalogue/learn.ts): unfinished required and due, other unfinished required, unfinished optional,
// finished required, then finished optional. Jade has not finished Safeguarding, Induction, Paediatric first aid or the
// five new Tier 2 modules.
const NEW_TIER2 = [SUITABLE, RATIOS, RISK, MEDICINES, RECORDS];
const UNFINISHED_REQUIRED = [INDUCTION, PAED];
const FINISHED_OPTIONAL = [EATING, SLEEP, FIRE];

const resultList = () => screen.queryByTestId('learn-path') ?? screen.getByTestId('learn-simple-list');
const rowsOf = () => Array.from(resultList().children) as HTMLElement[];
const titles = () => rowsOf().map((li) => within(li).getAllByRole('link')[0]?.textContent ?? '');
const count = () => screen.getByTestId('learn-count').textContent;
const search = (text: string) => userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), text);
const openFilters = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
  return screen.getByRole('dialog', { name: 'Filters' });
};
const pick = async (dialog: HTMLElement, group: string, option: string) => {
  await userEvent.click(
    within(within(dialog).getByRole('radiogroup', { name: group })).getByRole('radio', { name: option }),
  );
};
const apply = (dialog: HTMLElement, label: RegExp | string) =>
  userEvent.click(within(dialog).getByRole('button', { name: label }));
const ready = async () => {
  await screen.findByRole('heading', { level: 1, name: 'Learn' });
  await waitFor(() => {
    expect(rowsOf().length).toBeGreaterThan(0);
  });
};

describe('S3 Learn: the default list', () => {
  it('shows every module as a path node with a live count, required modules first', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    expect(screen.getByTestId('learn-path')).toBeTruthy();
    expect(screen.queryByTestId('learn-simple-list')).toBeNull();
    expect(rowsOf().every((li) => li.getAttribute('data-testid') === 'path-node')).toBe(true);
    expect(count()).toBe('12 modules');
    const t = titles();
    expect(t).toHaveLength(12);
    expect(t[0]).toBe(SAFEGUARDING); // required and due soon
    expect(t.slice(1, 3).sort()).toEqual([...UNFINISHED_REQUIRED].sort());
    expect(t.slice(3, 8).sort()).toEqual([...NEW_TIER2].sort());
    expect(t.slice(8).sort()).toEqual([WHAT_CHANGED, ...FINISHED_OPTIONAL].sort());
    const optionalRow = rowsOf()[3] as HTMLElement;
    expect(within(optionalRow).getByText('Optional')).toBeTruthy();
    expect(within(rowsOf()[0] as HTMLElement).getByText('Required')).toBeTruthy();
  });

  it('has one level 1 heading and search, Filters, Categories and Groups controls', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Categories' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Groups' })).toBeTruthy();
  });
});

describe('S3 Learn: search (BP-6)', () => {
  it('updates the result and the live count as the person types and highlights the matched title text', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    await search('sleep');
    await waitFor(() => {
      expect(count()).toBe('2 modules'); // Safer sleep by title, What changed by its lesson "Safer sleep and screen use"
    });
    expect(titles().sort()).toEqual([SLEEP, WHAT_CHANGED].sort());
    const sleepRow = rowsOf().find(
      (li) => li.textContent.includes(SLEEP) && !li.textContent.includes('September'),
    ) as HTMLElement;
    const marks = within(sleepRow).getAllByText('sleep', { selector: 'mark' });
    expect(marks.length).toBeGreaterThan(0);
  });

  it('finds a module by its lesson title', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    await search('banned dogs');
    await waitFor(() => {
      expect(titles()).toEqual([WHAT_CHANGED]);
    });
    expect(count()).toBe('1 module');
  });

  it('finds a module by its category name', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    await search('nutrition');
    await waitFor(() => {
      expect(titles()).toContain(EATING);
    });
    expect(titles()).not.toContain(SAFEGUARDING);
  });

  it('finds a module by its description and ignores case and accents', async () => {
    const { handle, keys } = await renderRoute('/staff/learn', 'staff');
    const mods = await handle.store.modules.list(actorFor('staff', keys));
    const sleep = mods.find((m) => m.title === SLEEP);
    const word = sleep?.description.split(/\s+/).find((w) => /^[a-z]{7,}$/.test(w));
    expect(word, 'Safer sleep needs a descriptive word of 7+ lower-case letters for this test').toBeTruthy();
    await ready();
    await search((word as string).toUpperCase());
    await waitFor(() => {
      expect(titles()).toContain(SLEEP);
    });
  });

  it('says so in a friendly way when nothing matches and Clear search brings the list back', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    await search('zzzz');
    expect((await screen.findByRole('status')).textContent).toContain('Nothing matches your search.');
    expect(count()).toBe('0 modules');
    expect(screen.queryByTestId('learn-path')?.children.length ?? 0).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => {
      expect(count()).toBe('12 modules');
    });
    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search' }).value).toBe('');
  });

  it('does not find a Coming soon topic as a module, and hides the Coming soon cards while searching', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    expect(screen.getByRole('region', { name: 'Coming soon' })).toBeTruthy();
    await search('behaviour');
    await waitFor(() => {
      expect(count()).toBe('0 modules');
    });
    expect(screen.queryByRole('region', { name: 'Coming soon' })).toBeNull();
  });
});

describe('S3 Learn: filters (BP-6)', () => {
  it('shows a live count on the apply button that matches the result, and active filters as removable chips', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    const dialog = await openFilters();
    expect(within(dialog).getByRole('button', { name: 'Show 12 modules' })).toBeTruthy();
    await pick(dialog, 'Requirement', 'Required');
    expect(within(dialog).getByRole('button', { name: 'Show 4 modules' })).toBeTruthy();
    await pick(dialog, 'Requirement', 'Optional');
    expect(within(dialog).getByRole('button', { name: 'Show 8 modules' })).toBeTruthy();
    await pick(dialog, 'Requirement', 'Required');
    await apply(dialog, 'Show 4 modules');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
    });
    expect(count()).toBe('4 modules');
    expect(titles().sort()).toEqual([...REQUIRED].sort());
    const chips = screen.getByTestId('learn-active-filters');
    expect(within(chips).getByText('Required')).toBeTruthy();
    await userEvent.click(within(chips).getByRole('button', { name: 'Remove filter: Required' }));
    await waitFor(() => {
      expect(count()).toBe('12 modules');
    });
    expect(screen.queryByTestId('learn-active-filters')?.textContent ?? '').not.toContain('Required');
  });

  it('counts with the search text applied, using the singular for one module', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    await search('sleep');
    const dialog = await openFilters();
    await pick(dialog, 'Requirement', 'Optional');
    expect(within(dialog).getByRole('button', { name: 'Show 1 module' })).toBeTruthy();
  });

  it('filters by category, group, status, due and length, and Reset filters clears them all', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    let dialog = await openFilters();
    await pick(dialog, 'Category', 'Sleep and wellbeing');
    await apply(dialog, 'Show 1 module');
    await waitFor(() => {
      expect(titles()).toEqual([SLEEP]);
    });
    expect(within(screen.getByTestId('learn-active-filters')).getByText('Sleep and wellbeing')).toBeTruthy();

    dialog = await openFilters();
    await pick(dialog, 'Category', 'All');
    await pick(dialog, 'Group', 'Annual refreshers');
    expect(within(dialog).getByRole('button', { name: 'Show 2 modules' })).toBeTruthy();
    await pick(dialog, 'Group', 'All');
    await pick(dialog, 'Status', 'Not started');
    expect(within(dialog).getByRole('button', { name: 'Show 5 modules' })).toBeTruthy(); // the five new Tier 2 modules
    await pick(dialog, 'Status', 'Completed');
    expect(within(dialog).getByRole('button', { name: 'Show 7 modules' })).toBeTruthy();
    await pick(dialog, 'Status', 'All');
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Due soon or overdue' }));
    expect(within(dialog).getByRole('button', { name: 'Show 1 module' })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Due soon or overdue' }));
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Under 10 minutes' }));
    expect(within(dialog).getByRole('button', { name: 'Show 11 modules' })).toBeTruthy(); // Safeguarding is 10 minutes
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset filters' }));
    expect(within(dialog).getByRole('button', { name: 'Show 12 modules' })).toBeTruthy();
    expect(within(dialog).getByRole('switch', { name: 'Under 10 minutes' }).getAttribute('aria-checked')).toBe('false');
  });

  it('keeps required and due modules first under every sort', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    for (const sort of ['A to Z', 'Recently active', 'Due date']) {
      const dialog = await openFilters();
      await pick(dialog, 'Sort by', sort);
      await apply(dialog, /^Show \d+ modules?$/);
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
      });
      const t = titles();
      expect(t[0], `sort ${sort}`).toBe(SAFEGUARDING);
      expect(t.slice(1, 3).sort(), `sort ${sort}`).toEqual([...UNFINISHED_REQUIRED].sort());
      expect(t.slice(3, 8).sort(), `sort ${sort}`).toEqual([...NEW_TIER2].sort());
      expect(t.slice(8).sort(), `sort ${sort}`).toEqual([WHAT_CHANGED, ...FINISHED_OPTIONAL].sort());
    }
  });

  it('sorts A to Z after the required-and-due module, and inside the optional group', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    const dialog = await openFilters();
    await pick(dialog, 'Sort by', 'A to Z');
    await apply(dialog, /^Show \d+ modules?$/);
    await waitFor(() => {
      expect(titles().slice(8)).toEqual([WHAT_CHANGED, FIRE, EATING, SLEEP]);
    });
    // Safeguarding is required and due soon, so it stays first whatever the sort (plan assumption 27); A to Z orders the rest.
    expect(titles().slice(0, 8)).toEqual([SAFEGUARDING, INDUCTION, PAED, MEDICINES, RATIOS, RECORDS, RISK, SUITABLE]);
  });
});

describe('S3 Learn: categories and groups', () => {
  it('shows a card per category in order with its module count, and pressing one filters the list', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    const region = screen.getByRole('region', { name: 'Categories' });
    const cards = within(region).getAllByRole('button');
    const names = ['Safeguarding', 'Health and safety', 'Food and nutrition', 'Sleep and wellbeing'];
    names.forEach((n, i) => {
      expect(cards[i]?.textContent, n).toContain(n);
    });
    expect(cards[3]?.textContent).toMatch(/1 module\b/);
    await userEvent.click(within(region).getByRole('button', { name: /^Sleep and wellbeing/ }));
    await waitFor(() => {
      expect(titles()).toEqual([SLEEP]);
    });
    expect(within(screen.getByTestId('learn-active-filters')).getByText('Sleep and wellbeing')).toBeTruthy();
  });

  it('shows group progress as N of M complete and filters by a group', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    const region = screen.getByRole('region', { name: 'Groups' });
    const baby = within(region).getByRole('button', { name: /^Baby room essentials/ });
    expect(baby.textContent).toContain('3 of 3 complete');
    expect(within(region).getByRole('button', { name: /^New starter induction/ }).textContent).toContain(
      '5 of 5 complete',
    );
    await userEvent.click(baby);
    await waitFor(() => {
      expect(count()).toBe('3 modules');
    });
    expect(titles().sort()).toEqual([PAED, EATING, SLEEP].sort());
  });

  it('shows Next in this group on an in-order group, without blocking any module', async () => {
    await renderRoute('/staff/learn', 'staff', { actor: (k) => ({ ...actorFor('staff', k), userId: k.users['sam'] }) });
    await ready();
    const region = screen.getByRole('region', { name: 'Groups' });
    const starter = within(region).getByRole('button', { name: /^New starter induction/ });
    expect(starter.textContent).toMatch(/\d of 5 complete/);
    expect(starter.textContent).not.toContain('5 of 5 complete');
    expect(starter.textContent).toContain('Next in this group');
    // Any order: nothing is locked, every row still links to its module.
    for (const li of rowsOf())
      expect(within(li).getAllByRole('link')[0]?.getAttribute('href')).toMatch(/\/staff\/module\/.+/);
    const baby = within(region).getByRole('button', { name: /^Baby room essentials/ });
    expect(baby.textContent).not.toContain('Next in this group');
  });

  it('shows the five Coming soon cards, not as links', async () => {
    await renderRoute('/staff/learn', 'staff');
    await ready();
    const region = screen.getByRole('region', { name: 'Coming soon' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(5);
    expect(within(region).queryAllByRole('link')).toHaveLength(0);
    expect(within(region).queryByText('Medicines (Tier 2)')).toBeNull(); // now a real module
    expect(within(region).getByText('Behaviour (Tier 3)')).toBeTruthy();
    const card = within(region).getByText('Behaviour (Tier 3)').closest('li') as HTMLElement;
    expect(card.textContent).toContain('Our policies');
    expect(card.textContent).toContain('Coming soon');
  });

  it('shows the result of a category change made by a client admin straight away', async () => {
    await renderRoute('/staff/learn', 'staff', {
      prepare: async ({ handle, keys }) => {
        const priya = actorFor('client', keys);
        const cat = await handle.store.categories.save(priya, {
          name: 'Rest and rhythm',
          colour: 'teal',
          icon: 'clock',
        });
        const mods = await handle.store.modules.list(priya);
        const sleep = mods.find((m) => m.title === SLEEP);
        await handle.store.modulePlacements.setCategory(priya, {
          moduleIds: [sleep?.id as string],
          categoryId: cat.id,
        });
      },
    });
    await ready();
    expect(
      within(screen.getByRole('region', { name: 'Categories' })).getByRole('button', { name: /^Rest and rhythm/ }),
    ).toBeTruthy();
    await search('rest and rhythm');
    await waitFor(() => {
      expect(titles()).toEqual([SLEEP]);
    });
  });
});

describe('S3 Learn: Simple view', () => {
  const simple = {
    prepare: async ({
      handle,
      keys,
    }: {
      handle: Awaited<ReturnType<typeof renderRoute>>['handle'];
      keys: Awaited<ReturnType<typeof renderRoute>>['keys'];
    }) => {
      await handle.store.me.updatePrefs(actorFor('staff', keys), { simpleView: true });
    },
  };

  it('shows a plain list, no path nodes, and search and filters still work', async () => {
    await renderRoute('/staff/learn', 'staff', simple);
    await screen.findByTestId('learn-simple-list');
    expect(screen.queryByTestId('learn-path')).toBeNull();
    expect(screen.queryAllByTestId('path-node')).toHaveLength(0);
    await waitFor(() => {
      expect(titles()).toHaveLength(12);
    });
    expect(count()).toBe('12 modules');
    await search('sleep');
    await waitFor(() => {
      expect(count()).toBe('2 modules');
    });
    const dialog = await openFilters();
    await pick(dialog, 'Requirement', 'Optional');
    expect(within(dialog).getByRole('button', { name: 'Show 1 module' })).toBeTruthy();
  });
});

async function safeguarding() {
  const { handle, keys } = await seededStore();
  const mod = (await handle.store.modules.list(actorFor('staff', keys))).find((m) => m.title === SAFEGUARDING);
  if (!mod) throw new Error('seed has no Safeguarding module');
  return mod;
}

describe('S4 Module overview', () => {
  it('shows each lesson as a path node: first lesson current, the rest next, with the state in words', async () => {
    const mod = await safeguarding();
    await renderRoute(`/staff/module/${mod.id}`, 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: SAFEGUARDING })).toBeTruthy();
    const path = screen.getByTestId('lesson-path');
    const nodes = Array.from(path.children) as HTMLElement[];
    expect(nodes).toHaveLength(mod.lessons.length);
    nodes.forEach((n, i) => {
      expect(n.getAttribute('data-testid')).toBe('path-node');
      expect(n.getAttribute('data-state')).toBe(i === 0 ? 'current' : 'next');
      expect(n.textContent).toContain(i === 0 ? 'Current' : 'Next');
      expect(within(n).getByRole('link').getAttribute('href')).toContain(`/lesson/${mod.lessons[i]?.id as string}`);
    });
  });

  it('marks finished lessons Done', async () => {
    const mod = await safeguarding();
    await renderRoute(`/staff/module/${mod.id}`, 'staff', {
      prepare: async ({ handle: h, keys: k }) => {
        const jade = actorFor('staff', k);
        const m = (await h.store.modules.list(jade)).find((x) => x.title === SAFEGUARDING);
        await h.store.learning.recordLesson(jade, {
          moduleId: m?.id as string,
          lessonId: m?.lessons[0]?.id as string,
          kind: 'completed',
        });
      },
    });
    await screen.findByTestId('lesson-path');
    const nodes = Array.from(screen.getByTestId('lesson-path').children) as HTMLElement[];
    expect(nodes[0]?.getAttribute('data-state')).toBe('done');
    expect(nodes[0]?.textContent).toContain('Done');
    expect(nodes[1]?.getAttribute('data-state')).toBe('current');
  });

  it('has a Notes button as the entry point to the course notes', async () => {
    const mod = await safeguarding();
    await renderRoute(`/staff/module/${mod.id}`, 'staff');
    const button = await screen.findByRole('button', { name: 'Notes' });
    expect(button.getAttribute('data-testid')).toBe('module-notes-button');
  });
});

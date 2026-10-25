// M1 chunk 11 (BP-6, F-8): C15 Reports and training matrix, and basic C8 module stats.
// Contract the implementer must provide (client shell routes; each renders exactly one level 1 heading):
//   C15 index  /client/reports            a link named "Training matrix" to /client/reports/matrix.
//   C15 matrix /client/reports/matrix     h1 "Training matrix". Header text: the client display name ("Little Acorns"),
//        "Inspector-ready training matrix", "Generated" (date and time), "Contains personal data. Keep it safe.".
//        A region named "Key" lists every status word (Up to date, Due soon, Overdue, Not started,
//        Waiting to be checked, Not assigned). One table with a <caption> containing "Training matrix"; column headers
//        "Name" then one per requirement; one body row per listed person with a rowheader holding the full name; people
//        are grouped by team (the team name appears in the table). Every status cell holds the status word and an <svg>
//        icon, so colour is never the only signal; cells with a date show the word plus the date.
//        Buttons: "Print" (calls window.print) and, only with reports.export, "Download CSV" (builds a Blob of type
//        text/csv with URL.createObjectURL and clicks an <a download="....csv">). Without reports.view: role=alert
//        mentioning "permission" and no table.
//   C8 stats   /client/modules/:id/stats  h1 contains the module title. Region "Headline numbers" is a <dl> with terms
//        Assigned, Started, Completed, Completion rate, Overdue, Average score, Pass rate (values in the <dd> that
//        follows; rates as "NN%"; average score and pass rate show "No scores yet" until a finished attempt).
//        Region "Question results": a table with a caption and column headers Question, Answered, Percent correct,
//        Source, Learn more opened; hardest first (lowest percent correct first, unanswered last, ties in bank order);
//        percent shown as "NN%", unanswered as "No answers yet". Without reports.view: role=alert with "permission".
//        Unknown module id: role=alert.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { Assignment, Person, Role } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';
import { completeAllLessons, finishViaStore, sgModule } from '../../test/quizHelpers';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Prepare = (ctx: { handle: StoreHandle; keys: SeedKeys }) => Promise<void>;

/** Takes permissions away from the account owner role (Priya's role), by changing data not code. */
const withoutPermissions =
  (...ids: string[]): Prepare =>
  async ({ handle, keys }) => {
    const roles = (await handle.admin.dumpAll())['roles'] as Role[];
    const owner = roles.find((r) => r.id === keys.roles['littleAcorns.accountOwner']);
    if (!owner) throw new Error('no owner role');
    await handle.admin.bulkPut('roles', [
      { ...owner, permissionIds: owner.permissionIds.filter((p) => !ids.includes(p)) },
    ]);
  };

const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      resolve(r.result as string);
    };
    r.onerror = () => {
      reject(new Error('could not read blob'));
    };
    r.readAsText(blob);
  });

const matrixTable = async () => screen.findByRole('table', { name: /training matrix/i });
const headerIndex = (table: HTMLElement, name: string) => {
  const heads = within(table).getAllByRole('columnheader');
  const i = heads.findIndex((h) => h.textContent.includes(name));
  if (i < 0) throw new Error(`no column ${name}`);
  return i;
};
/** The cells of the body row whose rowheader is `person`, in column order starting with the name column. */
const rowFor = (table: HTMLElement, person: string) => {
  const head = within(table).getByRole('rowheader', { name: person });
  const tr = head.closest('tr');
  if (!tr) throw new Error('rowheader outside a row');
  return Array.from(tr.children) as HTMLElement[];
};

describe('C15 Reports index', () => {
  it('links to the training matrix', async () => {
    await renderRoute('/client/reports', 'client');
    const link = await screen.findByRole('link', { name: /training matrix/i });
    expect(link.getAttribute('href')).toMatch(/\/client\/reports\/matrix$/);
  });
});

describe('C15 Training matrix', () => {
  it('shows the header with client name, audit term, generated time and the personal data warning', async () => {
    await renderRoute('/client/reports/matrix', 'client');
    await matrixTable();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/training matrix/i);
    const text = document.body.textContent;
    expect(text).toContain('Little Acorns');
    expect(text).toContain('Inspector-ready training matrix');
    expect(text).toMatch(/Generated/);
    expect(text).toContain('Contains personal data. Keep it safe.');
  });

  it('has a key naming every status word', async () => {
    await renderRoute('/client/reports/matrix', 'client');
    await matrixTable();
    const key = screen.getByRole('region', { name: 'Key' });
    for (const word of ['Up to date', 'Due soon', 'Overdue', 'Not started', 'Waiting to be checked', 'Not assigned']) {
      expect(key.textContent, word).toContain(word);
    }
  });

  it('is a data table with a caption, a Name column and one column per applicable requirement', async () => {
    await renderRoute('/client/reports/matrix', 'client');
    const table = await matrixTable();
    expect(table.querySelector('caption')?.textContent).toMatch(/training matrix/i);
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent.trim());
    expect(heads[0]).toBe('Name');
    for (const req of ['Safeguarding', 'Food hygiene', 'Paediatric first aid']) {
      expect(
        heads.some((h) => h.includes(req)),
        req,
      ).toBe(true);
    }
    // A column per requirement that applies to someone: more than just the three above.
    expect(heads.length).toBeGreaterThan(4);
    expect(new Set(heads).size).toBe(heads.length);
  });

  it('lists the 14 active and on-leave people as row headers, grouped by team, and never Olivia', async () => {
    const { handle, keys } = await renderRoute('/client/reports/matrix', 'client');
    const table = await matrixTable();
    expect(within(table).getAllByRole('rowheader').length).toBeGreaterThanOrEqual(14);
    const dump = await handle.admin.dumpAll();
    // dumpAll returns every client's people; the matrix lists only Little Acorns.
    const listed = (dump['people'] as Person[]).filter(
      (p) => p.clientId === keys.clients['littleAcorns'] && (p.status === 'active' || p.status === 'onLeave'),
    );
    expect(listed).toHaveLength(14);
    for (const p of listed) {
      expect(within(table).getByRole('rowheader', { name: `${p.firstName} ${p.lastName}` })).toBeTruthy();
    }
    expect(table.textContent).not.toContain('Olivia Grant');
    const teams = dump['teams'] as { id: string; name: string }[];
    const used = new Set(listed.map((p) => p.teamIds[0]));
    for (const team of teams.filter((x) => used.has(x.id))) {
      expect(table.textContent, `team ${team.name}`).toContain(team.name);
    }
  });

  it('shows Maureen food hygiene as Due soon with a date, Mark first aid as Overdue, and Not assigned for a non-cook', async () => {
    await renderRoute('/client/reports/matrix', 'client');
    const table = await matrixTable();
    const food = headerIndex(table, 'Food hygiene');
    const aid = headerIndex(table, 'Paediatric first aid');
    const maureen = rowFor(table, 'Maureen Clarke')[food]?.textContent ?? '';
    expect(maureen).toContain('Due soon');
    expect(maureen).toMatch(/20(26|27)/);
    expect(rowFor(table, 'Mark Taylor')[aid]?.textContent).toContain('Overdue');
    expect(rowFor(table, 'Jade Mills')[food]?.textContent).toContain('Not assigned');
  });

  it('gives every status cell a word and an icon so colour is never the only signal', async () => {
    await renderRoute('/client/reports/matrix', 'client');
    const table = await matrixTable();
    const words = ['Up to date', 'Due soon', 'Overdue', 'Not started', 'Waiting to be checked', 'Not assigned'];
    const rows = within(table).getAllByRole('rowheader');
    let checked = 0;
    for (const head of rows) {
      const tr = head.closest('tr');
      const cells = Array.from(tr?.children ?? []).slice(1) as HTMLElement[];
      if (cells.length === 0) continue; // a team heading row
      for (const cell of cells) {
        expect(
          words.some((w) => cell.textContent.includes(w)),
          `word in "${cell.textContent}"`,
        ).toBe(true);
        expect(cell.querySelector('svg'), `icon in "${cell.textContent}"`).not.toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(14 * 3);
  });

  it('prints with the Print button through window.print', async () => {
    await renderRoute('/client/reports/matrix', 'client');
    await matrixTable();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('downloads a CSV with a header row, every person, and formula-guarded names', async () => {
    let blob: Blob | undefined;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
      blob = b;
      return 'blob:matrix';
    };
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;
    let clicked: HTMLAnchorElement | undefined;
    document.addEventListener(
      'click',
      (e) => {
        if (e.target instanceof HTMLAnchorElement) {
          clicked = e.target;
          e.preventDefault();
        }
      },
      { capture: true },
    );
    await renderRoute('/client/reports/matrix', 'client', {
      prepare: async ({ handle }) => {
        const people = (await handle.admin.dumpAll())['people'] as Person[];
        const lucy = people.find((p) => p.firstName === 'Lucy');
        if (!lucy) throw new Error('no Lucy');
        await handle.admin.bulkPut('people', [{ ...lucy, firstName: '=Lucy' }]);
      },
    });
    await matrixTable();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => {
      expect(blob).toBeDefined();
    });
    expect(blob?.type).toMatch(/^text\/csv/);
    expect(clicked?.getAttribute('download')).toMatch(/\.csv$/);
    const csv = await readBlob(blob as Blob);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toMatch(/^Name,Team,/);
    expect(lines[0]).toContain('Safeguarding');
    expect(lines).toHaveLength(15); // header plus 14 people
    expect(csv).toContain("'=Lucy Evans");
    expect(csv).not.toMatch(/(^|,)=Lucy/m);
    expect(csv).toContain('Maureen Clarke');
    expect(csv).not.toContain('Olivia Grant');
  });

  it('hides Download CSV but keeps Print when the person lacks reports.export', async () => {
    await renderRoute('/client/reports/matrix', 'client', { prepare: withoutPermissions('reports.export') });
    await matrixTable();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy();
  });

  it('shows a permission message and no table when the person lacks reports.view', async () => {
    await renderRoute('/client/reports/matrix', 'client', {
      prepare: withoutPermissions('reports.view', 'reports.export'),
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/permission/i);
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.body.textContent).not.toContain('Maureen Clarke');
  });
});

describe('C8 Module stats (basic)', () => {
  const path = `/client/modules/${sgModule.id}/stats`;
  const headline = async () => {
    const region = await screen.findByRole('region', { name: 'Headline numbers' });
    const value = (term: string) => {
      const dt = within(region)
        .getAllByRole('term')
        .find((d) => d.textContent.trim() === term);
      if (!dt) throw new Error(`no term ${term}`);
      return dt.nextElementSibling?.textContent.trim();
    };
    return value;
  };
  const jade = (keys: SeedKeys) => actorFor('staff', keys);

  it('shows the module title and the starting numbers: one assigned, nothing started, no scores', async () => {
    await renderRoute(path, 'client');
    const value = await headline();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(sgModule.title);
    expect(value('Assigned')).toBe('1');
    expect(value('Started')).toBe('0');
    expect(value('Completed')).toBe('0');
    expect(value('Completion rate')).toBe('0%');
    expect(value('Overdue')).toBe('0');
    expect(value('Average score')).toBe('No scores yet');
    expect(value('Pass rate')).toBe('No scores yet');
  });

  it('updates the headline numbers after Jade passes with every answer right', async () => {
    const { handle, keys } = await renderRoute(path, 'client');
    await headline();
    await completeAllLessons(handle, jade(keys));
    await finishViaStore(handle, jade(keys), 0);
    await waitFor(async () => {
      expect((await headline())('Completed')).toBe('1');
    });
    const value = await headline();
    expect(value('Assigned')).toBe('1');
    expect(value('Started')).toBe('1');
    expect(value('Completion rate')).toBe('100%');
    expect(value('Average score')).toBe('100%');
    expect(value('Pass rate')).toBe('100%');
  });

  it('counts an assignment past its due date as overdue', async () => {
    await renderRoute(path, 'client', {
      prepare: async ({ handle }) => {
        const all = (await handle.admin.dumpAll())['assignments'] as Assignment[];
        const open = all.filter((a) => a.status === 'open');
        await handle.admin.bulkPut(
          'assignments',
          open.map((a) => ({ ...a, dueAt: '2026-10-01T22:59:00.000Z' })),
        );
      },
    });
    const value = await headline();
    expect(value('Overdue')).toBe('1');
  });

  it('lists the hardest questions first: missed questions at 0%, unanswered questions last', async () => {
    const { handle, keys } = await renderRoute(path, 'client');
    await completeAllLessons(handle, jade(keys));
    const { missed } = await finishViaStore(handle, jade(keys), 2);
    expect(missed).toHaveLength(2);
    const region = await screen.findByRole('region', { name: 'Question results' });
    await waitFor(() => {
      expect(within(region).getAllByText('0%').length).toBeGreaterThanOrEqual(2);
    });
    const table = within(region).getByRole('table');
    expect(table.querySelector('caption')).not.toBeNull();
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent.trim());
    expect(heads).toEqual(['Question', 'Answered', 'Percent correct', 'Source', 'Learn more opened']);
    const body = within(table)
      .getAllByRole('row')
      .filter((r) => within(r).queryAllByRole('columnheader').length === 0);
    expect(body).toHaveLength(sgModule.questions.length);
    const cell = (row: HTMLElement, col: string) => (row.children[heads.indexOf(col)]?.textContent ?? '').trim();
    const missedPrompts = missed.map((id) => sgModule.questions.find((q) => q.id === id)?.prompt ?? '');
    const firstTwo = body.slice(0, 2).map((r) => cell(r, 'Question'));
    for (const p of missedPrompts)
      expect(
        firstTwo.some((c) => c.includes(p)),
        p,
      ).toBe(true);
    expect(body.slice(0, 2).map((r) => cell(r, 'Percent correct'))).toEqual(['0%', '0%']);
    // Order: numeric percentages never decrease, then every "No answers yet" row.
    const pct = body.map((r) => cell(r, 'Percent correct'));
    const firstBlank = pct.indexOf('No answers yet');
    expect(firstBlank).toBeGreaterThan(1);
    expect(pct.slice(firstBlank).every((p) => p === 'No answers yet')).toBe(true);
    const nums = pct.slice(0, firstBlank).map((p) => Number.parseInt(p, 10));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it('shows Learn more opened counts that match the recorded events', async () => {
    const { handle, keys } = await renderRoute(path, 'client');
    const withLinks = sgModule.questions.filter((q) => q.learnMore.length > 0);
    const [qa, qb] = withLinks;
    if (!qa || !qb) throw new Error('need two questions with links');
    const open = (q: typeof qa) =>
      handle.store.learning.learnMoreOpened(jade(keys), {
        moduleId: sgModule.id,
        questionId: q.id,
        linkId: q.learnMore[0]?.id ?? '',
      });
    await open(qa);
    await open(qa);
    await open(qb);
    const region = await screen.findByRole('region', { name: 'Question results' });
    const table = within(region).getByRole('table');
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent.trim());
    const opened = (q: typeof qa) => {
      const row = within(table)
        .getAllByRole('row')
        .find((r) => (r.children[0]?.textContent ?? '').includes(q.prompt));
      return row?.children[heads.indexOf('Learn more opened')]?.textContent.trim();
    };
    await waitFor(() => {
      expect(opened(qa)).toBe('2');
    });
    expect(opened(qb)).toBe('1');
    const other = withLinks.find((q) => q !== qa && q !== qb);
    if (other) expect(opened(other)).toBe('0');
  });

  it('never shows raw events or who opened a link', async () => {
    const { handle, keys } = await renderRoute(path, 'client');
    await handle.store.learning.learnMoreOpened(jade(keys), {
      moduleId: sgModule.id,
      questionId: sgModule.questions[0]?.id ?? '',
      linkId: sgModule.questions[0]?.learnMore[0]?.id ?? '',
    });
    await screen.findByRole('region', { name: 'Question results' });
    expect(document.body.textContent).not.toContain('Jade Mills');
  });

  it('shows a permission message without reports.view', async () => {
    await renderRoute(path, 'client', { prepare: withoutPermissions('reports.view', 'reports.export') });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/permission/i);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows an alert for a module that does not exist', async () => {
    await renderRoute('/client/modules/does-not-exist/stats', 'client');
    expect((await screen.findByRole('alert')).textContent).not.toMatch(/Error:|NotFound/);
  });

  it('is reached from the Compliance region on the dashboard', async () => {
    await renderRoute('/client', 'client');
    const region = await screen.findByRole('region', { name: 'Compliance' });
    const links = within(region).getAllByRole('link');
    expect(links.some((l) => (l.getAttribute('href') ?? '').endsWith(`/client/modules/${sgModule.id}/stats`))).toBe(
      true,
    );
  });
});

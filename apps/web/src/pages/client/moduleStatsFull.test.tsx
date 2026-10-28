// M3 chunk 16 (BP-4, BP-14 C8 parts, F-4 gate, Track A step 6 second half): the full module stats page C8 at
// /client/modules/:id/stats. Written before the implementation. New text goes in language files; the strings below are
// the English values.
//
// UI CONTRACT (the implementer must provide; data layer = store.assignments, attempts, learningEvents, evidence,
// people, moduleFeedback; domain = moduleStats, statusBar, lessonFunnel, scoreDistribution, completionsByWeek,
// peopleRows, feedbackSummary, canReplyToFeedback):
//   Access. `reports.view` held anywhere (existing PermissionGate). Feedback section needs `moduleFeedback.view`;
//     a role without it sees no "Feedback" region at all (the rest of the page still shows).
//   h1 "Results for {module title}" (existing). Every section is a region (section aria-labelledby its h2):
//     "Headline numbers": dt/dd pairs Assigned, Started, Completed, Completion rate, Overdue, Average score,
//       Pass rate, First-attempt pass rate, Average time to complete. Values come from moduleStats (same inputs as
//       M1: all versions). Average time reads "N min" (or "No scores yet" style text when null).
//     "Where people are": StatusBar (role=img with a sentence naming the four numbers) and a "Show as a table" button
//       that reveals a table with rows Completed, In progress, Not started, Overdue whose numbers are statusBar().
//     "Lessons": the lesson funnel chart (role=img) plus "Show as a table" -> table, one row per lesson in lesson
//       order: title and the number of people who reached it. For Fire evacuation lesson 1 > lesson 2 (drop-off).
//     "Hardest questions": a table (always visible, existing caption "Questions, hardest first") whose rows are sorted
//       hardest first (percent correct ascending, questions with no answers last) with columns Question, Answered,
//       Percent correct, Source (the question's sourceRef, else "None given"), Learn more opened (a count).
//     "Quiz scores": Histogram of the ten buckets (role=img) plus "Show as a table" -> table with 10 rows whose counts
//       are scoreDistribution().buckets, and an element data-testid="retakes" containing the retake count.
//     "Completions by week": chart plus "Show as a table" -> table, one row per week, counts as completionsByWeek.
//     "People": table with one row per person from peopleRows (status, score, date, time taken). The person's name is
//       a link to /client/people/<personId>.
//     "Feedback": see below.
//     Two buttons at the top: "Download CSV" (builds a Blob and clicks a download link; uses URL.createObjectURL) and
//       "Print summary" (calls window.print).
//   Every chart region: the svg role=img accessible name contains every number that its table shows (same numbers).
//   FEEDBACK REGION (shared with C29; `FeedbackItemCard`): heading "Feedback". Summary: data-testid="feedback-average"
//     reading "Average rating: 3.5" (or "No ratings yet") and one data-testid="tag-count" per tag with
//     data-tag="<tag id>" whose text contains the tag label and its count. Then one data-testid="feedback-item" per
//     item for this module (newest first, question reports first), each with data-feedback-id, data-lesson-id (when it
//     has one), data-kind, data-tags (space separated ids), holding:
//       who: the person's full name, or the word "Anonymous" (never a name, never an id) for anonymous items;
//       the tag labels, the text, the status as a select labelled "Status" (New, Reviewed, Actioned, No action needed,
//       calls moduleFeedback.setStatus), the existing reply text when there is one;
//       a button "Reply" for non-anonymous items without a reply when the actor holds moduleFeedback.respond. It opens
//       a textbox "Reply" and a button "Send reply"; success shows role=status "Reply sent." (calls reply). Anonymous
//       items instead show the sentence "This feedback is anonymous, so it cannot be replied to." and no Reply button;
//       for items on a client-own module with a lesson: a link "Edit this module" to
//       /client/modules/<moduleId>/edit?lesson=<1-based lesson number>; on a provider module no such link but a button
//       "Send to the provider" (hidden once escalated; escalated items show the words "Sent to the provider.").
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import { moduleIds } from '@sta/content';
import {
  completionsByWeek,
  feedbackSummary,
  lessonFunnel,
  moduleStats,
  peopleRows,
  scoreDistribution,
  statusBar,
  type Role,
  type RoleAssignment,
} from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, seededStore, TODAY } from '../../test/harness';

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
/** The seed is deterministic, so a second seeded store gives the same Fire evacuation id. */
const fireIdOf = async (): Promise<string> => need((await seededStore()).keys.modules['fireEvacuation']);
const SG = moduleIds.safeguardingAndWhistleblowing;
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];

/** Everything the page's domain calls need, read the way the page reads it. */
async function inputs({ handle, keys }: Ctx, moduleId: string) {
  const actor = priya(keys);
  const s = handle.store;
  const [modules, assignments, attempts, events, evidence, people] = await Promise.all([
    s.modules.list(actor),
    s.assignments.list(actor),
    s.attempts.list(actor),
    s.learningEvents.list(actor),
    s.evidence.list(actor),
    s.people.list(actor),
  ]);
  const module = need(modules.find((m) => m.id === moduleId));
  return { input: { module, assignments, attempts, events, evidence, now: new Date(TODAY) }, people };
}

const region = async (name: string) => screen.findByRole('region', { name });
const tableIn = async (r: HTMLElement) => {
  fireEvent.click(within(r).getByRole('button', { name: 'Show as a table' }));
  return within(r).findByRole('table');
};
const bodyRows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);
const cellTexts = (row: HTMLElement) => [...row.querySelectorAll('th, td')].map((c) => c.textContent.trim());
const statsPath = (id: string) => `/client/modules/${id}/stats`;

describe('C8 headline and status bar (BP-4)', () => {
  it('shows every headline card with the numbers from moduleStats', async () => {
    let ctx!: Ctx;
    await renderRoute(statsPath(SG), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Headline numbers');
    const { input } = await inputs(ctx, SG);
    const h = moduleStats(input).headline;
    const value = (term: string) => within(r).getByText(term).closest('div')?.querySelector('dd')?.textContent;
    for (const term of [
      'Assigned',
      'Started',
      'Completed',
      'Completion rate',
      'Overdue',
      'Average score',
      'Pass rate',
      'First-attempt pass rate',
      'Average time to complete',
    ]) {
      expect(value(term), term).toBeTruthy();
    }
    expect(value('Assigned')).toBe(String(h.assigned));
    expect(value('Started')).toBe(String(h.started));
    expect(value('Completed')).toBe(String(h.completed));
    expect(value('Completion rate')).toBe(`${String(h.completionRate)}%`);
    expect(value('Overdue')).toBe(String(h.overdue));
    expect(h.assigned).toBeGreaterThan(0);
  });

  it('splits people by status in a bar whose table equals statusBar()', async () => {
    let ctx!: Ctx;
    await renderRoute(statsPath(SG), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Where people are');
    expect(within(r).getByRole('img')).toBeTruthy();
    const bar = statusBar((await inputs(ctx, SG)).input);
    const rows = bodyRows(await tableIn(r)).map(cellTexts);
    expect(rows).toEqual([
      ['Completed', String(bar.completed)],
      ['In progress', String(bar.inProgress)],
      ['Not started', String(bar.notStarted)],
      ['Overdue', String(bar.overdue)],
    ]);
    const label = within(r).getByRole('img').getAttribute('aria-label') ?? '';
    for (const n of [bar.completed, bar.inProgress, bar.notStarted, bar.overdue]) expect(label).toContain(String(n));
  });
});

describe('C8 lesson funnel (BP-4: lesson 2 drop-off for Fire evacuation)', () => {
  it('lists one row per lesson in order and shows fewer people reaching lesson 2 than lesson 1', async () => {
    let ctx!: Ctx;
    const fireId = await fireIdOf();
    await renderRoute(statsPath(fireId), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Lessons');
    expect(within(r).getByRole('img')).toBeTruthy();
    const { input } = await inputs(ctx, fireId);
    const rows = bodyRows(await tableIn(r)).map(cellTexts);
    expect(rows).toHaveLength(input.module.lessons.length);
    expect(rows.map((x) => x[0])).toEqual(input.module.lessons.map((l) => l.title));
    const reached = rows.map((x) => Number(x[1]));
    expect(reached.every(Number.isInteger)).toBe(true);
    expect(reached[0] ?? 0).toBeGreaterThan(reached[1] ?? 0);
    // The funnel never counts more people than the unversioned domain funnel does.
    const all = lessonFunnel(input).map((x) => x.reached);
    reached.forEach((n, i) => {
      expect(n).toBeLessThanOrEqual(all[i] ?? 0);
    });
    const label = within(r).getByRole('img').getAttribute('aria-label') ?? '';
    for (const n of reached) expect(label).toContain(String(n));
  });
});

describe('C8 hardest questions, scores and weeks (BP-4)', () => {
  it('sorts questions hardest first with source reference and Learn more opened counts', async () => {
    let ctx!: Ctx;
    await renderRoute(statsPath(SG), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Hardest questions');
    const table = within(r).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Question', 'Answered', 'Percent correct', 'Source', 'Learn more opened']);
    const rows = bodyRows(table).map(cellTexts);
    const { input } = await inputs(ctx, SG);
    const stats = moduleStats(input);
    expect(rows).toHaveLength(stats.questions.length);
    const percents = rows.map((x) => (x[2] === 'No answers yet' ? Number.POSITIVE_INFINITY : parseInt(x[2] ?? '', 10)));
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    for (const row of rows) {
      const q = input.module.questions.find((x) => x.prompt === row[0]);
      expect(q, row[0]).toBeDefined();
      expect(row[3]).toBe(q?.sourceRef ?? 'None given');
      const s = stats.questions.find((x) => x.questionId === q?.id);
      expect(row[4]).toBe(String(s?.learnMoreOpened));
    }
    expect(rows.some((x) => x[3] !== 'None given')).toBe(true);
  });

  it('shows the score distribution as ten buckets with the retake count', async () => {
    let ctx!: Ctx;
    await renderRoute(statsPath(SG), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Quiz scores');
    const dist = scoreDistribution((await inputs(ctx, SG)).input);
    const rows = bodyRows(await tableIn(r)).map(cellTexts);
    expect(rows).toHaveLength(10);
    expect(rows.map((x) => Number(x[1]))).toEqual(dist.buckets.map((b) => b.count));
    expect(within(r).getByTestId('retakes').textContent).toContain(String(dist.retakes));
  });

  it('shows completions by week whose table equals completionsByWeek', async () => {
    let ctx!: Ctx;
    await renderRoute(statsPath(SG), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Completions by week');
    const rows = bodyRows(await tableIn(r)).map(cellTexts);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const expected = completionsByWeek((await inputs(ctx, SG)).input, rows.length);
    expect(rows.map((x) => Number(x[1]))).toEqual(expected.map((w) => w.completed));
  });
});

describe('C8 people list and exports', () => {
  it('lists people with a link to each record', async () => {
    let ctx!: Ctx;
    await renderRoute(statsPath(SG), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('People');
    const { input, people } = await inputs(ctx, SG);
    const expected = peopleRows({ ...input, people });
    const table = within(r).getByRole('table');
    expect(bodyRows(table)).toHaveLength(expected.length);
    const first = need(expected[0]);
    const link = within(table).getByRole('link', { name: new RegExp(first.person.lastName) });
    expect(link.getAttribute('href')).toMatch(new RegExp(`/client/people/${first.person.id}$`));
  });

  it('offers a CSV download and a print summary', async () => {
    await renderRoute(statsPath(SG), 'client');
    const create = vi.fn(() => 'blob:csv');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await userEvent.click(await screen.findByRole('button', { name: 'Print summary' }));
    expect(print).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
  });
});

describe('C8 staff feedback (BP-14, Track A step 6)', () => {
  const fireItems = async ({ handle, keys }: Ctx) =>
    (await handle.store.moduleFeedback.list(priya(keys), { moduleId: need(keys.modules['fireEvacuation']) })).sort(
      (a, b) => a.id.localeCompare(b.id),
    );

  it('shows the average rating, tag counts and every item, with an Unclear cluster on lesson 2', async () => {
    let ctx!: Ctx;
    const fireId = await fireIdOf();
    await renderRoute(statsPath(fireId), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Feedback');
    const items = await fireItems(ctx);
    const summary = feedbackSummary(items);
    expect(within(r).getByTestId('feedback-average').textContent).toContain(String(summary.averageRating));
    const unclear = within(r)
      .getAllByTestId('tag-count')
      .find((el) => el.getAttribute('data-tag') === 'unclear');
    expect(unclear?.textContent).toContain('Unclear');
    expect(unclear?.textContent).toContain(String(summary.tagCounts['unclear']));
    const shown = within(r).getAllByTestId('feedback-item');
    expect(shown).toHaveLength(items.length);
    const lesson2Unclear = shown.filter(
      (el) =>
        el.getAttribute('data-lesson-id') === 'lesson-2' && (el.getAttribute('data-tags') ?? '').includes('unclear'),
    );
    expect(lesson2Unclear.length).toBeGreaterThanOrEqual(4);
  });

  it('shows anonymous items as Anonymous with no name or id, and refuses a reply', async () => {
    let ctx!: Ctx;
    const fireId = await fireIdOf();
    await renderRoute(statsPath(fireId), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Feedback');
    const anon = (await fireItems(ctx)).filter((f) => f.anonymous);
    expect(anon.length).toBeGreaterThanOrEqual(2);
    for (const f of anon) {
      const el = await waitFor(() => {
        const found = within(r)
          .getAllByTestId('feedback-item')
          .find((x) => x.getAttribute('data-feedback-id') === f.id);
        if (!found) throw new Error('not shown');
        return found;
      });
      expect(within(el).getByText('Anonymous')).toBeTruthy();
      expect(within(el).queryByRole('button', { name: 'Reply' })).toBeNull();
      expect(el.textContent).toContain('This feedback is anonymous, so it cannot be replied to.');
      expect(el.textContent).not.toMatch(/Jade|Chris|Ellie|Mills|[0-9A-Z]{26}/);
    }
  });

  it('lets Priya reply to a named item, mark it Actioned and open the builder at lesson 2', async () => {
    let ctx!: Ctx;
    const fireId = await fireIdOf();
    await renderRoute(statsPath(fireId), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Feedback');
    const target = need(
      (await fireItems(ctx)).find((f) => f.personId === ctx.keys.personas['kasia'] && f.lessonId === 'lesson-2'),
    );
    const card = await waitFor(() => {
      const found = within(r)
        .getAllByTestId('feedback-item')
        .find((x) => x.getAttribute('data-feedback-id') === target.id);
      if (!found) throw new Error('not shown');
      return found;
    });
    const edit = within(card).getByRole('link', { name: 'Edit this module' });
    expect(edit.getAttribute('href')).toMatch(new RegExp(`/client/modules/${fireId}/edit\\?lesson=2$`));

    await userEvent.click(within(card).getByRole('button', { name: 'Reply' }));
    await userEvent.type(within(card).getByRole('textbox', { name: 'Reply' }), 'Thanks, we are adding pictures.');
    await userEvent.click(within(card).getByRole('button', { name: 'Send reply' }));
    expect((await within(card).findByRole('status')).textContent).toContain('Reply sent.');

    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Status' }), 'Actioned');
    await waitFor(async () => {
      const after = await ctx.handle.store.moduleFeedback.get(priya(ctx.keys), target.id);
      expect(after.status).toBe('actioned');
      expect(after.reply?.text).toBe('Thanks, we are adding pictures.');
    });
  });

  it('offers Send to the provider (and no Edit link) for feedback on a provider module', async () => {
    let ctx!: Ctx;
    await renderRoute(statsPath(SG), 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await region('Feedback');
    const open = need(
      (await ctx.handle.store.moduleFeedback.list(priya(ctx.keys), { moduleId: SG })).find(
        (f) => f.escalatedToProvider === undefined && !f.anonymous,
      ),
    );
    const card = await waitFor(() => {
      const found = within(r)
        .getAllByTestId('feedback-item')
        .find((x) => x.getAttribute('data-feedback-id') === open.id);
      if (!found) throw new Error('not shown');
      return found;
    });
    expect(within(card).queryByRole('link', { name: 'Edit this module' })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Send to the provider' }));
    await userEvent.type(within(card).getByRole('textbox', { name: 'Add a note for the provider' }), 'Please check.');
    await userEvent.click(within(card).getByRole('button', { name: 'Send note' }));
    await waitFor(async () => {
      const after = await ctx.handle.store.moduleFeedback.get(priya(ctx.keys), open.id);
      expect(after.escalatedToProvider?.note).toBe('Please check.');
    });
    expect(card.textContent).toContain('Sent to the provider.');
  });
});

describe('C8 permissions (F-4)', () => {
  const daniel = (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users['daniel']),
    side: 'client',
    clientId: need(keys.clients['littleAcorns']),
    now: TODAY,
  });
  const danielWith =
    (permissionIds: string[]) =>
    async ({ handle, keys }: Ctx) => {
      const userId = need(keys.users['daniel']);
      const role: Role = {
        id: '01TEST0000000000000000C8C8',
        owner: { clientId: need(keys.clients['littleAcorns']) },
        name: 'Stats test role',
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

  it('shows the stats without a Feedback region when moduleFeedback.view is missing', async () => {
    await renderRoute(statsPath(SG), 'client', {
      actor: daniel,
      prepare: danielWith(['reports.view', 'modules.view', 'staff.view']),
    });
    await region('Headline numbers');
    expect(screen.queryByRole('region', { name: 'Feedback' })).toBeNull();
  });

  it('shows the feedback but no Reply button when moduleFeedback.respond is missing', async () => {
    await renderRoute(statsPath(SG), 'client', {
      actor: daniel,
      prepare: danielWith(['reports.view', 'modules.view', 'staff.view', 'moduleFeedback.view']),
    });
    const r = await region('Feedback');
    expect((await within(r).findAllByTestId('feedback-item')).length).toBeGreaterThan(0);
    expect(within(r).queryByRole('button', { name: 'Reply' })).toBeNull();
  });

  it('shows the no-access message without reports.view', async () => {
    await renderRoute(statsPath(SG), 'client', { actor: daniel, prepare: danielWith(['modules.view']) });
    expect((await screen.findByRole('alert')).textContent).toContain(
      "You don't have access to this. Ask your manager.",
    );
    expect(screen.queryByRole('region', { name: 'Headline numbers' })).toBeNull();
  });
});

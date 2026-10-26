// BP-6: what staff see on Learn, search by plain substring, filters and sort (brief 17.2; plan M2 assumptions 25 to 27).
import { describe, expect, it } from 'vitest';
import { groupProgress, learnCatalogue, searchModules, type CatalogueRow } from './learn';
import type { LearningEvent } from '../schemas/learning';
import {
  AMBER,
  CLIENT,
  NOW,
  SITE_ID,
  assignment,
  category,
  evidenceExpiring,
  group,
  moduleFor,
  nextId,
  person,
  placement,
  requirement,
  site,
} from './testFixtures';

const jade = person('Jade', 'Test');
const mainSite = site();
const lessonOf = (title: string) => ({ id: `l${nextId().slice(-4)}`, title, minutes: 3, blocks: [] });
const mod = (title: string, over: Record<string, unknown> = {}) =>
  moduleFor({ id: nextId(), title, ...over } as Parameters<typeof moduleFor>[0]);
const ev = (type: LearningEvent['type'], moduleId: string, at: string): LearningEvent => ({
  id: nextId(),
  clientId: CLIENT,
  siteId: SITE_ID,
  personId: jade.id,
  at,
  type,
  moduleId,
});

type Input = Partial<Parameters<typeof learnCatalogue>[0]>;
const build = (modules: ReturnType<typeof mod>[], over: Input = {}) =>
  learnCatalogue({
    person: jade,
    site: mainSite,
    modules,
    requirements: [],
    evidence: [],
    submissions: [],
    assignments: [],
    events: [],
    placements: [],
    categories: [],
    groups: [],
    now: NOW,
    amberWindowDays: AMBER,
    ...over,
  });
const titles = (rows: CatalogueRow[]) => rows.map((r) => r.module.title);
const run = (rows: CatalogueRow[], query = '', filters = {}, sort: 'due' | 'recent' | 'az' = 'az') =>
  searchModules(rows, query, filters, sort);

describe('learnCatalogue visibility (assumption 25)', () => {
  it('hides draft and archived modules', () => {
    const rows = build([mod('Live'), mod('Draft', { status: 'draft' }), mod('Old', { status: 'archived' })]);
    expect(titles(rows)).toEqual(['Live']);
  });

  it('shows a published module that has no placement (M1 behaviour)', () => {
    expect(titles(build([mod('Unplaced')]))).toEqual(['Unplaced']);
  });

  it('hides a placed module that is not required, not assigned and not available to all', () => {
    const m = mod('Hidden');
    expect(build([m], { placements: [placement(m.id)] })).toEqual([]);
  });

  it('shows a placed module that is available to all, marked optional', () => {
    const m = mod('Open to all');
    const rows = build([m], { placements: [placement(m.id, { availableToAll: true })] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.required).toBe(false);
  });

  it('shows and marks required a module satisfying an applicable requirement', () => {
    const r = requirement('Safeguarding');
    const m = mod('Safeguarding', { requirementIds: [r.id] });
    const rows = build([m], { requirements: [r], placements: [placement(m.id)] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.required).toBe(true);
  });

  it('does not make a module required when the requirement does not apply to the person', () => {
    const r = requirement('Chefs only', { appliesTo: { jobRoleIds: [nextId()] } });
    const m = mod('Knives', { requirementIds: [r.id] });
    expect(build([m], { requirements: [r], placements: [placement(m.id)] })).toEqual([]);
  });

  it('shows a module with an open assignment and marks it required', () => {
    const m = mod('Assigned');
    const rows = build([m], { placements: [placement(m.id)], assignments: [assignment(jade, m.id, 10)] });
    expect(rows[0]?.required).toBe(true);
  });

  it("ignores done and cancelled assignments and other people's assignments", () => {
    const m = mod('Assigned');
    const other = person('Other', 'Person');
    const rows = build([m], {
      placements: [placement(m.id)],
      assignments: [
        assignment(jade, m.id, 10, { status: 'done' }),
        assignment(jade, m.id, 10, { status: 'cancelled' }),
        assignment(other, m.id, 10),
      ],
    });
    expect(rows).toEqual([]);
  });

  it('treats an open group assignment as an assignment for each module in the group', () => {
    const a = mod('In group');
    const g = group('Induction', [a.id]);
    const rows = build([a], {
      placements: [placement(a.id)],
      groups: [g],
      assignments: [assignment(jade, a.id, 5, { target: { groupId: g.id } })],
    });
    expect(rows[0]?.required).toBe(true);
  });
});

describe('learnCatalogue row fields', () => {
  it('carries category, groups and minutes', () => {
    const cat = category('Safeguarding');
    const m = mod('Safeguarding', { estimatedMinutes: 12 });
    const g = group('Induction', [m.id]);
    const [row] = build([m], {
      categories: [cat],
      placements: [placement(m.id, { categoryId: cat.id, availableToAll: true })],
      groups: [g],
    });
    expect(row?.category?.id).toBe(cat.id);
    expect(row?.groups.map((x) => x.id)).toEqual([g.id]);
    expect(row?.minutes).toBe(12);
  });

  it('has no category when the placement has none', () => {
    const m = mod('Plain');
    expect(build([m])[0]?.category).toBeUndefined();
  });

  it('derives dueAt and dueState from the earliest open assignment', () => {
    const m = mod('Due');
    const rows = (days: number[]) => build([m], { assignments: days.map((d) => assignment(jade, m.id, d)) });
    expect(rows([40, 20])[0]?.dueAt).toBe(assignment(jade, m.id, 20).dueAt);
    expect(rows([20])[0]?.dueState).toBe('dueSoon');
    expect(rows([-2])[0]?.dueState).toBe('overdue');
    expect(rows([AMBER + 30])[0]?.dueState).toBe('none');
  });

  it('shows an expired requirement as overdue and an expiring one as due soon', () => {
    const r = requirement('Refresher');
    const m = mod('Refresher', { requirementIds: [r.id] });
    expect(build([m], { requirements: [r], evidence: [evidenceExpiring(jade, r, -3)] })[0]?.dueState).toBe('overdue');
    expect(build([m], { requirements: [r], evidence: [evidenceExpiring(jade, r, 20)] })[0]?.dueState).toBe('dueSoon');
    expect(build([m], { requirements: [r], evidence: [evidenceExpiring(jade, r, 200)] })[0]?.dueState).toBe('none');
  });

  it('status is notStarted with no events, inProgress after activity, completed after moduleCompleted', () => {
    const m = mod('Status');
    expect(build([m])[0]?.status).toBe('notStarted');
    const started = [ev('lessonCompleted', m.id, '2026-10-10T10:00:00.000Z')];
    expect(build([m], { events: started })[0]?.status).toBe('inProgress');
    const done = [...started, ev('moduleCompleted', m.id, '2026-10-11T10:00:00.000Z')];
    expect(build([m], { events: done })[0]?.status).toBe('completed');
  });

  it('status is completed when current Evidence exists for a requirement the module satisfies', () => {
    const r = requirement('Safeguarding');
    const m = mod('Safeguarding', { requirementIds: [r.id] });
    expect(build([m], { requirements: [r], evidence: [evidenceExpiring(jade, r, 200)] })[0]?.status).toBe('completed');
  });

  it("ignores other people's events for status and lastActiveAt", () => {
    const m = mod('Mine');
    const theirs = { ...ev('lessonCompleted', m.id, '2026-10-10T10:00:00.000Z'), personId: nextId() };
    const [row] = build([m], { events: [theirs] });
    expect(row?.status).toBe('notStarted');
    expect(row?.lastActiveAt).toBeUndefined();
  });

  it('lastActiveAt is the latest event for the module by the person', () => {
    const m = mod('Active');
    const [row] = build([m], {
      events: [
        ev('lessonViewed', m.id, '2026-10-01T10:00:00.000Z'),
        ev('lessonCompleted', m.id, '2026-10-12T10:00:00.000Z'),
      ],
    });
    expect(row?.lastActiveAt).toBe('2026-10-12T10:00:00.000Z');
  });
});

describe('searchModules', () => {
  const cat = category('Food and nutrition');
  const eating = mod('Safer eating', {
    description: 'Allergies and choking',
    lessons: [lessonOf('Spotting allergens')],
  });
  const sleep = mod('Safer sleep', { description: 'Cots and safe positions', lessons: [lessonOf('Room temperature')] });
  const cafe = mod('Café basics', { description: 'Hot drinks' });
  const all = [eating, sleep, cafe];
  const rows = build(all, {
    categories: [cat],
    placements: [
      placement(eating.id, { categoryId: cat.id, availableToAll: true }),
      placement(sleep.id, { availableToAll: true }),
      placement(cafe.id, { availableToAll: true }),
    ],
  });

  it('returns every row for an empty or whitespace query, count equal to rows', () => {
    for (const q of ['', '   ']) {
      const r = run(rows, q);
      expect(r.rows).toHaveLength(3);
      expect(r.count).toBe(3);
    }
  });

  it('matches title, description, lesson title and category name', () => {
    expect(titles(run(rows, 'eating').rows)).toEqual(['Safer eating']);
    expect(titles(run(rows, 'cots').rows)).toEqual(['Safer sleep']);
    expect(titles(run(rows, 'temperature').rows)).toEqual(['Safer sleep']);
    expect(titles(run(rows, 'nutrition').rows)).toEqual(['Safer eating']);
  });

  it('is case-insensitive and accent-insensitive in both directions', () => {
    expect(titles(run(rows, 'CAFE').rows)).toEqual(['Café basics']);
    expect(titles(run(rows, 'café').rows)).toEqual(['Café basics']);
  });

  it('requires every term to match somewhere (title, lesson, category)', () => {
    expect(titles(run(rows, 'safer allergens').rows)).toEqual(['Safer eating']);
    expect(titles(run(rows, 'safer nutrition').rows)).toEqual(['Safer eating']);
    expect(run(rows, 'safer nonsense').rows).toEqual([]);
  });

  it('returns an empty result with count 0 for no match', () => {
    const r = run(rows, 'zzz');
    expect(r.rows).toEqual([]);
    expect(r.count).toBe(0);
  });

  it('treats the query as plain text, never as a regular expression', () => {
    const odd = build([mod('Fire (drill) [plan]'), mod('Plain module')]);
    expect(() => run(odd, '(')).not.toThrow();
    expect(() => run(odd, '[')).not.toThrow();
    expect(() => run(odd, '\\')).not.toThrow();
    expect(titles(run(odd, '(drill)').rows)).toEqual(['Fire (drill) [plan]']);
    expect(run(odd, '.*').rows).toEqual([]);
    expect(run(odd, 'p.an').rows).toEqual([]);
  });

  it('returns match ranges for the title so the UI can highlight them', () => {
    const r = run(rows, 'safer');
    const marks = r.highlights[eating.id] ?? [];
    expect(marks).toContainEqual({ field: 'title', start: 0, end: 5 });
  });

  it('count always equals rows.length, including with filters', () => {
    const r = run(rows, 'safer', { requirement: 'optional' });
    expect(r.count).toBe(r.rows.length);
  });
});

describe('searchModules filters (each one)', () => {
  const catA = category('Safeguarding');
  const catB = category('Health');
  const req = requirement('Safeguarding');
  const a = mod('A required', { requirementIds: [req.id], estimatedMinutes: 20 });
  const b = mod('B optional short', { estimatedMinutes: 5 });
  const c = mod('C optional long', { estimatedMinutes: 10 });
  const g = group('Induction', [b.id]);
  const rows = build([a, b, c], {
    requirements: [req],
    categories: [catA, catB],
    groups: [g],
    placements: [
      placement(a.id, { categoryId: catA.id, availableToAll: true }),
      placement(b.id, { categoryId: catB.id, availableToAll: true }),
      placement(c.id, { categoryId: catB.id, availableToAll: true }),
    ],
    events: [
      ev('lessonCompleted', b.id, '2026-10-10T10:00:00.000Z'),
      ev('moduleCompleted', c.id, '2026-10-10T11:00:00.000Z'),
    ],
    assignments: [assignment(jade, c.id, 5)],
  });

  it('by category', () => {
    expect(titles(run(rows, '', { categoryId: catB.id }).rows)).toEqual(['B optional short', 'C optional long']);
  });
  it('by group', () => {
    expect(titles(run(rows, '', { groupId: g.id }).rows)).toEqual(['B optional short']);
  });
  it('by status', () => {
    expect(titles(run(rows, '', { status: 'notStarted' }).rows)).toEqual(['A required']);
    expect(titles(run(rows, '', { status: 'inProgress' }).rows)).toEqual(['B optional short']);
    expect(titles(run(rows, '', { status: 'completed' }).rows)).toEqual(['C optional long']);
  });
  it('by requirement', () => {
    expect(titles(run(rows, '', { requirement: 'required' }).rows)).toEqual(['A required', 'C optional long']);
    expect(titles(run(rows, '', { requirement: 'optional' }).rows)).toEqual(['B optional short']);
  });
  it('by due soon or overdue', () => {
    expect(titles(run(rows, '', { due: true }).rows)).toEqual(['C optional long']);
  });
  it('by length: under 10 minutes excludes exactly 10', () => {
    expect(titles(run(rows, '', { underTenMinutes: true }).rows)).toEqual(['B optional short']);
  });
  it('combines filters with search (all must hold)', () => {
    expect(run(rows, 'optional', { categoryId: catA.id }).rows).toEqual([]);
    expect(run(rows, 'optional', { categoryId: catB.id }).count).toBe(2);
  });
});

describe('searchModules order (17.2: required and due first, whatever the sort)', () => {
  const req = requirement('Req');
  const reqDue = mod('Zeta required and due', { requirementIds: [req.id] });
  const reqLater = mod('Alpha required', { requirementIds: [nextId()] });
  const reqOther = requirement('Other');
  const optA = mod('Aardvark optional');
  const optB = mod('Beta optional');
  const assignedSoon = mod('Mid assigned soon');
  const rows = build([optA, optB, reqDue, reqLater, assignedSoon], {
    requirements: [req, { ...reqOther, id: reqLater.requirementIds[0] as string }],
    placements: [optA, optB, reqDue, reqLater, assignedSoon].map((m) => placement(m.id, { availableToAll: true })),
    evidence: [
      evidenceExpiring(jade, req, -5),
      evidenceExpiring(jade, { ...reqOther, id: reqLater.requirementIds[0] as string }, 300),
    ],
    assignments: [assignment(jade, assignedSoon.id, 10)],
    events: [
      ev('lessonViewed', optB.id, '2026-10-18T10:00:00.000Z'),
      ev('lessonViewed', optA.id, '2026-10-01T10:00:00.000Z'),
    ],
  });

  it('A to Z keeps required-and-due, then other required, then optional', () => {
    expect(titles(run(rows, '', {}, 'az').rows)).toEqual([
      'Mid assigned soon',
      'Zeta required and due',
      'Alpha required',
      'Aardvark optional',
      'Beta optional',
    ]);
  });

  it('due sort orders by earliest due date inside the first partition', () => {
    const t = titles(run(rows, '', {}, 'due').rows);
    expect(t.slice(0, 2)).toEqual(['Zeta required and due', 'Mid assigned soon']);
    expect(t[2]).toBe('Alpha required');
  });

  it('recent sort puts the most recently active first inside each partition', () => {
    const t = titles(run(rows, '', {}, 'recent').rows);
    expect(t.slice(-2)).toEqual(['Beta optional', 'Aardvark optional']);
    expect(t.slice(0, 2).sort()).toEqual(['Mid assigned soon', 'Zeta required and due']);
  });

  it('does not mutate the rows it is given', () => {
    const before = titles(rows);
    run(rows, '', {}, 'az');
    expect(titles(rows)).toEqual(before);
  });
});

describe('groupProgress (assumption 26)', () => {
  const a = mod('One');
  const b = mod('Two');
  const c = mod('Three');
  const done = (m: typeof a) => [ev('moduleCompleted', m.id, '2026-10-10T10:00:00.000Z')];

  it('counts completed modules out of the visible modules in the group', () => {
    const g = group('G', [a.id, b.id, c.id]);
    const rows = build([a, b, c], { groups: [g], events: done(a) });
    expect(groupProgress(g, rows)).toMatchObject({ completed: 1, total: 3 });
  });

  it('counts only modules the person can see', () => {
    const g = group('G', [a.id, b.id]);
    const rows = build([a], { groups: [g] });
    expect(groupProgress(g, rows)).toMatchObject({ completed: 0, total: 1 });
  });

  it('in-order groups name the next module, which is the first not completed, but never block others', () => {
    const g = group('G', [a.id, b.id, c.id], { inOrder: true });
    const rows = build([a, b, c], { groups: [g], events: [...done(a), ...done(c)] });
    expect(groupProgress(g, rows).nextModuleId).toBe(b.id);
  });

  it('any-order groups have no next module', () => {
    const g = group('G', [a.id, b.id]);
    expect(groupProgress(g, build([a, b], { groups: [g] })).nextModuleId).toBeUndefined();
  });

  it('has no next module once everything is complete', () => {
    const g = group('G', [a.id], { inOrder: true });
    expect(groupProgress(g, build([a], { groups: [g], events: done(a) })).nextModuleId).toBeUndefined();
  });
});

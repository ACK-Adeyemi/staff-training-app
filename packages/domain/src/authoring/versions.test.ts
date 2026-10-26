// BP-2 and BP-3: drafts, versions, duplicates, delete rule and re-assign (plan Assumption 11; brief 5.1).
//
// API under test:
//   draftFrom(module, userId, now): ModuleDraft                 // own modules only; throws for provider modules
//   publishVersion({ current, draft, now }): { module: Module; snapshot: ModuleVersion | null }
//       published module = draft.module with id of current, status 'published', version current.version + 1, updatedAt now;
//       snapshot = previous published version, key `${id}:${version}`; a never-published module (status 'draft') keeps version 1 and gives snapshot null
//   duplicateModule(source, { newId, clientId, siteId?, now }): Module   // own draft v1, duplicatedFrom, deep copy, title contains the source title
//   canDeleteModule({ module, evidence, attempts, events }): boolean     // false once anyone completed it (Evidence, passed attempt or moduleCompleted event)
//   reassignTargets({ module, newVersion, evidence, attempts, assignments, people }): string[]
//       person ids (in `people` order) with Evidence or a pass on an older version, not archived, no open assignment, not already on newVersion
import { describe, expect, it } from 'vitest';
import type { Attempt, LearningEvent, Module } from '../schemas/learning';
import { addDays } from '../dates';
import {
  CLIENT,
  NOW,
  SITE_ID,
  assignment,
  evidenceExpiring,
  nextId,
  person,
  requirement,
} from '../progress/testFixtures';
import { mcq, moduleWith } from '../quiz/testFixtures';
import { canDeleteModule, draftFrom, duplicateModule, publishVersion, reassignTargets } from './versions';

const USER = '01HZX0000000000000000000U1';
const own = (over: Partial<Module> = {}): Module => ({
  ...moduleWith([mcq('q1'), mcq('q2')]),
  id: nextId(),
  owner: { clientId: CLIENT },
  title: 'Fire evacuation',
  version: 2,
  ...over,
});

describe('draftFrom', () => {
  it('copies an own module into a draft keyed by the module', () => {
    const m = own();
    const d = draftFrom(m, USER, NOW);
    expect(d).toMatchObject({ moduleId: m.id, clientId: CLIENT, updatedBy: USER, updatedAt: NOW.toISOString() });
    expect(d.module).toEqual(m);
  });

  it('copies deeply so editing the draft leaves the published module alone', () => {
    const m = own();
    const d = draftFrom(m, USER, NOW);
    d.module.title = 'Changed';
    d.module.questions[0]!.prompt = 'Changed';
    expect(m.title).toBe('Fire evacuation');
    expect(m.questions[0]!.prompt).toBe('Prompt q1');
  });

  it('refuses a provider module', () => {
    expect(() => draftFrom({ ...own(), owner: 'provider' }, USER, NOW)).toThrow();
  });
});

describe('publishVersion', () => {
  it('writes the draft as version n+1 and snapshots the previous version', () => {
    const current = own({ version: 2 });
    const draft = draftFrom(current, USER, NOW);
    draft.module.title = 'Fire evacuation v3';
    const r = publishVersion({ current, draft, now: NOW });
    expect(r.module).toMatchObject({ id: current.id, title: 'Fire evacuation v3', version: 3, status: 'published' });
    expect(r.module.updatedAt).toBe(NOW.toISOString());
    expect(r.snapshot).toMatchObject({ key: `${current.id}:2`, moduleId: current.id, version: 2 });
    expect(r.snapshot?.module).toEqual(current);
  });

  it('keeps the module id even if the draft carries another one', () => {
    const current = own();
    const draft = draftFrom(current, USER, NOW);
    draft.module.id = nextId();
    expect(publishVersion({ current, draft, now: NOW }).module.id).toBe(current.id);
  });

  it('publishes a never-published module as version 1 with no snapshot', () => {
    const current = own({ status: 'draft', version: 1 });
    const draft = { ...draftFrom(current, USER, NOW) };
    const r = publishVersion({ current, draft, now: NOW });
    expect(r.module).toMatchObject({ status: 'published', version: 1 });
    expect(r.snapshot).toBeNull();
  });
});

describe('duplicateModule', () => {
  const source = own({ owner: 'provider', version: 4, status: 'published' });
  const copy = duplicateModule(source, { newId: nextId(), clientId: CLIENT, siteId: SITE_ID, now: NOW });

  it('creates an editable own draft at version 1 that remembers where it came from', () => {
    expect(copy.owner).toEqual({ clientId: CLIENT, siteId: SITE_ID });
    expect(copy).toMatchObject({ status: 'draft', version: 1, duplicatedFrom: { moduleId: source.id, version: 4 } });
    expect(copy.id).not.toBe(source.id);
    expect(copy.title).toContain(source.title);
    expect(copy.updatedAt).toBe(NOW.toISOString());
  });

  it('keeps the content as a deep copy', () => {
    expect(copy.lessons).toEqual(source.lessons);
    expect(copy.questions).toEqual(source.questions);
    copy.questions[0]!.prompt = 'Changed';
    expect(source.questions[0]!.prompt).toBe('Prompt q1');
  });
});

describe('canDeleteModule', () => {
  const m = own();
  const p = person('Ava', 'One');
  const req = requirement('Fire');
  const attempt = (passed: boolean, over: Partial<Attempt> = {}): Attempt => ({
    id: nextId(),
    clientId: CLIENT,
    siteId: SITE_ID,
    personId: p.id,
    moduleId: m.id,
    moduleVersion: 1,
    mode: 'open',
    questionIds: ['q1'],
    startedAt: NOW.toISOString(),
    finishedAt: NOW.toISOString(),
    score: passed ? 90 : 40,
    passed,
    ...over,
  });
  const completed: LearningEvent = {
    id: nextId(),
    clientId: CLIENT,
    siteId: SITE_ID,
    personId: p.id,
    at: NOW.toISOString(),
    type: 'moduleCompleted',
    moduleId: m.id,
  };

  it('allows deleting when nobody has completed it', () => {
    expect(canDeleteModule({ module: m, evidence: [], attempts: [attempt(false)], events: [] })).toBe(true);
  });

  it('refuses once there is module Evidence', () => {
    const e = evidenceExpiring(p, req, 100, { moduleId: m.id, moduleVersion: 1 });
    expect(canDeleteModule({ module: m, evidence: [e], attempts: [], events: [] })).toBe(false);
  });

  it('refuses once someone passed or a completion event exists', () => {
    expect(canDeleteModule({ module: m, evidence: [], attempts: [attempt(true)], events: [] })).toBe(false);
    expect(canDeleteModule({ module: m, evidence: [], attempts: [], events: [completed] })).toBe(false);
  });

  it('ignores completions of other modules', () => {
    const other = { ...completed, moduleId: nextId() };
    const e = evidenceExpiring(p, req, 100, { moduleId: nextId(), moduleVersion: 1 });
    expect(
      canDeleteModule({ module: m, evidence: [e], attempts: [attempt(true, { moduleId: nextId() })], events: [other] }),
    ).toBe(true);
  });
});

describe('reassignTargets', () => {
  const m = own({ version: 2 });
  const req = requirement('Fire');
  const old = person('Old', 'Version');
  const current = person('Cur', 'Rent');
  const passer = person('Pass', 'Only');
  const open = person('Open', 'Already');
  const gone = person('Gone', 'Away', { status: 'archived' });
  const never = person('Never', 'Did');
  const people = [old, current, passer, open, gone, never];
  const ev = (p: typeof old, version: number) =>
    evidenceExpiring(p, req, 100, { moduleId: m.id, moduleVersion: version });
  const pass = (p: typeof old, version: number): Attempt => ({
    id: nextId(),
    clientId: CLIENT,
    siteId: SITE_ID,
    personId: p.id,
    moduleId: m.id,
    moduleVersion: version,
    mode: 'open',
    questionIds: ['q1'],
    startedAt: addDays(NOW, -50).toISOString(),
    finishedAt: addDays(NOW, -50).toISOString(),
    score: 90,
    passed: true,
  });
  const evidence = [ev(old, 1), ev(current, 1), ev(current, 2), ev(open, 1), ev(gone, 1)];
  const attempts = [pass(passer, 1)];
  const assignments = [assignment(open, m.id, 10)];
  const r = reassignTargets({ module: m, newVersion: 2, evidence, attempts, assignments, people });

  it('lists people who completed an older version, in people order', () => {
    expect(r).toEqual([old.id, passer.id]);
  });

  it('leaves out people already on the new version, archived people, people with an open assignment and people who never did it', () => {
    for (const p of [current, open, gone, never]) expect(r).not.toContain(p.id);
  });

  it('does not count a done or cancelled assignment as open', () => {
    const done = [assignment(open, m.id, 10, { status: 'done' }), assignment(old, m.id, 10, { status: 'cancelled' })];
    const again = reassignTargets({ module: m, newVersion: 2, evidence, attempts, assignments: done, people });
    expect(again).toEqual([old.id, passer.id, open.id]);
  });

  it('ignores Evidence for other modules', () => {
    const other = evidenceExpiring(never, req, 100, { moduleId: nextId(), moduleVersion: 1 });
    expect(
      reassignTargets({ module: m, newVersion: 2, evidence: [other], attempts: [], assignments: [], people }),
    ).toEqual([]);
  });
});

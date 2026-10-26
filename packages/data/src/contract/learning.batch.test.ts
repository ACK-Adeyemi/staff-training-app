// M1 chunk 5: each learning write and each assign is ONE atomic batch (plan Assumptions 14 and 15), checked on the
// raw backend so it cannot be faked by the adapter. Uses the memory backend wrapped in a counter.
import { describe, expect, it } from 'vitest';
import { createRng, dueAtFromLondonDate, fixedClock } from '@sta/domain';
import { createMemoryBackend } from '../memory/index';
import { createStore } from '../store';
import type { RawBackend, WriteOp } from '../backend';
import type { ActorContext, StoreHandle } from '../types';
import { addLearningFixture, answerAll, completeLessons, type LearningStore } from './learning';
import { buildWorld, TODAY } from './world';

function spied(): { backend: RawBackend; batches: WriteOp[][] } {
  const inner = createMemoryBackend();
  const batches: WriteOp[][] = [];
  return {
    batches,
    backend: {
      ...inner,
      apply: (ops) => {
        if (ops.length > 0) batches.push([...ops]);
        return inner.apply(ops);
      },
    },
  };
}
const storesOf = (batch: WriteOp[] | undefined): string[] => [...new Set((batch ?? []).map((o) => o.store))].sort();

async function setup() {
  const { backend, batches } = spied();
  const handle: StoreHandle = createStore(backend, { clock: fixedClock(TODAY), rng: createRng(7) });
  const fx = await buildWorld(handle.admin);
  const lf = await addLearningFixture(handle.admin, fx);
  const store = handle.store as unknown as LearningStore;
  const jade: ActorContext = { userId: fx.keys.users['jade'], side: 'staff', clientId: fx.ids.clients.a, now: TODAY };
  const priya: ActorContext = { userId: fx.ids.users.priya, side: 'client', clientId: fx.ids.clients.a, now: TODAY };
  return { store, fx, lf, batches, jade, priya };
}

describe('learning writes are single atomic batches', () => {
  it('passing writes evidence, assignment, attempt, events and audit in one batch', async () => {
    const s = await setup();
    await completeLessons(s.store, s.jade, s.lf.module);
    const attempt = await s.store.learning.startAttempt(s.jade, s.lf.moduleId);
    await answerAll(s.store, s.jade, attempt, true);
    const before = s.batches.length;
    await s.store.learning.finishAttempt(s.jade, attempt.id);
    expect(s.batches.length - before).toBe(1);
    expect(storesOf(s.batches.at(-1))).toEqual(['assignments', 'attempts', 'audit', 'evidence', 'learningEvents']);
  });

  it('failing writes the attempt and its event in one batch', async () => {
    const s = await setup();
    await completeLessons(s.store, s.jade, s.lf.module);
    const attempt = await s.store.learning.startAttempt(s.jade, s.lf.moduleId);
    await answerAll(s.store, s.jade, attempt, false);
    const before = s.batches.length;
    await s.store.learning.finishAttempt(s.jade, attempt.id);
    expect(s.batches.length - before).toBe(1);
    expect(storesOf(s.batches.at(-1))).toEqual(['attempts', 'learningEvents']);
  });

  it('starting an attempt writes the attempt and its event in one batch', async () => {
    const s = await setup();
    await completeLessons(s.store, s.jade, s.lf.module);
    const before = s.batches.length;
    await s.store.learning.startAttempt(s.jade, s.lf.moduleId);
    expect(s.batches.length - before).toBe(1);
    expect(storesOf(s.batches.at(-1))).toEqual(['attempts', 'learningEvents']);
  });

  it('assign writes assignments, notifications and audit in one batch', async () => {
    const s = await setup();
    const before = s.batches.length;
    await s.store.assignments.assign(s.priya, {
      moduleId: s.lf.moduleId,
      personIds: [s.fx.keys.personas['lucy'], s.fx.keys.personas['hannah']],
      dueAt: dueAtFromLondonDate('2026-11-02'),
    });
    expect(s.batches.length - before).toBe(1);
    expect(storesOf(s.batches.at(-1))).toEqual(['assignments', 'audit', 'notifications', 'onboarding']);
  });

  it('archiving a person writes the person and the cancelled assignments in one batch', async () => {
    const s = await setup();
    const lucy = (await s.store.people.list(s.priya)).find((p) => p.id === s.fx.keys.personas['lucy'])!;
    const before = s.batches.length;
    await s.store.people.put(s.priya, { ...lucy, status: 'archived', leftDate: TODAY });
    expect(s.batches.length - before).toBe(1);
    expect(storesOf(s.batches.at(-1))).toContain('assignments');
    expect(storesOf(s.batches.at(-1))).toContain('people');
  });
});

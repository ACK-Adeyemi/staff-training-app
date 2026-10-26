// M3 chunk 8: group assignment and publishing are each ONE atomic batch (plan "Data package": assignGroup in one
// batch; assumption 11: publish snapshots, writes and deletes the draft together). Checked on the raw backend.
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock, type ModuleGroup } from '@sta/domain';
import { createMemoryBackend } from '../memory/index';
import { createStore } from '../store';
import type { RawBackend, WriteOp } from '../backend';
import type { ActorContext, StoreHandle } from '../types';
import type { AuthoringFilesStore, ModuleInput } from './authoringFiles';
import { addLearningFixture } from './learning';
import { buildWorld, freshId, TODAY } from './world';

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
  const group: ModuleGroup = {
    id: freshId(4100),
    clientId: fx.ids.clients.a,
    name: 'Starter pack',
    description: 'Two short modules',
    moduleIds: [lf.moduleId, lf.retakeId],
    inOrder: false,
  };
  await handle.admin.bulkPut('moduleGroups', [group]);
  const store = handle.store as unknown as AuthoringFilesStore;
  const priya: ActorContext = { userId: fx.ids.users.priya, side: 'client', clientId: fx.ids.clients.a, now: TODAY };
  return { store, fx, lf, group, batches, priya };
}

const input = (requirementId: string, title: string): ModuleInput => ({
  title,
  description: 'Batch test',
  estimatedMinutes: 5,
  language: 'en-GB',
  requirementIds: [requirementId],
  roleTags: [],
  lessons: [{ id: 'intro', title: 'Introduction', minutes: 3, blocks: [{ kind: 'text', markdown: 'Read this.' }] }],
  questions: ['q1', 'q2'].map((q) => ({
    id: q,
    type: 'mcq' as const,
    prompt: `Question ${q}?`,
    options: [
      { id: `${q}-yes`, text: 'Yes', correct: true },
      { id: `${q}-no`, text: 'No', correct: false },
    ],
    explanation: 'Because.',
    learnMore: [],
    tags: [],
  })),
  quiz: {
    mode: 'mcq',
    drawCount: 2,
    shuffleQuestions: true,
    shuffleOptions: true,
    passMark: 80,
    maxRetakes: null,
    feedback: true,
    showSourceRef: true,
    notesInQuiz: 'choice',
    learnMoreFor: 'all',
  },
});

describe('authoring and group writes are single atomic batches', () => {
  it('assignGroup writes every assignment, notification and the audit event in one batch', async () => {
    const s = await setup();
    const before = s.batches.length;
    const out = await s.store.assignments.assignGroup(s.priya, {
      groupId: s.group.id,
      personIds: [s.fx.ids.people.hannah, s.fx.keys.personas['lucy']],
      dueAt: new Date(Date.parse(TODAY) + 14 * 86_400_000).toISOString(),
    });
    expect(out.created.length).toBeGreaterThan(1);
    expect(s.batches.length - before).toBe(1);
    expect(storesOf(s.batches.at(-1))).toEqual(['assignments', 'audit', 'notifications', 'onboarding']);
  });

  it('publishing a second version writes the module, its snapshot, the draft removal and the audit event in one batch', async () => {
    const s = await setup();
    const m = await s.store.authoring.create(s.priya, input(s.fx.ids.requirementId, 'Batch module'));
    await s.store.authoring.publish(s.priya, m.id, { reassign: false });
    await s.store.authoring.saveDraft(s.priya, m.id, input(s.fx.ids.requirementId, 'Batch module two'));
    const before = s.batches.length;
    await s.store.authoring.publish(s.priya, m.id, { reassign: false });
    expect(s.batches.length - before).toBe(1);
    expect(storesOf(s.batches.at(-1))).toEqual(['audit', 'moduleDrafts', 'moduleVersions', 'modules']);
  });

  it('saving a draft of a published module writes only the draft and the audit event', async () => {
    const s = await setup();
    const m = await s.store.authoring.create(s.priya, input(s.fx.ids.requirementId, 'Batch module'));
    await s.store.authoring.publish(s.priya, m.id, { reassign: false });
    const before = s.batches.length;
    await s.store.authoring.saveDraft(s.priya, m.id, input(s.fx.ids.requirementId, 'Edited'));
    expect(s.batches.length - before).toBe(1);
    expect(storesOf(s.batches.at(-1))).toEqual(['audit', 'moduleDrafts']);
  });

  it('a refused publish writes nothing', async () => {
    const s = await setup();
    const m = await s.store.authoring.create(s.priya, { ...input(s.fx.ids.requirementId, 'ab'), questions: [] });
    const before = s.batches.length;
    await expect(s.store.authoring.publish(s.priya, m.id, { reassign: false })).rejects.toThrow();
    expect(s.batches.length).toBe(before);
  });
});

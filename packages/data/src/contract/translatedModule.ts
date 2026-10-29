// M5 chunk 7 (F-5): completing a translated module (plan docs/plans/m5.md F-5, assumption 6; brief 21.4). Runs against every
// adapter. Written before the implementation. Rules under test:
//   - Taking the Polish module and passing writes Evidence with language 'pl-PL', moduleId = the Polish module (the one
//     actually taken), moduleVersion of it, and requirementId = the ORIGINAL module's requirement.
//   - The person's open assignment to the ORIGINAL module becomes done (the Polish module counts for it).
//   - Safer sleep style statistics (moduleStats with translations) include the Polish attempt and completion.
//   - A failed Polish attempt writes no Evidence and leaves the original assignment open.
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock, moduleStats, type Evidence, type Module } from '@sta/domain';
import type { ActorContext, StoreHandle, StoreOptions } from '../types';
import { buildWorld, freshId, TODAY } from './world';
import { addLearningFixture, answerAll, completeLessons, type LearningHandle } from './learning';

export function runTranslatedModuleContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = (await makeStore(options)) as unknown as LearningHandle;
    const fx = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const pl: Module = {
      ...lf.module,
      id: freshId(900),
      title: 'Moduł testowy',
      language: 'pl-PL',
      translatedFrom: { moduleId: lf.moduleId, machine: true },
      version: 1,
    };
    await handle.admin.bulkPut('modules', [pl]);
    const staff = (userId: string): ActorContext => ({ userId, side: 'staff', clientId: fx.ids.clients.a, now: TODAY });
    const jade = staff(fx.keys.users['jade']);
    const priya: ActorContext = { userId: fx.ids.users.priya, side: 'client', clientId: fx.ids.clients.a, now: TODAY };
    return { ...handle, fx, lf, pl, jade, priya };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  async function takePolish(s: S, right: boolean) {
    await completeLessons(s.store, s.jade, s.pl);
    const attempt = await s.store.learning.startAttempt(s.jade, s.pl.id);
    await answerAll(s.store, s.jade, attempt, right);
    return { attempt, result: await s.store.learning.finishAttempt(s.jade, attempt.id) };
  }

  describe(`Translated module: ${name}`, () => {
    it('on a pass writes Evidence in pl-PL for the original module requirement', async () => {
      const s = await setup();
      const { result } = await takePolish(s, true);
      expect(result.passed).toBe(true);
      expect(result.evidence).toHaveLength(1);
      const [ev] = result.evidence as [Evidence];
      expect(ev).toMatchObject({
        kind: 'module',
        language: 'pl-PL',
        moduleId: s.pl.id,
        moduleVersion: 1,
        requirementId: s.fx.ids.requirementId,
        personId: s.fx.keys.personas['jade'],
        clientId: s.fx.ids.clients.a,
        completedAt: TODAY,
      });
      expect(await s.store.evidence.list(s.priya, { personId: s.fx.keys.personas['jade'] })).toContainEqual(ev);
    });

    it('closes the open assignment to the original module', async () => {
      const s = await setup();
      expect((await s.store.assignments.get(s.jade, s.lf.assignments.jade)).status).toBe('open');
      await takePolish(s, true);
      expect((await s.store.assignments.get(s.jade, s.lf.assignments.jade)).status).toBe('done');
    });

    it('writes nothing to Evidence and keeps the assignment open on a fail', async () => {
      const s = await setup();
      const { result } = await takePolish(s, false);
      expect(result.passed).toBe(false);
      expect(result.evidence).toEqual([]);
      expect((await s.store.assignments.get(s.jade, s.lf.assignments.jade)).status).toBe('open');
    });

    it('leaves a colleague assignment to the original module alone', async () => {
      const s = await setup();
      await takePolish(s, true);
      const lucy = (await s.store.assignments.list(s.priya)).find((a) => a.id === s.lf.assignments.lucy)!;
      expect(lucy.status).toBe('open');
    });

    it('lets Safer sleep style stats include the Polish attempt and completion', async () => {
      const s = await setup();
      const { attempt } = await takePolish(s, true);
      const input = {
        module: s.lf.module,
        assignments: await s.store.assignments.list(s.priya),
        attempts: await s.store.attempts.list(s.priya),
        events: await s.store.learningEvents.list(s.priya),
        evidence: await s.store.evidence.list(s.priya),
        now: new Date(TODAY),
      };
      expect(input.attempts.map((a) => a.id)).toContain(attempt.id);
      const without = moduleStats(input);
      const withPl = moduleStats({ ...input, translations: [s.pl] });
      expect(withPl.headline.started).toBe(without.headline.started + 1);
      expect(withPl.headline.completed).toBeGreaterThanOrEqual(1);
      expect(withPl.headline.passRate).not.toBeNull();
      expect(without.headline.completed).toBe(withPl.headline.completed); // the done assignment counts either way
    });

    it('does not let another client read the Polish attempt or its evidence', async () => {
      const s = await setup();
      const { attempt, result } = await takePolish(s, true);
      const gina: ActorContext = {
        userId: s.fx.ids.users.gina,
        side: 'client',
        clientId: s.fx.ids.clients.ot,
        now: TODAY,
      };
      expect((await s.store.attempts.list(gina)).map((a) => a.id)).not.toContain(attempt.id);
      expect((await s.store.evidence.list(gina)).map((e) => e.id)).not.toContain(result.evidence[0]!.id);
    });
  });
}

// M3 chunk 10b contract tests, part 3: the leftovers of Data E (plan docs/plans/m3.md, assumptions 27, 29, Data package
// `reminders`, `autoAssign`, `DemoAdmin.runJobs`). Runs against every adapter. The plan leaves these shapes open, so
// the implementer follows this comment. (Chunk 10a already covers rules, the weekly cap, quiet hours and snooze.)
//
//   - `reminders.digestPreview(ctx)` (reminders.view, availability `reminders`) returns
//     `{ overdue: { personId }[]; expiring: { personId }[] }` for the actor's scope only (a person appears once per list).
//     Overdue = an open assignment past its due date. Expiring = Evidence expiring within the client's largest
//     expiringOffsetsDays. It writes nothing and never sends anything to staff.
//   - `reminders.send(ctx, personIds)` (reminders.manage, availability `reminders`) sends one reminder per person who has
//     something overdue or expiring: a Notification (kind 'reminder', for the person's staff user) and an Outbox
//     message whose `reason` starts with 'reminder'. Returns `{ sent: string[]; skipped: { personId; reason }[] }` where
//     reason is a domain SkipReason ('paused', 'onLeave', 'awaitingCheck', 'quietHours', 'cap'); a person with nothing to
//     chase is skipped too. A person outside the actor's scope is ForbiddenError('outOfScope') and nothing is sent.
//   - `runJobs(now)` ends add-on periods: an add-on subscription that is on or in trial and whose `endsAt` is at or
//     before `now` is set to status 'off' (endsAt kept, usageThisPeriod unchanged). A running one is left alone. A second
//     run changes nothing.
//   - The package `autoAssignRules` limit counts every stored rule of the client: saving a new rule beyond it is
//     NotEntitledError('autoAssignRules'); updating an existing rule never counts; removing one frees a place.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  type AddOnSubscription,
  type Assignment,
  type AutoAssignRule,
  type Module,
  type Notification,
  type OutboxMessage,
  type Person,
} from '@sta/domain';
import {
  AccountStateError,
  ForbiddenError,
  NotEntitledError,
  type ActorContext,
  type DemoAdmin,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { addLearningFixture, changedStores, refusal } from './learning';
import { buildWorld, freshId, TODAY } from './world';

type Sent = { sent: string[]; skipped: { personId: string; reason: string }[] };
type LeftoverStore = {
  reminders: {
    digestPreview(ctx: ActorContext): Promise<{ overdue: { personId: string }[]; expiring: { personId: string }[] }>;
    send(ctx: ActorContext, personIds: string[]): Promise<Sent>;
  };
  autoAssign: {
    save(ctx: ActorContext, rule: Omit<AutoAssignRule, 'id' | 'clientId'> & { id?: string }): Promise<AutoAssignRule>;
    remove(ctx: ActorContext, id: string): Promise<void>;
  };
};

const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
async function dump<T>(admin: DemoAdmin, store: StoreName): Promise<T[]> {
  return ((await admin.dumpAll()) as Record<string, unknown[]>)[store] as T[];
}
const PAST = '2026-10-10T12:00:00.000Z';

export function runRemindersLeftoversContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const admin = handle.admin as DemoAdmin & { runJobs(now: string): Promise<unknown> };
    const store = handle.store as unknown as LeftoverStore;
    const a = fx.ids.clients.a;
    const ot = fx.ids.clients.ot;

    const overdue = (n: number, personId: string, clientId = a): Assignment => ({
      id: freshId(9000 + n),
      clientId,
      personId,
      target: { moduleId: lf.moduleId },
      dueAt: PAST,
      source: 'manual',
      assignedBy: fx.ids.users.priya,
      createdAt: '2026-10-01T09:00:00.000Z',
      status: 'open',
    });
    // Jade (Main) and Mia (Annexe) are overdue; the fixture's own open assignments are cancelled so only these count.
    const existing = await dump<Assignment>(admin, 'assignments');
    await admin.bulkPut(
      'assignments',
      existing.map((x) => ({ ...x, status: 'cancelled' as const })),
    );
    await admin.bulkPut('assignments', [
      overdue(1, fx.ids.people.jade),
      overdue(2, fx.ids.people.mia),
      overdue(3, fx.ids.people.otRiver, ot),
      overdue(4, fx.ids.people.otHillside, ot),
    ]);

    const actors = {
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      rory: client(fx.ids.users.rory, a),
      tariq: client(fx.ids.users.riverMgr, ot),
      gina: client(fx.ids.users.gina, ot),
      beth: client(fx.ids.users.beth, fx.ids.clients.b),
      roOwner: client(fx.ids.stateClients.readOnly.owner.id, fx.ids.clients.readOnly),
    };
    const reminderNotes = async (): Promise<Notification[]> =>
      (await dump<Notification>(admin, 'notifications')).filter((n) => n.kind === 'reminder');
    const reminderMail = async (): Promise<OutboxMessage[]> =>
      (await admin.listOutbox()).filter((m) => m.reason.startsWith('reminder'));
    return { ...fx, lf, admin, store, a, ot, actors, reminderNotes, reminderMail };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  describe(`Reminder sends, digest, add-on period ends and rule cap contract: ${name}`, () => {
    describe('reminders.digestPreview (BP-6)', () => {
      it('lists overdue people for the actor scope: Priya sees both Little Acorns sites, Daniel only his', async () => {
        const s: S = await setup();
        const all = await s.store.reminders.digestPreview(s.actors.priya);
        expect(all.overdue.map((x) => x.personId).sort()).toEqual([s.ids.people.jade, s.ids.people.mia].sort());
        const daniel = await s.store.reminders.digestPreview(s.actors.daniel);
        expect(daniel.overdue.map((x) => x.personId)).toEqual([s.ids.people.jade]);
      });

      it('never shows another client and writes and sends nothing', async () => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        const mailBefore = (await s.admin.listOutbox()).length;
        const oak = await s.store.reminders.digestPreview(s.actors.gina);
        expect(oak.overdue.map((x) => x.personId).sort()).toEqual(
          [s.ids.people.otRiver, s.ids.people.otHillside].sort(),
        );
        await s.store.reminders.digestPreview(s.actors.priya);
        expect(await s.admin.dumpAll()).toEqual(before);
        expect((await s.admin.listOutbox()).length).toBe(mailBefore);
      });

      it('lists people whose Evidence is about to expire', async () => {
        const s: S = await setup();
        const hannah = (await dump<{ id: string; personId: string; expiresAt?: string }>(s.admin, 'evidence')).find(
          (e) => e.personId === s.ids.people.hannah,
        )!;
        await s.admin.bulkPut('evidence', [{ ...hannah, expiresAt: '2026-11-10T09:00:00.000Z' }]);
        const preview = await s.store.reminders.digestPreview(s.actors.priya);
        expect(preview.expiring.map((x) => x.personId)).toContain(s.ids.people.hannah);
      });

      it('needs reminders.view: Rory is refused with permission', async () => {
        const s: S = await setup();
        const error = await refusal(s.store.reminders.digestPreview(s.actors.rory));
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).reason).toBe('permission');
      });
    });

    describe('reminders.send (BP-6)', () => {
      it('sends a reminder notification and an Outbox message and nothing else but audit', async () => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        const result = await s.store.reminders.send(s.actors.priya, [s.ids.people.jade]);
        expect(result.sent).toEqual([s.ids.people.jade]);
        expect(result.skipped).toEqual([]);
        const notes = await s.reminderNotes();
        expect(notes.map((n) => n.userId)).toEqual([s.ids.users.jade]);
        expect(await s.reminderMail()).toHaveLength(1);
        const changed = changedStores(before, await s.admin.dumpAll());
        expect(changed.filter((x) => !['notifications', 'outbox', 'reminderLog', 'audit'].includes(x))).toEqual([]);
        expect(changed).toEqual(expect.arrayContaining(['notifications', 'outbox']));
      });

      it('skips a paused person with reason paused and sends to the rest', async () => {
        const s: S = await setup();
        const people = await dump<Person>(s.admin, 'people');
        const mia = people.find((p) => p.id === s.ids.people.mia)!;
        await s.admin.bulkPut('people', [{ ...mia, pausedUntil: '2026-11-30T00:00:00.000Z' }]);
        const result = await s.store.reminders.send(s.actors.priya, [s.ids.people.jade, s.ids.people.mia]);
        expect(result.sent).toEqual([s.ids.people.jade]);
        expect(result.skipped).toEqual([{ personId: s.ids.people.mia, reason: 'paused' }]);
      });

      it('skips a person on leave with reason onLeave', async () => {
        const s: S = await setup();
        const jade = (await dump<Person>(s.admin, 'people')).find((p) => p.id === s.ids.people.jade)!;
        await s.admin.bulkPut('people', [{ ...jade, status: 'onLeave' }]);
        const result = await s.store.reminders.send(s.actors.priya, [s.ids.people.jade]);
        expect(result.sent).toEqual([]);
        expect(result.skipped).toEqual([{ personId: s.ids.people.jade, reason: 'onLeave' }]);
        expect(await s.reminderMail()).toEqual([]);
      });

      it('skips someone with nothing overdue or expiring and sends nothing for them', async () => {
        const s: S = await setup();
        const ben = s.ids.people.ben;
        const result = await s.store.reminders.send(s.actors.priya, [ben]);
        expect(result.sent).toEqual([]);
        expect(result.skipped.map((x) => x.personId)).toEqual([ben]);
        expect(await s.reminderNotes()).toEqual([]);
      });

      it('refuses a person outside the actor scope with outOfScope and sends nothing', async () => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        const error = await refusal(
          s.store.reminders.send(s.actors.tariq, [s.ids.people.otRiver, s.ids.people.otHillside]),
        );
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).reason).toBe('outOfScope');
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('refuses another client person without sending anything', async () => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        await refusal(s.store.reminders.send(s.actors.priya, [s.ids.people.otRiver]));
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('needs reminders.manage: Daniel (view only) is refused with permission', async () => {
        const s: S = await setup();
        const error = await refusal(s.store.reminders.send(s.actors.daniel, [s.ids.people.jade]));
        expect((error as ForbiddenError).reason).toBe('permission');
        expect(await s.reminderMail()).toEqual([]);
      });

      it('is refused in Read-only with AccountStateError reminders', async () => {
        const s: S = await setup();
        const error = await refusal(s.store.reminders.send(s.actors.roOwner, []));
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).feature).toBe('reminders');
      });
    });

    describe('runJobs ends add-on periods (assumption 27)', () => {
      const sub = (clientId: string, addOnId: string, over: Partial<AddOnSubscription>): AddOnSubscription => ({
        clientId,
        addOnId,
        status: 'on',
        usageThisPeriod: 4,
        ...over,
      });

      it('turns an ended trial off, keeps its end date and usage, and leaves a running one alone', async () => {
        const s: S = await setup();
        await s.admin.bulkPut('addOnSubscriptions', [
          sub(s.a, s.ids.addOnId, {
            status: 'trial',
            startedAt: '2026-10-07T09:00:00.000Z',
            endsAt: '2026-10-21T09:00:00.000Z',
          }),
          sub(s.ids.clients.b, s.ids.addOnId, { status: 'on', startedAt: '2026-09-01T09:00:00.000Z' }),
        ]);
        await s.admin.runJobs('2026-10-20T09:00:00.000Z');
        const early = await dump<AddOnSubscription>(s.admin, 'addOnSubscriptions');
        expect(early.find((x) => x.clientId === s.a)?.status).toBe('trial');
        await s.admin.runJobs('2026-10-21T09:00:00.000Z');
        const after = await dump<AddOnSubscription>(s.admin, 'addOnSubscriptions');
        expect(after.find((x) => x.clientId === s.a)).toMatchObject({
          status: 'off',
          endsAt: '2026-10-21T09:00:00.000Z',
          usageThisPeriod: 4,
        });
        expect(after.find((x) => x.clientId === s.ids.clients.b)?.status).toBe('on');
      });

      it('turns off a subscription that was set to end at renewal, and a second run changes nothing', async () => {
        const s: S = await setup();
        await s.admin.bulkPut('addOnSubscriptions', [sub(s.a, s.ids.addOnId, { endsAt: '2026-10-31T00:00:00.000Z' })]);
        await s.admin.runJobs('2026-11-01T09:00:00.000Z');
        const once = await s.admin.dumpAll();
        expect((await dump<AddOnSubscription>(s.admin, 'addOnSubscriptions'))[0]?.status).toBe('off');
        await s.admin.runJobs('2026-11-01T09:00:00.000Z');
        expect(await s.admin.dumpAll()).toEqual(once);
      });
    });

    describe('autoAssignRules plan limit (assumption 25)', () => {
      const modules = async (s: S, n: number): Promise<Module[]> => {
        const made = Array.from({ length: n }, (_, i): Module => ({
          ...s.lf.module,
          id: freshId(9100 + i),
          title: `Rule target ${String(i)}`,
        }));
        await s.admin.bulkPut('modules', made);
        return made;
      };
      const input = (m: Module, n: number) => ({
        name: `Cap rule ${String(n)}`,
        enabled: true,
        trigger: { type: 'personAdded' as const },
        filters: {},
        action: { moduleId: m.id },
        dueInDays: 14,
      });

      it('refuses a third rule on Essentials (limit 2) with NotEntitled autoAssignRules, and writes nothing', async () => {
        const s: S = await setup();
        const [m1, m2, m3] = await modules(s, 3);
        await s.store.autoAssign.save(s.actors.beth, input(m1!, 1));
        await s.store.autoAssign.save(s.actors.beth, input(m2!, 2));
        const before = await s.admin.dumpAll();
        const error = await refusal(s.store.autoAssign.save(s.actors.beth, input(m3!, 3)));
        expect(error).toBeInstanceOf(NotEntitledError);
        expect((error as NotEntitledError).feature).toBe('autoAssignRules');
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('lets an existing rule be edited at the limit, and a removal frees a place', async () => {
        const s: S = await setup();
        const [m1, m2, m3] = await modules(s, 3);
        const first = await s.store.autoAssign.save(s.actors.beth, input(m1!, 1));
        await s.store.autoAssign.save(s.actors.beth, input(m2!, 2));
        const edited = await s.store.autoAssign.save(s.actors.beth, { ...input(m1!, 1), id: first.id, dueInDays: 30 });
        expect(edited.dueInDays).toBe(30);
        await s.store.autoAssign.remove(s.actors.beth, first.id);
        const third = await s.store.autoAssign.save(s.actors.beth, input(m3!, 3));
        expect(third.clientId).toBe(s.ids.clients.b);
      });

      it('counts only the client own rules: another client rules do not use the place', async () => {
        const s: S = await setup();
        const [m1, m2] = await modules(s, 2);
        await s.admin.bulkPut('autoAssignRules', [
          { ...input(m1!, 9), id: freshId(9200), clientId: s.ot },
          { ...input(m1!, 10), id: freshId(9201), clientId: s.ot },
          { ...input(m1!, 11), id: freshId(9202), clientId: s.ot },
        ]);
        await s.store.autoAssign.save(s.actors.beth, input(m1!, 1));
        const second = await s.store.autoAssign.save(s.actors.beth, input(m2!, 2));
        expect(second.clientId).toBe(s.ids.clients.b);
      });
    });
  });
}

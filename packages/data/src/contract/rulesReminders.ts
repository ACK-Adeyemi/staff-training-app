// M3 chunk 10a contract tests, "Data E (first half): rules, jobs, reminders, notification snooze" (plan docs/plans/m3.md,
// assumptions 25 to 30, Data package `people.add`, `autoAssign`, `reminders`, `notifications.snooze`, `DemoAdmin.runJobs`,
// Contract tests "Rules, reminders, jobs"). Proves the data-layer parts of BP-5, BP-6, BP-18 (reminders part) and F-7.
// Runs against every adapter. Written before the implementation, so the new methods are described by the local types below.
//
// Conventions the tests assume (the plan leaves them open):
//   - `people.add(ctx, input)` needs staff.manage within scope of input.primarySiteId (and any additional site), makes the
//     Person (clientId from the actor, prefs defaulted) and runs the `personAdded` rules in the same batch.
//     `people.update(ctx, id, patch)` runs the `roleChanged` rules in the same batch when `jobRoleIds` changes.
//   - `autoAssign` operations need assign.manage and `authoring` availability (AccountStateError in Read-only).
//     `save` upserts (clientId from the actor) and refuses a second rule with the same trigger, filters and action with
//     RuleError('duplicateRule'). `preview(ctx, ruleId)` is the domain previewRule on the stored data.
//     `history(ctx, ruleId)` lists the assignments that carry `source: { ruleId }`, oldest first.
//   - Assignments from a rule: source { ruleId }, assignedBy the acting user (or the person adding them), status 'open',
//     dueAt = now + dueInDays (requirementExpiring: expiry + dueInDays).
//   - `DemoAdmin.runJobs(now)` takes an ISO string; it does not use the injected clock for the run. It runs
//     requirementExpiring rules and reminders for every client and writes a `reminderLog` entry per reminder.
//   - A reminder is one Notification (kind 'reminder', userId the staff user of the person) plus one Outbox message whose
//     `reason` starts with 'reminder' (Limited: no Outbox message). Nothing else is written except audit.
//   - `reminders.policy(ctx)` / `savePolicy(ctx, policy)` need reminders.manage (reminders.view to read).
//     `chaseOverdue(ctx, { preview: true })` returns the domain chasePreview shape and writes nothing.
//   - `notifications.snooze(ctx, id)`: the owner only; sets snoozedUntil to 08:00 London on the next London day. `list`
//     leaves out items whose snoozedUntil is after ctx.now.
import { describe, expect, it } from 'vitest';
import {
  addDays,
  createRng,
  fixedClock,
  londonWeekKey,
  type Assignment,
  type AutoAssignRule,
  type Client,
  type Evidence,
  type EvidenceSubmission,
  type Module,
  type ModuleGroup,
  type Notification,
  type OutboxMessage,
  type Person,
  type ReminderLog,
  type Subscription,
} from '@sta/domain';
import {
  AccountStateError,
  DataError,
  ForbiddenError,
  NotFoundError,
  type ActorContext,
  type DemoAdmin,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { addLearningFixture, changedStores, refusal, ruleOf } from './learning';
import { buildWorld, freshId, TODAY, type World } from './world';

// ---------------------------------------------------------------- the API under test

export type RuleInput = Omit<AutoAssignRule, 'id' | 'clientId'> & { id?: string };
export type PersonInput = Pick<
  Person,
  'primarySiteId' | 'additionalSiteIds' | 'teamIds' | 'firstName' | 'lastName' | 'jobRoleIds' | 'startDate' | 'status'
>;
export type ReminderPolicy = Client['settings']['reminderPolicy'];
export type ChaseResult = {
  willSend: { personId: string }[];
  skipped: { personId: string; reason: string }[];
};
export type RulesStore = {
  people: {
    add(ctx: ActorContext, input: PersonInput): Promise<Person>;
    update(ctx: ActorContext, id: string, patch: Partial<PersonInput> & { pausedUntil?: string }): Promise<Person>;
  };
  autoAssign: {
    list(ctx: ActorContext): Promise<AutoAssignRule[]>;
    save(ctx: ActorContext, input: RuleInput): Promise<AutoAssignRule>;
    setEnabled(ctx: ActorContext, id: string, enabled: boolean): Promise<AutoAssignRule>;
    remove(ctx: ActorContext, id: string): Promise<void>;
    preview(ctx: ActorContext, id: string): Promise<{ count: number; personIds: string[] }>;
    history(ctx: ActorContext, id: string): Promise<Assignment[]>;
  };
  reminders: {
    policy(ctx: ActorContext): Promise<ReminderPolicy>;
    savePolicy(
      ctx: ActorContext,
      policy: ReminderPolicy,
      templates?: Record<string, { tone: 'friendly' | 'neutral' | 'brief'; text?: string }>,
    ): Promise<ReminderPolicy>;
    chaseOverdue(ctx: ActorContext, options: { preview: true }): Promise<ChaseResult>;
  };
  notifications: {
    list(ctx: ActorContext): Promise<Notification[]>;
    snooze(ctx: ActorContext, id: string): Promise<Notification>;
  };
  me: { updatePrefs(ctx: ActorContext, patch: { quietHours?: { from: string; to: string } | null }): Promise<unknown> };
};
export type JobsAdmin = DemoAdmin & { runJobs(now: string): Promise<unknown> };

// ---------------------------------------------------------------- helpers

const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });
const at = (ctx: ActorContext, now: string): ActorContext => ({ ...ctx, now });

const PRACTITIONER = '01M0C0N7000000000000000505';
const KITCHEN = '01M0C0N7000000000000000507';

async function dump<T>(admin: DemoAdmin, store: StoreName): Promise<T[]> {
  return ((await admin.dumpAll()) as Record<string, unknown[]>)[store] as T[];
}
async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await refusal(promise);
  expect(error).toBeInstanceOf(ForbiddenError);
  return (error as ForbiddenError).reason;
}
const isReminderMail = (m: OutboxMessage): boolean => m.reason.startsWith('reminder');

export function runRulesRemindersContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx: World = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const admin = handle.admin as JobsAdmin;
    const store = handle.store as unknown as RulesStore;
    const a = fx.ids.clients.a;
    const ot = fx.ids.clients.ot;
    const main = fx.ids.sites.main;
    const annexe = fx.ids.sites.annexe;

    // Two modules with no requirement (induction, handbook) and one that satisfies the Safeguarding requirement.
    const mod = (n: number, title: string, requirementIds: string[]): Module => ({
      ...lf.module,
      id: freshId(6000 + n),
      title,
      version: 1,
      requirementIds,
    });
    const induction = mod(1, 'New starter induction', []);
    const handbook = mod(2, 'Staff handbook', []);
    const safeguarding = mod(3, 'Safeguarding refresher', [fx.ids.requirementId]);
    await admin.bulkPut('modules', [induction, handbook, safeguarding]);
    const group: ModuleGroup = {
      id: freshId(6100),
      clientId: a,
      name: 'Starter pack',
      description: 'Two starter modules',
      moduleIds: [induction.id, handbook.id],
      inOrder: false,
    };
    await admin.bulkPut('moduleGroups', [group]);

    const actors = {
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      rory: client(fx.ids.users.rory, a),
      jade: staff(fx.ids.users.jade, a),
      ben: staff(fx.ids.users.ben, a),
      gina: client(fx.ids.users.gina, ot),
      readOnlyOwner: client(fx.ids.stateClients.readOnly.owner.id, fx.ids.clients.readOnly),
    };

    const rule = (n: number, over: Partial<RuleInput> = {}): RuleInput => ({
      name: `Rule ${String(n)}`,
      enabled: true,
      trigger: { type: 'personAdded' },
      filters: { jobRoleIds: [PRACTITIONER] },
      action: { moduleId: induction.id },
      dueInDays: 14,
      ...over,
    });
    /** Puts a rule straight into the store (no operation involved). */
    const seedRule = async (n: number, over: Partial<AutoAssignRule> = {}): Promise<AutoAssignRule> => {
      const r: AutoAssignRule = {
        id: freshId(6200 + n),
        clientId: a,
        name: `Seeded rule ${String(n)}`,
        enabled: true,
        trigger: { type: 'personAdded' },
        filters: { jobRoleIds: [PRACTITIONER] },
        action: { moduleId: induction.id },
        dueInDays: 14,
        ...over,
      };
      await admin.bulkPut('autoAssignRules', [r]);
      return r;
    };
    const newcomer = (over: Partial<PersonInput> = {}): PersonInput => ({
      primarySiteId: main,
      additionalSiteIds: [],
      teamIds: [],
      firstName: 'Nora',
      lastName: 'Newstarter',
      jobRoleIds: [PRACTITIONER],
      startDate: TODAY,
      status: 'active',
      ...over,
    });
    const assignmentsOf = async (personId: string): Promise<Assignment[]> =>
      (await dump<Assignment>(admin, 'assignments')).filter((x) => x.personId === personId);
    const people = async (): Promise<Person[]> => await dump<Person>(admin, 'people');

    const dueAssignment = (n: number, personId: string, dueAt: string, over: Partial<Assignment> = {}): Assignment => ({
      id: freshId(6300 + n),
      clientId: a,
      personId,
      target: { moduleId: induction.id },
      dueAt,
      source: 'manual',
      assignedBy: fx.ids.users.priya,
      createdAt: '2026-10-01T09:00:00.000Z',
      status: 'open',
      ...over,
    });
    const reminderLog = async (): Promise<ReminderLog[]> => await dump<ReminderLog>(admin, 'reminderLog');
    const logFor = async (personId: string): Promise<ReminderLog[]> =>
      (await reminderLog()).filter((l) => l.personId === personId);
    const reminderNotes = async (userId?: string): Promise<Notification[]> =>
      (await dump<Notification>(admin, 'notifications')).filter(
        (n) => n.kind === 'reminder' && (userId === undefined || n.userId === userId),
      );
    const reminderMail = async (): Promise<OutboxMessage[]> => (await admin.listOutbox()).filter(isReminderMail);
    /** Sets one person's status, pause date or prefs through bulkPut. */
    const patchPerson = async (personId: string, patch: Partial<Person>): Promise<void> => {
      const p = (await people()).find((x) => x.id === personId)!;
      await admin.bulkPut('people', [{ ...p, ...patch }]);
    };
    /** The learning fixture gives Jade an assignment due 2 November; tests that count the 26 October sends clear it. */
    const clearFixtureAssignment = async (): Promise<void> => {
      const x = (await dump<Assignment>(admin, 'assignments')).find((a) => a.id === lf.assignments.jade)!;
      await admin.bulkPut('assignments', [{ ...x, status: 'cancelled' }]);
    };
    const jade = fx.ids.people.jade;
    const jadeUser = fx.ids.users.jade;

    return {
      ...fx,
      handle,
      admin,
      store,
      a,
      ot,
      main,
      annexe,
      lf,
      induction,
      handbook,
      safeguarding,
      group,
      actors,
      rule,
      seedRule,
      newcomer,
      assignmentsOf,
      people,
      dueAssignment,
      reminderLog,
      logFor,
      reminderNotes,
      reminderMail,
      patchPerson,
      clearFixtureAssignment,
      jade,
      jadeUser,
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  describe(`Rules, jobs and reminders contract: ${name}`, () => {
    // ------------------------------------------------------------ BP-5: people.add and personAdded rules
    describe('people.add and personAdded rules (BP-5)', () => {
      it('assigns the rule module to a new matching person in the same batch, with source ruleId and the due date', async () => {
        const s: S = await setup();
        const r = await s.seedRule(1);
        const before = await s.admin.dumpAll();
        const added = await s.store.people.add(s.actors.priya, s.newcomer());
        const after = await s.admin.dumpAll();
        expect(added.clientId).toBe(s.a);
        const mine = await s.assignmentsOf(added.id);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({
          clientId: s.a,
          target: { moduleId: s.induction.id },
          source: { ruleId: r.id },
          status: 'open',
        });
        expect(mine[0]!.dueAt.slice(0, 10)).toBe('2026-11-02');
        // The person and the assignment arrive together; no store other than these (and audit) changes.
        const changed = changedStores(before, after);
        expect(changed).toEqual(expect.arrayContaining(['people', 'assignments', 'audit']));
        expect(changed.filter((x) => !['people', 'assignments', 'audit', 'notifications'].includes(x))).toEqual([]);
      });

      it('assigns nothing when the new person does not match the rule filters', async () => {
        const s = await setup();
        await s.seedRule(1);
        const added = await s.store.people.add(s.actors.priya, s.newcomer({ jobRoleIds: [KITCHEN] }));
        expect(await s.assignmentsOf(added.id)).toEqual([]);
      });

      it('assigns nothing from a disabled rule', async () => {
        const s = await setup();
        await s.seedRule(1, { enabled: false });
        const added = await s.store.people.add(s.actors.priya, s.newcomer());
        expect(await s.assignmentsOf(added.id)).toEqual([]);
      });

      it('applies site and team filters (a person matches a list if any of theirs is in it)', async () => {
        const s = await setup();
        const team = s.data.teams.find((t) => t.clientId === s.a)!;
        await s.seedRule(1, { filters: { siteIds: [s.annexe] } });
        await s.seedRule(2, {
          filters: { teamIds: [team.id] },
          action: { moduleId: s.handbook.id },
        });
        const atMain = await s.store.people.add(s.actors.priya, s.newcomer({ firstName: 'Mainy' }));
        expect(await s.assignmentsOf(atMain.id)).toEqual([]);
        const viaExtra = await s.store.people.add(
          s.actors.priya,
          s.newcomer({ firstName: 'Extra', additionalSiteIds: [s.annexe], teamIds: [team.id] }),
        );
        const got = (await s.assignmentsOf(viaExtra.id)).map((x) => (x.target as { moduleId: string }).moduleId).sort();
        expect(got).toEqual([s.induction.id, s.handbook.id].sort());
      });

      it('expands a group action into one module assignment per group module', async () => {
        const s = await setup();
        await s.seedRule(1, { action: { groupId: s.group.id } });
        const added = await s.store.people.add(s.actors.priya, s.newcomer());
        const mine = await s.assignmentsOf(added.id);
        expect(mine.map((x) => (x.target as { moduleId: string }).moduleId).sort()).toEqual(
          [s.induction.id, s.handbook.id].sort(),
        );
        expect(mine.every((x) => 'moduleId' in x.target)).toBe(true);
      });

      it('never creates a duplicate open assignment when two rules give the same module', async () => {
        const s = await setup();
        await s.seedRule(1);
        await s.seedRule(2, { name: 'Second route to the same module', dueInDays: 30 });
        const added = await s.store.people.add(s.actors.priya, s.newcomer());
        expect(await s.assignmentsOf(added.id)).toHaveLength(1);
      });

      it('skips people who are invited or on leave', async () => {
        const s = await setup();
        await s.seedRule(1);
        const invited = await s.store.people.add(s.actors.priya, s.newcomer({ firstName: 'Ina', status: 'invited' }));
        const leave = await s.store.people.add(s.actors.priya, s.newcomer({ firstName: 'Len', status: 'onLeave' }));
        expect(await s.assignmentsOf(invited.id)).toEqual([]);
        expect(await s.assignmentsOf(leave.id)).toEqual([]);
      });

      it('runs only the rules of the actor client', async () => {
        const s = await setup();
        const ot = await s.seedRule(1, { clientId: s.ot, filters: {}, action: { moduleId: s.induction.id } });
        const added = await s.store.people.add(s.actors.priya, s.newcomer());
        expect(await s.assignmentsOf(added.id)).toEqual([]);
        expect((await s.assignmentsOf(added.id)).some((x) => JSON.stringify(x.source).includes(ot.id))).toBe(false);
      });

      it('refuses people.add outside the actor scope, across clients, for staff, and in a read-only account', async () => {
        const s = await setup();
        await s.seedRule(1);
        const before = await s.admin.dumpAll();
        // Daniel is a Supervisor for one site only.
        expect(
          await refusal(s.store.people.add(s.actors.daniel, s.newcomer({ primarySiteId: s.annexe }))),
        ).toBeInstanceOf(ForbiddenError);
        // Priya cannot add into another client's site.
        expect(
          await refusal(s.store.people.add(s.actors.priya, s.newcomer({ primarySiteId: s.ids.sites.river }))),
        ).toBeInstanceOf(ForbiddenError);
        // Staff cannot add people.
        expect(await reasonOf(s.store.people.add(s.actors.jade, s.newcomer()))).toBe('permission');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });
    });

    // ------------------------------------------------------------ BP-5: roleChanged
    describe('people.update and roleChanged rules (BP-5)', () => {
      it('assigns when a job role change makes the person match, in the same batch', async () => {
        const s = await setup();
        const r = await s.seedRule(1, { trigger: { type: 'roleChanged' } });
        const mia = s.ids.people.mia;
        const before = await s.admin.dumpAll();
        await s.store.people.update(s.actors.priya, mia, { jobRoleIds: [PRACTITIONER] });
        const mine = await s.assignmentsOf(mia);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ source: { ruleId: r.id }, status: 'open' });
        expect(changedStores(before, await s.admin.dumpAll())).toEqual(
          expect.arrayContaining(['people', 'assignments']),
        );
      });

      it('does not fire for edits that leave the job roles alone, or when the new role does not match', async () => {
        const s = await setup();
        await s.seedRule(1, { trigger: { type: 'roleChanged' } });
        const mia = s.ids.people.mia;
        await s.store.people.update(s.actors.priya, mia, { lastName: 'Renamed' });
        await s.store.people.update(s.actors.priya, mia, { jobRoleIds: [KITCHEN] });
        expect(await s.assignmentsOf(mia)).toEqual([]);
      });

      it('does not fire personAdded rules on a role change, nor roleChanged rules on people.add', async () => {
        const s = await setup();
        await s.seedRule(1, { trigger: { type: 'personAdded' } });
        await s.seedRule(2, { trigger: { type: 'roleChanged' }, action: { moduleId: s.handbook.id } });
        const mia = s.ids.people.mia;
        await s.store.people.update(s.actors.priya, mia, { jobRoleIds: [PRACTITIONER] });
        expect((await s.assignmentsOf(mia)).map((x) => (x.target as { moduleId: string }).moduleId)).toEqual([
          s.handbook.id,
        ]);
        const added = await s.store.people.add(s.actors.priya, s.newcomer());
        expect((await s.assignmentsOf(added.id)).map((x) => (x.target as { moduleId: string }).moduleId)).toEqual([
          s.induction.id,
        ]);
      });

      it('never duplicates an open assignment when the role changes again', async () => {
        const s = await setup();
        await s.seedRule(1, { trigger: { type: 'roleChanged' } });
        const mia = s.ids.people.mia;
        await s.store.people.update(s.actors.priya, mia, { jobRoleIds: [PRACTITIONER] });
        await s.store.people.update(s.actors.priya, mia, { jobRoleIds: [KITCHEN] });
        await s.store.people.update(s.actors.priya, mia, { jobRoleIds: [PRACTITIONER] });
        expect(await s.assignmentsOf(mia)).toHaveLength(1);
      });

      it('does not duplicate a module the person already has open from a manual assignment', async () => {
        const s = await setup();
        await s.seedRule(1, { trigger: { type: 'roleChanged' } });
        const mia = s.ids.people.mia;
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, mia, '2026-11-30T12:00:00.000Z')]);
        await s.store.people.update(s.actors.priya, mia, { jobRoleIds: [PRACTITIONER] });
        const mine = await s.assignmentsOf(mia);
        expect(mine).toHaveLength(1);
        expect(mine[0]!.source).toBe('manual');
      });

      it('assigns nothing when the module satisfies a requirement that is already current', async () => {
        const s = await setup();
        await s.seedRule(1, { trigger: { type: 'roleChanged' }, action: { moduleId: s.safeguarding.id } });
        const mia = s.ids.people.mia;
        const current: Evidence = {
          id: freshId(6400),
          clientId: s.a,
          personId: mia,
          requirementId: s.ids.requirementId,
          kind: 'external',
          completedAt: '2026-09-01T09:00:00.000Z',
          expiresAt: '2029-09-01T09:00:00.000Z',
          siteIdAtTime: s.annexe,
        };
        await s.admin.bulkPut('evidence', [current]);
        await s.store.people.update(s.actors.priya, mia, { jobRoleIds: [PRACTITIONER] });
        expect(await s.assignmentsOf(mia)).toEqual([]);
      });

      it('refuses a role change by an actor without staff.manage, and for a person of another client', async () => {
        const s = await setup();
        await s.seedRule(1, { trigger: { type: 'roleChanged' } });
        const before = await s.admin.dumpAll();
        expect(
          await reasonOf(s.store.people.update(s.actors.jade, s.ids.people.mia, { jobRoleIds: [PRACTITIONER] })),
        ).toBe('permission');
        expect(
          await refusal(s.store.people.update(s.actors.priya, s.ids.people.otRiver, { jobRoleIds: [PRACTITIONER] })),
        ).toBeInstanceOf(DataError);
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });
    });

    // ------------------------------------------------------------ BP-5: requirementExpiring and runJobs
    describe('requirementExpiring rules in runJobs (BP-5)', () => {
      const expiring = (s: S, personId: string, n: number, expiresAt: string): Evidence => ({
        id: freshId(6500 + n),
        clientId: s.a,
        personId,
        requirementId: s.ids.requirementId,
        kind: 'external',
        completedAt: '2025-12-15T09:00:00.000Z',
        expiresAt,
        siteIdAtTime: s.annexe,
      });
      const expiringRule = (s: S, over: Partial<AutoAssignRule> = {}) =>
        s.seedRule(1, {
          trigger: { type: 'requirementExpiring', days: 60, requirementId: s.ids.requirementId },
          filters: { siteIds: [s.annexe] },
          action: { moduleId: s.safeguarding.id },
          dueInDays: 0,
          ...over,
        });

      it('assigns people whose evidence expires inside the window, due on the expiry date, and nobody else', async () => {
        const s = await setup();
        const r = await expiringRule(s);
        const mia = s.ids.people.mia;
        const later = (
          await s.store.people.add(s.actors.priya, s.newcomer({ primarySiteId: s.annexe, jobRoleIds: [] }))
        ).id;
        await s.admin.bulkPut('evidence', [
          expiring(s, mia, 1, '2026-12-15T09:00:00.000Z'),
          expiring(s, later, 2, '2027-06-15T09:00:00.000Z'),
        ]);
        await s.admin.runJobs(TODAY);
        const mine = await s.assignmentsOf(mia);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({
          source: { ruleId: r.id },
          target: { moduleId: s.safeguarding.id },
          dueAt: '2026-12-15T09:00:00.000Z',
        });
        expect(await s.assignmentsOf(later)).toEqual([]);
      });

      it('is idempotent: running the jobs twice changes nothing the second time', async () => {
        const s = await setup();
        await expiringRule(s);
        await s.admin.bulkPut('evidence', [expiring(s, s.ids.people.mia, 1, '2026-12-15T09:00:00.000Z')]);
        await s.admin.runJobs(TODAY);
        const first = await s.admin.dumpAll();
        await s.admin.runJobs(TODAY);
        const second = await s.admin.dumpAll();
        expect(changedStores(first, second)).toEqual([]);
        expect(await s.assignmentsOf(s.ids.people.mia)).toHaveLength(1);
      });

      it('picks the person up after a Fast-forward brings the expiry into the window', async () => {
        const s = await setup();
        await expiringRule(s);
        await s.admin.bulkPut('evidence', [expiring(s, s.ids.people.mia, 1, '2027-02-01T09:00:00.000Z')]);
        await s.admin.runJobs(TODAY);
        expect(await s.assignmentsOf(s.ids.people.mia)).toEqual([]);
        await s.admin.runJobs('2026-12-10T09:00:00.000Z');
        expect(await s.assignmentsOf(s.ids.people.mia)).toHaveLength(1);
      });

      it('does not assign from a disabled rule, nor when an open assignment for the module exists', async () => {
        const s = await setup();
        const r = await expiringRule(s, { enabled: false });
        await s.admin.bulkPut('evidence', [expiring(s, s.ids.people.mia, 1, '2026-12-15T09:00:00.000Z')]);
        await s.admin.runJobs(TODAY);
        expect(await s.assignmentsOf(s.ids.people.mia)).toEqual([]);
        await s.admin.bulkPut('autoAssignRules', [{ ...r, enabled: true }]);
        await s.admin.bulkPut('assignments', [
          {
            ...s.dueAssignment(2, s.ids.people.mia, '2026-12-20T09:00:00.000Z'),
            target: { moduleId: s.safeguarding.id },
          },
        ]);
        await s.admin.runJobs(TODAY);
        expect(await s.assignmentsOf(s.ids.people.mia)).toHaveLength(1);
      });

      it('skips people on leave', async () => {
        const s = await setup();
        await expiringRule(s);
        await s.admin.bulkPut('evidence', [expiring(s, s.ids.people.mia, 1, '2026-12-15T09:00:00.000Z')]);
        await s.patchPerson(s.ids.people.mia, { status: 'onLeave' });
        await s.admin.runJobs(TODAY);
        expect(await s.assignmentsOf(s.ids.people.mia)).toEqual([]);
      });
    });

    // ------------------------------------------------------------ BP-5: autoAssign operations
    describe('autoAssign operations (BP-5)', () => {
      it('saves, lists, disables, previews, records history and removes a rule, with audit', async () => {
        const s = await setup();
        const saved = await s.store.autoAssign.save(s.actors.priya, s.rule(1));
        expect(saved).toMatchObject({ clientId: s.a, enabled: true, dueInDays: 14 });
        expect((await s.store.autoAssign.list(s.actors.priya)).map((x) => x.id)).toEqual([saved.id]);

        // Everyone active with the Practitioner role who does not have the module yet.
        const preview = await s.store.autoAssign.preview(s.actors.priya, saved.id);
        const expected = (await s.people()).filter(
          (p) => p.clientId === s.a && p.status === 'active' && p.jobRoleIds.includes(PRACTITIONER),
        );
        expect(preview.count).toBe(expected.length);
        expect(preview.personIds.sort()).toEqual(expected.map((p) => p.id).sort());

        const added = await s.store.people.add(s.actors.priya, s.newcomer());
        const history = await s.store.autoAssign.history(s.actors.priya, saved.id);
        expect(history.map((x) => x.personId)).toEqual([added.id]);

        const off = await s.store.autoAssign.setEnabled(s.actors.priya, saved.id, false);
        expect(off.enabled).toBe(false);
        await s.store.autoAssign.remove(s.actors.priya, saved.id);
        expect(await s.store.autoAssign.list(s.actors.priya)).toEqual([]);
        const audit = (await dump<{ action: string }>(s.admin, 'audit')).map((e) => e.action);
        expect(audit.filter((x) => x.includes('autoAssign')).length).toBeGreaterThanOrEqual(3);
      });

      it('counts the preview down once people hold the module', async () => {
        const s = await setup();
        const saved = await s.store.autoAssign.save(s.actors.priya, s.rule(1));
        const before = (await s.store.autoAssign.preview(s.actors.priya, saved.id)).personIds;
        expect(before.length).toBeGreaterThan(1);
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, before[0]!, '2026-11-30T12:00:00.000Z')]);
        const after = await s.store.autoAssign.preview(s.actors.priya, saved.id);
        expect(after.personIds).not.toContain(before[0]);
        expect(after.count).toBe(before.length - 1);
      });

      it('refuses an identical second rule with duplicateRule', async () => {
        const s = await setup();
        await s.store.autoAssign.save(s.actors.priya, s.rule(1));
        expect(await ruleOf(s.store.autoAssign.save(s.actors.priya, s.rule(2)))).toBe('duplicateRule');
      });

      it('refuses actors without assign.manage, and staff, with permission', async () => {
        const s = await setup();
        const r = await s.seedRule(1);
        const before = await s.admin.dumpAll();
        expect(await reasonOf(s.store.autoAssign.save(s.actors.rory, s.rule(2)))).toBe('permission');
        expect(await reasonOf(s.store.autoAssign.setEnabled(s.actors.rory, r.id, false))).toBe('permission');
        expect(await reasonOf(s.store.autoAssign.remove(s.actors.rory, r.id))).toBe('permission');
        expect(await reasonOf(s.store.autoAssign.list(s.actors.jade))).toBe('permission');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it("never shows or changes another client's rules", async () => {
        const s = await setup();
        const mine = await s.seedRule(1);
        const theirs = await s.seedRule(2, { clientId: s.ot, filters: {}, name: 'Oak Tree rule' });
        expect((await s.store.autoAssign.list(s.actors.priya)).map((x) => x.id)).toEqual([mine.id]);
        expect((await s.store.autoAssign.list(s.actors.gina)).map((x) => x.id)).toEqual([theirs.id]);
        for (const op of [
          () => s.store.autoAssign.setEnabled(s.actors.priya, theirs.id, false),
          () => s.store.autoAssign.remove(s.actors.priya, theirs.id),
          () => s.store.autoAssign.preview(s.actors.priya, theirs.id),
          () => s.store.autoAssign.history(s.actors.priya, theirs.id),
        ]) {
          expect(await refusal(op())).toBeInstanceOf(NotFoundError);
        }
        expect((await dump<AutoAssignRule>(s.admin, 'autoAssignRules')).find((x) => x.id === theirs.id)!.enabled).toBe(
          true,
        );
      });

      it('refuses creating or enabling a rule while the account is read-only', async () => {
        const s = await setup();
        const ro = s.ids.stateClients.readOnly;
        const staffer = ro.staffPerson;
        const ownerCtx = s.actors.readOnlyOwner;
        const input = s.rule(1, { filters: {}, action: { moduleId: s.induction.id } });
        expect(await refusal(s.store.autoAssign.save(ownerCtx, input))).toBeInstanceOf(AccountStateError);
        const seeded: AutoAssignRule = {
          ...input,
          id: freshId(6600),
          clientId: ro.client.id,
          enabled: false,
        };
        await s.admin.bulkPut('autoAssignRules', [seeded]);
        expect(await refusal(s.store.autoAssign.setEnabled(ownerCtx, seeded.id, true))).toBeInstanceOf(
          AccountStateError,
        );
        expect(staffer.clientId).toBe(ro.client.id);
      });
    });

    // ------------------------------------------------------------ BP-6: reminders through runJobs
    describe('reminders (BP-6)', () => {
      const SEVEN = '2026-10-26T12:00:00.000Z';
      const ONE = '2026-10-20T12:00:00.000Z';

      it('sends one Notification and one Outbox message for a reminder due in 7 days, and logs it', async () => {
        const s = await setup();
        const a1 = s.dueAssignment(1, s.jade, SEVEN);
        await s.admin.bulkPut('assignments', [a1]);
        const [notesBefore, mailBefore, logBefore] = [
          (await s.reminderNotes()).length,
          (await s.reminderMail()).length,
          (await s.reminderLog()).length,
        ];
        await s.admin.runJobs(TODAY);
        const log = await s.logFor(s.jade);
        expect(log.map((l) => l.key)).toEqual([`${s.jade}:dueSoon:${a1.id}:7`]);
        expect(log[0]).toMatchObject({ clientId: s.a, personId: s.jade, kind: 'dueSoon' });
        expect(log[0]!.weekKey).toBe(londonWeekKey(TODAY));
        const mine = await s.reminderNotes(s.jadeUser);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ clientId: s.a, kind: 'reminder' });
        // Everywhere: exactly one Notification and one Outbox message per log entry, and nothing else.
        const added = (await s.reminderLog()).length - logBefore;
        expect((await s.reminderNotes()).length - notesBefore).toBe(added);
        expect((await s.reminderMail()).length - mailBefore).toBe(added);
        expect((await s.reminderMail()).every((m) => m.channel === 'push' || m.channel === 'email')).toBe(true);
      });

      it('sends again at 1 day, and an overdue reminder on the first overdue day then not until a week later', async () => {
        const s = await setup();
        const a1 = s.dueAssignment(1, s.jade, ONE);
        await s.admin.bulkPut('assignments', [a1]);
        await s.admin.runJobs(TODAY);
        expect((await s.logFor(s.jade)).map((l) => l.key)).toEqual([`${s.jade}:dueSoon:${a1.id}:1`]);
        await s.admin.runJobs('2026-10-21T09:00:00.000Z'); // overdue by 1 day
        await s.admin.runJobs('2026-10-22T09:00:00.000Z'); // overdue by 2: nothing
        await s.admin.runJobs('2026-10-28T09:00:00.000Z'); // overdue by 8: weekly
        expect((await s.logFor(s.jade)).map((l) => l.key).sort()).toEqual(
          [`${s.jade}:dueSoon:${a1.id}:1`, `${s.jade}:overdue:${a1.id}:1`, `${s.jade}:overdue:${a1.id}:8`].sort(),
        );
      });

      it('sends nothing on days that are not an offset', async () => {
        const s = await setup();
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, '2026-10-23T12:00:00.000Z')]); // 4 days
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(s.jade)).toEqual([]);
        expect(await s.reminderNotes(s.jadeUser)).toEqual([]);
      });

      it('never sends the same reminder twice, however often the jobs run', async () => {
        const s = await setup();
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, SEVEN)]);
        await s.admin.runJobs(TODAY);
        const notes = (await s.reminderNotes()).length;
        const mail = (await s.reminderMail()).length;
        const log = (await s.reminderLog()).length;
        await s.admin.runJobs(TODAY);
        await s.admin.runJobs('2026-10-19T15:00:00.000Z');
        expect((await s.reminderNotes()).length).toBe(notes);
        expect((await s.reminderMail()).length).toBe(mail);
        expect((await s.reminderLog()).length).toBe(log);
      });

      it('writes only notifications, the outbox, the reminder log and audit', async () => {
        const s = await setup();
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, SEVEN)]);
        const before = await s.admin.dumpAll();
        await s.admin.runJobs(TODAY);
        const changed = changedStores(before, await s.admin.dumpAll());
        expect(changed).toEqual(expect.arrayContaining(['notifications', 'outbox', 'reminderLog']));
        expect(changed.filter((x) => !['notifications', 'outbox', 'reminderLog', 'audit'].includes(x))).toEqual([]);
      });

      it('stops at the weekly cap per person per London week and starts again the next week', async () => {
        const s = await setup();
        await s.clearFixtureAssignment();
        await s.admin.bulkPut(
          'assignments',
          [1, 2, 3, 4].map((n) => s.dueAssignment(n, s.jade, SEVEN)),
        );
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(s.jade)).toHaveLength(3);
        expect(await s.reminderNotes(s.jadeUser)).toHaveLength(3);
        // The fourth waits for nothing: the offset day has passed. A new week with a fresh due date sends again.
        await s.admin.bulkPut('assignments', [s.dueAssignment(5, s.jade, '2026-11-02T12:00:00.000Z')]);
        await s.admin.runJobs('2026-10-26T09:00:00.000Z'); // Monday of the next London week, 7 days before
        expect(await s.logFor(s.jade)).toHaveLength(4);
      });

      it('counts the week in London time across the 25 October clock change', async () => {
        const s = await setup();
        await s.clearFixtureAssignment();
        const week = londonWeekKey('2026-10-25T10:00:00.000Z');
        const prior: ReminderLog[] = [1, 2, 3].map((n) => ({
          key: `${s.jade}:overdue:${freshId(6700 + n)}:1`,
          clientId: s.a,
          personId: s.jade,
          kind: 'overdue',
          sentAt: '2026-10-25T10:00:00.000Z',
          weekKey: week,
        }));
        await s.admin.bulkPut('reminderLog', prior);
        // Sunday 25 October is still the old week: capped. Monday 26 October starts a new one.
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, '2026-11-01T12:00:00.000Z')]);
        await s.admin.runJobs('2026-10-25T12:00:00.000Z');
        expect(await s.logFor(s.jade)).toHaveLength(3);
        await s.admin.bulkPut('assignments', [s.dueAssignment(2, s.jade, '2026-11-02T12:00:00.000Z')]);
        await s.admin.runJobs('2026-10-26T09:00:00.000Z');
        expect(await s.logFor(s.jade)).toHaveLength(4);
      });

      it('saves reminder messages with the policy and refuses unknown placeholders, empty or long text', async () => {
        const s = await setup();
        const policy = await s.store.reminders.policy(s.actors.priya);
        const text = 'Hi {firstName}, {training} was due on {date}.';
        await s.store.reminders.savePolicy(s.actors.priya, policy, { overdue: { tone: 'brief', text } });
        const stored = async () =>
          (await dump<Client>(s.admin, 'clients')).find((c) => c.id === s.a)?.settings.reminderTemplates;
        expect(await stored()).toEqual({ overdue: { tone: 'brief', text } });
        for (const bad of ['Hi {surname}', '', 'x'.repeat(301)]) {
          await expect(
            s.store.reminders.savePolicy(s.actors.priya, policy, { overdue: { tone: 'brief', text: bad } }),
          ).rejects.toBeInstanceOf(DataError);
        }
        expect(await stored()).toEqual({ overdue: { tone: 'brief', text } });
      });

      it('honours the cap set in the client policy', async () => {
        const s = await setup();
        const policy = await s.store.reminders.policy(s.actors.priya);
        expect(policy.weeklyCapPerPerson).toBe(3);
        const saved = await s.store.reminders.savePolicy(s.actors.priya, { ...policy, weeklyCapPerPerson: 1 });
        expect(saved.weeklyCapPerPerson).toBe(1);
        await s.admin.bulkPut(
          'assignments',
          [1, 2].map((n) => s.dueAssignment(n, s.jade, SEVEN)),
        );
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(s.jade)).toHaveLength(1);
      });

      it('sends nothing inside the client quiet hours and sends at the next run outside them', async () => {
        const s = await setup();
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, SEVEN)]);
        await s.admin.runJobs('2026-10-19T05:30:00.000Z'); // 06:30 London, before 07:00
        expect(await s.logFor(s.jade)).toEqual([]);
        expect(await s.reminderNotes(s.jadeUser)).toEqual([]);
        await s.admin.runJobs('2026-10-19T08:00:00.000Z'); // 09:00 London
        expect(await s.logFor(s.jade)).toHaveLength(1);
        expect(await s.reminderNotes(s.jadeUser)).toHaveLength(1);
      });

      it('sends nothing late in the evening in London (21:00 onwards)', async () => {
        const s = await setup();
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, SEVEN)]);
        await s.admin.runJobs('2026-10-19T20:30:00.000Z'); // 21:30 London (BST)
        expect(await s.logFor(s.jade)).toEqual([]);
      });

      it("honours the person's own quiet hours saved through me.updatePrefs (F-7)", async () => {
        const s = await setup();
        await s.store.me.updatePrefs(s.actors.jade, { quietHours: { from: '09:00', to: '12:00' } });
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, SEVEN)]);
        await s.admin.runJobs(TODAY); // 10:00 London
        expect(await s.logFor(s.jade)).toEqual([]);
        await s.admin.runJobs('2026-10-19T12:00:00.000Z'); // 13:00 London
        expect(await s.logFor(s.jade)).toHaveLength(1);
      });

      it('clears the person quiet hours when updatePrefs is given null, so reminders go out again', async () => {
        const s = await setup();
        await s.store.me.updatePrefs(s.actors.jade, { quietHours: { from: '09:00', to: '12:00' } });
        await s.store.me.updatePrefs(s.actors.jade, { quietHours: null });
        const person = (await dump<Person>(s.admin, 'people')).find((p) => p.id === s.jade);
        expect(person?.prefs.quietHours).toBeUndefined();
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, SEVEN)]);
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(s.jade)).toHaveLength(1);
      });

      it('sends nothing to people on leave or paused, and sends again once the pause has ended', async () => {
        const s = await setup();
        await s.admin.bulkPut('assignments', [
          s.dueAssignment(1, s.jade, SEVEN),
          s.dueAssignment(2, s.ids.people.ben, SEVEN),
        ]);
        await s.patchPerson(s.jade, { status: 'onLeave' });
        await s.patchPerson(s.ids.people.ben, { pausedUntil: '2026-10-21T00:00:00.000Z' });
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(s.jade)).toEqual([]);
        expect(await s.logFor(s.ids.people.ben)).toEqual([]);
        await s.patchPerson(s.ids.people.ben, { pausedUntil: '2026-10-18T00:00:00.000Z' });
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(s.ids.people.ben)).toHaveLength(1);
      });

      it('sends nothing for training that is done, cancelled, or finished before the run', async () => {
        const s = await setup();
        await s.admin.bulkPut('assignments', [
          s.dueAssignment(1, s.jade, SEVEN, { status: 'done' }),
          s.dueAssignment(2, s.jade, SEVEN, { status: 'cancelled' }),
        ]);
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(s.jade)).toEqual([]);
      });

      describe('expiry reminders', () => {
        // Jade's seeded evidence for the Safeguarding requirement is moved to expire in exactly 30 days.
        const expireIn30 = async (s: S): Promise<void> => {
          const e = (await dump<Evidence>(s.admin, 'evidence')).find((x) => x.id === s.ids.evidence.jade)!;
          await s.admin.bulkPut('evidence', [{ ...e, expiresAt: addDays(new Date(TODAY), 30).toISOString() }]);
        };

        it('sends an expiring reminder at 30 days', async () => {
          const s = await setup();
          await expireIn30(s);
          await s.admin.runJobs(TODAY);
          const e = (await dump<Evidence>(s.admin, 'evidence')).find((x) => x.id === s.ids.evidence.jade)!;
          expect((await s.logFor(s.jade)).map((l) => l.key)).toEqual([`${s.jade}:expiring:${e.requirementId}:30`]);
        });

        it('sends nothing while the replacement is awaiting a check, then reminds once it is rejected', async () => {
          const s = await setup();
          await expireIn30(s);
          const e = (await dump<Evidence>(s.admin, 'evidence')).find((x) => x.id === s.ids.evidence.jade)!;
          const sub: EvidenceSubmission = {
            id: freshId(6800),
            clientId: s.a,
            siteId: s.main,
            personId: s.jade,
            requirementId: e.requirementId,
            uploadedBy: s.jadeUser,
            fileAttachmentId: freshId(6801),
            providerName: 'Test Training Ltd',
            completedAt: '2026-10-15T09:00:00.000Z',
            expiresAt: '2028-10-15T09:00:00.000Z',
            status: 'awaitingCheck',
            createdAt: '2026-10-16T09:00:00.000Z',
          };
          await s.admin.bulkPut('evidenceSubmissions', [sub]);
          await s.admin.runJobs(TODAY);
          expect(await s.logFor(s.jade)).toEqual([]);
          await s.admin.bulkPut('evidenceSubmissions', [{ ...sub, status: 'rejected' }]);
          await s.admin.runJobs(TODAY);
          expect(await s.logFor(s.jade)).toHaveLength(1);
        });
      });

      it('limits a Limited account to in-app notices: a Notification but no Outbox message', async () => {
        const s = await setup();
        const st = s.ids.stateClients.closed;
        // Account state is derived from the subscription (plan assumption 45), so the subscription moves too.
        const sub = (await dump<Subscription>(s.admin, 'subscriptions')).find((x) => x.clientId === st.client.id)!;
        await s.admin.bulkPut('subscriptions', [{ ...sub, state: 'limited', stateSince: '2026-10-14T09:00:00.000Z' }]);
        await s.admin.bulkPut('clients', [{ ...st.client, accountState: 'limited' }]);
        const a1: Assignment = {
          ...s.dueAssignment(1, st.staffPerson.id, SEVEN),
          clientId: st.client.id,
        };
        await s.admin.bulkPut('assignments', [a1]);
        const mailBefore = (await s.reminderMail()).length;
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(st.staffPerson.id)).toHaveLength(1);
        expect(await s.reminderNotes(st.staff.id)).toHaveLength(1);
        expect((await s.reminderMail()).length).toBe(mailBefore);
      });

      it('sends no reminders at all to Read-only or Closed accounts', async () => {
        const s = await setup();
        const ro = s.ids.stateClients.readOnly;
        const closed = s.ids.stateClients.closed;
        await s.admin.bulkPut('assignments', [
          { ...s.dueAssignment(1, ro.staffPerson.id, SEVEN), clientId: ro.client.id },
          { ...s.dueAssignment(2, closed.staffPerson.id, SEVEN), clientId: closed.client.id },
        ]);
        await s.admin.runJobs(TODAY);
        expect(await s.logFor(ro.staffPerson.id)).toEqual([]);
        expect(await s.logFor(closed.staffPerson.id)).toEqual([]);
        expect(await s.reminderNotes(ro.staff.id)).toEqual([]);
        expect(await s.reminderNotes(closed.staff.id)).toEqual([]);
      });

      it("sends each reminder only inside the person's own client", async () => {
        const s = await setup();
        await s.admin.bulkPut('assignments', [s.dueAssignment(1, s.jade, SEVEN)]);
        await s.admin.runJobs(TODAY);
        const notes = await s.reminderNotes(s.jadeUser);
        expect(notes.every((n) => n.clientId === s.a)).toBe(true);
        const log = await s.reminderLog();
        const peopleById = new Map((await s.people()).map((p) => [p.id, p]));
        expect(log.every((l) => peopleById.get(l.personId)?.clientId === l.clientId)).toBe(true);
      });

      it('lets reminders.manage read and change the policy, and refuses everyone else', async () => {
        const s = await setup();
        const policy = await s.store.reminders.policy(s.actors.priya);
        expect(await reasonOf(s.store.reminders.policy(s.actors.jade))).toBe('permission');
        expect(await reasonOf(s.store.reminders.savePolicy(s.actors.rory, policy))).toBe('permission');
        expect(await reasonOf(s.store.reminders.savePolicy(s.actors.jade, policy))).toBe('permission');
        expect(
          await refusal(s.store.reminders.savePolicy(s.actors.priya, { ...policy, weeklyCapPerPerson: -1 })),
        ).toBeInstanceOf(DataError);
        // The Oak Tree policy is its own.
        await s.store.reminders.savePolicy(s.actors.priya, { ...policy, weeklyCapPerPerson: 2 });
        expect((await s.store.reminders.policy(s.actors.gina)).weeklyCapPerPerson).toBe(3);
      });

      it('previews a chase of overdue people with the reasons for skipping, and writes nothing', async () => {
        const s = await setup();
        const overdue = '2026-10-10T12:00:00.000Z';
        await s.admin.bulkPut('assignments', [
          s.dueAssignment(1, s.jade, overdue),
          s.dueAssignment(2, s.ids.people.ben, overdue),
        ]);
        await s.patchPerson(s.ids.people.ben, { status: 'onLeave' });
        const before = await s.admin.dumpAll();
        const preview = await s.store.reminders.chaseOverdue(s.actors.priya, { preview: true });
        expect(preview.willSend.map((x) => x.personId)).toContain(s.jade);
        expect(preview.skipped).toContainEqual({ personId: s.ids.people.ben, reason: 'onLeave' });
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
        expect(await reasonOf(s.store.reminders.chaseOverdue(s.actors.rory, { preview: true }))).toBe('permission');
      });
    });

    // ------------------------------------------------------------ F-7: notification snooze
    describe('notification snooze (F-7)', () => {
      it('hides a snoozed notification until 08:00 London tomorrow and keeps it unread', async () => {
        const s = await setup();
        const id = s.lf.notifications.jade;
        const snoozed = await s.store.notifications.snooze(s.actors.jade, id);
        expect(snoozed.snoozedUntil).toBe('2026-10-20T07:00:00.000Z'); // 08:00 BST on Tuesday
        expect(snoozed.readAt).toBeUndefined();
        expect((await s.store.notifications.list(s.actors.jade)).map((n) => n.id)).not.toContain(id);
        const later = at(s.actors.jade, '2026-10-20T07:00:00.000Z');
        expect((await s.store.notifications.list(later)).map((n) => n.id)).toContain(id);
      });

      it('uses 08:00 London time when the clocks change that night', async () => {
        const s = await setup();
        const ctx = at(s.actors.jade, '2026-10-24T12:00:00.000Z'); // Saturday; clocks go back early Sunday
        const snoozed = await s.store.notifications.snooze(ctx, s.lf.notifications.jade);
        expect(snoozed.snoozedUntil).toBe('2026-10-25T08:00:00.000Z'); // 08:00 GMT
      });

      it('moves a snooze made late at night to the next London morning, not the same one', async () => {
        const s = await setup();
        const ctx = at(s.actors.jade, '2026-10-19T22:30:00.000Z'); // 23:30 BST Monday
        const snoozed = await s.store.notifications.snooze(ctx, s.lf.notifications.jade);
        expect(snoozed.snoozedUntil).toBe('2026-10-20T07:00:00.000Z');
      });

      it("refuses to snooze someone else's notification, in the same or another client", async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(await refusal(s.store.notifications.snooze(s.actors.jade, s.lf.notifications.hannah))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await refusal(s.store.notifications.snooze(s.actors.gina, s.lf.notifications.jade))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await refusal(s.store.notifications.snooze(s.actors.jade, freshId(9999)))).toBeInstanceOf(NotFoundError);
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });
    });
  });
}

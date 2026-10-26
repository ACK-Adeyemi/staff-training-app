// The shared contract suite (plan chunk 7; build pack 4.3). Every DataStore adapter must pass it.
// Run it with `runContractSuite(name, makeStore)`; makeStore returns a fresh, empty store each call.
import { describe, expect, it } from 'vitest';
import {
  addDays,
  createRng,
  fixedClock,
  requirementStatus,
  ulid,
  type Evidence,
  type EvidenceSubmission,
  type OutboxMessage,
  type Person,
  type Role,
  type RoleAssignment,
} from '@sta/domain';
import {
  AccountStateError,
  ForbiddenError,
  NotEntitledError,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type DataStore,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { buildWorld, freshId, TODAY, type World as Fixture } from './world';

const ALL_STORES: StoreName[] = [
  'clients',
  'sites',
  'teams',
  'people',
  'users',
  'jobRoles',
  'requirements',
  'evidence',
  'evidenceSubmissions',
  'roles',
  'roleAssignments',
  'packages',
  'addOns',
  'subscriptions',
  'addOnSubscriptions',
  'paymentAttempts',
  'audit',
  'outbox',
  'settings',
  'modules',
  'attachments',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
  'clientLinkOverlays',
  'notes',
  'categories',
  'modulePlacements',
  'moduleGroups',
  'competitions',
  'standingBoardSettings',
];

type Setup = { store: DataStore; admin: StoreHandle['admin']; fx: Fixture; options: StoreOptions };

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to be refused, but it succeeded');
}

async function forbiddenReason(promise: Promise<unknown>): Promise<string> {
  const error = await refusal(promise);
  expect(error).toBeInstanceOf(ForbiddenError);
  return (error as ForbiddenError).reason;
}

const idsOf = (rows: { id: string }[]): string[] => rows.map((r) => r.id);

export function runContractSuite(name: string, makeStore: (options: StoreOptions) => Promise<StoreHandle>): void {
  async function setup(clockIso: string = TODAY): Promise<Setup> {
    const options: StoreOptions = { clock: fixedClock(clockIso), rng: createRng(7) };
    const { store, admin } = await makeStore(options);
    const fx = await buildWorld(admin);
    return { store, admin, fx, options };
  }

  const client = (userId: string, clientId: string, now = TODAY): ActorContext => ({
    userId,
    side: 'client',
    clientId,
    now,
  });
  const staff = (userId: string, clientId: string, now = TODAY): ActorContext => ({
    userId,
    side: 'staff',
    clientId,
    now,
  });
  const provider = (userId: string, now = TODAY): ActorContext => ({ userId, side: 'provider', now });

  describe(`DataStore contract: ${name}`, () => {
    describe('tenant isolation by clientId', () => {
      it.each([
        'clients',
        'sites',
        'teams',
        'people',
        'users',
        'evidence',
        'evidenceSubmissions',
        'roles',
        'roleAssignments',
        'subscriptions',
        'paymentAttempts',
      ] as const)('a client user lists only their own client records in %s', async (storeName) => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const listed = (await (store[storeName] as { list(c: ActorContext): Promise<{ id: string }[]> }).list(ctx)) as {
          id?: string;
          clientId?: string;
        }[];
        expect(listed.length).toBeGreaterThan(0);
        // Subscriptions and add-on subscriptions are keyed by clientId rather than id.
        const foreign = (fx.data[storeName] as Record<string, unknown>[]).filter(
          (r) => fx.tenantOf(storeName, r) !== fx.ids.clients.a,
        );
        const foreignKeys = new Set(foreign.map((r) => (r['id'] ?? r['clientId']) as string));
        for (const row of listed) {
          expect(foreignKeys.has((row.id ?? row.clientId) as string)).toBe(false);
        }
        expect(foreign.length).toBeGreaterThan(0);
      });

      it('lists all of the client own people and none from another client', async () => {
        const { store, fx } = await setup();
        const listed = await store.people.list(client(fx.ids.users.priya, fx.ids.clients.a));
        const expected = fx.data.people.filter((p) => p.clientId === fx.ids.clients.a).map((p) => p.id);
        expect(idsOf(listed)).toEqual([...expected].sort());
      });

      it('sorts list results by id', async () => {
        const { store, fx } = await setup();
        const listed = idsOf(await store.people.list(client(fx.ids.users.priya, fx.ids.clients.a)));
        expect(listed).toEqual([...listed].sort());
      });

      it('gives NotFound, not Forbidden, when getting another client record', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const foreignSite = fx.ids.sites.willow;
        for (const call of [
          () => store.people.get(ctx, fx.ids.people.beth),
          () => store.sites.get(ctx, foreignSite),
          () => store.evidence.get(ctx, fx.ids.evidence.bob),
          () => store.evidenceSubmissions.get(ctx, fx.ids.submissions.bob),
          () => store.subscriptions.get(ctx, fx.ids.clients.b),
          () => store.roleAssignments.get(ctx, fx.ids.assignments.bBeth),
          () => store.roles.get(ctx, fx.ids.roles.bOwner),
          () => store.clients.get(ctx, fx.ids.clients.b),
          () => store.users.get(ctx, fx.ids.users.beth),
        ]) {
          expect(await refusal(call())).toBeInstanceOf(NotFoundError);
        }
      });

      it('refuses a put with another clientId as Forbidden tenant', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const template = fx.data.people.find((p) => p.id === fx.ids.people.jade)!;
        const foreign: Person = {
          ...template,
          id: freshId(1),
          clientId: fx.ids.clients.b,
          primarySiteId: fx.ids.sites.willow,
        };
        expect(await forbiddenReason(store.people.put(ctx, foreign))).toBe('tenant');
        expect((await store.people.list(client(fx.ids.users.beth, fx.ids.clients.b))).map((p) => p.id)).not.toContain(
          foreign.id,
        );
      });

      it('refuses changing an existing record to another clientId', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const jade = await store.people.get(ctx, fx.ids.people.jade);
        expect(await forbiddenReason(store.people.put(ctx, { ...jade, clientId: fx.ids.clients.b }))).toBe('tenant');
        expect((await store.people.get(ctx, fx.ids.people.jade)).clientId).toBe(fx.ids.clients.a);
      });

      it('refuses a role assignment for a user of another client', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const assignment: RoleAssignment = {
          id: freshId(2),
          userId: fx.ids.users.beth,
          roleIds: [fx.ids.roles.aOwner],
          scope: { type: 'clients', ids: [fx.ids.clients.a] },
          grants: [],
          denies: [],
          status: 'active',
        };
        expect(await forbiddenReason(store.roleAssignments.put(ctx, assignment))).toBe('tenant');
      });

      it('gives NotFound when removing another client record, and leaves it in place', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        expect(await refusal(store.people.remove(ctx, fx.ids.people.beth))).toBeInstanceOf(NotFoundError);
        const stillThere = await store.people.get(client(fx.ids.users.beth, fx.ids.clients.b), fx.ids.people.beth);
        expect(stillThere.id).toBe(fx.ids.people.beth);
      });

      it('works the same way from the other client', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.beth, fx.ids.clients.b);
        const listed = await store.people.list(ctx);
        expect(idsOf(listed).sort()).toEqual(
          fx.data.people
            .filter((p) => p.clientId === fx.ids.clients.b)
            .map((p) => p.id)
            .sort(),
        );
        expect(await refusal(store.people.get(ctx, fx.ids.people.priya))).toBeInstanceOf(NotFoundError);
      });

      it('removes a record of the own client', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        await store.people.remove(ctx, fx.ids.people.hannah);
        expect(await refusal(store.people.get(ctx, fx.ids.people.hannah))).toBeInstanceOf(NotFoundError);
      });
    });

    describe('site scope', () => {
      // Oak Tree: Riverside, Hillside and Meadow, a bank practitioner on Riverside and Meadow, a Group Admin.
      const peopleAt = (fx: Fixture, siteId: string) =>
        fx.data.people
          .filter(
            (p: Person) =>
              p.clientId === fx.ids.clients.ot && (p.primarySiteId === siteId || p.additionalSiteIds.includes(siteId)),
          )
          .map((p: Person) => p.id)
          .sort();

      it('shows a Riverside manager only Riverside people, including the bank practitioner', async () => {
        const { store, fx } = await setup();
        const listed = await store.people.list(client(fx.ids.users.riverMgr, fx.ids.clients.ot));
        expect(idsOf(listed)).toEqual(peopleAt(fx, fx.ids.sites.river));
        expect(idsOf(listed)).toContain(fx.ids.people.bank);
        expect(idsOf(listed)).not.toContain(fx.ids.people.otHillside);
      });

      it('shows a Meadow manager only Meadow people, including the bank practitioner', async () => {
        const { store, fx } = await setup();
        const listed = await store.people.list(client(fx.ids.users.meadowMgr, fx.ids.clients.ot));
        expect(idsOf(listed)).toEqual(peopleAt(fx, fx.ids.sites.meadow));
        expect(idsOf(listed)).toContain(fx.ids.people.bank);
        expect(idsOf(listed)).not.toContain(fx.ids.people.otRiver);
      });

      it('gives NotFound when a manager gets a person at another site', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.riverMgr, fx.ids.clients.ot);
        expect(await refusal(store.people.get(ctx, fx.ids.people.otHillside))).toBeInstanceOf(NotFoundError);
      });

      it('lists only the sites a manager covers', async () => {
        const { store, fx } = await setup();
        const listed = await store.sites.list(client(fx.ids.users.riverMgr, fx.ids.clients.ot));
        expect(idsOf(listed)).toEqual([fx.ids.sites.river]);
      });

      it('lets a manager update a single-site person but not the person on two sites', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.riverMgr, fx.ids.clients.ot);
        const colleague = await store.people.get(ctx, fx.ids.people.otRiver);
        const updated = await store.people.put(ctx, { ...colleague, qualificationLevel: 'Level 3' });
        expect(updated.qualificationLevel).toBe('Level 3');
        const bank = await store.people.get(ctx, fx.ids.people.bank);
        expect(await forbiddenReason(store.people.put(ctx, { ...bank, qualificationLevel: 'Level 3' }))).toBe(
          'permission',
        );
      });

      it('lets the Group Admin update the person on two sites', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.gina, fx.ids.clients.ot);
        const bank = await store.people.get(ctx, fx.ids.people.bank);
        const updated = await store.people.put(ctx, { ...bank, qualificationLevel: 'Level 3' });
        expect(updated.qualificationLevel).toBe('Level 3');
      });
    });

    describe('staff actors', () => {
      it('shows a staff user only their own person', async () => {
        const { store, fx } = await setup();
        const listed = await store.people.list(staff(fx.ids.users.jade, fx.ids.clients.a));
        expect(idsOf(listed)).toEqual([fx.ids.people.jade]);
      });

      it('shows a staff user their own evidence and not a colleague evidence', async () => {
        const { store, fx } = await setup();
        const ctx = staff(fx.ids.users.jade, fx.ids.clients.a);
        const mine = fx.data.evidence
          .filter((e: Evidence) => e.personId === fx.ids.people.jade)
          .map((e: Evidence) => e.id);
        expect(mine.length).toBeGreaterThan(0);
        expect(idsOf(await store.evidence.list(ctx))).toEqual([...mine].sort());
        expect((await store.evidence.get(ctx, fx.ids.evidence.jade)).personId).toBe(fx.ids.people.jade);
        expect(await refusal(store.evidence.get(ctx, fx.ids.evidence.hannah))).toBeInstanceOf(NotFoundError);
      });

      it('shows a staff user only their own submissions and user account', async () => {
        const { store, fx } = await setup();
        const ctx = staff(fx.ids.users.ben, fx.ids.clients.a);
        expect(idsOf(await store.evidenceSubmissions.list(ctx))).toEqual([fx.ids.submissions.ben]);
        expect(idsOf(await store.users.list(ctx))).toEqual([fx.ids.users.ben]);
        expect(await refusal(store.users.get(ctx, fx.ids.users.priya))).toBeInstanceOf(NotFoundError);
      });

      it('lets a staff user read their client record and sites but not billing or audit', async () => {
        const { store, fx } = await setup();
        const ctx = staff(fx.ids.users.jade, fx.ids.clients.a);
        expect(idsOf(await store.clients.list(ctx))).toEqual([fx.ids.clients.a]);
        expect(idsOf(await store.sites.list(ctx))).toEqual([fx.ids.sites.main, fx.ids.sites.annexe].sort());
        expect(await forbiddenReason(store.subscriptions.list(ctx))).toBe('permission');
        expect(await forbiddenReason(store.audit.list(ctx))).toBe('permission');
      });

      it('refuses a staff user writing people', async () => {
        const { store, fx } = await setup();
        const ctx = staff(fx.ids.users.jade, fx.ids.clients.a);
        const jade = await store.people.get(ctx, fx.ids.people.jade);
        expect(await forbiddenReason(store.people.put(ctx, { ...jade, nickname: 'J' }))).toBe('permission');
      });

      it('refuses a staff user approving their own certificate', async () => {
        const { store, fx } = await setup();
        const ctx = staff(fx.ids.users.ben, fx.ids.clients.a);
        const own = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.ben);
        expect(await forbiddenReason(store.evidenceSubmissions.put(ctx, { ...own, status: 'approved' }))).toBe(
          'permission',
        );
      });

      it.todo(
        'learner notes are readable only by the learner (the notes store arrives in M2; add it to the policy as owner-only)',
      );
    });

    describe('provider actors', () => {
      it('lets the Owner list every client', async () => {
        const { store, fx } = await setup();
        const listed = await store.clients.list(provider(fx.ids.users.provOwner));
        expect(idsOf(listed)).toEqual(fx.data.clients.map((c: { id: string }) => c.id).sort());
        expect(listed).toHaveLength(14); // the 13 seeded clients plus the Deleted client this suite adds
      });

      it('lets the Owner read people across clients', async () => {
        const { store, fx } = await setup();
        const ctx = provider(fx.ids.users.provOwner);
        const listed = idsOf(await store.people.list(ctx));
        expect(listed).toContain(fx.ids.people.priya);
        expect(listed).toContain(fx.ids.people.beth);
        expect((await store.people.get(ctx, fx.ids.people.beth)).id).toBe(fx.ids.people.beth);
      });

      it('lets the Owner edit a client record', async () => {
        const { store, fx } = await setup();
        const ctx = provider(fx.ids.users.provOwner);
        const c = await store.clients.get(ctx, fx.ids.clients.a);
        const updated = await store.clients.put(ctx, { ...c, displayName: 'Renamed nursery' });
        expect(updated.displayName).toBe('Renamed nursery');
      });

      it('lets Support read clients but not people', async () => {
        const { store, fx } = await setup();
        const ctx = provider(fx.ids.users.support);
        expect((await store.clients.list(ctx)).length).toBe(14);
        expect(await forbiddenReason(store.people.list(ctx))).toBe('permission');
        expect(await refusal(store.people.get(ctx, fx.ids.people.priya))).toBeInstanceOf(NotFoundError);
      });

      it.each(['provOwner', 'support', 'tom'] as const)(
        'never lets the provider user %s read evidence',
        async (who) => {
          const { store, fx } = await setup();
          const ctx = provider(fx.ids.users[who]);
          expect(await forbiddenReason(store.evidence.list(ctx))).toBe('permission');
          expect(await forbiddenReason(store.evidenceSubmissions.list(ctx))).toBe('permission');
          expect(await refusal(store.evidence.get(ctx, fx.ids.evidence.jade))).toBeInstanceOf(NotFoundError);
          expect(await refusal(store.evidenceSubmissions.get(ctx, fx.ids.submissions.ben))).toBeInstanceOf(
            NotFoundError,
          );
        },
      );

      it('refuses the Read-only provider user a client write', async () => {
        const { store, fx } = await setup();
        const ctx = provider(fx.ids.users.tom);
        const c = await store.clients.get(ctx, fx.ids.clients.a);
        expect(await forbiddenReason(store.clients.put(ctx, { ...c, displayName: 'Nope' }))).toBe('permission');
      });

      it('keeps packages, add-ons and subscriptions writable by the provider only', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const sub = await store.subscriptions.get(ctx, fx.ids.clients.a);
        expect(await forbiddenReason(store.subscriptions.put(ctx, { ...sub, period: 'annual' }))).toBe('permission');
        const pkg = (await store.packages.list(provider(fx.ids.users.provOwner)))[0]!;
        expect(await forbiddenReason(store.packages.put(ctx, { ...pkg, name: 'Mine now' }))).toBe('permission');
      });
    });

    describe('permission policy through can()', () => {
      it('refuses a call when the actor holds no permission for the store', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        expect(await forbiddenReason(store.subscriptions.list(ctx))).toBe('permission');
        expect(await forbiddenReason(store.paymentAttempts.list(ctx))).toBe('permission');
        expect(await forbiddenReason(store.audit.list(ctx))).toBe('permission');
      });

      it('lets an admin with billing.view list subscriptions', async () => {
        const { store, fx } = await setup();
        const listed = await store.subscriptions.list(client(fx.ids.users.priya, fx.ids.clients.a));
        expect(listed.map((s) => s.clientId)).toEqual([fx.ids.clients.a]);
      });

      it('lets the global pack requirements be read by every kind of actor', async () => {
        const { store, fx } = await setup();
        for (const ctx of [
          client(fx.ids.users.daniel, fx.ids.clients.a),
          staff(fx.ids.users.jade, fx.ids.clients.a),
          client(fx.ids.users.beth, fx.ids.clients.b),
        ]) {
          expect((await store.requirements.get(ctx, fx.ids.requirementId)).id).toBe(fx.ids.requirementId);
        }
      });

      it('refuses a person write from a Supervisor who can only view staff', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        const hannah = await store.people.get(ctx, fx.ids.people.hannah);
        expect(await forbiddenReason(store.people.put(ctx, { ...hannah, nickname: 'H' }))).toBe('permission');
      });

      it('stops working for an actor once their assignment has expired on the injected clock', async () => {
        const { store, fx } = await setup();
        const before = await store.people.list(client(fx.ids.users.tim, fx.ids.clients.a, TODAY));
        expect(before.length).toBeGreaterThan(0);
        const later = addDays(new Date(TODAY), 2).toISOString();
        expect(await forbiddenReason(store.people.list(client(fx.ids.users.tim, fx.ids.clients.a, later)))).toBe(
          'permission',
        );
      });
    });

    describe('unknown actors', () => {
      const attempts = (store: DataStore, ctx: ActorContext) => [
        () => store.people.list(ctx),
        () => store.clients.list(ctx),
        () => store.sites.get(ctx, id0),
        () => store.evidence.list(ctx),
        () => store.audit.list(ctx),
      ];
      const id0 = freshId(50);

      it('refuses every call from a user id that does not exist', async () => {
        const { store, fx } = await setup();
        const ctx = client(freshId(99), fx.ids.clients.a);
        for (const call of attempts(store, ctx)) expect(await forbiddenReason(call())).toBe('unknownActor');
      });

      it('refuses a known user acting on the wrong side', async () => {
        const { store, fx } = await setup();
        const ctx: ActorContext = { userId: fx.ids.users.priya, side: 'staff', clientId: fx.ids.clients.a, now: TODAY };
        for (const call of attempts(store, ctx)) expect(await forbiddenReason(call())).toBe('unknownActor');
      });

      it('refuses a known user claiming another clientId', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.b);
        for (const call of attempts(store, ctx)) expect(await forbiddenReason(call())).toBe('unknownActor');
      });

      it('refuses a suspended user', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.sue, fx.ids.clients.a);
        for (const call of attempts(store, ctx)) expect(await forbiddenReason(call())).toBe('unknownActor');
      });

      it('refuses a client user claiming to be a provider', async () => {
        const { store, fx } = await setup();
        expect(await forbiddenReason(store.clients.list(provider(fx.ids.users.priya)))).toBe('unknownActor');
      });
    });

    describe('roles and assignments', () => {
      it('refuses a user changing their own assignment', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const own = await store.roleAssignments.get(ctx, fx.ids.assignments.priya);
        expect(await forbiddenReason(store.roleAssignments.put(ctx, { ...own, denies: ['reports.export'] }))).toBe(
          'selfEdit',
        );
        expect(await forbiddenReason(store.roleAssignments.remove(ctx, fx.ids.assignments.priya))).toBe('selfEdit');
      });

      it('refuses a Supervisor granting a role because they lack team.manageRoles', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        const grant: RoleAssignment = {
          id: freshId(3),
          userId: fx.ids.users.jade,
          roleIds: [fx.ids.roles.billingViewer],
          scope: { type: 'clients', ids: [fx.ids.clients.a] },
          grants: [],
          denies: [],
          status: 'active',
        };
        expect(await forbiddenReason(store.roleAssignments.put(ctx, grant))).toBe('permission');
      });

      it('refuses granting a permission the granter does not hold, even with team.manageRoles', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.rory, fx.ids.clients.a);
        const grant: RoleAssignment = {
          id: freshId(4),
          userId: fx.ids.users.jade,
          roleIds: [fx.ids.roles.billingViewer],
          scope: { type: 'clients', ids: [fx.ids.clients.a] },
          grants: [],
          denies: [],
          status: 'active',
        };
        expect(await forbiddenReason(store.roleAssignments.put(ctx, grant))).toBe('escalation');
        expect(
          await forbiddenReason(store.roleAssignments.put(ctx, { ...grant, roleIds: [], grants: ['billing.view'] })),
        ).toBe('escalation');
      });

      it('refuses removing the last Account Owner assignment', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.rory, fx.ids.clients.a);
        expect(await forbiddenReason(store.roleAssignments.remove(ctx, fx.ids.assignments.priya))).toBe('lastOwner');
        const still = await store.roleAssignments.get(
          client(fx.ids.users.priya, fx.ids.clients.a),
          fx.ids.assignments.priya,
        );
        expect(still.status).toBe('active');
      });

      it('refuses suspending the last Account Owner', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.rory, fx.ids.clients.a);
        const owner = await store.roleAssignments.get(
          client(fx.ids.users.priya, fx.ids.clients.a),
          fx.ids.assignments.priya,
        );
        expect(await forbiddenReason(store.roleAssignments.put(ctx, { ...owner, status: 'suspended' }))).toBe(
          'lastOwner',
        );
      });

      it('appends one audit event with before and after for a successful assignment change', async () => {
        const { store, admin, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const dan = await store.roleAssignments.get(ctx, fx.ids.assignments.daniel);
        const changed = { ...dan, grants: ['reports.export'] };
        await store.roleAssignments.put(ctx, changed);
        const events = (await store.audit.list(ctx, { action: 'roleAssignment.updated' })) as {
          actorId: string;
          actorSide: string;
          clientId?: string;
          target: string;
          before: RoleAssignment;
          after: RoleAssignment;
          at: string;
        }[];
        expect(events).toHaveLength(1);
        const event = events[0]!;
        expect(event.actorId).toBe(fx.ids.users.priya);
        expect(event.actorSide).toBe('client');
        expect(event.clientId).toBe(fx.ids.clients.a);
        expect(event.target).toBe(`roleAssignment:${dan.id}`);
        expect(event.before.grants).toEqual([]);
        expect(event.after.grants).toEqual(['reports.export']);
        expect(event.at).toBe(TODAY);
        const dump = (await admin.dumpAll()) as Record<string, unknown[]>;
        expect(dump['audit']).toHaveLength(1);
      });

      it('appends a created event when a new assignment is added', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        await store.roleAssignments.put(ctx, {
          id: freshId(5),
          userId: fx.ids.users.jade,
          roleIds: [fx.ids.roles.supervisor],
          scope: { type: 'sites', ids: [fx.ids.sites.main] },
          grants: [],
          denies: [],
          status: 'active',
        });
        const events = (await store.audit.list(ctx, { action: 'roleAssignment.created' })) as { before?: unknown }[];
        expect(events).toHaveLength(1);
        expect(events[0]!.before).toBeUndefined();
      });

      it('writes no audit event for a refused change', async () => {
        const { store, admin, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const own = await store.roleAssignments.get(ctx, fx.ids.assignments.priya);
        await refusal(store.roleAssignments.put(ctx, { ...own, denies: ['reports.export'] }));
        expect(((await admin.dumpAll()) as Record<string, unknown[]>)['audit']).toHaveLength(0);
      });

      it('lets an Account Owner create a role and records it in the audit log', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const role: Role = {
          id: freshId(6),
          owner: { clientId: fx.ids.clients.a },
          name: 'Reception',
          description: 'Front desk',
          colour: '#112233',
          permissionIds: ['staff.view'],
          system: false,
          version: 1,
          updatedBy: fx.ids.users.priya,
          updatedAt: TODAY,
        };
        await store.roles.put(ctx, role);
        expect((await store.roles.get(ctx, role.id)).name).toBe('Reception');
        expect(await store.audit.list(ctx, { action: 'role.created' })).toHaveLength(1);
      });
    });

    describe('evidence approval', () => {
      it('lets a Supervisor approve a submission at their site and records who, when and why in the audit log', async () => {
        const { store, admin, fx } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        const pending = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.ben);
        const approved = await store.evidenceSubmissions.put(ctx, {
          ...pending,
          status: 'approved',
          reviewerId: fx.ids.users.daniel,
          reviewedAt: TODAY,
        });
        expect(approved.status).toBe('approved');
        expect(approved.evidenceId).toBeDefined();

        const created = (await store.evidence.list(ctx, { personId: fx.ids.people.ben })).find(
          (e) => e.submissionId === pending.id,
        );
        expect(created).toBeDefined();
        expect(created).toMatchObject({
          id: approved.evidenceId,
          clientId: fx.ids.clients.a,
          personId: fx.ids.people.ben,
          requirementId: fx.ids.requirementId,
          kind: 'external',
          submissionId: pending.id,
          approvedBy: fx.ids.users.daniel,
          approvedAt: TODAY,
          siteIdAtTime: fx.ids.sites.main,
          completedAt: pending.completedAt,
          expiresAt: pending.expiresAt,
        });

        const dump = (await admin.dumpAll()) as Record<
          string,
          { action?: string; actorId?: string; target?: string; at?: string }[]
        >;
        const events = dump['audit']!.filter((e) => e.action === 'evidence.approved');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          actorId: fx.ids.users.daniel,
          target: `evidenceSubmission:${pending.id}`,
          at: TODAY,
        });
      });

      it('makes the requirement status current once approved', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        const requirement = await store.requirements.get(ctx, fx.ids.requirementId);
        const statusNow = async () =>
          requirementStatus(
            requirement,
            await store.evidence.list(ctx, { personId: fx.ids.people.ben, requirementId: fx.ids.requirementId }),
            await store.evidenceSubmissions.list(ctx, {
              personId: fx.ids.people.ben,
              requirementId: fx.ids.requirementId,
            }),
            new Date(TODAY),
            60,
          ).status;
        expect(await statusNow()).toBe('awaitingCheck');
        const pending = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.ben);
        await store.evidenceSubmissions.put(ctx, {
          ...pending,
          status: 'approved',
          reviewerId: fx.ids.users.daniel,
          reviewedAt: TODAY,
        });
        expect(await statusNow()).toBe('current');
      });

      it('refuses approving a submission the approver uploaded', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        const own = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.byDaniel);
        expect(await forbiddenReason(store.evidenceSubmissions.put(ctx, { ...own, status: 'approved' }))).toBe(
          'ownUpload',
        );
      });

      it('refuses approving evidence about the approver', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        const about = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.aboutDaniel);
        expect(await forbiddenReason(store.evidenceSubmissions.put(ctx, { ...about, status: 'approved' }))).toBe(
          'aboutSelf',
        );
      });

      it('refuses approving a submission at a site outside the approver scope', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const other = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.otherSite);
        const daniel = client(fx.ids.users.daniel, fx.ids.clients.a);
        // Daniel cannot even see the other site's submission; he can only send it blind.
        expect(await refusal(store.evidenceSubmissions.get(daniel, other.id))).toBeInstanceOf(NotFoundError);
        expect(await forbiddenReason(store.evidenceSubmissions.put(daniel, { ...other, status: 'approved' }))).toBe(
          'outOfScope',
        );
      });

      it('writes neither evidence nor audit when approval is refused', async () => {
        const { store, admin, fx } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        const own = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.byDaniel);
        await refusal(store.evidenceSubmissions.put(ctx, { ...own, status: 'approved' }));
        const dump = (await admin.dumpAll()) as Record<string, unknown[]>;
        expect(dump['audit']).toHaveLength(0);
        expect(dump['evidence']).toHaveLength(fx.data.evidence.length);
      });

      it('takes the time from the actor context, not the real time', async () => {
        const { store, admin, fx } = await setup();
        const later = addDays(new Date(TODAY), 3).toISOString();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a, later);
        const pending = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.ben);
        await store.evidenceSubmissions.put(ctx, {
          ...pending,
          status: 'approved',
          reviewerId: fx.ids.users.daniel,
          reviewedAt: later,
        });
        const created = (await store.evidence.list(ctx, { personId: fx.ids.people.ben })).find(
          (e) => e.submissionId === pending.id,
        );
        expect((created as Evidence).approvedAt).toBe(later);
        const audit = ((await admin.dumpAll()) as Record<string, { at: string }[]>)['audit']!;
        expect(audit.map((e) => e.at)).toEqual([later]);
      });

      it('generates ids from the injected clock', async () => {
        const { store, admin, fx, options } = await setup();
        const ctx = client(fx.ids.users.daniel, fx.ids.clients.a);
        const pending = await store.evidenceSubmissions.get(ctx, fx.ids.submissions.ben);
        const approved: EvidenceSubmission = await store.evidenceSubmissions.put(ctx, {
          ...pending,
          status: 'approved',
          reviewerId: fx.ids.users.daniel,
          reviewedAt: TODAY,
        });
        const prefix = ulid(options.clock, createRng(1)).slice(0, 10);
        expect(approved.evidenceId!.slice(0, 10)).toBe(prefix);
        const audit = ((await admin.dumpAll()) as Record<string, { id: string }[]>)['audit']!;
        expect(audit[0]!.id.slice(0, 10)).toBe(prefix);
      });
    });

    describe('M0 security fixes', () => {
      it('refuses a direct evidence put or remove for every side', async () => {
        const { store, fx } = await setup();
        const owner = client(fx.ids.users.priya, fx.ids.clients.a);
        const existing = await store.evidence.get(owner, fx.ids.evidence.jade);
        expect(await forbiddenReason(store.evidence.put(owner, { ...existing, completedAt: TODAY }))).toBe(
          'permission',
        );
        expect(
          await forbiddenReason(store.evidence.put(owner, { ...existing, id: freshId(70), submissionId: undefined })),
        ).toBe('permission');
        expect('remove' in store.evidence).toBe(false);
        const jade = staff(fx.ids.users.jade, fx.ids.clients.a);
        expect(await forbiddenReason(store.evidence.put(jade, { ...existing, id: freshId(71) }))).toBe('permission');
        const prov = provider(fx.ids.users.provOwner);
        expect(await forbiddenReason(store.evidence.put(prov, { ...existing, id: freshId(72) }))).toBe('permission');
      });

      it('refuses any change to an approved submission', async () => {
        const { store, fx } = await setup();
        const daniel = client(fx.ids.users.daniel, fx.ids.clients.a);
        const pending = await store.evidenceSubmissions.get(daniel, fx.ids.submissions.ben);
        const approved = await store.evidenceSubmissions.put(daniel, { ...pending, status: 'approved' });
        const priya = client(fx.ids.users.priya, fx.ids.clients.a);
        expect(await forbiddenReason(store.evidenceSubmissions.put(priya, { ...approved, status: 'rejected' }))).toBe(
          'permission',
        );
        expect(
          await forbiddenReason(store.evidenceSubmissions.put(priya, { ...approved, providerName: 'Changed Ltd' })),
        ).toBe('permission');
      });

      it('checks scope against the stored site as well as the new one', async () => {
        const { store, fx } = await setup();
        const priya = client(fx.ids.users.priya, fx.ids.clients.a);
        const other = await store.evidenceSubmissions.get(priya, fx.ids.submissions.otherSite);
        const daniel = client(fx.ids.users.daniel, fx.ids.clients.a);
        // Move the out-of-scope submission into Daniel's site while keeping it waiting.
        const error = await refusal(store.evidenceSubmissions.put(daniel, { ...other, siteId: fx.ids.sites.main }));
        expect(error).toBeInstanceOf(ForbiddenError);
        const stored = await store.evidenceSubmissions.get(priya, other.id);
        expect(stored.siteId).toBe(other.siteId);
      });

      it('lets staff create their own and withdraw their own waiting submission, and nothing else', async () => {
        const { store, fx } = await setup();
        const ben = staff(fx.ids.users.ben, fx.ids.clients.a);
        const own = await store.evidenceSubmissions.get(ben, fx.ids.submissions.ben);
        // Cannot set reviewer fields or a decision.
        expect(
          await forbiddenReason(store.evidenceSubmissions.put(ben, { ...own, reviewerId: fx.ids.users.ben })),
        ).toBe('permission');
        expect(
          await forbiddenReason(
            store.evidenceSubmissions.put(ben, { ...own, status: 'withdrawn', decisionNote: 'ok' }),
          ),
        ).toBe('permission');
        expect(await forbiddenReason(store.evidenceSubmissions.put(ben, { ...own, status: 'rejected' }))).toBe(
          'permission',
        );
        const fresh = { ...own, id: freshId(73), reviewedAt: TODAY };
        expect(await forbiddenReason(store.evidenceSubmissions.put(ben, fresh))).toBe('permission');
        const created = await store.evidenceSubmissions.put(ben, { ...own, id: freshId(74) });
        expect(created.status).toBe('awaitingCheck');
        const withdrawn = await store.evidenceSubmissions.put(ben, { ...own, status: 'withdrawn' });
        expect(withdrawn.status).toBe('withdrawn');
        // A withdrawn submission cannot be revived.
        expect(await forbiddenReason(store.evidenceSubmissions.put(ben, { ...own, status: 'awaitingCheck' }))).toBe(
          'permission',
        );
      });

      it('audits a rejection with the reviewer and time from the context, and refuses it without evidence.approve', async () => {
        const { store, admin, fx } = await setup();
        const daniel = client(fx.ids.users.daniel, fx.ids.clients.a);
        const pending = await store.evidenceSubmissions.get(daniel, fx.ids.submissions.ben);
        const rejected = await store.evidenceSubmissions.put(daniel, {
          ...pending,
          status: 'rejected',
          reviewerId: fx.ids.users.priya,
          rejectionReason: 'Unreadable',
        });
        expect(rejected).toMatchObject({ status: 'rejected', reviewerId: fx.ids.users.daniel, reviewedAt: TODAY });
        const dump = (await admin.dumpAll()) as Record<string, { action?: string }[]>;
        expect(dump['audit']!.filter((e) => e.action === 'evidence.rejected')).toHaveLength(1);
      });

      it('refuses a provider user account with a clientId and a client writing provider or side-changing users', async () => {
        const { store, fx } = await setup();
        const priya = client(fx.ids.users.priya, fx.ids.clients.a);
        const prov = provider(fx.ids.users.provOwner);
        const support = await store.users.get(prov, fx.ids.users.support);
        expect(await refusal(store.users.put(prov, { ...support, clientId: fx.ids.clients.a }))).toBeInstanceOf(
          ValidationError,
        );
        expect(await forbiddenReason(store.users.put(priya, { ...support, clientId: undefined }))).toBeDefined();
        const daniel = await store.users.get(priya, fx.ids.users.daniel);
        expect(await refusal(store.users.put(priya, { ...daniel, side: 'provider' } as never))).toBeInstanceOf(
          ValidationError,
        );
        const asProvider = { ...daniel, side: 'provider', clientId: undefined } as never;
        expect(await forbiddenReason(store.users.put(priya, asProvider))).toBeDefined();
        expect(await forbiddenReason(store.users.put(priya, { ...daniel, side: 'staff' }))).toBe('permission');
      });

      it('stores only ids and statuses in evidence audit events, and shows no submission fields to the provider', async () => {
        const { store, admin, fx } = await setup();
        const daniel = client(fx.ids.users.daniel, fx.ids.clients.a);
        const pending = await store.evidenceSubmissions.get(daniel, fx.ids.submissions.ben);
        await store.evidenceSubmissions.put(daniel, { ...pending, status: 'approved', decisionNote: 'Looks fine' });
        const dump = (await admin.dumpAll()) as Record<string, object[]>;
        const text = JSON.stringify(dump['audit']);
        for (const field of ['personId', 'fileAttachmentId', 'decisionNote', 'providerName', 'Looks fine']) {
          expect(text).not.toContain(field);
        }
        const seen = await store.audit.list(provider(fx.ids.users.provOwner));
        const providerText = JSON.stringify(seen);
        expect(seen.some((e) => e.action === 'evidence.approved')).toBe(true);
        for (const field of ['personId', 'fileAttachmentId', 'decisionNote']) {
          expect(providerText).not.toContain(field);
        }
      });

      it('forces the audit time to the context time for non-provider actors', async () => {
        const { store, admin, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        await store.audit.append(ctx, {
          id: freshId(75),
          actorId: fx.ids.users.priya,
          actorSide: 'client',
          clientId: fx.ids.clients.a,
          action: 'note.added',
          target: 'thing:1',
          at: '2020-01-01T00:00:00.000Z',
        });
        const events = ((await admin.dumpAll()) as Record<string, { id: string; at: string }[]>)['audit']!;
        expect(events.find((e) => e.id === freshId(75))!.at).toBe(TODAY);
      });
    });

    describe('validation, account state and entitlements', () => {
      it('refuses an invalid record with a ValidationError that lists the issues', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const jade = await store.people.get(ctx, fx.ids.people.jade);
        const error = await refusal(store.people.put(ctx, { ...jade, firstName: '' }));
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).issues.length).toBeGreaterThan(0);
        expect((await store.people.get(ctx, fx.ids.people.jade)).firstName).toBe('Jade');
      });

      it('refuses a record that is not an object of the right shape', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const error = await refusal(store.people.put(ctx, { id: 'not-an-id' } as unknown as Person));
        expect(error).toBeInstanceOf(ValidationError);
      });

      it('lets an admin create a person in an active client', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const jade = await store.people.get(ctx, fx.ids.people.jade);
        const created = await store.people.put(ctx, { ...jade, id: freshId(7), firstName: 'Newstarter' });
        expect((await store.people.get(ctx, created.id)).firstName).toBe('Newstarter');
      });

      it('refuses an admin of a Read-only client creating a person, but still lists and reads people', async () => {
        const { store, fx } = await setup();
        const sc = fx.ids.stateClients.readOnly;
        const ctx = client(sc.owner.id, sc.client.id);
        const listed = await store.people.list(ctx);
        expect(idsOf(listed)).toContain(sc.staffPerson.id);
        const existing = await store.people.get(ctx, sc.staffPerson.id);
        const error = await refusal(store.people.put(ctx, { ...existing, id: freshId(8) }));
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).state).toBe('readOnly');
        expect((error as AccountStateError).feature).toBe('authoring');
      });

      it('refuses creating a role in a Read-only client', async () => {
        const { store, fx } = await setup();
        const sc = fx.ids.stateClients.readOnly;
        const ctx = client(sc.owner.id, sc.client.id);
        const role: Role = {
          id: freshId(9),
          owner: { clientId: sc.client.id },
          name: 'Reception',
          description: '',
          colour: '#112233',
          permissionIds: ['staff.view'],
          system: false,
          version: 1,
          updatedBy: sc.owner.id,
          updatedAt: TODAY,
        };
        expect(await refusal(store.roles.put(ctx, role))).toBeInstanceOf(AccountStateError);
      });

      it.each(['readOnly', 'closed', 'paused'] as const)(
        'never blocks reading or exporting compliance records in a %s account',
        async (state) => {
          const { store, fx } = await setup();
          const sc = fx.ids.stateClients[state];
          const ctx = client(sc.owner.id, sc.client.id);
          expect(idsOf(await store.people.list(ctx))).toContain(sc.staffPerson.id);
          expect((await store.people.get(ctx, sc.staffPerson.id)).id).toBe(sc.staffPerson.id);
          await store.evidence.list(ctx);
          await store.evidenceSubmissions.list(ctx);
          await store.sites.list(ctx);
          await store.subscriptions.list(ctx);
          await store.audit.list(ctx);
        },
      );

      it('refuses authoring in a Closed account too', async () => {
        const { store, fx } = await setup();
        const sc = fx.ids.stateClients.closed;
        const ctx = client(sc.owner.id, sc.client.id);
        const existing = await store.people.get(ctx, sc.staffPerson.id);
        expect(await refusal(store.people.put(ctx, { ...existing, id: freshId(10) }))).toBeInstanceOf(
          AccountStateError,
        );
      });

      it('lets a staff member read their own record in a Read-only account, but not in a Closed one', async () => {
        const { store, fx } = await setup();
        const ro = fx.ids.stateClients.readOnly;
        expect(idsOf(await store.people.list(staff(ro.staff.id, ro.client.id)))).toEqual([ro.staffPerson.id]);
        const closed = fx.ids.stateClients.closed;
        const error = await refusal(store.people.list(staff(closed.staff.id, closed.client.id)));
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).feature).toBe('staffOwnRecord');
      });

      it('makes a Deleted account unavailable to everyone but the provider', async () => {
        const { store, fx } = await setup();
        const sc = fx.ids.stateClients.deleted;
        const error = await refusal(store.people.list(client(sc.owner.id, sc.client.id)));
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).state).toBe('deleted');
        expect(await refusal(store.people.list(staff(sc.staff.id, sc.client.id)))).toBeInstanceOf(AccountStateError);
        expect((await store.clients.get(provider(fx.ids.users.provOwner), sc.client.id)).id).toBe(sc.client.id);
      });

      const newRole = (fx: Fixture, n: number): Role => ({
        id: freshId(n),
        owner: { clientId: fx.ids.clients.b },
        name: `Custom ${n}`,
        description: '',
        colour: '#112233',
        permissionIds: ['staff.view'],
        system: false,
        version: 1,
        updatedBy: fx.ids.users.beth,
        updatedAt: TODAY,
      });

      it('refuses a custom role beyond the package limit with NotEntitled', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.beth, fx.ids.clients.b);
        const error = await refusal(store.roles.put(ctx, newRole(fx, 11)));
        expect(error).toBeInstanceOf(NotEntitledError);
        expect((error as NotEntitledError).feature).toBe('customClientRoles');
        expect(await store.audit.list(ctx)).toHaveLength(0);
      });

      it('lets an add-on raise the custom role limit, and refuses the next role beyond it', async () => {
        const { store, admin, fx } = await setup();
        await admin.bulkPut('addOnSubscriptions', [
          { clientId: fx.ids.clients.b, addOnId: fx.ids.addOnId, status: 'on', usageThisPeriod: 0 },
        ]);
        const ctx = client(fx.ids.users.beth, fx.ids.clients.b);
        await store.roles.put(ctx, newRole(fx, 12));
        expect(await refusal(store.roles.put(ctx, newRole(fx, 13)))).toBeInstanceOf(NotEntitledError);
      });

      it('allows updating an existing custom role at the limit', async () => {
        const { store, admin, fx } = await setup();
        await admin.bulkPut('addOnSubscriptions', [
          { clientId: fx.ids.clients.b, addOnId: fx.ids.addOnId, status: 'on', usageThisPeriod: 0 },
        ]);
        const ctx = client(fx.ids.users.beth, fx.ids.clients.b);
        const role = await store.roles.put(ctx, newRole(fx, 14));
        const renamed = await store.roles.put(ctx, { ...role, name: 'Renamed', version: 2 });
        expect(renamed.name).toBe('Renamed');
      });

      it('does not limit a package with unlimited custom roles', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.otOwner, fx.ids.clients.ot);
        for (const n of [15, 16, 17, 18, 19]) {
          await store.roles.put(ctx, {
            ...newRole(fx, n),
            owner: { clientId: fx.ids.clients.ot },
            updatedBy: fx.ids.users.otOwner,
          });
        }
        expect((await store.roles.list(ctx)).filter((r) => !r.system).length).toBeGreaterThanOrEqual(5);
      });
    });

    describe('audit log and outbox', () => {
      it('has no way to overwrite or remove audit events or outbox messages', async () => {
        const { store } = await setup();
        for (const repo of [store.audit, store.outbox] as object[]) {
          expect('append' in repo).toBe(true);
          expect('put' in repo).toBe(false);
          expect('remove' in repo).toBe(false);
        }
      });

      it('lets an actor read audit events only with settings.view and only for their own client', async () => {
        const { store, fx } = await setup();
        const priya = client(fx.ids.users.priya, fx.ids.clients.a);
        await store.roleAssignments.put(priya, {
          ...(await store.roleAssignments.get(priya, fx.ids.assignments.daniel)),
          grants: ['reports.export'],
        });
        const own = await store.audit.list(priya);
        expect(own).toHaveLength(1);
        expect(await store.audit.list(client(fx.ids.users.beth, fx.ids.clients.b))).toHaveLength(0);
        expect(await forbiddenReason(store.audit.list(client(fx.ids.users.daniel, fx.ids.clients.a)))).toBe(
          'permission',
        );
        expect(await refusal(store.audit.get(client(fx.ids.users.beth, fx.ids.clients.b), own[0]!.id))).toBeInstanceOf(
          NotFoundError,
        );
      });

      it('refuses appending an audit event for another client', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const event = {
          id: freshId(20),
          actorId: fx.ids.users.priya,
          actorSide: 'client' as const,
          clientId: fx.ids.clients.b,
          action: 'note.added',
          target: 'thing:1',
          at: TODAY,
        };
        expect(await forbiddenReason(store.audit.append(ctx, event))).toBe('tenant');
      });

      it('refuses an invalid audit event', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const error = await refusal(store.audit.append(ctx, { id: freshId(21), action: '' } as never));
        expect(error).toBeInstanceOf(ValidationError);
      });

      const message = (n: number): OutboxMessage => ({
        id: freshId(n),
        channel: 'email',
        to: 'invitee@example.test',
        subject: 'Your invite',
        body: 'Welcome',
        at: TODAY,
        reason: 'invite',
      });

      it('accepts an outbox message from any known actor and shows it only through DemoAdmin', async () => {
        const { store, admin, fx } = await setup();
        await store.outbox.append(client(fx.ids.users.priya, fx.ids.clients.a), message(30));
        await store.outbox.append(provider(fx.ids.users.support), message(31));
        expect('list' in store.outbox).toBe(false);
        expect('get' in store.outbox).toBe(false);
        expect((await admin.listOutbox()).map((m) => m.id)).toEqual([freshId(30), freshId(31)]);
      });

      it('refuses an outbox message from an unknown actor or with an invalid body', async () => {
        const { store, admin, fx } = await setup();
        expect(await forbiddenReason(store.outbox.append(client(freshId(99), fx.ids.clients.a), message(32)))).toBe(
          'unknownActor',
        );
        const bad = await refusal(
          store.outbox.append(client(fx.ids.users.priya, fx.ids.clients.a), {
            ...message(33),
            channel: 'carrier-pigeon',
          } as never),
        );
        expect(bad).toBeInstanceOf(ValidationError);
        expect(await admin.listOutbox()).toHaveLength(0);
      });
    });

    describe('DemoAdmin, seed meta and demo state', () => {
      it('dumps every store by name', async () => {
        const { admin } = await setup();
        const dump = (await admin.dumpAll()) as Record<string, unknown[]>;
        expect(Object.keys(dump).sort()).toEqual([...ALL_STORES].sort());
        for (const rows of Object.values(dump)) expect(Array.isArray(rows)).toBe(true);
      });

      it('loads the seed world and dumps the same records', async () => {
        const { admin, fx } = await setup();
        const dump = (await admin.dumpAll()) as Record<string, { id?: string }[]>;
        expect(dump['people']).toHaveLength(fx.data.people.length);
        expect(dump['clients']).toHaveLength(14);
      });

      it('validates bulkPut and writes nothing when a record is invalid', async () => {
        const { admin, fx } = await setup();
        const before = ((await admin.dumpAll()) as Record<string, unknown[]>)['people']!.length;
        const good = fx.data.people[0]!;
        const error = await refusal(
          admin.bulkPut('people', [
            { ...good, id: freshId(40) },
            { ...good, id: 'bad' },
          ]),
        );
        expect(error).toBeInstanceOf(ValidationError);
        expect(((await admin.dumpAll()) as Record<string, unknown[]>)['people']).toHaveLength(before);
      });

      it('empties every store with clearAll', async () => {
        const { admin } = await setup();
        await admin.clearAll();
        const dump = (await admin.dumpAll()) as Record<string, unknown[]>;
        for (const name of ALL_STORES) expect(dump[name]).toEqual([]);
      });

      it('keeps no trace of cleared records visible to actors', async () => {
        const { store, admin, fx } = await setup();
        await admin.clearAll();
        expect(await forbiddenReason(store.people.list(client(fx.ids.users.priya, fx.ids.clients.a)))).toBe(
          'unknownActor',
        );
      });

      it('returns undefined seed meta until set, then round-trips it', async () => {
        const { admin } = await setup();
        // The seed has already stored its own seed value and today.
        expect(await admin.getSeedMeta()).toEqual({ seedValue: 20261019, today: TODAY });
        await admin.clearAll();
        expect(await admin.getSeedMeta()).toBeUndefined();
        await admin.setSeedMeta({ seedValue: 20261019, today: TODAY });
        expect(await admin.getSeedMeta()).toEqual({ seedValue: 20261019, today: TODAY });
        await admin.setSeedMeta({ seedValue: 5, today: '2026-11-01T00:00:00.000Z' });
        expect(await admin.getSeedMeta()).toEqual({ seedValue: 5, today: '2026-11-01T00:00:00.000Z' });
      });

      it('validates seed meta', async () => {
        const { admin } = await setup();
        expect(await refusal(admin.setSeedMeta({ seedValue: 1.5, today: TODAY }))).toBeInstanceOf(ValidationError);
        expect(await refusal(admin.setSeedMeta({ seedValue: 1, today: 'yesterday' }))).toBeInstanceOf(ValidationError);
        expect(await admin.getSeedMeta()).toEqual({ seedValue: 20261019, today: TODAY });
      });

      it('round-trips the demo state and validates it', async () => {
        const { admin, fx } = await setup();
        expect(await admin.getDemoState()).toBeUndefined();
        const state = {
          clockOffsetMs: 30 * 24 * 60 * 60 * 1000,
          industry: 'nursery' as const,
          persona: { side: 'client' as const, userId: fx.ids.users.priya },
        };
        await admin.setDemoState(state);
        expect(await admin.getDemoState()).toEqual(state);
        const bad = { ...state, industry: 'mining' } as never;
        expect(await refusal(admin.setDemoState(bad))).toBeInstanceOf(ValidationError);
        expect(await admin.getDemoState()).toEqual(state);
      });

      it('returns meta and state copies that callers cannot use to change the store', async () => {
        const { admin } = await setup();
        await admin.setSeedMeta({ seedValue: 1, today: TODAY });
        const meta = (await admin.getSeedMeta())!;
        meta.seedValue = 999;
        expect((await admin.getSeedMeta())!.seedValue).toBe(1);
      });
    });

    describe('copies', () => {
      it('returns records that callers cannot use to change the stored ones', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const got = await store.people.get(ctx, fx.ids.people.jade);
        got.firstName = 'Changed';
        const again = await store.people.get(ctx, fx.ids.people.jade);
        expect(again.firstName).toBe('Jade');
        // Prefs are only read by the person themselves.
        const own = { userId: fx.keys.users['jade'], side: 'staff' as const, clientId: fx.ids.clients.a, now: TODAY };
        const mine = await store.people.get(own, fx.ids.people.jade);
        const storedSound = mine.prefs.sound;
        mine.prefs.sound = !storedSound;
        expect((await store.people.get(own, fx.ids.people.jade)).prefs.sound).toBe(storedSound);
        const listed = await store.people.list(ctx);
        listed[0]!.firstName = 'Changed';
        expect((await store.people.list(ctx))[0]!.firstName).not.toBe('Changed');
      });

      it('stores a copy of what the caller put', async () => {
        const { store, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const jade = await store.people.get(ctx, fx.ids.people.jade);
        const mine = { ...jade, qualificationLevel: 'Level 3' };
        await store.people.put(ctx, mine);
        mine.qualificationLevel = 'Changed later';
        expect((await store.people.get(ctx, fx.ids.people.jade)).qualificationLevel).toBe('Level 3');
      });

      it('copies what bulkPut was given', async () => {
        const { store, admin, fx } = await setup();
        const ctx = client(fx.ids.users.priya, fx.ids.clients.a);
        const record = { ...fx.data.people.find((p) => p.id === fx.ids.people.jade)!, id: freshId(41) };
        await admin.bulkPut('people', [record]);
        record.firstName = 'Mutated';
        expect((await store.people.get(ctx, freshId(41))).firstName).toBe('Jade');
      });
    });
  });
}

// M4 chunk 8c contract tests: the provider overview (P1), the client list (P2), the seeded simulated telemetry read and
// the This device telemetry (plan docs/plans/m4.md chunk 8, BP-1). Written before the implementation, so the new
// services are described by local types:
//   - store.providerOverview.overview(ctx) and clients(ctx, filter?) need clients.read, provider side only.
//     overview returns { simulated: true, clientCount, byAccountState, siteCount, peopleCount, attention }. peopleCount
//     is the people with status 'active'. attention lists clients needing attention, each { clientId, reasons[] }.
//     clients returns one row per client: { clientId, displayName, accountState, packageId, siteCount, peopleCount,
//     healthScore? } with the same counting rules, sorted by name. filter { accountState? } narrows the rows.
//   - store.telemetry.recordLocalEvent(input) and recordLocalError(input) record on THIS device only. They take no actor
//     because an error handler has none; the time comes from the injected Clock. listLocal(ctx) is provider only
//     (clients.read) and returns the entries newest first. Entries live in the 'localTelemetry' store.
//   - store.telemetry.simulated(ctx, clientId) is provider only (clients.read) and returns the seeded usageDaily,
//     errorGroups and the latest healthScore of one client, flagged simulated: true.
// Reset choice: the This device log is real, not demo data. It is not in the seed, and Reset (seed reset) leaves it
// alone, so a presenter pressing Reset does not wipe real local errors.
import { describe, expect, it } from 'vitest';
import { createRng, type AccountState, type Client, type Clock, type Person, type Site } from '@sta/domain';
import { load, reset } from '@sta/seed';
import { ForbiddenError, type ActorContext, type StoreHandle, type StoreOptions } from '../types';
import { refusal } from './learning';
import { SEED_VALUE, TODAY } from './world';

type OverviewRow = {
  clientId: string;
  displayName: string;
  accountState: AccountState;
  packageId: string;
  siteCount: number;
  peopleCount: number;
  healthScore?: number;
};
type Overview = {
  simulated: true;
  clientCount: number;
  byAccountState: Partial<Record<AccountState, number>>;
  siteCount: number;
  peopleCount: number;
  attention: { clientId: string; reasons: string[] }[];
};
type LocalEntry = { id: string; kind: 'event' | 'error'; name: string; message?: string; at: string };
type SimClientTelemetry = {
  simulated: true;
  clientId: string;
  usageDaily: { clientId: string; date: string; feature: string; count: number; activeUsers: number }[];
  errorGroups: { id: string; clientIds: string[]; message: string; count: number }[];
  healthScore: { clientId: string; date: string; score: number; reasons: string[] } | undefined;
};
type OverviewStore = {
  providerOverview: {
    overview(ctx: ActorContext): Promise<Overview>;
    clients(ctx: ActorContext, filter?: { accountState?: AccountState }): Promise<OverviewRow[]>;
  };
  telemetry: {
    recordLocalEvent(input: { name: string }): Promise<LocalEntry>;
    recordLocalError(input: { name: string; message: string }): Promise<LocalEntry>;
    listLocal(ctx: ActorContext): Promise<LocalEntry[]>;
    simulated(ctx: ActorContext, clientId: string): Promise<SimClientTelemetry>;
  };
};

const MINUTE = 60_000;

export function runProviderOverviewContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  // The overview totals are the plain seed's, so these tests load the plain seed (buildWorld adds test-only clients).
  async function setup() {
    let nowMs = Date.parse(TODAY);
    // A clock the test can advance, so two local records get two different Clock times (no Date.now anywhere).
    const clock: Clock = { now: () => new Date(nowMs) };
    const handle = await makeStore({ clock, rng: createRng(7) });
    const keys = await load(handle.admin, { seedValue: SEED_VALUE, today: TODAY });
    const dump = async <T>(st: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[st] ?? [];
    const u = keys.users;
    const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });
    const clients = await dump<Client>('clients');
    const client = (n: string): Client => clients.find((c) => c.displayName === n)!;
    const clientActor = (c: Client): ActorContext => ({
      userId: u['priya'],
      side: 'client',
      clientId: c.id,
      now: TODAY,
    });
    return {
      handle,
      s: handle.store as unknown as OverviewStore,
      dump,
      clients,
      client,
      advance: (ms: number) => {
        nowMs += ms;
      },
      owner: provider(u['providerOwner']),
      support: provider(u['sophie']),
      priya: clientActor(client('Little Acorns Nursery')),
      jade: {
        userId: u['jade'],
        side: 'staff',
        clientId: client('Little Acorns Nursery').id,
        now: TODAY,
      } as ActorContext,
    };
  }

  describe(`M4 provider overview and telemetry: ${name}`, () => {
    it('gives a provider actor the seeded totals: 13 clients, counts by account state, sites and active people', async () => {
      const t = await setup();
      const o = await t.s.providerOverview.overview(t.owner);
      expect(o.simulated).toBe(true);
      expect(t.clients).toHaveLength(13);
      expect(o.clientCount).toBe(13);
      const expectedStates: Partial<Record<AccountState, number>> = {};
      for (const c of t.clients) expectedStates[c.accountState] = (expectedStates[c.accountState] ?? 0) + 1;
      expect(o.byAccountState).toEqual(expectedStates);
      // Build pack 7.2: Willow Lane is past due, Rosewood is a trial, Meadowview is closed, Pebbles is paused.
      expect(o.byAccountState.pastDue).toBeGreaterThanOrEqual(1);
      expect(o.byAccountState.closed).toBeGreaterThanOrEqual(1);
      expect(o.byAccountState.paused).toBeGreaterThanOrEqual(1);
      expect(o.byAccountState.trial).toBeGreaterThanOrEqual(2);
      expect(o.siteCount).toBe((await t.dump<Site>('sites')).length);
      expect(o.peopleCount).toBe((await t.dump<Person>('people')).filter((p) => p.status === 'active').length);
      expect(o.peopleCount).toBeGreaterThan(0);
    });

    it('lists clients needing attention with reasons, including the falling and low-usage seeded clients', async () => {
      const t = await setup();
      const o = await t.s.providerOverview.overview(t.owner);
      expect(o.attention.length).toBeGreaterThan(0);
      const known = new Set(t.clients.map((c) => c.id));
      for (const a of o.attention) {
        expect(known.has(a.clientId)).toBe(true);
        expect(a.reasons.length).toBeGreaterThan(0);
      }
      const ids = o.attention.map((a) => a.clientId);
      expect(ids).toContain(t.client('Harbour Cafe Group').id);
      expect(ids).toContain(t.client('Summit Builders').id);
      expect(ids).not.toContain(t.client('Little Acorns Nursery').id);
    });

    it('lets a provider user with clients.read see the overview and refuses client and staff actors', async () => {
      const t = await setup();
      expect((await t.s.providerOverview.overview(t.support)).clientCount).toBe(13);
      for (const actor of [t.priya, t.jade]) {
        expect(await refusal(t.s.providerOverview.overview(actor))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.providerOverview.clients(actor))).toBeInstanceOf(ForbiddenError);
      }
    });

    it('lists all 13 clients with name, account state, package, site and active-people counts', async () => {
      const t = await setup();
      const rows = await t.s.providerOverview.clients(t.owner);
      expect(rows).toHaveLength(13);
      const sites = await t.dump<Site>('sites');
      const people = await t.dump<Person>('people');
      for (const c of t.clients) {
        const row = rows.find((r) => r.clientId === c.id)!;
        expect(row).toMatchObject({ displayName: c.displayName, accountState: c.accountState, packageId: c.packageId });
        expect(row.siteCount).toBe(sites.filter((s) => s.clientId === c.id).length);
        expect(row.peopleCount).toBe(people.filter((p) => p.clientId === c.id && p.status === 'active').length);
      }
      expect(rows.find((r) => r.clientId === t.client('Oak Tree Nurseries').id)!.siteCount).toBe(3);
      expect(rows.find((r) => r.clientId === t.client('Harbour Cafe Group').id)!.siteCount).toBe(4);
      expect(rows.map((r) => r.displayName)).toEqual(
        [...rows.map((r) => r.displayName)].sort((a, b) => a.localeCompare(b)),
      );
    });

    it('gives each client row its seeded health score where one is seeded', async () => {
      const t = await setup();
      const rows = await t.s.providerOverview.clients(t.owner);
      const scores = await t.dump<{ clientId: string; date: string; score: number }>('healthScores');
      expect(scores.length).toBeGreaterThan(0);
      for (const row of rows) {
        const mine = scores.filter((x) => x.clientId === row.clientId).sort((a, b) => b.date.localeCompare(a.date));
        if (mine.length > 0) expect(row.healthScore).toBe(mine[0]!.score);
        else expect(row.healthScore).toBeUndefined();
      }
      const harbour = rows.find((r) => r.clientId === t.client('Harbour Cafe Group').id)!;
      const acorns = rows.find((r) => r.clientId === t.client('Little Acorns Nursery').id)!;
      expect(harbour.healthScore).toBeLessThan(acorns.healthScore!);
    });

    it('filters the client list by account state', async () => {
      const t = await setup();
      const pastDue = await t.s.providerOverview.clients(t.owner, { accountState: 'pastDue' });
      expect(pastDue.map((r) => r.clientId).sort()).toEqual(
        t.clients
          .filter((c) => c.accountState === 'pastDue')
          .map((c) => c.id)
          .sort(),
      );
      expect(pastDue.map((r) => r.displayName)).toContain('Willow Lane Nursery');
      expect(pastDue.every((r) => r.accountState === 'pastDue')).toBe(true);
      expect(await t.s.providerOverview.clients(t.owner, { accountState: 'deleted' })).toEqual([]);
    });

    it('records a local event and a local error at the Clock time and lists them newest first', async () => {
      const t = await setup();
      const first = await t.s.telemetry.recordLocalEvent({ name: 'app.opened' });
      expect(first).toMatchObject({ kind: 'event', name: 'app.opened', at: TODAY });
      t.advance(5 * MINUTE);
      const second = await t.s.telemetry.recordLocalError({ name: 'render.failed', message: 'Something broke' });
      const later = new Date(Date.parse(TODAY) + 5 * MINUTE).toISOString();
      expect(second).toMatchObject({ kind: 'error', name: 'render.failed', message: 'Something broke', at: later });
      const listed = await t.s.telemetry.listLocal(t.owner);
      expect(listed.map((e) => e.id)).toEqual([second.id, first.id]);
      expect(listed.map((e) => e.at)).toEqual([later, TODAY]);
    });

    it('stores local telemetry in the localTelemetry store on this device and not in the seed', async () => {
      const t = await setup();
      expect(await t.dump('localTelemetry')).toEqual([]);
      await t.s.telemetry.recordLocalError({ name: 'x.failed', message: 'Boom' });
      expect(await t.dump('localTelemetry')).toHaveLength(1);
    });

    it('keeps local telemetry across Reset because it is real device data, not demo data', async () => {
      const t = await setup();
      const kept = await t.s.telemetry.recordLocalError({ name: 'x.failed', message: 'Boom' });
      await reset(t.handle.admin);
      const listed = await t.s.telemetry.listLocal(t.owner);
      expect(listed.map((e) => e.id)).toContain(kept.id);
    });

    it('lists local telemetry for provider actors only', async () => {
      const t = await setup();
      await t.s.telemetry.recordLocalEvent({ name: 'app.opened' });
      expect(await t.s.telemetry.listLocal(t.support)).toHaveLength(1);
      for (const actor of [t.priya, t.jade]) {
        expect(await refusal(t.s.telemetry.listLocal(actor))).toBeInstanceOf(ForbiddenError);
      }
    });

    it("returns a client's seeded usage, error groups and health score to a provider, flagged simulated", async () => {
      const t = await setup();
      const harbour = t.client('Harbour Cafe Group');
      const r = await t.s.telemetry.simulated(t.owner, harbour.id);
      expect(r.simulated).toBe(true);
      expect(r.clientId).toBe(harbour.id);
      const usage = (await t.dump<SimClientTelemetry['usageDaily'][number]>('usageDaily')).filter(
        (x) => x.clientId === harbour.id,
      );
      expect(usage.length).toBeGreaterThanOrEqual(90);
      expect(r.usageDaily).toHaveLength(usage.length);
      expect(new Set(r.usageDaily.map((x) => x.clientId))).toEqual(new Set([harbour.id]));
      const groups = (await t.dump<SimClientTelemetry['errorGroups'][number]>('errorGroups')).filter((g) =>
        g.clientIds.includes(harbour.id),
      );
      expect(r.errorGroups.map((g) => g.id).sort()).toEqual(groups.map((g) => g.id).sort());
      const scores = (await t.dump<{ clientId: string; date: string; score: number }>('healthScores'))
        .filter((x) => x.clientId === harbour.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      expect(r.healthScore).toMatchObject({ clientId: harbour.id, score: scores[0]!.score, date: scores[0]!.date });
      expect(r.healthScore!.reasons.length).toBeGreaterThan(0);
    });

    it('refuses the simulated telemetry read to client and staff actors, even for their own client', async () => {
      const t = await setup();
      const own = t.client('Little Acorns Nursery').id;
      for (const actor of [t.priya, t.jade]) {
        expect(await refusal(t.s.telemetry.simulated(actor, own))).toBeInstanceOf(ForbiddenError);
      }
    });
  });
}

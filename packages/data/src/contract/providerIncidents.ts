// M4 chunk 14a contract tests: provider incidents and the data request log (plan docs/plans/m4.md chunk 14, BP-12;
// brief 26.4 and 26.5). Written before the implementation, so the new services are described by local types:
//   - store.incidents.list(ctx) (incidents.post) is newest first. post(ctx, {level, title, message, status?}) creates an
//     Incident with a first update (status defaults 'investigating') and startedAt from the Clock. update(ctx, id,
//     {status, message}) appends an update; 'resolved' sets resolvedAt and a resolved incident cannot change again
//     (RuleError 'notApplicable'). current(ctx) is readable by any signed-in actor and gives the overall status: the
//     highest-severity level among unresolved incidents (incident > maintenance > degraded > normal), else normal
//     with no title. Audit actions: 'incident.post' and 'incident.update', ids and level/status only.
//   - store.dataRequests (dataRequests.manage, provider only): list(ctx) ordered by dueAt ascending with dueInDays
//     (whole days from the Clock, negative when overdue); create(ctx, {kind, requester, clientId?, notes,
//     receivedAt?}) with dueAt one calendar month after receivedAt (the domain addMonths helper); complete(ctx, id,
//     {evidence}) and reject(ctx, id, {notes}) change open requests only (RuleError 'notApplicable').
//     Audit actions: 'dataRequest.create', 'dataRequest.complete', 'dataRequest.reject': ids and kind/status only,
//     never requester, notes or evidence text.
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  createRng,
  fixedClock,
  type AuditEvent,
  type DataRequest,
  type Incident,
} from '@sta/domain';
import { load } from '@sta/seed';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type StoreHandle,
  type StoreOptions,
} from '../types';
import { refusal, ruleOf } from './learning';
import { buildWorld, freshId, SEED_VALUE, TODAY } from './world';

type Level = Incident['level'];
type IncidentStatus = Incident['updates'][number]['status'];
type DataRequestRow = DataRequest & { dueInDays: number };
type NewIncident = { level: Level; title: string; message: string; status?: IncidentStatus };
type NewDataRequest = {
  kind: DataRequest['kind'];
  requester: string;
  clientId?: string;
  notes: string;
  receivedAt?: string;
};
type IncidentsStore = {
  incidents: {
    list(ctx: ActorContext): Promise<Incident[]>;
    post(ctx: ActorContext, input: NewIncident): Promise<Incident>;
    update(ctx: ActorContext, id: string, input: { status: IncidentStatus; message: string }): Promise<Incident>;
    current(ctx: ActorContext): Promise<{ level: Level; title?: string; message?: string }>;
  };
  dataRequests: {
    list(ctx: ActorContext): Promise<DataRequestRow[]>;
    create(ctx: ActorContext, input: NewDataRequest): Promise<DataRequest>;
    complete(ctx: ActorContext, id: string, input: { evidence: string }): Promise<DataRequest>;
    reject(ctx: ActorContext, id: string, input: { notes: string }): Promise<DataRequest>;
  };
};

export function runProviderIncidentsContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    const s = handle.store as unknown as IncidentsStore;
    const u = fx.ids.users;
    const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });
    const dump = async <T>(st: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[st] ?? [];
    return {
      s,
      fx,
      u,
      dump,
      priya: { userId: u.priya, side: 'client', clientId: fx.ids.clients.a, now: TODAY } as ActorContext,
      jade: { userId: u.jade, side: 'staff', clientId: fx.ids.clients.a, now: TODAY } as ActorContext,
      // Support holds incidents.post but not dataRequests.manage; billing (raj) holds neither; the owner holds both.
      support: provider(u.support),
      owner: provider(u.provOwner),
      raj: provider(fx.keys.users['raj']),
    };
  }
  // buildWorld drops the seeded incidents and data requests, so these tests load the plain seed.
  async function seededSetup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const keys = await load(handle.admin, { seedValue: SEED_VALUE, today: TODAY });
    const dump = async <T>(st: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[st] ?? [];
    return {
      s: handle.store as unknown as IncidentsStore,
      dump,
      owner: { userId: keys.users['providerOwner'], side: 'provider', now: TODAY } as ActorContext,
    };
  }
  const audits = async (dump: <T>(n: string) => Promise<T[]>, action: string) =>
    (await dump<AuditEvent>('audit')).filter((e) => e.action === action);
  const incident = (over: Partial<NewIncident> = {}): NewIncident => ({
    level: 'degraded',
    title: 'Slow sign in',
    message: 'Sign in is slower than usual.',
    ...over,
  });
  const request = (over: Partial<NewDataRequest> = {}): NewDataRequest => ({
    kind: 'access',
    requester: 'A former member of staff',
    notes: 'Identity checked by phone.',
    receivedAt: '2026-09-19T09:00:00.000Z',
    ...over,
  });

  describe(`M4 provider incidents: ${name}`, () => {
    it('posts an incident with a first update, defaulting to investigating, and starts it at the Clock time', async () => {
      const t = await setup();
      const made = await t.s.incidents.post(t.support, incident());
      expect(made).toMatchObject({ level: 'degraded', title: 'Slow sign in', startedAt: TODAY });
      expect(made.resolvedAt).toBeUndefined();
      expect(made.updates).toEqual([
        { status: 'investigating', message: 'Sign in is slower than usual.', at: TODAY },
      ]);
      expect((await t.s.incidents.list(t.support)).map((i) => i.id)).toContain(made.id);
    });

    it('uses the status given when posting', async () => {
      const t = await setup();
      const made = await t.s.incidents.post(t.support, incident({ status: 'identified' }));
      expect(made.updates[0]!.status).toBe('identified');
    });

    it('refuses an empty or blank title and stores nothing', async () => {
      const t = await setup();
      for (const title of ['', '   ']) {
        expect(await refusal(t.s.incidents.post(t.support, incident({ title })))).toBeInstanceOf(ValidationError);
      }
      expect(await t.dump<Incident>('incidents')).toHaveLength(0);
      expect(await audits(t.dump, 'incident.post')).toHaveLength(0);
    });

    it('lists incidents newest first, with the seeded resolved one last', async () => {
      const t = await seededSetup();
      const seeded = (await t.s.incidents.list(t.owner)).map((i) => i.id);
      expect(seeded).toHaveLength(1);
      const made = await t.s.incidents.post(t.owner, incident({ title: 'Brand new' }));
      const listed = await t.s.incidents.list(t.owner);
      expect(listed.map((i) => i.id)).toEqual([made.id, ...seeded]);
      expect(listed[1]!.resolvedAt).toBeDefined();
    });

    it('appends an update and keeps the earlier ones', async () => {
      const t = await setup();
      const made = await t.s.incidents.post(t.support, incident());
      const updated = await t.s.incidents.update(t.support, made.id, { status: 'monitoring', message: 'A fix is live.' });
      expect(updated.updates.map((x) => x.status)).toEqual(['investigating', 'monitoring']);
      expect(updated.updates[1]).toMatchObject({ message: 'A fix is live.', at: TODAY });
      expect(updated.resolvedAt).toBeUndefined();
      const stored = (await t.dump<Incident>('incidents')).find((i) => i.id === made.id)!;
      expect(stored.updates).toHaveLength(2);
    });

    it('sets resolvedAt when resolved and refuses any further update', async () => {
      const t = await setup();
      const made = await t.s.incidents.post(t.support, incident());
      const done = await t.s.incidents.update(t.support, made.id, { status: 'resolved', message: 'All fixed.' });
      expect(done.resolvedAt).toBe(TODAY);
      expect(await ruleOf(t.s.incidents.update(t.support, made.id, { status: 'monitoring', message: 'Again' }))).toBe(
        'notApplicable',
      );
      expect(await ruleOf(t.s.incidents.update(t.support, made.id, { status: 'resolved', message: 'Twice' }))).toBe(
        'notApplicable',
      );
      const stored = (await t.dump<Incident>('incidents')).find((i) => i.id === made.id)!;
      expect(stored.updates).toHaveLength(2);
    });

    it('refuses an update to a seeded resolved incident', async () => {
      const t = await seededSetup();
      const [old] = await t.s.incidents.list(t.owner);
      expect(await ruleOf(t.s.incidents.update(t.owner, old!.id, { status: 'monitoring', message: 'Back' }))).toBe(
        'notApplicable',
      );
    });

    it('reports an unknown incident id as not found', async () => {
      const t = await setup();
      expect(
        await refusal(t.s.incidents.update(t.support, freshId(77), { status: 'monitoring', message: 'Nothing here' })),
      ).toBeInstanceOf(NotFoundError);
    });

    it('reports Normal with no title when nothing is open, including the seeded resolved incident', async () => {
      const t = await seededSetup();
      const status = await t.s.incidents.current(t.owner);
      expect(status.level).toBe('normal');
      expect(status.title).toBeUndefined();
    });

    it('reports the highest-severity unresolved level and falls back as incidents resolve', async () => {
      const t = await setup();
      await t.s.incidents.post(t.support, incident({ level: 'degraded', title: 'Slow', message: 'Slow now' }));
      expect(await t.s.incidents.current(t.support)).toMatchObject({ level: 'degraded', title: 'Slow' });
      const maint = await t.s.incidents.post(
        t.support,
        incident({ level: 'maintenance', title: 'Planned work', message: 'Back at noon' }),
      );
      expect(await t.s.incidents.current(t.support)).toMatchObject({ level: 'maintenance', title: 'Planned work' });
      const major = await t.s.incidents.post(
        t.support,
        incident({ level: 'incident', title: 'Outage', message: 'We are on it' }),
      );
      expect(await t.s.incidents.current(t.support)).toEqual({
        level: 'incident',
        title: 'Outage',
        message: 'We are on it',
      });
      await t.s.incidents.update(t.support, major.id, { status: 'resolved', message: 'Over' });
      expect(await t.s.incidents.current(t.support)).toMatchObject({ level: 'maintenance', title: 'Planned work' });
      await t.s.incidents.update(t.support, maint.id, { status: 'resolved', message: 'Done' });
      expect(await t.s.incidents.current(t.support)).toMatchObject({ level: 'degraded', title: 'Slow' });
    });

    it('shows the latest update message as the current message', async () => {
      const t = await setup();
      const made = await t.s.incidents.post(t.support, incident({ level: 'incident', title: 'Outage' }));
      await t.s.incidents.update(t.support, made.id, { status: 'identified', message: 'Cause found.' });
      expect((await t.s.incidents.current(t.support)).message).toBe('Cause found.');
    });

    it('lets every signed-in actor read the current status without a permission', async () => {
      const t = await setup();
      await t.s.incidents.post(t.support, incident({ level: 'incident', title: 'Outage', message: 'Looking' }));
      for (const actor of [t.priya, t.jade, t.raj, t.support]) {
        expect(await t.s.incidents.current(actor)).toMatchObject({ level: 'incident', title: 'Outage' });
      }
    });

    it('audits posts and updates with ids, level and status only', async () => {
      const t = await setup();
      const made = await t.s.incidents.post(
        t.support,
        incident({ level: 'incident', title: 'Very private title', message: 'Very private message' }),
      );
      await t.s.incidents.update(t.support, made.id, { status: 'monitoring', message: 'Very private update' });
      const [posted] = await audits(t.dump, 'incident.post');
      const [updated] = await audits(t.dump, 'incident.update');
      expect(posted).toMatchObject({ actorId: t.u.support, actorSide: 'provider', at: TODAY });
      expect(posted!.target).toContain(made.id);
      expect(updated!.target).toContain(made.id);
      expect(JSON.stringify(posted)).toContain('incident');
      expect(JSON.stringify(updated)).toContain('monitoring');
      for (const e of [posted, updated]) expect(JSON.stringify(e)).not.toContain('Very private');
    });

    it('denies a provider user without incidents.post, and every customer actor, before validating', async () => {
      const t = await setup();
      const made = await t.s.incidents.post(t.support, incident());
      const before = await t.dump<Incident>('incidents');
      for (const actor of [t.raj, t.priya, t.jade]) {
        // The empty title would be a ValidationError if validation ran first.
        expect(await refusal(t.s.incidents.post(actor, incident({ title: '' })))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.incidents.post(actor, incident()))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.incidents.list(actor))).toBeInstanceOf(ForbiddenError);
        expect(
          await refusal(t.s.incidents.update(actor, made.id, { status: 'resolved', message: '' })),
        ).toBeInstanceOf(ForbiddenError);
        expect(
          await refusal(t.s.incidents.update(actor, freshId(78), { status: 'resolved', message: 'x' })),
        ).toBeInstanceOf(ForbiddenError);
      }
      expect(await t.dump<Incident>('incidents')).toEqual(before);
      expect(await audits(t.dump, 'incident.update')).toHaveLength(0);
    });
  });

  describe(`M4 provider data requests: ${name}`, () => {
    it('creates an open request due one calendar month after it was received', async () => {
      const t = await setup();
      const made = await t.s.dataRequests.create(t.owner, request({ clientId: t.fx.ids.clients.a }));
      expect(made).toMatchObject({
        kind: 'access',
        clientId: t.fx.ids.clients.a,
        requester: 'A former member of staff',
        receivedAt: '2026-09-19T09:00:00.000Z',
        status: 'open',
        notes: 'Identity checked by phone.',
      });
      expect(made.dueAt).toBe(addMonths(new Date('2026-09-19T09:00:00.000Z'), 1).toISOString());
      expect(made.evidence).toBeUndefined();
      expect((await t.dump<DataRequest>('dataRequests')).map((r) => r.id)).toContain(made.id);
    });

    it('defaults the received date to the Clock time and allows a request with no client', async () => {
      const t = await setup();
      const made = await t.s.dataRequests.create(t.owner, request({ receivedAt: undefined }));
      expect(made.receivedAt).toBe(TODAY);
      expect(made.dueAt).toBe(addMonths(new Date(TODAY), 1).toISOString());
      expect(made.clientId).toBeUndefined();
    });

    it('refuses a blank requester and stores nothing', async () => {
      const t = await setup();
      for (const requester of ['', '   ']) {
        expect(await refusal(t.s.dataRequests.create(t.owner, request({ requester })))).toBeInstanceOf(
          ValidationError,
        );
      }
      expect(await t.dump<DataRequest>('dataRequests')).toHaveLength(0);
      expect(await audits(t.dump, 'dataRequest.create')).toHaveLength(0);
    });

    it('lists by due date ascending with whole days from the Clock, negative when overdue', async () => {
      const t = await setup();
      // Received 19 Sep is due exactly at the Clock time (19 Oct 09:00Z), 9 Sep is 10 days overdue.
      const today = await t.s.dataRequests.create(t.owner, request({ requester: 'Due now' }));
      const late = await t.s.dataRequests.create(
        t.owner,
        request({ requester: 'Overdue', receivedAt: '2026-09-09T09:00:00.000Z' }),
      );
      const later = await t.s.dataRequests.create(
        t.owner,
        request({ requester: 'Later', receivedAt: '2026-10-01T09:00:00.000Z' }),
      );
      const rows = await t.s.dataRequests.list(t.owner);
      expect(rows.map((r) => r.id)).toEqual([late.id, today.id, later.id]);
      expect(rows.map((r) => r.dueInDays)).toEqual([-10, 0, expect.any(Number)]);
      expect(rows[2]!.dueInDays).toBeGreaterThan(10);
      for (const r of rows) expect(Number.isInteger(r.dueInDays)).toBe(true);
    });

    it('lists the two seeded requests in due order with the overdue done one first', async () => {
      const t = await seededSetup();
      const rows = await t.s.dataRequests.list(t.owner);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.status).toBe('done');
      expect(rows[0]!.dueInDays).toBeLessThan(0);
      expect(rows[1]!.status).toBe('open');
      expect(rows[1]!.dueInDays).toBeGreaterThan(0);
    });

    it('completes an open request with evidence', async () => {
      const t = await setup();
      const made = await t.s.dataRequests.create(t.owner, request());
      const done = await t.s.dataRequests.complete(t.owner, made.id, { evidence: 'Export sent and confirmed.' });
      expect(done).toMatchObject({ id: made.id, status: 'done', evidence: 'Export sent and confirmed.' });
      const stored = (await t.dump<DataRequest>('dataRequests')).find((r) => r.id === made.id)!;
      expect(stored).toMatchObject({ status: 'done', evidence: 'Export sent and confirmed.' });
    });

    it('refuses to complete without evidence and leaves the request open', async () => {
      const t = await setup();
      const made = await t.s.dataRequests.create(t.owner, request());
      for (const evidence of ['', '   ']) {
        expect(await refusal(t.s.dataRequests.complete(t.owner, made.id, { evidence }))).toBeInstanceOf(
          ValidationError,
        );
      }
      const stored = (await t.dump<DataRequest>('dataRequests')).find((r) => r.id === made.id)!;
      expect(stored.status).toBe('open');
    });

    it('rejects an open request with a reason', async () => {
      const t = await setup();
      const made = await t.s.dataRequests.create(t.owner, request({ kind: 'erasure' }));
      const rejected = await t.s.dataRequests.reject(t.owner, made.id, { notes: 'Could not verify identity.' });
      expect(rejected.status).toBe('rejected');
      expect(rejected.notes).toContain('Could not verify identity.');
      const stored = (await t.dump<DataRequest>('dataRequests')).find((r) => r.id === made.id)!;
      expect(stored.status).toBe('rejected');
    });

    it('refuses to reject without a reason', async () => {
      const t = await setup();
      const made = await t.s.dataRequests.create(t.owner, request());
      expect(await refusal(t.s.dataRequests.reject(t.owner, made.id, { notes: '  ' }))).toBeInstanceOf(
        ValidationError,
      );
      expect((await t.dump<DataRequest>('dataRequests'))[0]!.status).toBe('open');
    });

    it('only lets an open request change', async () => {
      const t = await setup();
      const done = await t.s.dataRequests.create(t.owner, request({ requester: 'One' }));
      await t.s.dataRequests.complete(t.owner, done.id, { evidence: 'Done.' });
      const rejected = await t.s.dataRequests.create(t.owner, request({ requester: 'Two' }));
      await t.s.dataRequests.reject(t.owner, rejected.id, { notes: 'No.' });
      for (const id of [done.id, rejected.id]) {
        expect(await ruleOf(t.s.dataRequests.complete(t.owner, id, { evidence: 'Again' }))).toBe('notApplicable');
        expect(await ruleOf(t.s.dataRequests.reject(t.owner, id, { notes: 'Again' }))).toBe('notApplicable');
      }
      const stored = await t.dump<DataRequest>('dataRequests');
      expect(stored.find((r) => r.id === done.id)).toMatchObject({ status: 'done', evidence: 'Done.' });
      expect(stored.find((r) => r.id === rejected.id)!.status).toBe('rejected');
    });

    it('reports an unknown request id as not found', async () => {
      const t = await setup();
      expect(await refusal(t.s.dataRequests.complete(t.owner, freshId(79), { evidence: 'x' }))).toBeInstanceOf(
        NotFoundError,
      );
      expect(await refusal(t.s.dataRequests.reject(t.owner, freshId(79), { notes: 'x' }))).toBeInstanceOf(
        NotFoundError,
      );
    });

    it('audits each change with ids and kind or status only, never requester, notes or evidence', async () => {
      const t = await setup();
      const a = await t.s.dataRequests.create(
        t.owner,
        request({ requester: 'Secret Requester', notes: 'Secret notes', kind: 'erasure' }),
      );
      const b = await t.s.dataRequests.create(t.owner, request({ requester: 'Secret Requester' }));
      await t.s.dataRequests.complete(t.owner, a.id, { evidence: 'Secret evidence' });
      await t.s.dataRequests.reject(t.owner, b.id, { notes: 'Secret reason' });
      const created = await audits(t.dump, 'dataRequest.create');
      const completed = await audits(t.dump, 'dataRequest.complete');
      const rejected = await audits(t.dump, 'dataRequest.reject');
      expect(created).toHaveLength(2);
      expect(completed).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(completed[0]).toMatchObject({ actorId: t.u.provOwner, actorSide: 'provider', at: TODAY });
      expect(completed[0]!.target).toContain(a.id);
      expect(rejected[0]!.target).toContain(b.id);
      expect(JSON.stringify(created.find((e) => e.target.includes(a.id)))).toContain('erasure');
      for (const e of [...created, ...completed, ...rejected]) {
        expect(JSON.stringify(e)).not.toContain('Secret');
      }
    });

    it('denies a provider user without dataRequests.manage, and every customer actor, before validating', async () => {
      const t = await setup();
      const made = await t.s.dataRequests.create(t.owner, request());
      const before = await t.dump<DataRequest>('dataRequests');
      // Support holds incidents.post but not dataRequests.manage.
      for (const actor of [t.support, t.raj, t.priya, t.jade]) {
        expect(await refusal(t.s.dataRequests.list(actor))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.dataRequests.create(actor, request({ requester: '' })))).toBeInstanceOf(
          ForbiddenError,
        );
        expect(await refusal(t.s.dataRequests.create(actor, request()))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.dataRequests.complete(actor, made.id, { evidence: '' }))).toBeInstanceOf(
          ForbiddenError,
        );
        expect(await refusal(t.s.dataRequests.reject(actor, made.id, { notes: '' }))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.dataRequests.complete(actor, freshId(80), { evidence: 'x' }))).toBeInstanceOf(
          ForbiddenError,
        );
      }
      expect(await t.dump<DataRequest>('dataRequests')).toEqual(before);
      expect(await audits(t.dump, 'dataRequest.complete')).toHaveLength(0);
      expect(await audits(t.dump, 'dataRequest.reject')).toHaveLength(0);
    });
  });
}

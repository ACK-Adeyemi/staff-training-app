// Provider incident notices and the data request log (M4 chunk 14a, plan BP-12; brief 26.4 and 26.5). Each write is
// ONE batch with its audit event; time comes from the injected Clock. Audit entries hold ids, level, status and kind
// only: never titles, messages, requesters, notes or evidence.
import { addMonths, daysBetween, type DataRequest, type Incident } from '@sta/domain';
import { validate, type RawBackend } from './backend';
import { put } from './ops';
import { audit, beginCall, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type DataRequestsService,
  type IncidentsService,
  type StoreOptions,
} from './types';

export type ProviderIncidentsOperations = {
  incidents: IncidentsService;
  dataRequests: DataRequestsService;
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const LEVELS: readonly Incident['level'][] = ['normal', 'degraded', 'maintenance', 'incident'];
const STATUSES: readonly Incident['updates'][number]['status'][] = [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
];
const KINDS: readonly DataRequest['kind'][] = ['access', 'correction', 'erasure', 'other'];
const SEVERITY: Record<Incident['level'], number> = { normal: 0, degraded: 1, maintenance: 2, incident: 3 };
const byTime = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function createProviderIncidentsOperations(
  backend: RawBackend,
  options: StoreOptions,
): ProviderIncidentsOperations {
  async function providerCall(ctx: ActorContext, permission: string): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
    if (!holds(call, [permission])) return forbid('permission');
    return call;
  }

  const incidents: IncidentsService = {
    async list(ctx) {
      const call = await providerCall(ctx, 'incidents.post');
      const rows = await call.all<Incident>('incidents');
      return structuredClone([...rows].sort((a, b) => byTime(b.startedAt, a.startedAt) || byTime(b.id, a.id)));
    },

    async post(ctx, input) {
      const call = await providerCall(ctx, 'incidents.post');
      const title = text(input.title);
      const message = text(input.message);
      const status = input.status ?? 'investigating';
      const errors: string[] = [];
      if (title === '') errors.push('title: required');
      if (message === '') errors.push('message: required');
      if (!LEVELS.includes(input.level)) errors.push('level: choose a level');
      if (!STATUSES.includes(status)) errors.push('status: choose a status');
      if (errors.length > 0) throw new ValidationError(errors);
      const at = options.clock.now().toISOString();
      const made = validate('incidents', {
        id: call.newId(),
        level: input.level,
        title,
        updates: [{ status, message, at }],
        startedAt: at,
        ...(status === 'resolved' ? { resolvedAt: at } : {}),
      }) as Incident;
      await backend.apply([
        put('incidents', made),
        audit(call, undefined, 'incident.post', `incident:${made.id}`, undefined, {
          incidentId: made.id,
          level: made.level,
          status,
        }),
      ]);
      return structuredClone(made);
    },

    async update(ctx, id, input) {
      const call = await providerCall(ctx, 'incidents.post');
      const before = await call.find<Incident>('incidents', text(id));
      if (!before) throw new NotFoundError();
      const message = text(input.message);
      if (message === '') throw new ValidationError(['message: required']);
      if (!STATUSES.includes(input.status)) throw new ValidationError(['status: choose a status']);
      if (before.resolvedAt !== undefined) throw new RuleError('notApplicable');
      const at = options.clock.now().toISOString();
      const next = validate('incidents', {
        ...before,
        updates: [...before.updates, { status: input.status, message, at }],
        ...(input.status === 'resolved' ? { resolvedAt: at } : {}),
      }) as Incident;
      await backend.apply([
        put('incidents', next),
        audit(
          call,
          undefined,
          'incident.update',
          `incident:${next.id}`,
          { resolved: false },
          { incidentId: next.id, level: next.level, status: input.status },
        ),
      ]);
      return structuredClone(next);
    },

    async current(ctx) {
      const call = await beginCall(backend, options, ctx, { allowLimited: true });
      const open = (await call.all<Incident>('incidents')).filter((i) => i.resolvedAt === undefined);
      // Highest severity first, then the most recently started.
      const top = open.sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level] || byTime(b.startedAt, a.startedAt))[0];
      if (!top) return { level: 'normal' as const };
      const latest = top.updates.at(-1);
      return { level: top.level, title: top.title, ...(latest ? { message: latest.message } : {}) };
    },
  };

  const dataRequests: DataRequestsService = {
    async list(ctx) {
      const call = await providerCall(ctx, 'dataRequests.manage');
      const now = options.clock.now();
      const rows = [...(await call.all<DataRequest>('dataRequests'))].sort(
        (a, b) => byTime(a.dueAt, b.dueAt) || byTime(a.id, b.id),
      );
      return structuredClone(rows.map((r) => ({ ...r, dueInDays: daysBetween(now, new Date(r.dueAt)) })));
    },

    async create(ctx, input) {
      const call = await providerCall(ctx, 'dataRequests.manage');
      const requester = text(input.requester);
      const errors: string[] = [];
      if (requester === '') errors.push('requester: required');
      if (!KINDS.includes(input.kind)) errors.push('kind: choose a kind');
      const receivedAt = input.receivedAt ?? options.clock.now().toISOString();
      const received = new Date(receivedAt);
      if (Number.isNaN(received.getTime())) errors.push('receivedAt: not a date');
      if (errors.length > 0) throw new ValidationError(errors);
      const clientId = text(input.clientId);
      const made = validate('dataRequests', {
        id: call.newId(),
        ...(clientId !== '' ? { clientId } : {}),
        kind: input.kind,
        requester,
        receivedAt: received.toISOString(),
        dueAt: addMonths(received, 1).toISOString(),
        status: 'open',
        notes: text(input.notes),
      }) as DataRequest;
      await backend.apply([
        put('dataRequests', made),
        audit(call, made.clientId, 'dataRequest.create', `dataRequest:${made.id}`, undefined, {
          requestId: made.id,
          kind: made.kind,
          status: made.status,
        }),
      ]);
      return structuredClone(made);
    },

    async complete(ctx, id, input) {
      const call = await providerCall(ctx, 'dataRequests.manage');
      const before = await call.find<DataRequest>('dataRequests', text(id));
      if (!before) throw new NotFoundError();
      const evidence = text(input.evidence);
      if (evidence === '') throw new ValidationError(['evidence: required']);
      if (before.status !== 'open') throw new RuleError('notApplicable');
      const next = validate('dataRequests', { ...before, status: 'done', evidence }) as DataRequest;
      await backend.apply([
        put('dataRequests', next),
        audit(
          call,
          next.clientId,
          'dataRequest.complete',
          `dataRequest:${next.id}`,
          { status: before.status },
          { requestId: next.id, kind: next.kind, status: next.status },
        ),
      ]);
      return structuredClone(next);
    },

    async reject(ctx, id, input) {
      const call = await providerCall(ctx, 'dataRequests.manage');
      const before = await call.find<DataRequest>('dataRequests', text(id));
      if (!before) throw new NotFoundError();
      const reason = text(input.notes);
      if (reason === '') throw new ValidationError(['notes: required']);
      if (before.status !== 'open') throw new RuleError('notApplicable');
      const notes = before.notes === '' ? reason : `${before.notes}\n${reason}`;
      const next = validate('dataRequests', { ...before, status: 'rejected', notes }) as DataRequest;
      await backend.apply([
        put('dataRequests', next),
        audit(
          call,
          next.clientId,
          'dataRequest.reject',
          `dataRequest:${next.id}`,
          { status: before.status },
          { requestId: next.id, kind: next.kind, status: next.status },
        ),
      ]);
      return structuredClone(next);
    },
  };

  return { incidents, dataRequests };
}

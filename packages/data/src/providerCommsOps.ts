// Provider announcements, maintenance flags, the simulated link check and Learn more open counts (M4 chunk 8a, plan
// BP-5 and BP-12). Each write is ONE batch with its audit event. Audit entries hold ids, audiences and counts only,
// never announcement text. The link check makes no network request: it is a deterministic simulation.
import {
  announcementSchema,
  bannersFor,
  learnMoreCounts,
  maintenanceFlags,
  type Announcement,
  type LearningEvent,
  type LinkCheckResult,
  type MaintenanceApp,
  type MaintenanceWindow,
  type ReleaseNote,
  type Module,
  type Subscription,
} from '@sta/domain';
import { validate, type RawBackend, type SettingsRecord } from './backend';
import { put } from './ops';
import { audit, beginCall, forbid, holds, type Call } from './policy';
import {
  ValidationError,
  type ActorContext,
  type LearnMoreService,
  type LinkCheckService,
  type MaintenanceService,
  type ProviderCommsService,
  type ReleaseNotesService,
  type StoreOptions,
} from './types';

export type ProviderCommsOperations = {
  providerComms: ProviderCommsService;
  releaseNotes: ReleaseNotesService;
  maintenance: MaintenanceService;
  linkCheck: LinkCheckService;
  learnMore: LearnMoreService;
};

const APPS: readonly MaintenanceApp[] = ['staff', 'client', 'provider'];
/** A switched-on flag is a window with no practical end; switching it off removes the window. */
const FAR_FUTURE = '9999-12-31T23:59:59.000Z';
const KEY = 'maintenanceWindows';
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function createProviderCommsOperations(backend: RawBackend, options: StoreOptions): ProviderCommsOperations {
  async function providerCall(ctx: ActorContext, permission: string): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
    if (!holds(call, [permission])) return forbid('permission');
    return call;
  }

  async function windows(): Promise<MaintenanceWindow[]> {
    const rec = (await backend.get('settings', KEY)) as SettingsRecord | undefined;
    return Array.isArray(rec?.value) ? (rec.value as MaintenanceWindow[]) : [];
  }

  const providerComms: ProviderCommsService = {
    async listAnnouncements(ctx) {
      const call = await providerCall(ctx, 'comms.send');
      const rows = await call.all<Announcement>('announcements');
      return structuredClone(
        [...rows].sort((a, b) => (a.publishAt < b.publishAt ? 1 : a.publishAt > b.publishAt ? -1 : 0)),
      );
    },

    async createAnnouncement(ctx, input) {
      const call = await providerCall(ctx, 'comms.send');
      const title = text(input.title);
      const body = text(input.body);
      if (title === '') throw new ValidationError(['title: required']);
      const parsed = announcementSchema.safeParse({
        id: call.newId(),
        title,
        body,
        audience: input.audience,
        channels: input.channels,
        publishAt: input.publishAt,
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        createdBy: call.actor.user.id,
        reads: 0,
      });
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
      }
      const made = validate('announcements', parsed.data) as Announcement;
      await backend.apply([
        put('announcements', made),
        audit(call, undefined, 'announcement.create', `announcement:${made.id}`, undefined, {
          announcementId: made.id,
          audience: made.audience,
          channels: made.channels,
        }),
      ]);
      return structuredClone(made);
    },

    async banners(ctx) {
      const call = await beginCall(backend, options, ctx, { allowLimited: true });
      const client = call.actor.client;
      if (call.side === 'provider' || !client) return forbid('permission');
      const sub = (await call.all<Subscription>('subscriptions')).find((s) => s.clientId === client.id);
      const rows = await call.all<Announcement>('announcements');
      const side = call.side === 'staff' ? 'staff' : 'client';
      return structuredClone(
        bannersFor(
          rows,
          { clientId: client.id, packageId: sub?.packageId ?? client.packageId, packId: client.industryPackId, side },
          options.clock,
        ),
      );
    },
  };

  const releaseNotes: ReleaseNotesService = {
    async list(ctx) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
      const rows = await call.all<ReleaseNote>('releaseNotes');
      return structuredClone(
        [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1)),
      );
    },
  };

  const maintenance: MaintenanceService = {
    async set(ctx, input) {
      const call = await providerCall(ctx, 'ops.write');
      if (!APPS.includes(input.app) || typeof input.on !== 'boolean') {
        throw new ValidationError(['app: choose staff, client or provider']);
      }
      const others = (await windows()).filter((w) => !(w.apps.length === 1 && w.apps[0] === input.app));
      const next = input.on
        ? [
            ...others,
            {
              id: `maintenance-${input.app}`,
              apps: [input.app],
              startsAt: ctx.now,
              endsAt: FAR_FUTURE,
              message: '',
            },
          ]
        : others;
      const record: SettingsRecord = { key: KEY, value: next };
      await backend.apply([
        { type: 'put', store: 'settings', key: KEY, record },
        audit(call, undefined, 'maintenance.set', `maintenance:${input.app}`, undefined, {
          app: input.app,
          on: input.on,
        }),
      ]);
      return maintenanceFlags(next, options.clock);
    },

    async flags(ctx) {
      await beginCall(backend, options, ctx, { allowLimited: true });
      return maintenanceFlags(await windows(), options.clock);
    },
  };

  // ------------------------------------------------------------ simulated link check

  const latestPerLink = (rows: LinkCheckResult[]): Map<string, LinkCheckResult> => {
    const latest = new Map<string, LinkCheckResult>();
    for (const r of rows) {
      const cur = latest.get(r.linkId);
      if (!cur || r.checkedAt > cur.checkedAt || (r.checkedAt === cur.checkedAt && r.id > cur.id))
        latest.set(r.linkId, r);
    }
    return latest;
  };

  const linkCheck: LinkCheckService = {
    async run(ctx) {
      const call = await providerCall(ctx, 'content.write');
      const earlier = latestPerLink(await call.all<LinkCheckResult>('linkCheckResults'));
      const seen = new Set<string>();
      const found: { moduleId: string; linkId: string; url: string }[] = [];
      const modules = (await call.all<Module>('modules'))
        .filter((m) => m.owner === 'provider')
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const m of modules) {
        for (const q of m.questions) {
          for (const l of q.learnMore) {
            if (l.url === undefined || seen.has(`${m.id}/${l.id}`)) continue;
            seen.add(`${m.id}/${l.id}`);
            found.push({ moduleId: m.id, linkId: l.id, url: l.url });
          }
        }
      }
      // Simulation: a link already known to be broken stays broken; every other link is fine. No network request.
      const results = found.map((f) =>
        validate('linkCheckResults', {
          id: call.newId(),
          linkId: f.linkId,
          moduleId: f.moduleId,
          url: f.url,
          status: earlier.get(f.linkId)?.status === 'broken' ? 'broken' : 'ok',
          checkedAt: ctx.now,
        }),
      ) as LinkCheckResult[];
      const broken = results.filter((r) => r.status === 'broken');
      await backend.apply([
        ...results.map((r) => put('linkCheckResults', r)),
        audit(call, undefined, 'linkCheck.run', 'linkCheck', undefined, {
          checked: results.length,
          broken: broken.length,
          brokenLinkIds: broken.map((r) => r.linkId),
        }),
      ]);
      return structuredClone({ checkedAt: ctx.now, results, broken });
    },

    async last(ctx) {
      const call = await providerCall(ctx, 'content.write');
      const rows = [...latestPerLink(await call.all<LinkCheckResult>('linkCheckResults')).values()];
      const newest = rows.reduce((m, r) => (r.checkedAt > m ? r.checkedAt : m), '');
      return structuredClone(rows.filter((r) => r.checkedAt === newest));
    },
  };

  const learnMore: LearnMoreService = {
    async counts(ctx) {
      const call = await providerCall(ctx, 'content.write');
      return learnMoreCounts(await call.all<LearningEvent>('learningEvents'));
    },
  };

  return { providerComms, releaseNotes, maintenance, linkCheck, learnMore };
}

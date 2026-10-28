// M4 chunk 8a contract tests: provider announcements, maintenance flags, the simulated link check and Learn more open
// counts (plan docs/plans/m4.md chunk 8, BP-5 and BP-12). Written before the implementation, so the new services are
// described by local types:
//   - store.providerComms.listAnnouncements(ctx) and createAnnouncement(ctx, input) need comms.send. Creating one
//     writes an 'announcement.create' audit event holding ids and the audience only, never the title or body.
//   - store.providerComms.banners(ctx) is readable by any client or staff actor and returns the banner announcements
//     for that actor's own client and side (bannersFor over the Clock): scheduled and expired ones are left out.
//   - store.maintenance.set(ctx, { app, on }) needs ops.write and audits 'maintenance.set'; maintenance.flags(ctx) is
//     readable by every actor and returns maintenanceFlags over the stored windows and the Clock.
//   - store.linkCheck.run(ctx) (content.write) is simulated: no network request, it only reports the seeded broken link,
//     stores one linkCheckResults record per checked link at the Clock time and audits 'linkCheck.run'.
//     linkCheck.last(ctx) returns the stored results of the latest run.
//   - store.learnMore.counts(ctx) (content.write, provider only) returns learnMoreCounts over the learning events,
//     with no learner identity.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { packageIds } from '@sta/content';
import {
  createRng,
  fixedClock,
  learnMoreCounts,
  type Announcement,
  type AuditEvent,
  type LearningEvent,
  type LinkCheckResult,
  type MaintenanceApp,
} from '@sta/domain';
import { load } from '@sta/seed';
import { ForbiddenError, type ActorContext, type StoreHandle, type StoreOptions } from '../types';
import { refusal } from './learning';
import { buildWorld, SEED_VALUE, TODAY } from './world';

type NewAnnouncement = {
  title: string;
  body: string;
  audience: Announcement['audience'];
  channels: Announcement['channels'];
  publishAt: string;
  expiresAt?: string;
};
type ProviderCommsStore = {
  providerComms: {
    listAnnouncements(ctx: ActorContext): Promise<Announcement[]>;
    createAnnouncement(ctx: ActorContext, input: NewAnnouncement): Promise<Announcement>;
    banners(ctx: ActorContext): Promise<Announcement[]>;
  };
  maintenance: {
    set(ctx: ActorContext, input: { app: MaintenanceApp; on: boolean }): Promise<Record<MaintenanceApp, boolean>>;
    flags(ctx: ActorContext): Promise<Record<MaintenanceApp, boolean>>;
  };
  linkCheck: {
    run(ctx: ActorContext): Promise<{ checkedAt: string; results: LinkCheckResult[]; broken: LinkCheckResult[] }>;
    last(ctx: ActorContext): Promise<LinkCheckResult[]>;
  };
  learnMore: { counts(ctx: ActorContext): Promise<{ linkId: string; opens: number }[]> };
};

const HOUR = 3_600_000;
const at = (offsetHours: number): string => new Date(Date.parse(TODAY) + offsetHours * HOUR).toISOString();

export function runProviderCommsContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin);
    const s = handle.store as unknown as ProviderCommsStore;
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
      support: provider(u.support),
      owner: provider(u.provOwner),
      raj: provider(fx.keys.users['raj']),
    };
  }
  // buildWorld drops the seeded learning records and link results, so these tests load the plain seed.
  async function seededSetup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const keys = await load(handle.admin, { seedValue: SEED_VALUE, today: TODAY });
    const dump = async <T>(st: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[st] ?? [];
    return {
      s: handle.store as unknown as ProviderCommsStore,
      dump,
      u: keys.users,
      owner: { userId: keys.users['providerOwner'], side: 'provider', now: TODAY } as ActorContext,
    };
  }
  const audits = async (dump: <T>(n: string) => Promise<T[]>, action: string) =>
    (await dump<AuditEvent>('audit')).filter((e) => e.action === action);
  const input = (over: Partial<NewAnnouncement> = {}): NewAnnouncement => ({
    title: 'Sunday upgrade notice',
    body: 'Short pause on Sunday morning.',
    audience: { sides: ['staff', 'client'] },
    channels: ['banner'],
    publishAt: TODAY,
    ...over,
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe(`M4 provider comms: ${name}`, () => {
    it('shows an all-clients announcement as a banner to a client actor and a staff actor', async () => {
      const t = await setup();
      const made = await t.s.providerComms.createAnnouncement(t.support, input());
      expect(made).toMatchObject({ title: 'Sunday upgrade notice', createdBy: t.u.support, reads: 0 });
      expect((await t.s.providerComms.listAnnouncements(t.support)).map((a) => a.id)).toContain(made.id);
      expect((await t.s.providerComms.banners(t.priya)).map((a) => a.id)).toContain(made.id);
      expect((await t.s.providerComms.banners(t.jade)).map((a) => a.id)).toContain(made.id);
    });

    it('limits an announcement to the chosen client and leaves other clients without the banner', async () => {
      const t = await setup();
      const forB = await t.s.providerComms.createAnnouncement(
        t.support,
        input({ title: 'For B', audience: { clientIds: [t.fx.ids.clients.b], sides: ['staff', 'client'] } }),
      );
      const forA = await t.s.providerComms.createAnnouncement(
        t.support,
        input({ title: 'For A', audience: { clientIds: [t.fx.ids.clients.a], sides: ['staff', 'client'] } }),
      );
      for (const actor of [t.priya, t.jade]) {
        const ids = (await t.s.providerComms.banners(actor)).map((a) => a.id);
        expect(ids).toContain(forA.id);
        expect(ids).not.toContain(forB.id);
      }
    });

    it('limits an announcement by package', async () => {
      const t = await setup();
      const forGroup = await t.s.providerComms.createAnnouncement(
        t.support,
        input({ title: 'Group only', audience: { packageIds: [packageIds.group], sides: ['client'] } }),
      );
      const forStandard = await t.s.providerComms.createAnnouncement(
        t.support,
        input({ title: 'Standard only', audience: { packageIds: [packageIds.standard], sides: ['client'] } }),
      );
      const ids = (await t.s.providerComms.banners(t.priya)).map((a) => a.id);
      expect(ids).toContain(forStandard.id);
      expect(ids).not.toContain(forGroup.id);
    });

    it('leaves out a staff actor when the audience is client side only', async () => {
      const t = await setup();
      const made = await t.s.providerComms.createAnnouncement(t.support, input({ audience: { sides: ['client'] } }));
      expect((await t.s.providerComms.banners(t.priya)).map((a) => a.id)).toContain(made.id);
      expect((await t.s.providerComms.banners(t.jade)).map((a) => a.id)).not.toContain(made.id);
    });

    it('does not show a scheduled or expired announcement as a banner, using the Clock', async () => {
      const t = await setup();
      const later = await t.s.providerComms.createAnnouncement(t.support, input({ title: 'Later', publishAt: at(2) }));
      const live = await t.s.providerComms.createAnnouncement(
        t.support,
        input({ title: 'Live', publishAt: at(-2), expiresAt: at(2) }),
      );
      const over = await t.s.providerComms.createAnnouncement(
        t.support,
        input({ title: 'Over', publishAt: at(-5), expiresAt: at(-1) }),
      );
      const ids = (await t.s.providerComms.banners(t.priya)).map((a) => a.id);
      expect(ids).toContain(live.id);
      expect(ids).not.toContain(later.id);
      expect(ids).not.toContain(over.id);
    });

    it('does not show an announcement without the banner channel as a banner', async () => {
      const t = await setup();
      const made = await t.s.providerComms.createAnnouncement(t.support, input({ channels: ['email'] }));
      expect((await t.s.providerComms.banners(t.priya)).map((a) => a.id)).not.toContain(made.id);
    });

    it('shows the seeded live banner and not the seeded expired one', async () => {
      const t = await setup();
      const titles = (await t.s.providerComms.banners(t.priya)).map((a) => a.title);
      expect(titles).toContain('New module: Fire evacuation template');
      expect(titles).not.toContain('Planned maintenance on Sunday morning');
    });

    it('audits each announcement with ids and the audience only', async () => {
      const t = await setup();
      const made = await t.s.providerComms.createAnnouncement(
        t.support,
        input({
          title: 'Very private title',
          body: 'Very private body',
          audience: { clientIds: [t.fx.ids.clients.b], sides: ['client'] },
        }),
      );
      await t.s.providerComms.createAnnouncement(t.support, input());
      const events = await audits(t.dump, 'announcement.create');
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ actorId: t.u.support, actorSide: 'provider', at: TODAY });
      const text = JSON.stringify(events[0]);
      expect(text).toContain(made.id);
      expect(text).toContain(t.fx.ids.clients.b);
      expect(text).not.toContain('Very private');
    });

    it('denies a provider user without comms.send, and every customer actor, creating an announcement', async () => {
      const t = await setup();
      const before = await t.dump<Announcement>('announcements');
      for (const actor of [t.raj, t.priya, t.jade]) {
        expect(await refusal(t.s.providerComms.createAnnouncement(actor, input()))).toBeInstanceOf(ForbiddenError);
      }
      expect(await refusal(t.s.providerComms.listAnnouncements(t.priya))).toBeInstanceOf(ForbiddenError);
      expect(await t.dump<Announcement>('announcements')).toEqual(before);
      expect(await audits(t.dump, 'announcement.create')).toHaveLength(0);
    });

    it('starts with no maintenance flag on, then sets and clears one app at a time', async () => {
      const t = await setup();
      expect(await t.s.maintenance.flags(t.priya)).toEqual({ staff: false, client: false, provider: false });
      await t.s.maintenance.set(t.owner, { app: 'client', on: true });
      expect(await t.s.maintenance.flags(t.priya)).toEqual({ staff: false, client: true, provider: false });
      expect(await t.s.maintenance.flags(t.jade)).toEqual({ staff: false, client: true, provider: false });
      await t.s.maintenance.set(t.owner, { app: 'staff', on: true });
      await t.s.maintenance.set(t.owner, { app: 'provider', on: true });
      expect(await t.s.maintenance.flags(t.support)).toEqual({ staff: true, client: true, provider: true });
      await t.s.maintenance.set(t.owner, { app: 'client', on: false });
      expect(await t.s.maintenance.flags(t.priya)).toEqual({ staff: true, client: false, provider: true });
    });

    it('audits each maintenance change with the app and state only', async () => {
      const t = await setup();
      await t.s.maintenance.set(t.owner, { app: 'staff', on: true });
      await t.s.maintenance.set(t.owner, { app: 'staff', on: false });
      const events = await audits(t.dump, 'maintenance.set');
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ actorId: t.u.provOwner, actorSide: 'provider', at: TODAY });
      expect(JSON.stringify(events[0])).toContain('staff');
    });

    it('denies a provider user without ops.write, and every customer actor, changing maintenance', async () => {
      const t = await setup();
      for (const actor of [t.raj, t.priya, t.jade]) {
        expect(await refusal(t.s.maintenance.set(actor, { app: 'client', on: true }))).toBeInstanceOf(ForbiddenError);
      }
      expect(await t.s.maintenance.flags(t.priya)).toEqual({ staff: false, client: false, provider: false });
      expect(await audits(t.dump, 'maintenance.set')).toHaveLength(0);
    });

    it('link check reports only the seeded broken link, stores results and audits, without any network request', async () => {
      const t = await seededSetup();
      const fetchSpy = vi.fn(() => Promise.reject(new Error('network is not allowed')));
      vi.stubGlobal('fetch', fetchSpy);
      const seededBroken = (await t.dump<LinkCheckResult>('linkCheckResults')).filter((r) => r.status === 'broken');
      expect(seededBroken).toHaveLength(1);
      const run = await t.s.linkCheck.run(t.owner);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(run.checkedAt).toBe(TODAY);
      expect(run.results.length).toBeGreaterThanOrEqual(6);
      expect(run.broken.map((r) => r.linkId)).toEqual([seededBroken[0]!.linkId]);
      expect(run.results.filter((r) => r.status === 'broken')).toHaveLength(1);
      const stored = (await t.dump<LinkCheckResult>('linkCheckResults')).filter((r) => r.checkedAt === TODAY);
      expect(stored.length).toBe(run.results.length);
      expect(stored.filter((r) => r.status === 'broken').map((r) => r.linkId)).toEqual([seededBroken[0]!.linkId]);
      expect((await t.s.linkCheck.last(t.owner)).map((r) => r.id).sort()).toEqual(run.results.map((r) => r.id).sort());
      const [event] = await audits(t.dump, 'linkCheck.run');
      expect(event).toMatchObject({ actorId: t.u['providerOwner'], actorSide: 'provider', at: TODAY });
    });

    it('link check gives the same answer when run twice', async () => {
      const t = await seededSetup();
      const first = await t.s.linkCheck.run(t.owner);
      const second = await t.s.linkCheck.run(t.owner);
      const shape = (rs: LinkCheckResult[]) => rs.map((r) => `${r.linkId}:${r.status}`).sort();
      expect(shape(second.results)).toEqual(shape(first.results));
      expect(await audits(t.dump, 'linkCheck.run')).toHaveLength(2);
    });

    it('denies a provider user without content.write, and every customer actor, running the link check', async () => {
      const t = await setup();
      const before = await t.dump<LinkCheckResult>('linkCheckResults');
      for (const actor of [t.raj, t.priya, t.jade]) {
        expect(await refusal(t.s.linkCheck.run(actor))).toBeInstanceOf(ForbiddenError);
      }
      expect(await t.dump<LinkCheckResult>('linkCheckResults')).toEqual(before);
      expect(await audits(t.dump, 'linkCheck.run')).toHaveLength(0);
    });

    it('Learn more open counts equal the seeded open events and carry no learner identity', async () => {
      // buildWorld drops the seeded learning records, so this test loads the plain seed.
      const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
      const keys = await load(handle.admin, { seedValue: SEED_VALUE, today: TODAY });
      const s = handle.store as unknown as ProviderCommsStore;
      const events = ((await handle.admin.dumpAll()) as unknown as { learningEvents: LearningEvent[] }).learningEvents;
      const expected = learnMoreCounts(events);
      expect(expected.length).toBeGreaterThan(0);
      const counts = await s.learnMore.counts({ userId: keys.users['providerOwner'], side: 'provider', now: TODAY });
      expect(counts).toEqual(expected);
      const text = JSON.stringify(counts);
      for (const e of events.filter((x) => x.type === 'learnMoreOpened').slice(0, 20)) {
        expect(text).not.toContain(e.personId);
      }
      expect(Object.keys(counts[0]!).sort()).toEqual(['linkId', 'opens']);
    });

    it('restricts Learn more open counts to a provider user who may read content', async () => {
      const t = await setup();
      for (const actor of [t.priya, t.jade]) {
        expect(await refusal(t.s.learnMore.counts(actor))).toBeInstanceOf(ForbiddenError);
      }
    });
  });
}

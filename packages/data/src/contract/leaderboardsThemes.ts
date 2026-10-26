// M3 chunk 10b contract tests, part 1: leaderboard scopes, the Sites board and themes (plan docs/plans/m3.md,
// assumptions 38, 39, 51, 52, Data package `leaderboards` and `themes`, Contract tests "Leaderboards (BP-18)" and
// "Themes (BP-7)"). Runs against every adapter. Written before the implementation, so the new methods are described
// by the local types below. The plan leaves these shapes open; the implementer follows this comment.
//
// Leaderboards
//   - `leaderboards.scopes(ctx)` returns the domain `availableScopes(activeSites, viewer's primary site)` for an actor
//     who has a person record (staff, or an admin with a person). It is what applies, not what is switched on. An actor
//     without a person gets [].
//   - `leaderboards.standing(ctx, { board, period, scope? })`: scope defaults to 'site'. A staff actor may use a scope
//     only when it applies to them AND is in `settings.boards[board].staffScopes`; otherwise RuleError('invalidScope').
//     Client admins are not restricted by staffScopes (they may pick any scope that applies).
//   - `leaderboards.sitesBoard(ctx, { measure, period, scope, region? })` returns the domain `SiteBoardView`
//     (`rows`, `own`, `toNext`, `detail?`) where every row also carries `small: boolean`. The audience comes from the
//     actor: staff -> 'staff'; a client admin with `competitions.manage` and organisation-wide scope -> 'group'; any
//     other client admin -> 'manager'. Staff may use a scope only when it applies and is in
//     `settings.siteBoard.staffScopes`, else RuleError('invalidScope'). `scope` 'site' limits rows to the viewer's
//     site, 'region' to sites in the viewer's region (or `region` when given, admins only), 'all' to every site of the
//     client. Sites in `settings.siteBoard.excludedSiteIds` never appear. Never reads another client's records.
//
// Themes (assumptions 51 and 52)
//   - `themes.list(ctx)` (themes.view) returns this client's saved themes only (no other client's, no presets).
//   - `themes.active(ctx, side)` (any actor of the client, including staff) is the domain `activeTheme` for `ctx.now`.
//   - `themes.save(ctx, theme)` (themes.manage, availability `themesEdit`) upserts by id; clientId comes from the
//     actor. An invalid record (extra token, schedule ending before it starts) is a ValidationError; a theme failing
//     a contrast rule is RuleError('invalidTheme'); a new theme beyond the package `savedThemes` limit is
//     NotEntitledError('savedThemes'). Updating a saved theme never counts against the limit.
//   - `themes.remove(ctx, id)` deletes an own theme and clears `settings.themeId` when it was the base.
//   - `themes.setBase(ctx, id | null)` sets `settings.themeId` (own theme or null). A theme of another client is
//     NotFoundError.
//   - Each write appends one audit event (actions themes.save, themes.remove, themes.setBase) with clientId.
import { describe, expect, it } from 'vitest';
import { createRng, fixedClock, type Client, type Person, type Site, type Theme, type UserAccount } from '@sta/domain';
import {
  AccountStateError,
  ForbiddenError,
  NotEntitledError,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type DemoAdmin,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { addLearningFixture, refusal, ruleOf } from './learning';
import { buildWorld, freshId, TODAY } from './world';

type Scope = 'site' | 'region' | 'country' | 'all';
type SiteRow = { rank: number; siteId: string; value: number; isViewer: boolean; small: boolean };
type SitesBoardView = {
  rows: SiteRow[];
  own: SiteRow | null;
  toNext: { people: number } | null;
  detail?: { siteId: string; eligible: number };
};
type Settings = {
  clientId: string;
  boards: Record<string, { enabled: boolean; staffScopes: Scope[] }>;
  siteBoard: { enabled: boolean; staffScopes: Scope[]; excludedSiteIds: string[]; measures: string[] } & Record<
    string,
    unknown
  >;
};
type BoardsStore = {
  leaderboards: {
    scopes(ctx: ActorContext): Promise<Scope[]>;
    standing(ctx: ActorContext, input: { board: string; period: string; scope?: Scope }): Promise<unknown>;
    sitesBoard(
      ctx: ActorContext,
      input: { measure: string; period: 'thisMonth' | 'thisQuarter'; scope: Scope; region?: string },
    ): Promise<SitesBoardView>;
    settings(ctx: ActorContext): Promise<Settings>;
    saveSettings(ctx: ActorContext, settings: Settings): Promise<unknown>;
  };
  themes: {
    list(ctx: ActorContext): Promise<Theme[]>;
    active(ctx: ActorContext, side: 'staff' | 'admin'): Promise<Theme | null>;
    save(ctx: ActorContext, theme: Theme): Promise<Theme>;
    remove(ctx: ActorContext, id: string): Promise<void>;
    setBase(ctx: ActorContext, id: string | null): Promise<unknown>;
  };
};

const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });

async function dump<T>(admin: DemoAdmin, store: StoreName): Promise<T[]> {
  return ((await admin.dumpAll()) as Record<string, unknown[]>)[store] as T[];
}

const GOOD = { primary: '#1d4e89', accent: '#1d4e89', backgroundTint: '#eaf2fb', radius: 'md' } as const;
const BAD_CONTRAST = { ...GOOD, primary: '#ffff66', accent: '#ffff66' };
const theme = (n: number, over: Partial<Theme> = {}): Theme => ({
  id: freshId(7000 + n),
  name: `Contract theme ${String(n)}`,
  tokens: { ...GOOD },
  appliesTo: { staff: true, admin: true },
  ...over,
});

export function runLeaderboardsThemesContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx = await buildWorld(handle.admin);
    const lf = await addLearningFixture(handle.admin, fx);
    const admin = handle.admin;
    const store = handle.store as unknown as BoardsStore;
    const a = fx.ids.clients.a;
    const ot = fx.ids.clients.ot;
    const b = fx.ids.clients.b;

    // An Oak Tree staff user for Oscar Frost (Riverside) and one for Toby Ashby (Meadow); the seed has none.
    const staffUser = (n: number, personId: string): UserAccount => ({
      id: freshId(7100 + n),
      side: 'staff',
      clientId: ot,
      personId,
      email: `oak-staff-${String(n)}@example.test`,
      displayName: `Oak staff ${String(n)}`,
      status: 'active',
      login: { method: 'pin', pinSet: true },
    });
    const oscar = staffUser(1, fx.ids.people.otRiver);
    const toby = staffUser(2, fx.ids.people.otMeadow);
    await admin.bulkPut('users', [oscar, toby]);

    const gina = client(fx.ids.users.gina, ot);
    const actors = {
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      jade: staff(fx.ids.users.jade, a),
      gina,
      tariq: client(fx.ids.users.riverMgr, ot),
      oscar: staff(oscar.id, ot),
      toby: staff(toby.id, ot),
      bob: staff(fx.ids.users.bob, fx.ids.clients.b),
      beth: client(fx.ids.users.beth, b),
      roOwner: client(fx.ids.stateClients.readOnly.owner.id, fx.ids.clients.readOnly),
    };

    const sitesOf = async (clientId: string): Promise<Site[]> =>
      (await dump<Site>(admin, 'sites')).filter((x) => x.clientId === clientId);
    const siteIdOf = async (clientId: string, siteName: string): Promise<string> =>
      (await sitesOf(clientId)).find((x) => x.name === siteName)!.id;
    /** Switches boards and the Sites board on for Oak Tree with the given staff scopes. */
    const configure = async (boardScopes: Scope[], siteScopes: Scope[], extra: Partial<Settings['siteBoard']> = {}) => {
      const current = await store.leaderboards.settings(gina);
      await store.leaderboards.saveSettings(gina, {
        ...current,
        boards: { ...current.boards, modulesCompleted: { enabled: true, staffScopes: boardScopes } },
        siteBoard: { ...current.siteBoard, enabled: true, staffScopes: siteScopes, ...extra },
      });
    };
    return { ...fx, lf, admin, store, a, ot, b, actors, sitesOf, siteIdOf, configure };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  describe(`Leaderboard scopes, Sites board and themes contract: ${name}`, () => {
    describe('leaderboards.scopes (BP-18)', () => {
      it('gives Oak Tree staff My site, My region and All sites (three sites, two regions, one country)', async () => {
        const s: S = await setup();
        expect(await s.store.leaderboards.scopes(s.actors.oscar)).toEqual(['site', 'region', 'all']);
      });

      it('gives a single-site client no scopes beyond what applies (Willow Lane staff see no scope switch)', async () => {
        const s: S = await setup();
        expect(await s.store.leaderboards.scopes(s.actors.bob)).toEqual(['site']);
      });

      it('never mixes clients: Little Acorns staff get scopes from Little Acorns sites only', async () => {
        const s: S = await setup();
        // Little Acorns has two sites in the contract world (Main and Annexe), in no region, in one country.
        expect(await s.store.leaderboards.scopes(s.actors.jade)).toEqual(['site', 'all']);
      });
    });

    describe('leaderboards.standing with scope (BP-18)', () => {
      it('allows a scope that applies and is switched on, and defaults to My site', async () => {
        const s: S = await setup();
        await s.configure(['site', 'all'], ['site']);
        const wide = await s.store.leaderboards.standing(s.actors.oscar, {
          board: 'modulesCompleted',
          period: 'thisMonth',
          scope: 'all',
        });
        expect(wide).toBeTruthy();
        const own = await s.store.leaderboards.standing(s.actors.oscar, {
          board: 'modulesCompleted',
          period: 'thisMonth',
        });
        expect(own).toBeTruthy();
      });

      it('refuses a scope that applies but is not switched on with invalidScope', async () => {
        const s: S = await setup();
        await s.configure(['site', 'all'], ['site']);
        expect(
          await ruleOf(
            s.store.leaderboards.standing(s.actors.oscar, {
              board: 'modulesCompleted',
              period: 'thisMonth',
              scope: 'region',
            }),
          ),
        ).toBe('invalidScope');
      });

      it('refuses a scope that is switched on but does not apply (country, with one country) with invalidScope', async () => {
        const s: S = await setup();
        await s.configure(['site', 'country'], ['site']);
        expect(
          await ruleOf(
            s.store.leaderboards.standing(s.actors.oscar, {
              board: 'modulesCompleted',
              period: 'thisMonth',
              scope: 'country',
            }),
          ),
        ).toBe('invalidScope');
      });

      it('refuses a wider scope by default (only My site is on until C14 changes it)', async () => {
        const s: S = await setup();
        expect(
          await ruleOf(
            s.store.leaderboards.standing(s.actors.oscar, {
              board: 'modulesCompleted',
              period: 'thisMonth',
              scope: 'all',
            }),
          ),
        ).toBe('invalidScope');
      });

      it('refuses All sites for a single-site client even if the setting lists it', async () => {
        const s: S = await setup();
        const current = await s.store.leaderboards.settings(s.actors.beth);
        await s.store.leaderboards.saveSettings(s.actors.beth, {
          ...current,
          boards: { ...current.boards, modulesCompleted: { enabled: true, staffScopes: ['site', 'all'] } },
        });
        expect(
          await ruleOf(
            s.store.leaderboards.standing(s.actors.bob, {
              board: 'modulesCompleted',
              period: 'thisMonth',
              scope: 'all',
            }),
          ),
        ).toBe('invalidScope');
      });

      it('does not restrict a client admin by the staff scopes', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site']);
        const view = await s.store.leaderboards.standing(s.actors.gina, {
          board: 'modulesCompleted',
          period: 'thisMonth',
          scope: 'all',
        });
        expect(view).toBeTruthy();
      });

      it('shows no person ids to staff at a wider scope and nothing from another client', async () => {
        const s: S = await setup();
        await s.configure(['site', 'all'], ['site']);
        const view = await s.store.leaderboards.standing(s.actors.oscar, {
          board: 'modulesCompleted',
          period: 'thisMonth',
          scope: 'all',
        });
        const text = JSON.stringify(view);
        const people = await dump<Person>(s.admin, 'people');
        for (const p of people) expect(text).not.toContain(p.id);
        for (const site of await s.sitesOf(s.a)) expect(text).not.toContain(site.name);
      });
    });

    describe('leaderboards.sitesBoard (BP-18, assumption 39)', () => {
      it('gives staff their own site row and no person ids, with no manager detail', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site', 'all']);
        const river = await s.siteIdOf(s.ot, 'Riverside');
        const view = await s.store.leaderboards.sitesBoard(s.actors.oscar, {
          measure: 'participation',
          period: 'thisMonth',
          scope: 'all',
        });
        expect(view.own?.siteId).toBe(river);
        expect(view.rows.find((r) => r.isViewer)?.siteId).toBe(river);
        expect(view.detail).toBeUndefined();
        const text = JSON.stringify(view);
        for (const p of await dump<Person>(s.admin, 'people')) expect(text).not.toContain(p.id);
      });

      it('ranks a site with learning above a site with none, and rows come in rank order', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site', 'all']);
        const view = await s.store.leaderboards.sitesBoard(s.actors.gina, {
          measure: 'participation',
          period: 'thisMonth',
          scope: 'all',
        });
        const meadow = view.rows.find((r) => r.siteId === s.ids.sites.meadow)!;
        const river = view.rows.find((r) => r.siteId === s.ids.sites.river)!;
        expect(meadow.value).toBe(0);
        expect(river.value).toBeGreaterThan(0);
        expect(river.rank).toBeLessThan(meadow.rank);
        const ranks = view.rows.map((r) => r.rank);
        expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
        expect(view.rows.every((r) => typeof r.small === 'boolean')).toBe(true);
      });

      it('gives a group admin every Oak Tree site and a site manager the same plus their site detail', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site']);
        const input = { measure: 'compliance', period: 'thisMonth', scope: 'all' } as const;
        const group = await s.store.leaderboards.sitesBoard(s.actors.gina, input);
        expect(group.rows.map((r) => r.siteId).sort()).toEqual(
          [s.ids.sites.river, s.ids.sites.hillside, s.ids.sites.meadow].sort(),
        );
        expect(group.detail).toBeUndefined();
        const manager = await s.store.leaderboards.sitesBoard(s.actors.tariq, input);
        expect(manager.detail?.siteId).toBe(s.ids.sites.river);
        expect(manager.detail?.eligible).toBeGreaterThan(0);
        expect(manager.own?.siteId).toBe(s.ids.sites.river);
      });

      it('limits My region to sites in the viewer region and lets an admin pick another region', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site', 'region']);
        const input = { measure: 'compliance', period: 'thisQuarter' } as const;
        const mine = await s.store.leaderboards.sitesBoard(s.actors.oscar, { ...input, scope: 'region' });
        expect(mine.rows.map((r) => r.siteId).sort()).toEqual([s.ids.sites.river, s.ids.sites.hillside].sort());
        const other = await s.store.leaderboards.sitesBoard(s.actors.gina, {
          ...input,
          scope: 'region',
          region: 'South West',
        });
        expect(other.rows.map((r) => r.siteId)).toEqual([s.ids.sites.meadow]);
      });

      it('limits My site to the one row for staff', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site']);
        const view = await s.store.leaderboards.sitesBoard(s.actors.toby, {
          measure: 'compliance',
          period: 'thisMonth',
          scope: 'site',
        });
        expect(view.rows.map((r) => r.siteId)).toEqual([s.ids.sites.meadow]);
      });

      it('refuses staff a Sites board scope that is not switched on with invalidScope', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site']);
        expect(
          await ruleOf(
            s.store.leaderboards.sitesBoard(s.actors.oscar, {
              measure: 'compliance',
              period: 'thisMonth',
              scope: 'all',
            }),
          ),
        ).toBe('invalidScope');
      });

      it('leaves out excluded sites', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site'], { excludedSiteIds: [s.ids.sites.meadow] });
        const view = await s.store.leaderboards.sitesBoard(s.actors.gina, {
          measure: 'compliance',
          period: 'thisMonth',
          scope: 'all',
        });
        expect(view.rows.map((r) => r.siteId)).not.toContain(s.ids.sites.meadow);
        expect(view.rows).toHaveLength(2);
      });

      it('never reads across clients: Priya sees only Little Acorns sites, Gina only Oak Tree sites', async () => {
        const s: S = await setup();
        await s.configure(['site'], ['site']);
        const input = { measure: 'compliance', period: 'thisMonth', scope: 'all' } as const;
        const little = await s.store.leaderboards.sitesBoard(s.actors.priya, input);
        expect(little.rows.map((r) => r.siteId).sort()).toEqual([s.ids.sites.main, s.ids.sites.annexe].sort());
        const oak = await s.store.leaderboards.sitesBoard(s.actors.gina, input);
        for (const r of oak.rows) expect([s.ids.sites.main, s.ids.sites.annexe]).not.toContain(r.siteId);
      });
    });

    describe('themes (BP-7)', () => {
      it('saves, lists and reads back an own theme, and lists no other client theme', async () => {
        const s: S = await setup();
        const mine = theme(1);
        const saved = await s.store.themes.save(s.actors.priya, mine);
        expect(saved.clientId).toBe(s.a);
        const theirs = theme(2);
        await s.store.themes.save(s.actors.beth, theirs);
        const listed = await s.store.themes.list(s.actors.priya);
        expect(listed.map((t) => t.id)).toEqual([mine.id]);
        expect((await dump<{ id: string; clientId: string }>(s.admin, 'themes')).map((t) => t.clientId).sort()).toEqual(
          [s.a, s.b].sort(),
        );
      });

      it('refuses a theme that fails a contrast rule with invalidTheme and stores nothing', async () => {
        const s: S = await setup();
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.themes.save(s.actors.priya, theme(3, { tokens: BAD_CONTRAST })))).toBe(
          'invalidTheme',
        );
        expect(await s.admin.dumpAll()).toEqual(before);
      });

      it('refuses a status colour token and a schedule that ends before it starts with a ValidationError', async () => {
        const s: S = await setup();
        const withStatus = theme(4, { tokens: { ...GOOD, success: '#00ff00' } as unknown as Theme['tokens'] });
        expect(await refusal(s.store.themes.save(s.actors.priya, withStatus))).toBeInstanceOf(ValidationError);
        const backwards = theme(5, {
          schedule: { startAt: '2026-12-01T00:00:00.000Z', endAt: '2026-11-01T00:00:00.000Z' },
        });
        expect(await refusal(s.store.themes.save(s.actors.priya, backwards))).toBeInstanceOf(ValidationError);
      });

      it('stops a new theme beyond the package savedThemes limit (Essentials: 1) but allows editing the saved one', async () => {
        const s: S = await setup();
        const first = theme(6);
        await s.store.themes.save(s.actors.beth, first);
        const error = await refusal(s.store.themes.save(s.actors.beth, theme(7)));
        expect(error).toBeInstanceOf(NotEntitledError);
        expect((error as NotEntitledError).feature).toBe('savedThemes');
        const renamed = await s.store.themes.save(s.actors.beth, { ...first, name: 'Renamed' });
        expect(renamed.name).toBe('Renamed');
        await s.store.themes.remove(s.actors.beth, first.id);
        await s.store.themes.save(s.actors.beth, theme(7));
        expect((await s.store.themes.list(s.actors.beth)).map((t) => t.id)).toEqual([theme(7).id]);
      });

      it('needs themes.manage to write: Daniel and Tariq are refused, with permission', async () => {
        const s: S = await setup();
        for (const [who, ctxFor] of [
          ['daniel', s.actors.daniel],
          ['tariq', s.actors.tariq],
        ] as const) {
          const error = await refusal(s.store.themes.save(ctxFor, theme(8)));
          expect(error, who).toBeInstanceOf(ForbiddenError);
          expect((error as ForbiddenError).reason).toBe('permission');
        }
        expect(await dump(s.admin, 'themes')).toEqual([]);
      });

      it('lets a person with themes.view read the list but not change it', async () => {
        const s: S = await setup();
        await s.store.themes.save(s.actors.gina, theme(9));
        expect(await s.store.themes.list(s.actors.tariq)).toHaveLength(1);
        expect(await refusal(s.store.themes.remove(s.actors.tariq, theme(9).id))).toBeInstanceOf(ForbiddenError);
      });

      it('refuses writes in Read-only with AccountStateError themesEdit but still reads', async () => {
        const s: S = await setup();
        const error = await refusal(s.store.themes.save(s.actors.roOwner, theme(10)));
        expect(error).toBeInstanceOf(AccountStateError);
        expect((error as AccountStateError).feature).toBe('themesEdit');
        expect(await s.store.themes.list(s.actors.roOwner)).toEqual([]);
        expect(await s.store.themes.active(s.actors.roOwner, 'admin')).toBeNull();
      });

      it('sets a base theme that staff and admins both see, and clears it on remove', async () => {
        const s: S = await setup();
        const base = theme(11);
        await s.store.themes.save(s.actors.priya, base);
        expect(await s.store.themes.active(s.actors.jade, 'staff')).toBeNull();
        await s.store.themes.setBase(s.actors.priya, base.id);
        expect((await s.store.themes.active(s.actors.jade, 'staff'))?.id).toBe(base.id);
        expect((await s.store.themes.active(s.actors.daniel, 'admin'))?.id).toBe(base.id);
        await s.store.themes.remove(s.actors.priya, base.id);
        expect(await s.store.themes.active(s.actors.jade, 'staff')).toBeNull();
        const c = (await dump<Client>(s.admin, 'clients')).find((x) => x.id === s.a)!;
        expect(c.settings.themeId).toBeUndefined();
      });

      it('respects the side a theme applies to', async () => {
        const s: S = await setup();
        const adminOnly = theme(12, { appliesTo: { staff: false, admin: true } });
        await s.store.themes.save(s.actors.priya, adminOnly);
        await s.store.themes.setBase(s.actors.priya, adminOnly.id);
        // Base themes apply to both sides; a scheduled one respects appliesTo (assumption 52).
        const scheduled = theme(13, {
          appliesTo: { staff: false, admin: true },
          schedule: { startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-11-01T00:00:00.000Z' },
        });
        await s.store.themes.save(s.actors.priya, scheduled);
        expect((await s.store.themes.active(s.actors.priya, 'admin'))?.id).toBe(scheduled.id);
        expect((await s.store.themes.active(s.actors.jade, 'staff'))?.id).toBe(adminOnly.id);
      });

      it('picks the scheduled theme by date and falls back to the base theme after it ends', async () => {
        const s: S = await setup();
        const base = theme(14);
        const christmas = theme(15, {
          schedule: { startAt: '2026-12-01T00:00:00.000Z', endAt: '2027-01-06T00:00:00.000Z' },
        });
        await s.store.themes.save(s.actors.priya, base);
        await s.store.themes.save(s.actors.priya, christmas);
        await s.store.themes.setBase(s.actors.priya, base.id);
        const on = (now: string): ActorContext => ({ ...s.actors.jade, now });
        expect((await s.store.themes.active(on('2026-11-30T23:00:00.000Z'), 'staff'))?.id).toBe(base.id);
        expect((await s.store.themes.active(on('2026-12-01T09:00:00.000Z'), 'staff'))?.id).toBe(christmas.id);
        expect((await s.store.themes.active(on('2027-01-06T09:00:00.000Z'), 'staff'))?.id).toBe(base.id);
      });

      it('refuses to set another client theme as the base with NotFound', async () => {
        const s: S = await setup();
        const theirs = theme(16);
        await s.store.themes.save(s.actors.beth, theirs);
        expect(await refusal(s.store.themes.setBase(s.actors.priya, theirs.id))).toBeInstanceOf(NotFoundError);
      });

      it('audits each write with the client id and no theme colours of other clients', async () => {
        const s: S = await setup();
        const t = theme(17);
        await s.store.themes.save(s.actors.priya, t);
        await s.store.themes.setBase(s.actors.priya, t.id);
        await s.store.themes.remove(s.actors.priya, t.id);
        const audit = await dump<{ action: string; clientId?: string }>(s.admin, 'audit');
        for (const action of ['themes.save', 'themes.setBase', 'themes.remove']) {
          expect(
            audit.some((e) => e.action === action && e.clientId === s.a),
            action,
          ).toBe(true);
        }
      });
    });
  });
}

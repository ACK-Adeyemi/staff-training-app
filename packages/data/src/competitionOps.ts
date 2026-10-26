// Operations for competitions and standing leaderboards (M2 chunk 9; plan Design > Data package).
// Standings are computed here, from all of the client's records through internal reads, then reduced to a projection
// before returning. Staff never receive another person's id, events, attempts, XP, prefs or notes (M0 assumption 9).
// Business rules (metrics, ranking, winners, builder rules) live in @sta/domain.
import {
  adminLeaderboardView,
  boardIdSchema,
  checkLimit,
  competitionMetric,
  competitionStatus,
  defaultBoardSettings,
  displayName,
  entitled,
  featureAvailability,
  isEligible,
  leaderboardView,
  rankEntries,
  selectWinners,
  standingBoard,
  standingBoardSettingsSchema,
  validateCompetition,
  winnerNames,
  type Assignment,
  type Attempt,
  type Competition,
  type Entry,
  type Evidence,
  type LearningEvent,
  type MetricResult,
  type Module,
  type Person,
  type Ranked,
  type Requirement,
  type Site,
  type StandingBoardSettings,
  type Target,
  type Team,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, canAny, checkAccountState, clientEntitlements, forbid, holds, type Call } from './policy';
import { put, staffCall } from './ops';
import {
  AccountStateError,
  NotEntitledError,
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type BoardView,
  type CompetitionsService,
  type LeaderboardsService,
  type StandingsView,
  type StoreOptions,
} from './types';

export type CompetitionOperations = { competitions: CompetitionsService; leaderboards: LeaderboardsService };

const BOARD_PERIODS: Record<string, readonly string[]> = {
  teamBoard: ['thisMonth', 'thisQuarter'],
  default: ['allTime', 'thisMonth'],
};

type Data = {
  people: Person[];
  teams: Team[];
  events: LearningEvent[];
  attempts: Attempt[];
  assignments: Assignment[];
  evidence: Evidence[];
  requirements: Requirement[];
  modules: Module[];
};

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Everything the metrics need for one client, read internally (never handed to the caller). */
async function gather(call: Call, clientId: string): Promise<Data> {
  const mine = <T extends { clientId?: string }>(rows: T[]): T[] => rows.filter((r) => r.clientId === clientId);
  return {
    people: mine(await call.all<Person>('people')),
    teams: mine(await call.all<Team>('teams')),
    events: mine(await call.all<LearningEvent>('learningEvents')),
    attempts: mine(await call.all<Attempt>('attempts')),
    assignments: mine(await call.all<Assignment>('assignments')),
    evidence: mine(await call.all<Evidence>('evidence')),
    requirements: (await call.all<Requirement>('requirements')).filter(
      (r) => r.clientId === undefined || r.clientId === clientId,
    ),
    modules: (await call.all<Module>('modules')).filter(
      (m) => m.status === 'published' && (m.owner === 'provider' || m.owner.clientId === clientId),
    ),
  };
}

/** The ranked unit names and the people hidden from rankings, for a metric result. */
function entriesOf(result: MetricResult, data: Data, siteNames: ReadonlyMap<string, string>) {
  const names = new Map<string, string>();
  if (result.unit === 'person') for (const p of data.people) names.set(p.id, displayName(p));
  else if (result.unit === 'team') for (const t of data.teams) names.set(t.id, t.name);
  else for (const [id, name] of siteNames) names.set(id, name);
  const unranked = result.unranked ?? new Set<string>();
  const entries: Entry[] = [...result.values]
    .filter(([id]) => !unranked.has(id))
    .map(([id, value]) => ({ id, value, name: names.get(id) ?? '' }))
    .sort(byId);
  const hiddenIds =
    result.unit === 'person'
      ? new Set(data.people.filter((p) => p.prefs.hideFromLeaderboards).map((p) => p.id))
      : new Set<string>();
  return { entries, hiddenIds, unranked: [...unranked].map((id) => names.get(id) ?? '').sort() };
}

/** The sites a client caller may read competitions for. Empty for staff (they are scoped by their own site). */
function readableSites(call: Call, clientId: string, sites: Site[]): Set<string> {
  if (call.side !== 'client') return new Set();
  return new Set(
    sites.filter((s) => canAny(call, ['competitions.view'], { clientId, siteIds: [s.id] }, 'read')).map((s) => s.id),
  );
}

/** For client callers, only the people whose primary site the caller can read (nobody else's id, name or score). */
function scopeToReadable(call: Call, data: Data, readable: ReadonlySet<string>): Data {
  if (call.side !== 'client') return data;
  const people = data.people.filter((p) => readable.has(p.primarySiteId));
  const inScope = new Set(people.flatMap((p) => p.teamIds));
  return { ...data, people, teams: data.teams.filter((tm) => inScope.has(tm.id)) };
}

/** The unit the viewer is ranked as: themselves, or their team (first with an entry) or their site. */
function viewerUnit(result: MetricResult, person: Person): string {
  if (result.unit === 'person') return person.id;
  if (result.unit === 'site') return person.primarySiteId;
  return person.teamIds.find((t) => result.values.has(t) && !result.unranked?.has(t)) ?? '';
}

const idKeyOf = (unit: MetricResult['unit']) =>
  unit === 'person' ? 'personId' : unit === 'team' ? 'teamId' : 'siteId';

export function createCompetitionOperations(backend: RawBackend, options: StoreOptions): CompetitionOperations {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);

  // ------------------------------------------------------------ access

  /** Client actors with competitions.view, and staff of the same client. Never the provider. */
  async function reader(ctx: ActorContext): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side === 'provider') return forbid('permission');
    if (call.side === 'client' && !holds(call, ['competitions.view'])) return forbid('permission');
    return call;
  }

  const sitesOfComp = (c: Competition): Target =>
    c.siteIds && c.siteIds.length > 0 ? { clientId: c.clientId, siteIds: c.siteIds } : { clientId: c.clientId };

  /** A client admin who may read this competition's sites; staff of the client for anything staff may see. */
  async function visibleTo(call: Call, c: Competition): Promise<boolean> {
    if (c.clientId !== call.clientId) return false;
    if (call.side === 'client') return canAny(call, ['competitions.view'], sitesOfComp(c), 'read');
    const stored = c.status === 'scheduled';
    const personId = call.actor.user.personId;
    const person = personId ? await call.find<Person>('people', personId) : undefined;
    if (!stored || !person) return false;
    return (
      c.siteIds === undefined ||
      c.siteIds.length === 0 ||
      [person.primarySiteId, ...person.additionalSiteIds].some((s) => (c.siteIds as string[]).includes(s))
    );
  }

  /** Staff projection: no winners' ids, no final standings, no list of excluded people. */
  const forStaff = (c: Competition): Competition => {
    const rest: Competition = { ...c };
    delete rest.winners;
    delete rest.finalStandings;
    return structuredClone({ ...rest, eligibility: { ...rest.eligibility, excludePersonIds: [] } });
  };
  const project = (call: Call, c: Competition): Competition =>
    call.side === 'staff' ? forStaff(c) : structuredClone(c);

  async function findVisible(call: Call, id: string): Promise<Competition> {
    const hit = (await call.all<Competition>('competitions')).find((c) => c.id === id);
    if (!hit || !(await visibleTo(call, hit))) throw new NotFoundError();
    return hit;
  }

  /** A client actor with competitions.manage on this competition. Not found comes first (tenancy), then permission. */
  async function manager(ctx: ActorContext, id: string): Promise<{ call: Call; before: Competition }> {
    const call = await beginCall(backend, options, ctx);
    if (call.side === 'provider') return forbid('permission');
    const before = (await call.all<Competition>('competitions')).find(
      (c) => c.id === id && c.clientId === call.clientId,
    );
    if (!before) throw new NotFoundError();
    if (call.side !== 'client' || !canAny(call, ['competitions.manage'], sitesOfComp(before), 'write')) {
      return forbid('permission');
    }
    return { call, before };
  }

  function requireNew(call: Call): void {
    const client = call.actor.client;
    if (client && featureAvailability(client.accountState, 'newCompetitions') !== 'yes') {
      throw new AccountStateError(client.accountState, 'newCompetitions');
    }
  }

  const failFirst = (rules: string[]): void => {
    const first = rules[0];
    if (first !== undefined) throw new RuleError(first as RuleError['rule']);
  };

  async function checkSites(call: Call, c: Competition): Promise<void> {
    const sites = await call.all<Site>('sites');
    for (const id of [...(c.siteIds ?? []), ...(c.eligibility.siteIds ?? [])]) {
      if (!sites.some((s) => s.id === id && s.clientId === c.clientId)) throw new NotFoundError();
    }
  }

  const slim = (c: Competition, extra: Record<string, unknown> = {}) => ({ competitionId: c.id, ...extra });

  // ------------------------------------------------------------ standings

  function metricFor(c: Competition, data: Data): MetricResult {
    return competitionMetric(c.templateId as NonNullable<Competition['templateId']>, { competition: c, ...data });
  }

  async function standingsFor(call: Call, c: Competition): Promise<StandingsView> {
    if (c.type === 'custom' || c.templateId === undefined) return { visible: false };
    const sites = (await call.all<Site>('sites')).filter((s) => s.clientId === c.clientId);
    const readable = readableSites(call, c.clientId, sites);
    const data = scopeToReadable(call, await gather(call, c.clientId), readable);
    const result = metricFor(c, data);
    const seen = call.side === 'client' ? sites.filter((s) => readable.has(s.id)) : sites;
    const { entries, hiddenIds } = entriesOf(result, data, new Map(seen.map((s) => [s.id, s.name])));
    const status = competitionStatus(c, call.actor.now);
    const winners = c.winners
      ? winnerNames({
          winners: c.winners as { personId?: string; teamId?: string }[],
          people: data.people,
          teams: data.teams,
          audience: call.side === 'staff' ? 'staff' : 'admin',
        })
      : undefined;
    const withWinners = winners ? { winners } : {};

    if (call.side === 'client') {
      const view = adminLeaderboardView({ entries, hiddenIds, idKey: idKeyOf(result.unit) });
      return { visible: true, rows: view.rows, of: view.of, ...withWinners };
    }
    const personId = call.actor.user.personId;
    const me = data.people.find((p) => p.id === personId);
    if (!me) return forbid('permission');
    const rowsVisible = c.liveLeaderboard !== false || status === 'ended';
    const view = leaderboardView({
      entries,
      viewerId: viewerUnit(result, me),
      hiddenIds,
      rowsVisible,
    });
    // With the live board off, the distance to the next place would let staff work out the rows.
    const viewer = view.viewer && !rowsVisible ? { ...view.viewer, toNext: null } : view.viewer;
    return {
      visible: true,
      rows: view.rows,
      viewer,
      eligible: isEligible(c, me),
      ...withWinners,
    };
  }

  const competitions: CompetitionsService = {
    async entitlements(ctx) {
      const call = await reader(ctx);
      if (call.side !== 'client') return forbid('permission');
      const ents = await clientEntitlements(call, call.clientId as string);
      if (!ents) throw new NotFoundError();
      return structuredClone(ents);
    },

    async list(ctx) {
      const call = await reader(ctx);
      const out: Competition[] = [];
      for (const c of (await call.all<Competition>('competitions')).sort(byId)) {
        if (!(await visibleTo(call, c))) continue;
        out.push(project(call, c));
      }
      return out;
    },

    async get(ctx, id) {
      const call = await reader(ctx);
      const hit = await findVisible(call, id);
      return project(call, hit);
    },

    async save(ctx, input) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client') return forbid('permission');
      const found = (await call.all<Competition>('competitions')).find((c) => c.id === input.id);
      if (found && found.clientId !== call.clientId) throw new NotFoundError();
      if (!found && input.clientId !== call.clientId) return forbid('tenant');
      if (found && input.clientId !== found.clientId) return forbid('tenant');
      // Eligibility can only narrow the competition's own sites, and the writer needs write scope over all of them.
      const eligible = input.eligibility.siteIds ?? [];
      if (
        input.siteIds &&
        input.siteIds.length > 0 &&
        eligible.some((id) => !(input.siteIds as string[]).includes(id))
      ) {
        return forbid('permission');
      }
      const written = [...new Set([...(input.siteIds ?? []), ...eligible])];
      const scope: Target = written.length > 0 ? { clientId: input.clientId, siteIds: written } : sitesOfComp(input);
      if (!canAny(call, ['competitions.manage'], scope, 'write')) return forbid('permission');
      if (found && !canAny(call, ['competitions.manage'], sitesOfComp(found), 'write')) return forbid('permission');
      if (found) checkAccountState(call, false);
      else requireNew(call);

      // Status, winners and final standings are never set by a save: publish, cancel and recordWinners own them.
      const next: Competition = {
        ...input,
        status: found?.status ?? 'draft',
        ...(found?.winners ? { winners: found.winners } : {}),
        ...(found?.finalStandings !== undefined ? { finalStandings: found.finalStandings } : {}),
      };
      if (!found) {
        delete next.winners;
        delete next.finalStandings;
      }
      failFirst(validateCompetition(found, next, call.actor.now));
      await checkSites(call, next);
      for (const moduleId of next.moduleIds ?? []) {
        const m = await call.find<Module>('modules', moduleId);
        if (!m || (m.owner !== 'provider' && m.owner.clientId !== call.clientId)) throw new NotFoundError();
      }
      const record: Competition = { ...next, name: next.name.trim() };
      await apply([
        put('competitions', record),
        audit(call, record.clientId, 'competitions.saved', `competition:${record.id}`, undefined, slim(record)),
      ]);
      return structuredClone(record);
    },

    async publish(ctx, id) {
      const { call, before } = await manager(ctx, id);
      requireNew(call);
      if (before.status === 'scheduled') throw new RuleError('invalidCompetition');
      const next: Competition = { ...before, status: 'scheduled' };
      failFirst(validateCompetition(before, next, call.actor.now));

      const ents = await clientEntitlements(call, before.clientId);
      if (!ents) throw new NotEntitledError('liveCompetitions');
      const counted = (await call.all<Competition>('competitions')).filter(
        (c) =>
          c.clientId === before.clientId &&
          c.id !== before.id &&
          c.status === 'scheduled' &&
          competitionStatus(c, call.actor.now) !== 'ended',
      ).length;
      if (!checkLimit(ents, { liveCompetitions: counted }, 'liveCompetitions').allowed) {
        throw new NotEntitledError('liveCompetitions');
      }
      if (before.closedBookOnly === true && !entitled(ents, 'closedBookCompetitions')) {
        throw new NotEntitledError('closedBookCompetitions');
      }
      await apply([
        put('competitions', next),
        audit(call, next.clientId, 'competitions.published', `competition:${next.id}`, undefined, slim(next)),
      ]);
      return structuredClone(next);
    },

    async cancel(ctx, id) {
      const { call, before } = await manager(ctx, id);
      checkAccountState(call, false);
      const next: Competition = { ...before, status: 'cancelled' };
      failFirst(validateCompetition(before, next, call.actor.now));
      await apply([
        put('competitions', next),
        audit(call, next.clientId, 'competitions.cancelled', `competition:${next.id}`, undefined, slim(next)),
      ]);
      return structuredClone(next);
    },

    async extend(ctx, id, endAt) {
      const { call, before } = await manager(ctx, id);
      checkAccountState(call, false);
      const next: Competition = { ...before, endAt };
      failFirst(validateCompetition(before, next, call.actor.now));
      if (new Date(endAt).getTime() < new Date(before.endAt).getTime()) throw new RuleError('endShortened');
      await apply([
        put('competitions', next),
        audit(call, next.clientId, 'competitions.extended', `competition:${next.id}`, undefined, slim(next)),
      ]);
      return structuredClone(next);
    },

    async recordWinners(ctx, id) {
      const { call, before } = await manager(ctx, id);
      checkAccountState(call, false);
      const status = competitionStatus(before, call.actor.now);
      if (status === 'cancelled') throw new RuleError('competitionCancelled');
      if (before.type === 'custom' || before.templateId === undefined) throw new RuleError('invalidCompetition');
      if (before.winners !== undefined) throw new RuleError('winnersRecorded');
      if (status !== 'ended') throw new RuleError('notEnded');

      const sites = (await call.all<Site>('sites')).filter((s) => s.clientId === before.clientId);
      const readable = readableSites(call, before.clientId, sites);
      const data = scopeToReadable(call, await gather(call, before.clientId), readable);
      const result = metricFor(before, data);
      const seen = sites.filter((s) => readable.has(s.id));
      const { entries, hiddenIds } = entriesOf(result, data, new Map(seen.map((s) => [s.id, s.name])));
      // Hidden people stay out of the top places but are in the draw (assumption 15).
      const names = new Map(entries.map((e) => [e.id, e.name]));
      const standing: Ranked[] = rankEntries(
        new Map(entries.filter((e) => !hiddenIds.has(e.id)).map((e) => [e.id, e.value])),
        names,
      );
      const qualifiers = result.qualifies ? [...result.qualifies] : entries.filter((e) => e.value > 0).map((e) => e.id);
      const picked = selectWinners(before, standing, qualifiers, options.rng);
      const winners = picked.map((w) => ({ ...w, recordedAt: call.actor.ctx.now }));
      const finalStandings = standing
        .filter((r) => r.value > 0)
        .map((r) => ({ rank: r.rank, name: r.name, value: r.value, [idKeyOf(result.unit)]: r.id }));
      const next: Competition = { ...before, winners, finalStandings };
      await apply([
        put('competitions', next),
        audit(
          call,
          next.clientId,
          'competitions.winnersRecorded',
          `competition:${next.id}`,
          undefined,
          slim(next, { winners: winners.length }),
        ),
      ]);
      return structuredClone(next);
    },

    async standings(ctx, id) {
      const call = await reader(ctx);
      const c = await findVisible(call, id);
      return standingsFor(call, c);
    },
  };

  // ------------------------------------------------------------ leaderboards

  async function settingsFor(call: Call): Promise<StandingBoardSettings> {
    const clientId = call.clientId as string;
    const stored = (await call.all<StandingBoardSettings>('standingBoardSettings')).find(
      (s) => s.clientId === clientId,
    );
    return structuredClone(stored ?? defaultBoardSettings(clientId));
  }

  const leaderboards: LeaderboardsService = {
    async settings(ctx) {
      const call = await reader(ctx);
      return settingsFor(call);
    },

    async saveSettings(ctx, input) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client') return forbid('permission');
      const clientId = call.clientId as string;
      if (!canAny(call, ['competitions.manage'], { clientId }, 'write')) return forbid('permission');
      checkAccountState(call, false);
      const parsed = standingBoardSettingsSchema.safeParse(input);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
      }
      if (parsed.data.clientId !== clientId) return forbid('tenant');
      await apply([
        { type: 'put', store: 'standingBoardSettings', key: clientId, record: parsed.data },
        audit(call, clientId, 'competitions.boardSettingsSaved', `standingBoardSettings:${clientId}`, undefined, {
          boards: Object.keys(parsed.data.boards).length,
        }),
      ]);
      return structuredClone(parsed.data);
    },

    async standing(ctx, input): Promise<BoardView> {
      const call = await reader(ctx);
      const board = boardIdSchema.safeParse(input.board);
      const allowed = BOARD_PERIODS[input.board] ?? BOARD_PERIODS['default'];
      if (!board.success || !allowed?.includes(input.period)) {
        throw new ValidationError(['board: choose a board and period that go together']);
      }
      const clientId = call.clientId as string;
      const settings = await settingsFor(call);
      if (settings.boards[board.data]?.enabled === false) return { visible: false, off: true };

      const data = await gather(call, clientId);
      let viewer: Person | undefined;
      let scoped: Person[];
      if (call.side === 'staff') {
        const { person } = await staffCall(backend, options, ctx);
        viewer = person;
        // M2: staff see their own site only (region, country and all-sites scopes are M3).
        scoped = data.people.filter((p) => p.primarySiteId === person.primarySiteId);
      } else {
        const sites = (await call.all<Site>('sites')).filter((s) => s.clientId === clientId);
        const readable = readableSites(call, clientId, sites);
        if (input.siteId !== undefined && !readable.has(input.siteId)) throw new NotFoundError();
        scoped = data.people.filter((p) =>
          input.siteId !== undefined ? p.primarySiteId === input.siteId : readable.has(p.primarySiteId),
        );
      }
      const inScope = new Set(scoped.flatMap((p) => p.teamIds));
      const teams = data.teams.filter((tm) => inScope.has(tm.id));
      const result = standingBoard(board.data, input.period, {
        ...data,
        teams,
        people: scoped,
        now: call.actor.now,
      });
      const scopedData: Data = { ...data, teams, people: scoped };
      const { entries, hiddenIds, unranked } = entriesOf(result, scopedData, new Map());
      if (call.side === 'client') {
        const view = adminLeaderboardView({ entries, hiddenIds, idKey: idKeyOf(result.unit) });
        return { visible: true, rows: view.rows, of: view.of, unranked };
      }
      const view = leaderboardView({
        entries,
        viewerId: viewerUnit(result, viewer as Person),
        hiddenIds,
        rowsVisible: true,
      });
      return { visible: true, rows: view.rows, viewer: view.viewer, unranked };
    },
  };

  return { competitions, leaderboards };
}

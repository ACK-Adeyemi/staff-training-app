// Provider overview, client list and telemetry (M4 chunk 8c, plan BP-1 C layer). Reads are provider side only and need
// clients.read. Counts are real records; health scores, usage and error groups are seeded and flagged simulated.
// Local telemetry is the one real thing here: it is recorded on this device only, with the injected Clock, and Reset
// leaves it alone. Nothing here makes a network request.
import {
  ulid,
  type AccountState,
  type Client,
  type ErrorGroup,
  type HealthScore,
  type LocalTelemetryEntry,
  type Person,
  type Site,
  type Subscription,
  type UsageDaily,
} from '@sta/domain';
import { validate, type RawBackend } from './backend';
import { put } from './ops';
import { beginCall, derivedAccountState, forbid, holds, type Call } from './policy';
import {
  ValidationError,
  type ActorContext,
  type ProviderClientRow,
  type ProviderOverview,
  type ProviderOverviewService,
  type StoreOptions,
  type TelemetryService,
} from './types';

export type ProviderOverviewOperations = {
  providerOverview: ProviderOverviewService;
  telemetry: TelemetryService;
};

/** A health score below this needs attention. */
const ATTENTION_BELOW = 60;
const MAX_NAME = 120;
const MAX_MESSAGE = 500;

const newestFirst = <T extends { date: string }>(a: T, b: T): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

export function createProviderOverviewOperations(
  backend: RawBackend,
  options: StoreOptions,
): ProviderOverviewOperations {
  async function providerCall(ctx: ActorContext): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
    if (!holds(call, ['clients.read'])) return forbid('permission');
    return call;
  }

  async function latestScores(call: Call): Promise<Map<string, HealthScore>> {
    const latest = new Map<string, HealthScore>();
    for (const s of [...(await call.all<HealthScore>('healthScores'))].sort(newestFirst)) {
      if (!latest.has(s.clientId)) latest.set(s.clientId, s);
    }
    return latest;
  }

  async function rows(call: Call): Promise<ProviderClientRow[]> {
    const [clients, sites, people, scores, subscriptions] = await Promise.all([
      call.all<Client>('clients'),
      call.all<Site>('sites'),
      call.all<Person>('people'),
      latestScores(call),
      call.all<Subscription>('subscriptions'),
    ]);
    const subOf = new Map(subscriptions.map((x) => [x.clientId, x]));
    const siteCount = new Map<string, number>();
    for (const s of sites) siteCount.set(s.clientId, (siteCount.get(s.clientId) ?? 0) + 1);
    const peopleCount = new Map<string, number>();
    for (const p of people) {
      if (p.status === 'active') peopleCount.set(p.clientId, (peopleCount.get(p.clientId) ?? 0) + 1);
    }
    return clients
      .map((c): ProviderClientRow => {
        const score = scores.get(c.id);
        return {
          clientId: c.id,
          displayName: c.displayName,
          // Derived from the subscription and the demo date, as the client banner and Dunning do.
          accountState: derivedAccountState(c, subOf.get(c.id), call.actor.now),
          packageId: c.packageId,
          siteCount: siteCount.get(c.id) ?? 0,
          peopleCount: peopleCount.get(c.id) ?? 0,
          ...(score ? { healthScore: score.score } : {}),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || (a.clientId < b.clientId ? -1 : 1));
  }

  const providerOverview: ProviderOverviewService = {
    async overview(ctx) {
      const call = await providerCall(ctx);
      const list = await rows(call);
      const scores = await latestScores(call);
      const byAccountState: Partial<Record<AccountState, number>> = {};
      for (const r of list) byAccountState[r.accountState] = (byAccountState[r.accountState] ?? 0) + 1;
      const attention: ProviderOverview['attention'] = [];
      for (const r of list) {
        const reasons: string[] = [];
        if (r.accountState === 'pastDue') reasons.push('accountState.pastDue');
        const score = scores.get(r.clientId);
        if (score && score.score < ATTENTION_BELOW) reasons.push(...score.reasons);
        if (reasons.length > 0) attention.push({ clientId: r.clientId, reasons });
      }
      return {
        simulated: true,
        clientCount: list.length,
        byAccountState,
        siteCount: list.reduce((n, r) => n + r.siteCount, 0),
        peopleCount: list.reduce((n, r) => n + r.peopleCount, 0),
        attention,
      };
    },

    async clients(ctx, filter) {
      const call = await providerCall(ctx);
      const list = await rows(call);
      return filter?.accountState === undefined ? list : list.filter((r) => r.accountState === filter.accountState);
    },
  };

  async function record(kind: 'event' | 'error', name: unknown, message?: unknown): Promise<LocalTelemetryEntry> {
    const cleanName = typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : '';
    if (cleanName === '') throw new ValidationError(['name: required']);
    const entry = validate('localTelemetry', {
      id: ulid(options.clock, options.rng),
      kind,
      name: cleanName,
      ...(kind === 'error'
        ? { message: (typeof message === 'string' ? message : '').trim().slice(0, MAX_MESSAGE) }
        : {}),
      at: options.clock.now().toISOString(),
    }) as LocalTelemetryEntry;
    await backend.apply([put('localTelemetry', entry)]);
    return structuredClone(entry);
  }

  const telemetry: TelemetryService = {
    recordLocalEvent: (input) => record('event', input.name),
    recordLocalError: (input) => record('error', input.name, input.message),

    async listLocal(ctx) {
      const call = await providerCall(ctx);
      const all = await call.all<LocalTelemetryEntry>('localTelemetry');
      return structuredClone([...all].sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1)));
    },

    async simulated(ctx, clientId) {
      const call = await providerCall(ctx);
      const usage = (await call.all<UsageDaily>('usageDaily')).filter((u) => u.clientId === clientId);
      const groups = (await call.all<ErrorGroup>('errorGroups')).filter((g) => g.clientIds.includes(clientId));
      const score = (await call.all<HealthScore>('healthScores'))
        .filter((s) => s.clientId === clientId)
        .sort(newestFirst)[0];
      return structuredClone({
        simulated: true as const,
        clientId,
        usageDaily: usage.sort((a, b) =>
          a.date === b.date ? (a.feature < b.feature ? -1 : 1) : a.date < b.date ? -1 : 1,
        ),
        errorGroups: groups,
        healthScore: score,
      });
    },
  };

  return { providerOverview, telemetry };
}

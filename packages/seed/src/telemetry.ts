// Simulated provider telemetry (M4 chunk 8c; build pack 6 "Provider telemetry"). Drawn from its own forked stream so no
// earlier record moves. Fictional and deterministic: the same seed value and today give the same numbers.
import { addDays, ulid, type Clock, type Rng } from '@sta/domain';
import type { SeedData, SeedKeys } from './world';

const DAYS = 90;
const FEATURES = ['training', 'evidence'] as const;

/** Per client: people using the app on a typical day, and how usage moves over the 90 days (1 is steady). */
const PROFILE: Record<string, { users: number; trend: number }> = {
  littleAcorns: { users: 18, trend: 1.1 },
  oakTree: { users: 40, trend: 1 },
  willowLane: { users: 12, trend: 0.7 },
  maisonElvaro: { users: 25, trend: 1 },
  brookfield: { users: 20, trend: 1.05 },
  rosewood: { users: 6, trend: 1.2 },
  harbourCafe: { users: 4, trend: 0.3 },
  atelierVasquine: { users: 22, trend: 1 },
  summitBuilders: { users: 15, trend: 0.4 },
  sunnyDays: { users: 14, trend: 1 },
  littleStars: { users: 10, trend: 1.1 },
  meadowview: { users: 2, trend: 0.1 },
  pebbles: { users: 3, trend: 0.5 },
};

const SCORES: Record<string, { score: number; reasons: string[] }> = {
  littleAcorns: { score: 88, reasons: ['Most staff finish training on time'] },
  oakTree: { score: 82, reasons: ['Steady use across all three nurseries'] },
  willowLane: { score: 58, reasons: ['Payment is overdue', 'Training use is falling'] },
  maisonElvaro: { score: 79, reasons: ['Steady use'] },
  brookfield: { score: 85, reasons: ['Most staff finish training on time'] },
  rosewood: { score: 71, reasons: ['New trial, getting started'] },
  harbourCafe: { score: 34, reasons: ['Very few people signed in this month', 'No training completed in 30 days'] },
  atelierVasquine: { score: 80, reasons: ['Steady use'] },
  summitBuilders: { score: 42, reasons: ['Use has halved since last quarter', 'Several overdue requirements'] },
  sunnyDays: { score: 76, reasons: ['Steady use'] },
  littleStars: { score: 84, reasons: ['Most staff finish training on time'] },
  meadowview: { score: 65, reasons: ['Account is closed'] },
  pebbles: { score: 68, reasons: ['Account is paused'] },
};

export function buildTelemetry(input: { data: SeedData; keys: SeedKeys; today: Date; clock: Clock; rng: Rng }): void {
  const { data, keys, today, clock, rng } = input;
  const day = (daysAgo: number): string => addDays(today, -daysAgo).toISOString().slice(0, 10);
  const clientId = (key: string): string => {
    const id = keys.clients[key];
    if (!id) throw new Error(`Seed: client ${key} is missing`);
    return id;
  };

  // Harbour Cafe Group is a summary client with four sites (build pack 7.2) and no staff.
  for (const [name, region] of [
    ['Harbour Quay', 'South West'],
    ['Old Town', 'South West'],
    ['Station Road', 'South East'],
    ['Market Square', 'South East'],
  ] as const) {
    data.sites.push({
      id: ulid(clock, rng),
      clientId: clientId('harbourCafe'),
      name,
      countryCode: 'GB',
      region,
      status: 'active',
      timezone: 'Europe/London',
    });
  }

  for (const [key, profile] of Object.entries(PROFILE)) {
    const id = clientId(key);
    for (let ago = DAYS - 1; ago >= 0; ago--) {
      // 0 at the oldest day, 1 today: usage slides from 1 to `trend` across the period.
      const progress = (DAYS - 1 - ago) / (DAYS - 1);
      const factor = 1 + (profile.trend - 1) * progress;
      const weekend = [0, 6].includes(addDays(today, -ago).getUTCDay());
      for (const feature of FEATURES) {
        const users = Math.max(0, Math.round(profile.users * factor * (weekend ? 0.2 : 1) * (0.8 + rng.next() * 0.4)));
        data.usageDaily.push({
          clientId: id,
          date: day(ago),
          feature,
          activeUsers: users,
          count: users * (feature === 'training' ? rng.int(2, 5) : rng.int(0, 2)),
        });
      }
    }
    const s = SCORES[key] ?? { score: 70, reasons: ['Steady use'] };
    // A short history: the score a fortnight ago, a week ago and today.
    data.healthScores.push(
      { clientId: id, date: day(14), score: Math.min(100, s.score + rng.int(2, 8)), reasons: s.reasons },
      { clientId: id, date: day(7), score: Math.min(100, s.score + rng.int(0, 3)), reasons: s.reasons },
      { clientId: id, date: day(0), score: s.score, reasons: s.reasons },
    );
  }

  const stamp = (daysAgo: number): string => addDays(today, -daysAgo).toISOString();
  data.errorGroups.push(
    {
      id: ulid(clock, rng),
      message: 'The certificate could not be created',
      count: 14,
      firstSeen: stamp(20),
      lastSeen: stamp(2),
      clientIds: [clientId('harbourCafe'), clientId('summitBuilders')],
      siteIds: [],
      usersAffected: 5,
      status: 'open',
    },
    {
      id: ulid(clock, rng),
      message: 'A photo upload was interrupted',
      count: 31,
      firstSeen: stamp(45),
      lastSeen: stamp(1),
      clientIds: [clientId('oakTree'), clientId('littleAcorns'), clientId('harbourCafe')],
      siteIds: [],
      usersAffected: 12,
      status: 'acknowledged',
    },
    {
      id: ulid(clock, rng),
      message: 'The page took too long to load',
      count: 6,
      firstSeen: stamp(60),
      lastSeen: stamp(33),
      clientIds: [clientId('willowLane')],
      siteIds: [],
      usersAffected: 2,
      status: 'resolved',
    },
  );
}

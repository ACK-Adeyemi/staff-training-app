// M3 chunk 11 (plan F-6; assumptions 5, 10, 53, 54): seed version 4. Pins the data Track A and the M3 screens rely on.
// Hard constraints go through domain functions (lessonFunnel, siteLeaderboard, twoFactorStatus, feedbackSummary),
// not hand-computed numbers. Earlier streams are pinned by hashes taken from the version 3 world (see EARLIER).
import { describe, expect, it } from 'vitest';
import { moduleIds, nurseryPack, themeBases } from '@sta/content';
import {
  appFeedbackSchema,
  autoAssignRuleSchema,
  billingProfileSchema,
  canReplyToFeedback,
  evidenceSubmissionSchema,
  feedbackSummary,
  invoiceSchema,
  lessonFunnel,
  moduleFeedbackSchema,
  moduleVersionSchema,
  onboardingChecklistSchema,
  reminderLogSchema,
  siteLeaderboard,
  themeSchema,
  ticketMessageSchema,
  ticketSchema,
  twoFactorStatus,
  validateTheme,
  type Module,
  type Theme,
  type UserAccount,
} from '@sta/domain';
import { SEED_VERSION, ensureCurrentSeed, load } from './index';
import { freshStore, hashStores, londonParts, seeded, SEED, TODAY, type Dump } from './testing';

const DAY = 86_400_000;
const NOW = new Date(TODAY);
const daysAgo = (iso: string) => (NOW.getTime() - new Date(iso).getTime()) / DAY;
const FIRE_TITLE = 'Fire evacuation at Little Acorns';
const LONE_TITLE = 'Lone working at the end of the day';

async function world() {
  const s = await seeded();
  const { dump, keys } = s;
  const la = keys.clients['littleAcorns']!;
  const ot = keys.clients['oakTree']!;
  const wl = keys.clients['willowLane']!;
  const fire = (dump['modules'] as Module[]).find((m) => m.title === FIRE_TITLE) as Module | undefined;
  return { ...s, la, ot, wl, fire, user: (k: string) => keys.users[k]! };
}

describe('seed version 4 (assumption 53)', () => {
  it('is 7 (M4), and load stores it in the seed metadata', async () => {
    expect(SEED_VERSION).toBe(9);
    const { admin } = await seeded();
    expect(await admin.getSeedMeta()).toEqual({ ...SEED, seedVersion: 9 });
  });

  it('reseeds a stored version 3 world with the same seed value and today', async () => {
    const admin = freshStore().admin;
    await load(admin, SEED);
    await admin.clearAll();
    await admin.setSeedMeta({ ...SEED, seedVersion: 3 });
    const keys = await ensureCurrentSeed(admin);
    expect(keys).not.toBeNull();
    expect(await admin.getSeedMeta()).toEqual({ ...SEED, seedVersion: 9 });
    const dump = (await admin.dumpAll()) as Dump;
    expect(dump['moduleFeedback']!.length).toBeGreaterThan(20);
    // Seed version 5 (M4) adds tickets from other clients; Little Acorns still has its three.
    expect(dump['tickets']!.filter((t) => t.clientId === keys!.clients['littleAcorns'])).toHaveLength(3);
    expect(dump['clients']).toHaveLength(13);
  });

  it('does nothing when the stored version is already 4', async () => {
    const admin = freshStore().admin;
    await load(admin, SEED);
    expect(await ensureCurrentSeed(admin)).toBeNull();
  });

  it('fills every new store (the M3 stores are not left empty)', async () => {
    const { dump } = await seeded();
    for (const store of [
      'moduleVersions',
      'moduleFeedback',
      'appFeedback',
      'tickets',
      'ticketMessages',
      'autoAssignRules',
      'reminderLog',
      'themes',
      'invoices',
      'billingProfiles',
      'onboarding',
    ]) {
      expect(dump[store]!.length, store).toBeGreaterThan(0);
    }
  });
});

describe('seed version 4: deterministic dumps', () => {
  it('two loads with the same seed give identical stores, including the new ones', async () => {
    const a = await seeded();
    const b = await seeded();
    expect(hashStores(a.dump)).toEqual(hashStores(b.dump));
    expect(Object.keys(a.dump)).toContain('moduleFeedback');
  });

  it('a different seed value gives different feedback and history but the same record counts for fixed data', async () => {
    const a = await seeded();
    const b = await seeded({ seedValue: 777, today: TODAY });
    expect(b.dump['tickets']).toHaveLength(a.dump['tickets']!.length);
    expect(b.dump['autoAssignRules']).toHaveLength(3);
    expect(hashStores(a.dump)['moduleFeedback']).not.toEqual(hashStores(b.dump)['moduleFeedback']);
  });
});

// Hashes of the version 3 world for the stores and slices the M3 seed must not move (new forked streams only).
const EARLIER: Record<string, string> = {
  evidence: '13e63b3b3477c14d929b95a39adb6958f57139fe072f4b249f3f7da5bd085ca8',
  people: 'a20f5d5350feccf94afadd8ab71e6b166e714f20d7520dec384678587312df4c',
  teams: '8311a22fae4629d691376f1bcd25ba2f38facdc15818f175579743747692ed57',
  sites: 'f43de1a67a63b1a53e451f0d3552f1811f5598c471b68da933ee1f0316930170',
  notes: '7668d839b5b4a2d76085da910af00ecc60dcaed2f40fff7c4aad3a49aff1c2e9',
  categories: '096d6080a1667bb21b745bf060b0045f3969bca3da4ba6462e068c3d978eb82d',
  competitions: '4338b5f3da8dddb361f7f608a83a0eeba0991088ae2988f6e0f203b7a81221ce',
  jobRoles: 'a168012791e720cbfed4b39fb8265b4d07e5295774707d1f2aa1d2515e65c527',
  requirements: 'e4fd9a562870bfd650041cafc4339b3f84ab508eea3093849dc229ec9d750fa1',
  laEvents: '0b193c7fc5a276a4df20e5cf0483270c83ff8c08b3738da9d86ea9fed58a47be',
  laAttempts: 'b79f5ce49e3222e11c8f986bbd84aadea7db96b0d514bb73a7a393ffdc976a9f',
  laAssignments: '34cec9f62b361ab8ae745cae95ff6c736588519261551d9bf1dcfa0b8d40f8a7',
};

describe('seed version 4: earlier streams and compliance untouched', () => {
  it('leaves Evidence, people, teams, sites, notes, categories, competitions, requirements and the M2 Little Acorns history exactly as in version 3', async () => {
    const { dump, la } = await world();
    const nursery = new Set<string>(Object.values(moduleIds));
    const sam = (await seeded()).keys.personas['sam']!;
    const sel: Record<string, unknown[]> = {};
    for (const s of Object.keys(EARLIER).filter((k) => !k.startsWith('la'))) sel[s] = dump[s]!;
    // Version 6 gives Harbour Cafe Group its four sites; every other site is still the version 3 one.
    const harbour = (await seeded()).keys.clients['harbourCafe'];
    sel['sites'] = dump['sites']!.filter((s) => s.clientId !== harbour);
    sel['laEvents'] = dump['learningEvents']!.filter((e) => e.clientId === la && nursery.has(e.moduleId));
    sel['laAttempts'] = dump['attempts']!.filter((e) => e.clientId === la && nursery.has(e.moduleId));
    sel['laAssignments'] = dump['assignments']!.filter((a) => a.clientId === la && a.personId !== sam);
    const got = hashStores(sel);
    for (const [name, hash] of Object.entries(EARLIER)) expect(got[name], name).toBe(hash);
  });

  it('adds no Evidence for Oak Tree or Willow Lane by writing history (every Evidence record is still the version 3 one)', async () => {
    const { dump } = await world();
    // Same pin as above, stated on its own so a failure names the compliance rule: history never changes Evidence.
    expect(hashStores({ evidence: dump['evidence']! })['evidence']).toBe(EARLIER['evidence']);
  });

  it('keeps the audit log empty and the outbox with only the M4 price notice', async () => {
    const { dump } = await world();
    expect(dump['audit']).toHaveLength(0);
    // Seed version 5 (M4) adds the Brookfield price change notice; nothing else is in the Outbox.
    expect(dump['outbox']).toHaveLength(1);
  });
});

describe('seed version 4: Oak Tree and Willow Lane six-month history (assumption 54)', () => {
  it.each(['ot', 'wl'] as const)('%s has learning events reaching back at least five months', async (which) => {
    const w = await world();
    const id = w[which];
    const oldest = Math.max(...w.dump['learningEvents']!.filter((e) => e.clientId === id).map((e) => daysAgo(e.at)));
    expect(oldest).toBeGreaterThanOrEqual(150);
    expect(oldest).toBeLessThanOrEqual(190);
    expect(w.dump['learningEvents']!.every((e) => new Date(e.at).getTime() <= NOW.getTime())).toBe(true);
  });

  it('puts Riverside first and Meadow last on the Sites board for Participation this month', async () => {
    const { dump, keys, ot } = await world();
    const of = <T extends { clientId: string }>(rows: T[]) => rows.filter((r) => r.clientId === ot);
    const ranked = siteLeaderboard('participation', 'thisMonth', {
      people: of(dump['people']!),
      teams: of(dump['teams']!),
      sites: of(dump['sites']!),
      events: of(dump['learningEvents']!),
      attempts: of(dump['attempts']!),
      assignments: of(dump['assignments']!),
      evidence: of(dump['evidence']!),
      submissions: of(dump['evidenceSubmissions']!),
      requirements: dump['requirements']!,
      modules: dump['modules']!,
      amberWindowDays: 60,
      now: NOW,
    });
    expect(ranked).toHaveLength(3);
    const row = (k: string) => ranked.find((r) => r.siteId === keys.sites[k])!;
    expect(row('riverside').rank).toBe(1);
    expect(row('meadow').rank).toBe(3);
    expect(row('riverside').value).toBeGreaterThan(row('hillside').value);
    expect(row('hillside').value).toBeGreaterThan(row('meadow').value);
  });

  it('switches the Sites board on for Oak Tree only', async () => {
    const { dump, ot, la } = await world();
    const settings = (id: string) => dump['standingBoardSettings']!.find((s) => s.clientId === id);
    expect(settings(ot)?.siteBoard.enabled).toBe(true);
    expect(settings(la)?.siteBoard.enabled).toBe(false);
  });

  it('records Oak Tree\'s pending rename to "Oak Tree Nurseries Group" from 2 days ago', async () => {
    const { dump, ot, user } = await world();
    const client = dump['clients']!.find((c) => c.id === ot);
    expect(client.nameHistory).toHaveLength(1);
    const entry = client.nameHistory[0];
    expect(entry).toMatchObject({
      old: 'Oak Tree Nurseries',
      new: 'Oak Tree Nurseries Group',
      reviewStatus: 'pendingReview',
    });
    expect(daysAgo(entry.changedAt)).toBeGreaterThan(1.5);
    expect(daysAgo(entry.changedAt)).toBeLessThan(2.5);
    expect(entry.changedBy).toBe(user('oakTreeGroupAdmin'));
  });

  it('leaves every other client with an empty name history', async () => {
    const { dump, ot } = await world();
    for (const c of dump['clients']!) if (c.id !== ot) expect(c.nameHistory, c.displayName).toEqual([]);
  });
});

describe('seed version 4: Little Acorns own modules (assumption 54)', () => {
  it('has the Fire evacuation module, published, with 3 lessons and 6 questions, owned by Little Acorns', async () => {
    const { fire, la } = await world();
    expect(fire).toBeDefined();
    expect(fire!.status).toBe('published');
    expect(fire!.owner).toMatchObject({ clientId: la });
    expect(fire!.lessons).toHaveLength(3);
    expect(fire!.questions).toHaveLength(6);
  });

  it('writes one prior version snapshot, so the module is version 2 and the snapshot is version 1', async () => {
    const { dump, fire } = await world();
    const snaps = (dump['moduleVersions'] as unknown[]).map((v) => moduleVersionSchema.parse(v));
    const mine = snaps.filter((s) => s.moduleId === fire!.id);
    expect(mine).toHaveLength(1);
    expect(fire!.version).toBe(2);
    expect(mine[0]).toMatchObject({ version: 1, key: `${fire!.id}:1` });
    expect(mine[0]!.module.version).toBe(1);
    expect(mine[0]!.module.id).toBe(fire!.id);
    expect(dump['moduleVersions']).toHaveLength(1);
  });

  it('has a draft own module "Lone working at the end of the day", never published', async () => {
    const { dump, la } = await world();
    const draft = (dump['modules'] as Module[]).find((m) => m.title === LONE_TITLE);
    expect(draft).toBeDefined();
    expect(draft!.status).toBe('draft');
    expect(draft!.version).toBe(1);
    expect(draft!.owner).toMatchObject({ clientId: la });
    const own = (dump['modules'] as Module[]).filter((m) => m.owner !== 'provider' && m.owner.clientId === la);
    // Seed version 9 (M5 chunk 3) adds the "Mobile phone policy" draft beside Lone working.
    expect(own.map((m) => m.title).sort()).toEqual([FIRE_TITLE, LONE_TITLE, 'Mobile phone policy'].sort());
  });

  it('gives Fire evacuation lesson 2 the biggest drop-off in the lesson funnel', async () => {
    const { dump, fire, la } = await world();
    const funnel = lessonFunnel({
      module: fire!,
      assignments: dump['assignments']!.filter((a) => a.clientId === la),
      attempts: dump['attempts']!.filter((a) => a.clientId === la),
      events: dump['learningEvents']!.filter((e) => e.clientId === la),
      evidence: [],
      now: NOW,
    });
    const [l1, l2, l3] = funnel.map((f) => f.reached) as [number, number, number];
    expect(funnel.map((f) => f.lessonId)).toEqual(fire!.lessons.map((l) => l.id));
    expect(l1).toBeGreaterThanOrEqual(8);
    expect(l1 - l2).toBeGreaterThan(0);
    expect(l1 - l2).toBeGreaterThan(l2 - l3);
  });

  it('has attempts and answered questions for Fire evacuation, all from Little Acorns people', async () => {
    const { dump, fire, la } = await world();
    const attempts = dump['attempts']!.filter((a) => a.moduleId === fire!.id);
    const answers = dump['learningEvents']!.filter((e) => e.moduleId === fire!.id && e.type === 'questionAnswered');
    expect(attempts.length).toBeGreaterThanOrEqual(5);
    expect(answers.length).toBeGreaterThanOrEqual(20);
    const people = new Set(dump['people']!.filter((p) => p.clientId === la).map((p) => p.id));
    for (const a of [...attempts, ...answers]) expect(people.has(a.personId)).toBe(true);
    const ids = new Set(fire!.questions.map((q) => q.id));
    for (const e of answers) expect(ids.has(e.questionId)).toBe(true);
  });
});

describe('seed version 4: module feedback (assumption 54)', () => {
  it('has about 25 valid items, each in its own client and site', async () => {
    const { dump } = await world();
    const items = (dump['moduleFeedback'] as unknown[]).map((f) => moduleFeedbackSchema.parse(f));
    expect(items.length).toBeGreaterThanOrEqual(23);
    expect(items.length).toBeLessThanOrEqual(27);
    const siteClient = new Map(dump['sites']!.map((s) => [s.id, s.clientId]));
    for (const f of items) expect(siteClient.get(f.siteId), f.id).toBe(f.clientId);
    for (const f of items) expect(f.createdAt <= TODAY).toBe(true);
  });

  it('has an Unclear cluster of at least 4 on Fire evacuation lesson 2', async () => {
    const { dump, fire } = await world();
    const cluster = (dump['moduleFeedback'] as { moduleId: string; lessonId?: string; tags: string[] }[]).filter(
      (f) => f.moduleId === fire!.id && f.lessonId === 'lesson-2' && f.tags.includes('unclear'),
    );
    expect(cluster.length).toBeGreaterThanOrEqual(4);
    expect(
      feedbackSummary(dump['moduleFeedback']!.filter((f) => f.moduleId === fire!.id)).tagCounts['unclear'],
    ).toBeGreaterThanOrEqual(4);
  });

  it('has 3 question reports, exactly one on a provider module, and the rest on a Little Acorns own module', async () => {
    const { dump } = await world();
    const reports = (dump['moduleFeedback'] as { kind: string; moduleId: string; questionId: string }[]).filter(
      (f) => f.kind === 'questionReport',
    );
    expect(feedbackSummary(dump['moduleFeedback']!).questionReports).toBe(3);
    const owner = (id: string) => (dump['modules'] as Module[]).find((m) => m.id === id)!.owner;
    expect(reports.filter((r) => owner(r.moduleId) === 'provider')).toHaveLength(1);
    for (const r of reports) {
      const m = (dump['modules'] as Module[]).find((x) => x.id === r.moduleId)!;
      expect(
        m.questions.some((q) => q.id === r.questionId),
        'the question exists in the module',
      ).toBe(true);
    }
  });

  it('has 2 escalations to the provider and several replies, replies only on named items', async () => {
    const { dump } = await world();
    const items = (dump['moduleFeedback'] as unknown[]).map((f) => moduleFeedbackSchema.parse(f));
    expect(items.filter((f) => f.escalatedToProvider !== undefined)).toHaveLength(2);
    const replied = items.filter((f) => f.reply !== undefined);
    expect(replied.length).toBeGreaterThanOrEqual(3);
    for (const f of replied) expect(canReplyToFeedback(f), f.id).toBe(true);
  });

  it('has some anonymous items with no person, and named items that point at real people of that client', async () => {
    const { dump } = await world();
    const items = (dump['moduleFeedback'] as unknown[]).map((f) => moduleFeedbackSchema.parse(f));
    const anon = items.filter((f) => f.anonymous);
    expect(anon.length).toBeGreaterThanOrEqual(3);
    expect(anon.length).toBeLessThan(items.length);
    for (const f of anon) expect('personId' in f).toBe(false);
    const people = new Map(dump['people']!.map((p) => [p.id, p.clientId]));
    for (const f of items.filter((x) => !x.anonymous)) expect(people.get(f.personId!), f.id).toBe(f.clientId);
  });

  it('spreads the items across several modules', async () => {
    const { dump } = await world();
    expect(new Set(dump['moduleFeedback']!.map((f) => f.moduleId)).size).toBeGreaterThanOrEqual(4);
  });
});

describe('seed version 4: app feedback and tickets (assumption 54)', () => {
  it('has about 10 valid app feedback items covering ideas, problems and praise, from real users', async () => {
    const { dump } = await world();
    const items = (dump['appFeedback'] as unknown[]).map((f) => appFeedbackSchema.parse(f));
    expect(items.length).toBeGreaterThanOrEqual(9);
    expect(items.length).toBeLessThanOrEqual(11);
    expect(new Set(items.map((f) => f.kind))).toEqual(new Set(['idea', 'problem', 'praise']));
    const users = new Set(dump['users']!.map((u) => u.id));
    for (const f of items) expect(users.has(f.userId), f.id).toBe(true);
  });

  it('has 3 tickets at Little Acorns: Priya in progress, Jade resolved, Daniel received', async () => {
    const { dump, la, user } = await world();
    // Seed version 5 (M4) adds tickets from other clients, so look at Little Acorns' own.
    const tickets = (dump['tickets'] as unknown[]).map((t) => ticketSchema.parse(t)).filter((t) => t.clientId === la);
    expect(tickets).toHaveLength(3);
    expect(new Set(tickets.map((t) => t.number)).size).toBe(3);
    const by = (k: string) => tickets.find((t) => t.raisedBy === user(k))!;
    expect(by('priya')).toMatchObject({ status: 'inProgress', raiserSide: 'client' });
    expect(by('priya').firstResponseAt).toBeDefined();
    expect(by('jade')).toMatchObject({ status: 'resolved', raiserSide: 'staff' });
    expect(by('jade').resolvedAt).toBeDefined();
    expect(by('daniel')).toMatchObject({ status: 'received', raiserSide: 'client' });
    expect(by('daniel').firstResponseAt).toBeUndefined();
  });

  it("gives Priya's ticket one provider reply that the customer can see, written by a provider user", async () => {
    const { dump, user } = await world();
    const tickets = (dump['tickets'] as unknown[]).map((t) => ticketSchema.parse(t));
    const priya = tickets.find((t) => t.raisedBy === user('priya'))!;
    const messages = (dump['ticketMessages'] as unknown[])
      .map((m) => ticketMessageSchema.parse(m))
      .filter((m) => m.ticketId === priya.id);
    const provider = messages.filter((m) => m.side === 'provider');
    expect(provider).toHaveLength(1);
    expect(provider[0]!.internal).toBe(false);
    const providerUsers = new Set(dump['users']!.filter((u) => u.side === 'provider').map((u) => u.id));
    expect(providerUsers.has(provider[0]!.authorId)).toBe(true);
    for (const m of dump['ticketMessages']!) expect(tickets.some((t) => t.id === m.ticketId)).toBe(true);
  });
});

describe('seed version 4: rules and reminders (assumption 54, Conflict 5)', () => {
  async function rules() {
    const w = await world();
    const list = (w.dump['autoAssignRules'] as unknown[]).map((r) => autoAssignRuleSchema.parse(r));
    const byModule = (id: string) => list.find((r) => 'moduleId' in r.action && r.action.moduleId === id)!;
    return { ...w, list, byModule };
  }

  it('has exactly 3 rules at Little Acorns for the whole organisation', async () => {
    const { list, la } = await rules();
    expect(list).toHaveLength(3);
    for (const r of list) {
      expect(r.clientId).toBe(la);
      expect(r.siteId).toBeUndefined();
    }
  });

  it('has the induction rule on, for Practitioners, due in 14 days, when a person is added', async () => {
    const { byModule } = await rules();
    const practitioner = nurseryPack.jobRoles.find((j) => j.name === 'Practitioner')!;
    const r = byModule(moduleIds.newStarterInduction);
    expect(r).toMatchObject({ enabled: true, trigger: { type: 'personAdded' }, dueInDays: 14 });
    expect(r.filters.jobRoleIds).toEqual([practitioner.id]);
    expect(r.name).toMatch(/induction/i);
  });

  it('has the "What changed in September 2026" rule on for everyone on joining', async () => {
    const { byModule } = await rules();
    const r = byModule(moduleIds.whatChangedSeptember2026);
    expect(r).toMatchObject({ enabled: true, trigger: { type: 'personAdded' } });
    expect(r.filters).toEqual({});
  });

  it('has the Safeguarding refresher rule 60 days before expiry, switched off', async () => {
    const { byModule, keys } = await rules();
    const r = byModule(moduleIds.safeguardingAndWhistleblowing);
    expect(r.enabled).toBe(false);
    expect(r.trigger).toEqual({
      type: 'requirementExpiring',
      days: 60,
      requirementId: keys.requirements['safeguarding'],
    });
  });

  it("makes Sam's induction assignment(s) carry the induction rule id as their source", async () => {
    const { dump, keys, byModule } = await rules();
    const rule = byModule(moduleIds.newStarterInduction);
    const sam = (dump['assignments'] as { personId: string; source: unknown; target: object }[]).filter(
      (a) =>
        a.personId === keys.personas['sam'] &&
        'moduleId' in a.target &&
        a.target.moduleId === moduleIds.newStarterInduction,
    );
    expect(sam.length).toBeGreaterThanOrEqual(1);
    for (const a of sam) expect(a.source).toEqual({ ruleId: rule.id });
  });

  it("has no assignment from the refresher rule, and no open Safeguarding assignment for the cluster week's three people (Lucy, Hannah, Chris)", async () => {
    const { dump, keys, byModule, la } = await rules();
    const refresher = byModule(moduleIds.safeguardingAndWhistleblowing);
    expect(dump['assignments']!.some((a) => typeof a.source === 'object' && a.source.ruleId === refresher.id)).toBe(
      false,
    );
    const names = ['Lucy', 'Hannah', 'Chris'];
    const ids = dump['people']!.filter((p) => p.clientId === la && names.includes(p.firstName)).map((p) => p.id);
    expect(ids).toHaveLength(3);
    for (const a of dump['assignments']!) {
      if (!ids.includes(a.personId)) continue;
      const sg = 'moduleId' in a.target && a.target.moduleId === moduleIds.safeguardingAndWhistleblowing;
      expect(sg && a.status === 'open', a.id).toBe(false);
    }
    expect(keys.personas['lucy']).toBeDefined();
  });

  it('has a reminder log of a few reminders already sent in the past, for Little Acorns people, with week keys', async () => {
    const { dump, la } = await world();
    const log = (dump['reminderLog'] as unknown[]).map((r) => reminderLogSchema.parse(r));
    expect(log.length).toBeGreaterThanOrEqual(3);
    const people = new Set(dump['people']!.filter((p) => p.clientId === la).map((p) => p.id));
    for (const r of log) {
      expect(r.clientId).toBe(la);
      expect(people.has(r.personId)).toBe(true);
      expect(new Date(r.sentAt).getTime()).toBeLessThan(NOW.getTime());
      expect(r.key.startsWith(`${r.personId}:`), r.key).toBe(true);
    }
    expect(new Set(log.map((r) => r.key)).size).toBe(log.length);
  });
});

describe('seed version 4: submissions and their files (assumption 54)', () => {
  async function subs() {
    const w = await world();
    const list = (w.dump['evidenceSubmissions'] as unknown[]).map((s) => evidenceSubmissionSchema.parse(s));
    const person = (k: string) => w.keys.personas[k]!;
    return { ...w, list, person };
  }

  it("keeps Ben's Safeguarding certificate awaiting check (4 working days old)", async () => {
    const { list, person, keys } = await subs();
    const ben = list.find((s) => s.personId === person('ben'))!;
    expect(ben).toMatchObject({ status: 'awaitingCheck', requirementId: keys.requirements['safeguarding'] });
    expect(keys.submissions['ben']).toBe(ben.id);
    expect(daysAgo(ben.createdAt)).toBeGreaterThanOrEqual(4);
    expect(daysAgo(ben.createdAt)).toBeLessThanOrEqual(8);
  });

  it("has Ellie's food hygiene marked Needs a better copy, with a note from a reviewer", async () => {
    const { list, person, keys } = await subs();
    const ellie = list.find((s) => s.personId === person('ellie'))!;
    expect(ellie).toMatchObject({ status: 'needsBetterCopy', requirementId: keys.requirements['foodHygiene'] });
    expect(ellie.decisionNote?.length).toBeGreaterThan(0);
    expect(ellie.reviewerId).toBeDefined();
    expect(ellie.reviewedAt).toBeDefined();
  });

  it('has one earlier approved submission that points at the Evidence it created', async () => {
    const { list, dump, la } = await subs();
    expect(list).toHaveLength(3);
    const approved = list.filter((s) => s.status === 'approved');
    expect(approved).toHaveLength(1);
    const a = approved[0]!;
    expect(a.clientId).toBe(la);
    expect(a.reviewerId).toBeDefined();
    expect(a.reviewedAt).toBeDefined();
    expect(new Date(a.reviewedAt!).getTime()).toBeLessThan(NOW.getTime());
    const evidence = dump['evidence']!.find((e) => e.id === a.evidenceId);
    expect(evidence).toMatchObject({ personId: a.personId, requirementId: a.requirementId, kind: 'external' });
  });

  it('gives every submission a small fictional PDF file of the right person at the right client', async () => {
    const { list, dump } = await subs();
    for (const s of list) {
      const file = dump['attachments']!.find((a) => a.id === s.fileAttachmentId);
      expect(file, s.id).toBeDefined();
      expect(file).toMatchObject({
        kind: 'file',
        purpose: 'certificate',
        mime: 'application/pdf',
        clientId: s.clientId,
      });
      expect(file.personId).toBe(s.personId);
      expect(file.bytes).toBe(file.data.length);
      expect(file.bytes).toBeGreaterThan(0);
      expect(file.bytes).toBeLessThanOrEqual(20_000);
      expect(Array.from(file.data.slice(0, 5)) as number[]).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    }
  });
});

describe('seed version 4: themes (assumption 54)', () => {
  async function themes() {
    const w = await world();
    const list = (w.dump['themes'] as unknown[]).map((t) => themeSchema.parse(t)) as Theme[];
    const client = w.dump['clients']!.find((c) => c.id === w.la);
    return { ...w, list, client };
  }

  it('has "Little Acorns green" as the base theme in the client settings, with no schedule', async () => {
    const { list, client, la } = await themes();
    const green = list.find((t) => t.name === 'Little Acorns green')!;
    expect(green.clientId).toBe(la);
    expect(green.schedule).toBeUndefined();
    expect(client.settings.themeId).toBe(green.id);
  });

  it('has a Christmas theme scheduled from 1 December to 6 January', async () => {
    const { list, la } = await themes();
    const xmas = list.find((t) => /christmas/i.test(t.name))!;
    expect(xmas.clientId).toBe(la);
    expect(londonParts(xmas.schedule!.startAt).date).toBe('2026-12-01');
    expect(['2027-01-06', '2027-01-07']).toContain(londonParts(xmas.schedule!.endAt).date);
  });

  it('passes the contrast rules for every seeded theme', async () => {
    const { list } = await themes();
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const t of list) expect(validateTheme(t.tokens, themeBases.light), t.name).toEqual({ ok: true, failures: [] });
  });
});

describe('seed version 4: invoices, billing profiles and payment methods (assumption 54)', () => {
  it('has a billing profile for Little Acorns, Oak Tree and Willow Lane with card brand and last four digits only', async () => {
    const { dump, la, ot, wl } = await world();
    const profiles = (dump['billingProfiles'] as unknown[]).map((p) => billingProfileSchema.parse(p));
    for (const id of [la, ot, wl]) {
      const p = profiles.find((x) => x.clientId === id)!;
      expect(p, id).toBeDefined();
      expect(p.paymentMethod?.last4).toMatch(/^\d{4}$/);
    }
    expect(JSON.stringify(profiles)).not.toMatch(/\d{12,}/);
    expect(profiles.find((p) => p.clientId === ot)!.billingName).toBe('Oak Tree Nurseries');
  });

  it('has invoices for those clients whose totals add up and whose billing name is fixed at issue', async () => {
    const { dump, la, ot, wl } = await world();
    const invoices = (dump['invoices'] as unknown[]).map((i) => invoiceSchema.parse(i));
    for (const id of [la, ot, wl])
      expect(invoices.filter((i) => i.clientId === id).length, id).toBeGreaterThanOrEqual(2);
    for (const i of invoices) {
      expect(i.total, i.number).toBe(i.lines.reduce((n, l) => n + l.amount, 0) + i.tax);
      expect(new Date(i.issuedAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
    expect(new Set(invoices.map((i) => i.number)).size).toBe(invoices.length);
    expect(invoices.filter((i) => i.clientId === la).some((i) => i.status === 'paid')).toBe(true);
  });

  it("shows Willow Lane's Past due account with an overdue invoice, and no overdue invoice at Little Acorns", async () => {
    const { dump, la, wl } = await world();
    const invoices = (dump['invoices'] as unknown[]).map((i) => invoiceSchema.parse(i));
    expect(invoices.some((i) => i.clientId === wl && i.status === 'overdue')).toBe(true);
    expect(invoices.some((i) => i.clientId === la && (i.status === 'overdue' || i.status === 'due'))).toBe(false);
  });
});

describe('seed version 4: two-step sign-in states (assumption 5)', () => {
  it.each(['priya', 'oakTreeGroupAdmin', 'riversideManager', 'meadowManager', 'willowLaneOwner'])(
    '%s is enrolled',
    async (key) => {
      const { dump, keys } = await world();
      const u = dump['users']!.find((x) => x.id === keys.users[key]) as UserAccount;
      expect(twoFactorStatus(u, NOW)).toEqual({ kind: 'enrolled' });
      expect(u.twoFactor?.recoveryCodesLeft).toBeGreaterThan(0);
    },
  );

  it('has Daniel required since 2 days ago, inside the grace period with 5 days left', async () => {
    const { dump, keys } = await world();
    const u = dump['users']!.find((x) => x.id === keys.users['daniel']) as UserAccount;
    expect(u.twoFactor).toBeUndefined();
    expect(daysAgo(u.twoFactorRequiredSince!)).toBeGreaterThan(1.5);
    expect(daysAgo(u.twoFactorRequiredSince!)).toBeLessThan(2.5);
    expect(twoFactorStatus(u, NOW)).toEqual({ kind: 'grace', daysLeft: 5 });
  });

  it('has Colin Reeve required since 12 days ago, past grace and so limited', async () => {
    const { dump, keys } = await world();
    const u = dump['users']!.find((x) => x.id === keys.users['hillsideManager']) as UserAccount;
    expect(u.twoFactor).toBeUndefined();
    expect(daysAgo(u.twoFactorRequiredSince!)).toBeGreaterThan(11.5);
    expect(daysAgo(u.twoFactorRequiredSince!)).toBeLessThan(12.5);
    expect(twoFactorStatus(u, NOW)).toEqual({ kind: 'limited' });
  });

  it('asks every client admin (and only them) for two-step sign-in, never staff or provider users', async () => {
    const { dump } = await world();
    const adminPeople = new Set(
      dump['roleAssignments']!.filter(
        (a) => dump['roles']!.find((r) => r.id === a.roleIds[0])?.owner !== 'provider',
      ).map((a) => a.userId),
    );
    const users = dump['users'] as UserAccount[];
    for (const u of users.filter((x) => x.side === 'staff')) {
      expect(u.twoFactorRequiredSince, u.displayName).toBeUndefined();
      expect(u.twoFactor).toBeUndefined();
    }
    for (const u of users.filter((x) => x.side === 'client')) {
      expect(adminPeople.has(u.id), u.displayName).toBe(true);
      expect(u.twoFactorRequiredSince, u.displayName).toBeDefined();
    }
    for (const u of users.filter((x) => x.side === 'provider')) expect(u.twoFactorRequiredSince).toBeUndefined();
  });

  it("keeps the provider members' M0 states (all enrolled except the read-only member)", async () => {
    const { dump, keys } = await world();
    const has = (k: string) => dump['users']!.find((x) => x.id === keys.users[k])!.twoFactor !== undefined;
    expect(['providerOwner', 'sophie', 'raj', 'megan'].map(has)).toEqual([true, true, true, true]);
    expect(has('tom')).toBe(false);
  });
});

describe('seed version 4: onboarding checklist (assumption 10)', () => {
  it('has Little Acorns with every step done except "set up a competition", so it is not complete', async () => {
    const { dump, la } = await world();
    const rows = (dump['onboarding'] as unknown[]).map((o) => onboardingChecklistSchema.parse(o));
    const row = rows.find((r) => r.clientId === la)!;
    expect(row.steps.map((s) => s.key)).toEqual([
      'inviteStaff',
      'reminderSettings',
      'assignTraining',
      'setUpCompetition',
      'exportMatrix',
    ]);
    const done = (k: string) => row.steps.find((s) => s.key === k)!.doneAt;
    for (const k of ['inviteStaff', 'reminderSettings', 'assignTraining', 'exportMatrix']) {
      expect(done(k), k).toBeDefined();
      expect(new Date(done(k)!).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
    expect(done('setUpCompetition')).toBeUndefined();
    expect(row.completedAt).toBeUndefined();
    expect(new Date(row.startedAt).getTime()).toBeLessThan(NOW.getTime());
  });
});

describe('seeded rules through the data layer (M3 review fix)', () => {
  it('writes nothing when the jobs run on a fresh seed, today or tomorrow (so the app can run them at boot)', async () => {
    const s = await world();
    const before = hashStores((await s.admin.dumpAll()) as Dump);
    await s.admin.runJobs(TODAY);
    await s.admin.runJobs(new Date(Date.parse(TODAY) + DAY).toISOString());
    expect(hashStores((await s.admin.dumpAll()) as Dump)).toEqual(before);
  });

  const actorOf = (s: Awaited<ReturnType<typeof world>>) =>
    ({ userId: s.user('priya'), side: 'client', clientId: s.la, now: TODAY }) as const;

  it('saves every seeded rule unchanged without an error', async () => {
    const s = await world();
    const actor = actorOf(s);
    const rules = await s.handle.store.autoAssign.list(actor);
    expect(rules.length).toBe(3);
    for (const r of rules) {
      const { id, clientId: _clientId, ...rest } = r;
      await expect(s.handle.store.autoAssign.save(actor, { ...rest, id }), r.name).resolves.toBeDefined();
    }
  });

  it('points the induction rule at a published module that exists', async () => {
    const s = await world();
    const mod = (s.dump['modules'] as Module[]).find((m) => m.id === moduleIds.newStarterInduction);
    expect(mod?.status).toBe('published');
    expect(mod?.draftContent).toBe(true);
  });

  it('preview counts the same people that running the rule assigns', async () => {
    const s = await world();
    const actor = actorOf(s);
    const refresher = (await s.handle.store.autoAssign.list(actor)).find(
      (r) => 'moduleId' in r.action && r.action.moduleId === moduleIds.safeguardingAndWhistleblowing,
    )!;
    await s.handle.store.autoAssign.setEnabled(actor, refresher.id, true);
    const before = await s.handle.store.autoAssign.preview(actor, refresher.id);
    expect(before.count).toBeGreaterThan(0);
    await s.admin.runJobs(TODAY);
    const made = await s.handle.store.autoAssign.history(actor, refresher.id);
    expect(new Set(made.map((a) => a.personId))).toEqual(new Set(before.personIds));
  });

  it('previews nothing, and assigns nothing, when the rule points at a module that is not published', async () => {
    const s = await world();
    const actor = actorOf(s);
    const refresher = (await s.handle.store.autoAssign.list(actor)).find(
      (r) => 'moduleId' in r.action && r.action.moduleId === moduleIds.safeguardingAndWhistleblowing,
    )!;
    await s.handle.store.autoAssign.setEnabled(actor, refresher.id, true);
    const sg = (s.dump['modules'] as Module[]).find((m) => m.id === moduleIds.safeguardingAndWhistleblowing)!;
    await s.admin.bulkPut('modules', [{ ...sg, status: 'draft' }]);
    expect((await s.handle.store.autoAssign.preview(actor, refresher.id)).count).toBe(0);
    await s.admin.runJobs(TODAY);
    expect(await s.handle.store.autoAssign.history(actor, refresher.id)).toHaveLength(0);
  });
});

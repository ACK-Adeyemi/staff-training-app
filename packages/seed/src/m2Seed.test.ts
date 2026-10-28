// M2 chunk 10 (plan F-11; assumptions 33 to 35): the seed's deterministic history, notes, organising data,
// competitions and prefs. The hard constraints are pinned through domain functions, not hand-computed numbers.
import { describe, expect, it } from 'vitest';
import { moduleIds, nurseryModules } from '@sta/content';
import {
  competitionMetric,
  competitionStatus,
  displayName,
  leaderboardView,
  needsAttention,
  orgCompliance,
  standingBoard,
  type Assignment,
  type Attempt,
  type Category,
  type Competition,
  type Evidence,
  type LearningEvent,
  type Module,
  type ModuleGroup,
  type ModulePlacement,
  type Note,
  type Person,
  type Requirement,
  type StandingBoardSettings,
  type Team,
  type UserAccount,
} from '@sta/domain';
import { SEED_VERSION, load } from './index';
import { freshStore, hashStores, seeded, SEED, TODAY } from './testing';

const DAY = 86_400_000;
const NOW = new Date(TODAY);
const daysFromToday = (iso: string) => (new Date(iso).getTime() - NOW.getTime()) / DAY;
const sgId = moduleIds.safeguardingAndWhistleblowing;
const linked = new Set<string>([sgId, moduleIds.paediatricFirstAid, moduleIds.whatChangedSeptember2026]);
const optional = new Set<string>([moduleIds.safeEatingAllergiesAndChoking, moduleIds.saferSleep]);

async function world() {
  const s = await seeded();
  const { dump, keys } = s;
  const clientId = keys.clients['littleAcorns']!;
  const mine = <T extends { clientId: string }>(rows: unknown): T[] =>
    (rows as T[]).filter((r) => r.clientId === clientId);
  const people = mine<Person>(dump['people']);
  const id = (k: string) => keys.personas[k]!;
  return {
    ...s,
    clientId,
    people,
    teams: mine<Team>(dump['teams']),
    events: mine<LearningEvent>(dump['learningEvents']),
    attempts: mine<Attempt>(dump['attempts']),
    assignments: mine<Assignment>(dump['assignments']),
    evidence: mine<Evidence>(dump['evidence']),
    notes: mine<Note>(dump['notes']),
    competitions: mine<Competition>(dump['competitions']),
    requirements: dump['requirements'] as Requirement[],
    modules: dump['modules'] as Module[],
    id,
  };
}
type W = Awaited<ReturnType<typeof world>>;

function boardInput(w: W, events: LearningEvent[] = w.events, attempts: Attempt[] = w.attempts) {
  return {
    people: w.people,
    teams: w.teams,
    events,
    attempts,
    assignments: w.assignments,
    evidence: w.evidence,
    requirements: w.requirements,
    modules: w.modules,
    now: NOW,
  };
}

function jadePosition(w: W, events: LearningEvent[] = w.events, attempts: Attempt[] = w.attempts) {
  const result = standingBoard('correctQuestions', 'allTime', boardInput(w, events, attempts));
  const entries = [...result.values].map(([id, value]) => ({
    id,
    value,
    name: displayName(w.people.find((p) => p.id === id)!),
  }));
  const hiddenIds = new Set(w.people.filter((p) => p.prefs.hideFromLeaderboards).map((p) => p.id));
  const view = leaderboardView({ entries, viewerId: w.id('jade'), hiddenIds, rowsVisible: true, limit: 50 });
  return { view, values: result.values };
}

describe('seed version (assumption 33; 4 after M3)', () => {
  it('is 5 and load stores it', async () => {
    expect(SEED_VERSION).toBe(5);
    const { admin } = await seeded();
    expect((await admin.getSeedMeta())?.seedVersion).toBe(5);
  });

  it('is deterministic: two loads with the same seed give identical stores, including the new ones', async () => {
    const a = await seeded();
    const b = freshStore();
    await load(b.admin, SEED);
    const second = (await b.admin.dumpAll()) as Record<string, unknown[]>;
    expect(a.dump['learningEvents']!.length).toBeGreaterThan(100);
    expect(hashStores(second)).toEqual(hashStores(a.dump));
  });
});

describe('unchanged compliance (assumption 34 hard constraints)', () => {
  it('leaves every Evidence record and certificate submission exactly as the M1 seed had them', async () => {
    const { dump, keys } = await seeded();
    // M3 adds more submissions; Ben's is still the one the M1 seed had.
    const ben = dump['evidenceSubmissions']!.filter((s) => s.personId === keys.personas['ben']);
    const h = hashStores({ evidence: dump['evidence']!, evidenceSubmissions: ben });
    expect(h).toEqual({
      evidence: '13e63b3b3477c14d929b95a39adb6958f57139fe072f4b249f3f7da5bd085ca8',
      evidenceSubmissions: '913eb261cacbf6c01edf250c3307bcb7d24148adf5d569f176f6dd83b7e1c3b9',
    });
  });

  it('keeps C1 at the six needs-attention items and 11 of 14', async () => {
    const w = await world();
    const client = w.dump['clients']!.find((c) => c.id === w.clientId);
    const view = {
      people: w.people,
      sites: w.dump['sites']!.filter((s) => s.clientId === w.clientId),
      requirements: w.requirements.filter((r) => r.packId === client.industryPackId),
      evidence: w.evidence,
      submissions: w.dump['evidenceSubmissions']!.filter((s) => s.clientId === w.clientId),
      now: NOW,
      amberWindowDays: client.settings.amberWindowDays as number,
    };
    expect(needsAttention(view).map((i) => i.person.firstName)).toEqual([
      'Mark',
      'Lucy',
      'Hannah',
      'Chris',
      'Maureen',
      'Amira',
    ]);
    expect(orgCompliance(view)).toEqual({ compliant: 11, total: 14 });
  });

  it('seeds a passed attempt of a requirement-linked module only where Evidence of kind module matches it', async () => {
    const w = await world();
    const own = new Set(w.modules.filter((m) => m.owner !== 'provider').map((m) => m.id)); // M3 own modules
    const passed = w.attempts.filter((a) => a.passed === true && !a.abandoned);
    expect(passed.length).toBeGreaterThan(0);
    for (const a of passed) {
      if (linked.has(a.moduleId)) {
        const match = w.evidence.find(
          (e) =>
            e.kind === 'module' &&
            e.personId === a.personId &&
            e.moduleId === a.moduleId &&
            e.completedAt === a.finishedAt,
        );
        expect(match, `${a.id} has no matching Evidence`).toBeDefined();
      } else {
        expect(
          optional.has(a.moduleId) || own.has(a.moduleId),
          `${a.id} passes a module that is neither linked nor optional`,
        ).toBe(true);
      }
    }
    expect(passed.some((a) => optional.has(a.moduleId))).toBe(true);
  });
});

describe('history (assumption 34)', () => {
  it('is only for Little Acorns in M2, never in the future, and refers to real attempts and modules', async () => {
    const { dump, clientId } = await world();
    // M3 adds Oak Tree and Willow Lane history; this is still the Little Acorns part.
    const all = (dump['learningEvents'] as LearningEvent[]).filter((e) => e.clientId === clientId);
    expect(all.length).toBeGreaterThan(300);
    expect(all.every((e) => new Date(e.at).getTime() <= NOW.getTime())).toBe(true);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    const attemptIds = new Set((dump['attempts'] as Attempt[]).map((a) => a.id));
    for (const e of all.filter((x) => x.attemptId !== undefined)) expect(attemptIds.has(e.attemptId!)).toBe(true);
    // M3 adds Little Acorns' own Fire evacuation module to the modules its history refers to.
    const moduleSet = new Set((dump['modules'] as Module[]).map((m) => m.id));
    for (const e of all.filter((x) => x.moduleId !== undefined)) expect(moduleSet.has(e.moduleId!)).toBe(true);
  });

  it('spans about six months, with Jade frequent and accurate', async () => {
    const w = await world();
    const mine = w.events.filter((e) => e.personId === w.id('jade'));
    const oldest = Math.min(...mine.map((e) => new Date(e.at).getTime()));
    expect((NOW.getTime() - oldest) / DAY).toBeGreaterThan(150);
    expect((NOW.getTime() - oldest) / DAY).toBeLessThan(190);
    const weeks = new Set(mine.map((e) => Math.floor(new Date(e.at).getTime() / (7 * DAY))));
    expect(weeks.size).toBeGreaterThanOrEqual(14);
    const answers = mine.filter((e) => e.type === 'questionAnswered');
    expect(answers.length).toBeGreaterThan(50);
    expect(answers.filter((e) => e.correct).length / answers.length).toBeGreaterThan(0.8);
  });

  it('gives Maureen occasional activity, less than Jade', async () => {
    const w = await world();
    const count = (k: string) => w.events.filter((e) => e.personId === w.id(k)).length;
    expect(count('maureen')).toBeGreaterThan(0);
    expect(count('maureen')).toBeLessThan(count('jade') / 2);
  });

  it('gives Sam two weeks only, starting no earlier than his start date', async () => {
    const w = await world();
    const sam = w.people.find((p) => p.id === w.id('sam'))!;
    const mine = w.events.filter((e) => e.personId === sam.id);
    expect(mine.length).toBeGreaterThan(0);
    const times = mine.map((e) => new Date(e.at).getTime());
    expect((NOW.getTime() - Math.min(...times)) / DAY).toBeLessThanOrEqual(14);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(new Date(sam.startDate).getTime());
  });

  it('gives Grace nothing in the last 30 days while she is on leave, and Olivia nothing after she left', async () => {
    const w = await world();
    const grace = w.events.filter((e) => e.personId === w.id('grace'));
    expect(grace.every((e) => (NOW.getTime() - new Date(e.at).getTime()) / DAY > 30)).toBe(true);
    const olivia = w.people.find((p) => p.id === w.id('olivia'))!;
    expect(olivia.leftDate).toBeDefined();
    const after = w.events.filter(
      (e) => e.personId === olivia.id && new Date(e.at).getTime() > new Date(olivia.leftDate!).getTime(),
    );
    expect(after).toEqual([]);
    expect(w.events.some((e) => e.personId === olivia.id)).toBe(true);
  });

  it('gives Jade no Safeguarding events or answers and no unfinished attempts, so Track A starts clean', async () => {
    const w = await world();
    const jade = w.id('jade');
    expect(w.events.filter((e) => e.personId === jade && e.moduleId === sgId)).toEqual([]);
    expect(w.attempts.filter((a) => a.personId === jade && a.moduleId === sgId)).toEqual([]);
    const mine = w.attempts.filter((a) => a.personId === jade);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a) => a.finishedAt !== undefined || a.abandoned === true)).toBe(true);
    expect(mine.filter((a) => a.finishedAt === undefined && a.abandoned !== true)).toEqual([]);
    const started = w.events.filter((e) => e.personId === jade && e.type === 'attemptStarted');
    const finished = new Set(
      w.events.filter((e) => e.personId === jade && e.type === 'attemptFinished').map((e) => e.attemptId),
    );
    for (const s of started) expect(finished.has(s.attemptId), `${s.attemptId} never finished`).toBe(true);
  });

  it('has finished attempts that carry a score and a pass flag', async () => {
    const w = await world();
    const finished = w.attempts.filter((a) => !a.abandoned);
    expect(finished.length).toBeGreaterThan(10);
    for (const a of finished) {
      expect(a.finishedAt, a.id).toBeDefined();
      expect(typeof a.score, a.id).toBe('number');
      expect(typeof a.passed, a.id).toBe('boolean');
    }
  });

  it('feeds C8: seeded Learn more opens and one lesson with visible drop-off', async () => {
    const w = await world();
    expect(w.events.filter((e) => e.type === 'learnMoreOpened').length).toBeGreaterThanOrEqual(3);
    const viewed = new Map<string, number>();
    const done = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const e of w.events) {
      if (!e.moduleId || !e.lessonId) continue;
      if (e.type === 'lessonViewed') bump(viewed, `${e.moduleId}|${e.lessonId}`);
      if (e.type === 'lessonCompleted') bump(done, `${e.moduleId}|${e.lessonId}`);
    }
    const dropoffs = [...viewed].filter(([k, v]) => v >= 5 && (done.get(k) ?? 0) / v <= 0.75);
    expect(dropoffs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Most questions answered correctly (assumption 34, BP-2)', () => {
  it('has Daniel first by more than the Safeguarding bank over Jade, who is second of 13 with a clear gap to third', async () => {
    const w = await world();
    const bank = nurseryModules.find((m) => m.id === sgId)!.questions.length;
    const { view, values } = jadePosition(w);
    const v = (k: string) => values.get(w.id(k)) ?? 0;
    expect(v('daniel') - v('jade')).toBeGreaterThan(bank);
    const others = [...values].filter(([id]) => id !== w.id('daniel') && id !== w.id('jade')).map(([, x]) => x);
    expect(v('jade') - Math.max(...others)).toBeGreaterThanOrEqual(3);
    expect(view.viewer).toMatchObject({ rank: 2, of: 13 });
  });

  it('keeps Jade 2nd of 13 after she passes Safeguarding with full marks', async () => {
    const w = await world();
    const mod = nurseryModules.find((m) => m.id === sgId)!;
    const jade = w.people.find((p) => p.id === w.id('jade'))!;
    const attemptId = 'TRACKA00000000000000000001';
    const base = { clientId: w.clientId, siteId: jade.primarySiteId, personId: jade.id, moduleId: sgId };
    const attempt: Attempt = {
      ...base,
      id: attemptId,
      moduleVersion: mod.version,
      mode: 'open',
      questionIds: mod.questions.map((q) => q.id),
      startedAt: TODAY,
      finishedAt: TODAY,
      score: 100,
      passed: true,
    };
    const answers: LearningEvent[] = mod.questions.map((q, i) => ({
      ...base,
      id: `TRACKA${String(i).padStart(19, '0')}`,
      at: TODAY,
      type: 'questionAnswered',
      attemptId,
      questionId: q.id,
      correct: true,
      notesVisible: false,
      attemptMode: 'open',
    }));
    const { view } = jadePosition(w, [...w.events, ...answers], [...w.attempts, attempt]);
    expect(view.viewer).toMatchObject({ rank: 2, of: 13 });
    const daniel = jadePosition(w, [...w.events, ...answers], [...w.attempts, attempt]).values.get(w.id('daniel'))!;
    const jadeValue = jadePosition(w, [...w.events, ...answers], [...w.attempts, attempt]).values.get(w.id('jade'))!;
    expect(daniel).toBeGreaterThan(jadeValue);
  });
});

describe('prefs (assumption 35)', () => {
  it('has sound off for everyone and Maureen on simple view at 150 per cent text with read aloud on', async () => {
    const w = await world();
    for (const p of w.people) expect(p.prefs.sound, p.firstName).toBe(false);
    const m = w.people.find((p) => p.id === w.id('maureen'))!;
    expect(m.prefs).toMatchObject({ simpleView: true, textScale: 1.5, readAloud: true });
  });
});

describe('notes (assumption 35)', () => {
  it('gives each current persona with a staff user 3 to 6 notes of their own, and some are starred', async () => {
    const w = await world();
    const users = w.dump['users'] as UserAccount[];
    const staff = w.people.filter(
      (p) =>
        (p.status === 'active' || p.status === 'onLeave') &&
        users.some((u) => u.personId === p.id && u.side === 'staff'),
    );
    expect(staff.length).toBeGreaterThanOrEqual(10);
    for (const p of staff) {
      const n = w.notes.filter((x) => x.personId === p.id).length;
      expect(n, p.firstName).toBeGreaterThanOrEqual(3);
      expect(n, p.firstName).toBeLessThanOrEqual(6);
    }
    expect(w.notes.some((n) => n.starred)).toBe(true);
    expect(w.notes.every((n) => n.starred)).toBe(false);
    expect(w.notes.every((n) => n.clientId === w.clientId)).toBe(true);
  });

  it('gives Jade notes on Paediatric first aid and Safer sleep and none on Safeguarding', async () => {
    const w = await world();
    const mine = w.notes.filter((n) => n.personId === w.id('jade'));
    expect(mine.some((n) => n.moduleId === moduleIds.paediatricFirstAid)).toBe(true);
    expect(mine.some((n) => n.moduleId === moduleIds.saferSleep)).toBe(true);
    expect(w.notes.filter((n) => n.moduleId === sgId && n.personId === w.id('jade'))).toEqual([]);
  });
});

describe('categories, groups and placements (assumption 35)', () => {
  const names = [
    'Safeguarding',
    'Health and safety',
    'Food and nutrition',
    'Sleep and wellbeing',
    'Induction',
    'Our policies',
  ];

  it.each(['littleAcorns', 'oakTree'])('%s has the six categories in order', async (key) => {
    const { dump, keys } = await seeded();
    const cats = (dump['categories'] as Category[])
      .filter((c) => c.clientId === keys.clients[key])
      .sort((a, b) => a.order - b.order);
    expect(cats.map((c) => c.name)).toEqual(names);
  });

  it.each(['littleAcorns', 'oakTree'])('%s has the three groups with the right modules and order', async (key) => {
    const { dump, keys } = await seeded();
    const groups = (dump['moduleGroups'] as ModuleGroup[]).filter((g) => g.clientId === keys.clients[key]);
    expect(groups).toHaveLength(3);
    const by = (name: string) => groups.find((g) => g.name === name)!;
    expect(by('New starter induction')).toMatchObject({
      inOrder: true,
      moduleIds: [
        sgId,
        moduleIds.paediatricFirstAid,
        moduleIds.safeEatingAllergiesAndChoking,
        moduleIds.saferSleep,
        moduleIds.whatChangedSeptember2026,
      ],
    });
    expect(by('Baby room essentials').moduleIds).toEqual([
      moduleIds.saferSleep,
      moduleIds.safeEatingAllergiesAndChoking,
      moduleIds.paediatricFirstAid,
    ]);
    expect(by('Annual refreshers').moduleIds).toEqual([sgId, moduleIds.paediatricFirstAid]);
  });

  it.each(['littleAcorns', 'oakTree'])('%s places every nursery module and available to all', async (key) => {
    const { dump, keys } = await seeded();
    const cid = keys.clients[key];
    const placements = (dump['modulePlacements'] as ModulePlacement[]).filter((p) => p.clientId === cid);
    expect(placements.map((p) => p.moduleId).sort()).toEqual(nurseryModules.map((m) => m.id).sort());
    expect(placements.every((p) => p.availableToAll)).toBe(true);
    const catIds = new Set((dump['categories'] as Category[]).filter((c) => c.clientId === cid).map((c) => c.id));
    for (const p of placements) if (p.categoryId !== undefined) expect(catIds.has(p.categoryId)).toBe(true);
  });

  it('seeds a past Safer sleep assignment for the Baby and Toddler rooms, due last month, mostly done on time', async () => {
    const w = await world();
    const sleep = w.assignments.filter((a) => 'moduleId' in a.target && a.target.moduleId === moduleIds.saferSleep);
    const teamId = (name: string) => w.teams.find((t) => t.name === name)!.id;
    for (const name of ['Baby room', 'Toddler room']) {
      const rows = sleep.filter((a) => w.people.find((p) => p.id === a.personId)!.teamIds.includes(teamId(name)));
      expect(rows.length, name).toBeGreaterThanOrEqual(3);
      for (const a of rows) {
        expect(new Date(a.dueAt).toISOString().slice(0, 7), name).toBe('2026-09');
      }
      expect(rows.filter((a) => a.status === 'done').length / rows.length, name).toBeGreaterThanOrEqual(0.6);
    }
    const board = standingBoard('teamBoard', 'allTime', boardInput(w));
    for (const name of ['Baby room', 'Toddler room']) {
      expect(board.unranked?.has(teamId(name)), name).toBeFalsy();
      expect(board.values.get(teamId(name)), name).toBeGreaterThanOrEqual(50);
    }
  });
});

describe('competitions at Little Acorns (assumption 35)', () => {
  const byName = (w: W, name: string) => w.competitions.find((c) => c.name === name)!;

  it('has exactly the four, with the derived statuses', async () => {
    const w = await world();
    expect(w.competitions.map((c) => c.name).sort()).toEqual(
      ['Autumn Complete and Win', 'Closed-Book Challenge', 'Mastery Month', 'Staff bake-off'].sort(),
    );
    const status = (n: string) => competitionStatus(byName(w, n), NOW);
    expect(status('Mastery Month')).toBe('live');
    expect(status('Staff bake-off')).toBe('live');
    expect(status('Autumn Complete and Win')).toBe('ended');
    expect(status('Closed-Book Challenge')).toBe('scheduled');
  });

  it('sets up Mastery Month as built-in with a live top-3 leaderboard and at least 5 people on the board', async () => {
    const w = await world();
    const c = byName(w, 'Mastery Month');
    expect(c).toMatchObject({ type: 'builtIn', templateId: 'masteryMonth', liveLeaderboard: true });
    expect(c.winnerSelection).toBe('top');
    expect(c.winnerCount).toBe(3);
    expect(daysFromToday(c.startAt)).toBeCloseTo(-10, 0);
    expect(daysFromToday(c.endAt)).toBeCloseTo(20, 0);
    const r = competitionMetric('masteryMonth', { competition: c, ...boardInput(w) });
    expect([...r.values.values()].filter((v) => v > 0).length).toBeGreaterThanOrEqual(5);
  });

  it('makes Staff bake-off a custom live competition', async () => {
    const w = await world();
    const c = byName(w, 'Staff bake-off');
    expect(c.type).toBe('custom');
    expect(c.templateId).toBeUndefined();
  });

  it('ends Autumn Complete and Win 20 days ago on Safer sleep and Safer eating with one recorded draw winner who qualifies', async () => {
    const w = await world();
    const c = byName(w, 'Autumn Complete and Win');
    expect(c).toMatchObject({ type: 'builtIn', templateId: 'completeAndWin', winnerSelection: 'draw' });
    expect([...(c.moduleIds ?? [])].sort()).toEqual(
      [moduleIds.saferSleep, moduleIds.safeEatingAllergiesAndChoking].sort(),
    );
    expect(daysFromToday(c.endAt)).toBeCloseTo(-20, 0);
    expect(c.winners).toHaveLength(1);
    const winner = c.winners![0]!;
    expect(winner.personId).toBeDefined();
    const r = competitionMetric('completeAndWin', { competition: c, ...boardInput(w) });
    expect(r.qualifies?.has(winner.personId!)).toBe(true);
  });

  it('schedules the Closed-Book Challenge from today plus 5 days for 30 days across all modules', async () => {
    const w = await world();
    const c = byName(w, 'Closed-Book Challenge');
    expect(c).toMatchObject({ type: 'builtIn', templateId: 'closedBookChallenge', closedBookOnly: true });
    expect(daysFromToday(c.startAt)).toBeCloseTo(5, 0);
    expect((new Date(c.endAt).getTime() - new Date(c.startAt).getTime()) / DAY).toBeCloseTo(30, 0);
    expect(c.moduleIds ?? []).toEqual([]);
  });

  it('turns every standing board on for Little Acorns with staff scope site', async () => {
    const { dump, keys } = await seeded();
    const rows = (dump['standingBoardSettings'] as StandingBoardSettings[]).filter(
      (s) => s.clientId === keys.clients['littleAcorns'],
    );
    expect(rows).toHaveLength(1);
    const boards = rows[0]!.boards;
    for (const id of [
      'correctQuestions',
      'modulesCompleted',
      'modulesMastered',
      'activeWeeks',
      'refresherChampions',
      'teamBoard',
    ] as const) {
      expect(boards[id], id).toEqual({ enabled: true, staffScopes: ['site'] });
    }
  });
});

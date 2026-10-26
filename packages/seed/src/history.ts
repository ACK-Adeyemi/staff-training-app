// M2 chunk 10 seed (plan assumptions 34 and 35): learning history, notes, organising data, competitions and board
// settings. Every random draw comes from the `history` stream, so no other stream (and no Evidence record) moves.
// History is hand-shaped per person and built from the same domain functions the data layer uses. It never writes
// Evidence, so no requirement status changes. Passed attempts of requirement-linked modules exist only where Evidence of
// kind `module` already has the same module and `completedAt`; every other pass is of an optional module.
import { moduleIds } from '@sta/content';
import {
  addDays,
  checkAnswer,
  competitionMetric,
  defaultBoardSettings,
  drawQuestions,
  drawWinners,
  scoreAttempt,
  ulid,
  type Answer,
  type Assignment,
  type Attempt,
  type Category,
  type Clock,
  type Competition,
  type LearningEvent,
  type Module,
  type ModuleGroup,
  type ModulePlacement,
  type Note,
  type Person,
  type Question,
  type Rng,
} from '@sta/domain';
import type { SeedData, SeedKeys } from './world';

const need = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Seed: a record the history refers to is missing');
  return value;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

type Mode = 'open' | 'closed';
type AttemptSpec = {
  /** Finish at exactly this time (used to match Evidence); otherwise start here. */
  start?: Date;
  finish?: Date;
  questionIds?: string[];
  wrongIds?: string[];
  mode?: Mode;
};

/** Every root-to-ending path of choice ids in a scenario question. */
function scenarioPaths(q: Question): string[][] {
  const steps = q.scenario?.steps ?? [];
  const walk = (index: number, acc: string[]): string[][] => {
    const step = steps.at(index);
    if (!step) return [];
    return step.choices.flatMap((c) => {
      const path = [...acc, c.id];
      if (c.next === undefined) return [path];
      return walk(
        steps.findIndex((s) => s.id === c.next),
        path,
      );
    });
  };
  return walk(0, []);
}

/** An answer that is right (or wrong), checked with the same function the data layer uses. */
function answerFor(q: Question, correct: boolean): Answer {
  if (q.type === 'scenario') {
    const choiceIds = scenarioPaths(q).find((p) => checkAnswer(q, { choiceIds: p }).correct === correct);
    if (!choiceIds) throw new Error(`Seed: no ${correct ? 'best' : 'poor'} path in ${q.id}`);
    return { choiceIds };
  }
  const option = (q.options ?? []).find((o) => o.correct === correct);
  if (!option) throw new Error(`Seed: no ${correct ? 'correct' : 'wrong'} option in ${q.id}`);
  return { optionId: option.id };
}

const NOTE_TEXT: Record<string, string[]> = {
  [moduleIds.safeguardingAndWhistleblowing]: [
    'Tell the DSL straight away and write down what I saw in my own words.',
    'The whistleblowing line is there for concerns about an adult. I will not be treated unfairly.',
    'Record facts, not opinions. Do not promise a child I will keep a secret.',
    'Check who the DSL is on each shift.',
  ],
  [moduleIds.paediatricFirstAid]: [
    'Check for danger first, then response, then breathing.',
    'Know where the first aid box and the accident book are in every room.',
    'Tell parents the same day about any bump to the head.',
    'Practise the choking steps with the room leader.',
  ],
  [moduleIds.safeEatingAllergiesAndChoking]: [
    'Check the allergy list before every meal, not just at the start of the week.',
    'Small, soft pieces for the youngest children, and always sit with them.',
    'Grapes are cut lengthways, never left whole.',
    'Wash hands and wipe surfaces between children with different allergies.',
  ],
  [moduleIds.saferSleep]: [
    'Babies sleep on their backs, feet to the foot of the cot, with nothing loose in the cot.',
    'Check sleeping babies at the set times and write each check down.',
    'Room temperature check at every sleep time.',
    'No hats or bibs in the cot.',
  ],
  [moduleIds.whatChangedSeptember2026]: [
    'Read the new ratios note again before my next shift.',
    'Ask the manager which of the changes affect our room.',
    'The new rules start this term, so the room plan needs updating.',
    'Remember to sign the updated policy.',
  ],
};

type NoteSpec = [module: string, lessonIndex: number, starred?: boolean];

export function buildHistory(input: { data: SeedData; keys: SeedKeys; today: Date; clock: Clock; rng: Rng }): void {
  const { data, keys, today, clock, rng } = input;
  const iso = (d: Date): string => d.toISOString();
  const newId = (): string => ulid(clock, rng);
  const ago = (days: number, minutes = 0): Date => new Date(addDays(today, -days).getTime() + minutes * MINUTE);

  const m = {
    sg: moduleIds.safeguardingAndWhistleblowing,
    paed: moduleIds.paediatricFirstAid,
    eating: moduleIds.safeEatingAllergiesAndChoking,
    sleep: moduleIds.saferSleep,
    wc: moduleIds.whatChangedSeptember2026,
  };
  const moduleOf = (id: string): Module => {
    const found = data.modules.find((x) => x.id === id);
    if (!found) throw new Error(`Seed: unknown module ${id}`);
    return found;
  };
  const personOf = (key: string): Person => {
    const found = data.people.find((p) => p.id === keys.personas[key]);
    if (!found) throw new Error(`Seed: unknown person ${key}`);
    return found;
  };
  const clientId = need(keys.clients['littleAcorns']);

  const events: LearningEvent[] = [];
  const attempts: Attempt[] = [];

  const ev = (p: Person, at: Date, type: LearningEvent['type'], extra: Partial<LearningEvent> = {}): void => {
    events.push({
      id: newId(),
      clientId: p.clientId,
      siteId: p.primarySiteId,
      personId: p.id,
      at: iso(at),
      type,
      ...extra,
    });
  };

  const login = (p: Person, days: number[], minute = 0): void => {
    for (const d of days) ev(p, ago(d, minute), 'login');
  };

  /** Views the first `count` lessons (default all). `complete` false leaves the last one viewed but not finished. */
  const lessons = (
    p: Person,
    mod: Module,
    start: Date,
    opts: { count?: number; leaveLastOpen?: boolean } = {},
  ): Date => {
    const list = mod.lessons.slice(0, opts.count ?? mod.lessons.length);
    let t = start.getTime();
    list.forEach((lesson, i) => {
      const base = { moduleId: mod.id, moduleVersion: mod.version, lessonId: lesson.id };
      ev(p, new Date(t), 'lessonViewed', base);
      t += Math.max(2, Math.round(lesson.minutes)) * MINUTE;
      if (!(opts.leaveLastOpen && i === list.length - 1)) ev(p, new Date(t), 'lessonCompleted', base);
    });
    return new Date(t + MINUTE);
  };

  const attempt = (p: Person, mod: Module, spec: AttemptSpec): { passed: boolean; finishedAt: Date } => {
    const id = newId();
    const mode: Mode = spec.mode ?? 'open';
    const draw = spec.questionIds ? undefined : drawQuestions(mod, rng.fork(id));
    const questionIds = spec.questionIds ?? draw?.questionIds ?? [];
    const n = questionIds.length;
    const finish = spec.finish ?? new Date((spec.start as Date).getTime() + (n + 1) * MINUTE);
    const start = spec.start ?? new Date(finish.getTime() - (n + 1) * MINUTE);
    const wrong = new Set(spec.wrongIds ?? []);
    const answers: Record<string, Answer> = {};
    const base = { moduleId: mod.id, moduleVersion: mod.version, attemptId: id };
    ev(p, start, 'attemptStarted', { ...base, attemptMode: mode });
    questionIds.forEach((qid, i) => {
      const q = mod.questions.find((x) => x.id === qid);
      if (!q) throw new Error(`Seed: ${qid} is not in ${mod.title}`);
      const answer = answerFor(q, !wrong.has(qid));
      answers[qid] = answer;
      const result = checkAnswer(q, answer);
      const at = new Date(start.getTime() + (i + 1) * MINUTE);
      ev(p, at, 'questionAnswered', {
        ...base,
        questionId: qid,
        correct: result.correct,
        notesVisible: false,
        attemptMode: mode,
        ...(result.outcome ? { scenarioOutcome: result.outcome } : {}),
        ...('optionId' in answer ? { optionId: answer.optionId } : { choiceIds: answer.choiceIds }),
      });
      // Learn more is shut during a closed-book attempt; in an open one a wrong answer sometimes gets its link opened.
      const link = q.learnMore.at(0);
      if (mode === 'open' && !result.correct && link && rng.next() < 0.7) {
        ev(p, new Date(at.getTime() + MINUTE / 2), 'learnMoreOpened', {
          moduleId: mod.id,
          moduleVersion: mod.version,
          questionId: qid,
          attemptId: id,
          linkId: link.id,
        });
      }
    });
    const { score, passed } = scoreAttempt(questionIds, answers, mod, mod.quiz.passMark);
    attempts.push({
      id,
      clientId: p.clientId,
      siteId: p.primarySiteId,
      personId: p.id,
      moduleId: mod.id,
      moduleVersion: mod.version,
      mode,
      questionIds,
      ...(draw && Object.keys(draw.optionOrder).length > 0 ? { optionOrder: draw.optionOrder } : {}),
      startedAt: iso(start),
      finishedAt: iso(finish),
      score,
      passed,
    });
    ev(p, finish, 'attemptFinished', { ...base, attemptMode: mode });
    if (passed) ev(p, finish, 'moduleCompleted', { moduleId: mod.id, moduleVersion: mod.version, attemptId: id });
    return { passed, finishedAt: finish };
  };

  const ids = (mod: Module, from: number, to: number): string[] => mod.questions.slice(from, to).map((q) => q.id);
  const qid = (mod: Module, index: number): string => need(mod.questions.at(index)).id;

  /** "What changed" attempt that matches the person's existing module Evidence (same completedAt, same module). */
  const whatChanged = (key: string): void => {
    const p = personOf(key);
    const mod = moduleOf(m.wc);
    const row = data.evidence.find(
      (e) =>
        e.personId === p.id &&
        e.kind === 'module' &&
        e.moduleId === m.wc &&
        e.requirementId === keys.requirements.whatChanged,
    );
    if (!row) throw new Error(`Seed: ${key} has no What changed Evidence`);
    const finish = new Date(row.completedAt);
    lessons(p, mod, new Date(finish.getTime() - DAY));
    attempt(p, mod, { finish });
  };

  const sleepMod = moduleOf(m.sleep);
  const eatingMod = moduleOf(m.eating);
  const paedMod = moduleOf(m.paed);
  const sgMod = moduleOf(m.sg);

  // --- Jade: frequent and accurate, a session every nine days for about 24 weeks. Never Safeguarding.
  {
    const p = personOf('jade');
    for (let k = 0; k <= 18; k++) {
      const d = 171 - 9 * k;
      login(p, [d], 3);
      let t = ago(d, 5);
      if (k === 0) t = lessons(p, sleepMod, t);
      if (k === 1 || k === 5) t = lessons(p, paedMod, t, { count: k === 1 ? 1 : 2 });
      if (k === 3) {
        t = lessons(p, eatingMod, t);
        attempt(p, eatingMod, { start: t });
      }
      if (k % 2 === 0)
        attempt(p, sleepMod, { start: t, wrongIds: [qid(sleepMod, (k / 2) % sleepMod.questions.length)] });
    }
    whatChanged('jade');
  }

  // --- Daniel: the Designated Safeguarding Lead who practises the most. His real Safeguarding and first aid Evidence is
  // external, so his practice on those two modules is failed attempts (no pass, no Evidence); the rest are optional.
  {
    const p = personOf('daniel');
    login(p, [170, 140, 110, 80, 50, 20, 6], 7);
    let t = lessons(p, sgMod, ago(140, 20));
    attempt(p, sgMod, { start: t, mode: 'closed', questionIds: ids(sgMod, 0, 10), wrongIds: ids(sgMod, 0, 3) });
    attempt(p, sgMod, {
      start: ago(100, 20),
      mode: 'closed',
      questionIds: ids(sgMod, 9, 19),
      wrongIds: ids(sgMod, 9, 12),
    });
    t = lessons(p, paedMod, ago(130, 20));
    attempt(p, paedMod, { start: t, questionIds: ids(paedMod, 0, 9), wrongIds: ids(paedMod, 0, 2) });
    attempt(p, paedMod, { start: ago(125, 20), questionIds: ids(paedMod, 0, 9), wrongIds: ids(paedMod, 2, 4) });
    t = lessons(p, eatingMod, ago(46, 20));
    attempt(p, eatingMod, { start: t, questionIds: ids(eatingMod, 0, 10) });
    attempt(p, eatingMod, { start: ago(40, 20), questionIds: ids(eatingMod, 3, 13) });
    t = lessons(p, sleepMod, ago(39, 20));
    attempt(p, sleepMod, { start: t });
    whatChanged('daniel');
  }

  // --- Safer sleep for the Baby and Toddler rooms: the assignment is due 29 days ago, so these passes come before that.
  const sleepDone: [string, number, string[]][] = [
    ['hannah', 36, [qid(sleepMod, 4)]],
    ['kasia', 33, []],
    ['ellie', 35, []],
    ['lucy', 34, []],
  ];
  for (const [key, d, wrongIds] of sleepDone) {
    const p = personOf(key);
    const t = lessons(p, sleepMod, ago(d + 1, 20));
    attempt(p, sleepMod, { start: t, wrongIds });
  }
  // Ellie and Lucy also finish Safer eating inside the Autumn Complete and Win dates.
  for (const [key, d] of [
    ['ellie', 30],
    ['lucy', 28],
  ] as const) {
    const p = personOf(key);
    const t = lessons(p, eatingMod, ago(d + 1, 20));
    attempt(p, eatingMod, { start: t });
  }

  // --- "What changed" for the people whose Evidence for it came from that module.
  for (const key of ['hannah', 'kasia', 'chris', 'maureen', 'mark', 'priya', 'ben']) whatChanged(key);

  // --- Drop-off in the last Safer eating lesson: several people open it and stop.
  for (const [key, d] of [
    ['hannah', 60],
    ['chris', 52],
    ['amira', 44],
    ['mark', 70],
    ['priya', 33],
  ] as const) {
    const p = personOf(key);
    lessons(p, eatingMod, ago(d, 30), { leaveLastOpen: true });
  }

  // --- Others' quieter patterns.
  login(personOf('maureen'), [95, 40], 11);
  login(personOf('priya'), [160, 120, 90, 60, 30], 8);
  login(personOf('hannah'), [150, 100, 70, 20], 9);
  login(personOf('kasia'), [140, 80, 25], 9);
  login(personOf('ellie'), [120, 60, 15], 9);
  login(personOf('lucy'), [110, 55, 12], 9);
  login(personOf('chris'), [100, 45, 14], 10);
  login(personOf('mark'), [90, 35], 10);
  login(personOf('ben'), [75, 21], 10);
  lessons(personOf('amira'), moduleOf(m.wc), ago(14, 25), { count: 1, leaveLastOpen: true });
  lessons(personOf('lucy'), paedMod, ago(80, 20));
  lessons(personOf('ellie'), paedMod, ago(85, 20));

  // Grace is on leave: nothing in the last 30 days.
  {
    const p = personOf('grace');
    login(p, [170, 130, 95, 60, 38], 12);
    lessons(p, paedMod, ago(130, 20));
    lessons(p, sleepMod, ago(60, 20), { count: 1 });
  }
  // Olivia left about two months ago: nothing after that.
  {
    const p = personOf('olivia');
    login(p, [170, 140, 110, 80, 66], 12);
    lessons(p, paedMod, ago(140, 20));
    lessons(p, eatingMod, ago(80, 20));
  }
  // Sam started 10 days ago: two weeks of first steps.
  {
    const p = personOf('sam');
    login(p, [10, 9, 6, 3], 15);
    lessons(p, sgMod, ago(10, 20), { count: 2 });
    lessons(p, sleepMod, ago(9, 20), { count: 1 });
    lessons(p, sgMod, ago(3, 20), { count: 3, leaveLastOpen: true });
  }

  // --- Safer sleep assignments from last month for the Baby and Toddler rooms.
  const priyaUser = need(keys.users['priya']);
  const dueAt = iso(ago(29));
  const createdAt = iso(ago(45));
  const sleepAssignments: [string, Assignment['status']][] = [
    ['hannah', 'done'],
    ['kasia', 'done'],
    ['sam', 'cancelled'], // joined after the due date
    ['jade', 'done'],
    ['ellie', 'done'],
    ['lucy', 'done'],
    ['grace', 'open'], // on leave
  ];
  for (const [key, status] of sleepAssignments) {
    data.assignments.push({
      id: newId(),
      clientId,
      personId: personOf(key).id,
      target: { moduleId: m.sleep },
      dueAt,
      source: 'manual',
      assignedBy: priyaUser,
      createdAt,
      status,
    });
  }

  // --- Notes: 3 to 6 per persona with a staff user, only theirs.
  const noteSpecs: Record<string, NoteSpec[]> = {
    jade: [
      [m.paed, 0, true],
      [m.paed, 1],
      [m.sleep, 0, true],
      [m.sleep, 1],
      [m.wc, 0],
    ],
    maureen: [
      [m.eating, 0, true],
      [m.wc, 0],
      [m.paed, 0],
    ],
    sam: [
      [m.sg, 0],
      [m.sg, 1],
      [m.sleep, 0],
    ],
    ellie: [
      [m.eating, 1, true],
      [m.sleep, 0],
      [m.wc, 1],
      [m.paed, 0],
    ],
    hannah: [
      [m.sleep, 1, true],
      [m.paed, 1],
      [m.eating, 0],
    ],
    chris: [
      [m.wc, 0],
      [m.sg, 2],
      [m.paed, 0],
      [m.eating, 1],
    ],
    lucy: [
      [m.sleep, 0],
      [m.eating, 2, true],
      [m.paed, 1],
    ],
    mark: [
      [m.sg, 1],
      [m.wc, 1],
      [m.paed, 0],
    ],
    kasia: [
      [m.sleep, 1],
      [m.eating, 0],
      [m.sg, 0, true],
    ],
    grace: [
      [m.paed, 0],
      [m.sg, 1],
      [m.sleep, 0],
    ],
    ben: [
      [m.paed, 1],
      [m.wc, 0],
      [m.sg, 0],
    ],
    amira: [
      [m.wc, 0],
      [m.eating, 0],
      [m.sg, 2],
    ],
  };
  const notes: Note[] = [];
  for (const [key, specs] of Object.entries(noteSpecs)) {
    const p = personOf(key);
    const nrng = rng.fork(`notes-${key}`);
    specs.forEach(([moduleId, lessonIndex, starred], i) => {
      const mod = moduleOf(moduleId);
      const pool = NOTE_TEXT[moduleId] ?? [];
      const lesson = mod.lessons.at(lessonIndex);
      const when = key === 'sam' ? nrng.int(2, 8) : key === 'grace' ? nrng.int(40, 120) : nrng.int(3, 110);
      const at = iso(ago(when, 30 + i));
      notes.push({
        id: newId(),
        clientId: p.clientId,
        personId: p.id,
        moduleId,
        ...(lesson ? { lessonId: lesson.id } : {}),
        body:
          pool.at((lessonIndex + i) % Math.max(1, pool.length)) ??
          'Remember to ask about this at the next team meeting.',
        starred: starred === true,
        createdAt: at,
        updatedAt: at,
      });
    });
  }

  // --- Categories, groups and placements for Little Acorns and Oak Tree.
  const categorySpecs: Pick<Category, 'name' | 'colour' | 'icon'>[] = [
    { name: 'Safeguarding', colour: 'rose', icon: 'alert' },
    { name: 'Health and safety', colour: 'amber', icon: 'bell' },
    { name: 'Food and nutrition', colour: 'green', icon: 'check' },
    { name: 'Sleep and wellbeing', colour: 'teal', icon: 'clock' },
    { name: 'Induction', colour: 'blue', icon: 'user' },
    { name: 'Our policies', colour: 'slate', icon: 'book' },
  ];
  const categoryOfModule: Record<string, string> = {
    [m.sg]: 'Safeguarding',
    [m.paed]: 'Health and safety',
    [m.eating]: 'Food and nutrition',
    [m.sleep]: 'Sleep and wellbeing',
    [m.wc]: 'Our policies',
  };
  const groupSpecs: { name: string; description: string; moduleIds: string[]; inOrder: boolean }[] = [
    {
      name: 'New starter induction',
      description: 'The first modules for someone new, in the order we do them.',
      moduleIds: [m.sg, m.paed, m.eating, m.sleep, m.wc],
      inOrder: true,
    },
    {
      name: 'Baby room essentials',
      description: 'What everyone in the Baby room needs to know.',
      moduleIds: [m.sleep, m.eating, m.paed],
      inOrder: false,
    },
    {
      name: 'Annual refreshers',
      description: 'The modules we repeat every year.',
      moduleIds: [m.sg, m.paed],
      inOrder: false,
    },
  ];
  const categories: Category[] = [];
  const moduleGroups: ModuleGroup[] = [];
  const modulePlacements: ModulePlacement[] = [];
  for (const key of ['littleAcorns', 'oakTree']) {
    const cid = need(keys.clients[key]);
    const made = categorySpecs.map((c, order) => ({ id: newId(), clientId: cid, ...c, order }));
    categories.push(...made);
    for (const g of groupSpecs) moduleGroups.push({ id: newId(), clientId: cid, ...g });
    for (const mod of data.modules) {
      const category = made.find((c) => c.name === categoryOfModule[mod.id]);
      modulePlacements.push({
        clientId: cid,
        moduleId: mod.id,
        ...(category ? { categoryId: category.id } : {}),
        availableToAll: true,
      });
    }
  }

  // --- Competitions at Little Acorns. Live and ended come from the dates (Fast-forward moves them on).
  const base = {
    clientId,
    prizeText: '',
    eligibility: { excludePersonIds: [] as string[] },
    status: 'scheduled' as const,
  };
  const mastery: Competition = {
    ...base,
    id: newId(),
    type: 'builtIn',
    templateId: 'masteryMonth',
    name: 'Mastery Month',
    description: 'Master a whole module by answering every question in it correctly.',
    startAt: iso(ago(10)),
    endAt: iso(ago(-20)),
    prizeText: 'A team lunch for the top three',
    winnerSelection: 'top',
    winnerCount: 3,
    liveLeaderboard: true,
  };
  const bakeOff: Competition = {
    ...base,
    id: newId(),
    type: 'custom',
    name: 'Staff bake-off',
    description: 'Bring a bake to the Friday staff meeting. The manager picks the winner.',
    startAt: iso(ago(5)),
    endAt: iso(ago(-25)),
    prizeText: 'A cake stand for the staff room',
  };
  const complete: Competition = {
    ...base,
    id: newId(),
    type: 'builtIn',
    templateId: 'completeAndWin',
    name: 'Autumn Complete and Win',
    description: 'Finish Safer sleep and Safer eating to go into the draw.',
    startAt: iso(ago(50)),
    endAt: iso(ago(20)),
    prizeText: 'An extra half day of leave',
    winnerSelection: 'draw',
    winnerCount: 1,
    moduleIds: [m.sleep, m.eating],
  };
  const closedBook: Competition = {
    ...base,
    id: newId(),
    type: 'builtIn',
    templateId: 'closedBookChallenge',
    name: 'Closed-Book Challenge',
    description: 'Answer questions from memory, with no notes and no Learn more.',
    startAt: iso(ago(-5)),
    endAt: iso(ago(-35)),
    prizeText: 'A book token for the top three',
    winnerSelection: 'top',
    winnerCount: 3,
    liveLeaderboard: false,
    closedBookOnly: true,
  };
  const laPeople = data.people.filter((p) => p.clientId === clientId);
  const qualifiers = competitionMetric('completeAndWin', {
    competition: complete,
    people: laPeople,
    teams: data.teams.filter((t) => t.clientId === clientId),
    events,
    attempts,
    assignments: data.assignments.filter((a) => a.clientId === clientId),
    evidence: data.evidence.filter((e) => e.clientId === clientId),
    requirements: data.requirements,
    modules: data.modules,
  }).qualifies;
  const winner = drawWinners([...(qualifiers ?? [])], 1, rng.fork('autumn-draw')).at(0);
  if (winner === undefined) throw new Error('Seed: nobody qualifies for the Autumn Complete and Win draw');
  complete.winners = [{ personId: winner, recordedAt: complete.endAt }];

  data.learningEvents.push(...events);
  data.attempts.push(...attempts);
  data.notes.push(...notes);
  data.categories.push(...categories);
  data.moduleGroups.push(...moduleGroups);
  data.modulePlacements.push(...modulePlacements);
  data.competitions.push(mastery, bakeOff, complete, closedBook);
  data.standingBoardSettings.push(defaultBoardSettings(clientId));
}

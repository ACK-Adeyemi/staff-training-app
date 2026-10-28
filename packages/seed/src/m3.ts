// M3 seed (plan assumptions 5, 10, 53 and 54). Four forked streams: `m3history` (modules, history, rules, files, themes,
// reminders, sign-in states, onboarding), `feedback` (module and app feedback), `support` (tickets) and the existing
// `billing` stream (invoices, drawn after the M0 attempts so those do not move). Nothing here writes Evidence.
import { moduleIds, buildFireEvacuationModule, nurseryDefaultRules, packages, themePresets } from '@sta/content';
import {
  addDays,
  addMonths,
  defaultBoardSettings,
  invoiceTotals,
  londonWeekKey,
  planPrice,
  startOfLondonDay,
  ticketNumber,
  ulid,
  type AppFeedback,
  type Attachment,
  type AutoAssignRule,
  type BillingProfile,
  type Clock,
  type Invoice,
  type Module,
  type ModuleFeedback,
  type ModuleVersion,
  type Person,
  type ReminderLog,
  type Rng,
  type Theme,
  type Ticket,
  type TicketMessage,
} from '@sta/domain';
import { makeRecorder } from './recorder';
import type { SeedData, SeedKeys } from './world';

const need = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Seed: a record the M3 data refers to is missing');
  return value;
};
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Input = { data: SeedData; keys: SeedKeys; today: Date; clock: Clock };

const nurseryModule = (data: SeedData, id: string): Module => need(data.modules.find((m) => m.id === id));

/** A tiny fictional PDF (a one-line certificate), as bytes. */
function pdfBytes(text: string): Uint8Array<ArrayBuffer> {
  const body = `%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% ${text}\n% Fictional certificate for the demo only.\n%%EOF\n`;
  const encoded = new TextEncoder().encode(body);
  const out = new Uint8Array(new ArrayBuffer(encoded.length));
  out.set(encoded);
  return out;
}

export function buildM3History(input: Input & { rng: Rng }): void {
  const { data, keys, today, clock, rng } = input;
  const iso = (d: Date): string => d.toISOString();
  const ago = (days: number, minutes = 0): Date => new Date(addDays(today, -days).getTime() + minutes * MINUTE);
  const newId = (): string => ulid(clock, rng);
  const personOf = (key: string): Person => need(data.people.find((p) => p.id === keys.personas[key]));
  const la = need(keys.clients['littleAcorns']);
  const ot = need(keys.clients['oakTree']);
  const wl = need(keys.clients['willowLane']);
  const priyaUser = need(keys.users['priya']);
  const rec = makeRecorder({ today, clock, rng: rng.fork('sessions') });

  // --- Little Acorns' own modules. Fire evacuation is published at version 2 with the version 1 snapshot kept.
  const built = buildFireEvacuationModule({ id: newId(), clientId: la });
  const fire: Module = { ...built, version: 2, status: 'published', updatedAt: iso(ago(45)) };
  const fireV1: Module = {
    ...fire,
    version: 1,
    description: 'What to do if the fire alarm sounds at Little Acorns.',
    estimatedMinutes: 7,
    updatedAt: iso(ago(100)),
  };
  const snapshot: ModuleVersion = {
    key: `${fire.id}:1`,
    moduleId: fire.id,
    version: 1,
    module: fireV1,
    publishedAt: iso(ago(100)),
  };
  const lone: Module = {
    id: newId(),
    owner: { clientId: la },
    title: 'Lone working at the end of the day',
    description: 'What to do when you are the last adult in the building. Fictional draft for the demo.',
    estimatedMinutes: 5,
    language: 'en-GB',
    status: 'draft',
    version: 1,
    requirementIds: [],
    roleTags: [],
    lessons: [
      {
        id: 'lesson-1',
        title: 'Locking up safely',
        minutes: 3,
        blocks: [
          {
            kind: 'text',
            markdown: 'Before you leave, check every room, switch off the cooker and lock the back door.',
          },
          { kind: 'keyPoints', items: ['Check each room', 'Lock the back door', 'Tell the manager you have left'] },
        ],
      },
      {
        id: 'lesson-2',
        title: 'If something goes wrong',
        minutes: 2,
        blocks: [{ kind: 'text', markdown: 'If you feel unsafe, leave the building and call the manager.' }],
      },
    ],
    questions: [
      {
        id: 'q-lone-check',
        type: 'mcq',
        prompt: 'What do you do before you lock the back door?',
        options: [
          { id: 'q-lone-check-o1', text: 'Check every room is empty', correct: true },
          { id: 'q-lone-check-o2', text: 'Leave the lights on', correct: false },
        ],
        explanation: 'Check every room so nobody is left inside.',
        learnMore: [],
        tags: [],
      },
      {
        id: 'q-lone-unsafe',
        type: 'trueFalse',
        prompt: 'If you feel unsafe, you should stay and finish tidying. True or false?',
        options: [
          { id: 'q-lone-unsafe-o1', text: 'True', correct: false },
          { id: 'q-lone-unsafe-o2', text: 'False', correct: true },
        ],
        explanation: 'Leave and call the manager. Tidying can wait.',
        learnMore: [],
        tags: [],
      },
    ],
    quiz: {
      mode: 'mcq',
      drawCount: 2,
      shuffleQuestions: true,
      shuffleOptions: true,
      passMark: 80,
      maxRetakes: null,
      feedback: true,
      showSourceRef: false,
      notesInQuiz: 'choice',
      learnMoreFor: 'wrong',
    },
    draftContent: true,
    updatedAt: iso(ago(4)),
  };
  data.modules.push(fire, lone);
  data.moduleVersions.push(snapshot);
  keys.modules = { fireEvacuation: fire.id, loneWorking: lone.id };

  // --- Fire evacuation history: 12 people open lesson 1, 8 reach lesson 2, 7 reach lesson 3 and take the quiz.
  {
    const all = [
      'priya',
      'daniel',
      'jade',
      'mark',
      'chris',
      'kasia',
      'lucy',
      'hannah',
      'maureen',
      'ellie',
      'amira',
      'ben',
    ];
    const reachTwo = new Set(all.slice(0, 8));
    const finish = new Set(all.slice(0, 7));
    // Earlier people took version 1 (about three months ago); the rest took version 2.
    const early = new Set(['priya', 'daniel', 'jade']);
    const babyQuestion = need(fire.questions.find((q) => q.id === 'q-fire-babies')).id;
    all.forEach((key, i) => {
      const p = personOf(key);
      const mod = early.has(key) ? fireV1 : fire;
      const day = early.has(key) ? 90 - 3 * i : 40 - 2 * (i - 3);
      const start = ago(day, 10 * 60 + i);
      rec.login(p, day, 9 * 60);
      rec.lessons(p, mod, start, { count: 1 });
      if (reachTwo.has(key)) {
        const t = new Date(start.getTime() + 4 * MINUTE);
        const l2 = need(mod.lessons[1]);
        const base = { moduleId: mod.id, moduleVersion: mod.version, lessonId: l2.id };
        rec.ev(p, t, 'lessonViewed', base);
        if (finish.has(key) || key === 'hannah') {
          if (key !== 'hannah') {
            rec.ev(p, new Date(t.getTime() + 4 * MINUTE), 'lessonCompleted', base);
            rec.lessons(p, mod, new Date(t.getTime() + 5 * MINUTE), { count: 3 });
          }
        }
      }
      if (finish.has(key)) {
        const wrong = ['lucy', 'kasia'].includes(key)
          ? [babyQuestion]
          : key === 'chris'
            ? [babyQuestion, 'q-fire-alarm']
            : [];
        const at = new Date(start.getTime() + 20 * MINUTE);
        const first = rec.attempt(p, mod, at, wrong);
        if (!first.passed) rec.attempt(p, mod, new Date(first.finishedAt.getTime() + 2 * HOUR), []);
      }
    });
  }

  // --- Oak Tree and Willow Lane: about six months of activity. This month Riverside is busiest and Meadow quietest.
  {
    const optional = [moduleIds.saferSleep, moduleIds.safeEatingAllergiesAndChoking].map((id) =>
      nurseryModule(data, id),
    );
    const lessonModules = [
      moduleIds.safeguardingAndWhistleblowing,
      moduleIds.paediatricFirstAid,
      moduleIds.whatChangedSeptember2026,
      moduleIds.saferSleep,
    ].map((id) => nurseryModule(data, id));
    // People who are active this month, by site (all of Riverside, three of five at Hillside, one of four at Meadow).
    const thisMonth = new Set([
      'fionaMarsh',
      'tariqRahman',
      'bankPractitioner',
      'oscarFrost',
      'priyaNair',
      'leoWright',
      'colinReeve',
      'maeveDoyle',
      'imranKhalid',
      'rosaDelgado',
      'gemmaHolt',
      'ravinSingh',
      'edithPryce',
      'joeBarlow',
    ]);
    const chance: Record<string, number> = { riverside: 0.8, hillside: 0.55, meadow: 0.3, willowLane: 0.6 };
    const siteKeyOf = (p: Person): string =>
      need(Object.entries(keys.sites).find(([, id]) => id === p.primarySiteId))[0];
    const prng = rng.fork('sessions-ot-wl');
    let first = true;
    for (const p of data.people.filter((x) => (x.clientId === ot || x.clientId === wl) && x.status === 'active')) {
      const personKey = need(Object.entries(keys.personas).find(([, id]) => id === p.id))[0];
      const prob = need(chance[siteKeyOf(p)]);
      if (first) {
        rec.login(p, 172, 9 * 60);
        first = false;
      }
      for (let d = 168; d >= 20; d -= prng.int(6, 12)) {
        if (prng.next() >= prob) continue;
        rec.login(p, d, 9 * 60 + prng.int(0, 90));
        const mod = prng.pick(lessonModules);
        const t = rec.lessons(p, mod, rec.ago(d, 9 * 60 + 5), { count: prng.int(1, 2) });
        if (prng.next() < 0.3) rec.attempt(p, prng.pick(optional), t, []);
      }
      if (thisMonth.has(personKey)) {
        const d = prng.int(1, 17);
        rec.login(p, d, 10 * 60);
        rec.lessons(p, prng.pick(lessonModules), rec.ago(d, 10 * 60 + 5), { count: 1 });
      }
    }
  }
  data.learningEvents.push(...rec.events);
  data.attempts.push(...rec.attempts);

  // --- Oak Tree: Sites board on, and a rename that is waiting for billing review (display name unchanged).
  const board = defaultBoardSettings(ot);
  data.standingBoardSettings.push({
    ...board,
    siteBoard: { ...board.siteBoard, enabled: true, measures: ['participation', 'compliance', 'onTime'] },
  });
  const oakClient = need(data.clients.find((c) => c.id === ot));
  oakClient.nameHistory = [
    {
      old: 'Oak Tree Nurseries',
      new: 'Oak Tree Nurseries Group',
      changedBy: need(keys.users['oakTreeGroupAdmin']),
      changedAt: iso(ago(2)),
      reviewStatus: 'pendingReview',
    },
  ];

  // --- Little Acorns: rules, themes, onboarding, reminders.
  const laClient = need(data.clients.find((c) => c.id === la));
  const requirementIds: Record<string, string> = { 'safeguarding-refresher': need(keys.requirements['safeguarding']) };
  const rules: AutoAssignRule[] = nurseryDefaultRules.map((r) => ({
    id: newId(),
    clientId: la,
    name: r.name,
    enabled: r.key !== 'safeguarding-refresher',
    trigger:
      r.trigger.type === 'requirementExpiring'
        ? { ...r.trigger, requirementId: need(requirementIds[r.key]) }
        : r.trigger,
    filters: r.filters,
    action: r.action,
    dueInDays: r.dueInDays,
  }));
  data.autoAssignRules.push(...rules);
  // Sam joined 10 days ago, so the induction rule assigned his induction (done by his fifth day).
  const inductionRule = need(
    rules.find((r) => 'moduleId' in r.action && r.action.moduleId === moduleIds.newStarterInduction),
  );
  const sam = personOf('sam');
  data.assignments.push({
    id: newId(),
    clientId: la,
    personId: sam.id,
    target: { moduleId: moduleIds.newStarterInduction },
    dueAt: iso(addDays(new Date(sam.startDate), inductionRule.dueInDays)),
    source: { ruleId: inductionRule.id },
    assignedBy: priyaUser,
    createdAt: sam.startDate,
    status: 'done',
  });

  const preset = (id: string) => need(themePresets.find((t) => t.id === id));
  const green: Theme = {
    id: newId(),
    clientId: la,
    name: 'Little Acorns green',
    tokens: { primary: '#1f6b3a', accent: '#8a5a00', backgroundTint: '#f2f9f0', radius: 'md' },
    appliesTo: { staff: true, admin: true },
  };
  const christmas: Theme = {
    id: newId(),
    clientId: la,
    name: 'Christmas',
    preset: 'christmas',
    tokens: preset('christmas').tokens,
    schedule: {
      startAt: iso(startOfLondonDay(new Date('2026-12-01T12:00:00.000Z'))),
      endAt: iso(startOfLondonDay(new Date('2027-01-07T12:00:00.000Z'))),
    },
    appliesTo: { staff: true, admin: true },
  };
  data.themes.push(green, christmas);
  laClient.settings = { ...laClient.settings, themeId: green.id };

  data.onboarding.push({
    clientId: la,
    startedAt: iso(ago(30)),
    steps: [
      { key: 'inviteStaff', doneAt: iso(ago(29)) },
      { key: 'reminderSettings', doneAt: iso(ago(27)) },
      { key: 'assignTraining', doneAt: iso(ago(25)) },
      { key: 'setUpCompetition' },
      { key: 'exportMatrix', doneAt: iso(ago(20)) },
    ],
  });

  // Reminders already sent, on the exact offset days before an expiry (same key as the reminder planner).
  const logRows: ReminderLog[] = [];
  const sent = (personKey: string, requirementKey: string, offset: number): void => {
    const p = personOf(personKey);
    const ev = need(
      data.evidence.find(
        (e) => e.personId === p.id && e.requirementId === keys.requirements[requirementKey] && e.expiresAt,
      ),
    );
    const day = startOfLondonDay(addDays(new Date(need(ev.expiresAt)), -offset));
    const at = new Date(day.getTime() + 9 * HOUR);
    if (at.getTime() >= today.getTime()) throw new Error('Seed: a logged reminder must be in the past');
    logRows.push({
      key: `${p.id}:expiring:${ev.requirementId}:${offset}`,
      clientId: la,
      personId: p.id,
      kind: 'expiring',
      sentAt: iso(at),
      weekKey: londonWeekKey(at),
    });
  };
  sent('mark', 'paediatricFirstAid', 30);
  sent('mark', 'paediatricFirstAid', 7);
  sent('maureen', 'foodHygiene', 60);
  sent('lucy', 'safeguarding', 30);
  sent('hannah', 'safeguarding', 30);
  data.reminderLog.push(...logRows);

  // --- Certificate submissions: files for Ben's, Ellie's needs a better copy, and one approved earlier.
  const addFile = (key: string, fileId: string, label: string, createdAt: string): void => {
    const p = personOf(key);
    const bytes = pdfBytes(label);
    const file: Attachment = {
      id: fileId,
      clientId: la,
      kind: 'file',
      purpose: 'certificate',
      title: label,
      mime: 'application/pdf',
      bytes: bytes.length,
      data: bytes,
      ownerUserId: need(keys.users[key]),
      personId: p.id,
      siteId: p.primarySiteId,
      redacted: false,
      createdAt,
    };
    data.attachments.push(file);
  };
  const ben = need(data.evidenceSubmissions.find((s) => s.id === keys.submissions['ben']));
  addFile('ben', ben.fileAttachmentId, 'Safeguarding certificate (fictional)', ben.createdAt);

  const ellie = personOf('ellie');
  const ellieId = newId();
  const ellieFile = newId();
  const ellieCreated = iso(ago(6));
  data.evidenceSubmissions.push({
    id: ellieId,
    clientId: la,
    siteId: ellie.primarySiteId,
    personId: ellie.id,
    requirementId: need(keys.requirements['foodHygiene']),
    uploadedBy: need(keys.users['ellie']),
    fileAttachmentId: ellieFile,
    providerName: 'Sample Food Safety Training',
    completedAt: iso(ago(40)),
    expiresAt: iso(addMonths(ago(40), 36)),
    status: 'needsBetterCopy',
    reviewerId: need(keys.users['daniel']),
    reviewedAt: iso(ago(3)),
    decisionNote: 'The photo is too dark to read the date. Please upload a clearer copy.',
    createdAt: ellieCreated,
  });
  keys.submissions['ellie'] = ellieId;
  addFile('ellie', ellieFile, 'Food hygiene certificate (fictional)', ellieCreated);

  const kasia = personOf('kasia');
  const evidence = need(
    data.evidence.find(
      (e) =>
        e.personId === kasia.id && e.kind === 'external' && e.requirementId === keys.requirements['paediatricFirstAid'],
    ),
  );
  const approvedId = newId();
  const approvedFile = newId();
  const uploaded = iso(addDays(new Date(evidence.completedAt), 1));
  data.evidenceSubmissions.push({
    id: approvedId,
    clientId: la,
    siteId: kasia.primarySiteId,
    personId: kasia.id,
    requirementId: evidence.requirementId,
    uploadedBy: need(keys.users['kasia']),
    fileAttachmentId: approvedFile,
    providerName: 'Sample Early Years Training',
    completedAt: evidence.completedAt,
    ...(evidence.expiresAt ? { expiresAt: evidence.expiresAt } : {}),
    status: 'approved',
    reviewerId: priyaUser,
    reviewedAt: iso(addDays(new Date(evidence.completedAt), 2)),
    evidenceId: evidence.id,
    createdAt: uploaded,
  });
  keys.submissions['kasia'] = approvedId;
  addFile('kasia', approvedFile, 'Paediatric first aid certificate (fictional)', uploaded);

  // --- Two-step sign-in (assumption 5): every client admin is asked; some are enrolled, Daniel is in grace, Colin is limited.
  const required = new Map<string, number>([
    ['priya', 60],
    ['oakTreeGroupAdmin', 60],
    ['riversideManager', 60],
    ['meadowManager', 60],
    ['willowLaneOwner', 60],
    ['daniel', 2],
    ['hillsideManager', 12],
  ]);
  const enrolled = new Set(['priya', 'oakTreeGroupAdmin', 'riversideManager', 'meadowManager', 'willowLaneOwner']);
  for (const [key, days] of required) {
    const user = need(data.users.find((u) => u.id === keys.users[key]));
    user.twoFactorRequiredSince = iso(ago(days));
    if (enrolled.has(key)) user.twoFactor = { enrolledAt: iso(ago(days - 1)), recoveryCodesLeft: 10 };
  }
  for (const u of data.users) {
    if (u.side === 'client' && u.twoFactorRequiredSince === undefined) {
      throw new Error('Seed: every client admin needs a two-step date');
    }
  }
}

type Who = { key: string };

export function buildFeedback(input: Input & { rng: Rng }): void {
  const { data, keys, today, clock, rng } = input;
  const iso = (d: Date): string => d.toISOString();
  const newId = (): string => ulid(clock, rng);
  const at = (days: number): string =>
    iso(new Date(addDays(today, -days).getTime() + rng.int(9 * 60, 17 * 60) * MINUTE));
  const person = (key: string): Person => need(data.people.find((p) => p.id === keys.personas[key]));
  const priyaUser = need(keys.users['priya']);
  const fire = need(data.modules.find((m) => m.id === keys.modules['fireEvacuation']));
  const mod = (id: string): Module => nurseryModule(data, id);
  const lessonOf = (m: Module, i: number): string => need(m.lessons[i]).id;
  const questionOf = (m: Module, i: number): string => need(m.questions[i]).id;

  const sg = mod(moduleIds.safeguardingAndWhistleblowing);
  const sleep = mod(moduleIds.saferSleep);
  const eating = mod(moduleIds.safeEatingAllergiesAndChoking);
  const paed = mod(moduleIds.paediatricFirstAid);
  const wc = mod(moduleIds.whatChangedSeptember2026);

  type Spec = {
    m: Module;
    who: Who | 'anon';
    days: number;
    kind: ModuleFeedback['kind'];
    lesson?: string;
    question?: string;
    rating?: number;
    thumb?: 'up' | 'down';
    tags: string[];
    text?: string;
    status?: ModuleFeedback['status'];
    reply?: string;
    escalate?: string;
    /** Anonymous items still come from a real person's site; the person is simply not stored. */
    anonFrom?: string;
  };
  const specs: Spec[] = [
    {
      m: fire,
      who: { key: 'hannah' },
      days: 20,
      kind: 'lessonThumb',
      lesson: 'lesson-2',
      thumb: 'down',
      tags: ['unclear'],
      text: 'I could not tell how to get the cots down the steps.',
    },
    {
      m: fire,
      who: 'anon',
      anonFrom: 'jade',
      days: 19,
      kind: 'lessonThumb',
      lesson: 'lesson-2',
      thumb: 'down',
      tags: ['unclear'],
    },
    {
      m: fire,
      who: { key: 'kasia' },
      days: 18,
      kind: 'lessonThumb',
      lesson: 'lesson-2',
      thumb: 'down',
      tags: ['unclear', 'tooLong'],
      text: 'Too much happening in one lesson.',
    },
    {
      m: fire,
      who: { key: 'lucy' },
      days: 17,
      kind: 'lessonThumb',
      lesson: 'lesson-2',
      thumb: 'down',
      tags: ['unclear'],
      text: 'I did not understand the part about the evacuation cots.',
      status: 'reviewed',
      reply: 'Thank you. We will add a photo of the cots to lesson 2.',
    },
    {
      m: fire,
      who: 'anon',
      anonFrom: 'chris',
      days: 16,
      kind: 'lessonThumb',
      lesson: 'lesson-2',
      thumb: 'down',
      tags: ['unclear'],
    },
    { m: fire, who: { key: 'mark' }, days: 15, kind: 'lessonThumb', lesson: 'lesson-1', thumb: 'up', tags: ['clear'] },
    {
      m: fire,
      who: { key: 'jade' },
      days: 14,
      kind: 'lessonThumb',
      lesson: 'lesson-3',
      thumb: 'up',
      tags: ['reallyUseful'],
    },
    { m: fire, who: { key: 'priya' }, days: 13, kind: 'moduleCard', rating: 4, tags: ['reallyUseful'] },
    {
      m: fire,
      who: { key: 'chris' },
      days: 13,
      kind: 'moduleCard',
      rating: 3,
      tags: ['unclear'],
      text: 'Lesson 2 needs pictures.',
    },
    {
      m: fire,
      who: { key: 'daniel' },
      days: 12,
      kind: 'questionReport',
      question: 'q-fire-babies',
      tags: ['mistakeInQuestion'],
      text: 'The answer does not say where the evacuation cots are kept.',
      status: 'actioned',
      reply: 'Good catch. We have added it to the explanation.',
    },
    {
      m: fire,
      who: 'anon',
      anonFrom: 'ellie',
      days: 12,
      kind: 'questionReport',
      question: 'q-fire-belongings',
      tags: ['unclear'],
      text: 'I was not sure what counts as going back inside.',
    },
    { m: sg, who: { key: 'jade' }, days: 30, kind: 'moduleCard', rating: 5, tags: ['reallyUseful'] },
    { m: sg, who: { key: 'ellie' }, days: 29, kind: 'moduleCard', rating: 4, tags: ['clear'] },
    {
      m: sg,
      who: { key: 'maureen' },
      days: 28,
      kind: 'lessonThumb',
      lesson: lessonOf(sg, 0),
      thumb: 'up',
      tags: ['clear'],
    },
    {
      m: sg,
      who: { key: 'daniel' },
      days: 27,
      kind: 'questionReport',
      question: questionOf(sg, 0),
      tags: ['mistakeInQuestion'],
      text: 'The wording of the options is close. Please check the answer.',
      status: 'reviewed',
      reply: 'Thanks. We have sent this to the training provider.',
      escalate: 'The two options look very alike to our staff.',
    },
    { m: sleep, who: { key: 'hannah' }, days: 26, kind: 'moduleCard', rating: 4, tags: ['clear'] },
    {
      m: sleep,
      who: 'anon',
      anonFrom: 'lucy',
      days: 25,
      kind: 'lessonThumb',
      lesson: lessonOf(sleep, 1),
      thumb: 'down',
      tags: ['tooLong'],
    },
    { m: eating, who: { key: 'lucy' }, days: 24, kind: 'moduleCard', rating: 3, tags: ['tooLong'] },
    {
      m: eating,
      who: { key: 'mark' },
      days: 23,
      kind: 'moduleCard',
      rating: 3,
      tags: ['outOfDate'],
      text: 'Check the allergy guidance is the current one.',
      reply: 'We have asked the training provider to check this.',
      escalate: 'A member of staff thinks the allergy wording may be out of date.',
    },
    {
      m: eating,
      who: 'anon',
      anonFrom: 'amira',
      days: 22,
      kind: 'lessonThumb',
      lesson: lessonOf(eating, eating.lessons.length - 1),
      thumb: 'down',
      tags: ['unclear'],
    },
    { m: paed, who: { key: 'kasia' }, days: 21, kind: 'moduleCard', rating: 5, tags: ['reallyUseful'] },
    { m: wc, who: { key: 'priya' }, days: 10, kind: 'moduleCard', rating: 4, tags: ['clear'] },
    {
      m: wc,
      who: { key: 'ellie' },
      days: 9,
      kind: 'lessonThumb',
      lesson: lessonOf(wc, 0),
      thumb: 'up',
      tags: ['clear'],
    },
    { m: sg, who: { key: 'oscarFrost' }, days: 31, kind: 'moduleCard', rating: 4, tags: ['clear'], status: 'reviewed' },
    {
      m: sleep,
      who: { key: 'priyaNair' },
      days: 11,
      kind: 'lessonThumb',
      lesson: lessonOf(sleep, 0),
      thumb: 'up',
      tags: ['reallyUseful'],
    },
    {
      m: sg,
      who: { key: 'zainabAli' },
      days: 8,
      kind: 'moduleCard',
      rating: 2,
      tags: ['hardOnPhone'],
      text: 'Hard to read on my phone.',
    },
  ];

  for (const s of specs) {
    const p = person(s.who === 'anon' ? need(s.anonFrom) : s.who.key);
    const anonymous = s.who === 'anon';
    const createdAt = at(s.days);
    const item: ModuleFeedback = {
      id: newId(),
      clientId: p.clientId,
      siteId: p.primarySiteId,
      ...(anonymous ? {} : { personId: p.id }),
      anonymous,
      moduleId: s.m.id,
      moduleVersion: s.m.version,
      ...(s.lesson ? { lessonId: s.lesson } : {}),
      ...(s.question ? { questionId: s.question } : {}),
      kind: s.kind,
      ...(s.rating !== undefined ? { rating: s.rating } : {}),
      ...(s.thumb ? { thumb: s.thumb } : {}),
      tags: s.tags,
      ...(s.text ? { text: s.text } : {}),
      status: s.status ?? 'new',
      ...(s.reply
        ? { reply: { byUserId: priyaUser, text: s.reply, at: iso(new Date(Date.parse(createdAt) + 2 * HOUR)) } }
        : {}),
      ...(s.escalate
        ? {
            escalatedToProvider: {
              by: priyaUser,
              note: s.escalate,
              at: iso(new Date(Date.parse(createdAt) + 3 * HOUR)),
            },
          }
        : {}),
      createdAt,
    };
    data.moduleFeedback.push(item);
  }

  // --- App feedback: about ten items across staff and admins.
  const userOf = (key: string): { id: string; personId: string; side: 'staff' | 'client' } => {
    const u = need(data.users.find((x) => x.id === keys.users[key]));
    if (u.side === 'provider') throw new Error('Seed: app feedback is from staff or client users');
    return { id: u.id, personId: need(u.personId), side: u.side };
  };
  const app: [string, AppFeedback['kind'], number, string, string, AppFeedback['status'], number | undefined][] = [
    ['jade', 'idea', 18, 'It would help to see my next due date on the first screen.', 'S1', 'triaged', undefined],
    ['maureen', 'problem', 16, 'The text is small on my phone even after I made it bigger.', 'S2', 'new', 3],
    ['kasia', 'praise', 15, 'I like being able to read lessons in Polish.', 'S1', 'new', 5],
    ['ellie', 'idea', 14, 'Can we get a reminder the day before a quiz is due?', 'S3', 'planned', undefined],
    ['priya', 'praise', 12, 'The overview of who needs attention saves me an hour a week.', 'C1', 'new', 5],
    ['daniel', 'problem', 11, 'The matrix export is slow with all the filters on.', 'C5', 'triaged', 3],
    ['mark', 'idea', 9, 'Let us pick which rooms show on the team board.', 'S5', 'new', undefined],
    ['oakTreeGroupAdmin', 'idea', 8, 'We would like to compare our sites on one page.', 'C1', 'done', undefined],
    ['oscarFrost', 'problem', 6, 'The quiz timer did not stop when I switched apps.', 'S4', 'new', 2],
    ['willowLaneOwner', 'praise', 4, 'Setting up was quick and the staff liked it.', 'C1', 'new', 4],
  ];
  const feedbackRng = rng.fork('app');
  for (const [key, kind, days, text, screen, status, rating] of app) {
    const u = userOf(key);
    const p = need(data.people.find((x) => x.id === u.personId));
    data.appFeedback.push({
      id: ulid(clock, feedbackRng),
      clientId: p.clientId,
      siteId: p.primarySiteId,
      userId: u.id,
      side: u.side,
      kind,
      ...(rating !== undefined ? { rating } : {}),
      text,
      context: { screen },
      status,
      tags: [],
      createdAt: at(days),
    });
  }
}

export function buildSupport(input: Input & { rng: Rng }): void {
  const { data, keys, today, clock, rng } = input;
  const iso = (d: Date): string => d.toISOString();
  const newId = (): string => ulid(clock, rng);
  const at = (days: number, minutes = 0): string => iso(new Date(addDays(today, -days).getTime() + minutes * MINUTE));
  const la = need(keys.clients['littleAcorns']);
  const site = need(keys.sites['littleAcorns']);
  const sophie = need(keys.users['sophie']);

  type T = {
    n: number;
    by: string;
    side: 'staff' | 'client';
    title: string;
    description: string;
    feature: string;
    issueType: string;
    impact: Ticket['impact'];
    status: Ticket['status'];
    opened: number;
    firstResponse?: number;
    resolved?: number;
    reply?: string;
    satisfaction?: 'up';
  };
  const list: T[] = [
    {
      n: 1,
      by: 'priya',
      side: 'client',
      title: 'Training matrix export opens in one column',
      description: 'When I open the matrix export in my spreadsheet, every column is squashed into one.',
      feature: 'reports',
      issueType: 'notWorking',
      impact: 'workaround',
      status: 'inProgress',
      opened: 6,
      firstResponse: 5,
      reply:
        'Thanks Priya. We can see this. Choose "comma separated" when your spreadsheet asks, and we are looking at a fix.',
    },
    {
      n: 2,
      by: 'jade',
      side: 'staff',
      title: 'My notes did not show on my phone',
      description: 'I wrote a note in a lesson but cannot see it on my phone.',
      feature: 'notes',
      issueType: 'notWorking',
      impact: 'question',
      status: 'resolved',
      opened: 14,
      firstResponse: 13,
      resolved: 12,
      reply:
        'Hi Jade. Notes are saved on the device you wrote them on. They will appear once you open the same lesson there.',
      satisfaction: 'up',
    },
    {
      n: 3,
      by: 'daniel',
      side: 'client',
      title: 'How do I add a Site Manager?',
      description: 'I want to give a new manager access to only their own site.',
      feature: 'calendar',
      issueType: 'howTo',
      impact: 'question',
      status: 'received',
      opened: 1,
    },
  ];
  for (const t of list) {
    const user = need(data.users.find((u) => u.id === keys.users[t.by]));
    const id = newId();
    const created = at(t.opened, 9 * 60);
    data.tickets.push({
      id,
      number: ticketNumber(t.n),
      clientId: la,
      siteId: site,
      raisedBy: user.id,
      raiserSide: t.side,
      sharedWithManager: false,
      featureId: t.feature,
      issueTypeId: t.issueType,
      title: t.title,
      description: t.description,
      impact: t.impact,
      priority: t.impact === 'blocked' ? 'high' : t.impact === 'workaround' ? 'normal' : 'low',
      status: t.status,
      ...(t.n === 1 ? { assigneeId: sophie } : {}),
      tags: [],
      context: { screen: t.side === 'staff' ? 'S1' : 'C5' },
      linkedErrorIds: [],
      createdAt: created,
      updatedAt: at(t.resolved ?? t.firstResponse ?? t.opened, 11 * 60),
      ...(t.firstResponse !== undefined ? { firstResponseAt: at(t.firstResponse, 10 * 60) } : {}),
      ...(t.resolved !== undefined ? { resolvedAt: at(t.resolved, 11 * 60) } : {}),
      ...(t.satisfaction ? { satisfaction: t.satisfaction } : {}),
    });
    const messages: TicketMessage[] = [
      {
        id: newId(),
        ticketId: id,
        authorId: user.id,
        side: 'customer',
        body: t.description,
        internal: false,
        attachmentIds: [],
        createdAt: created,
      },
    ];
    if (t.reply && t.firstResponse !== undefined) {
      messages.push({
        id: newId(),
        ticketId: id,
        authorId: sophie,
        side: 'provider',
        body: t.reply,
        internal: false,
        attachmentIds: [],
        createdAt: at(t.firstResponse, 10 * 60),
      });
    }
    data.ticketMessages.push(...messages);
  }
}

export function buildBilling(
  input: Input & { rng: Rng; paidInvoiceIds: Record<string, string>; overdueInvoiceId: string },
): void {
  const { data, keys, today, clock, rng } = input;
  const iso = (d: Date): string => d.toISOString();
  const newId = (): string => ulid(clock, rng);
  const ago = (days: number): Date => addDays(today, -days);
  let sequence = 0;
  const invoices: Invoice[] = [];
  const clients: [string, string][] = [
    ['littleAcorns', 'Acorn Lane, Anytown AB1 2CD'],
    ['oakTree', 'Oak House, Riverside Road, Anytown AB3 4EF'],
    ['willowLane', '2 Willow Lane, Anytown AB5 6GH'],
  ];
  for (const [key, address] of clients) {
    const clientId = need(keys.clients[key]);
    const client = need(data.clients.find((c) => c.id === clientId));
    const sub = need(data.subscriptions.find((s) => s.clientId === clientId));
    const pkg = need(packages.find((p) => p.id === sub.packageId));
    const staff = data.people.filter((p) => p.clientId === clientId && p.status === 'active').length;
    const sites = data.sites.filter((s) => s.clientId === clientId && s.status === 'active');
    const lines = sites.map((s) => ({
      label: `${pkg.name} plan, ${s.name}`,
      amount: planPrice(pkg, staff, sites.length).perSite,
      siteId: s.id,
    }));
    const totals = invoiceTotals(lines);
    const overdue = key === 'willowLane';
    // Newest first: the latest invoice is issued 41 days ago (paid) or, for Willow Lane, 11 days ago (overdue).
    for (let k = 0; k < 6; k++) {
      const issued = ago((overdue ? 11 : 41) + 30 * k);
      const status: Invoice['status'] = overdue && k === 0 ? 'overdue' : overdue && k === 3 ? 'refunded' : 'paid';
      const id =
        overdue && k === 0
          ? input.overdueInvoiceId
          : k === 0 && key in input.paidInvoiceIds
            ? need(input.paidInvoiceIds[key])
            : newId();
      invoices.push({
        id,
        number: '',
        clientId,
        issuedAt: iso(issued),
        dueAt: iso(addDays(issued, 1)),
        billingNameAtIssue: client.displayName,
        billingAddressAtIssue: address,
        lines,
        tax: totals.tax,
        total: totals.total,
        status,
      });
    }
  }
  invoices.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.clientId.localeCompare(b.clientId));
  for (const inv of invoices) inv.number = `INV-${String(1001 + sequence++)}`;
  data.invoices.push(...invoices);

  for (const [key, address] of clients) {
    const clientId = need(keys.clients[key]);
    const client = need(data.clients.find((c) => c.id === clientId));
    const owner = need(
      data.users.find(
        (u) => u.side === 'client' && u.clientId === clientId && u.id === keys.users[need(ownerKeyOf[key])],
      ),
    );
    const profile: BillingProfile = {
      clientId,
      billingName: client.displayName,
      address,
      billingContactEmail: need(data.subscriptions.find((s) => s.clientId === clientId)).billingContact,
      paymentMethod: { brand: 'Visa', last4: String(rng.int(1000, 9999)), expMonth: rng.int(1, 12), expYear: 2028 },
      updatedBy: owner.id,
      updatedAt: iso(ago(120)),
    };
    data.billingProfiles.push(profile);
  }
}

const ownerKeyOf: Record<string, string> = {
  littleAcorns: 'priya',
  oakTree: 'oakTreeGroupAdmin',
  willowLane: 'willowLaneOwner',
};

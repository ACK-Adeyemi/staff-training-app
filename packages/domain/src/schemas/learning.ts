// Learning content and records. Build pack section 6; plan docs/plans/m1.md (Assumptions 6, 12, 13, 21).
// Brief sections 8 (quiz engine and module builder) and 31 (Learn more links on answers).
import { z } from 'zod';
import { idSchema, isoDateSchema } from './primitives';

/** Module-local key for lessons, blocks, questions, options, steps, choices and links (Assumption 12). */
export const localKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Not a valid key');

/** True for an absolute https URL with no username or password. Pure; uses the standard URL parser. */
export const isSafeHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
};

export const learnMoreLinkSchema = z
  .object({
    id: localKeySchema,
    title: z.string().min(1),
    url: z.string().refine(isSafeHttpsUrl, 'Must be an https link without a login').optional(),
    attachmentId: idSchema.optional(),
    publisher: z.string().min(1),
    kind: z.enum(['official', 'legislation', 'regulator', 'organisation', 'other']),
    locator: z.string().optional(),
    language: z.string().min(1),
    showFor: z.enum(['wrong', 'all']),
    lastCheck: z.object({ at: isoDateSchema, status: z.enum(['ok', 'broken', 'unknown']) }).optional(),
  })
  .refine((l) => (l.url === undefined) !== (l.attachmentId === undefined), {
    message: 'Give exactly one of url and attachmentId',
  });
export type LearnMoreLink = z.infer<typeof learnMoreLinkSchema>;

export const contentBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), markdown: z.string() }),
  z.object({ kind: z.literal('keyPoints'), items: z.array(z.string()) }),
  z.object({ kind: z.literal('callout'), tone: z.enum(['info', 'warning']), markdown: z.string() }),
  z.object({ kind: z.literal('image'), assetId: idSchema, alt: z.string().min(1) }),
  z.object({ kind: z.literal('acknowledge'), statement: z.string().min(1) }),
]);
export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const lessonSchema = z.object({
  id: localKeySchema,
  title: z.string().min(1),
  minutes: z.number().positive(),
  blocks: z.array(contentBlockSchema),
  furtherReading: z.array(learnMoreLinkSchema).optional(),
});
export type Lesson = z.infer<typeof lessonSchema>;

const optionSchema = z.object({ id: localKeySchema, text: z.string().min(1), correct: z.boolean() });

const choiceSchema = z.object({
  id: localKeySchema,
  text: z.string().min(1),
  outcome: z.enum(['best', 'ok', 'poor']),
  feedback: z.string(),
  next: localKeySchema.optional(),
});
const stepSchema = z.object({
  id: localKeySchema,
  text: z.string().min(1),
  choices: z.array(choiceSchema).min(1),
});

type Step = z.infer<typeof stepSchema>;

/** True when some path from the first step to an ending uses only `best` choices. */
const hasAllBestPath = (steps: Step[], index: number): boolean => {
  const step = steps[index];
  if (!step) return false;
  return step.choices.some((c) => {
    if (c.outcome !== 'best') return false;
    if (c.next === undefined) return true;
    const nextIndex = steps.findIndex((s) => s.id === c.next);
    return nextIndex > index && hasAllBestPath(steps, nextIndex);
  });
};

export const questionSchema = z
  .object({
    id: localKeySchema,
    type: z.enum(['mcq', 'trueFalse', 'scenario']),
    prompt: z.string().min(1),
    options: z.array(optionSchema).optional(),
    scenario: z.object({ steps: z.array(stepSchema).min(1).max(4) }).optional(),
    explanation: z.string().min(1),
    sourceRef: z.string().optional(),
    learnMore: z.array(learnMoreLinkSchema),
    tags: z.array(z.string()),
  })
  .superRefine((q, ctx) => {
    const fail = (message: string): void => {
      ctx.addIssue({ code: 'custom', message });
    };
    if (q.sourceRef !== undefined && q.learnMore.length === 0)
      fail('A question with a sourceRef needs a Learn more link');
    if (q.type === 'scenario') {
      if (q.options !== undefined) fail('A scenario has no options');
      const steps = q.scenario?.steps;
      if (!steps) {
        fail('A scenario needs steps');
        return;
      }
      steps.forEach((step, i) => {
        for (const c of step.choices) {
          if (c.next === undefined) continue;
          const target = steps.findIndex((s) => s.id === c.next);
          if (target <= i) fail(`Choice ${c.id} must lead to a later step in the same question`);
        }
      });
      if (!hasAllBestPath(steps, 0)) fail('A scenario needs at least one path of best choices');
      return;
    }
    if (q.scenario !== undefined) fail('Only a scenario has steps');
    const options = q.options;
    if (!options) {
      fail('A question needs options');
      return;
    }
    if (q.type === 'trueFalse' ? options.length !== 2 : options.length < 2 || options.length > 6)
      fail(
        q.type === 'trueFalse'
          ? 'True or false has exactly 2 options'
          : 'A multiple choice question has 2 to 6 options',
      );
    if (options.filter((o) => o.correct).length !== 1) fail('Exactly one option must be correct');
  });
export type Question = z.infer<typeof questionSchema>;

export const quizSettingsSchema = z
  .object({
    mode: z.enum(['scenario', 'mcq', 'mix']),
    mixScenarioShare: z.number().min(0).max(1).optional(),
    drawCount: z.number().int().min(1),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    passMark: z.number().min(0).max(100),
    maxRetakes: z.number().int().nonnegative().nullable(),
    feedback: z.boolean(),
    showSourceRef: z.boolean(),
    notesInQuiz: z.enum(['choice', 'closedBookOnly']),
    learnMoreFor: z.enum(['wrong', 'all']),
  })
  .refine((s) => s.mode !== 'mix' || s.mixScenarioShare !== undefined, {
    message: 'Mix mode needs mixScenarioShare',
    path: ['mixScenarioShare'],
  });
export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const moduleSchema = z
  .object({
    id: idSchema,
    owner: z.union([z.literal('provider'), z.object({ clientId: idSchema, siteId: idSchema.optional() })]),
    title: z.string().min(1),
    description: z.string(),
    estimatedMinutes: z.number().positive(),
    language: z.string().min(1),
    status: z.enum(['draft', 'published', 'archived']),
    version: z.number().int().min(1),
    requirementIds: z.array(idSchema),
    roleTags: z.array(idSchema),
    lessons: z.array(lessonSchema),
    questions: z.array(questionSchema),
    quiz: quizSettingsSchema,
    sourceAttribution: z.string().optional(),
    translatedFrom: z.object({ moduleId: idSchema, machine: z.boolean() }).optional(),
    clientReviewRequired: z.boolean().optional(),
    draftContent: z.boolean().optional(),
  })
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    const claim = (key: string): void => {
      if (seen.has(key)) ctx.addIssue({ code: 'custom', message: `Duplicate key ${key}` });
      seen.add(key);
    };
    for (const lesson of m.lessons) claim(lesson.id);
    for (const q of m.questions) {
      claim(q.id);
      for (const o of q.options ?? []) claim(o.id);
      for (const s of q.scenario?.steps ?? []) {
        claim(s.id);
        for (const c of s.choices) claim(c.id);
      }
    }
  });
export type Module = z.infer<typeof moduleSchema>;

export const clientLinkOverlaySchema = z.object({
  id: idSchema,
  clientId: idSchema,
  siteId: idSchema.optional(),
  moduleId: idSchema,
  questionId: localKeySchema.optional(),
  lessonId: localKeySchema.optional(),
  links: z.array(learnMoreLinkSchema),
  addedBy: idSchema,
  addedAt: isoDateSchema,
});
export type ClientLinkOverlay = z.infer<typeof clientLinkOverlaySchema>;

export const attachmentSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  title: z.string().min(1),
  mime: z.literal('text/markdown'),
  body: z.string(),
  createdAt: isoDateSchema,
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const assignmentSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  personId: idSchema,
  target: z.union([z.object({ moduleId: idSchema }), z.object({ groupId: idSchema })]),
  dueAt: isoDateSchema,
  source: z.union([z.literal('manual'), z.object({ ruleId: idSchema })]),
  assignedBy: idSchema,
  createdAt: isoDateSchema,
  status: z.enum(['open', 'done', 'cancelled']),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const learningEventSchema = z
  .object({
    id: idSchema,
    clientId: idSchema,
    siteId: idSchema,
    personId: idSchema,
    at: isoDateSchema,
    type: z.enum([
      'lessonViewed',
      'lessonCompleted',
      'attemptStarted',
      'questionAnswered',
      'attemptFinished',
      'moduleCompleted',
      'noteCreated',
      'badgeEarned',
      'login',
      'learnMoreOpened',
    ]),
    moduleId: idSchema.optional(),
    moduleVersion: z.number().int().min(1).optional(),
    lessonId: localKeySchema.optional(),
    questionId: localKeySchema.optional(),
    attemptId: idSchema.optional(),
    correct: z.boolean().optional(),
    scenarioOutcome: z.enum(['best', 'ok', 'poor']).optional(),
    notesVisible: z.boolean().optional(),
    attemptMode: z.enum(['open', 'closed']).optional(),
    competitionId: idSchema.optional(),
    linkId: localKeySchema.optional(),
    optionId: localKeySchema.optional(),
    choiceIds: z.array(localKeySchema).optional(),
  })
  .refine((e) => e.type !== 'questionAnswered' || e.notesVisible !== undefined, {
    message: 'An answer records whether notes were visible',
    path: ['notesVisible'],
  });
export type LearningEvent = z.infer<typeof learningEventSchema>;

export const attemptSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  siteId: idSchema,
  personId: idSchema,
  moduleId: idSchema,
  moduleVersion: z.number().int().min(1),
  mode: z.enum(['open', 'closed']),
  questionIds: z.array(localKeySchema),
  optionOrder: z.record(localKeySchema, z.array(localKeySchema)).optional(),
  startedAt: isoDateSchema,
  finishedAt: isoDateSchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
  passed: z.boolean().optional(),
  /** Ended by the person without a score; never counts towards retakes or competitions (M2 assumption 20). */
  abandoned: z.boolean().optional(),
});
export type Attempt = z.infer<typeof attemptSchema>;

/** Stored as kind plus parameters and rendered through t() (Assumption 13). */
export const notificationSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  userId: idSchema,
  kind: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  link: z.string().optional(),
  createdAt: isoDateSchema,
  readAt: isoDateSchema.optional(),
  snoozedUntil: isoDateSchema.optional(),
});
export type Notification = z.infer<typeof notificationSchema>;

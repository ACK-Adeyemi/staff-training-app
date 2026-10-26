// Notes, organising, competitions, standing boards and the derived XP ledger entry.
// Build pack section 6; plan docs/plans/m2.md (assumptions 12, 13, 16, 21 to 24; conflicts 1 and 13).
import { z } from 'zod';
import { countSchema, idSchema, isoDateSchema } from './primitives';
import { localKeySchema } from './learning';

export const noteSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  personId: idSchema,
  moduleId: idSchema,
  lessonId: localKeySchema.optional(),
  body: z.string().trim().min(1).max(1000),
  starred: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Note = z.infer<typeof noteSchema>;

/** Fixed palette of 8 token keys (M2 assumption 24). */
export const CATEGORY_COLOURS = ['green', 'blue', 'amber', 'purple', 'rose', 'teal', 'slate', 'brown'] as const;
/** Icon keys; a subset of the UI Icon set. */
export const CATEGORY_ICONS = [
  'book',
  'check',
  'alert',
  'clock',
  'user',
  'chart',
  'trophy',
  'home',
  'help',
  'bell',
] as const;
export type CategoryColour = (typeof CATEGORY_COLOURS)[number];
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const categorySchema = z.object({
  id: idSchema,
  clientId: idSchema,
  name: z.string().min(1).max(40),
  colour: z.enum(CATEGORY_COLOURS),
  icon: z.enum(CATEGORY_ICONS),
  order: countSchema,
});
export type Category = z.infer<typeof categorySchema>;

export const modulePlacementSchema = z.object({
  clientId: idSchema,
  moduleId: idSchema,
  categoryId: idSchema.optional(),
  availableToAll: z.boolean(),
  reviewedByOrg: z.object({ by: idSchema, at: isoDateSchema, version: z.number().int().min(1) }).optional(),
});
export type ModulePlacement = z.infer<typeof modulePlacementSchema>;

export const moduleGroupSchema = z
  .object({
    id: idSchema,
    clientId: idSchema,
    siteId: idSchema.optional(),
    name: z.string().min(1),
    description: z.string(),
    moduleIds: z.array(idSchema).min(1).max(30),
    inOrder: z.boolean(),
  })
  .refine((g) => new Set(g.moduleIds).size === g.moduleIds.length, {
    message: 'A module can be in a group only once',
    path: ['moduleIds'],
  });
export type ModuleGroup = z.infer<typeof moduleGroupSchema>;

export const COMPETITION_TEMPLATES = [
  'masteryMonth',
  'knowledgeBuilder',
  'learningStreak',
  'teamShowdown',
  'beatTheExpiry',
  'completeAndWin',
  'scenarioSavvy',
  'closedBookChallenge',
] as const;
export const competitionTemplateSchema = z.enum(COMPETITION_TEMPLATES);
export type CompetitionTemplateId = z.infer<typeof competitionTemplateSchema>;

/** Templates that may be restricted to closed-book attempts (M2 assumption 13). */
export const CLOSED_BOOK_TEMPLATES: readonly CompetitionTemplateId[] = [
  'masteryMonth',
  'knowledgeBuilder',
  'scenarioSavvy',
  'closedBookChallenge',
];

export const competitionSchema = z
  .object({
    id: idSchema,
    clientId: idSchema,
    siteIds: z.array(idSchema).optional(),
    type: z.enum(['builtIn', 'custom']),
    templateId: competitionTemplateSchema.optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    startAt: isoDateSchema,
    endAt: isoDateSchema,
    prizeText: z.string(),
    eligibility: z.object({
      jobRoleIds: z.array(idSchema).optional(),
      teamIds: z.array(idSchema).optional(),
      siteIds: z.array(idSchema).optional(),
      excludePersonIds: z.array(idSchema),
    }),
    winnerSelection: z.enum(['top', 'draw', 'teamTarget']).optional(),
    winnerCount: z.number().int().min(1).max(20).optional(),
    liveLeaderboard: z.boolean().optional(),
    closedBookOnly: z.boolean().optional(),
    moduleIds: z.array(idSchema).optional(),
    teamUnit: z.enum(['team', 'site']).optional(),
    teamTarget: z.number().int().min(1).max(100).optional(),
    /** Stored status only; live and ended are derived by competitionStatus (assumption 12). */
    status: z.enum(['draft', 'scheduled', 'cancelled']),
    winners: z
      .array(z.object({ personId: idSchema.optional(), teamId: idSchema.optional(), recordedAt: isoDateSchema }))
      .optional(),
    finalStandings: z.unknown().optional(),
  })
  .superRefine((c, ctx) => {
    const fail = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (c.type === 'custom') {
      if (c.templateId !== undefined) fail('templateId', 'A custom competition has no template');
      if (c.winnerSelection !== undefined) fail('winnerSelection', 'A custom competition has no winner selection');
      if (c.liveLeaderboard !== undefined) fail('liveLeaderboard', 'A custom competition has no leaderboard');
      if (c.closedBookOnly !== undefined) fail('closedBookOnly', 'A custom competition has no closed-book option');
      if (c.moduleIds !== undefined) fail('moduleIds', 'A custom competition has no module list');
      return;
    }
    if (c.templateId === undefined) fail('templateId', 'A built-in competition needs a template');
    if (c.winnerSelection === undefined) fail('winnerSelection', 'A built-in competition needs winner selection');
    if (c.templateId === 'completeAndWin' && (c.moduleIds === undefined || c.moduleIds.length === 0))
      fail('moduleIds', 'Complete and win needs at least one module');
    if (c.templateId === 'closedBookChallenge' && c.closedBookOnly !== true)
      fail('closedBookOnly', 'The closed-book challenge is closed-book only');
    if (c.closedBookOnly === true && c.templateId !== undefined && !CLOSED_BOOK_TEMPLATES.includes(c.templateId))
      fail('closedBookOnly', 'This template cannot be closed-book only');
  });
export type Competition = z.infer<typeof competitionSchema>;

export const LEADERBOARD_SCOPES = ['site', 'region', 'country', 'all'] as const;
export const leaderboardScopeSchema = z.enum(LEADERBOARD_SCOPES);
export type LeaderboardScope = z.infer<typeof leaderboardScopeSchema>;

export const BOARD_IDS = [
  'correctQuestions',
  'modulesCompleted',
  'modulesMastered',
  'activeWeeks',
  'refresherChampions',
  'teamBoard',
] as const;
export const boardIdSchema = z.enum(BOARD_IDS);
export type BoardId = z.infer<typeof boardIdSchema>;

export const standingBoardSettingsSchema = z.object({
  clientId: idSchema,
  boards: z.partialRecord(
    boardIdSchema,
    z.object({ enabled: z.boolean(), staffScopes: z.array(leaderboardScopeSchema) }),
  ),
  siteBoard: z
    .object({
      enabled: z.boolean().default(false),
      measures: z.array(z.string()).default(['compliance', 'onTime']),
      staffScopes: z.array(leaderboardScopeSchema).default(['site']),
      smallSiteMinActive: z.number().int().positive().default(5),
      newStarterGraceDays: countSchema.default(30),
      excludedSiteIds: z.array(idSchema).default([]),
    })
    .prefault({}),
});
export type StandingBoardSettings = z.infer<typeof standingBoardSettingsSchema>;

/** One line of the derived XP ledger. Never stored (M2 assumption 1). */
export const xpEntrySchema = z.object({
  id: idSchema,
  personId: idSchema,
  kind: z.enum(['lesson', 'correct', 'closedBookBonus', 'passed', 'mastery', 'earlyRefresher', 'weeklyGoal', 'battle']),
  amount: countSchema,
  sourceEventId: idSchema,
  at: isoDateSchema,
  capped: z.boolean().optional(),
});
export type XpEntry = z.infer<typeof xpEntrySchema>;

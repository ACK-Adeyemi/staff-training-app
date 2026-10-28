// Tenancy, organisation and people. Build pack section 6.
import { z } from 'zod';
import { accountStateSchema, countSchema, idSchema, isoDateSchema, sideSchema } from './primitives';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const reminderPolicySchema = z.object({
  dueOffsetsDays: z.array(z.number().int()),
  expiringOffsetsDays: z.array(z.number().int()),
  weeklyCapPerPerson: countSchema,
  quietHours: z.object({ from: hhmm, to: hhmm }),
  escalateAfterDays: countSchema.optional(),
});

// Bounds are placeholders (M3 assumption 50).
export const retentionPolicySchema = z.object({
  leaverRecordsMonths: z.number().int().min(12).max(120),
  notesAfterLeaveDays: z.number().int().min(30).max(365),
  eventDetailMonths: z.number().int().min(13).max(60),
  feedbackMonths: z.number().int().min(12).max(60),
  ticketMonthsAfterClose: countSchema,
  attachmentDaysAfterClose: countSchema,
  trialDeleteDays: countSchema,
});

export const reminderToneSchema = z.enum(['friendly', 'neutral', 'brief']);
export const reminderTemplateSchema = z.object({
  tone: reminderToneSchema,
  text: z.string().min(1).max(300).optional(),
});

export const reminderTemplatesSchema = z.record(z.string(), reminderTemplateSchema);

const battleSettingsSchema = z.object({
  allowStaffHost: z.boolean().default(true),
  allowCrossSite: z.boolean().default(true),
  maxRoomSize: z.number().int().positive().default(20),
  speedModeAvailable: z.boolean().default(true),
  raiseTheStakesAvailable: z.boolean().default(true),
});

// Defaults are placeholders (brief 31); the provider can change them per client.
export const clientSettingsSchema = z.object({
  allowStaffTickets: z.boolean().default(true),
  pulseSurveys: z.boolean().default(false),
  defaultLanguage: z.string().min(1).default('en-GB'),
  amberWindowDays: countSchema.default(60),
  allowSelfApproval: z.boolean().default(false),
  /** Lessons per London week for the weekly goal (M2 assumption 7). */
  weeklyGoalLessons: z.number().int().min(1).max(7).default(1),
  /** The base theme (M3 assumption 52). */
  themeId: idSchema.optional(),
  /** Warn when first aiders for a site drop below this many (M3 assumption 23, placeholder). */
  firstAiderThreshold: z.number().int().min(0).max(20).default(2),
  reminderTemplates: z.record(z.string(), reminderTemplateSchema).default({}),
  battles: battleSettingsSchema.prefault({}),
  reminderPolicy: reminderPolicySchema.default({
    dueOffsetsDays: [7, 1],
    expiringOffsetsDays: [60, 30, 7],
    weeklyCapPerPerson: 3,
    quietHours: { from: '21:00', to: '07:00' },
  }),
  retention: retentionPolicySchema.default({
    leaverRecordsMonths: 72,
    notesAfterLeaveDays: 30,
    eventDetailMonths: 24,
    feedbackMonths: 24,
    ticketMonthsAfterClose: 24,
    attachmentDaysAfterClose: 90,
    trialDeleteDays: 30,
  }),
});
export type ClientSettings = z.infer<typeof clientSettingsSchema>;

export const clientSchema = z.object({
  id: idSchema,
  displayName: z.string().min(1),
  shortName: z.string().optional(),
  industryPackId: idSchema,
  packageId: idSchema,
  accountState: accountStateSchema,
  createdAt: isoDateSchema,
  settings: clientSettingsSchema,
  nameHistory: z.array(
    z.object({
      old: z.string(),
      new: z.string(),
      changedBy: idSchema,
      changedAt: isoDateSchema,
      reviewStatus: z.enum(['pendingReview', 'billingKept', 'billingUpdated', 'clientAsked', 'reverted']),
    }),
  ),
});
export type Client = z.infer<typeof clientSchema>;

export const siteSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  name: z.string().min(1),
  label: z.string().optional(),
  countryCode: z.string().min(2),
  region: z.string().optional(),
  status: z.enum(['active', 'archived']),
  timezone: z.string().min(1),
  refs: z.record(z.string(), z.string()).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
});
export type Site = z.infer<typeof siteSchema>;

export const teamSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  siteId: idSchema,
  name: z.string().min(1),
});
export type Team = z.infer<typeof teamSchema>;

export const learnerPrefsSchema = z.object({
  hideFromLeaderboards: z.boolean(),
  simpleView: z.boolean(),
  textScale: z.number().positive(),
  uiScale: z.number().positive(),
  contrast: z.enum(['standard', 'high']),
  colourMode: z.enum(['auto', 'light', 'dark']),
  reduceMotion: z.boolean(),
  sound: z.boolean(),
  haptics: z.boolean(),
  readingFont: z.enum(['default', 'dyslexiaFriendly']),
  biggerButtons: z.boolean(),
  spacing: z.enum(['standard', 'wide']).default('standard'),
  readAloud: z.boolean().default(true),
  readAloudRate: z.union([z.literal(0.75), z.literal(1), z.literal(1.25), z.literal(1.5)]).default(1),
  language: z.string().min(1),
  quietHours: z.object({ from: hhmm, to: hhmm }).optional(),
  battleExtraTimePercent: z.union([z.literal(0), z.literal(50), z.literal(100)]),
});
export type LearnerPrefs = z.infer<typeof learnerPrefsSchema>;

/** Letters, digits, spaces, hyphen and apostrophe; 1 to 30 characters after trimming (M2 plan Design). */
export const nicknameSchema = z
  .string()
  .trim()
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} '-]{0,29}$/u, 'Not a valid nickname');

export const personSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  primarySiteId: idSchema,
  additionalSiteIds: z.array(idSchema),
  teamIds: z.array(idSchema),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nickname: nicknameSchema.optional(),
  jobRoleIds: z.array(idSchema),
  qualificationLevel: z.string().optional(),
  startDate: isoDateSchema,
  leftDate: isoDateSchema.optional(),
  status: z.enum(['invited', 'active', 'onLeave', 'archived']),
  pausedUntil: isoDateSchema.optional(),
  prefs: learnerPrefsSchema,
});
export type Person = z.infer<typeof personSchema>;

// Staff and client users belong to a client; provider users do not.
export const userAccountSchema = z
  .object({
    id: idSchema,
    side: sideSchema,
    clientId: idSchema.optional(),
    personId: idSchema.optional(),
    email: z.string().optional(),
    displayName: z.string().min(1),
    status: z.enum(['invited', 'active', 'suspended']),
    login: z.object({ method: z.enum(['pin', 'emailPassword']), pinSet: z.boolean() }),
    /** Set for every client admin; staff never have it (M3 assumption 3). */
    twoFactorRequiredSince: isoDateSchema.optional(),
    twoFactor: z
      .object({
        enrolledAt: isoDateSchema,
        recoveryCodesLeft: countSchema,
        /** SHA-256 hex of each unused recovery code (M3 assumption 4). */
        recoveryCodeHashes: z.array(z.string()).optional(),
        lockedUntil: isoDateSchema.optional(),
        failedCodes: countSchema.optional(),
      })
      .optional(),
    lastActiveAt: isoDateSchema.optional(),
  })
  .superRefine((user, ctx) => {
    if (user.side !== 'provider' && user.clientId === undefined) {
      ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'A client or staff user needs a clientId' });
    }
    if (user.side === 'provider' && user.clientId !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'A provider user must not have a clientId' });
    }
  });
export type UserAccount = z.infer<typeof userAccountSchema>;

export const jobRoleSchema = z.object({
  id: idSchema,
  packId: idSchema.optional(),
  clientId: idSchema.optional(),
  name: z.string().min(1),
});
export type JobRole = z.infer<typeof jobRoleSchema>;

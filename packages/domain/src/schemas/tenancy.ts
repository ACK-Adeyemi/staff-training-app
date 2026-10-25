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

export const retentionPolicySchema = z.object({
  leaverRecordsMonths: countSchema,
  notesAfterLeaveDays: countSchema,
  eventDetailMonths: countSchema,
  feedbackMonths: countSchema,
  ticketMonthsAfterClose: countSchema,
  attachmentDaysAfterClose: countSchema,
  trialDeleteDays: countSchema,
});

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
  language: z.string().min(1),
  quietHours: z.object({ from: hhmm, to: hhmm }).optional(),
  battleExtraTimePercent: z.union([z.literal(0), z.literal(50), z.literal(100)]),
});
export type LearnerPrefs = z.infer<typeof learnerPrefsSchema>;

export const personSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  primarySiteId: idSchema,
  additionalSiteIds: z.array(idSchema),
  teamIds: z.array(idSchema),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nickname: z.string().optional(),
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
    twoFactor: z.object({ enrolledAt: isoDateSchema, recoveryCodesLeft: countSchema }).optional(),
    lastActiveAt: isoDateSchema.optional(),
  })
  .superRefine((user, ctx) => {
    if (user.side !== 'provider' && user.clientId === undefined) {
      ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'A client or staff user needs a clientId' });
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

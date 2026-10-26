// Client admin records added in M3: rules, reminders, themes, invitations, onboarding, add-on requests.
// Plan docs/plans/m3.md Design (Domain package) and assumptions 7, 10, 25, 28, 43, 51.
import { z } from 'zod';
import { scopeSchema } from './access';
import { idSchema, isoDateSchema } from './primitives';

/** Only the triggers M3 builds (assumption 25). */
export const autoAssignTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('personAdded') }),
  z.object({ type: z.literal('roleChanged') }),
  z.object({
    type: z.literal('requirementExpiring'),
    days: z.number().int().min(1).max(365),
    requirementId: idSchema,
  }),
]);

export const autoAssignRuleSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  siteId: idSchema.optional(),
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
  trigger: autoAssignTriggerSchema,
  filters: z.object({
    jobRoleIds: z.array(idSchema).optional(),
    teamIds: z.array(idSchema).optional(),
    siteIds: z.array(idSchema).optional(),
  }),
  action: z.union([z.object({ moduleId: idSchema }), z.object({ groupId: idSchema })]),
  dueInDays: z.number().int().min(0).max(365),
});
export type AutoAssignRule = z.infer<typeof autoAssignRuleSchema>;

/** One entry per reminder sent, keyed `personId:kind:targetId:offset` so it is never sent twice (assumption 28). */
export const reminderLogSchema = z.object({
  key: z.string().min(1),
  clientId: idSchema,
  personId: idSchema,
  kind: z.string().min(1),
  sentAt: isoDateSchema,
  weekKey: z.string().min(1),
});
export type ReminderLog = z.infer<typeof reminderLogSchema>;

/** The allowlist of theme tokens; status, error and success colours are deliberately absent (assumption 51). */
export const themeTokensSchema = z.strictObject({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundTint: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  radius: z.enum(['sm', 'md', 'lg']),
  fontPairing: z.string().min(1).optional(),
});

export const themeSchema = z
  .object({
    id: idSchema,
    clientId: idSchema.optional(),
    name: z.string().min(1).max(60),
    preset: z.string().optional(),
    tokens: themeTokensSchema,
    schedule: z.object({ startAt: isoDateSchema, endAt: isoDateSchema }).optional(),
    appliesTo: z.object({ staff: z.boolean(), admin: z.boolean() }),
  })
  .refine((t) => t.schedule === undefined || Date.parse(t.schedule.endAt) > Date.parse(t.schedule.startAt), {
    message: 'A schedule must end after it starts',
    path: ['schedule'],
  });
export type Theme = z.infer<typeof themeSchema>;

export const invitationSchema = z
  .object({
    id: idSchema,
    side: z.enum(['client', 'provider']),
    clientId: idSchema.optional(),
    email: z.string().min(3),
    roleIds: z.array(idSchema),
    scope: scopeSchema,
    invitedBy: idSchema,
    expiresAt: isoDateSchema,
    status: z.enum(['invited', 'accepted', 'expired', 'revoked']),
  })
  .refine((i) => (i.side === 'client') === (i.clientId !== undefined), {
    message: 'A client invitation needs a clientId and a provider invitation must not have one',
    path: ['clientId'],
  });
export type Invitation = z.infer<typeof invitationSchema>;

export const onboardingChecklistSchema = z.object({
  clientId: idSchema,
  steps: z.array(z.object({ key: z.string().min(1), doneAt: isoDateSchema.optional() })),
  startedAt: isoDateSchema,
  completedAt: isoDateSchema.optional(),
});
export type OnboardingChecklist = z.infer<typeof onboardingChecklistSchema>;

export const addOnRequestSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  addOnId: idSchema,
  requestedBy: idSchema,
  note: z.string().max(300).optional(),
  status: z.enum(['pending', 'approved', 'declined']),
  decidedBy: idSchema.optional(),
  decidedAt: isoDateSchema.optional(),
  createdAt: isoDateSchema,
});
export type AddOnRequest = z.infer<typeof addOnRequestSchema>;

// Packages, entitlements, subscriptions and payments. Build pack section 6. Money is integer pence.
import { z } from 'zod';
import { accountStateSchema, countSchema, idSchema, isoDateSchema, penceSchema } from './primitives';

const limit = z.union([z.literal('unlimited'), countSchema]);

export const entitlementsSchema = z.object({
  ownModules: limit,
  savedThemes: limit,
  admins: limit,
  autoAssignRules: limit,
  liveCompetitions: limit,
  customClientRoles: limit,
  closedBookCompetitions: z.boolean(),
  multiSite: z.boolean(),
  logoBranding: z.boolean(),
  perSiteThemes: z.boolean(),
  integrations: z.boolean(),
  responseTargetHours: countSchema,
  battlesPerMonth: limit,
  maxBattlePlayers: countSchema,
  crossSiteBattles: z.boolean(),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

export const packageSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  option: z.enum(['A', 'B']),
  bands: z.array(z.object({ maxStaff: countSchema, pricePerSite: penceSchema })),
  entitlements: entitlementsSchema,
});
export type Package = z.infer<typeof packageSchema>;

export const addOnSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  pricing: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('flat'), price: penceSchema }),
    z.object({
      kind: z.literal('usage'),
      unit: z.string().min(1),
      pricePerUnit: penceSchema,
      includedUnits: countSchema,
    }),
  ]),
  adds: entitlementsSchema.partial().extend({ flags: z.array(z.string()).optional() }),
});
export type AddOn = z.infer<typeof addOnSchema>;

export const subscriptionSchema = z.object({
  clientId: idSchema,
  packageId: idSchema,
  period: z.enum(['monthly', 'annual']),
  renewalAt: isoDateSchema,
  state: accountStateSchema,
  stateSince: isoDateSchema,
  nextStateAt: isoDateSchema.optional(),
  billingContact: z.string().min(1),
  graceExtendedUntil: isoDateSchema.optional(),
  timelinePaused: z.boolean().optional(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const addOnSubscriptionSchema = z.object({
  clientId: idSchema,
  addOnId: idSchema,
  status: z.enum(['off', 'on', 'trial']),
  startedAt: isoDateSchema.optional(),
  endsAt: isoDateSchema.optional(),
  usageCapPence: penceSchema.optional(),
  usageThisPeriod: countSchema,
});
export type AddOnSubscription = z.infer<typeof addOnSubscriptionSchema>;

// Build pack 6 has only invoiceId; id and clientId added for keying and tenancy (docs/decisions.md).
export const paymentAttemptSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  invoiceId: idSchema,
  at: isoDateSchema,
  result: z.enum(['success', 'softDecline', 'hardDecline']),
});
export type PaymentAttempt = z.infer<typeof paymentAttemptSchema>;

export const dunningPolicySchema = z.object({
  graceDays: countSchema,
  limitedUntilDay: countSchema,
  readOnlyUntilDay: countSchema,
  closedUntilDay: countSchema,
  deleteWithinDays: countSchema,
});
export type DunningPolicy = z.infer<typeof dunningPolicySchema>;

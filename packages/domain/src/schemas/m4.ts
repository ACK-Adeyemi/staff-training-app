// Provider-story records (M4 chunk 1; build pack section 6). Hard rules live here so every adapter and the seed share them.
import { z } from 'zod';
import { idSchema, isoDateSchema } from './primitives';

const after = (a: string, b: string): boolean => new Date(a).getTime() > new Date(b).getTime();
const notBefore = (a: string, b: string): boolean => new Date(a).getTime() >= new Date(b).getTime();

export const priceAdjustmentSchema = z
  .object({
    id: idSchema,
    clientIds: z.array(idSchema).min(1),
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('plan') }),
      z.object({ kind: z.literal('addOn'), addOnId: idSchema }),
      z.object({ kind: z.literal('invoice') }),
    ]),
    type: z.enum(['override', 'percent']),
    /** Pence for an override; a signed percentage for a percent change, for example -10 or 5. */
    value: z.number(),
    reason: z.enum(['loyalty', 'retention', 'introductory', 'annualReview', 'correction', 'other']),
    note: z.string().optional(),
    /** Assumption 6: notice defaults to 30 days. */
    noticeDays: z.number().int().min(0).default(30),
    effectiveAt: isoDateSchema.optional(),
    endsAt: isoDateSchema.optional(),
    status: z.enum(['draft', 'submitted', 'scheduled', 'active', 'ended', 'cancelled']),
    createdBy: idSchema,
    confirmedBy: idSchema.optional(),
    confirmedAt: isoDateSchema.optional(),
  })
  .superRefine((a, ctx) => {
    const fail = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (a.type === 'override' && (!Number.isInteger(a.value) || a.value < 0))
      fail('value', 'An override is a whole number of pence, never negative');
    if (a.type === 'percent' && a.value < -100) fail('value', 'A percentage cannot go below minus 100');
    if (a.effectiveAt !== undefined && a.endsAt !== undefined && !after(a.endsAt, a.effectiveAt))
      fail('endsAt', 'The end date must be after the effective date');
    // Confirmer and effective date go together once a change is scheduled or active. A bare status is accepted
    // here; the domain lifecycle (chunk 2) and the data ops refuse to schedule without both.
    if (a.status === 'scheduled' || a.status === 'active') {
      if (a.effectiveAt !== undefined && a.confirmedBy === undefined)
        fail('confirmedBy', 'A scheduled or active change needs a confirmer');
      if (a.confirmedBy !== undefined && a.effectiveAt === undefined)
        fail('effectiveAt', 'A scheduled or active change needs an effective date');
    }
  });
export type PriceAdjustment = z.infer<typeof priceAdjustmentSchema>;

export const ownershipTransferSchema = z
  .object({
    id: idSchema,
    side: z.enum(['client', 'provider']),
    clientId: idSchema.optional(),
    fromUserId: idSchema,
    toUserId: idSchema,
    coolingOffEndsAt: isoDateSchema,
    demoteFromTo: idSchema,
    status: z.enum(['pending', 'done', 'cancelled']),
    acceptedAt: isoDateSchema.optional(),
    twoFactorConfirmedAt: isoDateSchema.optional(),
  })
  .superRefine((t, ctx) => {
    if (t.side === 'client' && t.clientId === undefined)
      ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'A client transfer needs a client' });
    if (t.fromUserId === t.toUserId)
      ctx.addIssue({ code: 'custom', path: ['toUserId'], message: 'Ownership cannot move to the same person' });
  });
export type OwnershipTransfer = z.infer<typeof ownershipTransferSchema>;

export const announcementSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    body: z.string(),
    link: z.string().optional(),
    audience: z.object({
      clientIds: z.array(idSchema).optional(),
      packageIds: z.array(idSchema).optional(),
      packIds: z.array(idSchema).optional(),
      sides: z.array(z.enum(['staff', 'client'])).min(1),
    }),
    channels: z.array(z.enum(['banner', 'notification', 'email'])).min(1),
    publishAt: isoDateSchema,
    expiresAt: isoDateSchema.optional(),
    createdBy: idSchema,
    reads: z.number().int().min(0),
  })
  .refine((a) => a.expiresAt === undefined || after(a.expiresAt, a.publishAt), {
    message: 'An announcement must expire after it is published',
    path: ['expiresAt'],
  });
export type Announcement = z.infer<typeof announcementSchema>;

export const releaseNoteSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  body: z.string(),
  date: isoDateSchema,
  feedbackIds: z.array(idSchema),
  moduleVersions: z.array(z.object({ moduleId: idSchema, version: z.number().int().min(1) })),
});
export type ReleaseNote = z.infer<typeof releaseNoteSchema>;

export const recoveryRequestSchema = z
  .object({
    id: idSchema,
    clientId: idSchema,
    subjectUserId: idSchema,
    requester: z.string().min(1),
    reason: z.string().min(1),
    checks: z.array(z.object({ key: z.string().min(1), doneBy: idSchema, at: isoDateSchema })),
    approvals: z.array(idSchema),
    coolingOffEndsAt: isoDateSchema.optional(),
    outcome: z.enum(['reset2fa', 'transferOwner']).optional(),
    status: z.enum(['open', 'approved', 'done', 'rejected']),
  })
  .superRefine((r, ctx) => {
    const fail = (message: string): void => {
      ctx.addIssue({ code: 'custom', path: ['approvals'], message });
    };
    if (new Set(r.approvals).size !== r.approvals.length) fail('Each approver can approve once');
    if (r.approvals.includes(r.subjectUserId)) fail('The person being recovered cannot approve');
    if ((r.status === 'approved' || r.status === 'done') && r.approvals.length < 2)
      fail('Two different approvers are needed');
  });
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>;

export const dataRequestSchema = z
  .object({
    id: idSchema,
    clientId: idSchema.optional(),
    kind: z.enum(['access', 'correction', 'erasure', 'other']),
    requester: z.string().min(1),
    subjectPersonId: idSchema.optional(),
    receivedAt: isoDateSchema,
    dueAt: isoDateSchema,
    status: z.enum(['open', 'done', 'rejected']),
    notes: z.string(),
    evidence: z.string().optional(),
  })
  .refine((d) => notBefore(d.dueAt, d.receivedAt), { message: 'Due before it was received', path: ['dueAt'] });
export type DataRequest = z.infer<typeof dataRequestSchema>;

export const incidentSchema = z
  .object({
    id: idSchema,
    level: z.enum(['normal', 'degraded', 'maintenance', 'incident']),
    title: z.string().min(1),
    updates: z
      .array(
        z.object({
          status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
          message: z.string(),
          at: isoDateSchema,
        }),
      )
      .min(1),
    startedAt: isoDateSchema,
    resolvedAt: isoDateSchema.optional(),
  })
  .refine((i) => i.resolvedAt === undefined || notBefore(i.resolvedAt, i.startedAt), {
    message: 'Resolved before it started',
    path: ['resolvedAt'],
  });
export type Incident = z.infer<typeof incidentSchema>;

export const otherEntryGroupSchema = z
  .object({
    id: idSchema,
    field: z.enum(['feature', 'issueType']),
    normalised: z.string().min(1),
    examples: z.array(z.string()),
    ticketIds: z.array(idSchema),
    count: z.number().int().min(0),
    firstSeen: isoDateSchema,
    lastSeen: isoDateSchema,
    review: z.enum(['unreviewed', 'mapped', 'created', 'ignored']),
    outcomeId: z.string().min(1).optional(),
  })
  .superRefine((g, ctx) => {
    if (g.count !== g.ticketIds.length)
      ctx.addIssue({ code: 'custom', path: ['count'], message: 'The count must equal the number of tickets' });
    if (!notBefore(g.lastSeen, g.firstSeen))
      ctx.addIssue({ code: 'custom', path: ['lastSeen'], message: 'Last seen is before first seen' });
  });
export type OtherEntryGroup = z.infer<typeof otherEntryGroupSchema>;

/** The body may use the {{firstName}} placeholder. */
export const savedReplySchema = z.object({ id: idSchema, title: z.string().min(1), body: z.string().min(1) });
export type SavedReply = z.infer<typeof savedReplySchema>;

export const profileChangeRequestSchema = z
  .object({
    id: idSchema,
    clientId: idSchema,
    kind: z.literal('nameChange'),
    oldName: z.string().min(1),
    newName: z.string().min(1),
    requestedBy: idSchema,
    status: z.enum(['pendingReview', 'billingKept', 'billingUpdated', 'clientAsked', 'reverted']),
    reviewerId: idSchema.optional(),
    reviewedAt: isoDateSchema.optional(),
    createdAt: isoDateSchema,
  })
  .refine((r) => r.oldName !== r.newName, { message: 'The name has not changed', path: ['newName'] });
export type ProfileChangeRequest = z.infer<typeof profileChangeRequestSchema>;

/** Simulated and deterministic: no network request is made (plan assumption 8). */
export const linkCheckResultSchema = z.object({
  id: idSchema,
  linkId: z.string().min(1),
  moduleId: idSchema,
  url: z.string().min(1),
  status: z.enum(['ok', 'broken', 'unknown']),
  checkedAt: isoDateSchema,
});
export type LinkCheckResult = z.infer<typeof linkCheckResultSchema>;

/** The what-changed notice for one targeted client after a provider module is published. */
export const moduleNoticeSchema = z
  .object({
    id: idSchema,
    clientId: idSchema,
    moduleId: idSchema,
    fromVersion: z.number().int().min(1),
    toVersion: z.number().int().min(1),
    summary: z.string().min(1),
    publishedBy: idSchema,
    publishedAt: isoDateSchema,
    seenAt: isoDateSchema.optional(),
    seenBy: idSchema.optional(),
  })
  .refine((n) => n.toVersion > n.fromVersion, { message: 'The version must go up', path: ['toVersion'] });
export type ModuleNotice = z.infer<typeof moduleNoticeSchema>;

// ---------- Provider telemetry (M4 chunk 8c; build pack 6 "Provider telemetry"). Seeded and simulated in the PoC. ----------
const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-19');

/** One feature's use by one client on one day. Keyed by client, date and feature. */
export const usageDailySchema = z.object({
  clientId: idSchema,
  date: dayKeySchema,
  feature: z.string().min(1),
  count: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
});
export type UsageDaily = z.infer<typeof usageDailySchema>;

export const errorGroupSchema = z.object({
  id: idSchema,
  message: z.string().min(1),
  count: z.number().int().nonnegative(),
  firstSeen: isoDateSchema,
  lastSeen: isoDateSchema,
  clientIds: z.array(idSchema),
  siteIds: z.array(idSchema),
  usersAffected: z.number().int().nonnegative(),
  status: z.enum(['open', 'acknowledged', 'resolved']),
});
export type ErrorGroup = z.infer<typeof errorGroupSchema>;

export const logEntrySchema = z.object({
  id: idSchema,
  at: isoDateSchema,
  severity: z.enum(['info', 'warning', 'error']),
  clientId: idSchema.optional(),
  siteId: idSchema.optional(),
  feature: z.string().min(1),
  event: z.string().min(1),
  message: z.string(),
  sessionId: z.string().min(1),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

/** A client's health on one day, 0 to 100, with plain-English reasons. Keyed by client and date. */
export const healthScoreSchema = z.object({
  clientId: idSchema,
  date: dayKeySchema,
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().min(1)),
});
export type HealthScore = z.infer<typeof healthScoreSchema>;

/** Real, on this device only: an event or error this browser recorded. Never seeded, never sent anywhere. */
export const localTelemetrySchema = z.object({
  id: idSchema,
  kind: z.enum(['event', 'error']),
  name: z.string().min(1).max(120),
  message: z.string().max(500).optional(),
  at: isoDateSchema,
});
export type LocalTelemetryEntry = z.infer<typeof localTelemetrySchema>;

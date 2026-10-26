// Feedback, tickets and FAQ votes (M3 assumptions 18, 24; build pack section 6).
import { z } from 'zod';
import { localKeySchema } from './learning';
import { idSchema, isoDateSchema } from './primitives';

export const moduleFeedbackSchema = z
  .object({
    id: idSchema,
    clientId: idSchema,
    siteId: idSchema,
    /** Absent when anonymous: no name and no user id is stored at all (assumption 18). */
    personId: idSchema.optional(),
    anonymous: z.boolean(),
    moduleId: idSchema,
    moduleVersion: z.number().int().min(1),
    lessonId: localKeySchema.optional(),
    questionId: localKeySchema.optional(),
    kind: z.enum(['moduleCard', 'lessonThumb', 'questionReport']),
    rating: z.number().int().min(1).max(5).optional(),
    thumb: z.enum(['up', 'down']).optional(),
    tags: z.array(z.string()),
    text: z.string().max(500).optional(),
    status: z.enum(['new', 'reviewed', 'actioned', 'noAction']),
    reply: z.object({ byUserId: idSchema, text: z.string().min(1), at: isoDateSchema }).optional(),
    escalatedToProvider: z.object({ by: idSchema, note: z.string(), at: isoDateSchema }).optional(),
    createdAt: isoDateSchema,
  })
  .superRefine((f, ctx) => {
    const fail = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (f.anonymous && f.personId !== undefined) fail('personId', 'Anonymous feedback has no person');
    if (f.kind === 'lessonThumb' && (f.lessonId === undefined || f.thumb === undefined))
      fail('lessonId', 'A lesson thumb needs a lesson and a thumb');
    if (f.kind === 'questionReport' && f.questionId === undefined)
      fail('questionId', 'A question report needs a question');
  });
export type ModuleFeedback = z.infer<typeof moduleFeedbackSchema>;

export const appFeedbackSchema = z.object({
  id: idSchema,
  clientId: idSchema.optional(),
  siteId: idSchema.optional(),
  userId: idSchema,
  side: z.enum(['staff', 'client']),
  kind: z.enum(['idea', 'problem', 'praise']),
  rating: z.number().int().min(1).max(5).optional(),
  text: z.string(),
  context: z.record(z.string(), z.string()),
  status: z.enum(['new', 'triaged', 'planned', 'done', 'wontDo']),
  tags: z.array(z.string()),
  createdAt: isoDateSchema,
  ticketId: idSchema.optional(),
});
export type AppFeedback = z.infer<typeof appFeedbackSchema>;

export const ticketSchema = z.object({
  id: idSchema,
  number: z.string().min(1),
  clientId: idSchema,
  siteId: idSchema.optional(),
  raisedBy: idSchema,
  raiserSide: z.enum(['staff', 'client']),
  sharedWithManager: z.boolean(),
  featureId: z.string().optional(),
  featureOtherText: z.string().optional(),
  issueTypeId: z.string().optional(),
  issueTypeOtherText: z.string().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  impact: z.enum(['blocked', 'workaround', 'question']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  status: z.enum(['received', 'inProgress', 'waitingForCustomer', 'resolved', 'closed']),
  internalStatus: z.string().optional(),
  assigneeId: idSchema.optional(),
  tags: z.array(z.string()),
  context: z.record(z.string(), z.string()),
  linkedErrorIds: z.array(idSchema),
  linkedFeedbackId: idSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  firstResponseAt: isoDateSchema.optional(),
  resolvedAt: isoDateSchema.optional(),
  closedAt: isoDateSchema.optional(),
  satisfaction: z.enum(['up', 'down']).optional(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const ticketMessageSchema = z.object({
  id: idSchema,
  ticketId: idSchema,
  authorId: idSchema,
  side: z.enum(['customer', 'provider']),
  body: z.string().min(1),
  internal: z.boolean(),
  attachmentIds: z.array(idSchema),
  createdAt: isoDateSchema,
});
export type TicketMessage = z.infer<typeof ticketMessageSchema>;

export const faqVoteSchema = z.object({
  key: z.string().min(1),
  faqId: z.string().min(1),
  userId: idSchema,
  helpful: z.boolean(),
});
export type FaqVote = z.infer<typeof faqVoteSchema>;

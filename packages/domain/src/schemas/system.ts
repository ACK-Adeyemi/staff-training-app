// Outbox, seed metadata and demo shell state. Build pack sections 6 and 9.
import { z } from 'zod';
import { idSchema, isoDateSchema, sideSchema } from './primitives';

export const outboxMessageSchema = z.object({
  id: idSchema,
  channel: z.enum(['email', 'push', 'sms']),
  to: z.string().min(1),
  subject: z.string().optional(),
  body: z.string(),
  at: isoDateSchema,
  reason: z.string(),
});
export type OutboxMessage = z.infer<typeof outboxMessageSchema>;

export const seedMetaSchema = z.object({
  seedValue: z.number().int(),
  today: isoDateSchema,
});
export type SeedMeta = z.infer<typeof seedMetaSchema>;

export const demoStateSchema = z.object({
  clockOffsetMs: z.number(),
  industry: z.enum(['nursery', 'luxuryRetail']),
  persona: z.object({ side: sideSchema, userId: idSchema }),
});
export type DemoState = z.infer<typeof demoStateSchema>;

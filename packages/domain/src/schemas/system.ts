// Outbox, seed metadata and demo shell state. Build pack sections 6 and 9.
import { z } from 'zod';
import { learnerPrefsSchema } from './tenancy';
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
  /** Which version of the seeded world is stored. Missing means version 1 (M0). */
  seedVersion: z.number().int().positive().optional(),
});
export type SeedMeta = z.infer<typeof seedMetaSchema>;

/** The display subset of LearnerPrefs, kept on the device for the provider side and S1 (M2 assumption 29). */
export const displayPrefsSchema = learnerPrefsSchema
  .pick({
    simpleView: true,
    textScale: true,
    uiScale: true,
    contrast: true,
    colourMode: true,
    reduceMotion: true,
    sound: true,
    haptics: true,
    readingFont: true,
    biggerButtons: true,
    spacing: true,
    readAloud: true,
    readAloudRate: true,
  })
  .partial();
export type DisplayPrefs = z.infer<typeof displayPrefsSchema>;

export const demoStateSchema = z.object({
  clockOffsetMs: z.number(),
  industry: z.enum(['nursery', 'luxuryRetail']),
  persona: z.object({ side: sideSchema, userId: idSchema }),
  displayPrefs: displayPrefsSchema.optional(),
});
export type DemoState = z.infer<typeof demoStateSchema>;

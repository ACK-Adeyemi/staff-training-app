// Evidence and external certificate submissions. Build pack section 6.
import { z } from 'zod';
import { idSchema, isoDateSchema } from './primitives';

export const evidenceSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  personId: idSchema,
  requirementId: idSchema,
  kind: z.enum(['module', 'external']),
  completedAt: isoDateSchema,
  expiresAt: isoDateSchema.optional(),
  moduleId: idSchema.optional(),
  moduleVersion: z.number().int().positive().optional(),
  language: z.string().optional(),
  attachmentId: idSchema.optional(),
  siteIdAtTime: idSchema,
  submissionId: idSchema.optional(),
  approvedBy: idSchema.optional(),
  approvedAt: isoDateSchema.optional(),
  selfApproved: z.boolean().optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const evidenceSubmissionSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  siteId: idSchema,
  personId: idSchema,
  requirementId: idSchema,
  uploadedBy: idSchema,
  fileAttachmentId: idSchema,
  providerName: z.string().min(1),
  completedAt: isoDateSchema,
  expiresAt: isoDateSchema.optional(),
  certificateRef: z.string().optional(),
  status: z.enum(['awaitingCheck', 'needsBetterCopy', 'approved', 'rejected', 'withdrawn']),
  reviewerId: idSchema.optional(),
  reviewedAt: isoDateSchema.optional(),
  decisionNote: z.string().optional(),
  rejectionReason: z.string().optional(),
  evidenceId: idSchema.optional(),
  createdAt: isoDateSchema,
});
export type EvidenceSubmission = z.infer<typeof evidenceSubmissionSchema>;

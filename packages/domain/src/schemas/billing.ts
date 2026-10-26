// Fake billing data for the demo (M3 assumptions 40 and 41). Money is integer pence. No card numbers are ever stored.
import { z } from 'zod';
import { idSchema, isoDateSchema, penceSchema } from './primitives';

export const invoiceSchema = z.object({
  id: idSchema,
  number: z.string().min(1),
  clientId: idSchema,
  issuedAt: isoDateSchema,
  dueAt: isoDateSchema,
  /** Never change after issue. */
  billingNameAtIssue: z.string().min(1),
  billingAddressAtIssue: z.string(),
  lines: z.array(z.object({ label: z.string().min(1), amount: penceSchema, siteId: idSchema.optional() })),
  tax: penceSchema,
  total: penceSchema,
  status: z.enum(['paid', 'due', 'overdue', 'refunded']),
});
export type Invoice = z.infer<typeof invoiceSchema>;

/** Brand and last four digits only: the full number is never entered or stored. */
export const paymentMethodSchema = z.object({
  brand: z.string().min(1),
  last4: z.string().regex(/^\d{4}$/),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2000).max(2100),
});

export const billingProfileSchema = z.object({
  clientId: idSchema,
  billingName: z.string().min(1),
  address: z.string(),
  vatNumber: z.string().optional(),
  billingContactEmail: z.string().min(3),
  paymentMethod: paymentMethodSchema.optional(),
  updatedBy: idSchema,
  updatedAt: isoDateSchema,
});
export type BillingProfile = z.infer<typeof billingProfileSchema>;

export const billingChangeRequestSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  requestedBy: idSchema,
  proposed: z.strictObject({
    billingName: z.string().min(1).optional(),
    address: z.string().optional(),
    vatNumber: z.string().optional(),
  }),
  status: z.enum(['pending', 'approved', 'declined']),
  reviewerId: idSchema.optional(),
  reason: z.string().optional(),
  createdAt: isoDateSchema,
});
export type BillingChangeRequest = z.infer<typeof billingChangeRequestSchema>;

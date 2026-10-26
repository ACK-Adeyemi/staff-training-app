// Industry packs and requirements. Build pack section 6.
import { z } from 'zod';
import { countSchema, idSchema } from './primitives';
import { jobRoleSchema } from './tenancy';

export const requirementSchema = z.object({
  id: idSchema,
  packId: idSchema.optional(),
  clientId: idSchema.optional(),
  name: z.string().min(1),
  appliesTo: z.object({
    all: z.boolean().optional(),
    jobRoleIds: z.array(idSchema).optional(),
    siteAttributes: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  }),
  renewEveryMonths: countSchema.optional(),
  evidence: z.array(z.enum(['module', 'external'])),
  satisfiedByModuleIds: z.array(idSchema),
  sourceRef: z.string().optional(),
  acceptsExternal: z.boolean(),
  acceptedProviders: z.array(z.object({ name: z.string().min(1), courseUrl: z.string().optional() })),
  expiryMode: z.enum(['fromCertificate', 'fromRenewalPeriod']),
  approverChecklist: z.array(z.string()),
});
export type Requirement = z.infer<typeof requirementSchema>;

// Auto-assign rules arrive in a later milestone; packs carry them as opaque records until then.
export const industryPackSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  status: z.enum(['full', 'stub']),
  terminology: z.record(z.string(), z.string()),
  jobRoles: z.array(jobRoleSchema),
  requirements: z.array(requirementSchema),
  defaultCategoryIds: z.array(idSchema).default([]),
  defaultRules: z.array(z.record(z.string(), z.unknown())).default([]),
  faqIds: z.array(idSchema).default([]),
  supportFeatureIds: z.array(idSchema).default([]),
  prizeSuggestions: z.array(z.string()),
});
export type IndustryPack = z.infer<typeof industryPackSchema>;

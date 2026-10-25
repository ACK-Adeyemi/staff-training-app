// Roles, permissions and audit. Build pack section 6.
import { z } from 'zod';
import { idSchema, isoDateSchema, sideSchema } from './primitives';

export const permissionSchema = z.object({
  id: z.string().min(1),
  area: z.string().min(1),
  action: z.string().min(1),
  description: z.string(),
  sensitive: z.boolean(),
  requires: z.array(z.string()),
});
export type Permission = z.infer<typeof permissionSchema>;

const level = z.enum(['none', 'view', 'manage']);

export const roleSchema = z.object({
  id: idSchema,
  owner: z.union([z.literal('provider'), z.object({ clientId: idSchema })]),
  name: z.string().min(1),
  description: z.string(),
  colour: z.string(),
  permissionIds: z.array(z.string()),
  system: z.boolean(),
  version: z.number().int().positive(),
  clientLevels: z.record(z.string(), level).optional(),
  clientAllows: z.array(z.string()).optional(),
  updatedBy: idSchema,
  updatedAt: isoDateSchema,
});
export type Role = z.infer<typeof roleSchema>;

export const scopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('clients'), ids: z.array(idSchema) }),
  z.object({ type: z.literal('sites'), ids: z.array(idSchema) }),
  z.object({ type: z.literal('own') }),
]);

export const roleAssignmentSchema = z.object({
  id: idSchema,
  userId: idSchema,
  roleIds: z.array(idSchema),
  scope: scopeSchema,
  grants: z.array(z.string()),
  denies: z.array(z.string()),
  expiresAt: isoDateSchema.optional(),
  status: z.enum(['active', 'suspended']),
});
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

export const auditEventSchema = z.object({
  id: idSchema,
  actorId: idSchema,
  actorSide: sideSchema,
  clientId: idSchema.optional(),
  action: z.string().min(1),
  target: z.string().min(1),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  reason: z.string().optional(),
  at: isoDateSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

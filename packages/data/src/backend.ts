// The small storage interface an adapter implements. Everything else (validation, tenancy, permissions, audit,
// copies) lives in createStore, so the memory and IndexedDB adapters enforce exactly the same rules.
import {
  addOnSchema,
  assignmentSchema,
  attachmentSchema,
  attemptSchema,
  addOnSubscriptionSchema,
  auditEventSchema,
  clientLinkOverlaySchema,
  clientSchema,
  evidenceSchema,
  evidenceSubmissionSchema,
  jobRoleSchema,
  learningEventSchema,
  moduleSchema,
  notificationSchema,
  outboxMessageSchema,
  packageSchema,
  paymentAttemptSchema,
  personSchema,
  requirementSchema,
  roleAssignmentSchema,
  roleSchema,
  siteSchema,
  subscriptionSchema,
  teamSchema,
  userAccountSchema,
} from '@sta/domain';
import { ValidationError, type StoreName } from './types';

export type WriteOp =
  { type: 'put'; store: StoreName; key: string; record: unknown } | { type: 'delete'; store: StoreName; key: string };

/**
 * Raw storage. Implementations must return copies from getAll and get, store copies in apply, and apply
 * every operation in one batch (all or nothing).
 */
export interface RawBackend {
  getAll(store: StoreName): Promise<unknown[]>;
  get(store: StoreName, key: string): Promise<unknown>;
  apply(ops: readonly WriteOp[]): Promise<void>;
  clear(): Promise<void>;
}

type Parsed = {
  success: boolean;
  data?: unknown;
  error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
};
type Parser = { safeParse(value: unknown): Parsed };

export type SettingsRecord = { key: string; value: unknown };
const settingsParser: Parser = {
  safeParse(value) {
    const v = value as Partial<SettingsRecord> | null;
    if (typeof v === 'object' && v !== null && typeof v.key === 'string' && v.key !== '' && 'value' in v) {
      return { success: true, data: { key: v.key, value: v.value } };
    }
    return { success: false, error: { issues: [{ path: [], message: 'A setting needs a key and a value' }] } };
  },
};

const parsers: Record<StoreName, Parser> = {
  clients: clientSchema,
  sites: siteSchema,
  teams: teamSchema,
  people: personSchema,
  users: userAccountSchema,
  jobRoles: jobRoleSchema,
  requirements: requirementSchema,
  evidence: evidenceSchema,
  evidenceSubmissions: evidenceSubmissionSchema,
  roles: roleSchema,
  roleAssignments: roleAssignmentSchema,
  packages: packageSchema,
  addOns: addOnSchema,
  subscriptions: subscriptionSchema,
  addOnSubscriptions: addOnSubscriptionSchema,
  paymentAttempts: paymentAttemptSchema,
  audit: auditEventSchema,
  outbox: outboxMessageSchema,
  settings: settingsParser,
  modules: moduleSchema,
  attachments: attachmentSchema,
  assignments: assignmentSchema,
  learningEvents: learningEventSchema,
  attempts: attemptSchema,
  notifications: notificationSchema,
  clientLinkOverlays: clientLinkOverlaySchema,
};

/** Parses with the domain schema; throws ValidationError listing every issue. Returns the cleaned record. */
export function validate(store: StoreName, value: unknown, label = ''): unknown {
  const result = parsers[store].safeParse(value);
  if (!result.success) {
    const issues = (result.error?.issues ?? []).map((i) => {
      const path = i.path.map(String).join('.');
      return `${label}${path === '' ? '' : `${path}: `}${i.message}`;
    });
    throw new ValidationError(issues.length > 0 ? issues : [`${label}Invalid record`]);
  }
  return result.data;
}

/** The storage key of a (validated) record. */
export function keyOf(store: StoreName, record: unknown): string {
  const r = record as Record<string, string>;
  switch (store) {
    case 'subscriptions':
      return r['clientId'] as string;
    case 'addOnSubscriptions':
      return `${r['clientId'] as string}:${r['addOnId'] as string}`;
    case 'settings':
      return r['key'] as string;
    default:
      return r['id'] as string;
  }
}

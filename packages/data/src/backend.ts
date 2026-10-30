// The small storage interface an adapter implements. Everything else (validation, tenancy, permissions, audit,
// copies) lives in createStore, so the memory and IndexedDB adapters enforce exactly the same rules.
import {
  priceAdjustmentSchema,
  ownershipTransferSchema,
  announcementSchema,
  releaseNoteSchema,
  recoveryRequestSchema,
  dataRequestSchema,
  incidentSchema,
  otherEntryGroupSchema,
  savedReplySchema,
  profileChangeRequestSchema,
  linkCheckResultSchema,
  moduleNoticeSchema,
  usageDailySchema,
  errorGroupSchema,
  healthScoreSchema,
  localTelemetrySchema,
  addOnRequestSchema,
  addOnSchema,
  appFeedbackSchema,
  autoAssignRuleSchema,
  billingChangeRequestSchema,
  billingProfileSchema,
  faqVoteSchema,
  invitationSchema,
  invoiceSchema,
  moduleDraftSchema,
  moduleFeedbackSchema,
  moduleVersionSchema,
  onboardingChecklistSchema,
  reminderLogSchema,
  themeSchema,
  ticketMessageSchema,
  ticketSchema,
  assignmentSchema,
  attachmentSchema,
  attemptSchema,
  addOnSubscriptionSchema,
  auditEventSchema,
  clientLinkOverlaySchema,
  categorySchema,
  clientSchema,
  competitionSchema,
  evidenceSchema,
  evidenceSubmissionSchema,
  jobRoleSchema,
  learningEventSchema,
  moduleGroupSchema,
  modulePlacementSchema,
  moduleSchema,
  noteSchema,
  notificationSchema,
  outboxMessageSchema,
  packageSchema,
  paymentAttemptSchema,
  personSchema,
  requirementSchema,
  roleAssignmentSchema,
  roleSchema,
  siteSchema,
  standingBoardSettingsSchema,
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
  notes: noteSchema,
  categories: categorySchema,
  modulePlacements: modulePlacementSchema,
  moduleGroups: moduleGroupSchema,
  competitions: competitionSchema,
  standingBoardSettings: standingBoardSettingsSchema,
  moduleDrafts: moduleDraftSchema,
  moduleVersions: moduleVersionSchema,
  autoAssignRules: autoAssignRuleSchema,
  reminderLog: reminderLogSchema,
  themes: themeSchema,
  invitations: invitationSchema,
  onboarding: onboardingChecklistSchema,
  invoices: invoiceSchema,
  billingProfiles: billingProfileSchema,
  billingChangeRequests: billingChangeRequestSchema,
  addOnRequests: addOnRequestSchema,
  moduleFeedback: moduleFeedbackSchema,
  appFeedback: appFeedbackSchema,
  tickets: ticketSchema,
  ticketMessages: ticketMessageSchema,
  faqVotes: faqVoteSchema,
  priceAdjustments: priceAdjustmentSchema,
  ownershipTransfers: ownershipTransferSchema,
  announcements: announcementSchema,
  releaseNotes: releaseNoteSchema,
  recoveryRequests: recoveryRequestSchema,
  dataRequests: dataRequestSchema,
  incidents: incidentSchema,
  otherEntryGroups: otherEntryGroupSchema,
  savedReplies: savedReplySchema,
  profileChangeRequests: profileChangeRequestSchema,
  linkCheckResults: linkCheckResultSchema,
  moduleNotices: moduleNoticeSchema,
  usageDaily: usageDailySchema,
  errorGroups: errorGroupSchema,
  healthScores: healthScoreSchema,
  localTelemetry: localTelemetrySchema,
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
    case 'standingBoardSettings':
    case 'onboarding':
    case 'billingProfiles':
      return r['clientId'] as string;
    case 'moduleDrafts':
      return r['moduleId'] as string;
    case 'moduleVersions':
    case 'reminderLog':
    case 'faqVotes':
      return r['key'] as string;
    case 'addOnSubscriptions':
      return `${r['clientId'] as string}:${r['addOnId'] as string}`;
    case 'usageDaily':
      return `${r['clientId'] as string}:${r['date'] as string}:${r['feature'] as string}`;
    case 'healthScores':
      return `${r['clientId'] as string}:${r['date'] as string}`;
    case 'modulePlacements':
      return `${r['clientId'] as string}:${r['moduleId'] as string}`;
    case 'settings':
      return r['key'] as string;
    default:
      return r['id'] as string;
  }
}

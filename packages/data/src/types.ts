// Public types of the data layer (build pack 4.3). The UI talks to a DataStore and nothing else.
import type {
  AccountState,
  Announcement,
  DataRequest,
  Incident,
  ErrorGroup,
  HealthScore,
  LocalTelemetryEntry,
  UsageDaily,
  ProfileChangeRequest,
  RecoveryRequest,
  ReleaseNote,
  LinkCheckResult,
  MaintenanceApp,
  OtherEntryGroup,
  SavedReply,
  AddOn,
  AddOnSubscription,
  PriceAdjustment,
  OwnershipTransfer,
  previewAdjustment,
  EffectiveEntitlements,
  Assignment,
  Attachment,
  Attempt,
  AuditEvent,
  FileAttachment,
  ModuleDraft,
  ModuleVersion,
  BoardId,
  LeaderboardScope,
  SiteBoardEntry,
  SiteBoardPeriod,
  SiteBoardRow,
  SiteMeasure,
  ScheduledDeletion,
  Theme,
  ManualSkipReason,
  Category,
  Client,
  ClientLinkOverlay,
  Clock,
  Competition,
  DemoState,
  EffectivePermission,
  Evidence,
  EvidenceSubmission,
  JobRole,
  LearnerPrefs,
  LeaderboardRow,
  LearningEvent,
  Module,
  ModuleGroup,
  ModulePlacement,
  Note,
  Notification,
  OutboxMessage,
  Package,
  PaymentAttempt,
  Person,
  Requirement,
  Rng,
  Role,
  RoleAssignment,
  SeedMeta,
  Site,
  StandingBoardSettings,
  Subscription,
  Team,
  UserAccount,
  ViewerPosition,
  WinnerLine,
  ClientLevels,
  Invitation,
  AppFeedback,
  FaqVote,
  ModuleFeedback,
  ProviderFeedbackProjection,
  ReviewDecision,
  Ticket,
  TicketMessage,
  Scope,
  TwoFactorStatus,
  AddOnRequest,
  BillingChangeRequest,
  Invoice,
  AutoAssignRule,
  ClientSettings,
  ModuleNotice,
  OnboardingChecklist,
} from '@sta/domain';

export type Id = string;

export const storeNames = [
  'clients',
  'sites',
  'teams',
  'people',
  'users',
  'jobRoles',
  'requirements',
  'evidence',
  'evidenceSubmissions',
  'roles',
  'roleAssignments',
  'packages',
  'addOns',
  'subscriptions',
  'addOnSubscriptions',
  'paymentAttempts',
  'audit',
  'outbox',
  'settings',
  'modules',
  'attachments',
  'assignments',
  'learningEvents',
  'attempts',
  'notifications',
  'clientLinkOverlays',
  'notes',
  'categories',
  'modulePlacements',
  'moduleGroups',
  'competitions',
  'standingBoardSettings',
  'moduleDrafts',
  'moduleVersions',
  'autoAssignRules',
  'reminderLog',
  'themes',
  'invitations',
  'onboarding',
  'invoices',
  'billingProfiles',
  'billingChangeRequests',
  'addOnRequests',
  'moduleFeedback',
  'appFeedback',
  'tickets',
  'ticketMessages',
  'faqVotes',
  'priceAdjustments',
  'ownershipTransfers',
  'announcements',
  'releaseNotes',
  'recoveryRequests',
  'dataRequests',
  'incidents',
  'otherEntryGroups',
  'savedReplies',
  'profileChangeRequests',
  'linkCheckResults',
  'moduleNotices',
  'usageDaily',
  'errorGroups',
  'healthScores',
  'localTelemetry',
] as const;
export type StoreName = (typeof storeNames)[number];

/** Who is asking, and when. `now` is an ISO date from the injected clock; adapters never read the real time. */
export type ActorContext = {
  userId: Id;
  side: 'staff' | 'client' | 'provider';
  clientId?: Id;
  now: string;
};

/** Injected into every adapter: ids for new records come from these. */
export type StoreOptions = { clock: Clock; rng: Rng };

export type ForbiddenReason =
  | 'unknownActor'
  | 'tenant'
  | 'permission'
  | 'selfEdit'
  | 'escalation'
  | 'lastOwner'
  | 'ownUpload'
  | 'aboutSelf'
  | 'outOfScope'
  | 'twoFactorRequired';

export class DataError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class NotFoundError extends DataError {
  constructor(message = 'Not found') {
    super('notFound', message);
  }
}

export class ForbiddenError extends DataError {
  readonly reason: ForbiddenReason;
  constructor(reason: ForbiddenReason) {
    super('forbidden', `Forbidden: ${reason}`);
    this.reason = reason;
  }
}

export class NotEntitledError extends DataError {
  readonly feature: string;
  constructor(feature: string) {
    super('notEntitled', `Not included in this package: ${feature}`);
    this.feature = feature;
  }
}

export class AccountStateError extends DataError {
  readonly state: AccountState;
  readonly feature: string;
  constructor(state: AccountState, feature: string) {
    super('accountState', `Not available while the account is ${state}: ${feature}`);
    this.state = state;
    this.feature = feature;
  }
}

export class ValidationError extends DataError {
  readonly issues: string[];
  constructor(issues: string[]) {
    super('validation', `Invalid record: ${issues.join('; ')}`);
    this.issues = issues;
  }
}

export type RuleName =
  | 'lessonsIncomplete'
  | 'noRetakesLeft'
  | 'attemptFinished'
  | 'alreadyAnswered'
  | 'notInAttempt'
  | 'notAllAnswered'
  | 'moduleNotPublished'
  | 'invalidAnswer'
  | 'dueInPast'
  | 'tooMany'
  | 'invalidPeople'
  | 'notesLocked'
  | 'closedBook'
  | 'closedBookOnly'
  | 'metricLocked'
  | 'endBeforeStart'
  | 'endShortened'
  | 'competitionEnded'
  | 'competitionCancelled'
  | 'winnersRecorded'
  | 'notEnded'
  | 'prizeRequired'
  | 'invalidCompetition'
  | 'nameTaken'
  | 'lessonMissing'
  | 'checklistFailed'
  | 'providerModuleReadOnly'
  | 'hasCompletions'
  | 'storageFull'
  | 'fileTooLarge'
  | 'fileType'
  | 'imageMetadata'
  | 'notHttps'
  | 'anonymousNoReply'
  | 'openSubmission'
  | 'notExternal'
  | 'notApplicable'
  | 'wrongCode'
  | 'codeLocked'
  | 'stepUpRequired'
  | 'usageCapReached'
  | 'invalidTemplate'
  | 'invalidTheme'
  | 'invalidScope'
  | 'invalidName'
  | 'revokeAccessFirst'
  | 'staffTicketsOff'
  | 'duplicateRule'
  | 'invalidSubmission'
  | 'invalidDecision'
  | 'notAwaitingCheck'
  | 'invalidFeedback'
  | 'invalidTicket'
  | 'invalidReply'
  | 'invalidClient'
  | 'invalidPublish'
  | 'duplicate';

/** A business rule said no (for example "finish every lesson first"). The web app maps `rule` to `errors.rule.<rule>`. */
export class RuleError extends DataError {
  readonly rule: RuleName;
  constructor(rule: RuleName) {
    super('rule', `Rule: ${rule}`);
    this.rule = rule;
  }
}

/** Equality filter on top-level fields. */
export type Filter = Record<string, unknown>;

export interface ReadRepo<T> {
  /** Throws NotFoundError when the record does not exist or the actor may not see it. */
  get(ctx: ActorContext, id: Id): Promise<T>;
  /** Sorted by id. Throws ForbiddenError('permission') when the actor may not read this store at all. */
  list(ctx: ActorContext, filter?: Filter): Promise<T[]>;
}
export interface WriteRepo<T> extends ReadRepo<T> {
  put(ctx: ActorContext, record: T): Promise<T>;
}
export interface RemovableRepo<T> extends WriteRepo<T> {
  remove(ctx: ActorContext, id: Id): Promise<void>;
}
/** Audit events and outbox messages can only be added. There is no put or remove. */
export interface AppendRepo<T> {
  append(ctx: ActorContext, record: T): Promise<T>;
}

export type FinishResult = {
  attempt: Attempt;
  passed: boolean;
  score: number;
  missedQuestionIds: string[];
  evidence: Evidence[];
};

export interface LearningService {
  recordLesson(
    ctx: ActorContext,
    input: { moduleId: Id; lessonId: string; kind: 'viewed' | 'completed' },
  ): Promise<LearningEvent>;
  /** `closed` hides notes and Learn more until the attempt ends. A closed-book-only module always starts closed. */
  startAttempt(ctx: ActorContext, moduleId: Id, opts?: { mode?: 'open' | 'closed' }): Promise<Attempt>;
  answer(
    ctx: ActorContext,
    input: {
      attemptId: Id;
      questionId: string;
      optionId?: string;
      choiceIds?: string[];
      notesVisible?: boolean;
    },
  ): Promise<{ correct: boolean; outcome?: 'best' | 'ok' | 'poor' }>;
  finishAttempt(ctx: ActorContext, attemptId: Id): Promise<FinishResult>;
  /** Ends an unfinished attempt without a score ("Leave this attempt"). Never counts towards retakes. */
  abandonAttempt(ctx: ActorContext, attemptId: Id): Promise<Attempt>;
  learnMoreOpened(
    ctx: ActorContext,
    input: { moduleId: Id; questionId?: string; lessonId?: string; linkId: string; attemptId?: Id },
  ): Promise<LearningEvent>;
}

export type MeRecord = { displayName: string; nickname?: string; prefs: LearnerPrefs };

/** Private notes: staff, own person only (M2 assumptions 20, 21). */
export interface NotesService {
  list(ctx: ActorContext, filter?: { moduleId?: Id; starred?: boolean }): Promise<Note[]>;
  get(ctx: ActorContext, id: Id): Promise<Note>;
  save(
    ctx: ActorContext,
    input: { id?: Id; moduleId: Id; lessonId?: string; body: string; starred?: boolean },
  ): Promise<Note>;
  remove(ctx: ActorContext, id: Id): Promise<void>;
}

/** The caller's own person: display settings and profile. Never paywalled (accessibility). */
/** What the signed-in person may do. Their own effective permissions only; never anyone else's. */
export interface AccessService {
  permissions(ctx: ActorContext): Promise<EffectivePermission[]>;
  /** Which paid features are on for the actor's organisation. Staff and client actors; never prices (M3 assumption 44). */
  features(ctx: ActorContext): Promise<{ aiAssistant: boolean }>;
}

export interface MeService {
  get(ctx: ActorContext): Promise<MeRecord>;
  /** `quietHours: null` clears the person's quiet hours. */
  updatePrefs(
    ctx: ActorContext,
    patch: Partial<Omit<LearnerPrefs, 'quietHours'>> & { quietHours?: LearnerPrefs['quietHours'] | null },
  ): Promise<MeRecord>;
  updateProfile(
    ctx: ActorContext,
    patch: { nickname?: string | null; hideFromLeaderboards?: boolean },
  ): Promise<MeRecord>;
}

export interface CategoriesService extends ReadRepo<Category> {
  save(ctx: ActorContext, input: { id?: Id; name: string; colour: string; icon: string }): Promise<Category>;
  /** One batch. The given ids take the existing order slots in the new sequence. */
  reorder(ctx: ActorContext, ids: Id[]): Promise<void>;
  /** Moves the category's placements to `moveTo` (or leaves them uncategorised) and deletes it, in one batch. */
  remove(ctx: ActorContext, id: Id, opts?: { moveTo?: Id }): Promise<void>;
  merge(ctx: ActorContext, fromId: Id, intoId: Id): Promise<void>;
}

export interface ModuleGroupsService extends ReadRepo<ModuleGroup> {
  save(
    ctx: ActorContext,
    input: {
      id?: Id;
      siteId?: Id;
      name: string;
      description: string;
      moduleIds: Id[];
      inOrder: boolean;
    },
  ): Promise<ModuleGroup>;
  remove(ctx: ActorContext, id: Id): Promise<void>;
}

/** Keyed by `${clientId}:${moduleId}`. */
export interface ModulePlacementsService extends ReadRepo<ModulePlacement> {
  /** Leave `categoryId` out to take the modules out of any category. */
  setCategory(ctx: ActorContext, input: { moduleIds: Id[]; categoryId?: Id }): Promise<void>;
  setAvailable(ctx: ActorContext, input: { moduleIds: Id[]; availableToAll: boolean }): Promise<void>;
}

export type BoardPeriodId = 'allTime' | 'thisMonth' | 'thisQuarter';

/** Admin rows carry ids only for ranked, non-hidden people (or teams, sites). Staff rows never carry ids. */
export type StandingsRow = LeaderboardRow extends infer R
  ? Omit<R, 'isViewer'> & { isViewer?: boolean; personId?: string; teamId?: string; siteId?: string }
  : never;

/** `visible: false` for a custom competition. `eligible` is for staff, so the app can show "not eligible" without ids. */
export type StandingsView = {
  visible: boolean;
  rows?: StandingsRow[];
  viewer?: ViewerPosition | null;
  of?: number;
  eligible?: boolean;
  winners?: WinnerLine[];
};

/** `off: true` when the client switched the board off. `unranked` lists teams with nothing due ("No training due"). */
export type BoardView = {
  visible: boolean;
  off?: boolean;
  rows?: StandingsRow[];
  viewer?: ViewerPosition | null;
  of?: number;
  unranked?: string[];
};

export interface CompetitionsService {
  /** Staff get scheduled, live and ended competitions as a projection: no winners' ids, no excluded people. */
  list(ctx: ActorContext): Promise<Competition[]>;
  get(ctx: ActorContext, id: Id): Promise<Competition>;
  save(ctx: ActorContext, competition: Competition): Promise<Competition>;
  publish(ctx: ActorContext, id: Id): Promise<Competition>;
  cancel(ctx: ActorContext, id: Id): Promise<Competition>;
  extend(ctx: ActorContext, id: Id, endAt: string): Promise<Competition>;
  recordWinners(ctx: ActorContext, id: Id): Promise<Competition>;
  standings(ctx: ActorContext, id: Id): Promise<StandingsView>;
  /** What the client's package allows (for example closed-book competitions), so the builder can explain a disabled switch. */
  entitlements(ctx: ActorContext): Promise<EffectiveEntitlements>;
}

/** A Sites board row. `small` marks a site with too few people for a fair percentage. */
export type SitesBoardRow = SiteBoardRow & { small: boolean; eligible: number; siteName: string };
export type SitesBoardView = {
  rows: SitesBoardRow[];
  own: SitesBoardRow | null;
  toNext: { people: number } | null;
  /** Site managers only: the measure details of their own site. */
  detail?: SiteBoardEntry;
};

export interface LeaderboardsService {
  /** The scopes that apply to the viewer (My site, My region, My country, All sites). [] without a person record. */
  scopes(ctx: ActorContext): Promise<LeaderboardScope[]>;
  /**
   * `scope` defaults to My site. Staff may use a scope only when it applies and the client switched it on for the
   * board; otherwise RuleError('invalidScope'). Client admins may use any scope that applies.
   */
  standing(
    ctx: ActorContext,
    input: { board: BoardId; period: BoardPeriodId; siteId?: Id; scope?: LeaderboardScope },
  ): Promise<BoardView>;
  /** The Sites board (brief 13.5, assumption 39). Staff never get person ids; site managers also get their site detail. */
  sitesBoard(
    ctx: ActorContext,
    input: { measure: SiteMeasure; period: SiteBoardPeriod; scope: LeaderboardScope; region?: string },
  ): Promise<SitesBoardView>;
  settings(ctx: ActorContext): Promise<StandingBoardSettings>;
  saveSettings(ctx: ActorContext, settings: StandingBoardSettings): Promise<StandingBoardSettings>;
}

export type TeamMember = {
  userId: Id;
  displayName: string;
  email?: string;
  status: UserAccount['status'];
  roleIds: Id[];
  scope?: Scope;
  /** Why this person's access cannot be changed or revoked by the actor: their own, or the only Account Owner. */
  accessLocked?: 'self' | 'lastOwner';
};

/** An activity entry: ids, action names and counts only. Never note text, feedback text or file contents. */
export type ActivityLine = {
  id: Id;
  actorId: Id;
  clientId?: Id;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
  at: string;
};

export type CustomRoleInput = {
  id?: Id;
  name: string;
  description?: string;
  colour?: string;
  levels: ClientLevels;
  allows: string[];
};

export type SettingsPatch = Partial<{
  amberWindowDays: number;
  weeklyGoalLessons: number;
  firstAiderThreshold: number;
  allowStaffTickets: boolean;
  pulseSurveys: boolean;
}>;

export type OnboardingView = {
  steps: { key: string; done: boolean; doneAt?: string }[];
  startedAt?: string;
  completedAt?: string;
};

/** Two-step sign-in (simulated: the demo accepts 123456). Reachable while an admin is limited. */
export interface TwoFactorService {
  status(ctx: ActorContext): Promise<TwoFactorStatus>;
  startEnrolment(ctx: ActorContext): Promise<{ secret: string; uri: string }>;
  /** Returns the ten recovery codes, once. Only their hashes are stored. */
  confirmEnrolment(ctx: ActorContext, code: string): Promise<{ recoveryCodes: string[] }>;
  verify(ctx: ActorContext, code: string): Promise<void>;
  useRecoveryCode(ctx: ActorContext, code: string): Promise<void>;
}

export interface TeamService {
  members(ctx: ActorContext): Promise<TeamMember[]>;
  invite(
    ctx: ActorContext,
    input: { email: string; displayName?: string; roleIds: Id[]; scope: Scope },
  ): Promise<Invitation>;
  setAccess(ctx: ActorContext, userId: Id, input: { roleIds: Id[]; scope: Scope }): Promise<RoleAssignment>;
  revoke(ctx: ActorContext, userId: Id): Promise<void>;
  saveCustomRole(ctx: ActorContext, input: CustomRoleInput): Promise<Role>;
  removeCustomRole(ctx: ActorContext, roleId: Id): Promise<void>;
  activity(ctx: ActorContext, filter?: { action?: string }): Promise<ActivityLine[]>;
}

export interface OrganisationService {
  /** Display name and short name only; any actor of the client, staff included. */
  profile(ctx: ActorContext): Promise<{ displayName: string; shortName?: string }>;
  /** Whether staff may raise support tickets (M3 chunk 20a). Any actor of the client, staff included. */
  supportSettings(ctx: ActorContext): Promise<{ allowStaffTickets: boolean }>;
  updateProfile(
    ctx: ActorContext,
    patch: { displayName?: string; shortName?: string },
  ): Promise<{ displayName: string; shortName?: string }>;
  updateSettings(ctx: ActorContext, patch: SettingsPatch): Promise<Client['settings']>;
  sites: { update(ctx: ActorContext, siteId: Id, patch: { name?: string; region?: string }): Promise<Site> };
}

export interface OnboardingService {
  checklist(ctx: ActorContext): Promise<OnboardingView>;
  markDone(ctx: ActorContext, step: string): Promise<OnboardingView>;
}

export type PlanPreview = {
  direction: 'upgrade' | 'downgrade' | 'same';
  applies: 'now' | 'atRenewal';
  currentPrice: number;
  newPrice: number;
  newLimits: Record<string, unknown>;
  becomesReadOnly: { key: string; used: number; limit: number; overBy: number }[];
};

export type BillingOverview = {
  packageId: Id;
  /** Package band price per site for the active staff count, times active sites (assumption 41). Pence. */
  planPrice: { perSite: number; sites: number; total: number };
  /** What the organisation pays after any price change in force now (pence). Equals planPrice.total when none applies. */
  yourPrice: number;
  /** The separate discount or increase line, as codes the screen words from the language file. amount is signed pence. */
  adjustment?: {
    reason: PriceAdjustment['reason'];
    direction: 'discount' | 'increase';
    type: PriceAdjustment['type'];
    value: number;
    amount: number;
  };
  period: 'monthly' | 'annual';
  state: AccountState;
  renewalAt: string;
  pendingPackageId?: Id;
  billingContact: string;
  paymentMethod?: { brand: string; last4: string; expMonth: number; expYear: number };
  /** What the invoices are made out to. The profile itself only changes through a request. */
  profile?: { billingName: string; address: string; vatNumber?: string };
  /** How much of each limit is used now (the same counts the plan change preview uses). */
  usage: Record<string, number>;
};

/** Billing for client admins: `billing.view` to read, `billing.manage` to change (M3 assumptions 40, 41). */
export interface BillingService {
  overview(ctx: ActorContext): Promise<BillingOverview>;
  invoices(ctx: ActorContext): Promise<Invoice[]>;
  invoice(ctx: ActorContext, id: Id): Promise<Invoice>;
  /** Stores a pending request; the billing profile is not changed. */
  requestDetailsChange(
    ctx: ActorContext,
    proposed: { billingName?: string; address?: string; vatNumber?: string },
  ): Promise<BillingChangeRequest>;
  /** Needs the step-up code. */
  updateContact(ctx: ActorContext, email: string, code: string): Promise<void>;
  previewPlanChange(ctx: ActorContext, packageId: Id): Promise<PlanPreview>;
  /** The packages the organisation could move to (name only; prices come from the preview). Needs `billing.view`. */
  plans(ctx: ActorContext): Promise<{ id: Id; name: string }[]>;
  /** Needs the step-up code. An upgrade applies now, a downgrade at renewal. */
  changePlan(ctx: ActorContext, packageId: Id, code: string): Promise<void>;
  /** Mock payment: pays everything owed and returns the account to Active. */
  payNow(ctx: ActorContext): Promise<void>;
  /** Your organisation's scheduled or active price changes, with no other client's details. Needs `billing.view`. */
  priceNotices(ctx: ActorContext): Promise<PriceNotice[]>;
}

export type PriceNotice = {
  id: Id;
  type: PriceAdjustment['type'];
  scope: PriceAdjustment['scope'];
  value: number;
  effectiveAt: string;
  endAt?: string;
};

export type AddOnListing = {
  addOnId: Id;
  name: string;
  status: 'off' | 'on' | 'trial';
  startedAt?: string;
  endsAt?: string;
  usageCapPence?: number;
  usageThisPeriod: number;
  /** The catalogue price, so the screen can say what turning it on costs. */
  pricing: AddOn['pricing'];
};

/** The add-on catalogue (get, put) plus the billing-aware operations. `list` is per client and needs `billing.view`. */
export interface AddOnsService extends Omit<WriteRepo<AddOn>, 'list'> {
  list(ctx: ActorContext): Promise<AddOnListing[]>;
  turnOn(ctx: ActorContext, addOnId: Id, options?: { trial?: boolean }): Promise<AddOnSubscription>;
  /** Keeps it on until the renewal date. */
  turnOff(ctx: ActorContext, addOnId: Id): Promise<AddOnSubscription>;
  /** `null` removes the cap. */
  setCap(ctx: ActorContext, addOnId: Id, capPence: number | null): Promise<AddOnSubscription>;
}

export interface AddOnRequestsService {
  create(ctx: ActorContext, input: { addOnId: Id; note?: string }): Promise<AddOnRequest>;
  /** Your own requests, or every request for the organisation with `billing.manageAddOns`. */
  list(ctx: ActorContext): Promise<AddOnRequest[]>;
  decide(ctx: ActorContext, requestId: Id, decision: 'approved' | 'declined'): Promise<AddOnRequest>;
}

export type AccountStatus = {
  state: AccountState;
  since: string;
  nextChange?: { state: AccountState; at: string };
  whatWorks: { feature: string; availability: string; key: string }[];
  /** Amount due in pence. Only for actors with `billing.view`. */
  amountDuePence?: number;
};

export interface AccountService {
  status(ctx: ActorContext): Promise<AccountStatus>;
  /** Staff only: tells them to speak to a manager when the account needs attention. No payment wording. */
  staffNotice(ctx: ActorContext): Promise<{ needsAttention: true } | null>;
}

export interface AiService {
  /** Canned "simpler words" text from the lesson itself, labelled Demo AI. Counts one use. */
  explain(ctx: ActorContext, input: { moduleId: Id; lessonId: string }): Promise<{ label: string; text: string }>;
}

/** A Module without the fields the data layer owns. `siteId` makes an own module belong to one site. */
export type ModuleInput = Omit<Module, 'id' | 'owner' | 'status' | 'version' | 'updatedAt' | 'duplicatedFrom'> & {
  siteId?: Id;
};
/** A link added to a provider module: a web address or a learning document of the same client. */
export type LinkInput = { id: string; title: string; url: string } | { id: string; title: string; attachmentId: Id };
export type FileUpload = {
  purpose: 'certificate' | 'ticketScreenshot' | 'learningDocument';
  title: string;
  mime: string;
  data: Uint8Array;
  personId?: Id;
  siteId?: Id;
  alt?: string;
  redacted?: boolean;
};

/** The module builder (M3 assumptions 11 to 17). Every write is one batch and writes one audit event. */
export interface AuthoringService {
  /** A never-published own module (provider actors: a provider module): status draft, version 1. */
  create(ctx: ActorContext, input: ModuleInput): Promise<Module>;
  /** Never runs the publish checklist. A published module keeps its edits in a ModuleDraft. */
  saveDraft(ctx: ActorContext, moduleId: Id, input: ModuleInput): Promise<Module>;
  /** Refused with RuleError('checklistFailed') until the checklist passes. `reassign` asks earlier completers again. */
  publish(
    ctx: ActorContext,
    moduleId: Id,
    options: { reassign: boolean },
  ): Promise<{ module: Module; reassigned: Assignment[] }>;
  duplicate(ctx: ActorContext, moduleId: Id): Promise<Module>;
  archive(ctx: ActorContext, moduleId: Id): Promise<Module>;
  /** RuleError('hasCompletions') once anyone has completed the module. */
  remove(ctx: ActorContext, moduleId: Id): Promise<void>;
  exportJson(ctx: ActorContext, moduleId: Id): Promise<string>;
  /** Snapshots of earlier published versions, oldest first. */
  versions(ctx: ActorContext, moduleId: Id): Promise<ModuleVersion[]>;
  getVersion(ctx: ActorContext, moduleId: Id, version: number): Promise<Module>;
  /**
   * Provider only, content.write. Publishes the pending draft of a published provider module as the next version and
   * tells the chosen clients: a placement if they have none and a ModuleNotice each, in one batch.
   * RuleError('invalidPublish') for a bad client list, a blank summary or no pending draft.
   */
  publishToClients(
    ctx: ActorContext,
    moduleId: Id,
    input: { summary: string; clientIds: string[] },
  ): Promise<{ module: Module; notices: ModuleNotice[] }>;
  drafts: { get(ctx: ActorContext, moduleId: Id): Promise<ModuleDraft | null> };
}

export interface LinkOverlaysService {
  /** Upserts the one overlay for the target. The data layer fills publisher, kind, language and showFor. */
  save(
    ctx: ActorContext,
    input: { moduleId: Id; questionId?: string; lessonId?: string; links: LinkInput[] },
  ): Promise<ClientLinkOverlay>;
  remove(ctx: ActorContext, overlayId: Id): Promise<void>;
}

export type PersonInput = Pick<
  Person,
  'primarySiteId' | 'additionalSiteIds' | 'teamIds' | 'firstName' | 'lastName' | 'jobRoleIds' | 'startDate' | 'status'
>;
export type RuleInput = Omit<AutoAssignRule, 'id' | 'clientId'> & { id?: Id };
export type ReminderPolicy = ClientSettings['reminderPolicy'];
export type ChaseResult = {
  willSend: { personId: Id }[];
  skipped: { personId: Id; reason: string }[];
};

/** All need assign.manage and, to create or enable, `authoring` availability. */
export interface AutoAssignService {
  list(ctx: ActorContext): Promise<AutoAssignRule[]>;
  /** Upserts. RuleError('duplicateRule') when another rule has the same trigger, filters and action. */
  save(ctx: ActorContext, input: RuleInput): Promise<AutoAssignRule>;
  setEnabled(ctx: ActorContext, id: Id, enabled: boolean): Promise<AutoAssignRule>;
  remove(ctx: ActorContext, id: Id): Promise<void>;
  /** Who the rule would assign now (the domain previewRule on the stored data). */
  preview(ctx: ActorContext, id: Id): Promise<{ count: number; personIds: Id[] }>;
  /** Assignments that carry `source: { ruleId }`, oldest first. */
  history(ctx: ActorContext, id: Id): Promise<Assignment[]>;
}

export interface RemindersService {
  /** reminders.view and the `reminders` availability. Who is overdue and who has Evidence about to expire, in scope. Writes nothing. */
  digestPreview(ctx: ActorContext): Promise<{ overdue: { personId: Id }[]; expiring: { personId: Id }[] }>;
  /**
   * reminders.manage. One reminder per person with something to chase: a Notification for their staff user and,
   * except in Limited, an Outbox message. RuleError-free: people who cannot be reminded come back in `skipped`.
   * A person outside the actor's scope is ForbiddenError('outOfScope') and nothing is sent.
   */
  send(
    ctx: ActorContext,
    personIds: Id[],
  ): Promise<{ sent: Id[]; skipped: { personId: Id; reason: ManualSkipReason | 'noAccount' }[] }>;
  /** reminders.view */
  policy(ctx: ActorContext): Promise<ReminderPolicy>;
  /**
   * reminders.manage. `templates` (optional) replaces the client's `settings.reminderTemplates`: a message must be 1 to
   * 300 characters and use only {firstName}, {training} and {date}, else ValidationError and nothing is stored.
   */
  savePolicy(
    ctx: ActorContext,
    policy: ReminderPolicy,
    templates?: Client['settings']['reminderTemplates'],
  ): Promise<ReminderPolicy>;
  /** reminders.manage. Writes nothing. */
  chaseOverdue(ctx: ActorContext, options: { preview: true }): Promise<ChaseResult>;
}

export type EraseInput = { mode: 'anonymise' | 'deleteEverything'; confirmName: string; code: string };

export interface ThemesService {
  /** themes.view. This client's saved themes (no presets, no other client's). */
  list(ctx: ActorContext): Promise<Theme[]>;
  /** Any actor of the client. The domain activeTheme as at `ctx.now`. */
  active(ctx: ActorContext, side: 'staff' | 'admin'): Promise<Theme | null>;
  /** themes.manage and `themesEdit`. Upserts by id. RuleError('invalidTheme') on a contrast failure. */
  save(ctx: ActorContext, theme: Theme): Promise<Theme>;
  remove(ctx: ActorContext, id: Id): Promise<void>;
  /** Sets (or clears, with null) the base theme. */
  setBase(ctx: ActorContext, id: Id | null): Promise<Client['settings']>;
}

/** What an export holds. The app zips it. Never learner notes, display prefs, audit events or another client's records. */
export type ExportBundle = {
  exportedAt: string;
  people: Omit<Person, 'prefs'>[];
  evidence: Evidence[];
  evidenceSubmissions: EvidenceSubmission[];
  assignments: Assignment[];
  attempts: Attempt[];
  sites: Site[];
  teams: Team[];
  requirements: Requirement[];
  modules: Module[];
  rules: AutoAssignRule[];
  competitions: Competition[];
  formerlyNote: { old: string; changedAt: string } | null;
};

/** `code` is the step-up code. Needs reports.export and the `exports` availability. */
export interface ExportsService {
  clientData(ctx: ActorContext, code: string): Promise<ExportBundle>;
  person(ctx: ActorContext, personId: Id, code: string): Promise<ExportBundle>;
}

export type RetentionPolicy = Client['settings']['retention'];
export interface RetentionService {
  /** settings.view. Dates only: nothing is deleted in the demo. */
  schedule(ctx: ActorContext): Promise<ScheduledDeletion[]>;
  /** settings.manage. Merges the patch; a value outside the bounds is a ValidationError. */
  update(ctx: ActorContext, patch: Partial<RetentionPolicy>): Promise<RetentionPolicy>;
}

export type PricingDraftInput = {
  clientIds: string[];
  scope: PriceAdjustment['scope'];
  type: PriceAdjustment['type'];
  value: number;
  reason: PriceAdjustment['reason'];
  noticeDays?: number;
  endsAt?: string;
  note?: string;
};

/** Provider price changes (M4 BP-7). Provider side only; billing.draftPriceChanges to draft, billing.confirmPriceChanges plus the step-up code to confirm. */
export interface PricingService {
  draft(ctx: ActorContext, input: PricingDraftInput): Promise<PriceAdjustment>;
  submit(ctx: ActorContext, id: string): Promise<PriceAdjustment>;
  confirm(ctx: ActorContext, id: string, stepUpCode: string): Promise<PriceAdjustment>;
  cancel(ctx: ActorContext, id: string): Promise<PriceAdjustment>;
  list(ctx: ActorContext): Promise<PriceAdjustment[]>;
  /** Read-only: one row per selected client. Writes nothing. */
  preview(
    ctx: ActorContext,
    input: PricingDraftInput,
  ): Promise<{ rows: ReturnType<typeof previewAdjustment>['rows']; warnings: string[] }>;
  effectivePrice(
    ctx: ActorContext,
    clientId: string,
    listPrice: number,
    scope: PriceAdjustment['scope'],
  ): Promise<number>;
}

export type OwnershipRequestInput = {
  side: 'client' | 'provider';
  clientId?: string;
  toUserId: string;
  demoteFromTo: string;
};

/** Ownership transfer (M4 chunk 5). The owner of one side hands the owner role to another user there; the sides never cross. */
export interface OwnershipService {
  request(ctx: ActorContext, input: OwnershipRequestInput): Promise<OwnershipTransfer>;
  accept(ctx: ActorContext, id: string): Promise<OwnershipTransfer>;
  confirmWithCode(ctx: ActorContext, id: string, code: string): Promise<OwnershipTransfer>;
  complete(ctx: ActorContext, id: string): Promise<OwnershipTransfer>;
  cancel(ctx: ActorContext, id: string): Promise<OwnershipTransfer>;
  /** Only transfers the actor is part of, on their own side. */
  list(ctx: ActorContext): Promise<OwnershipTransfer[]>;
}

export type ProviderTeamMember = {
  userId: string;
  name: string;
  email: string;
  status: string;
  roleIds: string[];
  roleNames: string[];
};
export type ProviderRoleInput = { name: string; description: string; permissionIds: string[] };

/** Provider team and roles (M4 chunk 5b). Provider side only; Owner and Co-Owner roles need owner.manageOwnerRoles. */
export interface ProviderTeamService {
  list(ctx: ActorContext): Promise<ProviderTeamMember[]>;
  /** Always for all clients: a `clientIds` key is refused (per-client scoping of provider users is not built). */
  invite(ctx: ActorContext, input: { email: string; displayName: string; roleKey: string }): Promise<UserAccount>;
  setRole(ctx: ActorContext, userId: string, roleKey: string): Promise<void>;
  suspend(ctx: ActorContext, userId: string): Promise<void>;
  reactivate(ctx: ActorContext, userId: string): Promise<void>;
  createRole(ctx: ActorContext, input: ProviderRoleInput): Promise<Role>;
  updateRole(ctx: ActorContext, roleId: string, input: Partial<ProviderRoleInput>): Promise<Role>;
  deleteRole(ctx: ActorContext, roleId: string): Promise<void>;
}

export type ProviderTicketRow = { ticket: Ticket; responseDueAt?: string; breached: boolean };
export type ProviderTicketFilter = {
  status?: Ticket['status'];
  clientId?: string;
  assigneeId?: string;
  impact?: Ticket['impact'];
};

/** Provider ticket inbox (M4 chunk 7). Provider side only; reading needs tickets.read, changing needs tickets.write. */
export interface ProviderTicketsService {
  list(ctx: ActorContext, filter?: ProviderTicketFilter): Promise<ProviderTicketRow[]>;
  assign(ctx: ActorContext, id: string, assigneeId: string | null): Promise<Ticket>;
  /** A reply the customer sees; sets firstResponseAt the first time. */
  reply(ctx: ActorContext, id: string, input: { body: string }): Promise<TicketMessage>;
  /** An internal note: provider eyes only. */
  addNote(ctx: ActorContext, id: string, input: { body: string }): Promise<TicketMessage>;
  setStatus(ctx: ActorContext, id: string, status: Ticket['status']): Promise<Ticket>;
  /** Replies and internal notes. */
  messages(ctx: ActorContext, id: string): Promise<TicketMessage[]>;
  /** Display name of the person who raised the ticket. */
  raiserName(ctx: ActorContext, id: string): Promise<string>;
  /** The screenshots attached to the ticket's customer messages (tickets.read). Never other file types. */
  screenshots(ctx: ActorContext, id: string): Promise<ProviderTicketScreenshot[]>;
}

export type ProviderTicketScreenshot = {
  id: string;
  title: string;
  alt: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  data: Uint8Array;
};

export interface SavedRepliesService {
  list(ctx: ActorContext): Promise<SavedReply[]>;
  create(ctx: ActorContext, input: { title: string; body: string }): Promise<SavedReply>;
  /** The reply text with {{firstName}} replaced by the ticket raiser's first name. */
  insertText(ctx: ActorContext, replyId: string, ticketId: string): Promise<string>;
}

export type OtherEntryGroupRow = OtherEntryGroup & { clientCount: number; trending: boolean };

export interface OtherEntriesService {
  review(ctx: ActorContext, field: 'feature' | 'issueType'): Promise<OtherEntryGroupRow[]>;
  /** Re-tags only the chosen tickets, which must all belong to the group. */
  createIssueType(
    ctx: ActorContext,
    input: { groupId: string; name: string; ticketIds: string[] },
  ): Promise<{ issueTypeId: string; retagged: number; group: OtherEntryGroup }>;
}

export type CreateClientInput = {
  displayName: string;
  industryPackId: string;
  packageId: string;
  sites: { name: string; countryCode?: string; timezone?: string }[];
  billingContact: string;
  trialDays?: number;
  firstAdmin: { email: string; displayName: string; roleKey: 'accountOwner' };
};
export type CreateClientResult = {
  client: Client;
  sites: Site[];
  subscription: Subscription;
  placements: ModulePlacement[];
  checklist: OnboardingChecklist;
  invitation: Invitation;
};

/** Provider-only client management (M4 chunk 6a). */
export interface ProviderOpsService {
  /** Needs clients.write. RuleError('invalidClient') for a bad name, sites, pack, package or admin email. */
  createClient(ctx: ActorContext, input: CreateClientInput): Promise<CreateClientResult>;
}

/** One row of the provider client list (P2). Counts: all sites, and people with status 'active'. */
export type ProviderClientRow = {
  clientId: string;
  displayName: string;
  accountState: AccountState;
  packageId: string;
  siteCount: number;
  peopleCount: number;
  /** The latest seeded health score, where one exists. Simulated. */
  healthScore?: number;
};

/** The provider overview (P1). Counts are real records; `attention` comes from the simulated health scores. */
export type ProviderOverview = {
  simulated: true;
  clientCount: number;
  byAccountState: Partial<Record<AccountState, number>>;
  siteCount: number;
  peopleCount: number;
  /** Clients needing attention. A reason is plain English from the health score, or a code starting `accountState.`. */
  attention: { clientId: string; reasons: string[] }[];
};

/** Provider overview and client list (M4 chunk 8c). Provider side only, needs clients.read. */
export interface ProviderOverviewService {
  overview(ctx: ActorContext): Promise<ProviderOverview>;
  clients(ctx: ActorContext, filter?: { accountState?: AccountState }): Promise<ProviderClientRow[]>;
}

/** One client in the provider dunning view (M4 chunk 12a). */
export type DunningRow = {
  clientId: Id;
  clientName: string;
  state: AccountState;
  amountOutstandingPence: number;
  nextState?: { state: AccountState; at: string };
  daysToNextState?: number;
  daysToDeletion?: number;
  /** True while the provider has paused this client's timeline. */
  paused?: boolean;
};
export type DunningOverview = { rows: DunningRow[]; recoveryRatePercent: number | null; outstandingPence: number };

/** Provider dunning (M4 chunk 12a). overview needs billing.read; the two changes need billing.manageDunning. */
export interface DunningService {
  overview(ctx: ActorContext): Promise<DunningOverview>;
  /** Pushes the next state change back by `days` (1 to 30). Only while the account is Past due or Limited. */
  extendGrace(ctx: ActorContext, clientId: Id, days: number): Promise<void>;
  setPaused(ctx: ActorContext, clientId: Id, paused: boolean): Promise<void>;
}

/** Telemetry (M4 chunk 8c). Local records are real and stay on this device; the rest is seeded and simulated. */
export interface TelemetryService {
  /** No actor: an error handler has none. The time comes from the injected Clock. */
  recordLocalEvent(input: { name: string }): Promise<LocalTelemetryEntry>;
  recordLocalError(input: { name: string; message: string }): Promise<LocalTelemetryEntry>;
  /** Provider only (clients.read). Newest first. */
  listLocal(ctx: ActorContext): Promise<LocalTelemetryEntry[]>;
  /** Provider only (clients.read). Seeded usage, error groups and latest health score of one client. */
  simulated(
    ctx: ActorContext,
    clientId: string,
  ): Promise<{
    simulated: true;
    clientId: string;
    usageDaily: UsageDaily[];
    errorGroups: ErrorGroup[];
    healthScore: HealthScore | undefined;
  }>;
}

/** Provider announcements (M4 chunk 8a). Listing and creating need comms.send; banners are for any client or staff actor. */
export interface ProviderCommsService {
  listAnnouncements(ctx: ActorContext): Promise<Announcement[]>;
  createAnnouncement(
    ctx: ActorContext,
    input: {
      title: string;
      body: string;
      audience: Announcement['audience'];
      channels: Announcement['channels'];
      publishAt: string;
      expiresAt?: string;
    },
  ): Promise<Announcement>;
  /** Live banner announcements for the actor's own client, package, pack and side. */
  banners(ctx: ActorContext): Promise<Announcement[]>;
}

/** Release notes (M4 chunk 14b). Readable by any provider actor, newest first. */
export interface ReleaseNotesService {
  list(ctx: ActorContext): Promise<ReleaseNote[]>;
}

/** Maintenance flags per app. Setting needs ops.write; reading is open to every actor. */
export interface MaintenanceService {
  set(ctx: ActorContext, input: { app: MaintenanceApp; on: boolean }): Promise<Record<MaintenanceApp, boolean>>;
  flags(ctx: ActorContext): Promise<Record<MaintenanceApp, boolean>>;
}

/** The simulated Learn more link check (no network request). Needs content.write to run. */
export interface LinkCheckService {
  run(ctx: ActorContext): Promise<{ checkedAt: string; results: LinkCheckResult[]; broken: LinkCheckResult[] }>;
  last(ctx: ActorContext): Promise<LinkCheckResult[]>;
}

/** Learn more open counts per link, with no learner identity. Needs content.write. */
export interface LearnMoreService {
  counts(ctx: ActorContext): Promise<{ linkId: string; opens: number }[]>;
}

/** Account recovery (M4 chunk 8b). Provider side only: list, request and reject need recovery.start; approve and complete need recovery.approve. */
export interface RecoveryService {
  list(ctx: ActorContext): Promise<RecoveryRequest[]>;
  request(
    ctx: ActorContext,
    input: { clientId: string; subjectUserId: string; reason: string; outcome?: 'reset2fa' | 'transferOwner' },
  ): Promise<RecoveryRequest>;
  approve(ctx: ActorContext, id: string): Promise<RecoveryRequest>;
  /** `outcome`, when given, is the outcome chosen at completion; otherwise the one on the request is used. */
  complete(ctx: ActorContext, id: string, outcome?: 'reset2fa' | 'transferOwner'): Promise<RecoveryRequest>;
  reject(ctx: ActorContext, id: string): Promise<RecoveryRequest>;
}

/** Organisation name changes waiting for review. Needs clients.reviewNameChanges (revert needs clients.revertDisplayName). */
export interface ProfileChangesService {
  list(ctx: ActorContext): Promise<(ProfileChangeRequest & { billingName: string })[]>;
  keepBillingName(ctx: ActorContext, id: string): Promise<ProfileChangeRequest>;
  updateBillingName(ctx: ActorContext, id: string): Promise<ProfileChangeRequest>;
  askClient(ctx: ActorContext, id: string): Promise<ProfileChangeRequest>;
  revertDisplayName(ctx: ActorContext, id: string): Promise<ProfileChangeRequest>;
}

/** Client billing detail change requests, decided by the provider. Needs clients.editBilling. */
export interface BillingChangesService {
  list(ctx: ActorContext): Promise<BillingChangeRequest[]>;
  approve(ctx: ActorContext, id: string): Promise<BillingChangeRequest>;
  editThenApprove(
    ctx: ActorContext,
    id: string,
    proposed: BillingChangeRequest['proposed'],
  ): Promise<BillingChangeRequest>;
  decline(ctx: ActorContext, id: string, reason: string): Promise<BillingChangeRequest>;
}

/** Provider incident notices (M4 chunk 14a). list, post and update need incidents.post; current is open to any signed-in actor. */
export interface IncidentsService {
  list(ctx: ActorContext): Promise<Incident[]>;
  post(
    ctx: ActorContext,
    input: { level: Incident['level']; title: string; message: string; status?: Incident['updates'][number]['status'] },
  ): Promise<Incident>;
  update(
    ctx: ActorContext,
    id: string,
    input: { status: Incident['updates'][number]['status']; message: string },
  ): Promise<Incident>;
  current(ctx: ActorContext): Promise<{ level: Incident['level']; title?: string; message?: string }>;
}

/** The data request log (M4 chunk 14a). Provider side only; needs dataRequests.manage. */
export interface DataRequestsService {
  list(ctx: ActorContext): Promise<(DataRequest & { dueInDays: number })[]>;
  create(
    ctx: ActorContext,
    input: { kind: DataRequest['kind']; requester: string; clientId?: string; notes: string; receivedAt?: string },
  ): Promise<DataRequest>;
  complete(ctx: ActorContext, id: string, input: { evidence: string }): Promise<DataRequest>;
  reject(ctx: ActorContext, id: string, input: { notes: string }): Promise<DataRequest>;
}

/** Provider global content (M4 chunk 16). content.read to look, content.write to change the prize suggestion list. */
export interface GlobalContentService {
  get(ctx: ActorContext): Promise<{ prizeSuggestions: string[] }>;
  /** Trims; blank or over 120 characters is a ValidationError; a repeat is RuleError 'duplicate'. */
  addPrizeSuggestion(ctx: ActorContext, text: string): Promise<{ prizeSuggestions: string[] }>;
  /** A text not in the list is NotFoundError. */
  removePrizeSuggestion(ctx: ActorContext, text: string): Promise<{ prizeSuggestions: string[] }>;
}

export type AiSettingsRow = {
  clientId: Id;
  clientName: string;
  status: 'off' | 'on' | 'trial';
  usageThisPeriod: number;
  includedUnits: number;
  killSwitch: boolean;
};

/** Provider AI add-on settings (M4 chunk 16). ai.manage. While a client's kill switch is on, its AI is unavailable. */
export interface AiSettingsService {
  overview(ctx: ActorContext): Promise<AiSettingsRow[]>;
  setKillSwitch(ctx: ActorContext, clientId: Id, on: boolean): Promise<AiSettingsRow>;
}

export interface DataStore {
  globalContent: GlobalContentService;
  aiSettings: AiSettingsService;
  recovery: RecoveryService;
  profileChanges: ProfileChangesService;
  billingChanges: BillingChangesService;
  providerComms: ProviderCommsService;
  releaseNotes: ReleaseNotesService;
  incidents: IncidentsService;
  dataRequests: DataRequestsService;
  maintenance: MaintenanceService;
  linkCheck: LinkCheckService;
  learnMore: LearnMoreService;
  providerOps: ProviderOpsService;
  providerOverview: ProviderOverviewService;
  dunning: DunningService;
  telemetry: TelemetryService;
  providerTeam: ProviderTeamService;
  providerTickets: ProviderTicketsService;
  savedReplies: SavedRepliesService;
  otherEntries: OtherEntriesService;
  pricing: PricingService;
  ownership: OwnershipService;
  clients: WriteRepo<Client>;
  sites: RemovableRepo<Site>;
  teams: RemovableRepo<Team>;
  people: RemovableRepo<Person> & {
    /** Needs staff.manage in scope. Runs the `personAdded` auto-assign rules in the same batch. */
    add(ctx: ActorContext, input: PersonInput): Promise<Person>;
    /** Runs the `roleChanged` rules in the same batch when `jobRoleIds` changes. */
    update(ctx: ActorContext, id: Id, patch: Partial<PersonInput> & { pausedUntil?: string }): Promise<Person>;
    /**
     * staff.delete in scope and the step-up code. Leaves a shell named "Former staff member"; the nickname, prefs,
     * notes and user account go. `deleteEverything` also removes Evidence, attempts, events and submissions.
     */
    erase(ctx: ActorContext, id: Id, input: EraseInput): Promise<void>;
  };
  autoAssign: AutoAssignService;
  reminders: RemindersService;
  users: RemovableRepo<UserAccount>;
  jobRoles: RemovableRepo<JobRole>;
  requirements: RemovableRepo<Requirement>;
  evidence: WriteRepo<Evidence>;
  evidenceSubmissions: WriteRepo<EvidenceSubmission>;
  roles: RemovableRepo<Role>;
  roleAssignments: RemovableRepo<RoleAssignment>;
  packages: WriteRepo<Package>;
  addOns: AddOnsService;
  billing: BillingService;
  addOnRequests: AddOnRequestsService;
  account: AccountService;
  ai: AiService;
  /** Keyed by clientId. */
  subscriptions: WriteRepo<Subscription>;
  /** Keyed by `${clientId}:${addOnId}`. */
  addOnSubscriptions: WriteRepo<AddOnSubscription>;
  paymentAttempts: WriteRepo<PaymentAttempt>;
  audit: ReadRepo<AuditEvent> & AppendRepo<AuditEvent>;
  /** Write-only for actors. The demo outbox is read through DemoAdmin. */
  outbox: AppendRepo<OutboxMessage>;
  /** The learning stores below are read-only for actors; writes go through the operations. */
  modules: ReadRepo<Module>;
  attachments: ReadRepo<Attachment> & {
    /** Checks the type by its first bytes, the size (10 MB a file, 50 MB in all) and image metadata. */
    upload(ctx: ActorContext, input: FileUpload): Promise<FileAttachment>;
    /** The owner, or an approver, may remove a file nobody has submitted yet. */
    remove(ctx: ActorContext, id: Id): Promise<void>;
  };
  authoring: AuthoringService;
  linkOverlays: LinkOverlaysService;
  clientLinkOverlays: ReadRepo<ClientLinkOverlay>;
  assignments: ReadRepo<Assignment> & {
    /** All or nothing. People who already have an open assignment for the module are skipped and reported. */
    assign(
      ctx: ActorContext,
      input: { moduleId: Id; personIds: Id[]; dueAt: string },
    ): Promise<{ created: Assignment[]; skipped: { personId: Id; reason: 'alreadyAssigned' }[] }>;
    /** One batch: one module assignment per person and group module; open duplicates are skipped and reported. */
    assignGroup(
      ctx: ActorContext,
      input: { groupId: Id; personIds: Id[]; dueAt: string },
    ): Promise<{ created: Assignment[]; skipped: { personId: Id; reason: 'alreadyAssigned' }[] }>;
  };
  learningEvents: ReadRepo<LearningEvent>;
  attempts: ReadRepo<Attempt>;
  notifications: ReadRepo<Notification> & {
    markRead(ctx: ActorContext, ids: Id[]): Promise<void>;
    /** The owner only: hides it until 08:00 London time on the next London day. `list` leaves snoozed items out. */
    snooze(ctx: ActorContext, id: Id): Promise<Notification>;
  };
  learning: LearningService;
  notes: NotesService;
  me: MeService;
  access: AccessService;
  categories: CategoriesService;
  moduleGroups: ModuleGroupsService;
  modulePlacements: ModulePlacementsService;
  competitions: CompetitionsService;
  leaderboards: LeaderboardsService;
  themes: ThemesService;
  exports: ExportsService;
  retention: RetentionService;
  twoFactor: TwoFactorService;
  team: TeamService;
  organisation: OrganisationService;
  onboarding: OnboardingService;
  evidenceFlow: EvidenceFlowService;
  moduleFeedback: ModuleFeedbackService;
  appFeedback: AppFeedbackService;
  tickets: TicketsService;
  faqs: FaqsService;
}

export type EvidenceSubmitInput = {
  requirementId: Id;
  personId?: Id;
  providerName: string;
  completedAt: string;
  expiresAt?: string;
  certificateRef?: string;
  fileAttachmentId: Id;
};
export type EvidenceResubmitInput = Omit<EvidenceSubmitInput, 'requirementId' | 'personId'>;
export type EvidenceReviewInput = ReviewDecision extends infer D
  ? D extends { reviewerId: string }
    ? Omit<D, 'reviewerId'>
    : never
  : never;

/** External evidence (M3 assumption 22). Decisions are the only way a submission becomes Evidence. */
export interface EvidenceFlowService {
  submit(ctx: ActorContext, input: EvidenceSubmitInput): Promise<EvidenceSubmission>;
  /** The person or their uploader; from Needs a better copy or Rejected back to Awaiting check on the same record. */
  resubmit(ctx: ActorContext, id: Id, input: EvidenceResubmitInput): Promise<EvidenceSubmission>;
  withdraw(ctx: ActorContext, id: Id): Promise<EvidenceSubmission>;
  /** Submissions awaiting a check in the admin's read scope, oldest first. */
  queue(ctx: ActorContext, filter?: { siteId?: Id; requirementId?: Id }): Promise<EvidenceSubmission[]>;
  get(ctx: ActorContext, id: Id): Promise<EvidenceSubmission>;
  review(ctx: ActorContext, id: Id, decision: EvidenceReviewInput): Promise<EvidenceSubmission>;
}

export type ModuleFeedbackInput = {
  moduleId: Id;
  kind: ModuleFeedback['kind'];
  lessonId?: string;
  questionId?: string;
  rating?: number;
  thumb?: 'up' | 'down';
  tags: string[];
  text?: string;
  anonymous: boolean;
};
/** Module feedback (M3 assumption 18). Anonymous items never carry a person or user id. */
export interface ModuleFeedbackService {
  submit(ctx: ActorContext, input: ModuleFeedbackInput): Promise<ModuleFeedback>;
  list(
    ctx: ActorContext,
    filter?: { moduleId?: Id; status?: ModuleFeedback['status']; kind?: ModuleFeedback['kind'] },
  ): Promise<ModuleFeedback[]>;
  get(ctx: ActorContext, id: Id): Promise<ModuleFeedback>;
  reply(ctx: ActorContext, id: Id, text: string): Promise<ModuleFeedback>;
  setStatus(ctx: ActorContext, id: Id, status: ModuleFeedback['status']): Promise<ModuleFeedback>;
  escalate(ctx: ActorContext, id: Id, note: string): Promise<ModuleFeedback>;
  /** Provider only (`feedback.read`): no people, sites or replies, and counts only for client-own modules. */
  providerView(ctx: ActorContext): Promise<ProviderFeedbackProjection>;
}

/** App feedback is written by staff and admins and readable only by the provider. */
export interface AppFeedbackService {
  submit(
    ctx: ActorContext,
    input: { kind: AppFeedback['kind']; rating?: number; text: string; context: Record<string, string> },
  ): Promise<AppFeedback>;
  providerList(ctx: ActorContext, filter?: { status?: AppFeedback['status'] }): Promise<AppFeedback[]>;
}

export type TicketRaiseInput = {
  title: string;
  description: string;
  impact: Ticket['impact'];
  featureId?: string;
  featureOtherText?: string;
  issueTypeId?: string;
  issueTypeOtherText?: string;
  sharedWithManager?: boolean;
  /** Stored exactly as given: the app removes what the person took off. */
  context: Record<string, string>;
  attachmentIds?: Id[];
};
/** Customer-side tickets (M3 assumption 24). Provider replies and status changes arrive in M4. */
export interface TicketsService {
  raise(ctx: ActorContext, input: TicketRaiseInput): Promise<Ticket>;
  /** Own tickets, or with `organisation` (support.viewOrgTickets) admin tickets and staff tickets shared with the manager. */
  list(ctx: ActorContext, filter?: { organisation?: boolean }): Promise<Ticket[]>;
  get(ctx: ActorContext, id: Id): Promise<Ticket>;
  /** Oldest first, without internal provider notes. */
  messages(ctx: ActorContext, id: Id): Promise<TicketMessage[]>;
  reply(ctx: ActorContext, id: Id, input: { body: string; attachmentIds?: Id[] }): Promise<TicketMessage>;
  resolve(ctx: ActorContext, id: Id): Promise<Ticket>;
  reopen(ctx: ActorContext, id: Id): Promise<Ticket>;
  rate(ctx: ActorContext, id: Id, rating: 'up' | 'down'): Promise<Ticket>;
}

export interface FaqsService {
  /** One vote per user and FAQ: a second vote replaces the first. */
  vote(ctx: ActorContext, faqId: string, helpful: boolean): Promise<FaqVote>;
  myVotes(ctx: ActorContext): Promise<FaqVote[]>;
}

/** For the seed, the demo shell and tests. Never reachable through an ActorContext. */
export interface DemoAdmin {
  clearAll(): Promise<void>;
  /** Validates every record first and writes nothing if any is invalid. */
  bulkPut(store: StoreName, records: readonly unknown[]): Promise<void>;
  dumpAll(): Promise<Record<StoreName, unknown[]>>;
  getDemoState(): Promise<DemoState | undefined>;
  setDemoState(state: DemoState): Promise<void>;
  /** The demo-wide packaging option; 'A' when none is stored. */
  getPackagingOption(): Promise<'A' | 'B'>;
  setPackagingOption(option: 'A' | 'B'): Promise<void>;
  getSeedMeta(): Promise<SeedMeta | undefined>;
  setSeedMeta(meta: SeedMeta): Promise<void>;
  listOutbox(): Promise<OutboxMessage[]>;
  /**
   * The server-cron stand-in (M3 assumption 27): runs requirementExpiring rules and reminders for every client as at
   * `now` (ISO), idempotently. Writes only assignments and notices from rules, notifications, outbox and reminderLog.
   */
  runJobs(now: string): Promise<void>;
  /** Active staff users of one client, sorted by display name. For the demo shell's user switch. */
  listStaffUsers(clientId: Id): Promise<{ userId: Id; displayName: string; personId: Id }[]>;
  /** Active client admins and staff users of every client, for the presenter panel's "Jump to persona". */
  listPersonas(): Promise<PersonaListing[]>;
  /**
   * Demo presenter control: a payment fails now. The account goes Past due from `now`, with a hard decline, an
   * overdue invoice and an email in the Outbox. Throws NotFoundError for an unknown client.
   */
  simulateFailedPayment(clientId: Id, now: string): Promise<void>;
}

export type PersonaListing = {
  userId: Id;
  displayName: string;
  side: 'client' | 'staff';
  clientId: Id;
  clientName: string;
};

/** Called after every successful write with the names of the stores written. Never carries data. */
export type ChangeListener = (stores: StoreName[]) => void;

export type StoreHandle = {
  store: DataStore;
  admin: DemoAdmin;
  /** Returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void;
};

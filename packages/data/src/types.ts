// Public types of the data layer (build pack 4.3). The UI talks to a DataStore and nothing else.
import type {
  AccountState,
  AddOn,
  AddOnSubscription,
  EffectiveEntitlements,
  Assignment,
  Attachment,
  Attempt,
  AuditEvent,
  FileAttachment,
  ModuleDraft,
  ModuleVersion,
  BoardId,
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
  Scope,
  TwoFactorStatus,
  AddOnRequest,
  BillingChangeRequest,
  Invoice,
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
  | 'invalidName'
  | 'staffTicketsOff'
  | 'duplicateRule';

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
  updatePrefs(ctx: ActorContext, patch: Partial<LearnerPrefs>): Promise<MeRecord>;
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

export interface LeaderboardsService {
  standing(ctx: ActorContext, input: { board: BoardId; period: BoardPeriodId; siteId?: Id }): Promise<BoardView>;
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
  period: 'monthly' | 'annual';
  state: AccountState;
  renewalAt: string;
  pendingPackageId?: Id;
  billingContact: string;
  paymentMethod?: { brand: string; last4: string; expMonth: number; expYear: number };
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
  /** Needs the step-up code. An upgrade applies now, a downgrade at renewal. */
  changePlan(ctx: ActorContext, packageId: Id, code: string): Promise<void>;
  /** Mock payment: pays everything owed and returns the account to Active. */
  payNow(ctx: ActorContext): Promise<void>;
}

export type AddOnListing = {
  addOnId: Id;
  name: string;
  status: 'off' | 'on' | 'trial';
  startedAt?: string;
  endsAt?: string;
  usageCapPence?: number;
  usageThisPeriod: number;
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

export interface DataStore {
  clients: WriteRepo<Client>;
  sites: RemovableRepo<Site>;
  teams: RemovableRepo<Team>;
  people: RemovableRepo<Person>;
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
  notifications: ReadRepo<Notification> & { markRead(ctx: ActorContext, ids: Id[]): Promise<void> };
  learning: LearningService;
  notes: NotesService;
  me: MeService;
  access: AccessService;
  categories: CategoriesService;
  moduleGroups: ModuleGroupsService;
  modulePlacements: ModulePlacementsService;
  competitions: CompetitionsService;
  leaderboards: LeaderboardsService;
  twoFactor: TwoFactorService;
  team: TeamService;
  organisation: OrganisationService;
  onboarding: OnboardingService;
}

/** For the seed, the demo shell and tests. Never reachable through an ActorContext. */
export interface DemoAdmin {
  clearAll(): Promise<void>;
  /** Validates every record first and writes nothing if any is invalid. */
  bulkPut(store: StoreName, records: readonly unknown[]): Promise<void>;
  dumpAll(): Promise<Record<StoreName, unknown[]>>;
  getDemoState(): Promise<DemoState | undefined>;
  setDemoState(state: DemoState): Promise<void>;
  getSeedMeta(): Promise<SeedMeta | undefined>;
  setSeedMeta(meta: SeedMeta): Promise<void>;
  listOutbox(): Promise<OutboxMessage[]>;
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

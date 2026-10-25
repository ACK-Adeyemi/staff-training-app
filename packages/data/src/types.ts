// Public types of the data layer (build pack 4.3). The UI talks to a DataStore and nothing else.
import type {
  AccountState,
  AddOn,
  AddOnSubscription,
  Assignment,
  Attachment,
  Attempt,
  AuditEvent,
  Client,
  ClientLinkOverlay,
  Clock,
  DemoState,
  Evidence,
  EvidenceSubmission,
  JobRole,
  LearningEvent,
  Module,
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
  Subscription,
  Team,
  UserAccount,
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
  | 'outOfScope';

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
  | 'invalidPeople';

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
  startAttempt(ctx: ActorContext, moduleId: Id): Promise<Attempt>;
  answer(
    ctx: ActorContext,
    input: { attemptId: Id; questionId: string; optionId?: string; choiceIds?: string[] },
  ): Promise<{ correct: boolean; outcome?: 'best' | 'ok' | 'poor' }>;
  finishAttempt(ctx: ActorContext, attemptId: Id): Promise<FinishResult>;
  learnMoreOpened(
    ctx: ActorContext,
    input: { moduleId: Id; questionId?: string; lessonId?: string; linkId: string; attemptId?: Id },
  ): Promise<LearningEvent>;
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
  addOns: WriteRepo<AddOn>;
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
  attachments: ReadRepo<Attachment>;
  clientLinkOverlays: ReadRepo<ClientLinkOverlay>;
  assignments: ReadRepo<Assignment> & {
    /** All or nothing. People who already have an open assignment for the module are skipped and reported. */
    assign(
      ctx: ActorContext,
      input: { moduleId: Id; personIds: Id[]; dueAt: string },
    ): Promise<{ created: Assignment[]; skipped: { personId: Id; reason: 'alreadyAssigned' }[] }>;
  };
  learningEvents: ReadRepo<LearningEvent>;
  attempts: ReadRepo<Attempt>;
  notifications: ReadRepo<Notification> & { markRead(ctx: ActorContext, ids: Id[]): Promise<void> };
  learning: LearningService;
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
}

/** Called after every successful write with the names of the stores written. Never carries data. */
export type ChangeListener = (stores: StoreName[]) => void;

export type StoreHandle = {
  store: DataStore;
  admin: DemoAdmin;
  /** Returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void;
};

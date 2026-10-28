// Operations for the module builder, link overlays, files and group assignment (M3 chunk 8, "Data C"). Each write
// authorises, applies the domain rules and then writes in ONE batch, with one slim audit event (ids and counts only).
// Business rules live in @sta/domain (authoring/*, files.ts); this file only calls them.
import {
  addDays,
  canDeleteModule,
  checkLimit,
  duplicateModule,
  hasImageMetadata,
  isDueInPast,
  isSafeHttpsUrl,
  localKeySchema,
  londonDateString,
  planAssignment,
  publishChecklist,
  publishVersion,
  reassignTargets,
  sniffMime,
  type Assignment,
  type Attempt,
  type Client,
  type ClientLinkOverlay,
  type Evidence,
  type EvidenceSubmission,
  type FileAttachment,
  type LearnMoreLink,
  type LearningEvent,
  type Module,
  type ModuleDraft,
  type ModuleGroup,
  type ModulePlacement,
  type ModuleVersion,
  type Notification,
  type OnboardingChecklist,
  type Person,
  type Requirement,
  type Ticket,
  type TicketMessage,
  type UserAccount,
  type Attachment,
} from '@sta/domain';
import { validate, type RawBackend, type WriteOp } from './backend';
import { tickOnboarding } from './identityOps';
import { moduleFor, put } from './ops';
import {
  audit,
  beginCall,
  canAny,
  canReadRecord,
  canReadStore,
  checkAccountState,
  clientEntitlements,
  forbid,
  holds,
  type Call,
} from './policy';
import {
  NotEntitledError,
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type AuthoringService,
  type DataStore,
  type FileUpload,
  type LinkInput,
  type LinkOverlaysService,
  type ModuleInput,
  type StoreOptions,
} from './types';

export type AuthoringOperations = {
  authoring: AuthoringService;
  linkOverlays: LinkOverlaysService;
  attachments: Pick<DataStore['attachments'], 'get' | 'list' | 'upload' | 'remove'>;
  assignGroup: DataStore['assignments']['assignGroup'];
};

const MAX_PEOPLE_PER_ASSIGN = 500;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_STORE_BYTES = 50 * 1024 * 1024;
const MAX_LINKS_PER_TARGET = 10;
const LINK_TITLE_MAX = 120;
const REASSIGN_DAYS = 30;
/** Who may upload on someone's behalf: the same two permissions the submission policy accepts. */
const FOR_OTHERS = ['evidence.uploadForOthers', 'evidence.approve'];
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
/** Fields the data layer owns: whatever the caller sends for them is ignored. */
const OWNED_FIELDS = ['id', 'owner', 'status', 'version', 'updatedAt', 'duplicatedFrom', 'siteId'] as const;

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isFile = (a: Attachment): a is FileAttachment => a.kind === 'file';

/** Assumption 20: who can read a stored attachment. Everything else is NotFound. */
export function canSeeAttachment(call: Call, a: Attachment, shared?: ReadonlySet<string>): boolean {
  if (call.side === 'provider' || a.clientId !== call.clientId) return false;
  if (!isFile(a) || a.purpose === 'learningDocument') return true;
  if (a.purpose === 'ticketScreenshot') return a.ownerUserId === call.actor.user.id || shared?.has(a.id) === true;
  const own = call.actor.user.personId;
  if (a.ownerUserId === call.actor.user.id || (own !== undefined && a.personId === own)) return true;
  return (
    call.side === 'client' &&
    canAny(call, ['evidence.view'], { clientId: a.clientId, ...(a.siteId ? { siteIds: [a.siteId] } : {}) }, 'read')
  );
}

/** Screenshots on admin tickets and on staff tickets shared with the manager, for people who may read those tickets. */
async function sharedScreenshotIds(call: Call): Promise<Set<string>> {
  if (call.side !== 'client' || !holds(call, ['support.viewOrgTickets'])) return new Set();
  const readable = new Set(
    (await call.all<Ticket>('tickets'))
      .filter(
        (t) =>
          t.clientId === call.clientId &&
          (t.raiserSide === 'client' || t.sharedWithManager) &&
          canAny(
            call,
            ['support.viewOrgTickets'],
            { clientId: t.clientId, ...(t.siteId !== undefined ? { siteIds: [t.siteId] } : {}) },
            'read',
          ),
      )
      .map((t) => t.id),
  );
  return new Set(
    (await call.all<TicketMessage>('ticketMessages'))
      .filter((m) => readable.has(m.ticketId))
      .flatMap((m) => m.attachmentIds),
  );
}

export function createAuthoringOperations(backend: RawBackend, options: StoreOptions): AuthoringOperations {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);
  const del = (store: WriteOp['store'], key: string): WriteOp => ({ type: 'delete', store, key });

  // ------------------------------------------------------------ shared helpers

  /** A client actor with modules.manage, or a provider actor with the given permission. Staff are always refused. */
  async function authorCall(ctx: ActorContext, providerPermission: string): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side === 'staff') return forbid('permission');
    if (call.side === 'client' ? !holds(call, ['modules.manage']) : !holds(call, [providerPermission])) {
      return forbid('permission');
    }
    return call;
  }

  /** The module the author may change: an own module (client) or a provider module (provider). */
  async function writableModule(call: Call, moduleId: string): Promise<Module> {
    const m = await call.find<Module>('modules', moduleId);
    if (!m) throw new NotFoundError();
    if (call.side === 'provider') {
      if (m.owner !== 'provider') throw new NotFoundError();
      return m;
    }
    if (m.owner === 'provider') {
      // A client may see published provider modules only; those it can see are read-only for it.
      if (m.status !== 'published') throw new NotFoundError();
      throw new RuleError('providerModuleReadOnly');
    }
    if (m.owner.clientId !== call.clientId) throw new NotFoundError();
    const target = { clientId: m.owner.clientId, ...(m.owner.siteId ? { siteIds: [m.owner.siteId] } : {}) };
    if (!canAny(call, ['modules.manage'], target, 'write')) return forbid('permission');
    return m;
  }

  /** A module the actor may read, with the same rules as modules.get. Providers see provider modules only. */
  async function readableModule(call: Call, moduleId: string): Promise<Module> {
    const m = await call.find<Module>('modules', moduleId);
    if (!m || !(await canReadStore(call, 'modules')) || !(await canReadRecord(call, 'modules', m))) {
      throw new NotFoundError();
    }
    if (call.side === 'provider' && m.owner !== 'provider') throw new NotFoundError();
    return m;
  }

  /** Writing modules needs the authoring state of the account (client actors only). */
  const authoringState = (call: Call): void => {
    if (call.side === 'client') checkAccountState(call, true);
  };

  async function ownModuleLimit(call: Call, clientId: string): Promise<void> {
    const ents = await clientEntitlements(call, clientId);
    if (!ents) throw new NotEntitledError('ownModules');
    const used = (await call.all<Module>('modules')).filter(
      (m) => m.owner !== 'provider' && m.owner.clientId === clientId && m.status !== 'archived',
    ).length;
    if (!checkLimit(ents, { ownModules: used }, 'ownModules').allowed) throw new NotEntitledError('ownModules');
  }

  /** The editable content of an input. Anything the data layer owns is dropped. */
  function contentOf(input: ModuleInput): Omit<Module, (typeof OWNED_FIELDS)[number]> {
    const owned: readonly string[] = OWNED_FIELDS;
    return Object.fromEntries(Object.entries(input).filter(([key]) => !owned.includes(key))) as unknown as Omit<
      Module,
      (typeof OWNED_FIELDS)[number]
    >;
  }

  const documentIds = async (call: Call, clientId: string): Promise<Set<string>> =>
    new Set(
      (await call.all<Attachment>('attachments'))
        .filter((a) => isFile(a) && a.clientId === clientId && a.purpose === 'learningDocument')
        .map((a) => a.id),
    );

  /** Every link in a module must be an https address (no login) or a PDF learning document of the same client. */
  async function checkModuleLinks(call: Call, content: Record<string, unknown>, clientId?: string): Promise<void> {
    const lists = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
    const links = [
      ...lists(content['questions']).flatMap((q) => lists((q as { learnMore?: unknown }).learnMore)),
      ...lists(content['lessons']).flatMap((l) => lists((l as { furtherReading?: unknown }).furtherReading)),
    ] as { url?: unknown; attachmentId?: unknown }[];
    for (const link of links) {
      if (typeof link.url === 'string' && !isSafeHttpsUrl(link.url)) throw new RuleError('notHttps');
    }
    const wanted = links.filter((l) => l.attachmentId !== undefined);
    if (wanted.length === 0) return;
    const docs = clientId ? await documentIds(call, clientId) : new Set<string>();
    for (const link of wanted) {
      if (typeof link.attachmentId !== 'string' || !docs.has(link.attachmentId)) {
        throw new ValidationError(['links: a document link must point at a PDF learning document of yours']);
      }
    }
  }

  const clientIdOf = (m: Module): string | undefined => (m.owner === 'provider' ? undefined : m.owner.clientId);

  /** A new open assignment and, for a staff user, the matching notification. */
  function assignmentOps(
    call: Call,
    clientId: string,
    module: Module,
    personIds: string[],
    dueAt: string,
    users: UserAccount[],
  ): { created: Assignment[]; ops: WriteOp[] } {
    const created: Assignment[] = [];
    const ops: WriteOp[] = [];
    for (const personId of personIds) {
      const a: Assignment = {
        id: call.newId(),
        clientId,
        personId,
        target: { moduleId: module.id },
        dueAt,
        source: 'manual',
        assignedBy: call.actor.user.id,
        createdAt: call.actor.ctx.now,
        status: 'open',
      };
      created.push(a);
      ops.push(put('assignments', a));
      const user = users.find((u) => u.side === 'staff' && u.personId === personId && u.status === 'active');
      if (user) {
        const note: Notification = {
          id: call.newId(),
          clientId,
          userId: user.id,
          kind: 'trainingAssigned',
          params: { moduleTitle: module.title, dueDate: londonDateString(new Date(dueAt)) },
          createdAt: call.actor.ctx.now,
        };
        ops.push(put('notifications', note));
      }
    }
    return { created, ops };
  }

  // ------------------------------------------------------------ authoring

  const authoring: AuthoringService = {
    async create(ctx, input) {
      const call = await authorCall(ctx, 'content.write');
      const now = ctx.now;
      let owner: Module['owner'] = 'provider';
      if (call.side === 'client') {
        const clientId = call.clientId as string;
        const siteId = (input as { siteId?: string }).siteId;
        if (siteId !== undefined) {
          const site = (await call.all<{ id: string; clientId: string }>('sites')).find((s) => s.id === siteId);
          if (!site || site.clientId !== clientId) throw new ValidationError(['siteId: not a site of yours']);
        }
        const target = { clientId, ...(siteId ? { siteIds: [siteId] } : {}) };
        if (!canAny(call, ['modules.manage'], target, 'write')) return forbid('permission');
        owner = siteId ? { clientId, siteId } : { clientId };
        authoringState(call);
        await ownModuleLimit(call, clientId);
      }
      const content = contentOf(input);
      await checkModuleLinks(call, content, call.clientId);
      const module = validate('modules', {
        ...content,
        id: call.newId(),
        owner,
        status: 'draft',
        version: 1,
        updatedAt: now,
      }) as Module;
      await apply([
        put('modules', module),
        audit(call, call.clientId, 'authoring.create', `module:${module.id}`, undefined, {
          moduleId: module.id,
          questions: module.questions.length,
          lessons: module.lessons.length,
        }),
      ]);
      return structuredClone(module);
    },

    async saveDraft(ctx, moduleId, input) {
      const call = await authorCall(ctx, 'content.write');
      const current = await writableModule(call, moduleId);
      if (current.status === 'archived') throw new RuleError('moduleNotPublished');
      authoringState(call);
      const content = contentOf(input);
      await checkModuleLinks(call, content, call.clientId);
      const next = validate('modules', {
        ...content,
        id: current.id,
        owner: current.owner,
        status: current.status,
        version: current.version,
        updatedAt: ctx.now,
        ...(current.duplicatedFrom ? { duplicatedFrom: current.duplicatedFrom } : {}),
      }) as Module;
      const slim = { moduleId: current.id, questions: next.questions.length, lessons: next.lessons.length };
      if (current.status === 'draft') {
        await apply([
          put('modules', next),
          audit(call, call.clientId, 'authoring.saveDraft', `module:${current.id}`, undefined, slim),
        ]);
        return structuredClone(next);
      }
      const clientId = clientIdOf(current);
      const draft = validate('moduleDrafts', {
        moduleId: current.id,
        ...(clientId ? { clientId } : {}),
        module: next,
        updatedBy: call.actor.user.id,
        updatedAt: ctx.now,
      }) as ModuleDraft;
      await apply([
        { type: 'put', store: 'moduleDrafts', key: draft.moduleId, record: draft },
        audit(call, call.clientId, 'authoring.saveDraft', `module:${current.id}`, undefined, slim),
      ]);
      return structuredClone(draft.module);
    },

    async publish(ctx, moduleId, opts) {
      const call = await authorCall(ctx, 'content.publishAll');
      const current = await writableModule(call, moduleId);
      authoringState(call);
      const stored = (await backend.get('moduleDrafts', moduleId)) as ModuleDraft | undefined;
      let draft: ModuleDraft;
      if (current.status === 'draft') {
        const clientId = clientIdOf(current);
        draft = {
          moduleId,
          ...(clientId ? { clientId } : {}),
          module: current,
          updatedBy: call.actor.user.id,
          updatedAt: ctx.now,
        };
      } else if (stored) {
        draft = stored;
      } else {
        throw new ValidationError(['module: there is nothing to publish; save a draft first']);
      }
      const clientId = clientIdOf(current);
      const requirements = (await call.all<Requirement>('requirements')).filter(
        (r) => r.clientId === undefined || r.clientId === clientId,
      );
      if (!publishChecklist(draft.module, requirements).ok) throw new RuleError('checklistFailed');

      const now = new Date(ctx.now);
      const { module, snapshot } = publishVersion({ current, draft, now });
      const ops: WriteOp[] = [put('modules', module)];
      if (snapshot) ops.push({ type: 'put', store: 'moduleVersions', key: snapshot.key, record: snapshot });
      if (stored) ops.push(del('moduleDrafts', moduleId));

      let reassigned: Assignment[] = [];
      if (opts.reassign && snapshot && clientId) {
        const people = (await call.all<Person>('people')).filter((p) => p.clientId === clientId);
        const targets = reassignTargets({
          module,
          newVersion: module.version,
          evidence: (await call.all<Evidence>('evidence')).filter((e) => e.clientId === clientId),
          attempts: (await call.all<Attempt>('attempts')).filter((a) => a.clientId === clientId),
          assignments: (await call.all<Assignment>('assignments')).filter((a) => a.clientId === clientId),
          people,
        });
        const made = assignmentOps(
          call,
          clientId,
          module,
          targets,
          addDays(now, REASSIGN_DAYS).toISOString(),
          await call.all<UserAccount>('users'),
        );
        reassigned = made.created;
        ops.push(...made.ops);
      }
      ops.push(
        audit(call, call.clientId, 'authoring.publish', `module:${moduleId}`, undefined, {
          moduleId,
          version: module.version,
          reassigned: reassigned.length,
        }),
      );
      await apply(ops);
      return structuredClone({ module, reassigned });
    },

    async duplicate(ctx, moduleId) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client' || !holds(call, ['modules.manage'])) return forbid('permission');
      const clientId = call.clientId as string;
      const source = await moduleFor(call, moduleId);
      // Provider modules that are not published are not visible to clients.
      if (!(await canReadRecord(call, 'modules', source))) throw new NotFoundError();
      if (!canAny(call, ['modules.manage'], { clientId }, 'write')) return forbid('permission');
      authoringState(call);
      await ownModuleLimit(call, clientId);
      const copy = duplicateModule(source, { newId: call.newId(), clientId, now: new Date(ctx.now) });
      await apply([
        put('modules', validate('modules', copy) as Module),
        audit(call, clientId, 'authoring.duplicate', `module:${copy.id}`, undefined, {
          moduleId: copy.id,
          from: source.id,
          fromVersion: source.version,
        }),
      ]);
      return structuredClone(copy);
    },

    async archive(ctx, moduleId) {
      const call = await authorCall(ctx, 'content.write');
      const current = await writableModule(call, moduleId);
      authoringState(call);
      const next: Module = { ...current, status: 'archived', updatedAt: ctx.now };
      await apply([
        put('modules', next),
        audit(call, call.clientId, 'authoring.archive', `module:${moduleId}`, undefined, { moduleId }),
      ]);
      return structuredClone(next);
    },

    async remove(ctx, moduleId) {
      const call = await authorCall(ctx, 'content.write');
      const current = await writableModule(call, moduleId);
      authoringState(call);
      const allowed = canDeleteModule({
        module: current,
        evidence: await call.all<Evidence>('evidence'),
        attempts: await call.all<Attempt>('attempts'),
        events: await call.all<LearningEvent>('learningEvents'),
      });
      if (!allowed) throw new RuleError('hasCompletions');
      const ops: WriteOp[] = [del('modules', moduleId), del('moduleDrafts', moduleId)];
      for (const v of await call.all<ModuleVersion>('moduleVersions')) {
        if (v.moduleId === moduleId) ops.push(del('moduleVersions', v.key));
      }
      for (const a of await call.all<Assignment>('assignments')) {
        if (a.status === 'open' && 'moduleId' in a.target && a.target.moduleId === moduleId) {
          const cancelled: Assignment = { ...a, status: 'cancelled' };
          ops.push(put('assignments', cancelled));
        }
      }
      for (const p of await call.all<ModulePlacement>('modulePlacements')) {
        if (p.moduleId === moduleId) ops.push(del('modulePlacements', `${p.clientId}:${p.moduleId}`));
      }
      for (const g of await call.all<ModuleGroup>('moduleGroups')) {
        if (!g.moduleIds.includes(moduleId)) continue;
        const rest = g.moduleIds.filter((id) => id !== moduleId);
        const trimmed: ModuleGroup = { ...g, moduleIds: rest };
        ops.push(rest.length > 0 ? put('moduleGroups', trimmed) : del('moduleGroups', g.id));
      }
      ops.push(audit(call, call.clientId, 'authoring.remove', `module:${moduleId}`, undefined, { moduleId }));
      await apply(ops);
    },

    async exportJson(ctx, moduleId) {
      const call = await beginCall(backend, options, ctx);
      if (call.side === 'staff') return forbid('permission');
      const m = await readableModule(call, moduleId);
      return JSON.stringify(m, null, 2);
    },

    async versions(ctx, moduleId) {
      const call = await beginCall(backend, options, ctx);
      await readableModule(call, moduleId);
      return structuredClone(
        (await call.all<ModuleVersion>('moduleVersions'))
          .filter((v) => v.moduleId === moduleId)
          .sort((a, b) => a.version - b.version),
      );
    },

    async getVersion(ctx, moduleId, version) {
      const call = await beginCall(backend, options, ctx);
      const m = await readableModule(call, moduleId);
      if (version === m.version) return structuredClone(m);
      const snapshot = (await call.all<ModuleVersion>('moduleVersions')).find(
        (v) => v.key === `${moduleId}:${version}`,
      );
      if (!snapshot) throw new NotFoundError();
      return structuredClone(snapshot.module);
    },

    drafts: {
      async get(ctx, moduleId) {
        const call = await authorCall(ctx, 'content.read');
        const current = await readableModule(call, moduleId);
        if (call.side === 'client' && current.owner === 'provider') return forbid('permission');
        const draft = (await backend.get('moduleDrafts', moduleId)) as ModuleDraft | undefined;
        return draft ? structuredClone(draft) : null;
      },
    },
  };

  // ------------------------------------------------------------ organisation links on provider modules

  /** Title 1 to 120, a safe https address or one of the client's PDF documents, and a local key. */
  async function cleanLinks(
    call: Call,
    clientId: string,
    module: Module,
    links: LinkInput[],
    /** Documents the target's stored overlay already points at (the seeded policy is a Markdown document). */
    keep: ReadonlySet<string> = new Set(),
  ): Promise<LearnMoreLink[]> {
    if (!Array.isArray(links) || links.length === 0 || links.length > MAX_LINKS_PER_TARGET) {
      throw new ValidationError([`links: give 1 to ${String(MAX_LINKS_PER_TARGET)} links`]);
    }
    const client = await call.find<Client>('clients', clientId);
    const docs = await documentIds(call, clientId);
    const issues: string[] = [];
    const seen = new Set<string>();
    const out: LearnMoreLink[] = [];
    for (const link of links) {
      const raw = link as { id?: unknown; title?: unknown; url?: unknown; attachmentId?: unknown };
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      if (title.length < 1 || title.length > LINK_TITLE_MAX)
        issues.push(`links.title: 1 to ${String(LINK_TITLE_MAX)} characters`);
      if (typeof raw.id !== 'string' || !localKeySchema.safeParse(raw.id).success || seen.has(raw.id)) {
        issues.push('links.id: not a valid, unique key');
      } else seen.add(raw.id);
      if ((raw.url === undefined) === (raw.attachmentId === undefined)) {
        issues.push('links: give exactly one of url and attachmentId');
      }
      if (raw.url !== undefined && (typeof raw.url !== 'string' || !isSafeHttpsUrl(raw.url))) {
        throw new RuleError('notHttps');
      }
      if (
        raw.attachmentId !== undefined &&
        (typeof raw.attachmentId !== 'string' || !(docs.has(raw.attachmentId) || keep.has(raw.attachmentId)))
      ) {
        issues.push('links.attachmentId: not a PDF document of yours');
      }
      const base = {
        id: raw.id as string,
        title,
        publisher: client?.displayName ?? 'Our organisation',
        kind: 'organisation' as const,
        language: module.language,
        showFor: 'wrong' as const,
      };
      out.push(
        typeof raw.url === 'string' ? { ...base, url: raw.url } : { ...base, attachmentId: raw.attachmentId as string },
      );
    }
    if (issues.length > 0) throw new ValidationError([...new Set(issues)]);
    return out;
  }

  async function linkCall(ctx: ActorContext): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'client') return forbid('permission');
    if (!holds(call, ['modules.addLinks', 'modules.manage'])) return forbid('permission');
    return call;
  }

  const linkOverlays: LinkOverlaysService = {
    async save(ctx, input) {
      const call = await linkCall(ctx);
      const clientId = call.clientId as string;
      const module = await moduleFor(call, input.moduleId);
      if (module.owner !== 'provider') {
        throw new ValidationError(['moduleId: add links to your own modules inside the module']);
      }
      if (module.status !== 'published') throw new NotFoundError();
      if ((input.questionId === undefined) === (input.lessonId === undefined)) {
        throw new ValidationError(['Give either questionId or lessonId']);
      }
      if (input.questionId !== undefined && !module.questions.some((q) => q.id === input.questionId)) {
        throw new ValidationError(['questionId: not in this module']);
      }
      if (input.lessonId !== undefined && !module.lessons.some((l) => l.id === input.lessonId)) {
        throw new ValidationError(['lessonId: not in this module']);
      }
      checkAccountState(call, true);
      const existing = (await call.all<ClientLinkOverlay>('clientLinkOverlays')).find(
        (o) =>
          o.clientId === clientId &&
          o.siteId === undefined &&
          o.moduleId === module.id &&
          o.questionId === input.questionId &&
          o.lessonId === input.lessonId,
      );
      const keep = new Set((existing?.links ?? []).flatMap((l) => (l.attachmentId ? [l.attachmentId] : [])));
      const links = await cleanLinks(call, clientId, module, input.links, keep);
      const overlay = validate('clientLinkOverlays', {
        id: existing?.id ?? call.newId(),
        clientId,
        moduleId: module.id,
        ...(input.questionId !== undefined ? { questionId: input.questionId } : {}),
        ...(input.lessonId !== undefined ? { lessonId: input.lessonId } : {}),
        links,
        addedBy: call.actor.user.id,
        addedAt: ctx.now,
      }) as ClientLinkOverlay;
      await apply([
        put('clientLinkOverlays', overlay),
        audit(call, clientId, 'linkOverlays.save', `module:${module.id}`, undefined, {
          overlayId: overlay.id,
          moduleId: module.id,
          links: links.length,
        }),
      ]);
      return structuredClone(overlay);
    },

    async remove(ctx, overlayId) {
      const call = await linkCall(ctx);
      const clientId = call.clientId as string;
      const overlay = (await call.all<ClientLinkOverlay>('clientLinkOverlays')).find(
        (o) => o.id === overlayId && o.clientId === clientId,
      );
      if (!overlay) throw new NotFoundError();
      checkAccountState(call, true);
      await apply([
        del('clientLinkOverlays', overlay.id),
        audit(call, clientId, 'linkOverlays.remove', `module:${overlay.moduleId}`, undefined, {
          overlayId: overlay.id,
          moduleId: overlay.moduleId,
        }),
      ]);
    },
  };

  // ------------------------------------------------------------ files

  const attachments: AuthoringOperations['attachments'] = {
    async get(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      const a = await call.find<Attachment>('attachments', id);
      if (!a || !canSeeAttachment(call, a, await sharedScreenshotIds(call))) throw new NotFoundError();
      return structuredClone(a);
    },

    async list(ctx, filter) {
      const call = await beginCall(backend, options, ctx);
      const shared = await sharedScreenshotIds(call);
      return structuredClone(
        (await call.all<Attachment>('attachments'))
          .filter(
            (a) =>
              canSeeAttachment(call, a, shared) &&
              Object.entries(filter ?? {}).every(([k, v]) => (a as Record<string, unknown>)[k] === v),
          )
          .sort(byId),
      );
    },

    async upload(ctx, input: FileUpload) {
      const call = await beginCall(backend, options, ctx);
      if (call.side === 'provider') return forbid('permission');
      const clientId = call.clientId as string;
      const purpose: string = input.purpose;
      let personId: string | undefined;
      let siteId: string | undefined;

      if (purpose === 'learningDocument') {
        if (call.side !== 'client' || !holds(call, ['modules.manage'])) return forbid('permission');
        checkAccountState(call, true);
      } else if (purpose === 'certificate' || purpose === 'ticketScreenshot') {
        const own = call.actor.user.personId;
        personId = input.personId ?? own;
        if (personId === undefined) throw new ValidationError(['personId: choose who this is for']);
        if (personId !== own) {
          if (call.side !== 'client' || !holds(call, FOR_OTHERS)) return forbid('permission');
        }
        const person = (await call.all<Person>('people')).find((p) => p.id === personId && p.clientId === clientId);
        if (!person) throw new NotFoundError();
        const sites = [person.primarySiteId, ...person.additionalSiteIds];
        if (input.siteId !== undefined && !sites.includes(input.siteId)) {
          throw new ValidationError(['siteId: not a site this person works at']);
        }
        siteId = input.siteId ?? person.primarySiteId;
        if (personId !== own && !canAny(call, FOR_OTHERS, { clientId, siteIds: sites }, 'write')) {
          return forbid('outOfScope');
        }
        if (call.side === 'client') checkAccountState(call, false);
      } else {
        throw new ValidationError(['purpose: not a kind of file']);
      }

      const data = input.data;
      if (!ALLOWED_MIMES.includes(input.mime)) throw new RuleError('fileType');
      if (!(data instanceof Uint8Array) || data.length === 0) throw new RuleError('fileType');
      if (data.length > MAX_FILE_BYTES) throw new RuleError('fileTooLarge');
      if (sniffMime(data) !== input.mime) throw new RuleError('fileType');
      if (purpose === 'learningDocument' && input.mime !== 'application/pdf') throw new RuleError('fileType');
      if (hasImageMetadata(data, input.mime)) throw new RuleError('imageMetadata');
      const stored = (await backend.getAll('attachments')) as Attachment[];
      const used = stored.reduce((sum, a) => sum + (isFile(a) ? a.bytes : 0), 0);
      if (used + data.length > MAX_STORE_BYTES) throw new RuleError('storageFull');

      const file = validate('attachments', {
        id: call.newId(),
        clientId,
        kind: 'file',
        purpose,
        title: typeof input.title === 'string' ? input.title.trim() : '',
        mime: input.mime,
        bytes: data.length,
        data: new Uint8Array(data),
        ownerUserId: call.actor.user.id,
        ...(personId !== undefined ? { personId } : {}),
        ...(siteId !== undefined ? { siteId } : {}),
        redacted: input.redacted === true,
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        createdAt: ctx.now,
      }) as FileAttachment;
      await apply([
        put('attachments', file),
        audit(call, clientId, 'attachments.upload', `attachment:${file.id}`, undefined, {
          attachmentId: file.id,
          purpose: file.purpose,
          bytes: file.bytes,
        }),
      ]);
      return structuredClone(file);
    },

    async remove(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      const a = await call.find<Attachment>('attachments', id);
      if (!a || !canSeeAttachment(call, a) || !isFile(a)) throw new NotFoundError();
      const owner = a.ownerUserId === call.actor.user.id;
      const approver =
        call.side === 'client' &&
        a.purpose === 'certificate' &&
        canAny(
          call,
          ['evidence.approve'],
          { clientId: a.clientId, ...(a.siteId ? { siteIds: [a.siteId] } : {}) },
          'write',
        );
      const manager = call.side === 'client' && a.purpose === 'learningDocument' && holds(call, ['modules.manage']);
      if (!owner && !approver && !manager) return forbid('permission');
      const inUse =
        (await call.all<EvidenceSubmission>('evidenceSubmissions')).some((s) => s.fileAttachmentId === id) ||
        (await call.all<Evidence>('evidence')).some((e) => e.attachmentId === id);
      if (inUse) throw new RuleError('openSubmission');
      if (call.side === 'client') checkAccountState(call, a.purpose === 'learningDocument');
      await apply([
        del('attachments', id),
        audit(call, a.clientId, 'attachments.remove', `attachment:${id}`, undefined, {
          attachmentId: id,
          purpose: a.purpose,
        }),
      ]);
    },
  };

  // ------------------------------------------------------------ assigning a group

  const assignGroup: AuthoringOperations['assignGroup'] = async (ctx, input) => {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'client' || !holds(call, ['assign.manage'])) return forbid('permission');
    if (input.personIds.length > MAX_PEOPLE_PER_ASSIGN) throw new RuleError('tooMany');
    if (input.personIds.length === 0) throw new RuleError('invalidPeople');
    const clientId = call.clientId as string;
    const everyone = (await call.all<Person>('people')).filter((p) => p.clientId === clientId);
    const chosen = [...new Set(input.personIds)].map((id) => everyone.find((p) => p.id === id));
    if (chosen.some((p) => p === undefined)) throw new NotFoundError();
    for (const p of chosen as Person[]) {
      const target = { clientId, siteIds: [p.primarySiteId, ...p.additionalSiteIds] };
      if (!canAny(call, ['assign.manage'], target, 'write')) return forbid('outOfScope');
    }
    checkAccountState(call, false);
    const group = (await call.all<ModuleGroup>('moduleGroups')).find(
      (g) => g.id === input.groupId && g.clientId === clientId,
    );
    if (!group) throw new NotFoundError();
    const modules: Module[] = [];
    for (const id of group.moduleIds) {
      const m = await moduleFor(call, id);
      if (m.status !== 'published') throw new RuleError('moduleNotPublished');
      modules.push(m);
    }
    if (Number.isNaN(new Date(input.dueAt).getTime())) throw new ValidationError(['dueAt: not a date']);
    const now = new Date(ctx.now);
    if (isDueInPast(input.dueAt, now)) throw new RuleError('dueInPast');

    const existing = (await call.all<Assignment>('assignments')).filter((a) => a.clientId === clientId);
    const users = await call.all<UserAccount>('users');
    const created: Assignment[] = [];
    const skipped: { personId: string; reason: 'alreadyAssigned' }[] = [];
    const ops: WriteOp[] = [];
    for (const module of modules) {
      const plan = planAssignment({
        moduleId: module.id,
        personIds: input.personIds,
        people: everyone,
        existing,
        dueAt: input.dueAt,
        now,
      });
      if (plan.invalid.length > 0) throw new RuleError('invalidPeople');
      skipped.push(...plan.skipped);
      const made = assignmentOps(call, clientId, module, plan.toCreate, input.dueAt, users);
      created.push(...made.created);
      ops.push(...made.ops);
    }
    if (created.length > 0) {
      ops.push(
        audit(call, clientId, 'assignments.created', `group:${group.id}`, undefined, {
          groupId: group.id,
          modules: modules.length,
          count: created.length,
        }),
        ...tickOnboarding(call, clientId, await call.all<OnboardingChecklist>('onboarding'), 'assignTraining'),
      );
      await apply(ops);
    }
    return { created, skipped };
  };

  return { authoring, linkOverlays, attachments, assignGroup };
}

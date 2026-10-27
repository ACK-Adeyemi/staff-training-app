// Operations for auto-assign rules, people changes that fire them, reminders, scheduled jobs and notification snooze
// (M3 chunk 10a, "Data E first half"; plan assumptions 25 to 29). Each write authorises, applies the domain rules and then
// writes in ONE batch. Business rules live in @sta/domain: rules/autoAssign and reminders/plan.
import {
  addDays,
  autoAssignRuleSchema,
  checkLimit,
  chasePreview,
  checkReminderTemplate,
  defaultReminderText,
  evaluateAutoAssign,
  defaultDisplayPrefs,
  featureAvailability,
  fromLondonWall,
  londonDateString,
  londonWeekKey,
  personSchema,
  planManualSend,
  planReminders,
  reminderDigest,
  previewRule,
  reminderPolicySchema,
  reminderTemplatesSchema,
  renderReminder,
  ulid,
  type AddOnSubscription,
  type Assignment,
  type AutoAssignRule,
  type Client,
  type Evidence,
  type EvidenceSubmission,
  type JobRole,
  type LearnerPrefs,
  type Module,
  type ModuleGroup,
  type Notification,
  type OutboxMessage,
  type Person,
  type PlanInput,
  type ManualSkipReason,
  type Planned,
  type ReminderLog,
  type Requirement,
  type RuleInput as DomainRuleInput,
  type Site,
  type Subscription,
  type Team,
  type Trigger,
  type UserAccount,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import {
  audit,
  authorizePut,
  beginCall,
  checkAccountState,
  checkTenancy,
  clientEntitlements,
  derivedAccountState,
  forbid,
  holds,
  canAny,
  type Call,
} from './policy';
import {
  AccountStateError,
  NotEntitledError,
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type DataStore,
  type StoreOptions,
} from './types';

export type RulesOperations = {
  people: Pick<DataStore['people'], 'add' | 'update'>;
  autoAssign: DataStore['autoAssign'];
  reminders: DataStore['reminders'];
  snooze: DataStore['notifications']['snooze'];
  runJobs(now: string): Promise<void>;
};

export const newPersonPrefs = (): LearnerPrefs => ({
  hideFromLeaderboards: false,
  ...defaultDisplayPrefs,
  language: 'en-GB',
  battleExtraTimePercent: 0,
});

const put = (store: WriteOp['store'], record: { id: string } & Record<string, unknown>): WriteOp => ({
  type: 'put',
  store,
  key: record.id,
  record,
});

const PERSON_FIELDS = [
  'primarySiteId',
  'additionalSiteIds',
  'teamIds',
  'firstName',
  'lastName',
  'jobRoleIds',
  'startDate',
  'status',
] as const;
const MAX_OFFSET_DAYS = 365;

type Loader = <T>(store: WriteOp['store']) => Promise<T[]>;

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
const sorted = (list: string[] | undefined): string[] | undefined =>
  list && list.length > 0 ? [...list].sort() : undefined;
const byCreated = (a: Assignment, b: Assignment): number =>
  a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1;

/** What the rules need for one client, read through `all`. `people` may be replaced to include a change not yet stored. */
async function ruleInput(all: Loader, client: Client, now: Date, people?: Person[]): Promise<DomainRuleInput> {
  const own = <T extends { clientId?: string }>(rows: T[]): T[] => rows.filter((r) => r.clientId === client.id);
  return {
    rules: own(await all<AutoAssignRule>('autoAssignRules')),
    people: people ?? own(await all<Person>('people')),
    requirements: (await all<Requirement>('requirements')).filter(
      (r) => r.clientId === undefined || r.clientId === client.id,
    ),
    evidence: own(await all<Evidence>('evidence')),
    assignments: own(await all<Assignment>('assignments')),
    groups: own(await all<ModuleGroup>('moduleGroups')),
    now,
    amberWindowDays: client.settings.amberWindowDays,
    modules: await all<Module>('modules'),
  };
}

/** Turns planned rule assignments into records (only for modules the client may use) and in-app notices. */
async function planOps(
  all: Loader,
  client: Client,
  planned: Planned[],
  assignedBy: string,
  nowIso: string,
  newId: () => string,
): Promise<{ created: Assignment[]; ops: WriteOp[] }> {
  const modules = new Map(
    (await all<Module>('modules'))
      .filter((m) => m.status === 'published' && (m.owner === 'provider' || m.owner.clientId === client.id))
      .map((m) => [m.id, m]),
  );
  const users = await all<UserAccount>('users');
  const created: Assignment[] = [];
  const ops: WriteOp[] = [];
  for (const p of planned) {
    const module = modules.get(p.moduleId);
    if (!module) continue;
    const a: Assignment = {
      id: newId(),
      clientId: client.id,
      personId: p.personId,
      target: { moduleId: module.id },
      dueAt: p.dueAt,
      source: p.source,
      assignedBy,
      createdAt: nowIso,
      status: 'open',
    };
    created.push(a);
    ops.push(put('assignments', a));
    const user = users.find((u) => u.side === 'staff' && u.personId === p.personId && u.status === 'active');
    if (user) {
      ops.push(
        put('notifications', {
          id: newId(),
          clientId: client.id,
          userId: user.id,
          kind: 'trainingAssigned',
          params: { moduleTitle: module.title, dueDate: londonDateString(new Date(p.dueAt)) },
          createdAt: nowIso,
        } satisfies Notification),
      );
    }
  }
  return { created, ops };
}

function reminderInput(
  now: Date,
  client: Client,
  state: PlanInput['accountState'],
  data: {
    people: Person[];
    sites: Site[];
    assignments: Assignment[];
    requirements: Requirement[];
    evidence: Evidence[];
    submissions: EvidenceSubmission[];
    log: ReminderLog[];
  },
): PlanInput {
  return { now, policy: client.settings.reminderPolicy, accountState: state, ...data };
}

async function clientData(all: Loader, client: Client, extra: Assignment[] = []) {
  const own = <T extends { clientId?: string }>(rows: T[]): T[] => rows.filter((r) => r.clientId === client.id);
  return {
    people: own(await all<Person>('people')),
    sites: own(await all<Site>('sites')),
    assignments: [...own(await all<Assignment>('assignments')), ...extra],
    requirements: (await all<Requirement>('requirements')).filter(
      (r) => r.clientId === undefined || r.clientId === client.id,
    ),
    evidence: own(await all<Evidence>('evidence')),
    submissions: own(await all<EvidenceSubmission>('evidenceSubmissions')),
    log: own(await all<ReminderLog>('reminderLog')),
  };
}

/** The training name and date a reminder talks about. */
function reminderDetails(
  kind: string,
  targetId: string,
  offset: number,
  now: Date,
  data: { requirements: Requirement[]; assignments: Assignment[] },
  modules: Module[],
  groups: ModuleGroup[],
): { training: string; date: string } {
  if (kind === 'expiring') {
    return {
      training: data.requirements.find((q) => q.id === targetId)?.name ?? '',
      date: londonDateString(addDays(now, offset)),
    };
  }
  const a = data.assignments.find((x) => x.id === targetId);
  if (!a) {
    // An overdue requirement with no assignment: name the requirement and date it from how long it has been overdue.
    const req = data.requirements.find((q) => q.id === targetId);
    return { training: req?.name ?? '', date: req ? londonDateString(addDays(now, -offset)) : '' };
  }
  const training =
    'moduleId' in a.target
      ? (modules.find((m) => m.id === (a.target as { moduleId: string }).moduleId)?.title ?? '')
      : (groups.find((g) => g.id === (a.target as { groupId: string }).groupId)?.name ?? '');
  return { training, date: londonDateString(new Date(a.dueAt)) };
}

function reminderText(client: Client, kind: string, params: { firstName: string; training: string; date: string }) {
  const template = client.settings.reminderTemplates[kind];
  const custom = template?.text;
  try {
    return renderReminder(custom ?? defaultReminderText(kind, template?.tone), params);
  } catch {
    return renderReminder(defaultReminderText(kind), params);
  }
}

export function createRulesOperations(backend: RawBackend, options: StoreOptions): RulesOperations {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);
  const newId = (): string => ulid(options.clock, options.rng);

  // ------------------------------------------------------------ helpers for calls

  const clientCall = async (ctx: ActorContext, permission: string): Promise<Call> => {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'client' || !holds(call, [permission])) return forbid('permission');
    return call;
  };
  const clientOf = (call: Call): Client => call.actor.client as Client;
  /** Reminders are off in Read-only and beyond (assumption 45); returns the derived state. */
  const checkReminders = (call: Call) => {
    const state = call.actor.accountState ?? clientOf(call).accountState;
    if (featureAvailability(state, 'reminders') === 'no') throw new AccountStateError(state, 'reminders');
    return state;
  };
  const loaderOf =
    (call: Call): Loader =>
    (store) =>
      call.all(store);

  /** The caller's own rule, or NotFound (another client's rule looks the same as no rule). */
  const ruleOf = async (call: Call, id: string): Promise<AutoAssignRule> => {
    const rule = await call.find<AutoAssignRule>('autoAssignRules', id);
    if (!rule || rule.clientId !== call.clientId) throw new NotFoundError();
    return rule;
  };

  /** Every stored rule of the client uses a place in the package (assumption 26); the rule being saved is not counted. */
  async function checkRuleLimit(call: Call, ruleId: string, onlyEnabled = false): Promise<void> {
    const clientId = call.clientId as string;
    const ents = await clientEntitlements(call, clientId);
    if (!ents) throw new NotEntitledError('autoAssignRules');
    const used = (await call.all<AutoAssignRule>('autoAssignRules')).filter(
      (r) => r.clientId === clientId && (!onlyEnabled || r.enabled) && r.id !== ruleId,
    ).length;
    if (!checkLimit(ents, { autoAssignRules: used }, 'autoAssignRules').allowed) {
      throw new NotEntitledError('autoAssignRules');
    }
  }

  function parsePerson(value: unknown): Person {
    const result = personSchema.safeParse(value);
    if (!result.success) {
      throw new ValidationError(result.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
    }
    return result.data;
  }

  /** Sites, teams and job roles named by a person must be the caller's own (or global for job roles). */
  async function checkPlace(call: Call, person: Person): Promise<void> {
    const clientId = call.clientId as string;
    const sites = (await call.all<Site>('sites')).filter((s) => s.clientId === clientId);
    for (const id of [person.primarySiteId, ...person.additionalSiteIds]) {
      if (!sites.some((s) => s.id === id)) return forbid('tenant');
    }
    const teams = (await call.all<Team>('teams')).filter((t) => t.clientId === clientId);
    if (person.teamIds.some((id) => !teams.some((t) => t.id === id)))
      throw new ValidationError(['teamIds: unknown team']);
    const roles = (await call.all<JobRole>('jobRoles')).filter(
      (r) => r.clientId === undefined || r.clientId === clientId,
    );
    if (person.jobRoleIds.some((id) => !roles.some((r) => r.id === id))) {
      throw new ValidationError(['jobRoleIds: unknown job role']);
    }
  }

  /** Runs one trigger for one stored-or-new person state in the caller's batch. */
  async function fireRules(
    call: Call,
    trigger: Trigger,
    people: Person[],
  ): Promise<{ created: Assignment[]; ops: WriteOp[] }> {
    const client = clientOf(call);
    const all = loaderOf(call);
    const planned = evaluateAutoAssign(trigger, await ruleInput(all, client, call.actor.now, people));
    return planOps(all, client, planned, call.actor.user.id, call.actor.ctx.now, () => call.newId());
  }

  // ------------------------------------------------------------ people

  const people: RulesOperations['people'] = {
    async add(ctx, input) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client') return forbid('permission');
      const clientId = call.clientId as string;
      const given = input as Record<string, unknown>;
      const picked = Object.fromEntries(PERSON_FIELDS.map((k) => [k, given[k]]));
      const person = parsePerson({ ...picked, id: call.newId(), clientId, prefs: newPersonPrefs() });
      await checkTenancy(call, 'people', person, undefined);
      const authorised = await authorizePut(call, 'people', person, undefined);
      await checkPlace(call, person);
      const everyone = (await call.all<Person>('people')).filter((p) => p.clientId === clientId);
      const fired = await fireRules(call, { type: 'personAdded', personId: person.id }, [...everyone, person]);
      const ops: WriteOp[] = [put('people', person), ...authorised.extra, ...fired.ops];
      ops.push(audit(call, clientId, 'people.added', `person:${person.id}`, undefined, { id: person.id }));
      if (fired.created.length > 0) {
        ops.push(
          audit(call, clientId, 'assignments.created', `person:${person.id}`, undefined, {
            personId: person.id,
            count: fired.created.length,
            source: 'autoAssign',
          }),
        );
      }
      await apply(ops);
      return structuredClone(person);
    },

    async update(ctx, id, patch) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client') return forbid('permission');
      const clientId = call.clientId as string;
      const existing = await call.find<Person>('people', id);
      if (!existing || existing.clientId !== clientId) throw new NotFoundError();
      const given = patch as Record<string, unknown>;
      const changes = Object.fromEntries(
        [...PERSON_FIELDS, 'pausedUntil'].filter((k) => given[k] !== undefined).map((k) => [k, given[k]]),
      );
      const person = parsePerson({ ...existing, ...changes });
      await checkTenancy(call, 'people', person, existing);
      const authorised = await authorizePut(call, 'people', person, existing);
      await checkPlace(call, person);
      const ops: WriteOp[] = [put('people', person), ...authorised.extra];
      ops.push(audit(call, clientId, 'people.updated', `person:${id}`, undefined, { fields: Object.keys(changes) }));
      if (!sameSet(existing.jobRoleIds, person.jobRoleIds)) {
        const everyone = (await call.all<Person>('people')).filter((p) => p.clientId === clientId && p.id !== id);
        const fired = await fireRules(call, { type: 'roleChanged', personId: id }, [...everyone, person]);
        ops.push(...fired.ops);
        if (fired.created.length > 0) {
          ops.push(
            audit(call, clientId, 'assignments.created', `person:${id}`, undefined, {
              personId: id,
              count: fired.created.length,
              source: 'autoAssign',
            }),
          );
        }
      }
      await apply(ops);
      return structuredClone(person);
    },
  };

  // ------------------------------------------------------------ rules

  async function checkRuleRefs(call: Call, rule: AutoAssignRule): Promise<void> {
    const clientId = call.clientId as string;
    if ('moduleId' in rule.action) {
      const m = await call.find<Module>('modules', rule.action.moduleId);
      if (!m || (m.owner !== 'provider' && m.owner.clientId !== clientId)) throw new NotFoundError();
    } else {
      const groupId = rule.action.groupId;
      const group = (await call.all<ModuleGroup>('moduleGroups')).find(
        (g) => g.id === groupId && g.clientId === clientId,
      );
      if (!group) throw new NotFoundError();
    }
    if (rule.trigger.type === 'requirementExpiring') {
      const requirementId = rule.trigger.requirementId;
      const known = (await call.all<Requirement>('requirements')).some(
        (r) => r.id === requirementId && (r.clientId === undefined || r.clientId === clientId),
      );
      if (!known) throw new ValidationError(['trigger.requirementId: unknown requirement']);
    }
    const sites = (await call.all<Site>('sites')).filter((s) => s.clientId === clientId);
    if ((rule.filters.siteIds ?? []).some((id) => !sites.some((s) => s.id === id))) {
      throw new ValidationError(['filters.siteIds: unknown site']);
    }
    const teams = (await call.all<Team>('teams')).filter((t) => t.clientId === clientId);
    if ((rule.filters.teamIds ?? []).some((id) => !teams.some((t) => t.id === id))) {
      throw new ValidationError(['filters.teamIds: unknown team']);
    }
  }

  const shapeOf = (r: AutoAssignRule): string =>
    JSON.stringify({
      trigger: r.trigger,
      filters: {
        jobRoleIds: sorted(r.filters.jobRoleIds),
        teamIds: sorted(r.filters.teamIds),
        siteIds: sorted(r.filters.siteIds),
      },
      action: r.action,
    });

  const autoAssign: RulesOperations['autoAssign'] = {
    async list(ctx) {
      const call = await clientCall(ctx, 'assign.manage');
      return structuredClone(
        (await call.all<AutoAssignRule>('autoAssignRules'))
          .filter((r) => r.clientId === call.clientId)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      );
    },

    async save(ctx, input) {
      const call = await clientCall(ctx, 'assign.manage');
      const clientId = call.clientId as string;
      const parsed = autoAssignRuleSchema.safeParse({ ...input, id: input.id ?? call.newId(), clientId });
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
      }
      const rule = parsed.data;
      const existing =
        input.id === undefined ? undefined : await call.find<AutoAssignRule>('autoAssignRules', input.id);
      if (existing && existing.clientId !== clientId) throw new NotFoundError();
      checkAccountState(call, true);
      await checkRuleRefs(call, rule);
      const others = (await call.all<AutoAssignRule>('autoAssignRules')).filter(
        (r) => r.clientId === clientId && r.id !== rule.id,
      );
      if (others.some((r) => shapeOf(r) === shapeOf(rule))) throw new RuleError('duplicateRule');
      // Only a new rule needs a free place; changing one that is already stored never counts (assumption 26).
      if (!existing) await checkRuleLimit(call, rule.id);
      await apply([
        put('autoAssignRules', rule),
        audit(call, clientId, 'autoAssign.saved', `rule:${rule.id}`, existing, rule),
      ]);
      return structuredClone(rule);
    },

    async setEnabled(ctx, id, enabled) {
      const call = await clientCall(ctx, 'assign.manage');
      const rule = await ruleOf(call, id);
      checkAccountState(call, enabled);
      if (enabled) await checkRuleLimit(call, rule.id, true);
      const next = { ...rule, enabled };
      await apply([
        put('autoAssignRules', next),
        audit(
          call,
          rule.clientId,
          enabled ? 'autoAssign.enabled' : 'autoAssign.disabled',
          `rule:${id}`,
          { enabled: rule.enabled },
          { enabled },
        ),
      ]);
      return structuredClone(next);
    },

    async remove(ctx, id) {
      const call = await clientCall(ctx, 'assign.manage');
      const rule = await ruleOf(call, id);
      checkAccountState(call, false);
      await apply([
        { type: 'delete', store: 'autoAssignRules', key: id },
        audit(call, rule.clientId, 'autoAssign.removed', `rule:${id}`, rule, undefined),
      ]);
    },

    async preview(ctx, id) {
      const call = await clientCall(ctx, 'assign.manage');
      const rule = await ruleOf(call, id);
      return previewRule(rule, await ruleInput(loaderOf(call), clientOf(call), call.actor.now));
    },

    async history(ctx, id) {
      const call = await clientCall(ctx, 'assign.manage');
      const rule = await ruleOf(call, id);
      return structuredClone(
        (await call.all<Assignment>('assignments'))
          .filter((a) => a.clientId === rule.clientId && typeof a.source === 'object' && a.source.ruleId === id)
          .sort(byCreated),
      );
    },
  };

  // ------------------------------------------------------------ reminders

  const reminders: RulesOperations['reminders'] = {
    async policy(ctx) {
      const call = await clientCall(ctx, 'reminders.view');
      return structuredClone(clientOf(call).settings.reminderPolicy);
    },

    async savePolicy(ctx, policy, templates) {
      const call = await clientCall(ctx, 'reminders.manage');
      const parsed = reminderPolicySchema.safeParse(policy);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`));
      }
      const next = parsed.data;
      const offsets = [...next.dueOffsetsDays, ...next.expiringOffsetsDays];
      if (offsets.some((d) => d < 1 || d > MAX_OFFSET_DAYS)) {
        throw new ValidationError([`offsets: each must be between 1 and ${String(MAX_OFFSET_DAYS)} days`]);
      }
      let nextTemplates: Client['settings']['reminderTemplates'] | undefined;
      if (templates !== undefined) {
        const parsedTemplates = reminderTemplatesSchema.safeParse(templates);
        if (!parsedTemplates.success) {
          throw new ValidationError(parsedTemplates.error.issues.map((i) => `templates: ${i.message}`));
        }
        nextTemplates = parsedTemplates.data;
        for (const [kind, template] of Object.entries(nextTemplates)) {
          if (template.text === undefined) continue;
          const problem = checkReminderTemplate(template.text);
          if (problem !== 'ok') throw new ValidationError([`templates.${kind}.text: ${problem}`]);
        }
      }
      checkAccountState(call, false);
      const client = clientOf(call);
      await apply([
        put('clients', {
          ...client,
          settings: {
            ...client.settings,
            reminderPolicy: next,
            ...(nextTemplates ? { reminderTemplates: nextTemplates } : {}),
          },
        }),
        audit(call, client.id, 'reminders.policySaved', `client:${client.id}`, client.settings.reminderPolicy, next),
      ]);
      return structuredClone(next);
    },

    async digestPreview(ctx) {
      const call = await clientCall(ctx, 'reminders.view');
      checkReminders(call);
      const client = clientOf(call);
      const data = await clientData(loaderOf(call), client);
      const inScope = data.people.filter((p) =>
        canAny(
          call,
          ['reminders.view'],
          { clientId: client.id, siteIds: [p.primarySiteId, ...p.additionalSiteIds] },
          'read',
        ),
      );
      return structuredClone(
        reminderDigest({ now: call.actor.now, policy: client.settings.reminderPolicy, ...data, people: inScope }),
      );
    },

    async send(ctx, personIds) {
      const call = await clientCall(ctx, 'reminders.manage');
      const state = checkReminders(call);
      const client = clientOf(call);
      const wanted = [...new Set(Array.isArray(personIds) ? personIds : [])];
      const data = await clientData(loaderOf(call), client);
      // Every named person must be the caller's own and in their scope, or nothing is sent.
      for (const id of wanted) {
        const p = data.people.find((x) => x.id === id);
        if (!p) throw new NotFoundError();
        const target = { clientId: client.id, siteIds: [p.primarySiteId, ...p.additionalSiteIds] };
        if (!canAny(call, ['reminders.manage'], target, 'write')) return forbid('outOfScope');
      }
      const plan = planManualSend(reminderInput(call.actor.now, client, state, data), wanted);
      const users = await call.all<UserAccount>('users');
      const modules = await call.all<Module>('modules');
      const groups = (await call.all<ModuleGroup>('moduleGroups')).filter((g) => g.clientId === client.id);
      const nowIso = call.actor.ctx.now;
      const week = londonWeekKey(call.actor.now);
      const skipped: { personId: string; reason: ManualSkipReason | 'noAccount' }[] = [...plan.skipped];
      const sent: string[] = [];
      const ops: WriteOp[] = [];
      for (const r of plan.send) {
        const person = data.people.find((p) => p.id === r.personId) as Person;
        const user = users.find((u) => u.side === 'staff' && u.personId === r.personId && u.status === 'active');
        if (!user) {
          skipped.push({ personId: r.personId, reason: 'noAccount' });
          continue;
        }
        const { training, date } = reminderDetails(r.kind, r.targetId, r.offset, call.actor.now, data, modules, groups);
        sent.push(r.personId);
        ops.push(
          put('notifications', {
            id: call.newId(),
            clientId: client.id,
            userId: user.id,
            kind: 'reminder',
            params: { reminderKind: r.kind, offset: r.offset, training, date },
            createdAt: nowIso,
          } satisfies Notification),
          {
            type: 'put',
            store: 'reminderLog',
            key: `${r.personId}:manual:${r.targetId}:${nowIso}`,
            record: {
              key: `${r.personId}:manual:${r.targetId}:${nowIso}`,
              clientId: client.id,
              personId: r.personId,
              kind: 'manual',
              sentAt: nowIso,
              weekKey: week,
            } satisfies ReminderLog,
          },
        );
        // Limited accounts get the in-app notice only.
        if (state !== 'limited') {
          ops.push(
            put('outbox', {
              id: call.newId(),
              channel: 'push',
              to: user.id,
              body: reminderText(client, r.kind, { firstName: person.firstName, training, date }),
              at: nowIso,
              reason: `reminder.${r.kind}`,
            } satisfies OutboxMessage),
          );
        }
      }
      if (sent.length > 0) {
        ops.push(audit(call, client.id, 'reminders.sent', `client:${client.id}`, undefined, { count: sent.length }));
        await apply(ops);
      }
      return { sent, skipped };
    },

    async chaseOverdue(ctx, opts) {
      const call = await clientCall(ctx, 'reminders.manage');
      if ((opts as { preview?: boolean }).preview !== true)
        throw new ValidationError(['preview: only a preview is available']);
      const client = clientOf(call);
      const data = await clientData(loaderOf(call), client);
      const inScope = data.people.filter((p) =>
        canAny(
          call,
          ['reminders.manage'],
          { clientId: client.id, siteIds: [p.primarySiteId, ...p.additionalSiteIds] },
          'write',
        ),
      );
      const result = chasePreview(
        reminderInput(call.actor.now, client, call.actor.accountState ?? client.accountState, {
          ...data,
          people: inScope,
        }),
      );
      return structuredClone(result);
    },
  };

  // ------------------------------------------------------------ snooze

  const snooze: RulesOperations['snooze'] = async (ctx, id) => {
    const call = await beginCall(backend, options, ctx);
    const n = (await backend.get('notifications', id)) as Notification | undefined;
    if (!n || n.userId !== call.actor.user.id || n.clientId !== call.clientId) throw new NotFoundError();
    const tomorrow = londonDateString(addDays(call.actor.now, 1)).split('-').map(Number) as [number, number, number];
    const until = fromLondonWall({ y: tomorrow[0], m: tomorrow[1], d: tomorrow[2], h: 8, mi: 0, s: 0, ms: 0 });
    const next: Notification = { ...n, snoozedUntil: until.toISOString() };
    await apply([put('notifications', next)]);
    return structuredClone(next);
  };

  // ------------------------------------------------------------ scheduled jobs

  async function runJobs(nowIso: string): Promise<void> {
    const now = new Date(nowIso);
    if (Number.isNaN(now.getTime())) throw new ValidationError(['now: not a date']);
    const cache = new Map<string, Promise<unknown[]>>();
    const all: Loader = <T>(store: WriteOp['store']) => {
      let hit = cache.get(store);
      if (!hit) {
        hit = backend.getAll(store);
        cache.set(store, hit);
      }
      return hit as Promise<T[]>;
    };
    const ops: WriteOp[] = [];
    const clients = (await all<Client>('clients')).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const users = await all<UserAccount>('users');
    const modules = await all<Module>('modules');
    const groups = await all<ModuleGroup>('moduleGroups');

    // An add-on period that has ended turns the add-on off; its end date and usage stay for the record (assumption 27).
    for (const sub of await all<AddOnSubscription>('addOnSubscriptions')) {
      if (
        (sub.status === 'on' || sub.status === 'trial') &&
        sub.endsAt !== undefined &&
        Date.parse(sub.endsAt) <= now.getTime()
      ) {
        ops.push({
          type: 'put',
          store: 'addOnSubscriptions',
          key: `${sub.clientId}:${sub.addOnId}`,
          record: { ...sub, status: 'off' },
        });
      }
    }

    for (const client of clients) {
      const subscription = (await all<Subscription>('subscriptions')).find((s) => s.clientId === client.id);
      const state = derivedAccountState(client, subscription, now);
      let created: Assignment[] = [];

      // requirementExpiring rules need `authoring`, like any other rule change.
      if (featureAvailability(state, 'authoring') === 'yes') {
        const admin = users
          .filter((u) => u.side === 'client' && u.clientId === client.id && u.status === 'active')
          .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
        if (admin) {
          const planned = evaluateAutoAssign({ type: 'requirementExpiring' }, await ruleInput(all, client, now));
          const made = await planOps(all, client, planned, admin.id, nowIso, newId);
          created = made.created;
          ops.push(...made.ops);
        }
      }

      const data = await clientData(all, client, created);
      const plan = planReminders(reminderInput(now, client, state, data));
      for (const r of plan.send) {
        const person = data.people.find((p) => p.id === r.personId);
        const user = users.find((u) => u.side === 'staff' && u.personId === r.personId && u.status === 'active');
        if (!person || !user) continue;
        const { training, date } = reminderDetails(r.kind, r.targetId, r.offset, now, data, modules, groups);
        ops.push(
          put('notifications', {
            id: newId(),
            clientId: client.id,
            userId: user.id,
            kind: 'reminder',
            params: { reminderKind: r.kind, offset: r.offset, training, date },
            createdAt: nowIso,
          } satisfies Notification),
          {
            type: 'put',
            store: 'reminderLog',
            key: r.key,
            record: {
              key: r.key,
              clientId: client.id,
              personId: r.personId,
              kind: r.kind,
              sentAt: nowIso,
              weekKey: londonWeekKey(now),
            } satisfies ReminderLog,
          },
        );
        if (r.outbox) {
          ops.push(
            put('outbox', {
              id: newId(),
              channel: 'push',
              to: user.id,
              body: reminderText(client, r.kind, { firstName: person.firstName, training, date }),
              at: nowIso,
              reason: `reminder.${r.kind}`,
            } satisfies OutboxMessage),
          );
        }
      }
    }
    if (ops.length > 0) await apply(ops);
  }

  return { people, autoAssign, reminders, snooze, runJobs };
}

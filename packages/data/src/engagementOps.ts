// Operations for notes, `me`, categories, module groups and module placements (M2 chunk 8; plan Design > Data package).
// Each write authorises, applies the domain rules and then writes in ONE batch. Business rules live in @sta/domain.
import {
  categorySchema,
  displayName,
  DISPLAY_KEYS,
  learnerPrefsSchema,
  moduleGroupSchema,
  modulePlacementSchema,
  nicknameSchema,
  noteSchema,
  notesLocked,
  planCategoryDelete,
  planMerge,
  validateDisplayPrefs,
  validateNote,
  type Attempt,
  type Category,
  type LearnerPrefs,
  type ModuleGroup,
  type ModulePlacement,
  type Note,
  type Person,
  type Site,
  type Target,
} from '@sta/domain';
import type { RawBackend, WriteOp } from './backend';
import { audit, beginCall, canAny, checkAccountState, forbid, holds, type Call } from './policy';
import { moduleFor, put, staffCall } from './ops';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type AccessService,
  type ActorContext,
  type CategoriesService,
  type MeRecord,
  type MeService,
  type ModuleGroupsService,
  type ModulePlacementsService,
  type NotesService,
  type StoreOptions,
} from './types';

export type EngagementOperations = {
  notes: NotesService;
  me: MeService;
  access: Omit<AccessService, 'features'>;
  categories: CategoriesService;
  moduleGroups: ModuleGroupsService;
  modulePlacements: ModulePlacementsService;
};

const MAX_MODULES_PER_BULK = 200;

type Issue = { path: readonly PropertyKey[]; message: string };
function parsed<T>(
  schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { issues: Issue[] } } },
  v: unknown,
): T {
  const result = schema.safeParse(v);
  if (!result.success) {
    throw new ValidationError(
      (result.error?.issues ?? []).map((i) => `${i.path.map(String).join('.')}: ${i.message}`.replace(/^: /, '')),
    );
  }
  return result.data as T;
}

const byOrderThenId = (a: Category, b: Category): number =>
  a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byKey = (a: ModulePlacement, b: ModulePlacement): number =>
  a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0;
const placementKey = (p: { clientId: string; moduleId: string }): string => `${p.clientId}:${p.moduleId}`;
const putPlacement = (p: ModulePlacement): WriteOp => ({
  type: 'put',
  store: 'modulePlacements',
  key: placementKey(p),
  record: p,
});

/** Anyone who has a person record in their own client: staff, and client users linked to a person. */
async function personCall(
  backend: RawBackend,
  options: StoreOptions,
  ctx: ActorContext,
): Promise<{ call: Call; person: Person }> {
  // Own settings stay reachable while the two-step sign-in gate is limiting an admin.
  const call = await beginCall(backend, options, ctx, { allowLimited: true });
  if (call.side === 'provider') return forbid('permission');
  const personId = call.actor.user.personId;
  const person = personId ? await call.find<Person>('people', personId) : undefined;
  if (!person || person.clientId !== call.clientId) return forbid('permission');
  return { call, person };
}

const meRecord = (person: Person): MeRecord => ({
  displayName: displayName(person),
  ...(person.nickname !== undefined ? { nickname: person.nickname } : {}),
  prefs: structuredClone(person.prefs),
});

export function createEngagementOperations(backend: RawBackend, options: StoreOptions): EngagementOperations {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);

  // ------------------------------------------------------------ organise helpers

  /** Reads: client actors with modules.view, and staff of the same client. Never the provider. */
  async function reader(ctx: ActorContext): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side === 'provider') return forbid('permission');
    if (call.side === 'client' && !holds(call, ['modules.view'])) return forbid('permission');
    return call;
  }

  /** A site-scoped record is visible to a client actor who can read that site, and to staff who work there. */
  async function siteVisible(call: Call, siteId: string | undefined): Promise<boolean> {
    if (siteId === undefined) return true;
    if (call.side === 'client') {
      return canAny(call, ['modules.view'], { clientId: call.clientId as string, siteIds: [siteId] }, 'read');
    }
    const personId = call.actor.user.personId;
    const person = personId ? await call.find<Person>('people', personId) : undefined;
    return person !== undefined && [person.primarySiteId, ...person.additionalSiteIds].includes(siteId);
  }

  /**
   * Writes: client actors with modules.manage in scope, on an account that allows full use. `authoring` is for
   * category writes, which need the stricter authoring state (not Limited, Read-only or worse; M3 assumption 45).
   */
  function writer(call: Call, siteIds?: string[], authoring = false): void {
    if (call.side !== 'client') return forbid('permission');
    const target: Target = { clientId: call.clientId as string, ...(siteIds ? { siteIds } : {}) };
    if (!canAny(call, ['modules.manage'], target, 'write')) return forbid('permission');
    checkAccountState(call, authoring);
  }

  const ownCategories = async (call: Call): Promise<Category[]> =>
    (await call.all<Category>('categories')).filter((c) => c.clientId === call.clientId);
  const ownPlacements = async (call: Call): Promise<ModulePlacement[]> =>
    (await call.all<ModulePlacement>('modulePlacements')).filter((p) => p.clientId === call.clientId);
  async function ownCategory(call: Call, id: string): Promise<Category> {
    const hit = (await ownCategories(call)).find((c) => c.id === id);
    if (!hit) throw new NotFoundError();
    return hit;
  }
  /** Every module must exist and be usable by this client. */
  async function checkModules(call: Call, moduleIds: readonly string[]): Promise<string[]> {
    if (moduleIds.length === 0) throw new ValidationError(['moduleIds: choose at least one module']);
    const unique = [...new Set(moduleIds)];
    if (unique.length > MAX_MODULES_PER_BULK) throw new RuleError('tooMany');
    for (const id of unique) await moduleFor(call, id);
    return unique;
  }

  // ------------------------------------------------------------ notes

  const notes: NotesService = {
    async list(ctx, filter) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'staff') return forbid('permission');
      const { person } = await staffCall(backend, options, ctx);
      if (notesLocked(await call.all<Attempt>('attempts'), person.id)) throw new RuleError('notesLocked');
      return (await call.all<Note>('notes'))
        .filter(
          (n) =>
            n.personId === person.id &&
            n.clientId === person.clientId &&
            (filter?.moduleId === undefined || n.moduleId === filter.moduleId) &&
            (filter?.starred === undefined || n.starred === filter.starred),
        )
        .sort(byId);
    },

    async get(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'staff') throw new NotFoundError();
      const { person } = await staffCall(backend, options, ctx);
      if (notesLocked(await call.all<Attempt>('attempts'), person.id)) throw new RuleError('notesLocked');
      const note = (await call.all<Note>('notes')).find(
        (n) => n.id === id && n.personId === person.id && n.clientId === person.clientId,
      );
      if (!note) throw new NotFoundError();
      return note;
    },

    async save(ctx, input) {
      const { call, person } = await staffCall(backend, options, ctx);
      const existing =
        input.id === undefined
          ? undefined
          : (await call.all<Note>('notes')).find(
              (n) => n.id === input.id && n.personId === person.id && n.clientId === person.clientId,
            );
      if (input.id !== undefined && !existing) throw new NotFoundError();
      if (existing && existing.moduleId !== input.moduleId) {
        throw new ValidationError(['moduleId: a note cannot move to another course']);
      }
      const module = await moduleFor(call, input.moduleId);
      if (!existing && module.status !== 'published') throw new NotFoundError();
      const lessonId = input.lessonId ?? undefined;
      // An existing note keeps its lesson even if a newer version dropped it; a new or changed one must exist.
      const checkLesson = existing === undefined || existing.lessonId !== lessonId;
      const check = validateNote(
        { body: input.body, ...(checkLesson && lessonId !== undefined ? { lessonId } : {}) },
        module,
      );
      if (!check.ok) {
        if (check.error === 'lessonMissing') throw new RuleError('lessonMissing');
        throw new ValidationError([`body: ${check.error === 'empty' ? 'write something first' : 'too long'}`]);
      }
      const note = parsed<Note>(noteSchema, {
        id: existing?.id ?? call.newId(),
        clientId: person.clientId,
        personId: person.id,
        moduleId: module.id,
        ...(lessonId !== undefined ? { lessonId } : {}),
        body: check.body,
        starred: input.starred ?? existing?.starred ?? false,
        createdAt: existing?.createdAt ?? ctx.now,
        updatedAt: ctx.now,
      });
      await apply([put('notes', note)]);
      return structuredClone(note);
    },

    async remove(ctx, id) {
      const { call, person } = await staffCall(backend, options, ctx);
      const note = (await call.all<Note>('notes')).find(
        (n) => n.id === id && n.personId === person.id && n.clientId === person.clientId,
      );
      if (!note) throw new NotFoundError();
      await apply([{ type: 'delete', store: 'notes', key: id }]);
    },
  };

  // ------------------------------------------------------------ me

  const prefKeys = new Set(Object.keys(learnerPrefsSchema.shape));
  const me: MeService = {
    async get(ctx) {
      const { person } = await personCall(backend, options, ctx);
      return meRecord(person);
    },

    async updatePrefs(ctx, patch) {
      const { person } = await personCall(backend, options, ctx);
      const unknown = Object.keys(patch).filter((k) => !prefKeys.has(k));
      if (unknown.length > 0) throw new ValidationError(unknown.map((k) => `${k}: not a setting`));
      const display: Record<string, unknown> = {};
      for (const key of DISPLAY_KEYS)
        if ((patch as Record<string, unknown>)[key] !== undefined)
          display[key] = (patch as Record<string, unknown>)[key];
      const check = validateDisplayPrefs(display);
      if (!check.ok) throw new ValidationError(check.fields.map((f) => `${f}: not allowed`));
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null));
      const merged: Record<string, unknown> = { ...person.prefs, ...defined };
      if (patch.quietHours === null) delete merged['quietHours'];
      const prefs = parsed<LearnerPrefs>(learnerPrefsSchema, merged);
      const next: Person = { ...person, prefs };
      await apply([put('people', next)]);
      return meRecord(next);
    },

    async updateProfile(ctx, patch) {
      const { call, person } = await personCall(backend, options, ctx);
      if (patch.hideFromLeaderboards !== undefined && typeof patch.hideFromLeaderboards !== 'boolean') {
        throw new ValidationError(['hideFromLeaderboards: must be true or false']);
      }
      let next: Person = { ...person };
      const ops: WriteOp[] = [];
      if (patch.nickname !== undefined) {
        if (patch.nickname === null) {
          delete next.nickname;
        } else {
          next = { ...next, nickname: parsed<string>(nicknameSchema, patch.nickname) };
        }
        // The field name only, never the value (nicknames are personal).
        ops.push(
          audit(call, person.clientId, 'me.profileChanged', `person:${person.id}`, undefined, { fields: ['nickname'] }),
        );
      }
      if (patch.hideFromLeaderboards !== undefined) {
        next = { ...next, prefs: { ...next.prefs, hideFromLeaderboards: patch.hideFromLeaderboards } };
      }
      await apply([put('people', next), ...ops]);
      return meRecord(next);
    },
  };

  // ------------------------------------------------------------ categories

  const categories: CategoriesService = {
    async get(ctx, id) {
      const call = await reader(ctx);
      const hit = (await ownCategories(call)).find((c) => c.id === id);
      if (!hit) throw new NotFoundError();
      return hit;
    },
    async list(ctx, filter) {
      const call = await reader(ctx);
      return (await ownCategories(call))
        .filter((c) => Object.entries(filter ?? {}).every(([k, v]) => (c as Record<string, unknown>)[k] === v))
        .sort(byOrderThenId);
    },

    async save(ctx, input) {
      const call = await beginCall(backend, options, ctx);
      writer(call, undefined, true);
      const clientId = call.clientId as string;
      const all = await ownCategories(call);
      const existing = input.id === undefined ? undefined : all.find((c) => c.id === input.id);
      if (input.id !== undefined && !existing) throw new NotFoundError();
      const name = input.name.trim();
      const category = parsed<Category>(categorySchema, {
        id: existing?.id ?? call.newId(),
        clientId,
        name,
        colour: input.colour,
        icon: input.icon,
        order: existing?.order ?? Math.max(-1, ...all.map((c) => c.order)) + 1,
      });
      const key = name.toLocaleLowerCase('en-GB');
      if (all.some((c) => c.id !== category.id && c.name.trim().toLocaleLowerCase('en-GB') === key)) {
        throw new RuleError('nameTaken');
      }
      await apply([put('categories', category)]);
      return structuredClone(category);
    },

    async reorder(ctx, ids) {
      const call = await beginCall(backend, options, ctx);
      writer(call, undefined, true);
      if (new Set(ids).size !== ids.length) throw new ValidationError(['ids: a category is listed twice']);
      const all = await ownCategories(call);
      const chosen = ids.map((id) => {
        const hit = all.find((c) => c.id === id);
        if (!hit) throw new NotFoundError();
        return hit;
      });
      if (chosen.length === 0) return;
      // The categories keep the set of order slots they already held, handed out in the new sequence.
      let slots = chosen.map((c) => c.order).sort((a, b) => a - b);
      if (new Set(slots).size !== slots.length) slots = chosen.map((_, i) => (slots[0] as number) + i);
      const reordered = chosen.map((c, i): Category => ({ ...c, order: slots[i] as number }));
      await apply(reordered.map((c) => put('categories', c)));
    },

    async remove(ctx, id, opts) {
      const call = await beginCall(backend, options, ctx);
      writer(call, undefined, true);
      await ownCategory(call, id);
      if (opts?.moveTo !== undefined) await ownCategory(call, opts.moveTo);
      if (opts?.moveTo === id) throw new ValidationError(['moveTo: choose a different category']);
      const plan = planCategoryDelete(id, opts?.moveTo, await ownPlacements(call));
      await apply([...plan.updates.map(putPlacement), { type: 'delete', store: 'categories', key: id }]);
    },

    async merge(ctx, fromId, intoId) {
      const call = await beginCall(backend, options, ctx);
      writer(call, undefined, true);
      await ownCategory(call, fromId);
      await ownCategory(call, intoId);
      if (fromId === intoId) throw new ValidationError(['intoId: choose a different category']);
      const plan = planMerge(fromId, intoId, await ownPlacements(call));
      await apply([...plan.updates.map(putPlacement), { type: 'delete', store: 'categories', key: fromId }]);
    },
  };

  // ------------------------------------------------------------ groups

  const moduleGroups: ModuleGroupsService = {
    async get(ctx, id) {
      const call = await reader(ctx);
      const hit = (await call.all<ModuleGroup>('moduleGroups')).find(
        (g) => g.id === id && g.clientId === call.clientId,
      );
      if (!hit || !(await siteVisible(call, hit.siteId))) throw new NotFoundError();
      return hit;
    },
    async list(ctx, filter) {
      const call = await reader(ctx);
      const out: ModuleGroup[] = [];
      for (const g of await call.all<ModuleGroup>('moduleGroups')) {
        if (g.clientId !== call.clientId || !(await siteVisible(call, g.siteId))) continue;
        if (Object.entries(filter ?? {}).every(([k, v]) => (g as Record<string, unknown>)[k] === v)) out.push(g);
      }
      return out.sort(byId);
    },

    async save(ctx, input) {
      const call = await beginCall(backend, options, ctx);
      writer(call, input.siteId === undefined ? undefined : [input.siteId]);
      const clientId = call.clientId as string;
      const existing =
        input.id === undefined
          ? undefined
          : (await call.all<ModuleGroup>('moduleGroups')).find((g) => g.id === input.id && g.clientId === clientId);
      if (input.id !== undefined && !existing) throw new NotFoundError();
      if (existing) writer(call, existing.siteId === undefined ? undefined : [existing.siteId]);
      if (input.siteId !== undefined) {
        const site = await call.find<Site>('sites', input.siteId);
        if (!site || site.clientId !== clientId) throw new NotFoundError();
      }
      const group = parsed<ModuleGroup>(moduleGroupSchema, {
        id: existing?.id ?? call.newId(),
        clientId,
        ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
        name: input.name.trim(),
        description: input.description,
        moduleIds: input.moduleIds,
        inOrder: input.inOrder,
      });
      for (const moduleId of group.moduleIds) await moduleFor(call, moduleId);
      await apply([put('moduleGroups', group)]);
      return structuredClone(group);
    },

    async remove(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      writer(call);
      const hit = (await call.all<ModuleGroup>('moduleGroups')).find(
        (g) => g.id === id && g.clientId === call.clientId,
      );
      if (!hit) throw new NotFoundError();
      writer(call, hit.siteId === undefined ? undefined : [hit.siteId]);
      await apply([{ type: 'delete', store: 'moduleGroups', key: id }]);
    },
  };

  // ------------------------------------------------------------ placements

  async function changePlacements(
    ctx: ActorContext,
    moduleIds: string[],
    check: (call: Call) => Promise<void>,
    change: (p: ModulePlacement) => ModulePlacement,
  ): Promise<void> {
    const call = await beginCall(backend, options, ctx);
    writer(call);
    const clientId = call.clientId as string;
    await check(call);
    const ids = await checkModules(call, moduleIds);
    const have = await ownPlacements(call);
    const ops = ids.map((moduleId) => {
      // A module with no placement is visible to everyone today, so a new placement starts as available to all.
      const base: ModulePlacement = have.find((p) => p.moduleId === moduleId) ?? {
        clientId,
        moduleId,
        availableToAll: true,
      };
      return putPlacement(parsed<ModulePlacement>(modulePlacementSchema, change(base)));
    });
    await apply(ops);
  }

  const modulePlacements: ModulePlacementsService = {
    async get(ctx, id) {
      const call = await reader(ctx);
      const hit = (await ownPlacements(call)).find((p) => placementKey(p) === id);
      if (!hit) throw new NotFoundError();
      return hit;
    },
    async list(ctx, filter) {
      const call = await reader(ctx);
      return (await ownPlacements(call))
        .filter((p) => Object.entries(filter ?? {}).every(([k, v]) => (p as Record<string, unknown>)[k] === v))
        .sort(byKey);
    },
    setCategory: (ctx, input) =>
      changePlacements(
        ctx,
        input.moduleIds,
        async (call) => {
          if (input.categoryId !== undefined) await ownCategory(call, input.categoryId);
        },
        (p) => {
          const next: ModulePlacement = { ...p };
          if (input.categoryId === undefined) delete next.categoryId;
          else next.categoryId = input.categoryId;
          return next;
        },
      ),
    setAvailable: (ctx, input) =>
      changePlacements(
        ctx,
        input.moduleIds,
        () => Promise.resolve(),
        (p) => ({ ...p, availableToAll: input.availableToAll }),
      ),
  };

  const access: Omit<AccessService, 'features'> = {
    async permissions(ctx) {
      const call = await beginCall(backend, options, ctx, { allowLimited: true });
      return structuredClone(call.actor.perms);
    },
  };

  return { notes, me, access, categories, moduleGroups, modulePlacements };
}

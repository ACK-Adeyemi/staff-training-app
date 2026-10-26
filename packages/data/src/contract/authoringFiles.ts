// M3 chunk 8 contract tests, "Data C: authoring and files" (plan docs/plans/m3.md, assumptions 11 to 17 and 19 to 20,
// Data package `authoring` and `assignments.assignGroup`, Contract tests "Authoring and overlays" and "Files").
// Proves BP-1, BP-2, BP-3 and the data-layer parts of BP-15, BP-16 and F-4. Runs against every adapter.
// Written before the implementation, so the new DataStore methods are described by the local types below: they are
// the contract the implementer adds to `DataStore`.
//
// Conventions the tests assume (the plan leaves them open):
//   - `authoring.create(ctx, input)` makes a never-published module (status 'draft', version 1, in `modules`).
//     A client actor with modules.manage gets `owner: { clientId }` (plus `siteId` from the input); a provider actor
//     gets `owner: 'provider'`. `input` is a Module without id, owner, status, version, updatedAt and duplicatedFrom.
//   - `saveDraft(ctx, moduleId, input)` does not run the publish checklist. For a never-published module it replaces
//     the `modules` row; for a published one it writes the single ModuleDraft (key moduleId) and leaves `modules`
//     alone. It returns the saved Module content. `drafts.get` returns the ModuleDraft or null.
//   - `publish(ctx, id, { reassign })` returns `{ module, reassigned }` where `reassigned` is the Assignment[] created
//     (empty when reassign is false), due 30 days after ctx.now. A published module with no draft: a DataError.
//   - `duplicate(ctx, id)` works on provider and own modules and returns the new own draft Module.
//   - `exportJson(ctx, id)` returns a JSON string of the current module.
//   - `getVersion(ctx, id, version)` returns the Module as it was on that version (the current one or a snapshot).
//     Any actor of the client (staff included) may read versions of modules they can see.
//   - Audit actions (one slim event per write, `clientId` set, ids and counts only): authoring.create,
//     authoring.saveDraft, authoring.publish, authoring.duplicate, authoring.archive, authoring.remove,
//     linkOverlays.save, linkOverlays.remove, attachments.upload, attachments.remove, assignments.created.
//   - `linkOverlays.save(ctx, { moduleId, questionId? | lessonId?, links })` upserts the one overlay for that target.
//     Each link is `{ id, title, url } | { id, title, attachmentId }`; the data layer fills publisher (the client's
//     display name), kind 'organisation', language and showFor. `remove(ctx, overlayId)`.
//   - `attachments.upload(ctx, { purpose, title, mime, data, personId?, siteId?, alt?, redacted? })` returns the stored
//     FileAttachment. Staff may upload certificate and ticketScreenshot files for themselves only; learningDocument
//     (PDF) needs modules.manage; a different personId needs evidence.uploadForOthers in scope.
//   - The 50 MB per device cap is the sum of the stored files' `bytes` across the whole store.
//   - `assignGroup` returns the same `{ created, skipped }` as `assign`; it creates one module assignment per person
//     and group module, skipping open duplicates (reason 'alreadyAssigned').
//   - A provider actor may author provider modules; its ModuleDraft carries no client (the schema's required
//     `clientId` needs relaxing for provider drafts, which is the implementer's call).
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  orphanOverlays,
  type Assignment,
  type Client,
  type ClientLinkOverlay,
  type FileAttachment,
  type Module,
  type ModuleDraft,
  type ModuleGroup,
  type ModuleVersion,
  type Question,
} from '@sta/domain';
import { packageIds } from '@sta/content';
import {
  AccountStateError,
  DataError,
  ForbiddenError,
  NotEntitledError,
  NotFoundError,
  type ActorContext,
  type DemoAdmin,
  type StoreHandle,
  type StoreName,
  type StoreOptions,
} from '../types';
import { addLearningFixture, changedStores, refusal, ruleOf, type LearningFixture } from './learning';
import { buildWorld, freshId, TODAY, type World } from './world';

// ---------------------------------------------------------------- the API under test

export type ModuleInput = Omit<Module, 'id' | 'owner' | 'status' | 'version' | 'updatedAt' | 'duplicatedFrom'> & {
  siteId?: string;
};
export type LinkInput =
  { id: string; title: string; url: string } | { id: string; title: string; attachmentId: string };
export type FileUpload = {
  purpose: 'certificate' | 'ticketScreenshot' | 'learningDocument';
  title: string;
  mime: string;
  data: Uint8Array;
  personId?: string;
  siteId?: string;
  alt?: string;
  redacted?: boolean;
};
type Repo<T> = {
  get(ctx: ActorContext, id: string): Promise<T>;
  list(ctx: ActorContext): Promise<T[]>;
};
export type AuthoringFilesStore = {
  modules: Repo<Module>;
  clientLinkOverlays: Repo<ClientLinkOverlay>;
  attachments: Repo<FileAttachment> & {
    upload(ctx: ActorContext, input: FileUpload): Promise<FileAttachment>;
    remove(ctx: ActorContext, id: string): Promise<void>;
  };
  assignments: Repo<Assignment> & {
    assign(
      ctx: ActorContext,
      input: { moduleId: string; personIds: string[]; dueAt: string },
    ): Promise<{ created: Assignment[]; skipped: { personId: string; reason: string }[] }>;
    assignGroup(
      ctx: ActorContext,
      input: { groupId: string; personIds: string[]; dueAt: string },
    ): Promise<{ created: Assignment[]; skipped: { personId: string; reason: string }[] }>;
  };
  authoring: {
    create(ctx: ActorContext, input: ModuleInput): Promise<Module>;
    saveDraft(ctx: ActorContext, moduleId: string, input: ModuleInput): Promise<Module>;
    publish(
      ctx: ActorContext,
      moduleId: string,
      options: { reassign: boolean },
    ): Promise<{ module: Module; reassigned: Assignment[] }>;
    duplicate(ctx: ActorContext, moduleId: string): Promise<Module>;
    archive(ctx: ActorContext, moduleId: string): Promise<Module>;
    remove(ctx: ActorContext, moduleId: string): Promise<void>;
    exportJson(ctx: ActorContext, moduleId: string): Promise<string>;
    versions(ctx: ActorContext, moduleId: string): Promise<ModuleVersion[]>;
    getVersion(ctx: ActorContext, moduleId: string, version: number): Promise<Module>;
    drafts: { get(ctx: ActorContext, moduleId: string): Promise<ModuleDraft | null> };
  };
  linkOverlays: {
    save(
      ctx: ActorContext,
      input: { moduleId: string; questionId?: string; lessonId?: string; links: LinkInput[] },
    ): Promise<ClientLinkOverlay>;
    remove(ctx: ActorContext, overlayId: string): Promise<void>;
  };
};

// ---------------------------------------------------------------- helpers

const DAY = 86_400_000;
const MB = 1024 * 1024;
const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });
const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });

async function dump<T>(admin: DemoAdmin, store: StoreName): Promise<T[]> {
  return ((await admin.dumpAll()) as Record<string, unknown[]>)[store] as T[];
}
async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await refusal(promise);
  expect(error).toBeInstanceOf(ForbiddenError);
  return (error as ForbiddenError).reason;
}
const notFound = async (promise: Promise<unknown>): Promise<void> => {
  expect(await refusal(promise)).toBeInstanceOf(NotFoundError);
};
const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();

const mcq = (qid: string): Question => ({
  id: qid,
  type: 'mcq',
  prompt: `Where is the ${qid} exit?`,
  options: [
    { id: `${qid}-yes`, text: 'By the hall', correct: true },
    { id: `${qid}-no`, text: 'Behind the shed', correct: false },
  ],
  explanation: 'The hall exit is the signed one.',
  learnMore: [],
  tags: [],
});

/** A module that passes the publish checklist once a requirement is linked. */
const goodInput = (requirementId: string, over: Partial<ModuleInput> = {}): ModuleInput => ({
  title: 'Fire drills',
  description: 'How we run a fire drill',
  estimatedMinutes: 5,
  language: 'en-GB',
  requirementIds: [requirementId],
  roleTags: [],
  lessons: [
    { id: 'intro', title: 'Introduction', minutes: 3, blocks: [{ kind: 'text', markdown: 'Know the exits.' }] },
  ],
  questions: [mcq('q1'), mcq('q2')],
  quiz: {
    mode: 'mcq',
    drawCount: 2,
    shuffleQuestions: true,
    shuffleOptions: true,
    passMark: 80,
    maxRetakes: null,
    feedback: true,
    showSourceRef: true,
    notesInQuiz: 'choice',
    learnMoreFor: 'all',
  },
  ...over,
});

/** The editable fields of an existing module, as authoring input. */
const inputOf = (m: Module, over: Partial<ModuleInput> = {}): ModuleInput => ({
  title: m.title,
  description: m.description,
  estimatedMinutes: m.estimatedMinutes,
  language: m.language,
  requirementIds: m.requirementIds,
  roleTags: m.roleTags,
  lessons: m.lessons,
  questions: m.questions,
  quiz: m.quiz,
  ...over,
});

// ---- bytes of small, structurally valid files
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number): number[] => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const jpeg = (withExif = false): Uint8Array<ArrayBuffer> =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    ...ascii('JFIF'),
    0,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    ...(withExif ? [0xff, 0xe1, 0x00, 0x08, ...ascii('Exif'), 0, 0] : []),
    0xff,
    0xda,
    0x00,
    0x02,
    0xff,
    0xd9,
  ]);
const pngChunk = (type: string, body: number[] = []): number[] => [
  ...be32(body.length),
  ...ascii(type),
  ...body,
  0,
  0,
  0,
  0,
];
const png = (extra?: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    ...(extra ? pngChunk(extra, ascii('Comment\0GPS')) : []),
    ...pngChunk('IEND'),
  ]);
const webp = (withExif = false): Uint8Array<ArrayBuffer> => {
  const vp8 = [...ascii('VP8 '), ...le32(4), 0, 0, 0, 0];
  const exif = withExif ? [...ascii('EXIF'), ...le32(4), 0, 0, 0, 0] : [];
  const body = [...ascii('WEBP'), ...vp8, ...exif];
  return new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
};
const pdf = (size = 0): Uint8Array<ArrayBuffer> => {
  const head = ascii('%PDF-1.4\n%%EOF\n');
  const out = new Uint8Array(Math.max(size, head.length));
  out.set(head);
  return out;
};

export function runAuthoringFilesContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx: World = await buildWorld(handle.admin);
    const lf: LearningFixture = await addLearningFixture(handle.admin, fx);
    const admin = handle.admin;
    const store = handle.store as unknown as AuthoringFilesStore;
    const a = fx.ids.clients.a;
    const req = fx.ids.requirementId;

    // Extra people at Little Acorns: Lena can add links only; Vic can only view modules.
    const user = (n: number, name: string, side: 'client' | 'staff' = 'client') => ({
      id: freshId(4000 + n),
      side,
      clientId: a,
      email: `${name.toLowerCase()}@example.test`,
      displayName: name,
      status: 'active' as const,
      login: { method: 'emailPassword' as const, pinSet: false },
    });
    const lena = user(1, 'Lena');
    const vic = user(2, 'Vic');
    const role = (n: number, roleName: string, permissionIds: string[]) => ({
      id: freshId(4010 + n),
      owner: { clientId: a },
      name: roleName,
      description: roleName,
      colour: '#996633',
      permissionIds,
      system: false,
      version: 1,
      updatedBy: fx.ids.users.priya,
      updatedAt: TODAY,
    });
    const linker = role(1, 'Link adder', ['modules.view', 'modules.addLinks']);
    const viewer = role(2, 'Module viewer', ['modules.view']);
    const grant = (n: number, userId: string, roleId: string) => ({
      id: freshId(4020 + n),
      userId,
      roleIds: [roleId],
      scope: { type: 'clients' as const, ids: [a] },
      grants: [],
      denies: [],
      status: 'active' as const,
    });
    await admin.bulkPut('users', [lena, vic]);
    await admin.bulkPut('roles', [linker, viewer]);
    await admin.bulkPut('roleAssignments', [grant(1, lena.id, linker.id), grant(2, vic.id, viewer.id)]);

    const group: ModuleGroup = {
      id: freshId(4100),
      clientId: a,
      name: 'Starter pack',
      description: 'Two short modules',
      moduleIds: [lf.moduleId, lf.retakeId],
      inOrder: false,
    };
    await admin.bulkPut('moduleGroups', [group]);

    const setState = async (clientId: string, state: Client['accountState']): Promise<void> => {
      const subs = await dump<{ clientId: string } & Record<string, unknown>>(admin, 'subscriptions');
      const sub = subs.find((s) => s.clientId === clientId)!;
      await admin.bulkPut('subscriptions', [{ ...sub, state, stateSince: TODAY }]);
      const c = (await dump<Client>(admin, 'clients')).find((x) => x.id === clientId)!;
      await admin.bulkPut('clients', [{ ...c, accountState: state }]);
    };
    const audit = async (action: string) =>
      (await dump<{ action: string; clientId?: string; actorId: string; target: string }>(admin, 'audit')).filter(
        (e) => e.action === action,
      );
    const fileRecord = (n: number, over: Partial<FileAttachment> = {}): FileAttachment => ({
      id: freshId(4200 + n),
      clientId: a,
      kind: 'file',
      purpose: 'learningDocument',
      title: `File ${String(n)}`,
      mime: 'application/pdf',
      bytes: 100,
      data: pdf(100),
      ownerUserId: fx.ids.users.priya,
      redacted: false,
      createdAt: TODAY,
      ...over,
    });
    return {
      ...handle,
      store,
      admin,
      fx,
      lf,
      a,
      req,
      group,
      lena,
      vic,
      setState,
      audit,
      fileRecord,
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      rory: client(fx.ids.users.rory, a),
      lenaCtx: client(lena.id, a),
      vicCtx: client(vic.id, a),
      gina: client(fx.ids.users.gina, fx.ids.clients.ot),
      beth: client(fx.ids.users.beth, fx.ids.clients.b),
      jade: staff(fx.ids.users.jade, a),
      hannah: staff(fx.keys.users['hannah'], a),
      prov: provider(fx.ids.users.provOwner),
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  /** Priya creates and publishes an own module. */
  const published = async (s: S, over: Partial<ModuleInput> = {}): Promise<Module> => {
    const m = await s.store.authoring.create(s.priya, goodInput(s.req, over));
    return (await s.store.authoring.publish(s.priya, m.id, { reassign: false })).module;
  };
  const evidenceFor = (s: S, m: Module, personId: string, version: number, n: number) => ({
    id: freshId(4300 + n),
    clientId: s.a,
    personId,
    requirementId: s.req,
    kind: 'module' as const,
    completedAt: TODAY,
    moduleId: m.id,
    moduleVersion: version,
    siteIdAtTime: s.fx.ids.sites.main,
  });

  describe(`M3 authoring and files (data C): ${name}`, () => {
    // ------------------------------------------------------------ builder lifecycle (BP-1, BP-2)
    describe('the builder lifecycle', () => {
      it('creates a never-published own module as a draft, version 1, visible to its client admins only', async () => {
        const s = await setup();
        const m = await s.store.authoring.create(s.priya, goodInput(s.req));
        expect(m).toMatchObject({ status: 'draft', version: 1, owner: { clientId: s.a }, title: 'Fire drills' });
        expect(ids(await s.store.modules.list(s.priya))).toContain(m.id);
        expect(ids(await s.store.modules.list(s.jade))).not.toContain(m.id);
        expect(ids(await s.store.modules.list(s.gina))).not.toContain(m.id);
        await notFound(s.store.modules.get(s.gina, m.id));
      });

      it('lets a draft be saved with problems and refuses to publish it until the checklist passes', async () => {
        const s = await setup();
        const m = await s.store.authoring.create(s.priya, goodInput(s.req, { title: 'ab', questions: [] }));
        const saved = await s.store.authoring.saveDraft(
          s.priya,
          m.id,
          goodInput(s.req, { title: 'abc', questions: [] }),
        );
        expect(saved.title).toBe('abc');
        expect(await ruleOf(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBe('checklistFailed');
        expect((await s.store.modules.get(s.priya, m.id)).status).toBe('draft');
        expect(await dump(s.admin, 'moduleVersions')).toEqual([]);
      });

      it('refuses to publish without a linked requirement unless the module is marked optional', async () => {
        const s = await setup();
        const m = await s.store.authoring.create(s.priya, goodInput(s.req, { requirementIds: [] }));
        expect(await ruleOf(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBe('checklistFailed');
        await s.store.authoring.saveDraft(s.priya, m.id, goodInput(s.req, { requirementIds: [], optional: true }));
        const out = await s.store.authoring.publish(s.priya, m.id, { reassign: false });
        expect(out.module.status).toBe('published');
      });

      it('refuses an http link inside a module with notHttps and stores nothing', async () => {
        const s = await setup();
        const q: Question = {
          ...mcq('q1'),
          learnMore: [
            {
              id: 'bad',
              title: 'Old site',
              url: 'http://example.test/page',
              publisher: 'Example',
              kind: 'organisation',
              language: 'en-GB',
              showFor: 'wrong',
            },
          ],
        };
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.authoring.create(s.priya, goodInput(s.req, { questions: [q, mcq('q2')] })))).toBe(
          'notHttps',
        );
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('publishes a first version as version 1 with no snapshot, then lists it for everyone in the client', async () => {
        const s = await setup();
        const m = await published(s);
        expect(m).toMatchObject({ status: 'published', version: 1 });
        expect(await s.store.authoring.versions(s.priya, m.id)).toEqual([]);
        expect(ids(await s.store.modules.list(s.jade))).toContain(m.id);
        expect(await s.store.authoring.drafts.get(s.priya, m.id)).toBeNull();
      });

      it('keeps edits of a published module in a draft until published, then snapshots the old version', async () => {
        const s = await setup();
        const m = await published(s);
        await s.store.authoring.saveDraft(
          s.priya,
          m.id,
          goodInput(s.req, { title: 'Fire drills v2', questions: [mcq('q1'), mcq('q3')] }),
        );
        // The live module is untouched and staff still see version 1.
        expect((await s.store.modules.get(s.jade, m.id)).title).toBe('Fire drills');
        const draft = await s.store.authoring.drafts.get(s.priya, m.id);
        expect(draft).toMatchObject({ moduleId: m.id, clientId: s.a });
        expect(draft!.module.title).toBe('Fire drills v2');
        await expect(s.store.authoring.drafts.get(s.jade, m.id)).rejects.toBeInstanceOf(DataError);

        const out = await s.store.authoring.publish(s.priya, m.id, { reassign: false });
        expect(out.module).toMatchObject({ version: 2, status: 'published', title: 'Fire drills v2' });
        expect(await s.store.authoring.drafts.get(s.priya, m.id)).toBeNull();
        const versions = await s.store.authoring.versions(s.priya, m.id);
        expect(versions.map((v) => v.version)).toEqual([1]);
        expect(versions[0]!.key).toBe(`${m.id}:1`);
        const old = await s.store.authoring.getVersion(s.jade, m.id, 1);
        expect(old.title).toBe('Fire drills');
        expect(old.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
        const current = await s.store.authoring.getVersion(s.jade, m.id, 2);
        expect(current.questions.map((q) => q.id)).toEqual(['q1', 'q3']);
      });

      it('refuses to publish a published module that has no draft', async () => {
        const s = await setup();
        const m = await published(s);
        expect(await refusal(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBeInstanceOf(DataError);
        expect((await s.store.modules.get(s.priya, m.id)).version).toBe(1);
      });

      it('duplicates an own module into a new draft copy that remembers its source', async () => {
        const s = await setup();
        const m = await published(s);
        const copy = await s.store.authoring.duplicate(s.priya, m.id);
        expect(copy.id).not.toBe(m.id);
        expect(copy).toMatchObject({
          status: 'draft',
          version: 1,
          owner: { clientId: s.a },
          duplicatedFrom: { moduleId: m.id, version: 1 },
        });
        expect(copy.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
        expect(ids(await s.store.modules.list(s.jade))).not.toContain(copy.id);
      });

      it('duplicates a provider module into the client own copy without touching the original', async () => {
        const s = await setup();
        const before = await s.store.modules.get(s.priya, s.lf.moduleId);
        const copy = await s.store.authoring.duplicate(s.priya, s.lf.moduleId);
        expect(copy).toMatchObject({
          owner: { clientId: s.a },
          status: 'draft',
          version: 1,
          duplicatedFrom: { moduleId: s.lf.moduleId, version: before.version },
        });
        expect(await s.store.modules.get(s.priya, s.lf.moduleId)).toEqual(before);
      });

      it('counts duplicates and new modules against ownModules on the Essentials package', async () => {
        const s = await setup();
        const sub = (await dump<Record<string, unknown> & { clientId: string }>(s.admin, 'subscriptions')).find(
          (x) => x.clientId === s.a,
        )!;
        await s.admin.bulkPut('subscriptions', [{ ...sub, packageId: packageIds.essentials }]);
        const c = (await dump<Client>(s.admin, 'clients')).find((x) => x.id === s.a)!;
        await s.admin.bulkPut('clients', [{ ...c, packageId: packageIds.essentials }]);
        const first = await s.store.authoring.create(s.priya, goodInput(s.req));
        await s.store.authoring.duplicate(s.priya, s.lf.moduleId);
        await s.store.authoring.duplicate(s.priya, first.id);
        const error = await refusal(s.store.authoring.duplicate(s.priya, first.id));
        expect(error).toBeInstanceOf(NotEntitledError);
        expect((error as NotEntitledError).feature).toBe('ownModules');
        expect(await refusal(s.store.authoring.create(s.priya, goodInput(s.req)))).toBeInstanceOf(NotEntitledError);
      });

      it('archives an own module, which stays readable and cannot be assigned', async () => {
        const s = await setup();
        const m = await published(s);
        const out = await s.store.authoring.archive(s.priya, m.id);
        expect(out.status).toBe('archived');
        expect((await s.store.modules.get(s.priya, m.id)).status).toBe('archived');
        expect(
          await ruleOf(
            s.store.assignments.assign(s.priya, {
              moduleId: m.id,
              personIds: [s.fx.ids.people.hannah],
              dueAt: new Date(Date.parse(TODAY) + 7 * DAY).toISOString(),
            }),
          ),
        ).toBe('moduleNotPublished');
      });

      it('deletes a module nobody has completed, with its draft', async () => {
        const s = await setup();
        const m = await published(s);
        await s.store.authoring.saveDraft(s.priya, m.id, goodInput(s.req, { title: 'Edited' }));
        await s.store.authoring.remove(s.priya, m.id);
        await notFound(s.store.modules.get(s.priya, m.id));
        expect(await dump(s.admin, 'moduleDrafts')).toEqual([]);
      });

      it.each([
        ['Evidence', 'evidence'],
        ['a passed attempt', 'attempt'],
        ['a moduleCompleted event', 'event'],
      ] as const)('refuses to delete a module when someone has %s', async (_label, kind) => {
        const s = await setup();
        const m = await published(s);
        const jade = s.fx.keys.personas['jade'];
        if (kind === 'evidence') await s.admin.bulkPut('evidence', [evidenceFor(s, m, jade, 1, 1)]);
        if (kind === 'attempt')
          await s.admin.bulkPut('attempts', [
            {
              id: freshId(4400),
              clientId: s.a,
              siteId: s.fx.ids.sites.main,
              personId: jade,
              moduleId: m.id,
              moduleVersion: 1,
              mode: 'open',
              questionIds: ['q1', 'q2'],
              startedAt: TODAY,
              finishedAt: TODAY,
              score: 100,
              passed: true,
            },
          ]);
        if (kind === 'event')
          await s.admin.bulkPut('learningEvents', [
            {
              id: freshId(4401),
              clientId: s.a,
              siteId: s.fx.ids.sites.main,
              personId: jade,
              at: TODAY,
              type: 'moduleCompleted',
              moduleId: m.id,
              moduleVersion: 1,
            },
          ]);
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.authoring.remove(s.priya, m.id))).toBe('hasCompletions');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
        // Archive is still allowed.
        expect((await s.store.authoring.archive(s.priya, m.id)).status).toBe('archived');
      });

      it('keeps Evidence on the version it was taken on and offers the new version only when asked', async () => {
        const s = await setup();
        const m = await published(s);
        const jade = s.fx.keys.personas['jade'];
        const hannah = s.fx.ids.people.hannah;
        await s.admin.bulkPut('evidence', [evidenceFor(s, m, jade, 1, 2)]);
        await s.store.authoring.saveDraft(s.priya, m.id, goodInput(s.req, { title: 'Fire drills v2' }));
        const without = await s.store.authoring.publish(s.priya, m.id, { reassign: false });
        expect(without.reassigned).toEqual([]);
        expect(
          (await dump<Assignment>(s.admin, 'assignments')).filter(
            (x) => 'moduleId' in x.target && x.target.moduleId === m.id,
          ),
        ).toEqual([]);
        const stored = (await dump<{ moduleId: string; moduleVersion: number }>(s.admin, 'evidence')).filter(
          (e) => e.moduleId === m.id,
        );
        expect(stored.map((e) => e.moduleVersion)).toEqual([1]);

        await s.store.authoring.saveDraft(s.priya, m.id, goodInput(s.req, { title: 'Fire drills v3' }));
        const withAsk = await s.store.authoring.publish(s.priya, m.id, { reassign: true });
        expect(withAsk.module.version).toBe(3);
        // Jade holds Evidence on version 1 only, so she is asked again; Hannah never took it.
        expect(withAsk.reassigned.map((x) => x.personId)).toEqual([jade]);
        expect(withAsk.reassigned[0]).toMatchObject({ clientId: s.a, status: 'open', target: { moduleId: m.id } });
        const dueMs = Date.parse(withAsk.reassigned[0]!.dueAt) - Date.parse(TODAY);
        expect(dueMs).toBeGreaterThan(29 * DAY);
        expect(dueMs).toBeLessThan(31 * DAY);
        expect(withAsk.reassigned.map((x) => x.personId)).not.toContain(hannah);
        // Both old versions can still be read for results and certificates.
        expect((await s.store.authoring.getVersion(s.priya, m.id, 1)).title).toBe('Fire drills');
        expect((await s.store.authoring.getVersion(s.priya, m.id, 2)).title).toBe('Fire drills v2');
      });

      it('exports a module as JSON and keeps exports working while the account is Limited', async () => {
        const s = await setup();
        const m = await published(s);
        const parsed = JSON.parse(await s.store.authoring.exportJson(s.priya, m.id)) as Module;
        expect(parsed).toMatchObject({ id: m.id, title: 'Fire drills', version: 1 });
        expect(parsed.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
        await s.setState(s.a, 'limited');
        expect(JSON.parse(await s.store.authoring.exportJson(s.priya, m.id)) as Module).toMatchObject({ id: m.id });
      });

      it('lets a provider author and publish a provider module that clients then see', async () => {
        const s = await setup();
        const m = await s.store.authoring.create(s.prov, goodInput(s.req, { title: 'Provider module' }));
        expect(m.owner).toBe('provider');
        expect(ids(await s.store.modules.list(s.priya))).not.toContain(m.id);
        const out = await s.store.authoring.publish(s.prov, m.id, { reassign: false });
        expect(out.module).toMatchObject({ owner: 'provider', status: 'published', version: 1 });
        expect(ids(await s.store.modules.list(s.priya))).toContain(m.id);
      });
    });

    // ------------------------------------------------------------ who may write (BP-3)
    describe('who may write modules', () => {
      it('refuses client actors every write on a provider module with providerModuleReadOnly and changes nothing', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        const m = await s.store.modules.get(s.priya, s.lf.moduleId);
        expect(await ruleOf(s.store.authoring.saveDraft(s.priya, m.id, inputOf(m, { title: 'Mine now' })))).toBe(
          'providerModuleReadOnly',
        );
        expect(await ruleOf(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBe(
          'providerModuleReadOnly',
        );
        expect(await ruleOf(s.store.authoring.remove(s.priya, m.id))).toBe('providerModuleReadOnly');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('refuses the provider writes on a client-owned module and leaves it as it was', async () => {
        const s = await setup();
        const m = await published(s);
        const before = await s.admin.dumpAll();
        expect(
          await refusal(s.store.authoring.saveDraft(s.prov, m.id, goodInput(s.req, { title: 'Hijack' }))),
        ).toBeInstanceOf(DataError);
        expect(await refusal(s.store.authoring.archive(s.prov, m.id))).toBeInstanceOf(DataError);
        expect(await refusal(s.store.authoring.remove(s.prov, m.id))).toBeInstanceOf(DataError);
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('refuses staff and view-only or links-only admins every authoring write with ForbiddenError(permission)', async () => {
        const s = await setup();
        const m = await published(s);
        for (const ctx of [s.jade, s.vicCtx, s.lenaCtx, s.daniel, s.rory]) {
          expect(await reasonOf(s.store.authoring.create(ctx, goodInput(s.req))), 'create').toBe('permission');
          expect(await reasonOf(s.store.authoring.saveDraft(ctx, m.id, goodInput(s.req))), 'saveDraft').toBe(
            'permission',
          );
          expect(await reasonOf(s.store.authoring.publish(ctx, m.id, { reassign: false })), 'publish').toBe(
            'permission',
          );
          expect(await reasonOf(s.store.authoring.duplicate(ctx, m.id)), 'duplicate').toBe('permission');
          expect(await reasonOf(s.store.authoring.archive(ctx, m.id)), 'archive').toBe('permission');
          expect(await reasonOf(s.store.authoring.remove(ctx, m.id)), 'remove').toBe('permission');
        }
        expect((await s.store.modules.get(s.priya, m.id)).title).toBe('Fire drills');
      });

      it('gives NotFound when another client reads or writes an own module, its drafts or its versions', async () => {
        const s = await setup();
        const m = await published(s);
        await s.store.authoring.saveDraft(s.priya, m.id, goodInput(s.req, { title: 'v2' }));
        await s.store.authoring.publish(s.priya, m.id, { reassign: false });
        for (const ctx of [s.beth, s.gina]) {
          await notFound(s.store.modules.get(ctx, m.id));
          await notFound(s.store.authoring.exportJson(ctx, m.id));
          await notFound(s.store.authoring.versions(ctx, m.id));
          await notFound(s.store.authoring.getVersion(ctx, m.id, 1));
          await notFound(s.store.authoring.duplicate(ctx, m.id));
          await notFound(s.store.authoring.saveDraft(ctx, m.id, goodInput(s.req)));
          await notFound(s.store.authoring.archive(ctx, m.id));
          await notFound(s.store.authoring.remove(ctx, m.id));
        }
      });

      it('scopes authoring audit events to the client, with ids and counts only', async () => {
        const s = await setup();
        const m = await s.store.authoring.create(s.priya, goodInput(s.req));
        await s.store.authoring.saveDraft(s.priya, m.id, goodInput(s.req, { title: 'Second title' }));
        await s.store.authoring.publish(s.priya, m.id, { reassign: false });
        await s.store.authoring.duplicate(s.priya, m.id);
        await s.store.authoring.archive(s.priya, m.id);
        for (const action of [
          'authoring.create',
          'authoring.saveDraft',
          'authoring.publish',
          'authoring.duplicate',
          'authoring.archive',
        ]) {
          const events = await s.audit(action);
          expect(events, action).toHaveLength(1);
          expect(events[0]).toMatchObject({ clientId: s.a, actorId: s.fx.ids.users.priya });
          expect(JSON.stringify(events[0]), action).not.toContain('Where is the');
        }
        const publish = (await s.audit('authoring.publish'))[0]!;
        expect(publish.target).toContain(m.id);
        await s.store.authoring.remove(s.priya, (await s.store.authoring.duplicate(s.priya, m.id)).id);
        expect(await s.audit('authoring.remove')).toHaveLength(1);
      });
    });

    // ------------------------------------------------------------ account states (BP-12)
    describe('account states', () => {
      it.each(['limited', 'readOnly', 'closed', 'paused'] as const)(
        'refuses every authoring write while the account is %s and still lets modules be read',
        async (state) => {
          const s = await setup();
          const m = await published(s);
          await s.store.authoring.saveDraft(s.priya, m.id, goodInput(s.req, { title: 'Pending' }));
          await s.setState(s.a, state);
          const before = await s.admin.dumpAll();
          const feature = async (p: Promise<unknown>): Promise<string> => {
            const e = await refusal(p);
            expect(e).toBeInstanceOf(AccountStateError);
            return (e as AccountStateError).feature;
          };
          expect(await feature(s.store.authoring.create(s.priya, goodInput(s.req)))).toBe('authoring');
          expect(await feature(s.store.authoring.saveDraft(s.priya, m.id, goodInput(s.req)))).toBe('authoring');
          expect(await feature(s.store.authoring.publish(s.priya, m.id, { reassign: false }))).toBe('authoring');
          expect(await feature(s.store.authoring.duplicate(s.priya, m.id))).toBe('authoring');
          expect(await feature(s.store.authoring.remove(s.priya, m.id))).toBe('authoring');
          expect(
            await feature(
              s.store.linkOverlays.save(s.priya, {
                moduleId: s.lf.moduleId,
                questionId: 'q1',
                links: [{ id: 'x', title: 'X', url: 'https://example.test/x' }],
              }),
            ),
          ).toBe('authoring');
          expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
          expect((await s.store.modules.get(s.priya, m.id)).title).toBe('Fire drills');
        },
      );

      it('lets a Past due account keep authoring', async () => {
        const s = await setup();
        await s.setState(s.a, 'pastDue');
        const m = await s.store.authoring.create(s.priya, goodInput(s.req));
        expect(m.status).toBe('draft');
      });

      it('refuses authoring on a Deleted account', async () => {
        const s = await setup();
        const owner = client(s.fx.ids.stateClients.deleted.owner.id, s.fx.ids.clients.deleted);
        expect(await refusal(s.store.authoring.create(owner, goodInput(s.req)))).toBeInstanceOf(DataError);
      });
    });

    // ------------------------------------------------------------ overlays (BP-3)
    describe('organisation links on provider modules', () => {
      const link = (id: string, url = `https://example.test/${id}`): LinkInput => ({ id, title: `Link ${id}`, url });
      const save = (
        s: S,
        ctx: ActorContext,
        links: LinkInput[],
        target: { questionId?: string; lessonId?: string } = { questionId: 'q1' },
      ) => s.store.linkOverlays.save(ctx, { moduleId: s.lf.moduleId, ...target, links });

      it('saves an overlay for a question, filling in the organisation, and never changes the module', async () => {
        const s = await setup();
        const before = await s.store.modules.get(s.priya, s.lf.moduleId);
        const overlay = await save(s, s.priya, [link('fire-plan')]);
        const displayName = (await dump<Client>(s.admin, 'clients')).find((c) => c.id === s.a)!.displayName;
        expect(overlay).toMatchObject({
          clientId: s.a,
          moduleId: s.lf.moduleId,
          questionId: 'q1',
          addedBy: s.fx.ids.users.priya,
        });
        expect(overlay.links[0]).toMatchObject({
          id: 'fire-plan',
          url: 'https://example.test/fire-plan',
          kind: 'organisation',
          publisher: displayName,
        });
        expect(await s.store.modules.get(s.priya, s.lf.moduleId)).toEqual(before);
        expect(ids(await s.store.clientLinkOverlays.list(s.priya))).toContain(overlay.id);
      });

      it('saves again for the same target by replacing the links, and supports lessons', async () => {
        const s = await setup();
        const one = await save(s, s.priya, [link('a')]);
        const two = await save(s, s.priya, [link('b'), link('c')]);
        expect(two.id).toBe(one.id);
        expect(two.links.map((l) => l.id)).toEqual(['b', 'c']);
        const lesson = await save(s, s.priya, [link('d')], { lessonId: 'l-one' });
        expect(lesson).toMatchObject({ lessonId: 'l-one' });
        expect(lesson.id).not.toBe(one.id);
      });

      it('accepts a link to a learning document of the same client and refuses another client document or a markdown one', async () => {
        const s = await setup();
        const pdfDoc = s.fileRecord(1);
        const otherClient = s.fileRecord(2, { clientId: s.fx.ids.clients.b });
        await s.admin.bulkPut('attachments', [pdfDoc, otherClient]);
        const ok = await save(s, s.priya, [{ id: 'policy', title: 'Our policy', attachmentId: pdfDoc.id }]);
        expect(ok.links[0]).toMatchObject({ attachmentId: pdfDoc.id });
        expect(await refusal(save(s, s.priya, [{ id: 'x', title: 'X', attachmentId: otherClient.id }]))).toBeInstanceOf(
          DataError,
        );
        expect(
          await refusal(save(s, s.priya, [{ id: 'y', title: 'Y', attachmentId: s.lf.attachmentId }])),
        ).toBeInstanceOf(DataError);
      });

      it.each([
        ['http', [{ id: 'h', title: 'Old', url: 'http://example.test/h' }]],
        ['javascript', [{ id: 'j', title: 'Bad', url: 'javascript:alert(1)' }]],
        ['a login in the address', [{ id: 'u', title: 'Bad', url: 'https://user:pw@example.test/' }]],
      ] as const)('refuses a %s link with notHttps and writes nothing', async (_label, links) => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(await ruleOf(save(s, s.priya, [...links]))).toBe('notHttps');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('refuses empty and over-long titles, more than 10 links per target and a missing target', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(await refusal(save(s, s.priya, [{ id: 'e', title: '', url: 'https://example.test/e' }]))).toBeInstanceOf(
          DataError,
        );
        expect(
          await refusal(save(s, s.priya, [{ id: 'l', title: 'x'.repeat(121), url: 'https://example.test/l' }])),
        ).toBeInstanceOf(DataError);
        const eleven = Array.from({ length: 11 }, (_, i) => link(`k${String(i)}`));
        expect(await refusal(save(s, s.priya, eleven))).toBeInstanceOf(DataError);
        expect(await refusal(save(s, s.priya, [link('m')], { questionId: 'no-such-question' }))).toBeInstanceOf(
          DataError,
        );
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
        const ten = Array.from({ length: 10 }, (_, i) => link(`t${String(i)}`));
        expect((await save(s, s.priya, ten)).links).toHaveLength(10);
      });

      it('lets a links-only admin save and remove overlays and refuses view-only admins, staff and the provider', async () => {
        const s = await setup();
        const overlay = await save(s, s.lenaCtx, [link('lena')]);
        expect(overlay.addedBy).toBe(s.lena.id);
        for (const ctx of [s.vicCtx, s.jade, s.rory]) {
          expect(await reasonOf(save(s, ctx, [link('no')])), 'save').toBe('permission');
          expect(await reasonOf(s.store.linkOverlays.remove(ctx, overlay.id)), 'remove').toBe('permission');
        }
        expect(await refusal(save(s, s.prov, [link('no')]))).toBeInstanceOf(DataError);
        await s.store.linkOverlays.remove(s.lenaCtx, overlay.id);
        expect(ids(await s.store.clientLinkOverlays.list(s.priya))).not.toContain(overlay.id);
      });

      it('gives NotFound when another client removes an overlay, and keeps the overlay', async () => {
        const s = await setup();
        await notFound(s.store.linkOverlays.remove(s.gina, s.lf.overlayId));
        await notFound(s.store.linkOverlays.remove(s.beth, s.lf.overlayId));
        expect(ids(await s.store.clientLinkOverlays.list(s.priya))).toContain(s.lf.overlayId);
      });

      it('writes an audit event for every overlay change', async () => {
        const s = await setup();
        const overlay = await save(s, s.priya, [link('audited')]);
        await s.store.linkOverlays.remove(s.priya, overlay.id);
        const saved = await s.audit('linkOverlays.save');
        const removed = await s.audit('linkOverlays.remove');
        expect(saved).toHaveLength(1);
        expect(removed).toHaveLength(1);
        expect(saved[0]).toMatchObject({ clientId: s.a, actorId: s.fx.ids.users.priya });
        expect(removed[0]).toMatchObject({ clientId: s.a });
        expect(saved[0]!.target).toContain(s.lf.moduleId);
      });

      it('keeps an overlay when a new provider version drops its question, and the overlay becomes an orphan', async () => {
        const s = await setup();
        const kept = await save(s, s.priya, [link('kept')], { questionId: 'q1' });
        const v2 = await s.store.modules.get(s.priya, s.lf.moduleId);
        expect(v2.version).toBe(2);
        // The fixture overlay is on q2. Version 3 drops q2 and keeps q1; its lessons get text so it can publish.
        const lessons = v2.lessons.map((l) => ({ ...l, blocks: [{ kind: 'text' as const, markdown: 'Read this.' }] }));
        await s.store.authoring.saveDraft(
          s.prov,
          v2.id,
          inputOf(v2, { lessons, questions: v2.questions.filter((q) => q.id !== 'q2') }),
        );
        const out = await s.store.authoring.publish(s.prov, v2.id, { reassign: false });
        expect(out.module.version).toBe(3);

        const overlays = await s.store.clientLinkOverlays.list(s.priya);
        expect(ids(overlays)).toEqual([s.lf.overlayId, kept.id].sort());
        const current = await s.store.modules.get(s.jade, v2.id);
        expect(orphanOverlays(current, overlays).map((o) => o.id)).toEqual([s.lf.overlayId]);
        // Version 2 stays readable with the dropped question, for old results.
        const old = await s.store.authoring.getVersion(s.jade, v2.id, 2);
        expect(old.questions.map((q) => q.id)).toContain('q2');
        // Staff of that client can still read the overlay on the kept question.
        expect(ids(await s.store.clientLinkOverlays.list(s.jade))).toContain(kept.id);
        // The orphan can be removed by the client.
        await s.store.linkOverlays.remove(s.priya, s.lf.overlayId);
        expect(ids(await s.store.clientLinkOverlays.list(s.priya))).toEqual([kept.id]);
      });

      it('keeps attempts on the version they were taken on when the provider publishes a new version', async () => {
        const s = await setup();
        const v2 = await s.store.modules.get(s.priya, s.lf.moduleId);
        const lessons = v2.lessons.map((l) => ({ ...l, blocks: [{ kind: 'text' as const, markdown: 'Read this.' }] }));
        await s.store.authoring.saveDraft(s.prov, v2.id, inputOf(v2, { lessons }));
        await s.store.authoring.publish(s.prov, v2.id, { reassign: false });
        const attempts = (await dump<{ id: string; moduleVersion: number }>(s.admin, 'attempts')).filter(
          (x) => x.id === s.lf.jadeOldAttemptId,
        );
        expect(attempts.map((x) => x.moduleVersion)).toEqual([1]);
      });
    });

    // ------------------------------------------------------------ files (F-4, BP-15, BP-16)
    describe('file uploads', () => {
      const cert = (over: Partial<FileUpload> = {}): FileUpload => ({
        purpose: 'certificate',
        title: 'First aid certificate',
        mime: 'image/jpeg',
        data: jpeg(),
        ...over,
      });

      it('stores a clean file for the uploader with bytes, owner, person, site and client from the context', async () => {
        const s = await setup();
        const data = jpeg();
        const file = await s.store.attachments.upload(s.jade, cert({ alt: 'Certificate photo' }));
        expect(file).toMatchObject({
          kind: 'file',
          purpose: 'certificate',
          mime: 'image/jpeg',
          bytes: data.length,
          clientId: s.a,
          ownerUserId: s.fx.ids.users.jade,
          personId: s.fx.keys.personas['jade'],
          alt: 'Certificate photo',
        });
        expect(file.siteId).toBeDefined();
        expect(Array.from((await s.store.attachments.get(s.jade, file.id)).data)).toEqual(Array.from(data));
        const events = await s.audit('attachments.upload');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ clientId: s.a, actorId: s.fx.ids.users.jade });
      });

      it.each([
        ['JPEG', 'image/jpeg', jpeg()],
        ['PNG', 'image/png', png()],
        ['WebP', 'image/webp', webp()],
        ['PDF', 'application/pdf', pdf()],
      ] as const)('accepts a clean %s', async (_label, mime, data) => {
        const s = await setup();
        const file = await s.store.attachments.upload(s.jade, cert({ mime, data }));
        expect(file.mime).toBe(mime);
      });

      it.each([
        ['bytes that do not match the claimed type', cert({ mime: 'application/pdf', data: jpeg() })],
        ['a PNG sent as a JPEG', cert({ mime: 'image/jpeg', data: png() })],
        ['a type that is not allowed', cert({ mime: 'text/html', data: new Uint8Array(ascii('<html></html>')) })],
        ['an empty file', cert({ data: new Uint8Array(0) })],
        ['an image with its first bytes cut off', cert({ mime: 'image/png', data: png().subarray(2) })],
      ])('refuses %s with fileType and stores nothing', async (_label, input) => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.attachments.upload(s.jade, input))).toBe('fileType');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it.each([
        ['a JPEG with an Exif segment', 'image/jpeg', jpeg(true)],
        ['a PNG with a tEXt chunk', 'image/png', png('tEXt')],
        ['a PNG with an eXIf chunk', 'image/png', png('eXIf')],
        ['a PNG with an iTXt chunk', 'image/png', png('iTXt')],
        ['a PNG with a zTXt chunk', 'image/png', png('zTXt')],
        ['a WebP with an EXIF chunk', 'image/webp', webp(true)],
      ] as const)('refuses %s with imageMetadata and stores nothing', async (_label, mime, data) => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.attachments.upload(s.jade, cert({ mime, data })))).toBe('imageMetadata');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('accepts a file of exactly 10 MB and refuses one byte more with fileTooLarge', async () => {
        const s = await setup();
        const ok = await s.store.attachments.upload(s.jade, cert({ mime: 'application/pdf', data: pdf(10 * MB) }));
        expect(ok.bytes).toBe(10 * MB);
        expect(
          await ruleOf(s.store.attachments.upload(s.jade, cert({ mime: 'application/pdf', data: pdf(10 * MB + 1) }))),
        ).toBe('fileTooLarge');
      });

      it('refuses an upload that would take the device past 50 MB with storageFull, and accepts one that just fits', async () => {
        const s = await setup();
        const big = (n: number, owner: string) =>
          s.fileRecord(10 + n, { bytes: 10 * MB, data: pdf(10 * MB), purpose: 'learningDocument', ownerUserId: owner });
        // 40 MB already stored, spread over two clients: the cap is for the whole device.
        await s.admin.bulkPut('attachments', [
          big(1, s.fx.ids.users.priya),
          big(2, s.fx.ids.users.priya),
          big(3, s.fx.ids.users.priya),
          { ...big(4, s.fx.ids.users.beth), clientId: s.fx.ids.clients.b },
        ]);
        const fits = await s.store.attachments.upload(s.jade, cert({ mime: 'application/pdf', data: pdf(9 * MB) }));
        expect(fits.bytes).toBe(9 * MB);
        const stored = (await dump(s.admin, 'attachments')).length;
        expect(
          await ruleOf(s.store.attachments.upload(s.jade, cert({ mime: 'application/pdf', data: pdf(2 * MB) }))),
        ).toBe('storageFull');
        expect(await dump(s.admin, 'attachments')).toHaveLength(stored);
      });

      it('lets staff upload only for themselves, and admins upload for people in their scope only', async () => {
        const s = await setup();
        const hannahId = s.fx.ids.people.hannah;
        expect(await reasonOf(s.store.attachments.upload(s.jade, cert({ personId: hannahId })))).toBe('permission');
        const forHannah = await s.store.attachments.upload(s.daniel, cert({ personId: hannahId }));
        expect(forHannah).toMatchObject({ personId: hannahId, ownerUserId: s.fx.ids.users.daniel });
        // Mia works at the Annexe, outside Daniel's setting.
        expect(await reasonOf(s.store.attachments.upload(s.daniel, cert({ personId: s.fx.ids.people.mia })))).toBe(
          'outOfScope',
        );
        const forMia = await s.store.attachments.upload(s.priya, cert({ personId: s.fx.ids.people.mia }));
        expect(forMia.personId).toBe(s.fx.ids.people.mia);
      });

      it('lets only a client admin with modules.manage upload learning documents, and only as PDFs', async () => {
        const s = await setup();
        const doc: FileUpload = {
          purpose: 'learningDocument',
          title: 'Fire plan',
          mime: 'application/pdf',
          data: pdf(),
        };
        expect(await reasonOf(s.store.attachments.upload(s.jade, doc))).toBe('permission');
        expect(await reasonOf(s.store.attachments.upload(s.vicCtx, doc))).toBe('permission');
        expect(await refusal(s.store.attachments.upload(s.prov, doc))).toBeInstanceOf(DataError);
        expect(await ruleOf(s.store.attachments.upload(s.priya, { ...doc, mime: 'image/png', data: png() }))).toBe(
          'fileType',
        );
        const ok = await s.store.attachments.upload(s.priya, doc);
        expect(ok).toMatchObject({ purpose: 'learningDocument', clientId: s.a });
      });

      it('lets staff upload in a Read-only account but not once it is Closed', async () => {
        const s = await setup();
        const ro = s.fx.ids.stateClients.readOnly;
        const closed = s.fx.ids.stateClients.closed;
        const roStaff = staff(ro.staff.id, ro.client.id);
        const closedStaff = staff(closed.staff.id, closed.client.id);
        expect((await s.store.attachments.upload(roStaff, cert())).clientId).toBe(ro.client.id);
        expect(await refusal(s.store.attachments.upload(closedStaff, cert()))).toBeInstanceOf(AccountStateError);
      });

      it('lets the owner remove an unsubmitted file, audited, and refuses anyone else or a submitted file', async () => {
        const s = await setup();
        const mine = await s.store.attachments.upload(s.jade, cert());
        expect(await refusal(s.store.attachments.remove(s.hannah, mine.id))).toBeInstanceOf(DataError);
        expect(await refusal(s.store.attachments.remove(s.gina, mine.id))).toBeInstanceOf(DataError);
        await s.store.attachments.remove(s.jade, mine.id);
        await notFound(s.store.attachments.get(s.jade, mine.id));
        expect(await s.audit('attachments.remove')).toHaveLength(1);

        const submitted = await s.store.attachments.upload(s.jade, cert());
        await s.admin.bulkPut('evidenceSubmissions', [
          {
            id: freshId(4500),
            clientId: s.a,
            siteId: submitted.siteId ?? s.fx.ids.sites.main,
            personId: s.fx.keys.personas['jade'],
            requirementId: s.req,
            uploadedBy: s.fx.ids.users.jade,
            fileAttachmentId: submitted.id,
            providerName: 'Test Training Ltd',
            completedAt: '2026-10-01T09:00:00.000Z',
            status: 'awaitingCheck',
            createdAt: TODAY,
          },
        ]);
        expect(await refusal(s.store.attachments.remove(s.jade, submitted.id))).toBeInstanceOf(DataError);
        expect((await s.store.attachments.get(s.jade, submitted.id)).id).toBe(submitted.id);
      });
    });

    // ------------------------------------------------------------ read rules (assumption 20)
    describe('who can read a file', () => {
      /** A certificate Jade uploaded and submitted at the main setting. */
      async function submittedCertificate(s: S): Promise<FileAttachment> {
        const file = await s.store.attachments.upload(s.jade, {
          purpose: 'certificate',
          title: 'Certificate',
          mime: 'image/png',
          data: png(),
        });
        await s.admin.bulkPut('evidenceSubmissions', [
          {
            id: freshId(4600),
            clientId: s.a,
            siteId: s.fx.ids.sites.main,
            personId: s.fx.keys.personas['jade'],
            requirementId: s.req,
            uploadedBy: s.fx.ids.users.jade,
            fileAttachmentId: file.id,
            providerName: 'Test Training Ltd',
            completedAt: '2026-10-01T09:00:00.000Z',
            status: 'awaitingCheck',
            createdAt: TODAY,
          },
        ]);
        return file;
      }

      it('shows a certificate to the person, an approver in scope and an admin of the whole client', async () => {
        const s = await setup();
        const file = await submittedCertificate(s);
        for (const ctx of [s.jade, s.daniel, s.priya]) {
          expect((await s.store.attachments.get(ctx, file.id)).id).toBe(file.id);
          expect(ids(await s.store.attachments.list(ctx))).toContain(file.id);
        }
      });

      it('gives NotFound for a certificate to other staff, an approver out of scope, other clients and the provider', async () => {
        const s = await setup();
        const file = await submittedCertificate(s);
        // A certificate for Mia at the Annexe, which Daniel cannot see.
        const miaFile = s.fileRecord(30, {
          purpose: 'certificate',
          mime: 'image/png',
          data: png(),
          bytes: png().length,
          personId: s.fx.ids.people.mia,
          siteId: s.fx.ids.sites.annexe,
          ownerUserId: s.fx.ids.users.rory,
        });
        await s.admin.bulkPut('attachments', [miaFile]);
        await s.admin.bulkPut('evidenceSubmissions', [
          {
            id: freshId(4601),
            clientId: s.a,
            siteId: s.fx.ids.sites.annexe,
            personId: s.fx.ids.people.mia,
            requirementId: s.req,
            uploadedBy: s.fx.ids.users.rory,
            fileAttachmentId: miaFile.id,
            providerName: 'Test Training Ltd',
            completedAt: '2026-10-01T09:00:00.000Z',
            status: 'awaitingCheck',
            createdAt: TODAY,
          },
        ]);
        for (const ctx of [s.hannah, s.gina, s.beth, s.prov]) {
          await notFound(s.store.attachments.get(ctx, file.id));
          expect(ids(await s.store.attachments.list(ctx))).not.toContain(file.id);
        }
        await notFound(s.store.attachments.get(s.daniel, miaFile.id));
        expect(ids(await s.store.attachments.list(s.daniel))).not.toContain(miaFile.id);
        expect((await s.store.attachments.get(s.priya, miaFile.id)).id).toBe(miaFile.id);
        // Without evidence.view an admin cannot read it either.
        await notFound(s.store.attachments.get(s.vicCtx, file.id));
      });

      it('shows a ticket screenshot to the person who raised it only', async () => {
        const s = await setup();
        const shot = await s.store.attachments.upload(s.jade, {
          purpose: 'ticketScreenshot',
          title: 'Screenshot',
          mime: 'image/png',
          data: png(),
          alt: 'The page that broke',
        });
        expect((await s.store.attachments.get(s.jade, shot.id)).id).toBe(shot.id);
        // No ticket points at it, so not even an admin who sees every ticket can open it.
        for (const ctx of [s.hannah, s.priya, s.daniel, s.gina, s.prov]) {
          await notFound(s.store.attachments.get(ctx, shot.id));
        }
      });

      it('shows a learning document to everyone in the client and to nobody in another client or the provider', async () => {
        const s = await setup();
        const doc = await s.store.attachments.upload(s.priya, {
          purpose: 'learningDocument',
          title: 'Fire plan',
          mime: 'application/pdf',
          data: pdf(),
        });
        for (const ctx of [s.jade, s.hannah, s.daniel, s.vicCtx, s.priya]) {
          expect((await s.store.attachments.get(ctx, doc.id)).id).toBe(doc.id);
        }
        for (const ctx of [s.gina, s.beth, s.prov]) await notFound(s.store.attachments.get(ctx, doc.id));
      });

      it('still shows the M1 markdown documents of the client to its staff', async () => {
        const s = await setup();
        expect((await s.store.attachments.get(s.jade, s.lf.attachmentId)).id).toBe(s.lf.attachmentId);
        await notFound(s.store.attachments.get(s.gina, s.lf.attachmentId));
      });
    });

    // ------------------------------------------------------------ assignGroup
    describe('assigning a group', () => {
      const due = (): string => new Date(Date.parse(TODAY) + 14 * DAY).toISOString();
      const open = async (s: S) => (await dump<Assignment>(s.admin, 'assignments')).filter((a) => a.status === 'open');

      it('expands the group into one assignment per person and module and skips open duplicates', async () => {
        const s = await setup();
        const jade = s.fx.keys.personas['jade'];
        const lucy = s.fx.keys.personas['lucy'];
        const hannah = s.fx.ids.people.hannah;
        // Fixture: Jade already has the first module open and Lucy the second.
        const result = await s.store.assignments.assignGroup(s.priya, {
          groupId: s.group.id,
          personIds: [jade, hannah, lucy, hannah],
          dueAt: due(),
        });
        const pairs = result.created
          .map((a) => `${a.personId}:${'moduleId' in a.target ? a.target.moduleId : '?'}`)
          .sort();
        expect(pairs).toEqual(
          [
            `${jade}:${s.lf.retakeId}`,
            `${hannah}:${s.lf.moduleId}`,
            `${hannah}:${s.lf.retakeId}`,
            `${lucy}:${s.lf.moduleId}`,
          ].sort(),
        );
        expect(result.created.every((a) => a.source === 'manual' && a.status === 'open' && a.clientId === s.a)).toBe(
          true,
        );
        expect(result.created.every((a) => a.assignedBy === s.fx.ids.users.priya && a.dueAt === due())).toBe(true);
        expect(result.skipped.map((x) => x.personId).sort()).toEqual([jade, lucy].sort());
        expect(result.skipped.every((x) => x.reason === 'alreadyAssigned')).toBe(true);
        expect((await open(s)).filter((a) => a.personId === hannah)).toHaveLength(2);
      });

      it('creates nothing the second time and notifies each staff user once per created assignment', async () => {
        const s = await setup();
        const hannah = s.fx.ids.people.hannah;
        await s.store.assignments.assignGroup(s.priya, { groupId: s.group.id, personIds: [hannah], dueAt: due() });
        const notes = (await dump<{ userId: string; kind: string }>(s.admin, 'notifications')).filter(
          (n) => n.userId === s.fx.keys.users['hannah'] && n.kind === 'trainingAssigned',
        );
        expect(notes.length).toBeGreaterThanOrEqual(2);
        const before = await s.admin.dumpAll();
        const again = await s.store.assignments.assignGroup(s.priya, {
          groupId: s.group.id,
          personIds: [hannah],
          dueAt: due(),
        });
        expect(again.created).toEqual([]);
        expect(again.skipped).toHaveLength(2);
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('audits the batch with counts and the group id, scoped to the client', async () => {
        const s = await setup();
        await s.store.assignments.assignGroup(s.priya, {
          groupId: s.group.id,
          personIds: [s.fx.ids.people.hannah],
          dueAt: due(),
        });
        const events = await s.audit('assignments.created');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ clientId: s.a, actorId: s.fx.ids.users.priya });
        expect(JSON.stringify(events[0])).toContain(s.group.id);
      });

      it('refuses people outside the actor scope, a past due date, other clients groups and archived people', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        expect(
          await reasonOf(
            s.store.assignments.assignGroup(s.daniel, {
              groupId: s.group.id,
              personIds: [s.fx.ids.people.hannah, s.fx.ids.people.mia],
              dueAt: due(),
            }),
          ),
        ).toBe('outOfScope');
        expect(
          await ruleOf(
            s.store.assignments.assignGroup(s.priya, {
              groupId: s.group.id,
              personIds: [s.fx.ids.people.hannah],
              dueAt: new Date(Date.parse(TODAY) - 3 * DAY).toISOString(),
            }),
          ),
        ).toBe('dueInPast');
        await notFound(
          s.store.assignments.assignGroup(s.gina, {
            groupId: s.group.id,
            personIds: [s.fx.ids.people.otRiver],
            dueAt: due(),
          }),
        );
        await notFound(
          s.store.assignments.assignGroup(s.priya, {
            groupId: freshId(9999),
            personIds: [s.fx.ids.people.hannah],
            dueAt: due(),
          }),
        );
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('refuses staff and admins without assign.manage with ForbiddenError(permission)', async () => {
        const s = await setup();
        for (const ctx of [s.jade, s.rory, s.vicCtx]) {
          expect(
            await reasonOf(
              s.store.assignments.assignGroup(ctx, {
                groupId: s.group.id,
                personIds: [s.fx.ids.people.hannah],
                dueAt: due(),
              }),
            ),
          ).toBe('permission');
        }
      });

      it('refuses a group that holds a module which is not published, without assigning any of it', async () => {
        const s = await setup();
        await s.admin.bulkPut('moduleGroups', [{ ...s.group, moduleIds: [s.lf.moduleId, s.lf.draftId] }]);
        const before = await s.admin.dumpAll();
        expect(
          await ruleOf(
            s.store.assignments.assignGroup(s.priya, {
              groupId: s.group.id,
              personIds: [s.fx.ids.people.hannah],
              dueAt: due(),
            }),
          ),
        ).toBe('moduleNotPublished');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });
    });
  });
}

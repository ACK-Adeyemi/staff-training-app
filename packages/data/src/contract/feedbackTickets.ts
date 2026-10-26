// M3 chunk 9 contract tests, "Data D: feedback, tickets and FAQs" (plan docs/plans/m3.md, assumptions 18 and 24, Data
// package `moduleFeedback`, `appFeedback`, `tickets`, `faqs`, Contract tests "Feedback, tickets, FAQs"). Proves the
// data-layer parts of BP-14, BP-16, F-3 and F-4. Runs against every adapter.
// Written before the implementation, so the new DataStore methods are described by the local types below.
//
// Conventions the tests assume (the plan leaves them open):
//   - `moduleFeedback.submit(ctx, input)` is for staff (their own feedback); siteId is the person's primary site,
//     moduleVersion is the module's current version, status 'new', createdAt = ctx.now. Anonymous items store no
//     personId and nothing that names the user, and the write touches only the moduleFeedback store (no audit event,
//     no notification), because an audit actorId would be a user id.
//   - `list(ctx, filter?)`, `get`, `reply`, `setStatus`, `escalate`: client actors; list and get need
//     moduleFeedback.view and are limited to the actor's read scope by siteId; reply, setStatus and escalate also need
//     moduleFeedback.respond (Priya and Site Managers have it, the Supervisor Daniel does not). Staff have no list.
//   - `reply(ctx, id, text)` sets `reply: { byUserId, text, at }` and notifies the person's staff user with
//     kind 'feedbackReply'. The audit event never holds the reply text. `setStatus(ctx, id, status)`.
//     `escalate(ctx, id, note)` sets `escalatedToProvider: { by, note, at }`.
//   - `providerView(ctx)` is `feedback.read` and returns the domain ProviderFeedbackProjection.
//   - `appFeedback.submit(ctx, { kind, rating?, text, context })` for staff and client actors; `providerList(ctx,
//     filter?)` for `feedback.read` (filter `{ status? }`). There is no client-side list, get or put.
//   - `tickets.raise(ctx, input)` creates the Ticket (number from a store-wide sequence, first ticket T-1001, status
//     'received', priority from impact, siteId from the person, raiserSide from ctx.side) and a first customer
//     message holding the description and the screenshots. `context` is stored exactly as given. `attachmentIds` are
//     ticketScreenshot files the actor uploaded (at most 5).
//   - `tickets.list(ctx, { organisation?: boolean })`: own tickets, or with `organisation: true` (needs
//     support.viewOrgTickets) admin tickets of the client plus staff tickets shared with the manager.
//     `get`, `messages`: the raiser, and organisation readers for admin or shared tickets; everyone else NotFound.
//     `messages` leaves out internal provider notes. `reply(ctx, id, { body, attachmentIds? })` is by the raiser.
//     `resolve`, `reopen` (resolved only), `rate(ctx, id, 'up' | 'down')` (resolved only) are by the raiser.
//   - `faqs.vote(ctx, faqId, helpful)` keeps one vote per user and FAQ (a second vote replaces it). `myVotes(ctx)`
//     returns the actor's own FaqVote records. Staff may vote on staff FAQs ('staff-...') only.
//   - New RuleNames: invalidFeedback, invalidTicket, invalidReply.
//   - Notification kinds: feedbackReply.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  type AppFeedback,
  type AuditEvent,
  type Client,
  type FaqVote,
  type FileAttachment,
  type Module,
  type ModuleFeedback,
  type Notification,
  type ProviderFeedbackProjection,
  type Ticket,
  type TicketMessage,
  type UserAccount,
} from '@sta/domain';
import { faqs } from '@sta/content';
import {
  DataError,
  ForbiddenError,
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

export type FeedbackInput = {
  moduleId: string;
  kind: ModuleFeedback['kind'];
  lessonId?: string;
  questionId?: string;
  rating?: number;
  thumb?: 'up' | 'down';
  tags: string[];
  text?: string;
  anonymous: boolean;
};
export type TicketRaiseInput = {
  title: string;
  description: string;
  impact: Ticket['impact'];
  featureId?: string;
  featureOtherText?: string;
  issueTypeId?: string;
  issueTypeOtherText?: string;
  sharedWithManager?: boolean;
  context: Record<string, string>;
  attachmentIds?: string[];
};
export type FeedbackTicketsStore = {
  attachments: {
    upload(
      ctx: ActorContext,
      input: { purpose: 'ticketScreenshot'; title: string; mime: string; data: Uint8Array; alt?: string },
    ): Promise<FileAttachment>;
  };
  moduleFeedback: {
    submit(ctx: ActorContext, input: FeedbackInput): Promise<ModuleFeedback>;
    list(
      ctx: ActorContext,
      filter?: { moduleId?: string; status?: ModuleFeedback['status']; kind?: ModuleFeedback['kind'] },
    ): Promise<ModuleFeedback[]>;
    get(ctx: ActorContext, id: string): Promise<ModuleFeedback>;
    reply(ctx: ActorContext, id: string, text: string): Promise<ModuleFeedback>;
    setStatus(ctx: ActorContext, id: string, status: ModuleFeedback['status']): Promise<ModuleFeedback>;
    escalate(ctx: ActorContext, id: string, note: string): Promise<ModuleFeedback>;
    providerView(ctx: ActorContext): Promise<ProviderFeedbackProjection>;
  };
  appFeedback: {
    submit(
      ctx: ActorContext,
      input: { kind: AppFeedback['kind']; rating?: number; text: string; context: Record<string, string> },
    ): Promise<AppFeedback>;
    providerList(ctx: ActorContext, filter?: { status?: AppFeedback['status'] }): Promise<AppFeedback[]>;
  };
  tickets: {
    raise(ctx: ActorContext, input: TicketRaiseInput): Promise<Ticket>;
    list(ctx: ActorContext, filter?: { organisation?: boolean }): Promise<Ticket[]>;
    get(ctx: ActorContext, id: string): Promise<Ticket>;
    messages(ctx: ActorContext, id: string): Promise<TicketMessage[]>;
    reply(ctx: ActorContext, id: string, input: { body: string; attachmentIds?: string[] }): Promise<TicketMessage>;
    resolve(ctx: ActorContext, id: string): Promise<Ticket>;
    reopen(ctx: ActorContext, id: string): Promise<Ticket>;
    rate(ctx: ActorContext, id: string, rating: 'up' | 'down'): Promise<Ticket>;
  };
  faqs: {
    vote(ctx: ActorContext, faqId: string, helpful: boolean): Promise<FaqVote>;
    myVotes(ctx: ActorContext): Promise<FaqVote[]>;
  };
};

// ---------------------------------------------------------------- helpers

const client = (userId: string, clientId: string): ActorContext => ({ userId, side: 'client', clientId, now: TODAY });
const staff = (userId: string, clientId: string): ActorContext => ({ userId, side: 'staff', clientId, now: TODAY });
const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const pngChunk = (type: string, body: number[] = []): number[] => [
  ...be32(body.length),
  ...ascii(type),
  ...body,
  0,
  0,
  0,
  0,
];
/** A tiny PNG without metadata chunks. */
const png = (): Uint8Array<ArrayBuffer> =>
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
    ...pngChunk('IEND'),
  ]);

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
/** Every object key found anywhere in a value. */
function keysDeep(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, into));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      keysDeep(v, into);
    }
  }
  return into;
}

export function runFeedbackTicketsContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const options: StoreOptions = { clock: fixedClock(TODAY), rng: createRng(7) };
    const handle = await makeStore(options);
    const fx: World = await buildWorld(handle.admin);
    const lf: LearningFixture = await addLearningFixture(handle.admin, fx);
    const admin = handle.admin;
    const store = handle.store as unknown as FeedbackTicketsStore;
    const a = fx.ids.clients.a;
    const ot = fx.ids.clients.ot;

    // A module the client wrote itself, to prove the provider only gets counts for it.
    const ownModule: Module = {
      ...lf.module,
      id: freshId(5000),
      owner: { clientId: a },
      title: 'Our own module',
      version: 1,
    };
    await admin.bulkPut('modules', [ownModule]);

    const actors = {
      priya: client(fx.ids.users.priya, a),
      daniel: client(fx.ids.users.daniel, a),
      tim: client(fx.ids.users.tim, a),
      rory: client(fx.ids.users.rory, a),
      jade: staff(fx.ids.users.jade, a),
      ben: staff(fx.ids.users.ben, a),
      beth: client(fx.ids.users.beth, fx.ids.clients.b),
      bob: staff(fx.ids.users.bob, fx.ids.clients.b),
      riverMgr: client(fx.ids.users.riverMgr, ot),
      prov: provider(fx.ids.users.provOwner),
      support: provider(fx.ids.users.support),
    };
    const jadePerson = fx.ids.people.jade;
    const fb = (n: number, over: Partial<ModuleFeedback> = {}): ModuleFeedback =>
      Object.fromEntries(
        Object.entries({
          id: freshId(5100 + n),
          clientId: a,
          siteId: fx.ids.sites.main,
          personId: jadePerson,
          anonymous: false,
          moduleId: lf.moduleId,
          moduleVersion: 2,
          kind: 'moduleCard',
          rating: 4,
          tags: ['clear'],
          text: 'Helpful module',
          status: 'new',
          createdAt: TODAY,
          ...over,
        }).filter(([, v]) => v !== undefined),
      ) as ModuleFeedback;
    const seedFeedback = (records: ModuleFeedback[]): Promise<void> => admin.bulkPut('moduleFeedback', records);

    const notificationsOf = async (userId: string): Promise<Notification[]> =>
      (await dump<Notification>(admin, 'notifications')).filter((n) => n.userId === userId);
    const auditOf = async (action?: string): Promise<AuditEvent[]> =>
      (await dump<AuditEvent>(admin, 'audit')).filter((e) => action === undefined || e.action === action);
    const shot = async (ctx: ActorContext): Promise<string> =>
      (
        await store.attachments.upload(ctx, {
          purpose: 'ticketScreenshot',
          title: 'Screenshot',
          mime: 'image/png',
          data: png(),
          alt: 'A screenshot',
        })
      ).id;
    const ticketInput = (over: Partial<TicketRaiseInput> = {}): TicketRaiseInput => ({
      title: 'The quiz will not open',
      description: 'I tap Start and nothing happens.',
      impact: 'blocked',
      featureId: 'quizzes',
      issueTypeId: 'notWorking',
      context: { route: '#/staff/learn', side: 'staff', appVersion: '0.3.0', browser: 'Chrome' },
      ...over,
    });
    const setSettings = async (clientId: string, patch: Partial<Client['settings']>): Promise<void> => {
      const c = (await dump<Client>(admin, 'clients')).find((x) => x.id === clientId)!;
      await admin.bulkPut('clients', [{ ...c, settings: { ...c.settings, ...patch } }]);
    };
    return {
      ...handle,
      store,
      admin,
      fx,
      lf,
      ownModule,
      actors,
      jadePerson,
      fb,
      seedFeedback,
      notificationsOf,
      auditOf,
      shot,
      ticketInput,
      setSettings,
    };
  }
  type S = Awaited<ReturnType<typeof setup>>;

  describe(`M3 feedback, tickets and FAQs (data D): ${name}`, () => {
    // ------------------------------------------------------------ module feedback (BP-14)
    describe('module feedback: submit', () => {
      it('stores named feedback with the person, site, module and version', async () => {
        const s = await setup();
        const item = await s.store.moduleFeedback.submit(s.actors.jade, {
          moduleId: s.lf.moduleId,
          kind: 'moduleCard',
          rating: 5,
          tags: ['reallyUseful', 'clear'],
          text: 'Short and clear',
          anonymous: false,
        });
        expect(item).toMatchObject({
          clientId: s.fx.ids.clients.a,
          siteId: s.fx.ids.sites.main,
          personId: s.jadePerson,
          anonymous: false,
          moduleId: s.lf.moduleId,
          moduleVersion: 2,
          kind: 'moduleCard',
          rating: 5,
          tags: ['reallyUseful', 'clear'],
          text: 'Short and clear',
          status: 'new',
          createdAt: TODAY,
        });
        expect((await dump<ModuleFeedback>(s.admin, 'moduleFeedback')).map((f) => f.id)).toEqual([item.id]);
      });

      it('stores anonymous feedback with no person and no user id anywhere, and touches nothing else', async () => {
        const s = await setup();
        const before = await s.admin.dumpAll();
        const item = await s.store.moduleFeedback.submit(s.actors.jade, {
          moduleId: s.lf.moduleId,
          kind: 'moduleCard',
          rating: 2,
          tags: ['unclear'],
          text: 'Confusing in places',
          anonymous: true,
        });
        expect(item.anonymous).toBe(true);
        expect('personId' in item).toBe(false);
        const after = await s.admin.dumpAll();
        expect(changedStores(before, after)).toEqual(['moduleFeedback']);
        const stored = (await dump<ModuleFeedback>(s.admin, 'moduleFeedback'))[0]!;
        const text = JSON.stringify(stored);
        expect(text).not.toContain(s.jadePerson);
        expect(text).not.toContain(s.fx.ids.users.jade);
        expect(text).not.toContain('Jade');
        expect(stored).toMatchObject({ clientId: s.fx.ids.clients.a, siteId: s.fx.ids.sites.main });
      });

      it('takes a lesson thumb and a question report with their targets', async () => {
        const s = await setup();
        const thumb = await s.store.moduleFeedback.submit(s.actors.jade, {
          moduleId: s.lf.moduleId,
          kind: 'lessonThumb',
          lessonId: 'l-two',
          thumb: 'down',
          tags: ['unclear'],
          anonymous: false,
        });
        expect(thumb).toMatchObject({ kind: 'lessonThumb', lessonId: 'l-two', thumb: 'down' });
        const report = await s.store.moduleFeedback.submit(s.actors.jade, {
          moduleId: s.lf.moduleId,
          kind: 'questionReport',
          questionId: 'q3',
          tags: ['mistakeInQuestion'],
          text: 'The second answer is also right.',
          anonymous: false,
        });
        expect(report).toMatchObject({ kind: 'questionReport', questionId: 'q3' });
      });

      it('refuses ratings, text, tags and targets that are not valid', async () => {
        const s = await setup();
        const base: FeedbackInput = {
          moduleId: s.lf.moduleId,
          kind: 'moduleCard',
          rating: 3,
          tags: [],
          anonymous: false,
        };
        const bad: [string, FeedbackInput][] = [
          ['rating 0', { ...base, rating: 0 }],
          ['rating 6', { ...base, rating: 6 }],
          ['text over 500', { ...base, text: 'x'.repeat(501) }],
          ['unknown tag', { ...base, tags: ['notATag'] }],
          ['thumb without lesson', { ...base, kind: 'lessonThumb', thumb: 'up' }],
          [
            'thumb for a lesson that is not in the module',
            { ...base, kind: 'lessonThumb', lessonId: 'nope', thumb: 'up' },
          ],
          ['report without question', { ...base, kind: 'questionReport' }],
          ['report for a question that is not in the module', { ...base, kind: 'questionReport', questionId: 'nope' }],
        ];
        for (const [label, input] of bad) {
          expect(await ruleOf(s.store.moduleFeedback.submit(s.actors.jade, input)), label).toBe('invalidFeedback');
        }
        expect(await dump(s.admin, 'moduleFeedback')).toHaveLength(0);
      });

      it('refuses a module that does not exist and the provider', async () => {
        const s = await setup();
        await notFound(
          s.store.moduleFeedback.submit(s.actors.jade, {
            moduleId: freshId(5999),
            kind: 'moduleCard',
            rating: 3,
            tags: [],
            anonymous: false,
          }),
        );
        expect(
          await reasonOf(
            s.store.moduleFeedback.submit(s.actors.prov, {
              moduleId: s.lf.moduleId,
              kind: 'moduleCard',
              rating: 3,
              tags: [],
              anonymous: false,
            }),
          ),
        ).toBe('permission');
      });
    });

    describe('module feedback: list and get', () => {
      async function seeded() {
        const s = await setup();
        const main = s.fb(1);
        const annexe = s.fb(2, { siteId: s.fx.ids.sites.annexe, personId: s.fx.ids.people.mia });
        const anon = s.fb(3, { anonymous: true, tags: ['unclear'], kind: 'moduleCard' });
        delete (anon as { personId?: string }).personId;
        const report = s.fb(4, {
          kind: 'questionReport',
          questionId: 'q3',
          tags: ['mistakeInQuestion'],
          rating: undefined,
        });
        const done = s.fb(5, { status: 'actioned' });
        await s.seedFeedback([main, annexe, anon, report, done]);
        return { s, main, annexe, anon, report, done };
      }

      it('shows an organisation admin every item of their client', async () => {
        const { s, main, annexe, anon, report, done } = await seeded();
        expect(ids(await s.store.moduleFeedback.list(s.actors.priya))).toEqual(ids([main, annexe, anon, report, done]));
      });

      it('limits a Supervisor to the sites in their scope, for list and get', async () => {
        const { s, annexe, main } = await seeded();
        const list = await s.store.moduleFeedback.list(s.actors.daniel);
        expect(ids(list)).not.toContain(annexe.id);
        expect(ids(list)).toContain(main.id);
        await notFound(s.store.moduleFeedback.get(s.actors.daniel, annexe.id));
        expect((await s.store.moduleFeedback.get(s.actors.daniel, main.id)).id).toBe(main.id);
      });

      it('filters by module, status and kind', async () => {
        const { s, main, anon, report, done } = await seeded();
        expect(ids(await s.store.moduleFeedback.list(s.actors.priya, { status: 'actioned' }))).toEqual([done.id]);
        expect(ids(await s.store.moduleFeedback.list(s.actors.priya, { kind: 'questionReport' }))).toEqual([report.id]);
        expect(ids(await s.store.moduleFeedback.list(s.actors.priya, { moduleId: s.ownModule.id }))).toEqual([]);
        expect(ids(await s.store.moduleFeedback.list(s.actors.priya, { moduleId: s.lf.moduleId }))).toContain(main.id);
        expect(ids(await s.store.moduleFeedback.list(s.actors.priya))).toContain(anon.id);
      });

      it('never shows a name or user id on anonymous items', async () => {
        const { s, anon } = await seeded();
        const got = await s.store.moduleFeedback.get(s.actors.priya, anon.id);
        expect('personId' in got).toBe(false);
        const listed = (await s.store.moduleFeedback.list(s.actors.priya)).find((f) => f.id === anon.id)!;
        for (const item of [got, listed]) {
          const text = JSON.stringify(item);
          expect(text).not.toContain(s.jadePerson);
          expect(text).not.toContain(s.fx.ids.users.jade);
        }
      });

      it('refuses staff, the provider and other clients, and shows another client nothing', async () => {
        const { s, main } = await seeded();
        expect(await reasonOf(s.store.moduleFeedback.list(s.actors.jade))).toBe('permission');
        expect(await reasonOf(s.store.moduleFeedback.list(s.actors.prov))).toBe('permission');
        expect(await s.store.moduleFeedback.list(s.actors.beth)).toEqual([]);
        await notFound(s.store.moduleFeedback.get(s.actors.beth, main.id));
        await notFound(s.store.moduleFeedback.get(s.actors.jade, main.id));
        await notFound(s.store.moduleFeedback.get(s.actors.prov, main.id));
      });

      it('limits a Site Manager at another client to their own site', async () => {
        const s = await setup();
        const ot = s.fx.ids.clients.ot;
        const river = s.fb(10, { clientId: ot, siteId: s.fx.ids.sites.river, personId: s.fx.ids.people.otRiver });
        const meadow = s.fb(11, { clientId: ot, siteId: s.fx.ids.sites.meadow, personId: s.fx.ids.people.otMeadow });
        await s.seedFeedback([river, meadow]);
        expect(ids(await s.store.moduleFeedback.list(s.actors.riverMgr))).toEqual([river.id]);
        await notFound(s.store.moduleFeedback.get(s.actors.riverMgr, meadow.id));
      });
    });

    describe('module feedback: reply, status and escalation', () => {
      it('records a reply, notifies the person and keeps the reply text out of the audit log', async () => {
        const s = await setup();
        const item = s.fb(1);
        await s.seedFeedback([item]);
        const done = await s.store.moduleFeedback.reply(s.actors.priya, item.id, 'Thanks, we have fixed the wording.');
        expect(done.reply).toEqual({
          byUserId: s.fx.ids.users.priya,
          text: 'Thanks, we have fixed the wording.',
          at: TODAY,
        });
        const notes = (await s.notificationsOf(s.fx.ids.users.jade)).filter((n) => n.kind === 'feedbackReply');
        expect(notes).toHaveLength(1);
        expect(notes[0]!.clientId).toBe(s.fx.ids.clients.a);
        expect(await s.notificationsOf(s.fx.ids.users.priya)).toHaveLength(0);
        const audit = await s.auditOf();
        expect(audit.length).toBeGreaterThan(0);
        expect(JSON.stringify(audit)).not.toContain('fixed the wording');
        expect(JSON.stringify(audit)).not.toContain('Helpful module');
      });

      it('refuses a reply to anonymous feedback and sends nothing', async () => {
        const s = await setup();
        const anon = s.fb(1, { anonymous: true });
        delete (anon as { personId?: string }).personId;
        await s.seedFeedback([anon]);
        const before = await s.admin.dumpAll();
        expect(await ruleOf(s.store.moduleFeedback.reply(s.actors.priya, anon.id, 'Hello'))).toBe('anonymousNoReply');
        expect(changedStores(before, await s.admin.dumpAll())).toEqual([]);
      });

      it('refuses an empty reply, a role without moduleFeedback.respond, staff and other clients', async () => {
        const s = await setup();
        const item = s.fb(1);
        await s.seedFeedback([item]);
        expect(await ruleOf(s.store.moduleFeedback.reply(s.actors.priya, item.id, '   '))).toBe('invalidReply');
        expect(await reasonOf(s.store.moduleFeedback.reply(s.actors.daniel, item.id, 'Thanks'))).toBe('permission');
        expect(await reasonOf(s.store.moduleFeedback.reply(s.actors.jade, item.id, 'Thanks'))).toBe('permission');
        await notFound(s.store.moduleFeedback.reply(s.actors.beth, item.id, 'Thanks'));
        expect((await dump<ModuleFeedback>(s.admin, 'moduleFeedback'))[0]!.reply).toBeUndefined();
      });

      it('sets the status for people who may respond, audits it and refuses others', async () => {
        const s = await setup();
        const item = s.fb(1);
        await s.seedFeedback([item]);
        const done = await s.store.moduleFeedback.setStatus(s.actors.priya, item.id, 'actioned');
        expect(done.status).toBe('actioned');
        expect(await s.auditOf('moduleFeedback.setStatus')).toHaveLength(1);
        expect(
          await ruleOf(s.store.moduleFeedback.setStatus(s.actors.priya, item.id, 'bogus' as ModuleFeedback['status'])),
        ).toBe('invalidFeedback');
        expect(await reasonOf(s.store.moduleFeedback.setStatus(s.actors.daniel, item.id, 'reviewed'))).toBe(
          'permission',
        );
        expect((await s.store.moduleFeedback.get(s.actors.priya, item.id)).status).toBe('actioned');
      });

      it('escalates an item, including an anonymous one, to the provider with a note', async () => {
        const s = await setup();
        const named = s.fb(1);
        const anon = s.fb(2, { anonymous: true });
        delete (anon as { personId?: string }).personId;
        await s.seedFeedback([named, anon]);
        for (const item of [named, anon]) {
          const done = await s.store.moduleFeedback.escalate(s.actors.priya, item.id, 'Please check question 3.');
          expect(done.escalatedToProvider).toEqual({
            by: s.fx.ids.users.priya,
            note: 'Please check question 3.',
            at: TODAY,
          });
        }
        expect(await s.auditOf('moduleFeedback.escalate')).toHaveLength(2);
        expect(await reasonOf(s.store.moduleFeedback.escalate(s.actors.daniel, named.id, 'Hello'))).toBe('permission');
        expect(await reasonOf(s.store.moduleFeedback.escalate(s.actors.jade, named.id, 'Hello'))).toBe('permission');
      });
    });

    describe('module feedback: provider view', () => {
      async function seeded() {
        const s = await setup();
        const card = s.fb(1, {
          text: 'Named comment from Jade',
          reply: { byUserId: s.fx.ids.users.priya, text: 'Private reply text', at: TODAY },
        });
        const report = s.fb(2, {
          kind: 'questionReport',
          questionId: 'q3',
          tags: ['mistakeInQuestion'],
          rating: undefined,
          text: 'Wrong answer marked',
          escalatedToProvider: { by: s.fx.ids.users.priya, note: 'Private escalation note', at: TODAY },
          createdAt: '2026-10-10T09:00:00.000Z',
        });
        const anon = s.fb(3, { anonymous: true, tags: ['unclear'], rating: 2 });
        delete (anon as { personId?: string }).personId;
        const own1 = s.fb(4, { moduleId: s.ownModule.id, moduleVersion: 1, text: 'secret own-module comment' });
        const own2 = s.fb(5, { moduleId: s.ownModule.id, moduleVersion: 1, text: 'another own-module comment' });
        await s.seedFeedback([card, report, anon, own1, own2]);
        return { s, card, report, anon };
      }

      it('groups provider-module items per module with question reports first', async () => {
        const { s, report } = await seeded();
        const view = await s.store.moduleFeedback.providerView(s.actors.prov);
        expect(view.modules.map((m) => m.moduleId)).toEqual([s.lf.moduleId]);
        const mod = view.modules[0]!;
        expect(mod.itemCount).toBe(3);
        expect(mod.items[0]!.id).toBe(report.id);
        expect(mod.items[0]!.kind).toBe('questionReport');
      });

      it('holds no person, site, client, name or reply anywhere in what the provider reads', async () => {
        const { s } = await seeded();
        for (const prov of [s.actors.prov, s.actors.support]) {
          const view = await s.store.moduleFeedback.providerView(prov);
          const keys = keysDeep(view.modules);
          for (const banned of [
            'personId',
            'siteId',
            'clientId',
            'userId',
            'reply',
            'escalatedToProvider',
            'anonymous',
          ]) {
            expect(keys.has(banned), banned).toBe(false);
          }
          const text = JSON.stringify(view);
          for (const secret of [
            s.jadePerson,
            s.fx.ids.users.jade,
            s.fx.ids.users.priya,
            s.fx.ids.sites.main,
            'Jade',
            'Private reply text',
            'Private escalation note',
          ]) {
            expect(text, secret).not.toContain(secret);
          }
        }
      });

      it('gives the provider only counts for a client-own module', async () => {
        const { s } = await seeded();
        const view = await s.store.moduleFeedback.providerView(s.actors.prov);
        expect(view.ownModules).toEqual([{ clientId: s.fx.ids.clients.a, moduleCount: 1, itemCount: 2 }]);
        const text = JSON.stringify(view);
        expect(text).not.toContain('own-module comment');
        expect(text).not.toContain(s.ownModule.id);
      });

      it('is refused to client admins and staff', async () => {
        const { s } = await seeded();
        for (const ctx of [s.actors.priya, s.actors.daniel, s.actors.beth, s.actors.jade]) {
          expect(await reasonOf(s.store.moduleFeedback.providerView(ctx))).toBe('permission');
        }
      });
    });

    // ------------------------------------------------------------ app feedback (BP-14)
    describe('app feedback', () => {
      it('stores feedback from staff and from admins with who, where and what was on screen', async () => {
        const s = await setup();
        const fromStaff = await s.store.appFeedback.submit(s.actors.jade, {
          kind: 'idea',
          rating: 4,
          text: 'A dark mode shortcut would help.',
          context: { route: '#/staff/me' },
        });
        expect(fromStaff).toMatchObject({
          userId: s.fx.ids.users.jade,
          clientId: s.fx.ids.clients.a,
          side: 'staff',
          kind: 'idea',
          rating: 4,
          status: 'new',
          context: { route: '#/staff/me' },
          createdAt: TODAY,
        });
        const fromAdmin = await s.store.appFeedback.submit(s.actors.priya, {
          kind: 'praise',
          text: 'Lovely.',
          context: {},
        });
        expect(fromAdmin).toMatchObject({ userId: s.fx.ids.users.priya, side: 'client' });
        expect(await dump(s.admin, 'appFeedback')).toHaveLength(2);
      });

      it('refuses empty text, a rating outside 1 to 5 and a kind that does not exist', async () => {
        const s = await setup();
        const bad = [
          { kind: 'idea', text: '', context: {} },
          { kind: 'idea', text: 'Ok', rating: 6, context: {} },
          { kind: 'rant', text: 'Ok', context: {} },
        ] as const;
        for (const input of bad) {
          expect(
            await ruleOf(
              s.store.appFeedback.submit(
                s.actors.jade,
                input as unknown as Parameters<FeedbackTicketsStore['appFeedback']['submit']>[1],
              ),
            ),
          ).toBe('invalidFeedback');
        }
        expect(await dump(s.admin, 'appFeedback')).toHaveLength(0);
      });

      it('is readable only by the provider, never by any client actor', async () => {
        const s = await setup();
        await s.store.appFeedback.submit(s.actors.jade, { kind: 'problem', text: 'Slow.', context: {} });
        await s.store.appFeedback.submit(s.actors.beth, { kind: 'idea', text: 'More charts.', context: {} });
        const all = await s.store.appFeedback.providerList(s.actors.prov);
        expect(all).toHaveLength(2);
        expect(await s.store.appFeedback.providerList(s.actors.prov, { status: 'done' })).toEqual([]);
        for (const ctx of [
          s.actors.priya,
          s.actors.daniel,
          s.actors.tim,
          s.actors.beth,
          s.actors.jade,
          s.actors.riverMgr,
        ]) {
          expect(await reasonOf(s.store.appFeedback.providerList(ctx))).toBe('permission');
        }
        const repo = s.store.appFeedback as unknown as Record<string, unknown>;
        for (const op of ['list', 'get', 'put', 'remove']) expect(repo[op], op).toBeUndefined();
      });
    });

    // ------------------------------------------------------------ tickets (BP-16, F-3)
    describe('tickets: raise', () => {
      it('creates T-1001 for the first ticket with priority from the impact, the context as given and a first message', async () => {
        const s = await setup();
        const file = await s.shot(s.actors.jade);
        const input = s.ticketInput({ attachmentIds: [file] });
        const t = await s.store.tickets.raise(s.actors.jade, input);
        expect(t).toMatchObject({
          number: 'T-1001',
          clientId: s.fx.ids.clients.a,
          siteId: s.fx.ids.sites.main,
          raisedBy: s.fx.ids.users.jade,
          raiserSide: 'staff',
          sharedWithManager: false,
          title: 'The quiz will not open',
          description: 'I tap Start and nothing happens.',
          impact: 'blocked',
          priority: 'high',
          status: 'received',
          featureId: 'quizzes',
          issueTypeId: 'notWorking',
          linkedErrorIds: [],
          createdAt: TODAY,
          updatedAt: TODAY,
        });
        expect(t.context).toEqual(input.context);
        const messages = await s.store.tickets.messages(s.actors.jade, t.id);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
          side: 'customer',
          body: 'I tap Start and nothing happens.',
          internal: false,
          authorId: s.fx.ids.users.jade,
          attachmentIds: [file],
        });
      });

      it('stores only the context the app kept, so a removed item is never stored', async () => {
        const s = await setup();
        const full = s.ticketInput();
        const kept: Record<string, string> = { ...full.context };
        delete kept['route'];
        const t = await s.store.tickets.raise(s.actors.jade, { ...full, context: kept });
        expect(t.context).toEqual(kept);
        expect('route' in t.context).toBe(false);
        expect(JSON.stringify(await dump(s.admin, 'tickets'))).not.toContain('#/staff/learn');
      });

      it('numbers tickets T-1001, T-1002, T-1003 in order across clients', async () => {
        const s = await setup();
        const one = await s.store.tickets.raise(s.actors.jade, s.ticketInput());
        const two = await s.store.tickets.raise(s.actors.priya, s.ticketInput({ context: {} }));
        const three = await s.store.tickets.raise(s.actors.beth, s.ticketInput({ context: {} }));
        expect([one.number, two.number, three.number]).toEqual(['T-1001', 'T-1002', 'T-1003']);
        expect(two.raiserSide).toBe('client');
      });

      it('sets priority from impact: workaround normal, question low', async () => {
        const s = await setup();
        expect((await s.store.tickets.raise(s.actors.jade, s.ticketInput({ impact: 'workaround' }))).priority).toBe(
          'normal',
        );
        expect((await s.store.tickets.raise(s.actors.jade, s.ticketInput({ impact: 'question' }))).priority).toBe(
          'low',
        );
      });

      it('applies the length rules for title, description and Other entries', async () => {
        const s = await setup();
        const bad: [string, Partial<TicketRaiseInput>][] = [
          ['short title', { title: 'ab' }],
          ['long title', { title: 'x'.repeat(101) }],
          ['empty description', { description: '  ' }],
          ['long description', { description: 'x'.repeat(2001) }],
          ['feature Other too short', { featureId: 'other', featureOtherText: 'ab' }],
          ['feature Other too long', { featureId: 'other', featureOtherText: 'x'.repeat(81) }],
          ['issue Other missing', { issueTypeId: 'other' }],
        ];
        for (const [label, over] of bad) {
          expect(await ruleOf(s.store.tickets.raise(s.actors.jade, s.ticketInput(over))), label).toBe('invalidTicket');
        }
        const ok = await s.store.tickets.raise(
          s.actors.jade,
          s.ticketInput({ featureId: 'other', featureOtherText: 'Sticker chart' }),
        );
        expect(ok.featureOtherText).toBe('Sticker chart');
        expect(await dump(s.admin, 'tickets')).toHaveLength(1);
      });

      it('takes up to 5 screenshots and refuses 6, or a file that is not the raiser own screenshot', async () => {
        const s = await setup();
        const five = await Promise.all([1, 2, 3, 4, 5].map(() => s.shot(s.actors.jade)));
        const t = await s.store.tickets.raise(s.actors.jade, s.ticketInput({ attachmentIds: five }));
        expect((await s.store.tickets.messages(s.actors.jade, t.id))[0]!.attachmentIds).toEqual(five);
        const six = [...five, await s.shot(s.actors.jade)];
        expect(await ruleOf(s.store.tickets.raise(s.actors.jade, s.ticketInput({ attachmentIds: six })))).toBe(
          'tooMany',
        );
        const benFile = await s.shot(s.actors.ben);
        const error = await refusal(s.store.tickets.raise(s.actors.jade, s.ticketInput({ attachmentIds: [benFile] })));
        expect(error).toBeInstanceOf(DataError);
        expect(await dump(s.admin, 'tickets')).toHaveLength(1);
      });

      it('refuses staff tickets when the client has switched them off, but not admin tickets', async () => {
        const s = await setup();
        await s.setSettings(s.fx.ids.clients.a, { allowStaffTickets: false });
        expect(await ruleOf(s.store.tickets.raise(s.actors.jade, s.ticketInput()))).toBe('staffTicketsOff');
        expect(await dump(s.admin, 'tickets')).toHaveLength(0);
        const admin = await s.store.tickets.raise(s.actors.priya, s.ticketInput({ context: {} }));
        expect(admin.raiserSide).toBe('client');
        // Another client keeps its own setting.
        expect((await s.store.tickets.raise(s.actors.bob, s.ticketInput({ context: {} }))).raiserSide).toBe('staff');
      });

      it('keeps the audit log free of ticket text', async () => {
        const s = await setup();
        await s.store.tickets.raise(s.actors.jade, s.ticketInput({ title: 'Distinctive title words' }));
        const text = JSON.stringify(await dump(s.admin, 'audit'));
        expect(text).not.toContain('Distinctive title words');
        expect(text).not.toContain('Start and nothing happens');
      });

      it('refuses the provider raising a ticket', async () => {
        const s = await setup();
        expect(await reasonOf(s.store.tickets.raise(s.actors.prov, s.ticketInput()))).toBe('permission');
      });
    });

    describe('tickets: who sees what', () => {
      async function three() {
        const s = await setup();
        const priv = await s.store.tickets.raise(s.actors.jade, s.ticketInput({ title: 'Jade private ticket' }));
        const shared = await s.store.tickets.raise(
          s.actors.ben,
          s.ticketInput({ title: 'Ben shared ticket', sharedWithManager: true }),
        );
        const admin = await s.store.tickets.raise(
          s.actors.priya,
          s.ticketInput({ title: 'Priya admin ticket', context: {} }),
        );
        return { s, priv, shared, admin };
      }

      it('lists a person only their own tickets', async () => {
        const { s, priv, shared, admin } = await three();
        expect(ids(await s.store.tickets.list(s.actors.jade))).toEqual([priv.id]);
        expect(ids(await s.store.tickets.list(s.actors.ben))).toEqual([shared.id]);
        expect(ids(await s.store.tickets.list(s.actors.priya))).toEqual([admin.id]);
      });

      it('keeps a private staff ticket from every manager and shows a shared one to people with support.viewOrgTickets', async () => {
        const { s, priv, shared, admin } = await three();
        for (const manager of [s.actors.priya, s.actors.tim]) {
          expect(ids(await s.store.tickets.list(manager, { organisation: true }))).toEqual(ids([shared, admin]));
          await notFound(s.store.tickets.get(manager, priv.id));
          await notFound(s.store.tickets.messages(manager, priv.id));
          expect((await s.store.tickets.get(manager, shared.id)).id).toBe(shared.id);
          expect(await s.store.tickets.messages(manager, shared.id)).toHaveLength(1);
        }
      });

      it('shows nothing of other tickets to a role without support.viewOrgTickets or to other staff', async () => {
        const { s, shared, admin } = await three();
        expect(await reasonOf(s.store.tickets.list(s.actors.daniel, { organisation: true }))).toBe('permission');
        expect(await reasonOf(s.store.tickets.list(s.actors.jade, { organisation: true }))).toBe('permission');
        for (const ctx of [s.actors.daniel, s.actors.jade]) {
          await notFound(s.store.tickets.get(ctx, admin.id));
          await notFound(s.store.tickets.get(ctx, shared.id));
        }
      });

      it('never shows a ticket to another client or to the provider', async () => {
        const { s, priv, admin } = await three();
        for (const ctx of [s.actors.beth, s.actors.bob]) {
          await notFound(s.store.tickets.get(ctx, priv.id));
          await notFound(s.store.tickets.get(ctx, admin.id));
          await notFound(s.store.tickets.messages(ctx, admin.id));
          expect(await s.store.tickets.list(ctx)).toEqual([]);
        }
        expect(await reasonOf(s.store.tickets.list(s.actors.prov))).toBe('permission');
        await notFound(s.store.tickets.get(s.actors.prov, priv.id));
      });

      it('shows the raiser a provider reply but not an internal note', async () => {
        const { s, priv } = await three();
        const base = {
          ticketId: priv.id,
          authorId: s.fx.ids.users.provOwner,
          side: 'provider' as const,
          attachmentIds: [],
        };
        await s.admin.bulkPut('ticketMessages', [
          { ...base, id: freshId(5300), body: 'We are looking into it.', internal: false, createdAt: TODAY },
          { ...base, id: freshId(5301), body: 'Internal note for the team', internal: true, createdAt: TODAY },
        ]);
        const bodies = (await s.store.tickets.messages(s.actors.jade, priv.id)).map((m) => m.body);
        expect(bodies).toContain('We are looking into it.');
        expect(bodies).not.toContain('Internal note for the team');
      });
    });

    describe('tickets: reply, resolve, reopen and rate', () => {
      it('lets the raiser reply, keeps the thread in order and applies the length rule', async () => {
        const s = await setup();
        const t = await s.store.tickets.raise(s.actors.jade, s.ticketInput());
        const file = await s.shot(s.actors.jade);
        const reply = await s.store.tickets.reply(s.actors.jade, t.id, {
          body: 'It still fails.',
          attachmentIds: [file],
        });
        expect(reply).toMatchObject({
          ticketId: t.id,
          authorId: s.fx.ids.users.jade,
          side: 'customer',
          body: 'It still fails.',
          internal: false,
          attachmentIds: [file],
          createdAt: TODAY,
        });
        expect((await s.store.tickets.messages(s.actors.jade, t.id)).map((m) => m.body)).toEqual([
          'I tap Start and nothing happens.',
          'It still fails.',
        ]);
        expect(await ruleOf(s.store.tickets.reply(s.actors.jade, t.id, { body: '' }))).toBe('invalidReply');
        expect(await ruleOf(s.store.tickets.reply(s.actors.jade, t.id, { body: 'x'.repeat(2001) }))).toBe(
          'invalidReply',
        );
      });

      it('refuses a reply from anyone who is not the raiser', async () => {
        const s = await setup();
        const t = await s.store.tickets.raise(s.actors.ben, s.ticketInput({ sharedWithManager: true }));
        await notFound(s.store.tickets.reply(s.actors.jade, t.id, { body: 'Hi' }));
        await notFound(s.store.tickets.reply(s.actors.beth, t.id, { body: 'Hi' }));
        const error = await refusal(s.store.tickets.reply(s.actors.priya, t.id, { body: 'Hi' }));
        expect(error).toBeInstanceOf(DataError);
        expect(await dump(s.admin, 'ticketMessages')).toHaveLength(1);
      });

      it('resolves, reopens and rates through the raiser, one step at a time', async () => {
        const s = await setup();
        const t = await s.store.tickets.raise(s.actors.jade, s.ticketInput());
        // Rating and reopening only make sense once it is resolved.
        expect(await refusal(s.store.tickets.rate(s.actors.jade, t.id, 'up'))).toBeInstanceOf(DataError);
        expect(await refusal(s.store.tickets.reopen(s.actors.jade, t.id))).toBeInstanceOf(DataError);

        const resolved = await s.store.tickets.resolve(s.actors.jade, t.id);
        expect(resolved).toMatchObject({ status: 'resolved', resolvedAt: TODAY });

        const rated = await s.store.tickets.rate(s.actors.jade, t.id, 'down');
        expect(rated.satisfaction).toBe('down');
        expect(await refusal(s.store.tickets.rate(s.actors.jade, t.id, 'sideways' as unknown as 'up'))).toBeInstanceOf(
          DataError,
        );

        const reopened = await s.store.tickets.reopen(s.actors.jade, t.id);
        expect(reopened.status).not.toBe('resolved');
        expect(reopened.resolvedAt).toBeUndefined();
        expect((await s.store.tickets.get(s.actors.jade, t.id)).status).toBe(reopened.status);
      });

      it('refuses resolving, reopening and rating a ticket that is not yours', async () => {
        const s = await setup();
        const t = await s.store.tickets.raise(s.actors.jade, s.ticketInput());
        await s.store.tickets.resolve(s.actors.jade, t.id);
        for (const ctx of [s.actors.ben, s.actors.beth, s.actors.priya]) {
          await refusal(s.store.tickets.rate(ctx, t.id, 'up'));
          await refusal(s.store.tickets.reopen(ctx, t.id));
        }
        await refusal(s.store.tickets.resolve(s.actors.ben, t.id));
        const stored = (await dump<Ticket>(s.admin, 'tickets'))[0]!;
        expect(stored.status).toBe('resolved');
        expect(stored.satisfaction).toBeUndefined();
      });
    });

    // ------------------------------------------------------------ FAQs (F-3)
    describe('faqs', () => {
      const staffFaq = faqs.find((f) => f.audience === 'staff')!.id;
      const clientFaq = faqs.find((f) => f.audience === 'client')!.id;

      it('records one Was this helpful vote per user and FAQ, and a second vote replaces it', async () => {
        const s = await setup();
        const first = await s.store.faqs.vote(s.actors.jade, staffFaq, true);
        expect(first).toMatchObject({ faqId: staffFaq, userId: s.fx.ids.users.jade, helpful: true });
        await s.store.faqs.vote(s.actors.jade, staffFaq, false);
        const rows = await dump<FaqVote>(s.admin, 'faqVotes');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ faqId: staffFaq, userId: s.fx.ids.users.jade, helpful: false });
      });

      it('counts different people and different FAQs separately', async () => {
        const s = await setup();
        const other = faqs.find((f) => f.audience === 'staff' && f.id !== staffFaq)!.id;
        await s.store.faqs.vote(s.actors.jade, staffFaq, true);
        await s.store.faqs.vote(s.actors.ben, staffFaq, true);
        await s.store.faqs.vote(s.actors.jade, other, false);
        expect(await dump(s.admin, 'faqVotes')).toHaveLength(3);
      });

      it('returns only the actor own votes', async () => {
        const s = await setup();
        await s.store.faqs.vote(s.actors.jade, staffFaq, true);
        await s.store.faqs.vote(s.actors.ben, staffFaq, false);
        await s.store.faqs.vote(s.actors.priya, clientFaq, true);
        const mine = await s.store.faqs.myVotes(s.actors.jade);
        expect(mine.map((v) => [v.faqId, v.userId, v.helpful])).toEqual([[staffFaq, s.fx.ids.users.jade, true]]);
        expect((await s.store.faqs.myVotes(s.actors.priya)).map((v) => v.faqId)).toEqual([clientFaq]);
        expect(await s.store.faqs.myVotes(s.actors.beth)).toEqual([]);
      });

      it('refuses an unknown FAQ, a staff vote on a client FAQ and the provider', async () => {
        const s = await setup();
        expect(await refusal(s.store.faqs.vote(s.actors.jade, 'staff-doesNotExist', true))).toBeInstanceOf(DataError);
        expect(await refusal(s.store.faqs.vote(s.actors.jade, clientFaq, true))).toBeInstanceOf(DataError);
        expect(await reasonOf(s.store.faqs.vote(s.actors.prov, staffFaq, true))).toBe('permission');
        expect(await dump(s.admin, 'faqVotes')).toHaveLength(0);
      });
    });

    // ------------------------------------------------------------ two-factor limited admins keep help
    describe('help stays open to an admin who is limited by two-step sign-in', () => {
      async function limited(): Promise<S> {
        const s = await setup();
        const user = (await dump<UserAccount>(s.admin, 'users')).find((u) => u.id === s.fx.ids.users.riverMgr)!;
        const since = new Date(Date.parse(TODAY) - 12 * 86_400_000).toISOString();
        await s.admin.bulkPut('users', [{ ...user, twoFactorRequiredSince: since }]);
        return s;
      }

      it('allows own tickets and FAQ votes but not module feedback', async () => {
        const s = await limited();
        const t = await s.store.tickets.raise(s.actors.riverMgr, s.ticketInput({ context: {} }));
        expect(ids(await s.store.tickets.list(s.actors.riverMgr))).toEqual([t.id]);
        const faq = faqs.find((f) => f.audience === 'client')!.id;
        expect((await s.store.faqs.vote(s.actors.riverMgr, faq, true)).helpful).toBe(true);
        expect((await s.store.faqs.myVotes(s.actors.riverMgr)).map((v) => v.faqId)).toEqual([faq]);
        expect(await reasonOf(s.store.moduleFeedback.list(s.actors.riverMgr))).toBe('twoFactorRequired');
      });
    });
  });
}

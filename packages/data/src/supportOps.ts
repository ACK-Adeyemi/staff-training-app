// Module feedback, app feedback, tickets and FAQ votes (M3 chunk 9, "Data D"; plan assumptions 18 and 24). Each write
// is ONE batch. The audit log holds ids, statuses and counts only: never feedback, reply or ticket text (and no audit
// event at all for anonymous feedback, because an actor id would name the person).
import { faqs, feedbackTags, issueTypes, supportFeatures } from '@sta/content';
import {
  adminConfig,
  impactPriority,
  providerProjection,
  startOfLondonDay,
  twoFactorStatus,
  ticketNumber,
  validateTicket,
  type AppFeedback,
  type Attachment,
  type FaqVote,
  type Module,
  type ModuleFeedback,
  type Notification,
  type Person,
  type Ticket,
  type TicketMessage,
  type UserAccount,
} from '@sta/domain';
import { validate, type RawBackend, type WriteOp } from './backend';
import { canSeeAttachment } from './authoringOps';
import { moduleFor, put } from './ops';
import { audit, beginCall, canAny, canReadRecord, checkAccountState, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type AppFeedbackService,
  type FaqsService,
  type ModuleFeedbackService,
  type StoreOptions,
  type TicketsService,
} from './types';

export type SupportOperations = {
  moduleFeedback: ModuleFeedbackService;
  appFeedback: AppFeedbackService;
  tickets: TicketsService;
  faqs: FaqsService;
};

const FEEDBACK_TEXT_MAX = 500;
const APP_TEXT_MAX = 2000;
const REPLY_MAX = 1000;
const TICKET_REPLY_MAX = 2000;
const MAX_SCREENSHOTS = 5;
const CONTEXT_KEYS = 20;
const CONTEXT_VALUE_MAX = 300;
const STATUSES: readonly ModuleFeedback['status'][] = ['new', 'reviewed', 'actioned', 'noAction'];
const KINDS: readonly ModuleFeedback['kind'][] = ['moduleCard', 'lessonThumb', 'questionReport'];
const APP_KINDS: readonly AppFeedback['kind'][] = ['idea', 'problem', 'praise'];
const IMPACTS: readonly Ticket['impact'][] = ['blocked', 'workaround', 'question'];
const TAG_IDS = new Set(feedbackTags.map((t) => t.id));
const FEATURE_IDS = new Set(supportFeatures.map((f) => f.id));
const ISSUE_IDS = new Set(issueTypes.map((t) => t.id));

const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number =>
  a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1;
const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** An id from the seeded stream alone, with no time component, for items that must not be linkable by time. */
const randomId = (options: StoreOptions): string =>
  Array.from({ length: 26 }, (_, i) => ID_ALPHABET[options.rng.int(0, i === 0 ? 7 : 31)]).join('');
const isLimited = (call: Call): boolean =>
  call.side === 'client' && twoFactorStatus(call.actor.user, call.actor.now).kind === 'limited';
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Context items are short plain strings; the app has already removed anything the person took off. */
function checkContext(context: unknown, fail: () => never): Record<string, string> {
  if (typeof context !== 'object' || context === null || Array.isArray(context)) return fail();
  const entries = Object.entries(context);
  if (entries.length > CONTEXT_KEYS) return fail();
  for (const [k, v] of entries) {
    if (k.length === 0 || k.length > 40 || typeof v !== 'string' || v.length > CONTEXT_VALUE_MAX) return fail();
  }
  return Object.fromEntries(entries);
}

export function createSupportOperations(backend: RawBackend, options: StoreOptions): SupportOperations {
  const apply = (ops: WriteOp[]): Promise<void> => backend.apply(ops);
  const invalidFeedback = (): never => {
    throw new RuleError('invalidFeedback');
  };
  const invalidTicket = (): never => {
    throw new RuleError('invalidTicket');
  };

  // ------------------------------------------------------------ module feedback

  /** A client actor (never staff or provider) who may see module feedback. */
  async function adminCall(ctx: ActorContext): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'client' || !holds(call, ['moduleFeedback.view'])) return forbid('permission');
    return call;
  }

  const inScope = (call: Call, f: ModuleFeedback): boolean =>
    f.clientId === call.clientId &&
    canAny(
      call,
      ['moduleFeedback.view'],
      { clientId: f.clientId, siteIds: f.siteId === undefined ? [] : [f.siteId] },
      'read',
    );

  async function visibleFeedback(call: Call, id: string): Promise<ModuleFeedback> {
    const f = await call.find<ModuleFeedback>('moduleFeedback', id);
    if (!f || !inScope(call, f)) throw new NotFoundError();
    return f;
  }

  /** Looks the item up, then needs moduleFeedback.respond for its site. */
  async function respondable(ctx: ActorContext, id: string): Promise<{ call: Call; item: ModuleFeedback }> {
    const call = await beginCall(backend, options, ctx);
    // Staff and the provider have no feedback inbox at all.
    if (call.side !== 'client') return forbid('permission');
    const f = await call.find<ModuleFeedback>('moduleFeedback', id);
    if (!f || f.clientId !== call.clientId) throw new NotFoundError();
    if (!inScope(call, f)) throw new NotFoundError();
    if (
      !canAny(
        call,
        ['moduleFeedback.respond'],
        { clientId: f.clientId, siteIds: f.siteId === undefined ? [] : [f.siteId] },
        'write',
      )
    ) {
      return forbid('permission');
    }
    checkAccountState(call, false);
    return { call, item: f };
  }

  const moduleFeedback: ModuleFeedbackService = {
    async submit(ctx, input) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'staff') return forbid('permission');
      const personId = call.actor.user.personId;
      const person = personId ? await call.find<Person>('people', personId) : undefined;
      if (!person || person.clientId !== call.clientId) return forbid('permission');
      const m = await moduleFor(call, input.moduleId);
      if (!(await canReadRecord(call, 'modules', m))) throw new NotFoundError();

      if (!KINDS.includes(input.kind) || typeof input.anonymous !== 'boolean') return invalidFeedback();
      const tags = Array.isArray(input.tags) ? [...new Set(input.tags)] : invalidFeedback();
      if (tags.some((t) => !TAG_IDS.has(t))) return invalidFeedback();
      const body =
        input.text === undefined ? '' : typeof input.text === 'string' ? input.text.trim() : invalidFeedback();
      if (body.length > FEEDBACK_TEXT_MAX) return invalidFeedback();
      let rating: number | undefined;
      if (input.kind === 'moduleCard' && input.rating !== undefined) {
        if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return invalidFeedback();
        rating = input.rating;
      }
      let lessonId: string | undefined;
      let questionId: string | undefined;
      let thumb: 'up' | 'down' | undefined;
      if (input.kind === 'lessonThumb') {
        if (!m.lessons.some((l) => l.id === input.lessonId)) return invalidFeedback();
        if (input.thumb !== 'up' && input.thumb !== 'down') return invalidFeedback();
        lessonId = input.lessonId;
        thumb = input.thumb;
      }
      if (input.kind === 'questionReport') {
        if (!m.questions.some((q) => q.id === input.questionId)) return invalidFeedback();
        questionId = input.questionId;
      }

      // Anonymous items carry no person at all; the write touches this one store and nothing else.
      // They also carry nothing that links them to an attempt: a random id, the London day instead of the moment, and
      // no site when the site is small enough for a few people to be picked out.
      let siteId: string | undefined = person.primarySiteId;
      if (input.anonymous) {
        const here = (await call.all<Person>('people')).filter(
          (p) => p.clientId === person.clientId && p.primarySiteId === person.primarySiteId && p.status === 'active',
        );
        if (here.length < adminConfig.smallSiteMinimum) siteId = undefined;
      }
      const item = validate('moduleFeedback', {
        id: input.anonymous ? randomId(options) : call.newId(),
        clientId: person.clientId,
        ...(siteId !== undefined ? { siteId } : {}),
        ...(input.anonymous ? {} : { personId: person.id }),
        anonymous: input.anonymous,
        moduleId: m.id,
        moduleVersion: m.version,
        ...(lessonId !== undefined ? { lessonId } : {}),
        ...(questionId !== undefined ? { questionId } : {}),
        kind: input.kind,
        ...(rating !== undefined ? { rating } : {}),
        ...(thumb !== undefined ? { thumb } : {}),
        tags,
        ...(body !== '' ? { text: body } : {}),
        status: 'new',
        createdAt: input.anonymous ? startOfLondonDay(new Date(ctx.now)).toISOString() : ctx.now,
      }) as ModuleFeedback;
      await apply([put('moduleFeedback', item)]);
      return structuredClone(item);
    },

    async list(ctx, filter) {
      const call = await adminCall(ctx);
      const rows = (await call.all<ModuleFeedback>('moduleFeedback')).filter(
        (f) =>
          inScope(call, f) &&
          (filter?.moduleId === undefined || f.moduleId === filter.moduleId) &&
          (filter?.status === undefined || f.status === filter.status) &&
          (filter?.kind === undefined || f.kind === filter.kind),
      );
      return structuredClone(rows.sort((a, b) => byCreated(b, a)));
    },

    async get(ctx, id) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'client' || !holds(call, ['moduleFeedback.view'])) throw new NotFoundError();
      return structuredClone(await visibleFeedback(call, id));
    },

    async reply(ctx, id, body) {
      const { call, item } = await respondable(ctx, id);
      if (item.anonymous || item.personId === undefined) throw new RuleError('anonymousNoReply');
      const reply = text(body);
      if (reply === '' || reply.length > REPLY_MAX) throw new RuleError('invalidReply');
      const next: ModuleFeedback = { ...item, reply: { byUserId: call.actor.user.id, text: reply, at: ctx.now } };
      const ops: WriteOp[] = [
        put('moduleFeedback', next),
        audit(call, item.clientId, 'moduleFeedback.reply', `moduleFeedback:${id}`, undefined, { feedbackId: id }),
      ];
      const recipient = (await call.all<UserAccount>('users')).find(
        (u) =>
          u.side === 'staff' && u.clientId === item.clientId && u.personId === item.personId && u.status === 'active',
      );
      if (recipient) {
        const mod = await call.find<Module>('modules', item.moduleId);
        const note: Notification = {
          id: call.newId(),
          clientId: item.clientId,
          userId: recipient.id,
          kind: 'feedbackReply',
          params: { moduleTitle: mod?.title ?? '' },
          createdAt: ctx.now,
        };
        ops.push(put('notifications', note));
      }
      await apply(ops);
      return structuredClone(next);
    },

    async setStatus(ctx, id, status) {
      const { call, item } = await respondable(ctx, id);
      if (!STATUSES.includes(status)) return invalidFeedback();
      const next: ModuleFeedback = { ...item, status };
      await apply([
        put('moduleFeedback', next),
        audit(call, item.clientId, 'moduleFeedback.setStatus', `moduleFeedback:${id}`, undefined, {
          feedbackId: id,
          status,
        }),
      ]);
      return structuredClone(next);
    },

    async escalate(ctx, id, note) {
      const { call, item } = await respondable(ctx, id);
      const body = text(note);
      if (body === '' || body.length > FEEDBACK_TEXT_MAX) return invalidFeedback();
      const next: ModuleFeedback = {
        ...item,
        escalatedToProvider: { by: call.actor.user.id, note: body, at: ctx.now },
      };
      await apply([
        put('moduleFeedback', next),
        audit(call, item.clientId, 'moduleFeedback.escalate', `moduleFeedback:${id}`, undefined, { feedbackId: id }),
      ]);
      return structuredClone(next);
    },

    async providerView(ctx) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'provider' || !holds(call, ['feedback.read'])) return forbid('permission');
      return structuredClone(
        providerProjection(await call.all<ModuleFeedback>('moduleFeedback'), await call.all<Module>('modules')),
      );
    },
  };

  // ------------------------------------------------------------ app feedback

  const appFeedback: AppFeedbackService = {
    async submit(ctx, input) {
      const call = await beginCall(backend, options, ctx);
      if (call.side === 'provider') return forbid('permission');
      if (!APP_KINDS.includes(input.kind)) return invalidFeedback();
      const body = text(input.text);
      if (body === '' || body.length > APP_TEXT_MAX) return invalidFeedback();
      if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
        return invalidFeedback();
      }
      const context = checkContext(input.context, invalidFeedback);
      const personId = call.actor.user.personId;
      const person = personId ? await call.find<Person>('people', personId) : undefined;
      const item = validate('appFeedback', {
        id: call.newId(),
        clientId: call.clientId,
        ...(person ? { siteId: person.primarySiteId } : {}),
        userId: call.actor.user.id,
        side: call.side,
        kind: input.kind,
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        text: body,
        context,
        status: 'new',
        tags: [],
        createdAt: ctx.now,
      }) as AppFeedback;
      await apply([
        put('appFeedback', item),
        audit(call, call.clientId, 'appFeedback.submit', `appFeedback:${item.id}`, undefined, {
          feedbackId: item.id,
          kind: item.kind,
        }),
      ]);
      return structuredClone(item);
    },

    async providerList(ctx, filter) {
      const call = await beginCall(backend, options, ctx);
      if (call.side !== 'provider' || !holds(call, ['feedback.read'])) return forbid('permission');
      const rows = (await call.all<AppFeedback>('appFeedback')).filter(
        (f) => filter?.status === undefined || f.status === filter.status,
      );
      return structuredClone(rows.sort((a, b) => byCreated(b, a)));
    },
  };

  // ------------------------------------------------------------ tickets

  /** Admin tickets and staff tickets shared with the manager, for people who may see the organisation's tickets. */
  const orgReadable = (call: Call, t: Ticket): boolean =>
    call.side === 'client' &&
    t.clientId === call.clientId &&
    (t.raiserSide === 'client' || t.sharedWithManager) &&
    canAny(
      call,
      ['support.viewOrgTickets'],
      { clientId: t.clientId, ...(t.siteId !== undefined ? { siteIds: [t.siteId] } : {}) },
      'read',
    );

  async function visibleTicket(call: Call, id: string): Promise<Ticket> {
    const t = await call.find<Ticket>('tickets', id);
    if (!t || t.clientId !== call.clientId) throw new NotFoundError();
    if (t.raisedBy !== call.actor.user.id) {
      // A limited admin (two-step sign-in overdue) may use only their own tickets.
      if (isLimited(call)) return forbid('twoFactorRequired');
      if (!orgReadable(call, t)) throw new NotFoundError();
    }
    return t;
  }

  /** The raiser's own ticket. Someone who can see it but did not raise it is forbidden; anyone else gets NotFound. */
  async function ownTicket(ctx: ActorContext): Promise<Call> {
    const call = await beginCall(backend, options, ctx, { allowLimited: true });
    if (call.side === 'provider') return forbid('permission');
    return call;
  }
  /** Reading a ticket: the provider has none to read, so it gets NotFound rather than Forbidden. */
  async function readingCall(ctx: ActorContext): Promise<Call> {
    const call = await beginCall(backend, options, ctx, { allowLimited: true });
    if (call.side === 'provider') throw new NotFoundError();
    return call;
  }
  async function raisersTicket(call: Call, id: string): Promise<Ticket> {
    const t = await visibleTicket(call, id);
    if (t.raisedBy !== call.actor.user.id) return forbid('permission');
    return t;
  }

  /** Screenshots must be ticketScreenshot files the actor uploaded (up to five). */
  async function checkScreenshots(call: Call, ids: unknown): Promise<string[]> {
    if (ids === undefined) return [];
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) return invalidTicket();
    const unique = [...new Set(ids as string[])];
    if (unique.length > MAX_SCREENSHOTS) throw new RuleError('tooMany');
    for (const aid of unique) {
      const a = await call.find<Attachment>('attachments', aid);
      if (!a || !canSeeAttachment(call, a)) throw new NotFoundError();
      if (a.kind !== 'file' || a.purpose !== 'ticketScreenshot') throw new NotFoundError();
    }
    return unique;
  }

  const tickets: TicketsService = {
    async raise(ctx, input) {
      const call = await ownTicket(ctx);
      if (call.side === 'staff') {
        if (call.actor.client?.settings.allowStaffTickets === false) throw new RuleError('staffTicketsOff');
      } else if (!holds(call, ['support.raise'])) {
        return forbid('permission');
      }
      if (!IMPACTS.includes(input.impact)) return invalidTicket();
      const title = text(input.title);
      const description = text(input.description);
      if (typeof input.title !== 'string' || typeof input.description !== 'string') return invalidTicket();
      const otherFeature = input.featureId === 'other';
      const otherIssue = input.issueTypeId === 'other';
      if (input.featureId !== undefined && !otherFeature && !FEATURE_IDS.has(input.featureId)) return invalidTicket();
      if (input.issueTypeId !== undefined && !otherIssue && !ISSUE_IDS.has(input.issueTypeId)) return invalidTicket();
      const errors = validateTicket({
        title: input.title,
        description: input.description,
        ...(input.featureId !== undefined ? { featureId: input.featureId } : {}),
        ...(input.featureOtherText !== undefined ? { featureOtherText: input.featureOtherText } : {}),
        ...(input.issueTypeId !== undefined ? { issueTypeId: input.issueTypeId } : {}),
        ...(input.issueTypeOtherText !== undefined ? { issueTypeOtherText: input.issueTypeOtherText } : {}),
      });
      if (errors.length > 0) return invalidTicket();
      const context = checkContext(input.context, invalidTicket);
      const attachmentIds = await checkScreenshots(call, input.attachmentIds);

      const personId = call.actor.user.personId;
      const person = personId ? await call.find<Person>('people', personId) : undefined;
      const stored = (await backend.getAll('tickets')) as Ticket[];
      const last = stored.reduce((max, t) => Math.max(max, Number(t.number.replace(/\D/g, '')) - 1000), 0);
      const ticket = validate('tickets', {
        id: call.newId(),
        number: ticketNumber(last + 1),
        clientId: call.clientId,
        ...(person ? { siteId: person.primarySiteId } : {}),
        raisedBy: call.actor.user.id,
        raiserSide: call.side,
        sharedWithManager: call.side === 'staff' && input.sharedWithManager === true,
        ...(otherFeature
          ? { featureId: 'other', featureOtherText: text(input.featureOtherText) }
          : input.featureId !== undefined
            ? { featureId: input.featureId }
            : {}),
        ...(otherIssue
          ? { issueTypeId: 'other', issueTypeOtherText: text(input.issueTypeOtherText) }
          : input.issueTypeId !== undefined
            ? { issueTypeId: input.issueTypeId }
            : {}),
        title,
        description,
        impact: input.impact,
        priority: impactPriority(input.impact),
        status: 'received',
        tags: [],
        context,
        linkedErrorIds: [],
        createdAt: ctx.now,
        updatedAt: ctx.now,
      }) as Ticket;
      const first = validate('ticketMessages', {
        id: call.newId(),
        ticketId: ticket.id,
        authorId: call.actor.user.id,
        side: 'customer',
        body: description,
        internal: false,
        attachmentIds,
        createdAt: ctx.now,
      }) as TicketMessage;
      await apply([
        put('tickets', ticket),
        put('ticketMessages', first),
        audit(call, ticket.clientId, 'tickets.raise', `ticket:${ticket.id}`, undefined, {
          ticketId: ticket.id,
          number: ticket.number,
          attachments: attachmentIds.length,
        }),
      ]);
      return structuredClone(ticket);
    },

    async list(ctx, filter) {
      const call = await ownTicket(ctx);
      const all = await call.all<Ticket>('tickets');
      if (filter?.organisation === true) {
        if (isLimited(call)) return forbid('twoFactorRequired');
        if (call.side !== 'client' || !holds(call, ['support.viewOrgTickets'])) return forbid('permission');
        return structuredClone(all.filter((t) => orgReadable(call, t)).sort(byCreated));
      }
      return structuredClone(
        all.filter((t) => t.clientId === call.clientId && t.raisedBy === call.actor.user.id).sort(byCreated),
      );
    },

    async get(ctx, id) {
      const call = await readingCall(ctx);
      return structuredClone(await visibleTicket(call, id));
    },

    async messages(ctx, id) {
      const call = await readingCall(ctx);
      const t = await visibleTicket(call, id);
      const rows = (await call.all<TicketMessage>('ticketMessages')).filter((m) => m.ticketId === t.id && !m.internal);
      return structuredClone(rows.sort(byCreated));
    },

    async reply(ctx, id, input) {
      const call = await ownTicket(ctx);
      const t = await raisersTicket(call, id);
      const body = text(input.body);
      if (body === '' || body.length > TICKET_REPLY_MAX) throw new RuleError('invalidReply');
      const attachmentIds = await checkScreenshots(call, input.attachmentIds);
      const message = validate('ticketMessages', {
        id: call.newId(),
        ticketId: t.id,
        authorId: call.actor.user.id,
        side: 'customer',
        body,
        internal: false,
        attachmentIds,
        createdAt: ctx.now,
      }) as TicketMessage;
      const next: Ticket = {
        ...t,
        updatedAt: ctx.now,
        ...(t.status === 'waitingForCustomer' ? { status: 'inProgress' as const } : {}),
      };
      await apply([
        put('ticketMessages', message),
        put('tickets', next),
        audit(call, t.clientId, 'tickets.reply', `ticket:${t.id}`, undefined, {
          ticketId: t.id,
          attachments: attachmentIds.length,
        }),
      ]);
      return structuredClone(message);
    },

    async resolve(ctx, id) {
      const call = await ownTicket(ctx);
      const t = await raisersTicket(call, id);
      if (t.status === 'resolved' || t.status === 'closed') return invalidTicket();
      const next: Ticket = { ...t, status: 'resolved', resolvedAt: ctx.now, updatedAt: ctx.now };
      await apply([
        put('tickets', next),
        audit(call, t.clientId, 'tickets.resolve', `ticket:${t.id}`, undefined, { ticketId: t.id }),
      ]);
      return structuredClone(next);
    },

    async reopen(ctx, id) {
      const call = await ownTicket(ctx);
      const t = await raisersTicket(call, id);
      if (t.status !== 'resolved') return invalidTicket();
      const next: Ticket = { ...t, status: 'received', updatedAt: ctx.now };
      delete next.resolvedAt;
      delete next.satisfaction;
      await apply([
        put('tickets', next),
        audit(call, t.clientId, 'tickets.reopen', `ticket:${t.id}`, undefined, { ticketId: t.id }),
      ]);
      return structuredClone(next);
    },

    async rate(ctx, id, rating) {
      const call = await ownTicket(ctx);
      const t = await raisersTicket(call, id);
      if (t.status !== 'resolved' || !['up', 'down'].includes(rating)) return invalidTicket();
      const next: Ticket = { ...t, satisfaction: rating, updatedAt: ctx.now };
      await apply([
        put('tickets', next),
        audit(call, t.clientId, 'tickets.rate', `ticket:${t.id}`, undefined, { ticketId: t.id, rating }),
      ]);
      return structuredClone(next);
    },
  };

  // ------------------------------------------------------------ FAQ votes

  const faqsService: FaqsService = {
    async vote(ctx, faqId, helpful) {
      const call = await beginCall(backend, options, ctx, { allowLimited: true });
      if (call.side === 'provider') return forbid('permission');
      if (typeof helpful !== 'boolean') throw new ValidationError(['helpful: yes or no']);
      // Staff vote on staff FAQs and admins on admin FAQs; anything else does not exist for them.
      const faq = faqs.find((f) => f.id === faqId);
      if (!faq || faq.audience !== call.side) throw new NotFoundError();
      const vote = validate('faqVotes', {
        key: `${call.actor.user.id}:${faq.id}`,
        faqId: faq.id,
        userId: call.actor.user.id,
        helpful,
      }) as FaqVote;
      await apply([{ type: 'put', store: 'faqVotes', key: vote.key, record: vote }]);
      return structuredClone(vote);
    },

    async myVotes(ctx) {
      const call = await beginCall(backend, options, ctx, { allowLimited: true });
      if (call.side === 'provider') return forbid('permission');
      const rows = (await call.all<FaqVote>('faqVotes')).filter((v) => v.userId === call.actor.user.id);
      return structuredClone(rows.sort((a, b) => (a.key < b.key ? -1 : 1)));
    },
  };

  return { moduleFeedback, appFeedback, tickets, faqs: faqsService };
}

// Provider ticket inbox, saved replies and the Other entries review (M4 chunk 7, plan BP-10 and BP-11). Provider side
// only. Reading needs tickets.read, every change tickets.write. Each write is ONE batch together with its audit event,
// and the audit log holds ids, statuses and counts only, never reply, note or phrase text.
import {
  groupOtherEntries,
  normaliseOtherEntry,
  responseStatus,
  retagEntries,
  trendingPhrase,
  type Attachment,
  type OtherEntryGroup,
  type Package,
  type Person,
  type SavedReply,
  type Subscription,
  type Ticket,
  type TicketMessage,
  type UserAccount,
} from '@sta/domain';
import { validate, type RawBackend } from './backend';
import { put } from './ops';
import { audit, beginCall, forbid, holds, type Call } from './policy';
import {
  NotFoundError,
  RuleError,
  ValidationError,
  type ActorContext,
  type OtherEntriesService,
  type ProviderTicketScreenshot,
  type ProviderTicketsService,
  type SavedRepliesService,
  type StoreOptions,
} from './types';

export type ProviderTicketOperations = {
  providerTickets: ProviderTicketsService;
  savedReplies: SavedRepliesService;
  otherEntries: OtherEntriesService;
};

const STATUSES: readonly Ticket['status'][] = ['received', 'inProgress', 'waitingForCustomer', 'resolved', 'closed'];
const MESSAGE_MAX = 2000;
const TITLE_MAX = 80;
const NAME_MAX = 60;
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number =>
  a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1;

export function createProviderTicketOperations(backend: RawBackend, options: StoreOptions): ProviderTicketOperations {
  /** A provider-side actor holding `permission`. Anyone else is refused. */
  async function providerCall(ctx: ActorContext, permission: string): Promise<Call> {
    const call = await beginCall(backend, options, ctx);
    if (call.side !== 'provider' || call.actor.user.side !== 'provider') return forbid('permission');
    if (!holds(call, [permission])) return forbid('permission');
    return call;
  }

  async function ticketOf(call: Call, id: string): Promise<Ticket> {
    const t = await call.find<Ticket>('tickets', id);
    if (!t) throw new NotFoundError();
    return t;
  }

  function message(call: Call, t: Ticket, body: unknown, internal: boolean): TicketMessage {
    const b = text(body);
    if (b === '' || b.length > MESSAGE_MAX) throw new RuleError('invalidReply');
    return validate('ticketMessages', {
      id: call.newId(),
      ticketId: t.id,
      authorId: call.actor.user.id,
      side: 'provider',
      body: b,
      internal,
      attachmentIds: [],
      createdAt: call.actor.ctx.now,
    }) as TicketMessage;
  }

  const providerTickets: ProviderTicketsService = {
    async list(ctx, filter) {
      const call = await providerCall(ctx, 'tickets.read');
      const now = new Date(ctx.now);
      const subs = await call.all<Subscription>('subscriptions');
      const packages = await call.all<Package>('packages');
      const target = (clientId: string): number => {
        const sub = subs.find((s) => s.clientId === clientId);
        return packages.find((p) => p.id === sub?.packageId)?.entitlements.responseTargetHours ?? 0;
      };
      const rows = (await call.all<Ticket>('tickets'))
        .filter(
          (t) =>
            (filter?.status === undefined || t.status === filter.status) &&
            (filter?.clientId === undefined || t.clientId === filter.clientId) &&
            (filter?.assigneeId === undefined || t.assigneeId === filter.assigneeId) &&
            (filter?.impact === undefined || t.impact === filter.impact),
        )
        .sort(byCreated)
        .map((ticket) => ({ ticket, ...responseStatus(ticket, target(ticket.clientId), now) }));
      return structuredClone(rows);
    },

    async assign(ctx, id, assigneeId) {
      const call = await providerCall(ctx, 'tickets.write');
      const t = await ticketOf(call, id);
      if (assigneeId !== null) {
        const u = await call.find<UserAccount>('users', text(assigneeId));
        if (!u || u.side !== 'provider') throw new ValidationError(['assigneeId: choose a provider team member']);
      }
      const next: Ticket = { ...t, updatedAt: ctx.now };
      if (assigneeId === null) delete next.assigneeId;
      else next.assigneeId = assigneeId;
      await backend.apply([
        put('tickets', validate('tickets', next) as Ticket),
        audit(call, t.clientId, 'ticket.assign', `ticket:${t.id}`, undefined, {
          ticketId: t.id,
          assigneeId: assigneeId ?? null,
        }),
      ]);
      return structuredClone(next);
    },

    async reply(ctx, id, input) {
      const call = await providerCall(ctx, 'tickets.write');
      const t = await ticketOf(call, id);
      const m = message(call, t, input.body, false);
      const next: Ticket = { ...t, updatedAt: ctx.now, firstResponseAt: t.firstResponseAt ?? ctx.now };
      await backend.apply([
        put('ticketMessages', m),
        put('tickets', next),
        audit(call, t.clientId, 'ticket.reply', `ticket:${t.id}`, undefined, { ticketId: t.id, messageId: m.id }),
      ]);
      return structuredClone(m);
    },

    async addNote(ctx, id, input) {
      const call = await providerCall(ctx, 'tickets.write');
      const t = await ticketOf(call, id);
      const m = message(call, t, input.body, true);
      await backend.apply([
        put('ticketMessages', m),
        audit(call, t.clientId, 'ticket.note', `ticket:${t.id}`, undefined, { ticketId: t.id, messageId: m.id }),
      ]);
      return structuredClone(m);
    },

    async setStatus(ctx, id, status) {
      const call = await providerCall(ctx, 'tickets.write');
      const t = await ticketOf(call, id);
      if (!STATUSES.includes(status)) throw new ValidationError(['status: choose a status from the list']);
      const next: Ticket = { ...t, status, updatedAt: ctx.now };
      if (status === 'resolved') next.resolvedAt = t.resolvedAt ?? ctx.now;
      if (status === 'closed') next.closedAt = t.closedAt ?? ctx.now;
      await backend.apply([
        put('tickets', validate('tickets', next) as Ticket),
        audit(call, t.clientId, 'ticket.setStatus', `ticket:${t.id}`, { status: t.status }, { status }),
      ]);
      return structuredClone(next);
    },

    async messages(ctx, id) {
      const call = await providerCall(ctx, 'tickets.read');
      const t = await ticketOf(call, id);
      const rows = (await call.all<TicketMessage>('ticketMessages')).filter((m) => m.ticketId === t.id);
      return structuredClone(rows.sort(byCreated));
    },

    async screenshots(ctx, id) {
      const call = await providerCall(ctx, 'tickets.read');
      const t = await ticketOf(call, id);
      const ids = new Set(
        (await call.all<TicketMessage>('ticketMessages'))
          .filter((m) => m.ticketId === t.id && !m.internal && m.side === 'customer')
          .flatMap((m) => m.attachmentIds),
      );
      const out: ProviderTicketScreenshot[] = [];
      for (const aid of [...ids].sort()) {
        const a = await call.find<Attachment>('attachments', aid);
        if (!a || a.clientId !== t.clientId || a.kind !== 'file' || a.purpose !== 'ticketScreenshot') continue;
        if (a.mime === 'application/pdf') continue;
        out.push({ id: a.id, title: a.title, alt: a.alt ?? a.title, mime: a.mime, data: new Uint8Array(a.data) });
      }
      return out;
    },

    async raiserName(ctx, id) {
      const call = await providerCall(ctx, 'tickets.read');
      const t = await ticketOf(call, id);
      const raiser = await call.find<UserAccount>('users', t.raisedBy);
      return raiser?.displayName ?? '';
    },
  };

  // ------------------------------------------------------------ saved replies

  const savedReplies: SavedRepliesService = {
    async list(ctx) {
      const call = await providerCall(ctx, 'tickets.read');
      const rows = await call.all<SavedReply>('savedReplies');
      return structuredClone([...rows].sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)));
    },

    async create(ctx, input) {
      const call = await providerCall(ctx, 'tickets.write');
      const title = text(input.title);
      const body = text(input.body);
      if (title === '' || title.length > TITLE_MAX || body === '' || body.length > MESSAGE_MAX) {
        throw new ValidationError(['title and body: required, and not too long']);
      }
      const reply = validate('savedReplies', { id: call.newId(), title, body }) as SavedReply;
      await backend.apply([
        put('savedReplies', reply),
        audit(call, undefined, 'savedReply.create', `savedReply:${reply.id}`, undefined, { replyId: reply.id }),
      ]);
      return structuredClone(reply);
    },

    async insertText(ctx, replyId, ticketId) {
      const call = await providerCall(ctx, 'tickets.write');
      const reply = await call.find<SavedReply>('savedReplies', replyId);
      if (!reply) throw new NotFoundError();
      const t = await ticketOf(call, ticketId);
      const raiser = await call.find<UserAccount>('users', t.raisedBy);
      const person = raiser?.personId ? await call.find<Person>('people', raiser.personId) : undefined;
      const first = person?.firstName ?? 'there';
      return reply.body.split('{{firstName}}').join(first);
    },
  };

  // ------------------------------------------------------------ Other entries

  type Field = 'feature' | 'issueType';

  /**
   * Live groups from the tickets. A stored group is the provider's own grouping, so its tickets are read under the
   * group's phrase (several wordings, one group); any other phrase is grouped by its normalised text. A stored group
   * lends its id and review state. Tickets already re-tagged (they have an id) drop out of the live groups.
   */
  async function groups(call: Call, field: Field) {
    const tickets = await call.all<Ticket>('tickets');
    const stored = (await call.all<OtherEntryGroup>('otherEntryGroups')).filter((g) => g.field === field);
    const original = new Map<string, string>();
    const virtual = tickets.map((t) => {
      const own = field === 'feature' ? t.featureOtherText : t.issueTypeOtherText;
      if (own !== undefined) original.set(t.id, own.trim());
      const home = stored.find((g) => g.ticketIds.includes(t.id));
      if (!home) return t;
      return field === 'feature'
        ? { ...t, featureOtherText: home.normalised }
        : { ...t, issueTypeOtherText: home.normalised };
    });
    const trending = trendingPhrase(virtual, field, options.clock);
    const live = groupOtherEntries(virtual, field).map((g) => {
      const s = stored.find((x) => normaliseOtherEntry(x.normalised) === g.normalised);
      const examples = [...new Set(g.ticketIds.map((id) => original.get(id) ?? ''))].filter((e) => e !== '');
      const merged: OtherEntryGroup & { clientCount: number } = {
        ...g,
        ...(s ? { normalised: s.normalised } : {}),
        examples,
        ...(s ? { id: s.id, review: s.review, ...(s.outcomeId !== undefined ? { outcomeId: s.outcomeId } : {}) } : {}),
      };
      return { ...merged, trending: g.normalised === trending && merged.review === 'unreviewed' };
    });
    const seen = new Set(live.map((g) => g.normalised));
    const done = stored.filter((s) => !seen.has(s.normalised)).map((s) => ({ ...s, clientCount: 0, trending: false }));
    return [...live, ...done];
  }

  const otherEntries: OtherEntriesService = {
    async review(ctx, field) {
      const call = await providerCall(ctx, 'tickets.read');
      return structuredClone(await groups(call, field));
    },

    async createIssueType(ctx, input) {
      const call = await providerCall(ctx, 'tickets.write');
      const name = text(input.name);
      if (name === '' || name.length > NAME_MAX) throw new ValidationError(['name: 1 to 60 characters']);
      if (!Array.isArray(input.ticketIds) || input.ticketIds.some((i) => typeof i !== 'string')) {
        throw new ValidationError(['ticketIds: choose tickets from the group']);
      }
      const ids = [...new Set(input.ticketIds)];
      const group = (await groups(call, 'issueType')).find((g) => g.id === input.groupId);
      if (!group) throw new NotFoundError();
      if (ids.length === 0 || ids.some((i) => !group.ticketIds.includes(i))) {
        throw new ValidationError(['ticketIds: choose tickets from the group']);
      }
      const issueTypeId = call.newId();
      const all = await call.all<Ticket>('tickets');
      const changed = retagEntries(all, ids, 'issueType', issueTypeId)
        .filter((t) => ids.includes(t.id))
        .map((t) => {
          const copy = { ...t, updatedAt: ctx.now };
          delete copy.issueTypeOtherText;
          return validate('tickets', copy) as Ticket;
        });
      const base: OtherEntryGroup = {
        id: group.id,
        field: group.field,
        normalised: group.normalised,
        examples: group.examples,
        ticketIds: group.ticketIds,
        count: group.count,
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        review: group.review,
      };
      const updated = validate('otherEntryGroups', {
        ...base,
        review: 'created',
        outcomeId: issueTypeId,
      }) as OtherEntryGroup;
      await backend.apply([
        ...changed.map((t) => put('tickets', t)),
        put('otherEntryGroups', updated),
        audit(call, undefined, 'otherEntries.createIssueType', `otherEntryGroup:${group.id}`, undefined, {
          groupId: group.id,
          issueTypeId,
          retagged: changed.length,
        }),
      ]);
      return structuredClone({ issueTypeId, retagged: changed.length, group: updated });
    },
  };

  return { providerTickets, savedReplies, otherEntries };
}

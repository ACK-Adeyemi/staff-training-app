// M4 chunk 7 contract tests: provider ticket inbox, saved replies and the Other entries review (plan docs/plans/m4.md
// chunk 7, BP-10 and BP-11). Written before the implementation, so the new services are described by local types:
//   - store.providerTickets.list(ctx, filter?) returns { ticket, responseDueAt?, breached }[] (tickets.read). A ticket
//     with no firstResponseAt that is not resolved/closed has responseDueAt = createdAt + the client's package
//     responseTargetHours; breached is true when that is before the clock.
//   - providerTickets.assign / reply / addNote / setStatus / messages (tickets.write to change, tickets.read to read).
//     Each change is one batch with an audit event (ticket.assign, ticket.reply, ticket.note, ticket.setStatus) holding
//     ids and statuses only, never text. Internal notes are ticketMessages with internal: true.
//   - store.savedReplies.list / create (tickets.write) and insertText(ctx, replyId, ticketId) which fills {{firstName}}.
//   - store.otherEntries.review(ctx, field) returns groups with a trending flag; createIssueType(ctx, input) re-tags
//     ONLY input.ticketIds, marks the group 'created' with outcomeId, and audits 'otherEntries.createIssueType'
//     with ids and counts only.
import { describe, expect, it } from 'vitest';
import {
  createRng,
  fixedClock,
  ulid,
  type AuditEvent,
  type OtherEntryGroup,
  type Person,
  type SavedReply,
  type Ticket,
  type TicketMessage,
} from '@sta/domain';
import {
  ForbiddenError,
  NotFoundError,
  type ActorContext,
  type StoreHandle,
  type StoreOptions,
  type TicketsService,
} from '../types';
import { refusal } from './learning';
import { buildWorld, TODAY } from './world';

type Row = { ticket: Ticket; responseDueAt?: string; breached: boolean };
type GroupRow = OtherEntryGroup & { clientCount: number; trending: boolean };
type ProviderTicketsStore = {
  providerTickets: {
    list(
      ctx: ActorContext,
      filter?: { status?: Ticket['status']; clientId?: string; assigneeId?: string; impact?: Ticket['impact'] },
    ): Promise<Row[]>;
    assign(ctx: ActorContext, id: string, assigneeId: string | null): Promise<Ticket>;
    reply(ctx: ActorContext, id: string, input: { body: string }): Promise<TicketMessage>;
    addNote(ctx: ActorContext, id: string, input: { body: string }): Promise<TicketMessage>;
    setStatus(ctx: ActorContext, id: string, status: Ticket['status']): Promise<Ticket>;
    messages(ctx: ActorContext, id: string): Promise<TicketMessage[]>;
    raiserName(ctx: ActorContext, id: string): Promise<string>;
    screenshots(ctx: ActorContext, id: string): Promise<{ id: string; title: string; alt: string; mime: string }[]>;
  };
  savedReplies: {
    list(ctx: ActorContext): Promise<SavedReply[]>;
    create(ctx: ActorContext, input: { title: string; body: string }): Promise<SavedReply>;
    insertText(ctx: ActorContext, replyId: string, ticketId: string): Promise<string>;
  };
  otherEntries: {
    review(ctx: ActorContext, field: 'feature' | 'issueType'): Promise<GroupRow[]>;
    createIssueType(
      ctx: ActorContext,
      input: { groupId: string; name: string; ticketIds: string[] },
    ): Promise<{ issueTypeId: string; retagged: number; group: OtherEntryGroup }>;
  };
};

export function runProviderTicketsContract(
  name: string,
  makeStore: (options: StoreOptions) => Promise<StoreHandle>,
): void {
  async function setup() {
    const handle = await makeStore({ clock: fixedClock(TODAY), rng: createRng(7) });
    const fx = await buildWorld(handle.admin, { keepSupportSeed: true });
    const s = handle.store as unknown as ProviderTicketsStore & { tickets: TicketsService };
    const u = fx.ids.users;
    const provider = (userId: string): ActorContext => ({ userId, side: 'provider', now: TODAY });
    const dump = async <T>(st: string): Promise<T[]> =>
      ((await handle.admin.dumpAll()) as unknown as Record<string, T[]>)[st] ?? [];
    const priya: ActorContext = { userId: u.priya, side: 'client', clientId: fx.ids.clients.a, now: TODAY };
    const jade: ActorContext = { userId: u.jade, side: 'staff', clientId: fx.ids.clients.a, now: TODAY };
    const raised = await s.tickets.raise(priya, {
      title: 'Cannot print the rota',
      description: 'The print button does nothing.',
      impact: 'blocked',
      context: {},
    });
    return {
      s,
      admin: handle.admin,
      u,
      fx,
      dump,
      priya,
      jade,
      raised,
      support: provider(u.support),
      owner: provider(u.provOwner),
      raj: provider(fx.keys.users['raj']),
    };
  }
  const audits = async (dump: <T>(n: string) => Promise<T[]>, action: string) =>
    (await dump<AuditEvent>('audit')).filter((e) => e.action === action);

  describe(`M4 provider tickets: ${name}`, () => {
    it('lists tickets across clients and filters by status, client, assignee and impact', async () => {
      const t = await setup();
      const all = await t.s.providerTickets.list(t.support);
      expect(all.map((r) => r.ticket.id)).toContain(t.raised.id);
      expect(new Set(all.map((r) => r.ticket.clientId)).size).toBeGreaterThan(1);
      const blocked = await t.s.providerTickets.list(t.support, { impact: 'blocked' });
      expect(blocked.length).toBeGreaterThan(0);
      expect(blocked.every((r) => r.ticket.impact === 'blocked')).toBe(true);
      const byClient = await t.s.providerTickets.list(t.support, { clientId: t.fx.ids.clients.b });
      expect(byClient.length).toBeGreaterThan(0);
      expect(byClient.every((r) => r.ticket.clientId === t.fx.ids.clients.b)).toBe(true);
      const waiting = await t.s.providerTickets.list(t.support, { status: 'waitingForCustomer' });
      expect(waiting.length).toBeGreaterThan(0);
      expect(waiting.every((r) => r.ticket.status === 'waitingForCustomer')).toBe(true);
      await t.s.providerTickets.assign(t.support, t.raised.id, t.u.support);
      const mine = await t.s.providerTickets.list(t.support, { assigneeId: t.u.support });
      expect(mine.map((r) => r.ticket.id)).toEqual([t.raised.id]);
    });

    it('assigns a ticket, stores the assignee and audits ids only', async () => {
      const t = await setup();
      const updated = await t.s.providerTickets.assign(t.support, t.raised.id, t.u.support);
      expect(updated).toMatchObject({ id: t.raised.id, assigneeId: t.u.support, updatedAt: TODAY });
      const [event] = await audits(t.dump, 'ticket.assign');
      expect(event).toMatchObject({ actorId: t.u.support, actorSide: 'provider', at: TODAY });
      expect(JSON.stringify(event)).not.toContain('print button');
    });

    it('lists, creates and inserts saved replies with the first name filled in', async () => {
      const t = await setup();
      const seeded = await t.s.savedReplies.list(t.support);
      expect(seeded).toHaveLength(5);
      const made = await t.s.savedReplies.create(t.support, {
        title: 'Try again',
        body: 'Hi {{firstName}}, please retry.',
      });
      expect((await t.s.savedReplies.list(t.support)).map((r) => r.id)).toContain(made.id);
      const person = (await t.dump<Person>('people')).find((p) => p.id === t.fx.ids.people.priya)!;
      expect(await t.s.savedReplies.insertText(t.support, made.id, t.raised.id)).toBe(
        `Hi ${person.firstName}, please retry.`,
      );
    });

    it('shows the customer a provider reply and a status change, and moves the first response time', async () => {
      const t = await setup();
      await t.s.providerTickets.reply(t.support, t.raised.id, { body: 'We are on it.' });
      await t.s.providerTickets.setStatus(t.support, t.raised.id, 'waitingForCustomer');
      expect((await t.s.tickets.messages(t.priya, t.raised.id)).map((m) => m.body)).toContain('We are on it.');
      const seen = await t.s.tickets.get(t.priya, t.raised.id);
      expect(seen).toMatchObject({ status: 'waitingForCustomer', firstResponseAt: TODAY });
      expect(await audits(t.dump, 'ticket.setStatus')).toHaveLength(1);
      expect(JSON.stringify(await audits(t.dump, 'ticket.reply'))).not.toContain('We are on it');
    });

    it('keeps internal notes from client and staff actors but shows them to the provider', async () => {
      const t = await setup();
      const note = await t.s.providerTickets.addNote(t.support, t.raised.id, { body: 'Secret hunch about the rota' });
      expect(note.internal).toBe(true);
      const customerView = await t.s.tickets.messages(t.priya, t.raised.id);
      expect(customerView.some((m) => m.id === note.id || m.internal)).toBe(false);
      expect(JSON.stringify(customerView)).not.toContain('Secret hunch');
      const staffOwn = await t.s.tickets.raise(t.jade, {
        title: 'Jade issue',
        description: 'Cannot log in',
        impact: 'question',
        context: {},
      });
      const jadeNote = await t.s.providerTickets.addNote(t.support, staffOwn.id, { body: 'Another hunch' });
      expect((await t.s.tickets.messages(t.jade, staffOwn.id)).some((m) => m.id === jadeNote.id)).toBe(false);
      const providerView = await t.s.providerTickets.messages(t.support, t.raised.id);
      expect(providerView.map((m) => m.id)).toContain(note.id);
    });

    it('returns response due times for open tickets and flags a breach', async () => {
      const t = await setup();
      const rows = await t.s.providerTickets.list(t.support);
      const mine = rows.find((r) => r.ticket.id === t.raised.id)!;
      expect(mine.responseDueAt).toBeDefined();
      expect(Date.parse(mine.responseDueAt!)).toBeGreaterThan(Date.parse(t.raised.createdAt));
      expect(mine.breached).toBe(false);
      const old = rows.filter(
        (r) => r.ticket.firstResponseAt === undefined && ['received', 'inProgress'].includes(r.ticket.status),
      );
      expect(old.some((r) => r.breached)).toBe(true);
      await t.s.providerTickets.reply(t.support, t.raised.id, { body: 'Hello' });
      const after = (await t.s.providerTickets.list(t.support)).find((r) => r.ticket.id === t.raised.id)!;
      expect(after.responseDueAt).toBeUndefined();
      const done = (await t.s.providerTickets.list(t.support, { status: 'resolved' })).concat(
        await t.s.providerTickets.list(t.support, { status: 'closed' }),
      );
      expect(done.every((r) => r.responseDueAt === undefined)).toBe(true);
    });

    it('groups seeded Other phrases and flags only the trending one', async () => {
      const t = await setup();
      const groups = await t.s.otherEntries.review(t.support, 'issueType');
      expect(groups.map((g) => g.normalised)).toEqual(
        expect.arrayContaining(["certificate won't download", 'progress bar too faint']),
      );
      const trending = groups.filter((g) => g.trending);
      expect(trending.map((g) => g.normalised)).toEqual(["certificate won't download"]);
      expect(trending[0]).toMatchObject({ count: 5, review: 'unreviewed' });
      const features = await t.s.otherEntries.review(t.support, 'feature');
      expect(features.find((g) => g.normalised === 'staff rota')).toMatchObject({ count: 4, trending: false });
    });

    it('creating an issue type from a group re-tags only the selected tickets and audits ids and counts', async () => {
      const t = await setup();
      const group = (await t.s.otherEntries.review(t.support, 'issueType')).find((g) => g.trending)!;
      const picked = group.ticketIds.slice(0, 3);
      const left = group.ticketIds.slice(3);
      const r = await t.s.otherEntries.createIssueType(t.support, {
        groupId: group.id,
        name: 'Certificate download',
        ticketIds: picked,
      });
      expect(r.retagged).toBe(3);
      expect(r.group).toMatchObject({ review: 'created', outcomeId: r.issueTypeId });
      const stored = await t.dump<Ticket>('tickets');
      for (const id of picked) {
        expect(stored.find((x) => x.id === id)).toMatchObject({ issueTypeId: r.issueTypeId });
        expect(stored.find((x) => x.id === id)!.issueTypeOtherText).toBeUndefined();
      }
      for (const id of left) {
        const x = stored.find((y) => y.id === id)!;
        expect(x.issueTypeId).toBeUndefined();
        expect(x.issueTypeOtherText).toBeDefined();
      }
      const [event] = await audits(t.dump, 'otherEntries.createIssueType');
      expect(event).toMatchObject({ actorId: t.u.support, actorSide: 'provider', at: TODAY });
      const text = JSON.stringify(event);
      expect(text).toContain(group.id);
      expect(text).not.toMatch(/won.t download/i);
    });

    it('refuses a ticket id outside the group when creating an issue type', async () => {
      const t = await setup();
      const group = (await t.s.otherEntries.review(t.support, 'issueType')).find((g) => g.trending)!;
      const before = await t.dump<Ticket>('tickets');
      await expect(
        t.s.otherEntries.createIssueType(t.support, { groupId: group.id, name: 'X type', ticketIds: [t.raised.id] }),
      ).rejects.toBeDefined();
      expect(await t.dump<Ticket>('tickets')).toEqual(before);
    });

    it('returns the display name of the person who raised the ticket, and refuses unknown ids and actors without tickets.read', async () => {
      const t = await setup();
      const users = await t.dump<{ id: string; displayName: string }>('users');
      const expected = users.find((x) => x.id === t.u.priya)!.displayName;
      expect(expected.length).toBeGreaterThan(0);
      expect(await t.s.providerTickets.raiserName(t.support, t.raised.id)).toBe(expected);
      for (const actor of [t.raj, t.priya, t.jade]) {
        expect(await refusal(t.s.providerTickets.raiserName(actor, t.raised.id))).toBeInstanceOf(ForbiddenError);
      }
      expect(await refusal(t.s.providerTickets.raiserName(t.support, 'no-such-ticket'))).toBeInstanceOf(NotFoundError);
    });

    it('returns only the customer screenshots of a ticket, and refuses actors without tickets.read', async () => {
      const t = await setup();
      expect(await t.s.providerTickets.screenshots(t.support, t.raised.id)).toEqual([]);
      const ids = createRng(99);
      const [shotId, msgId] = [ulid(fixedClock(TODAY), ids), ulid(fixedClock(TODAY), ids)] as [string, string];
      const file = {
        id: shotId,
        clientId: t.raised.clientId,
        kind: 'file',
        purpose: 'ticketScreenshot',
        title: 'Screenshot',
        mime: 'image/png',
        bytes: 3,
        data: new Uint8Array([1, 2, 3]),
        ownerUserId: t.u.priya,
        redacted: false,
        alt: 'A fictional screen',
        createdAt: TODAY,
      };
      await t.admin.bulkPut('attachments', [file] as never);
      await t.admin.bulkPut('ticketMessages', [
        {
          id: msgId,
          ticketId: t.raised.id,
          authorId: t.u.priya,
          side: 'customer',
          body: 'See the picture',
          internal: false,
          attachmentIds: [shotId],
          createdAt: TODAY,
        },
      ] as never);
      const shots = await t.s.providerTickets.screenshots(t.support, t.raised.id);
      expect(shots).toHaveLength(1);
      expect(shots[0]).toMatchObject({ id: shotId, alt: 'A fictional screen', mime: 'image/png' });
      for (const actor of [t.raj, t.priya, t.jade]) {
        expect(await refusal(t.s.providerTickets.screenshots(actor, t.raised.id))).toBeInstanceOf(ForbiddenError);
      }
      expect(await refusal(t.s.providerTickets.screenshots(t.support, 'no-such-ticket'))).toBeInstanceOf(NotFoundError);
    });

    it('denies a provider user without the ticket permission, and every customer actor, changing anything', async () => {
      const t = await setup();
      const p = t.s.providerTickets;
      for (const actor of [t.raj, t.priya, t.jade]) {
        expect(await refusal(p.assign(actor, t.raised.id, t.u.support))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(p.reply(actor, t.raised.id, { body: 'Hi' }))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(p.addNote(actor, t.raised.id, { body: 'Hi' }))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.savedReplies.create(actor, { title: 'T', body: 'B' }))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(t.s.otherEntries.review(actor, 'issueType'))).toBeInstanceOf(ForbiddenError);
        expect(await refusal(p.list(actor))).toBeInstanceOf(ForbiddenError);
      }
      expect(await audits(t.dump, 'ticket.assign')).toHaveLength(0);
      expect((await t.dump<Ticket>('tickets')).find((x) => x.id === t.raised.id)!.assigneeId).toBeUndefined();
    });
  });
}

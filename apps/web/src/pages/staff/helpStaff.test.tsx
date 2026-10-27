// M3 chunk 20a (BP-16, F-3, F-4, F-5): staff side of Help, tickets and app feedback. S14 Help, S15 Raise a ticket, S16
// Ticket thread. Written before the implementation. Text is in packages/content/src/lang/en-GB.json (help, tickets,
// feedback.app, faq, whatsNew); the few new strings are marked NEW below and go in the same file.
//
// UI CONTRACT (data layer: store.faqs.vote / myVotes, store.appFeedback.submit, store.tickets.*, store.attachments.upload
// with purpose 'ticketScreenshot'; Jade is the staff persona; seeded tickets T-1001 (Priya), T-1002 (Jade, resolved,
// rated Yes, one provider reply), T-1003 (Daniel)). The Help, ticket and thread components are shared with C23.
//   S14 /staff/help, h1 "Help" (inside the staff shell). One search input (type=search) labelled "Search help". The
//     staff FAQ list only (never client FAQs): each question is a button with aria-expanded; opening it shows the
//     answer and a group "Was this helpful?" with buttons "Yes" and "No" (aria-pressed shows the current vote). A vote
//     calls faqs.vote once per user and FAQ (a second vote replaces the first) and shows role=status "Thanks for
//     letting us know.". A group "Categories" has buttons "All topics" and one per category in use (aria-pressed);
//     choosing one lists only its FAQs. Search matches question and answer text, ignoring case. No match shows
//     "No answers found. Try different words, or raise a ticket.".
//     h2 "What's new": the release notes, newest first, as list items showing the title and body.
//     Button "Send feedback" opens a dialog named "Send feedback about the app": radio group "What kind of feedback?"
//     (Idea, Problem, Praise), textbox "Tell us more", the texts "This goes to the product team, not to your manager.",
//     "Please do not include the names of children or colleagues." and the context sentence, a link "Need a reply?
//     Raise a ticket instead." to #/staff/help/ticket/new, and a button "Send feedback" (inside the dialog). Sending
//     calls appFeedback.submit({ kind, text, context: { screen } }) and shows role=status "Thank you. The product team
//     will read this.". Empty text gives role=alert and stores nothing. The dialog closes on Escape, focus returns.
//     Link "Raise a ticket" to #/staff/help/ticket/new, hidden when the client switched staff tickets off.
//     h2 "My tickets": filter buttons "Open" (default), "Resolved", "All" (aria-pressed). Each ticket is a link whose
//     name contains its number and title, to #/staff/help/ticket/<id>, with a status chip in words (Received, In
//     progress, Waiting for your reply, Resolved, Closed). None: "You have no tickets.".
//   S15 /staff/help/ticket/new, h1 "Raise a ticket". Steps, each an h2, one at a time, with buttons "Next" and "Back":
//     "Check Help first" (search input "Search help"; matching FAQs under "These answers might help" as disclosures;
//     button "This answered my question" goes back to #/staff/help and raises nothing), "Which part of the app?"
//     (radios: every support feature by its label, then "Other"; Other shows a text input with placeholder "A few
//     words", 3 to 80 characters), "What kind of problem?" (radios: issue types, then "Other", same box), "How much
//     does this affect you?" (radios "I can't use the app" = blocked/high, "Something is broken but I can work around
//     it" = workaround/normal, "Just a question" = question/low), "Tell us what happened" (textbox "Title" 3 to 100,
//     textbox "What happened?" 1 to 2000; a bad Next gives role=alert and stays on the step), "Add screenshots
//     (optional)" and "Check and send".
//     Screenshots: button "Add a screenshot" backed by a non-capture input type=file accepting
//     image/jpeg,image/png,image/webp (a second capture input gives "Take a photo" on phones). Each image is a group
//     "Screenshot <n>" holding an img (alt "Preview of screenshot <n>"), an ImageRedactor ("Add box"), a textbox
//     "Describe the image (optional)" and a button "Remove image". Reminder texts "Do not include information about
//     children." and "Location and camera details are removed from images.". A file of another type gives
//     role=alert "Please choose a photo." (NEW key) and is not added. A sixth image gives role=alert
//     "You can add up to 5 images." and is not added. Images go through app/images prepareImage(file, boxes) and the
//     prepared bytes are uploaded with attachments.upload({ purpose: 'ticketScreenshot', mime, data, alt? }).
//     Check and send: group "Sent with your ticket" listing the context items Screen, Device and browser, Your role,
//     App version, each with a button "Remove: <label>" (NEW key tickets.context.removeItem). A removed item shows
//     "Removed" and its key is NOT in the stored context. Context keys: screen, device, role, version.
//     Staff only: checkbox "Share with my manager" (NEW), default off. Button "Send ticket" calls tickets.raise with
//     the answers, the remaining context and the uploaded screenshot ids, then shows role=status "Your ticket T-1004
//     has been sent." and a link "See my tickets" to #/staff/help.
//     When staff tickets are switched off: role=alert "Support requests from staff are switched off. Ask your manager."
//     and no steps.
//   S16 /staff/help/ticket/:id, h1 "Ticket <number>". Shows the title, a status chip, a list named "Messages" (oldest
//     first, body text, no internal notes), a list named "Status timeline" with items "Received" (when raised) and
//     "Resolved" (when resolved), textbox "Reply" with button "Send reply" (not on closed tickets), button "Mark as
//     resolved" on open tickets, button "Reopen" on resolved ones, and on a resolved unrated ticket the group "Was this
//     helpful?" with buttons "Yes" and "No" (a rated ticket shows the rating as text, no buttons). Someone else's
//     ticket gives role=alert "We could not find that." (errors.notFound).
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { AppFeedback, FaqVote, Ticket, TicketMessage } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { renderRoute, TODAY } from '../../test/harness';
import { addScreenshot, answerUpToDetails, answerUpToReview, fillDetails, next, step } from '../../test/ticketWizard';

const hoisted = vi.hoisted(() => ({
  prepared: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0xff, 0xd9]),
  calls: [] as { file: File; boxes: unknown[] }[],
}));
vi.mock('../../app/images', () => ({
  prepareImage: (file: File, boxes: unknown[]) => {
    hoisted.calls.push({ file, boxes });
    return Promise.resolve({ data: hoisted.prepared, mime: 'image/jpeg' });
  },
}));
beforeAll(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined }));
});
afterEach(() => {
  cleanup();
  hoisted.calls.length = 0;
});

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const as =
  (key: string, side: 'staff' | 'client') =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[key]),
    side,
    clientId: need(keys.clients['littleAcorns']),
    now: TODAY,
  });
const jade = as('jade', 'staff');
const priya = as('priya', 'client');
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const ticketNumbered = async (handle: StoreHandle, number: string): Promise<Ticket> =>
  need((await dump<Ticket>(handle, 'tickets')).find((t) => t.number === number));

describe('S14 Help: FAQs', () => {
  it('has one h1 and lists the staff FAQs only', async () => {
    await renderRoute('/staff/help', 'staff', { actor: jade });
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Help');
    expect(screen.getByRole('button', { name: 'How do I see what I must complete?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'How do I add staff and invite them?' })).toBeNull();
  });

  it('shows an answer only after the question is opened', async () => {
    await renderRoute('/staff/help', 'staff', { actor: jade });
    const user = userEvent.setup();
    const q = await screen.findByRole('button', { name: 'What are XP and levels?' });
    expect(q.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Going fast earns nothing extra/)).toBeNull();
    await user.click(q);
    expect(q.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Going fast earns nothing extra/)).toBeTruthy();
  });

  it('searches question and answer text, ignoring case, and says so when nothing matches', async () => {
    await renderRoute('/staff/help', 'staff', { actor: jade });
    const user = userEvent.setup();
    const box = await screen.findByLabelText('Search help');
    await user.type(box, 'AUTHENTICATOR');
    expect(screen.getByText('No answers found. Try different words, or raise a ticket.')).toBeTruthy();
    await user.clear(box);
    await user.type(box, 'pin');
    expect(screen.getByRole('button', { name: 'What should I do if I cannot log in?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'What are XP and levels?' })).toBeNull();
  });

  it('filters by category and goes back to everything with All topics', async () => {
    await renderRoute('/staff/help', 'staff', { actor: jade });
    const user = userEvent.setup();
    const cats = within(await screen.findByRole('group', { name: 'Categories' }));
    await user.click(cats.getByRole('button', { name: 'My training' }));
    expect(cats.getByRole('button', { name: 'My training' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'How do I see what I must complete?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'How do renewals work?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'What are XP and levels?' })).toBeNull();
    await user.click(cats.getByRole('button', { name: 'All topics' }));
    expect(screen.getByRole('button', { name: 'What are XP and levels?' })).toBeTruthy();
  });

  it('records Was this helpful? once per user and FAQ: a second vote replaces the first', async () => {
    let c!: Ctx;
    await renderRoute('/staff/help', 'staff', { actor: jade, prepare: (x) => ((c = x), Promise.resolve()) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'What are XP and levels?' }));
    const vote = within(screen.getByRole('group', { name: 'Was this helpful?' }));
    expect(vote.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('false');
    await user.click(vote.getByRole('button', { name: 'Yes' }));
    expect((await screen.findByRole('status')).textContent).toContain('Thanks for letting us know.');
    expect(vote.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(vote.getByRole('button', { name: 'No' }));
    await waitFor(async () => {
      const votes = (await dump<FaqVote>(c.handle, 'faqVotes')).filter((v) => v.faqId === 'staff-xp');
      expect(votes).toHaveLength(1);
      expect(votes[0]).toMatchObject({ userId: c.keys.users['jade'], helpful: false });
    });
    expect(vote.getByRole('button', { name: 'No' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a vote Jade made earlier as already chosen', async () => {
    await renderRoute('/staff/help', 'staff', {
      actor: jade,
      prepare: async ({ handle, keys }) => {
        await handle.store.faqs.vote(jade(keys), 'staff-notes', true);
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'How do notes work?' }));
    const vote = within(screen.getByRole('group', { name: 'Was this helpful?' }));
    expect(vote.getByRole('button', { name: 'Yes' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe("S14 Help: What's new and app feedback", () => {
  it("lists What's new newest first with no billing wording", async () => {
    await renderRoute('/staff/help', 'staff', { actor: jade });
    const region = (await screen.findByRole('heading', { level: 2, name: "What's new" })).closest('section');
    const items = within(need(region)).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Calendar and reminders'),
      expect.stringContaining('Help and feedback'),
      expect.stringContaining('What changed in September 2026'),
    ]);
    expect(document.body.textContent).not.toMatch(/\b(payment|invoice|billing)\b/i);
  });

  it('opens the feedback sheet with the product-team wording, sends it and stores the screen only as context', async () => {
    let c!: Ctx;
    await renderRoute('/staff/help', 'staff', { actor: jade, prepare: (x) => ((c = x), Promise.resolve()) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Send feedback' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Send feedback about the app' }));
    expect(dialog.getByText('This goes to the product team, not to your manager.')).toBeTruthy();
    expect(dialog.getByText('Please do not include the names of children or colleagues.')).toBeTruthy();
    expect(dialog.getByRole('link', { name: 'Need a reply? Raise a ticket instead.' }).getAttribute('href')).toBe(
      '#/staff/help/ticket/new',
    );
    await user.click(dialog.getByRole('radio', { name: 'Idea' }));
    await user.type(dialog.getByRole('textbox', { name: 'Tell us more' }), 'A dark theme for the quiz screen.');
    await user.click(dialog.getByRole('button', { name: 'Send feedback' }));
    expect((await screen.findByRole('status')).textContent).toContain('Thank you. The product team will read this.');
    const rows = await dump<AppFeedback>(c.handle, 'appFeedback');
    const mine = rows.filter(
      (r) => r.userId === c.keys.users['jade'] && r.text === 'A dark theme for the quiz screen.',
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: 'idea', side: 'staff', text: 'A dark theme for the quiz screen.' });
    expect(Object.keys(mine[0]?.context ?? {})).toContain('screen');
  });

  it('refuses empty feedback with a message and stores nothing', async () => {
    let c!: Ctx;
    await renderRoute('/staff/help', 'staff', { actor: jade, prepare: (x) => ((c = x), Promise.resolve()) });
    const user = userEvent.setup();
    const before = (await dump<AppFeedback>(c.handle, 'appFeedback')).length;
    await user.click(await screen.findByRole('button', { name: 'Send feedback' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Send feedback about the app' }));
    await user.click(dialog.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await dump<AppFeedback>(c.handle, 'appFeedback')).toHaveLength(before);
  });

  it('closes the sheet on Escape and returns focus to the Send feedback button', async () => {
    await renderRoute('/staff/help', 'staff', { actor: jade });
    const user = userEvent.setup();
    const opener = await screen.findByRole('button', { name: 'Send feedback' });
    await user.click(opener);
    await screen.findByRole('dialog', { name: 'Send feedback about the app' });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(opener);
  });
});

describe('S14 Help: My tickets', () => {
  it('shows Open by default (Jade has none open), and her resolved ticket under Resolved and All', async () => {
    await renderRoute('/staff/help', 'staff', { actor: jade });
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: 'My tickets' });
    expect(screen.getByRole('button', { name: 'Open' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('You have no tickets.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Resolved' }));
    const link = await screen.findByRole('link', { name: /T-1002.*My notes did not show on my phone/ });
    expect(link.textContent).toContain('Resolved');
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('link', { name: /T-1002/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /T-1001/ })).toBeNull();
  });

  it('links each ticket to its thread', async () => {
    let c!: Ctx;
    await renderRoute('/staff/help', 'staff', { actor: jade, prepare: (x) => ((c = x), Promise.resolve()) });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'All' }));
    const link = await screen.findByRole('link', { name: /T-1002/ });
    expect(link.getAttribute('href')).toBe(`#/staff/help/ticket/${(await ticketNumbered(c.handle, 'T-1002')).id}`);
  });

  it('offers Raise a ticket, and hides it when the organisation switched staff tickets off', async () => {
    await renderRoute('/staff/help', 'staff', { actor: jade });
    expect((await screen.findByRole('link', { name: 'Raise a ticket' })).getAttribute('href')).toBe(
      '#/staff/help/ticket/new',
    );
    cleanup();
    await renderRoute('/staff/help', 'staff', {
      actor: jade,
      prepare: async ({ handle, keys }) => {
        await handle.store.organisation.updateSettings(priya(keys), { allowStaffTickets: false });
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Help' });
    expect(screen.queryByRole('link', { name: 'Raise a ticket' })).toBeNull();
  });
});

describe('S15 Raise a ticket', () => {
  const render = (prepare?: (c: Ctx) => Promise<void>) => {
    let c!: Ctx;
    return renderRoute('/staff/help/ticket/new', 'staff', {
      actor: jade,
      prepare: (x) => ((c = x), prepare ? prepare(x) : Promise.resolve()),
    }).then((r) => ({ ...r, c }));
  };
  const answers = { title: 'Quiz will not start', description: 'I press Start and nothing happens.' };

  it('starts with Check Help first and has one h1', async () => {
    await render();
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Raise a ticket');
    expect(await step('Check Help first')).toBeTruthy();
  });

  it('suggests matching answers first, and "This answered my question" leaves without raising anything', async () => {
    const { c, router } = await render();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Search help'), 'log in');
    const list = await screen.findByText('These answers might help');
    expect(list).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What should I do if I cannot log in?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'This answered my question' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/staff/help');
    });
    expect((await dump<Ticket>(c.handle, 'tickets')).filter((t) => t.raisedBy === c.keys.users['jade'])).toHaveLength(
      1,
    );
  });

  it('lists the features and issue types and the three impact choices', async () => {
    await render();
    const user = userEvent.setup();
    await step('Check Help first');
    await next(user);
    await step('Which part of the app?');
    for (const f of ['My training', 'Quizzes', 'Notes', 'Signing in', 'Display and text size', 'Other']) {
      expect(screen.getByRole('radio', { name: f })).toBeTruthy();
    }
    await user.click(screen.getByRole('radio', { name: 'Quizzes' }));
    await next(user);
    await step('What kind of problem?');
    for (const f of [
      "Something isn't working",
      "I can't sign in",
      'Request a feature',
      'Accessibility problem',
      'Other',
    ]) {
      expect(screen.getByRole('radio', { name: f })).toBeTruthy();
    }
    await user.click(screen.getByRole('radio', { name: 'Question or how-to' }));
    await next(user);
    await step('How much does this affect you?');
    for (const f of ["I can't use the app", 'Something is broken but I can work around it', 'Just a question']) {
      expect(screen.getByRole('radio', { name: f })).toBeTruthy();
    }
  });

  it('does not move on without a choice, and goes Back without losing answers', async () => {
    await render();
    const user = userEvent.setup();
    await step('Check Help first');
    await next(user);
    await step('Which part of the app?');
    await next(user);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Which part of the app?' })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Notes' }));
    await next(user);
    await step('What kind of problem?');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await step('Which part of the app?');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Notes' }).checked).toBe(true);
  });

  it('needs 3 to 80 characters for Other, and stores the words with featureId other', async () => {
    const { c } = await render();
    const user = userEvent.setup();
    await step('Check Help first');
    await next(user);
    await step('Which part of the app?');
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    await user.type(screen.getByPlaceholderText('A few words'), 'ab');
    await next(user);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Which part of the app?' })).toBeTruthy();
    await user.type(screen.getByPlaceholderText('A few words'), 'c printer');
    await next(user);
    await step('What kind of problem?');
    await user.click(screen.getByRole('radio', { name: "Something isn't working" }));
    await next(user);
    await step('How much does this affect you?');
    await user.click(screen.getByRole('radio', { name: 'Just a question' }));
    await next(user);
    await step('Tell us what happened');
    await fillDetails(user, answers);
    await next(user);
    await step('Add screenshots (optional)');
    await next(user);
    await step('Check and send');
    await user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await screen.findByRole('status');
    const t = need((await dump<Ticket>(c.handle, 'tickets')).find((x) => x.title === answers.title));
    expect(t).toMatchObject({ featureId: 'other', featureOtherText: 'abc printer' });
  });

  it('checks title (3 to 100) and description (1 to 2000) before moving on', async () => {
    const { c } = await render();
    const user = userEvent.setup();
    await answerUpToDetails(user, { ...answers });
    await fillDetails(user, { title: 'ab', description: 'Something' });
    await next(user);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Tell us what happened' })).toBeTruthy();
    await fillDetails(user, { title: 'x'.repeat(101), description: 'Something' });
    await next(user);
    expect(await screen.findByRole('alert')).toBeTruthy();
    await fillDetails(user, { title: 'Quiz will not start', description: '' });
    await next(user);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Tell us what happened' })).toBeTruthy();
    expect((await dump<Ticket>(c.handle, 'tickets')).filter((t) => t.title === answers.title)).toHaveLength(0);
  });

  it('raises a private staff ticket with the right priority and shows its number and a link to My tickets', async () => {
    const { c } = await render();
    const user = userEvent.setup();
    await answerUpToReview(user, { ...answers, feature: 'Quizzes', impact: "I can't use the app" });
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Share with my manager' }).checked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Send ticket' }));
    expect((await screen.findByRole('status')).textContent).toContain('Your ticket T-1004 has been sent.');
    expect(screen.getByRole('link', { name: 'See my tickets' }).getAttribute('href')).toBe('#/staff/help');
    const t = await ticketNumbered(c.handle, 'T-1004');
    expect(t).toMatchObject({
      raisedBy: c.keys.users['jade'],
      raiserSide: 'staff',
      sharedWithManager: false,
      featureId: 'quizzes',
      issueTypeId: 'notWorking',
      impact: 'blocked',
      priority: 'high',
      status: 'received',
      title: answers.title,
      description: answers.description,
    });
    const messages = (await dump<TicketMessage>(c.handle, 'ticketMessages')).filter((m) => m.ticketId === t.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe(answers.description);
  });

  it('shares with the manager only when Share with my manager is ticked', async () => {
    const { c } = await render();
    const user = userEvent.setup();
    await answerUpToReview(user, { ...answers });
    await user.click(screen.getByRole('checkbox', { name: 'Share with my manager' }));
    await user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await screen.findByRole('status');
    expect((await ticketNumbered(c.handle, 'T-1004')).sharedWithManager).toBe(true);
  });

  it('sends the screen, device, role and app version by default, and not what Jade removed', async () => {
    const { c } = await render();
    const user = userEvent.setup();
    await answerUpToReview(user, { ...answers });
    const group = within(screen.getByRole('group', { name: 'Sent with your ticket' }));
    for (const label of ['Screen', 'Device and browser', 'Your role', 'App version']) {
      expect(group.getByRole('button', { name: `Remove: ${label}` })).toBeTruthy();
    }
    await user.click(group.getByRole('button', { name: 'Remove: Device and browser' }));
    expect(group.getByText('Removed')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await screen.findByRole('status');
    const t = await ticketNumbered(c.handle, 'T-1004');
    expect(Object.keys(t.context).sort()).toEqual(['role', 'screen', 'version']);
    expect(JSON.stringify(t.context)).not.toMatch(/jsdom|Mozilla|Chrome/i);
  });

  it('adds screenshots through the image preparer with the blur boxes and uploads the prepared bytes', async () => {
    const { c } = await render();
    const user = userEvent.setup();
    await answerUpToReview(user, { ...answers }, async () => {
      addScreenshot('one.png');
      const first = within(await screen.findByRole('group', { name: 'Screenshot 1' }));
      expect(first.getByRole('img', { name: 'Preview of screenshot 1' })).toBeTruthy();
      await user.click(first.getByRole('button', { name: 'Add box' }));
      await user.type(first.getByRole('textbox', { name: 'Describe the image (optional)' }), 'The quiz start button');
      addScreenshot('two.png');
      await screen.findByRole('group', { name: 'Screenshot 2' });
      expect(screen.getByText('Do not include information about children.')).toBeTruthy();
      expect(screen.getByText('Location and camera details are removed from images.')).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await screen.findByRole('status');
    expect(hoisted.calls.map((x) => x.boxes.length)).toEqual([1, 0]);
    const t = await ticketNumbered(c.handle, 'T-1004');
    const shots = (
      await dump<{
        id: string;
        purpose?: string;
        mime?: string;
        data?: Uint8Array;
        alt?: string;
        ownerUserId?: string;
      }>(c.handle, 'attachments')
    ).filter((a) => a.purpose === 'ticketScreenshot');
    expect(shots).toHaveLength(2);
    for (const s of shots) {
      expect(s.mime).toBe('image/jpeg');
      expect(Array.from(need(s.data))).toEqual(Array.from(hoisted.prepared));
      expect(s.ownerUserId).toBe(c.keys.users['jade']);
    }
    expect(shots.map((s) => s.alt ?? '').sort()).toEqual(['', 'The quiz start button']);
    expect(shots.filter((s) => s.alt === undefined)).toHaveLength(1);
    const first = need((await dump<TicketMessage>(c.handle, 'ticketMessages')).find((m) => m.ticketId === t.id));
    expect([...first.attachmentIds].sort()).toEqual(shots.map((s) => s.id).sort());
  });

  it('removes a screenshot the person took off, and it is not sent', async () => {
    const { c } = await render();
    const user = userEvent.setup();
    await answerUpToReview(user, { ...answers }, async () => {
      addScreenshot('one.png');
      addScreenshot('two.png');
      const second = within(await screen.findByRole('group', { name: 'Screenshot 2' }));
      await user.click(second.getByRole('button', { name: 'Remove image' }));
      await waitFor(() => {
        expect(screen.queryByRole('group', { name: 'Screenshot 2' })).toBeNull();
      });
    });
    await user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await screen.findByRole('status');
    const t = await ticketNumbered(c.handle, 'T-1004');
    const first = need((await dump<TicketMessage>(c.handle, 'ticketMessages')).find((m) => m.ticketId === t.id));
    expect(first.attachmentIds).toHaveLength(1);
    const shots = (await dump<{ purpose?: string }>(c.handle, 'attachments')).filter(
      (a) => a.purpose === 'ticketScreenshot',
    );
    expect(shots).toHaveLength(1);
  });

  it('allows up to 5 screenshots and refuses a sixth in plain words', async () => {
    await render();
    const user = userEvent.setup();
    await answerUpToDetails(user, { ...answers });
    await fillDetails(user, answers);
    await next(user);
    await step('Add screenshots (optional)');
    for (let n = 1; n <= 5; n++) {
      addScreenshot(`s${n}.png`);
      await screen.findByRole('group', { name: `Screenshot ${n}` });
    }
    addScreenshot('s6.png');
    expect((await screen.findByRole('alert')).textContent).toContain('You can add up to 5 images.');
    expect(screen.queryByRole('group', { name: 'Screenshot 6' })).toBeNull();
    // Images are prepared when the ticket is sent (the blur boxes are only final then): the sixth never is.
    await next(user);
    await step('Check and send');
    await user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await screen.findByRole('status');
    expect(hoisted.calls).toHaveLength(5);
  });

  it('refuses a file that is not a picture', async () => {
    await render();
    const user = userEvent.setup();
    await answerUpToDetails(user, { ...answers });
    await fillDetails(user, answers);
    await next(user);
    await step('Add screenshots (optional)');
    addScreenshot('notes.txt', 'text/plain');
    expect((await screen.findByRole('alert')).textContent).toContain('Please choose a photo.');
    expect(screen.queryByRole('group', { name: 'Screenshot 1' })).toBeNull();
    expect(hoisted.calls).toHaveLength(0);
  });

  it('when staff tickets are switched off shows the reason and no steps', async () => {
    await renderRoute('/staff/help/ticket/new', 'staff', {
      actor: jade,
      prepare: async ({ handle, keys }) => {
        await handle.store.organisation.updateSettings(priya(keys), { allowStaffTickets: false });
      },
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Support requests from staff are switched off. Ask your manager.',
    );
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });
});

describe('S16 Ticket thread', () => {
  const open = async (number: string, prepare?: (c: Ctx) => Promise<void>) => {
    let c!: Ctx;
    const r = await renderRoute('/staff', 'staff', {
      actor: jade,
      prepare: (x) => ((c = x), prepare ? prepare(x) : Promise.resolve()),
    });
    const t = await ticketNumbered(c.handle, number);
    await r.router.navigate(`/staff/help/ticket/${t.id}`);
    return { ...r, c, t };
  };

  it('shows the number as the h1, the messages oldest first, the support reply and the timeline', async () => {
    await open('T-1002');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Ticket T-1002');
    expect(screen.getByText('My notes did not show on my phone')).toBeTruthy();
    const msgs = within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.textContent).toContain('I wrote a note in a lesson but cannot see it on my phone.');
    expect(msgs[1]?.textContent).toContain('Notes are saved on the device you wrote them on.');
    const timeline = within(screen.getByRole('list', { name: 'Status timeline' })).getAllByRole('listitem');
    expect(timeline.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Received'),
      expect.stringContaining('Resolved'),
    ]);
  });

  it('shows an existing rating as text and offers Reopen, but no resolve or rate buttons', async () => {
    await open('T-1002');
    await screen.findByRole('heading', { level: 1, name: 'Ticket T-1002' });
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark as resolved' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Was this helpful?' })).toBeNull();
  });

  it('reopens a resolved ticket and clears the rating', async () => {
    const { c, t } = await open('T-1002');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reopen' }));
    await waitFor(async () => {
      const now = await ticketNumbered(c.handle, 'T-1002');
      expect(now.status).toBe('received');
      expect(now.satisfaction).toBeUndefined();
      expect(now.id).toBe(t.id);
    });
    expect(await screen.findByRole('button', { name: 'Mark as resolved' })).toBeTruthy();
  });

  it('sends a reply that appears at the end of the thread, and rejects an empty one', async () => {
    const { c, t } = await open('T-1002');
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 1, name: 'Ticket T-1002' });
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Thank you, that worked.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => {
      const msgs = within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem');
      expect(msgs).toHaveLength(3);
      expect(msgs[2]?.textContent).toContain('Thank you, that worked.');
    });
    const stored = (await dump<TicketMessage>(c.handle, 'ticketMessages')).filter((m) => m.ticketId === t.id);
    expect(stored.filter((m) => m.side === 'customer').map((m) => m.body)).toContain('Thank you, that worked.');
  });

  it('marks an open ticket as resolved and then offers a rating once', async () => {
    const { c } = await open('T-1002', async ({ handle, keys }) => {
      await handle.store.tickets.reopen(jade(keys), (await ticketNumbered(handle, 'T-1002')).id);
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mark as resolved' }));
    const rate = within(await screen.findByRole('group', { name: 'Was this helpful?' }));
    await user.click(rate.getByRole('button', { name: 'No' }));
    await waitFor(async () => {
      const t = await ticketNumbered(c.handle, 'T-1002');
      expect(t.status).toBe('resolved');
      expect(t.satisfaction).toBe('down');
    });
    expect(screen.queryByRole('group', { name: 'Was this helpful?' })).toBeNull();
  });

  it("gives a plain not-found message for someone else's ticket", async () => {
    let c!: Ctx;
    const r = await renderRoute('/staff', 'staff', { actor: jade, prepare: (x) => ((c = x), Promise.resolve()) });
    await r.router.navigate(`/staff/help/ticket/${(await ticketNumbered(c.handle, 'T-1001')).id}`);
    expect((await screen.findByRole('alert')).textContent).toContain('We could not find that.');
    expect(screen.queryByText(/Training matrix export/)).toBeNull();
  });

  it('shows no reply box on a closed ticket', async () => {
    await open('T-1002', async ({ handle }) => {
      const t = await ticketNumbered(handle, 'T-1002');
      await handle.admin.bulkPut('tickets', [{ ...t, status: 'closed', closedAt: TODAY }]);
    });
    await screen.findByRole('heading', { level: 1, name: 'Ticket T-1002' });
    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  });
});

// M4 chunk 13c (U layer): P13 "Support settings" at /provider/support-settings (BP-11, brief 25.7). Written before the
// implementation. Scope: read-only catalogue lists, Other entries review with Create issue type, saved replies.
// Archive, merge, reorder and aliases need new data ops and are NOT in this chunk.
//
// UI CONTRACT
//   Data: store.otherEntries.review(actor, field) (tickets.read) and store.otherEntries.createIssueType(actor,
//   { groupId, name, ticketIds }) (tickets.write); store.savedReplies.list(actor) (tickets.read) and
//   store.savedReplies.create(actor, { title, body }) (tickets.write). Catalogue lists come from supportFeatures and
//   issueTypes in @sta/content, each item shown as text through its labelKey. The "Create issue type" button and the
//   saved reply form show only when holdsAnywhere(perms, 'tickets.write') (never role names). Tom (read-only provider user)
//   sees every list but no buttons or form. The page re-renders after a change (the store notifies subscribers).
//   Proposed language keys (en-GB):
//     provider.supportSettings.heading "Support settings"
//     provider.supportSettings.features "Features"            (region name)
//     provider.supportSettings.issueTypes "Issue types"       (region name)
//     provider.supportSettings.otherEntries "Other entries review" (region name)
//     provider.supportSettings.field "Review field"           (radiogroup name)
//     provider.supportSettings.field.feature "Feature"   .field.issueType "Issue type"   (radios)
//     provider.supportSettings.usedBy "Used by {count} clients"   (singular: "Used by 1 client")
//     provider.supportSettings.tickets "{count} tickets"          (singular: "1 ticket")
//     provider.supportSettings.trending "Trending"
//     provider.supportSettings.createIssueType "Create issue type"   (button, also the dialog title)
//     provider.supportSettings.name "Name"   .create "Create"   .cancel "Cancel"
//     provider.supportSettings.retagged "Re-tagged {count} tickets"   (singular: "Re-tagged 1 ticket")
//     provider.supportSettings.savedReplies "Saved replies"   (region name)
//     provider.supportSettings.replyTitle "Title"   .replyBody "Body"   .addReply "Add saved reply"
//   P13 /provider/support-settings:
//     - h1 "Support settings".
//     - regions "Features", "Issue types": each catalogue item as text (t(labelKey)), no buttons.
//     - region "Other entries review": radios "Feature" (default, checked) and "Issue type". One
//       data-testid="other-entry-group" per review(field) row, same order, data-group-id = group id. Text has the
//       phrase (group.normalised), "Used by N clients", "N tickets" (group.count), and the text "Trending" on the
//       trending group only.
//     - Issue type groups (tickets.write only) have a "Create issue type" button opening a dialog (@sta/ui Dialog) with a
//       textbox "Name" prefilled with the phrase and one checkbox (data-testid="retag-ticket", data-ticket-id) per ticket
//       in the group, all ticked, and a "Create" button. After Create the dialog closes and
//       data-testid="retag-confirmation" says "Re-tagged N tickets" for the N ticked.
//       Feature groups have no Create button.
//     - region "Saved replies": data-testid="saved-reply" per list() row (data-reply-id), text has the title and the start
//       of the body. Form fields "Title", "Body", button "Add saved reply" (tickets.write only); it calls create and the
//       new title appears in the list.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Ticket } from '@sta/domain';
import { issueTypes, supportFeatures, type MessageKey } from '@sta/content';
import { actorFor, renderRoute, t, TODAY } from '../../test/harness';

// jsdom has no <dialog> methods.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto.showModal !== 'function')
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  if (typeof proto.close !== 'function')
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
});
afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
const tom: Opts = { actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users['tom'] }) };

const openP13 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/support-settings', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Support settings' });
  const actor = { ...(opts?.actor ? opts.actor(view.keys) : actorFor('provider', view.keys)), now: TODAY };
  return { view, actor };
};
const groups = () => screen.getAllByTestId('other-entry-group');
const groupEl = (id: string) => groups().find((g) => g.getAttribute('data-group-id') === id)!;

describe('P13 Support settings', () => {
  it('lists every feature and issue type of the catalogue as text in its own region', async () => {
    await openP13();
    const features = screen.getByRole('region', { name: 'Features' });
    for (const f of supportFeatures) expect(features.textContent).toContain(t(f.labelKey as MessageKey));
    const types = screen.getByRole('region', { name: 'Issue types' });
    for (const i of issueTypes) expect(types.textContent).toContain(t(i.labelKey as MessageKey));
    expect(within(features).queryAllByRole('button')).toHaveLength(0);
    expect(within(types).queryAllByRole('button')).toHaveLength(0);
  });

  it('reviews Feature groups by default and switches to Issue type groups, showing phrase, client count, ticket count and Trending on the trending one only', async () => {
    const { view, actor } = await openP13();
    const region = screen.getByRole('region', { name: 'Other entries review' });
    expect(within(region).getByRole<HTMLInputElement>('radio', { name: 'Feature' }).checked).toBe(true);
    const features = await view.handle.store.otherEntries.review(actor, 'feature');
    expect(groups().map((g) => g.getAttribute('data-group-id'))).toEqual(features.map((g) => g.id));
    expect(groupEl(features.find((g) => g.normalised === 'staff rota')!.id).textContent).toContain('staff rota');

    await userEvent.click(within(region).getByRole('radio', { name: 'Issue type' }));
    const rows = await view.handle.store.otherEntries.review(actor, 'issueType');
    await waitFor(() => {
      expect(groups().map((g) => g.getAttribute('data-group-id'))).toEqual(rows.map((g) => g.id));
    });
    expect(rows.some((g) => g.trending)).toBe(true);
    for (const g of rows) {
      const text = groupEl(g.id).textContent;
      expect(text).toContain(g.normalised);
      expect(text).toContain(g.clientCount === 1 ? 'Used by 1 client' : `Used by ${g.clientCount} clients`);
      expect(text).toContain(g.count === 1 ? '1 ticket' : `${g.count} tickets`);
      if (g.trending) expect(text).toContain('Trending');
      else expect(text).not.toContain('Trending');
    }
  });

  it('opens Create issue type with the phrase prefilled and every ticket of the group ticked', async () => {
    const { view, actor } = await openP13();
    await userEvent.click(screen.getByRole('radio', { name: 'Issue type' }));
    const rows = await view.handle.store.otherEntries.review(actor, 'issueType');
    const trending = rows.find((g) => g.trending)!;
    await waitFor(() => {
      expect(groups()).toHaveLength(rows.length);
    });
    await userEvent.click(within(groupEl(trending.id)).getByRole('button', { name: 'Create issue type' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Name' }).value).toBe(trending.normalised);
    const boxes = within(dialog).getAllByTestId('retag-ticket');
    expect(boxes.map((b) => b.getAttribute('data-ticket-id')).sort()).toEqual([...trending.ticketIds].sort());
    for (const b of boxes) expect((b as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('re-tags only the ticked tickets, confirms the number and leaves an unticked ticket alone', async () => {
    const { view, actor } = await openP13();
    await userEvent.click(screen.getByRole('radio', { name: 'Issue type' }));
    const rows = await view.handle.store.otherEntries.review(actor, 'issueType');
    const trending = rows.find((g) => g.trending)!;
    expect(trending.ticketIds.length).toBeGreaterThan(2);
    await waitFor(() => {
      expect(groups()).toHaveLength(rows.length);
    });
    await userEvent.click(within(groupEl(trending.id)).getByRole('button', { name: 'Create issue type' }));
    const dialog = await screen.findByRole('dialog');
    const boxes = within(dialog).getAllByTestId('retag-ticket');
    const left = boxes[0]!.getAttribute('data-ticket-id')!;
    await userEvent.click(boxes[0]!);
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Certificate download');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    const n = trending.ticketIds.length - 1;
    const confirmation = await screen.findByTestId('retag-confirmation');
    expect(confirmation.textContent).toContain(`Re-tagged ${n} tickets`);
    const stored = ((await view.handle.admin.dumpAll()) as unknown as Record<string, Ticket[]>)['tickets']!;
    const retagged = stored.filter((x) => trending.ticketIds.includes(x.id) && x.issueTypeId !== undefined);
    expect(retagged.map((x) => x.id).sort()).toEqual(trending.ticketIds.filter((id) => id !== left).sort());
    expect(stored.find((x) => x.id === left)!.issueTypeId).toBeUndefined();
  });

  it('lists saved replies with title and the start of the body, and adds a new one', async () => {
    const { view, actor } = await openP13();
    const region = screen.getByRole('region', { name: 'Saved replies' });
    const replies = await view.handle.store.savedReplies.list(actor);
    expect(replies.length).toBeGreaterThan(0);
    const items = within(region).getAllByTestId('saved-reply');
    expect(items.map((i) => i.getAttribute('data-reply-id'))).toEqual(replies.map((r) => r.id));
    for (const r of replies) {
      const text = items.find((i) => i.getAttribute('data-reply-id') === r.id)!.textContent;
      expect(text).toContain(r.title);
      expect(text).toContain(r.body.slice(0, 30));
    }
    await userEvent.type(within(region).getByLabelText('Title'), 'Try again later');
    await userEvent.type(within(region).getByLabelText('Body'), 'Hi, please try again in an hour.');
    await userEvent.click(within(region).getByRole('button', { name: 'Add saved reply' }));
    await waitFor(() => {
      expect(within(region).getAllByTestId('saved-reply')).toHaveLength(replies.length + 1);
    });
    expect(region.textContent).toContain('Try again later');
    const after = await view.handle.store.savedReplies.list(actor);
    expect(after.find((r) => r.title === 'Try again later')?.body).toBe('Hi, please try again in an hour.');
  });

  it('shows a read-only provider user every list but no Create issue type button and no saved reply form', async () => {
    await openP13(tom);
    await userEvent.click(screen.getByRole('radio', { name: 'Issue type' }));
    await waitFor(() => {
      expect(groups().length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: 'Create issue type' })).toBeNull();
    const replies = screen.getByRole('region', { name: 'Saved replies' });
    expect(within(replies).getAllByTestId('saved-reply').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Add saved reply' })).toBeNull();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('offers no Create issue type button on Feature groups', async () => {
    await openP13();
    expect(groups().length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Create issue type' })).toBeNull();
  });
});

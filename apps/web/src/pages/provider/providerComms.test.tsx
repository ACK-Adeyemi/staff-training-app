// M4 chunk 14b (U layer): P14 "Announcements and release notes" at /provider/comms (BP-12, brief 26.2). Written
// before the implementation (Comms is exported from ./Comms.tsx).
//
// UI CONTRACT
//   Data: store.providerComms.listAnnouncements(actor) and createAnnouncement(actor, input) (both comms.send).
//   Release notes: NO read service exists yet (the store has a 'releaseNotes' collection, seeded with 3 notes, but
//   nothing in types.ts reads it). PROPOSED: store.releaseNotes.list(actor): Promise<ReleaseNote[]> (@sta/domain
//   ReleaseNote: id, title, body, date, ...), newest first, readable by any provider actor. The page shows them.
//   Permissions: the page uses holdsAnywhere(perms, 'comms.send') for access and 'comms.sendAll' for the
//   "All clients" audience (never role names). Seeded actors: providerOwner has both; sophie (support) has
//   comms.send but not comms.sendAll; tom (read-only) has neither.
//   Proposed language keys (en-GB), referred to below only by key:
//     provider.comms.heading, .announcements (region), .releaseNotes (region), .noAccess,
//     .audience (radiogroup name), .audience.all, .audience.package, .audience.pack, .audience.clients (radios),
//     .channel (group name), .channel.banner, .channel.notification, .channel.email (checkboxes),
//     .titleField, .messageField, .publishAt, .expiresAt, .preview (region), .help, .send (button),
//     .audienceLabel ("Audience: {audience}"), .channelsLabel ("Channels: {channels}")
//   P14:
//     - h1; region "announcements": data-testid="announcement" per listAnnouncements row, same order, data-announcement-id.
//       Row text: title, an audience word (t('provider.comms.audience.all') etc.) and a channel word per channel
//       (t('provider.comms.channel.banner') ...). Read counts are shown only when the data has them (reads > 0).
//     - Composer (only with comms.send): textboxes title/message, radiogroup audience (no "All clients" radio without
//       comms.sendAll), checkboxes for channels, datetime-local publish-at and expiry, a region "preview"
//       (data-testid="announcement-preview") showing the typed title and message as they change, a help paragraph
//       (data-testid="comms-help") with no billing wording, and a Send button.
//       Package/pack choice shows a select (combobox) naming the package/pack; Selected clients shows a checkbox per client
//       (data-testid="audience-client", data-client-id).
//     - Without comms.send: text t('provider.comms.noAccess'), no composer, no list.
//     - Release notes region: data-testid="release-note" per row, with title.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Announcement, ReleaseNote } from '@sta/domain';
import type { ActorContext, DataStore } from '@sta/data';
import type { MessageKey } from '@sta/content';
import { actorFor, renderRoute, t, TODAY } from '../../test/harness';

afterEach(cleanup);

const k = (key: string) => t(key as MessageKey);
type Opts = Parameters<typeof renderRoute>[2];
const as = (name: string): Opts => ({
  actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users[name]! }),
});
const sophie = as('sophie');
const tom = as('tom');

type WithNotes = { releaseNotes: { list(ctx: ActorContext): Promise<ReleaseNote[]> } };

const openP14 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/comms', 'provider', opts);
  const actor = { ...(opts?.actor ? opts.actor(view.keys) : actorFor('provider', view.keys)), now: TODAY };
  return { view, actor };
};
const heading = () => screen.findByRole('heading', { level: 1, name: k('provider.comms.heading') });
const rows = () => screen.getAllByTestId('announcement');

describe('P14 Announcements and release notes', () => {
  it('lists the seeded announcements with audience and channel words and read counts', async () => {
    const { view, actor } = await openP14();
    await heading();
    const stored: Announcement[] = await view.handle.store.providerComms.listAnnouncements(actor);
    expect(stored).toHaveLength(2);
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    expect(rows().map((r) => r.getAttribute('data-announcement-id'))).toEqual(stored.map((a) => a.id));
    for (const a of stored) {
      const text = rows().find((r) => r.getAttribute('data-announcement-id') === a.id)!.textContent;
      expect(text).toContain(a.title);
      expect(text).toContain(k('provider.comms.audience.all'));
      for (const c of a.channels) expect(text).toContain(k(`provider.comms.channel.${c}`));
      if (a.reads > 0) expect(text).toContain(String(a.reads));
    }
  });

  it('has a composer with title, message, audience choice, channels, publish and expiry', async () => {
    await openP14();
    await heading();
    expect(screen.getByRole('textbox', { name: k('provider.comms.titleField') })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: k('provider.comms.messageField') })).toBeTruthy();
    const audience = screen.getByRole('radiogroup', { name: k('provider.comms.audienceGroup') });
    for (const a of ['all', 'package', 'pack', 'clients'])
      expect(within(audience).getByRole('radio', { name: k(`provider.comms.audience.${a}`) })).toBeTruthy();
    for (const c of ['banner', 'notification', 'email'])
      expect(screen.getByRole('checkbox', { name: k(`provider.comms.channel.${c}`) })).toBeTruthy();
    expect(screen.getByLabelText(k('provider.comms.publishAt'))).toBeTruthy();
    expect(screen.getByLabelText(k('provider.comms.expiresAt'))).toBeTruthy();
    expect(screen.getByRole('button', { name: k('provider.comms.send') })).toBeTruthy();
  });

  it('updates the preview as the title and message are typed', async () => {
    await openP14();
    await heading();
    const preview = screen.getByTestId('announcement-preview');
    await userEvent.type(screen.getByRole('textbox', { name: k('provider.comms.titleField') }), 'Quiet week ahead');
    await userEvent.type(screen.getByRole('textbox', { name: k('provider.comms.messageField') }), 'Nothing to do.');
    expect(preview.textContent).toContain('Quiet week ahead');
    expect(preview.textContent).toContain('Nothing to do.');
    await userEvent.type(screen.getByRole('textbox', { name: k('provider.comms.titleField') }), '!');
    expect(preview.textContent).toContain('Quiet week ahead!');
  });

  it('sends an announcement to all clients, stores it and shows it in the list', async () => {
    const { view, actor } = await openP14();
    await heading();
    await userEvent.type(screen.getByRole('textbox', { name: k('provider.comms.titleField') }), 'New quiz layout');
    await userEvent.type(
      screen.getByRole('textbox', { name: k('provider.comms.messageField') }),
      'Quizzes are easier to read.',
    );
    await userEvent.click(screen.getByRole('radio', { name: k('provider.comms.audience.all') }));
    await userEvent.click(screen.getByRole('checkbox', { name: k('provider.comms.channel.banner') }));
    fireEvent.change(screen.getByLabelText(k('provider.comms.publishAt')), { target: { value: '2026-10-20T09:00' } });
    fireEvent.change(screen.getByLabelText(k('provider.comms.expiresAt')), { target: { value: '2026-10-27T09:00' } });
    await userEvent.click(screen.getByRole('button', { name: k('provider.comms.send') }));

    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    const made = (await view.handle.store.providerComms.listAnnouncements(actor)).find(
      (a) => a.title === 'New quiz layout',
    )!;
    expect(made.body).toBe('Quizzes are easier to read.');
    expect(made.channels).toEqual(['banner']);
    expect(made.audience.clientIds).toBeUndefined();
    expect(made.audience.packageIds).toBeUndefined();
    expect(made.audience.packIds).toBeUndefined();
    expect(made.publishAt.startsWith('2026-10-20')).toBe(true);
    expect(made.expiresAt?.startsWith('2026-10-27')).toBe(true);
    expect(screen.getAllByTestId('announcement').some((r) => r.textContent.includes('New quiz layout'))).toBe(true);
  });

  it('sends to selected clients only', async () => {
    const { view, actor } = await openP14();
    await heading();
    await userEvent.type(screen.getByRole('textbox', { name: k('provider.comms.titleField') }), 'Pilot group note');
    await userEvent.type(screen.getByRole('textbox', { name: k('provider.comms.messageField') }), 'Hello pilot group.');
    await userEvent.click(screen.getByRole('radio', { name: k('provider.comms.audience.clients') }));
    const boxes = await screen.findAllByTestId('audience-client');
    const chosen = boxes[0]!.getAttribute('data-client-id')!;
    await userEvent.click(boxes[0]!);
    await userEvent.click(screen.getByRole('checkbox', { name: k('provider.comms.channel.notification') }));
    await userEvent.click(screen.getByRole('button', { name: k('provider.comms.send') }));
    await waitFor(async () => {
      const list = await view.handle.store.providerComms.listAnnouncements(actor);
      expect(list.find((a) => a.title === 'Pilot group note')?.audience.clientIds).toEqual([chosen]);
    });
  });

  it('offers All clients only to someone holding comms.sendAll', async () => {
    await openP14(sophie);
    await heading();
    const audience = screen.getByRole('radiogroup', { name: k('provider.comms.audienceGroup') });
    expect(within(audience).queryByRole('radio', { name: k('provider.comms.audience.all') })).toBeNull();
    expect(within(audience).getByRole('radio', { name: k('provider.comms.audience.package') })).toBeTruthy();
  });

  it('shows a no-access message and no composer to someone without comms.send', async () => {
    await openP14(tom);
    expect(await screen.findByText(k('provider.comms.noAccess'))).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: k('provider.comms.titleField') })).toBeNull();
    expect(screen.queryByRole('button', { name: k('provider.comms.send') })).toBeNull();
    expect(screen.queryAllByTestId('announcement')).toHaveLength(0);
  });

  it('keeps the composer help free of billing wording', async () => {
    await openP14();
    await heading();
    const help = screen.getByTestId('comms-help').textContent.toLowerCase();
    expect(help.length).toBeGreaterThan(0);
    for (const word of ['payment', 'invoice']) expect(help).not.toContain(word);
  });

  it('lists the seeded release notes newest first', async () => {
    const { view, actor } = await openP14();
    await heading();
    const notes = await (view.handle.store as unknown as DataStore & WithNotes).releaseNotes.list(actor);
    expect(notes).toHaveLength(3);
    const region = screen.getByRole('region', { name: k('provider.comms.releaseNotes') });
    await waitFor(() => {
      expect(within(region).getAllByTestId('release-note')).toHaveLength(3);
    });
    const shown = within(region)
      .getAllByTestId('release-note')
      .map((n) => n.textContent);
    notes.forEach((n, i) => {
      expect(shown[i]).toContain(n.title);
    });
    expect(notes.map((n) => n.date)).toEqual([...notes.map((n) => n.date)].sort().reverse());
  });
});

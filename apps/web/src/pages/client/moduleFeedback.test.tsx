// M3 chunk 16 (BP-14, F-4): the Module feedback inbox C29 at /client/module-feedback. Written before the implementation.
// The item card is the same component as in C8 (see moduleStatsFull.test.tsx for its contract: data-testid
// "feedback-item" with data-feedback-id, data-lesson-id, data-tags; "Anonymous"; Status select; Reply / Send reply;
// Edit this module link with ?lesson=n; Send to the provider / Send note).
//
// UI CONTRACT (data layer = store.moduleFeedback, modules; gate `moduleFeedback.view` held anywhere):
//   h1 "Module feedback"; the More menu link "Module feedback" goes to #/client/module-feedback.
//   Without moduleFeedback.view: role=alert "You don't have access to this. Ask your manager." and no items.
//   Filters, each a labelled select with an "All ..." first option: "Module" ("All modules" then module titles that have
//     feedback), "Status" ("All statuses", New, Reviewed, Actioned, No action needed), "Tag" ("All tags" then tag labels
//     from the feedback tags list). Filtering is client side or through moduleFeedback.list; the list shows
//     only matching items. An element data-testid="feedback-count" reads "<n> items" (or "1 item").
//   Each item also shows the module title and a plain-language kind (Module card, Lesson thumb, Question report), and
//     question reports come first in the list.
//   Empty result: the text "No feedback yet.".
//   App feedback (to the product team) is never shown here.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ForbiddenError, type ActorContext, type StoreHandle } from '@sta/data';
import type { Role, RoleAssignment } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, TODAY } from '../../test/harness';

afterEach(cleanup);

const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
type Ctx = { handle: StoreHandle; keys: SeedKeys };
const priya = (keys: SeedKeys): ActorContext => actorFor('client', keys);
const items = async () => screen.findAllByTestId('feedback-item');
const idOf = (el: HTMLElement) => el.getAttribute('data-feedback-id');
/** The page's filter selects. Every item card also has a "Status" select, so the page filter is looked up in its group. */
const filter = (name: string) => within(screen.getByRole('group', { name: 'Filters' })).getByRole('combobox', { name });

describe('C29 list (BP-14)', () => {
  it('lists every module feedback item of the client, question reports first', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Module feedback' })).toBeTruthy();
    const stored = await ctx.handle.store.moduleFeedback.list(priya(ctx.keys));
    expect(stored.length).toBeGreaterThanOrEqual(20);
    const shown = await waitFor(async () => {
      const list = await items();
      expect(list).toHaveLength(stored.length);
      return list;
    });
    const kinds = shown.map((el) => el.getAttribute('data-kind'));
    const lastReport = kinds.lastIndexOf('questionReport');
    expect(kinds.slice(0, lastReport + 1).every((k) => k === 'questionReport')).toBe(true);
    expect(screen.getByTestId('feedback-count').textContent).toContain(`${String(stored.length)} items`);
  });

  it('never shows app feedback', async () => {
    await renderRoute('/client/module-feedback', 'client');
    await items();
    expect(document.body.textContent).not.toContain('It would help to see my next due date');
    expect(document.body.textContent).not.toContain('The matrix export is slow');
  });

  it('filters by status, module and tag', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    await items();
    const stored = await ctx.handle.store.moduleFeedback.list(priya(ctx.keys));

    await userEvent.selectOptions(filter('Status'), 'Actioned');
    await waitFor(() => {
      expect(screen.getAllByTestId('feedback-item')).toHaveLength(stored.filter((f) => f.status === 'actioned').length);
    });
    await userEvent.selectOptions(filter('Status'), 'All statuses');

    const fireId = need(ctx.keys.modules['fireEvacuation']);
    await userEvent.selectOptions(filter('Module'), fireId);
    await waitFor(() => {
      expect(screen.getAllByTestId('feedback-item')).toHaveLength(stored.filter((f) => f.moduleId === fireId).length);
    });
    await userEvent.selectOptions(filter('Module'), 'All modules');

    await userEvent.selectOptions(filter('Tag'), 'Unclear');
    await waitFor(() => {
      const shown = screen.getAllByTestId('feedback-item');
      expect(shown).toHaveLength(stored.filter((f) => f.tags.includes('unclear')).length);
      for (const el of shown) expect(el.getAttribute('data-tags')).toContain('unclear');
    });
  });

  it('says No feedback yet. when a filter matches nothing', async () => {
    await renderRoute('/client/module-feedback', 'client');
    await items();
    await userEvent.selectOptions(filter('Module'), 'All modules');
    await userEvent.selectOptions(filter('Tag'), 'Hard to use on my phone');
    await userEvent.selectOptions(filter('Status'), 'No action needed');
    expect(await screen.findByText('No feedback yet.')).toBeTruthy();
    expect(screen.queryAllByTestId('feedback-item')).toHaveLength(0);
  });
});

describe('C29 anonymous items (BP-14)', () => {
  it('shows no name for anonymous items and offers no reply', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const shown = await items();
    const stored = await ctx.handle.store.moduleFeedback.list(priya(ctx.keys));
    const anon = stored.filter((f) => f.anonymous);
    expect(anon.length).toBeGreaterThanOrEqual(5);
    for (const f of anon) {
      expect(f).not.toHaveProperty('personId');
      const el = need(shown.find((x) => idOf(x) === f.id));
      expect(within(el).getByText('Anonymous')).toBeTruthy();
      expect(within(el).queryByRole('button', { name: 'Reply' })).toBeNull();
      expect(el.textContent).toContain('This feedback is anonymous, so it cannot be replied to.');
    }
  });

  it('the data layer refuses a reply to anonymous feedback', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const anon = need((await ctx.handle.store.moduleFeedback.list(priya(ctx.keys))).find((f) => f.anonymous));
    await expect(ctx.handle.store.moduleFeedback.reply(priya(ctx.keys), anon.id, 'Hello')).rejects.toMatchObject({
      rule: 'anonymousNoReply',
    });
  });
});

describe('C29 reply, status, edit and escalate (BP-14)', () => {
  it("sends a reply to a named item and puts a notification in that person's centre", async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    await items();
    const stored = await ctx.handle.store.moduleFeedback.list(priya(ctx.keys));
    const jades = need(stored.find((f) => f.personId === ctx.keys.personas['jade'] && f.reply === undefined));
    const card = need((await items()).find((x) => idOf(x) === jades.id));
    await userEvent.click(within(card).getByRole('button', { name: 'Reply' }));
    await userEvent.type(within(card).getByRole('textbox', { name: 'Reply' }), 'Thanks, Jade.');
    await userEvent.click(within(card).getByRole('button', { name: 'Send reply' }));
    expect((await within(card).findByRole('status')).textContent).toContain('Reply sent.');
    const jadeCtx: ActorContext = { ...actorFor('staff', ctx.keys), now: TODAY };
    const notes = await ctx.handle.store.notifications.list(jadeCtx);
    expect(notes.filter((n) => n.kind === 'feedbackReply')).toHaveLength(1);
  });

  it('changes an item status from the select', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const stored = await ctx.handle.store.moduleFeedback.list(priya(ctx.keys));
    const target = need(stored.find((f) => f.status === 'new'));
    const card = need((await items()).find((x) => idOf(x) === target.id));
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Status' }), 'Reviewed');
    await waitFor(async () => {
      expect((await ctx.handle.store.moduleFeedback.get(priya(ctx.keys), target.id)).status).toBe('reviewed');
    });
  });

  it('links an own-module lesson item to the builder at that lesson, and a question report to the builder too', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const fireId = need(ctx.keys.modules['fireEvacuation']);
    const lesson2 = need(
      (await ctx.handle.store.moduleFeedback.list(priya(ctx.keys))).find(
        (f) => f.moduleId === fireId && f.lessonId === 'lesson-2',
      ),
    );
    const card = need((await items()).find((x) => idOf(x) === lesson2.id));
    expect(within(card).getByRole('link', { name: 'Edit this module' }).getAttribute('href')).toMatch(
      new RegExp(`/client/modules/${fireId}/edit\\?lesson=2$`),
    );
    const report = need(
      (await ctx.handle.store.moduleFeedback.list(priya(ctx.keys))).find(
        (f) => f.moduleId === fireId && f.kind === 'questionReport',
      ),
    );
    const reportCard = need((await items()).find((x) => idOf(x) === report.id));
    expect(within(reportCard).getByRole('link', { name: 'Edit this module' }).getAttribute('href')).toMatch(
      new RegExp(`/client/modules/${fireId}/edit`),
    );
  });

  it('escalates provider-module feedback with a note and shows no Edit link for it', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const fireId = need(ctx.keys.modules['fireEvacuation']);
    const target = need(
      (await ctx.handle.store.moduleFeedback.list(priya(ctx.keys))).find(
        (f) => f.moduleId !== fireId && f.escalatedToProvider === undefined && !f.anonymous,
      ),
    );
    const card = need((await items()).find((x) => idOf(x) === target.id));
    expect(within(card).queryByRole('link', { name: 'Edit this module' })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Send to the provider' }));
    await userEvent.type(within(card).getByRole('textbox', { name: 'Add a note for the provider' }), 'Please fix.');
    await userEvent.click(within(card).getByRole('button', { name: 'Send note' }));
    await waitFor(async () => {
      expect((await ctx.handle.store.moduleFeedback.get(priya(ctx.keys), target.id)).escalatedToProvider?.note).toBe(
        'Please fix.',
      );
    });
  });
});

describe('C29 permissions (F-4)', () => {
  const daniel = (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users['daniel']),
    side: 'client',
    clientId: need(keys.clients['littleAcorns']),
    now: TODAY,
  });
  const danielWith =
    (permissionIds: string[]) =>
    async ({ handle, keys }: Ctx) => {
      const userId = need(keys.users['daniel']);
      const role: Role = {
        id: '01TEST0000000000000000D2D2',
        owner: { clientId: need(keys.clients['littleAcorns']) },
        name: 'Feedback test role',
        description: 'Test only',
        colour: '#336699',
        permissionIds,
        system: false,
        version: 1,
        updatedBy: need(keys.users['priya']),
        updatedAt: TODAY,
      };
      const all = ((await handle.admin.dumpAll()) as unknown as { roleAssignments: RoleAssignment[] }).roleAssignments;
      await handle.admin.bulkPut('roles', [role]);
      await handle.admin.bulkPut(
        'roleAssignments',
        all.filter((a) => a.userId === userId).map((a) => ({ ...a, roleIds: [role.id] })),
      );
    };

  it('shows the no-access message and no items without moduleFeedback.view', async () => {
    await renderRoute('/client/module-feedback', 'client', { actor: daniel, prepare: danielWith(['modules.view']) });
    expect((await screen.findByRole('alert')).textContent).toContain(
      "You don't have access to this. Ask your manager.",
    );
    expect(screen.queryAllByTestId('feedback-item')).toHaveLength(0);
  });

  it('shows items but no Reply, Status change or Send to the provider without moduleFeedback.respond', async () => {
    await renderRoute('/client/module-feedback', 'client', {
      actor: daniel,
      prepare: danielWith(['modules.view', 'moduleFeedback.view']),
    });
    const shown = await items();
    expect(shown.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send to the provider' })).toBeNull();
    expect(within(shown[0] as HTMLElement).queryByRole('combobox', { name: 'Status' })).toBeNull();
  });

  it('refuses every client actor the app feedback inbox in the data layer', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    await expect(ctx.handle.store.appFeedback.providerList(priya(ctx.keys))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

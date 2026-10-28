// M3 chunk 16 (BP-14, F-4): the minimal provider views P5 (module feedback on provider modules) at /provider/content and
// P10 (app feedback, read only) at /provider/feedback. Written before the implementation. The rest of P5 and P10 is M4.
//
// UI CONTRACT (data layer = store.moduleFeedback.providerView and store.appFeedback.providerList; gate `feedback.read`
// held by the provider actor via can(); the UI never checks role names):
//   P5 /provider/content keeps its h1 "Content" (nav label = h1). Adds:
//     region "Module feedback" (h2): one data-testid="provider-feedback-module" per provider module that has
//       feedback (data-module-id), sorted by title, holding the module title as a heading, "<n> items" and, when there
//       are ratings, "Average rating: <x>" (from the projection). Inside it one data-testid="provider-feedback-item"
//       per projected item with its kind (Module card, Lesson thumb, Question report), tags (labels), text, status
//       label, and for lessons/questions the lesson or question key. Question reports come first. There is NO name,
//       person id, site, client, reply or escalation note anywhere in the region.
//     region "Our clients' own modules": one data-testid="own-module-counts" per client in the projection reading
//       "<moduleCount> modules, <itemCount> items" (singular "1 module"/"1 item"); never any text of that feedback.
//     a link "App feedback" to /provider/feedback.
//     Without feedback.read: role=alert "You don't have access to this. Ask your manager." and neither region.
//   P10 /provider/feedback: h1 "App feedback", read only (no buttons that change anything). One
//     data-testid="app-feedback-item" per item (data-feedback-id), newest first, showing the kind (Idea, Problem,
//     Praise), the rating when present ("Rating: n of 5"), the text, the status (New, Triaged, Planned, Done, Won't do)
//     and the screen from context ("Screen: S1"). A select "Status" ("All statuses" first) filters the list.
//     It shows no user id and no client or person name. Without feedback.read: the same no-access alert.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ForbiddenError, type ActorContext, type StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const provider = (keys: SeedKeys): ActorContext => actorFor('provider', keys);
const priya = (keys: SeedKeys): ActorContext => actorFor('client', keys);

describe('P5 module feedback on provider modules (BP-14)', () => {
  it('groups projected items per provider module, question reports first, with counts', async () => {
    let ctx!: Ctx;
    await renderRoute('/provider/content', 'provider', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Content' })).toBeTruthy();
    const r = await screen.findByRole('region', { name: 'Module feedback' });
    const view = await ctx.handle.store.moduleFeedback.providerView(provider(ctx.keys));
    expect(view.modules.length).toBeGreaterThan(2);
    const groups = await within(r).findAllByTestId('provider-feedback-module');
    expect(groups.map((g) => g.getAttribute('data-module-id'))).toEqual(view.modules.map((m) => m.moduleId));
    for (const m of view.modules) {
      const g = need(groups.find((x) => x.getAttribute('data-module-id') === m.moduleId));
      expect(within(g).getByRole('heading', { name: m.title })).toBeTruthy();
      expect(g.textContent).toContain(m.itemCount === 1 ? '1 item' : `${String(m.itemCount)} items`);
      expect(within(g).getAllByTestId('provider-feedback-item')).toHaveLength(m.items.length);
      const isReport = within(g)
        .getAllByTestId('provider-feedback-item')
        .map((el) => el.textContent.includes('Question report'));
      expect(isReport).toEqual([...isReport].sort((a, b) => Number(b) - Number(a)));
    }
  });

  it('shows no person, site, client, reply or escalation note anywhere in the feedback regions', async () => {
    let ctx!: Ctx;
    await renderRoute('/provider/content', 'provider', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const r = await screen.findByRole('region', { name: 'Module feedback' });
    await within(r).findAllByTestId('provider-feedback-item');
    const own = await screen.findByRole('region', { name: "Our clients' own modules" });
    const text = `${r.textContent}${own.textContent}`;
    const people = await ctx.handle.store.people.list(priya(ctx.keys));
    for (const p of people) {
      expect(text).not.toContain(`${p.firstName} ${p.lastName}`);
      expect(text).not.toContain(p.id);
    }
    for (const first of ['Hannah', 'Kasia', 'Lucy', 'Zainab', 'Maureen', 'Ellie']) expect(text).not.toContain(first);
    // Replies and escalation notes stored on the seeded items never reach the provider view.
    const stored = await ctx.handle.store.moduleFeedback.list(priya(ctx.keys));
    for (const f of stored) {
      if (f.reply) expect(text).not.toContain(f.reply.text);
      if (f.escalatedToProvider) expect(text).not.toContain(f.escalatedToProvider.note);
    }
    expect(stored.some((f) => f.reply !== undefined)).toBe(true);
  });

  it('shows client-own module feedback only as counts, with none of its text', async () => {
    let ctx!: Ctx;
    await renderRoute('/provider/content', 'provider', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const own = await screen.findByRole('region', { name: "Our clients' own modules" });
    const view = await ctx.handle.store.moduleFeedback.providerView(provider(ctx.keys));
    expect(view.ownModules.length).toBeGreaterThan(0);
    const rows = await within(own).findAllByTestId('own-module-counts');
    expect(rows).toHaveLength(view.ownModules.length);
    view.ownModules.forEach((o, i) => {
      const noun = (n: number, w: string) => (n === 1 ? `1 ${w}` : `${String(n)} ${w}s`);
      expect(rows[i]?.textContent).toContain(`${noun(o.moduleCount, 'module')}, ${noun(o.itemCount, 'item')}`);
    });
    const all = document.body.textContent;
    expect(all).not.toContain('Lesson 2 needs pictures.');
    expect(all).not.toContain('I could not tell how to get the cots down the steps.');
    expect(all).not.toContain('Fire evacuation at Little Acorns');
  });

  it('keeps app feedback out of P5 and links to P10', async () => {
    await renderRoute('/provider/content', 'provider');
    await screen.findByRole('region', { name: 'Module feedback' });
    expect(document.body.textContent).not.toContain('The text is small on my phone');
    expect(screen.getByRole('link', { name: 'App feedback' }).getAttribute('href')).toMatch(/\/provider\/feedback$/);
  });
});

describe('P10 app feedback (BP-14)', () => {
  it('lists every app feedback item read only, with kind, rating, text, status and screen', async () => {
    let ctx!: Ctx;
    await renderRoute('/provider/feedback', 'provider', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'App feedback' })).toBeTruthy();
    const stored = await ctx.handle.store.appFeedback.providerList(provider(ctx.keys));
    expect(stored).toHaveLength(10);
    const shown = await screen.findAllByTestId('app-feedback-item');
    expect(shown).toHaveLength(stored.length);
    const maureen = need(stored.find((f) => f.text.startsWith('The text is small on my phone')));
    const el = need(shown.find((x) => x.getAttribute('data-feedback-id') === maureen.id));
    expect(el.textContent).toContain('Problem');
    expect(el.textContent).toContain('Rating: 3 of 5');
    expect(el.textContent).toContain('The text is small on my phone even after I made it bigger.');
    expect(el.textContent).toContain('New');
    expect(el.textContent).toContain('Screen: S2');
    expect(el.textContent).not.toContain(maureen.userId);
    expect(screen.queryByRole('button', { name: /reply|delete|save|convert|triage/i })).toBeNull();
  });

  it('filters by status', async () => {
    let ctx!: Ctx;
    await renderRoute('/provider/feedback', 'provider', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    await screen.findAllByTestId('app-feedback-item');
    const stored = await ctx.handle.store.appFeedback.providerList(provider(ctx.keys));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Triaged');
    await waitFor(() => {
      expect(screen.getAllByTestId('app-feedback-item')).toHaveLength(
        stored.filter((f) => f.status === 'triaged').length,
      );
    });
  });

  it('is refused to every client actor in the data layer and absent from the client inbox', async () => {
    let ctx!: Ctx;
    await renderRoute('/client/module-feedback', 'client', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    await expect(ctx.handle.store.appFeedback.providerList(priya(ctx.keys))).rejects.toBeInstanceOf(ForbiddenError);
    await screen.findAllByTestId('feedback-item');
    expect(document.body.textContent).not.toContain('The text is small on my phone');
  });
});

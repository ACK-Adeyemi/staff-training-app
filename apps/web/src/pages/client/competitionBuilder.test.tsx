// M2 chunk 16 (BP-3, F-5): C12 Competition builder, /client/competitions/new and /client/competitions/:id/edit.
// Contract the implementer must provide:
//   h1 "New competition" (new) or "Edit competition" (edit).
//   radiogroup "Type" with radios "Built-in template" (default) and "Custom".
//   Built-in: radiogroup "Template" with one radio per template, named by competition.templates.<id>.name (for example
//     "Mastery Month"). Choosing one shows its "How to win" text and its reasoning (competition.templates.<id>.why) in an
//     element with data-testid="template-why". Custom has no template, no live leaderboard switch, no winner selection.
//   textbox "Name"; textbox "Description"; date inputs "Start date" and "End date" (value yyyy-mm-dd).
//   textbox "Prize"; button "Suggest a prize" fills the Prize textbox with the next of the active pack's 20 suggestions
//     (domain nextSuggestion with the injected seeded Rng; the walk state is kept while the page is open); the text stays
//     editable; button "Clear prize" empties the field and moves focus to it; the prize disclaimer text
//     (competition.prizeDisclaimer) is always shown near the field.
//   switch "Show live leaderboard" (built-in only); switch "Closed-book only" (built-in, data layer entitlement closedBookCompetitions;
//     when not entitled it is disabled and a plain explanation is shown next to it with role "note").
//   Region "Banner preview" shows what staff see (name and prize).
//   Buttons "Save draft" and "Publish". Errors from the data layer or validation show in a role alert next to the buttons:
//     end before start -> "End date must be after the start date"; Publish with no prize -> "Add a prize before you publish."
//   After Save draft or Publish the app navigates to /client/competitions. Edit of a started competition: Template radios disabled
//     (metric locked) with the text "You cannot change what is measured once a competition has started."
//   A user without competitions.manage sees role alert "You do not have permission to see this page." and no form.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import prizes from '../../../../../packages/content/src/packs/nursery/prizes.json';
import { actorFor, renderRoute } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(cleanup);

const prizeBox = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Prize' });
const setDate = async (label: string, value: string) => {
  const el = screen.getByLabelText<HTMLInputElement>(label);
  await userEvent.clear(el);
  await userEvent.type(el, value);
};

describe('C12 prize button (BP-3)', () => {
  it('fills the Prize field from the nursery list, never repeating the previous suggestion over 100 presses', async () => {
    await renderRoute('/client/competitions/new', 'client');
    const button = await screen.findByRole('button', { name: 'Suggest a prize' });
    let prev = '';
    for (let i = 0; i < 100; i++) {
      await userEvent.click(button);
      const v = prizeBox().value;
      expect(prizes, `press ${i}`).toContain(v);
      expect(v, `press ${i}`).not.toBe(prev);
      prev = v;
    }
  }, 60_000);

  it('covers all 20 suggestions once in the first 20 presses', async () => {
    await renderRoute('/client/competitions/new', 'client');
    const button = await screen.findByRole('button', { name: 'Suggest a prize' });
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      await userEvent.click(button);
      seen.push(prizeBox().value);
    }
    expect(prizes).toHaveLength(20);
    expect([...seen].sort()).toEqual([...prizes].sort());
  });

  it('keeps the text editable after a suggestion', async () => {
    await renderRoute('/client/competitions/new', 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest a prize' }));
    const before = prizeBox().value;
    await userEvent.type(prizeBox(), ' plus cake');
    expect(prizeBox().value).toBe(`${before} plus cake`);
  });

  it('clears the field with the clear button and puts focus back in the field', async () => {
    await renderRoute('/client/competitions/new', 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Suggest a prize' }));
    expect(prizeBox().value).not.toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Clear prize' }));
    expect(prizeBox().value).toBe('');
    expect(document.activeElement).toBe(prizeBox());
  });

  it('always shows the prize disclaimer', async () => {
    await renderRoute('/client/competitions/new', 'client');
    expect(
      await screen.findByText(
        'The client provides and pays for the prize and is responsible for any tax, payroll or legal implications.',
      ),
    ).toBeTruthy();
  });
});

describe('C12 builder form (F-5)', () => {
  it('shows the template reasoning when a template is chosen', async () => {
    await renderRoute('/client/competitions/new', 'client');
    await userEvent.click(await screen.findByRole('radio', { name: 'Mastery Month' }));
    expect(screen.getByTestId('template-why').textContent).toContain('It rewards real knowledge.');
    expect(screen.getByText(/Master the most modules in the period/)).toBeTruthy();
  });

  it('offers no template, leaderboard or winner choices for a custom competition', async () => {
    await renderRoute('/client/competitions/new', 'client');
    await userEvent.click(await screen.findByRole('radio', { name: 'Custom' }));
    expect(screen.queryByRole('radiogroup', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Show live leaderboard' })).toBeNull();
  });

  it('publishes a built-in competition that then lists as Live and exists in the data layer', async () => {
    const view = await renderRoute('/client/competitions/new', 'client');
    await userEvent.click(await screen.findByRole('radio', { name: 'Mastery Month' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Winter Mastery');
    await userEvent.click(screen.getByRole('button', { name: 'Suggest a prize' }));
    await setDate('Start date', '2026-10-19');
    await setDate('End date', '2026-11-18');
    const lb = screen.getByRole('switch', { name: 'Show live leaderboard' });
    if (lb.getAttribute('aria-checked') !== 'true') await userEvent.click(lb);
    expect(within(screen.getByRole('region', { name: 'Banner preview' })).getByText(/Winter Mastery/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('region', { name: 'Live' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Live' })).getByText('Winter Mastery')).toBeTruthy();
    const all = await view.handle.store.competitions.list(actorFor('client', view.keys));
    const c = all.find((x) => x.name === 'Winter Mastery')!;
    expect(c).toMatchObject({ type: 'builtIn', templateId: 'masteryMonth', liveLeaderboard: true });
    expect(prizes).toContain(c.prizeText);
  });

  it('saves a draft that lists under Draft', async () => {
    await renderRoute('/client/competitions/new', 'client');
    await userEvent.click(await screen.findByRole('radio', { name: 'Custom' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Cake day');
    await userEvent.type(prizeBox(), 'A cake');
    await setDate('Start date', '2026-11-02');
    await setDate('End date', '2026-11-09');
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    const draft = await screen.findByRole('region', { name: 'Draft' });
    expect(within(draft).getByText('Cake day')).toBeTruthy();
  });

  it('refuses an end date before the start date with a plain message and saves nothing', async () => {
    const view = await renderRoute('/client/competitions/new', 'client');
    await userEvent.click(await screen.findByRole('radio', { name: 'Custom' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Backwards');
    await userEvent.type(prizeBox(), 'A cake');
    await setDate('Start date', '2026-11-09');
    await setDate('End date', '2026-11-02');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect((await screen.findByRole('alert')).textContent).toContain('End date must be after the start date');
    const all = await view.handle.store.competitions.list(actorFor('client', view.keys));
    expect(all.find((x) => x.name === 'Backwards')).toBeUndefined();
  });

  it('asks for a prize before publishing', async () => {
    await renderRoute('/client/competitions/new', 'client');
    await userEvent.click(await screen.findByRole('radio', { name: 'Custom' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'No prize');
    await setDate('Start date', '2026-11-02');
    await setDate('End date', '2026-11-09');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Add a prize before you publish.');
  });

  it('locks the template of a started competition when editing', async () => {
    const r = await renderRoute('/client/competitions', 'client');
    const mm = (await r.handle.store.competitions.list(actorFor('client', r.keys))).find(
      (c) => c.name === 'Mastery Month',
    )!;
    cleanup();
    await renderRoute(`/client/competitions/${mm.id}/edit`, 'client');
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit competition' })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' }).value).toBe('Mastery Month');
    for (const radio of within(screen.getByRole('radiogroup', { name: 'Template' })).getAllByRole('radio')) {
      expect((radio as HTMLInputElement).disabled).toBe(true);
    }
    expect(screen.getByText('You cannot change what is measured once a competition has started.')).toBeTruthy();
  });

  it('explains the closed-book switch is unavailable and disables it when the package lacks the feature', async () => {
    await renderRoute('/client/competitions/new', 'client', {
      prepare: async ({ handle, keys }) => {
        const d = (await handle.admin.dumpAll()) as Record<string, Record<string, unknown>[]>;
        const subs = d.subscriptions!.filter((s) => s['clientId'] === keys.clients.littleAcorns);
        const essentials = d.packages!.find((p) => /essentials/i.test(String(p['name'])));
        if (essentials)
          await handle.admin.bulkPut(
            'subscriptions',
            subs.map((s) => ({ ...s, packageId: essentials['id'] })),
          );
      },
    });
    await userEvent.click(await screen.findByRole('radio', { name: 'Closed-Book Challenge' }));
    const sw = screen.getByRole('switch', { name: 'Closed-book only' });
    // Essentials does not include the closed-book entitlement, so the switch is disabled and explained.
    await waitFor(() => {
      expect((sw as HTMLButtonElement).disabled).toBe(true);
    });
    expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
  });
});

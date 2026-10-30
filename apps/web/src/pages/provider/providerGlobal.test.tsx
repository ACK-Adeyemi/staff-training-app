// M4 chunk 16: P21 "Global content" at /provider/global (brief 13.3, 16.3, 19.2, 19.4). Written before the
// implementation (component `GlobalContent` in ./GlobalContent.tsx, route /provider/global, a "More" item in the
// provider shell).
//
// UI CONTRACT
//   Data: seasonal themes (themePresets), global FAQs (faqs), badges (badgeDefinitions) and levels (levelConfig) are read
//   from @sta/content and shown as text through their keys. Prize suggestions come from the new
//   store.globalContent.get(actor) (content.read) and are edited with addPrizeSuggestion / removePrizeSuggestion
//   (content.write); see packages/data/src/contract/providerGlobalAi.ts. The page checks
//   holdsAnywhere(perms, 'content.read') for the page and 'content.write' for the edit controls, never role names.
//   Edits write audit 'globalContent.prizeAdded' / 'globalContent.prizeRemoved'.
//   Proposed language keys (en-GB):
//     nav.provider.global "Global content"
//     provider.global.heading "Global content"   .noAccess "You do not have access to global content."
//     provider.global.readOnly "You can look at global content but not change it."
//     provider.global.themes "Seasonal themes"  .prizes "Prize suggestions"  .faqs "Global FAQs"  .badges "Badges"
//       .levels "Levels"   (region names)
//     provider.global.level "Level {level}"   .levelFrom "{xp} XP"
//     provider.global.prizeDisclaimer "The client provides and pays for the prize and is responsible for any tax, payroll or legal implications."
//     provider.global.newPrize "New prize suggestion" (textbox)   .addPrize "Add prize suggestion" (button)
//     provider.global.removePrize "Remove {text}" (button per suggestion)
//     provider.global.prizeAdded "Added to the prize suggestions."   (role=status)   .prizeRemoved "Removed from the prize suggestions."
//     provider.global.prizeDuplicate "That suggestion is already in the list."   (role=alert)
//     provider.global.prizeInvalid "Type a suggestion of up to 120 characters."    (role=alert, blank or too long)
//     provider.global.loadError "Could not load global content."
//   h1 "Global content". Regions as named above:
//     "Seasonal themes": data-testid="theme-preset" (data-theme-id) per themePresets entry, text t(nameKey).
//     "Prize suggestions": data-testid="prize-suggestion" per store list entry (same order), the disclaimer text, and
//       (content.write only) a textbox "New prize suggestion", button "Add prize suggestion" and per-row button
//       "Remove <text>". Adding shows the new row at the end and the status text; the box is cleared.
//     "Global FAQs": data-testid="global-faq" (data-faq-id) per faqs entry, text t(questionKey).
//     "Badges": data-testid="badge-definition" (data-badge-id) per badgeDefinitions entry, text t(nameKey).
//     "Levels": data-testid="level-definition" per levelConfig.thresholds entry, text "Level N" and "{xp} XP".
//   Without content.read (Support): only the no-access message. Read-only (content.read only): all regions, no
//   textbox or buttons, and the read-only notice.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { badgeDefinitions, faqs, levelConfig, nurseryPack, themePresets } from '@sta/content';
import type { AuditEvent } from '@sta/domain';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { renderRoute, t } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
type Ctx = { handle: StoreHandle; keys: SeedKeys };
const as = (key: string): Opts => ({
  actor: (keys) => ({ userId: keys.users[key]!, side: 'provider', now: '2026-10-19T09:00:00.000Z' }),
});
const key = (k: string) => k as Parameters<typeof t>[0];

const openP21 = async (opts?: Opts) => {
  let ctx!: Ctx;
  await renderRoute('/provider/global', 'provider', {
    ...opts,
    prepare: (c) => {
      ctx = c;
      return Promise.resolve();
    },
  });
  await screen.findByRole('heading', { level: 1, name: 'Global content' });
  return ctx;
};
const prizes = (region: HTMLElement) =>
  within(region)
    .queryAllByTestId('prize-suggestion')
    .map((r) => r.textContent);

describe('P21 Global content', () => {
  it('lists every seasonal theme preset by name', async () => {
    await openP21();
    const region = screen.getByRole('region', { name: 'Seasonal themes' });
    const rows = within(region).getAllByTestId('theme-preset');
    expect(rows.map((r) => r.getAttribute('data-theme-id'))).toEqual(themePresets.map((p) => p.id));
    expect(
      within(rows.find((r) => r.getAttribute('data-theme-id') === 'christmas')!).getByText('Christmas'),
    ).toBeTruthy();
  });

  it('lists the prize suggestions with the client-pays disclaimer', async () => {
    await openP21();
    const region = screen.getByRole('region', { name: 'Prize suggestions' });
    await waitFor(() => {
      expect(prizes(region)).toEqual(nurseryPack.prizeSuggestions);
    });
    expect(
      within(region).getByText(
        'The client provides and pays for the prize and is responsible for any tax, payroll or legal implications.',
      ),
    ).toBeTruthy();
  });

  it('lists every global FAQ question', async () => {
    await openP21();
    const region = screen.getByRole('region', { name: 'Global FAQs' });
    const rows = within(region).getAllByTestId('global-faq');
    expect(rows.map((r) => r.getAttribute('data-faq-id'))).toEqual(faqs.map((f) => f.id));
    expect(rows[0]!.textContent).toContain(t(key(faqs[0]!.questionKey)));
  });

  it('lists every badge definition by name', async () => {
    await openP21();
    const region = screen.getByRole('region', { name: 'Badges' });
    const rows = within(region).getAllByTestId('badge-definition');
    expect(rows.map((r) => r.getAttribute('data-badge-id'))).toEqual(badgeDefinitions.map((b) => b.id));
    expect(rows[0]!.textContent).toContain(t(key(badgeDefinitions[0]!.nameKey)));
  });

  it('lists the level thresholds', async () => {
    await openP21();
    const region = screen.getByRole('region', { name: 'Levels' });
    const rows = within(region).getAllByTestId('level-definition');
    expect(rows).toHaveLength(levelConfig.thresholds.length);
    expect(rows[1]!.textContent).toContain('Level 2');
    expect(rows[1]!.textContent).toContain(`${String(levelConfig.thresholds[1])} XP`);
  });

  it('adds a prize suggestion at the end, clears the box, persists it and writes an audit event', async () => {
    const ctx = await openP21();
    const region = screen.getByRole('region', { name: 'Prize suggestions' });
    await waitFor(() => {
      expect(prizes(region)).toHaveLength(nurseryPack.prizeSuggestions.length);
    });
    const box = within(region).getByRole('textbox', { name: 'New prize suggestion' });
    await userEvent.type(box, 'Gift hamper (up to 25 pounds)');
    await userEvent.click(within(region).getByRole('button', { name: 'Add prize suggestion' }));
    await waitFor(() => {
      expect(prizes(region).at(-1)).toBe('Gift hamper (up to 25 pounds)');
    });
    expect((box as HTMLInputElement).value).toBe('');
    expect((await within(region).findByRole('status')).textContent).toContain('Added to the prize suggestions.');
    const stored = await (
      ctx.handle.store as unknown as {
        globalContent: { get(a: unknown): Promise<{ prizeSuggestions: string[] }> };
      }
    ).globalContent.get({ userId: ctx.keys.users['providerOwner'], side: 'provider', now: '2026-10-19T09:00:00.000Z' });
    expect(stored.prizeSuggestions.at(-1)).toBe('Gift hamper (up to 25 pounds)');
    const events = ((await ctx.handle.admin.dumpAll())['audit'] as AuditEvent[]).filter(
      (e) => e.action === 'globalContent.prizeAdded',
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.actorId).toBe(ctx.keys.users['providerOwner']);
  });

  it('removes a prize suggestion and writes an audit event', async () => {
    const ctx = await openP21();
    const region = screen.getByRole('region', { name: 'Prize suggestions' });
    const first = nurseryPack.prizeSuggestions[0]!;
    await waitFor(() => {
      expect(prizes(region)).toContain(first);
    });
    await userEvent.click(within(region).getByRole('button', { name: `Remove ${first}` }));
    await waitFor(() => {
      expect(prizes(region)).not.toContain(first);
    });
    expect((await within(region).findByRole('status')).textContent).toContain('Removed from the prize suggestions.');
    const events = ((await ctx.handle.admin.dumpAll())['audit'] as AuditEvent[]).filter(
      (e) => e.action === 'globalContent.prizeRemoved',
    );
    expect(events).toHaveLength(1);
  });

  it('refuses a repeated or blank suggestion with a plain message and no audit event', async () => {
    const ctx = await openP21();
    const region = screen.getByRole('region', { name: 'Prize suggestions' });
    await waitFor(() => {
      expect(prizes(region)).toHaveLength(nurseryPack.prizeSuggestions.length);
    });
    const box = within(region).getByRole('textbox', { name: 'New prize suggestion' });
    await userEvent.type(box, nurseryPack.prizeSuggestions[0]!);
    await userEvent.click(within(region).getByRole('button', { name: 'Add prize suggestion' }));
    expect((await within(region).findByRole('alert')).textContent).toContain('That suggestion is already in the list.');
    await userEvent.clear(box);
    await userEvent.click(within(region).getByRole('button', { name: 'Add prize suggestion' }));
    await waitFor(() => {
      expect(within(region).getByRole('alert').textContent).toContain('Type a suggestion of up to 120 characters.');
    });
    expect(prizes(region)).toHaveLength(nurseryPack.prizeSuggestions.length);
    const events = ((await ctx.handle.admin.dumpAll())['audit'] as AuditEvent[]).filter((e) =>
      e.action.startsWith('globalContent.'),
    );
    expect(events).toHaveLength(0);
  });

  it('shows everything but no edit controls to a content.read holder without content.write (Tom, Read-only)', async () => {
    await openP21(as('tom'));
    const region = screen.getByRole('region', { name: 'Prize suggestions' });
    await waitFor(() => {
      expect(prizes(region)).toHaveLength(nurseryPack.prizeSuggestions.length);
    });
    expect(screen.getByText('You can look at global content but not change it.')).toBeTruthy();
    expect(within(region).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(region).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByTestId('theme-preset').length).toBeGreaterThan(0);
  });

  it('shows only a no-access message to someone without content.read (Support)', async () => {
    await renderRoute('/provider/global', 'provider', as('sophie'));
    expect(await screen.findByText('You do not have access to global content.')).toBeTruthy();
    expect(screen.queryAllByTestId('prize-suggestion')).toHaveLength(0);
    expect(screen.queryAllByTestId('theme-preset')).toHaveLength(0);
  });

  it('is reachable from the provider navigation', async () => {
    await renderRoute('/provider', 'provider');
    const links = await screen.findAllByRole('link', { name: 'Global content' });
    expect(links.some((l) => /\/provider\/global$/.test(l.getAttribute('href') ?? ''))).toBe(true);
  });
});

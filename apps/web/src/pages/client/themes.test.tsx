// M3 chunk 19b (BP-7, F-5): C17 Themes, /client/themes. Written before the implementation.
//
// UI CONTRACT (data layer = store.themes.list/save/remove/setBase/active (gated by themes.view / themes.manage and the
// themesEdit account feature; RuleError 'invalidTheme', NotEntitledError 'savedThemes'); content = themePresets (ids and
// tokens; names come from language key themes.presets.<id>), themeBases; domain = validateTheme, themeBases.light,
// contrastRatio; UI parts = ColourField, ContrastCheck, PhoneFrame from @sta/ui. All text comes from language files.
// The page checks permissions with can('themes.view') / can('themes.manage'), never role names.)
//
//   h1 "Themes". Little Acorns (Standard package, 5 saved themes allowed) has 2 stored themes: "Little Acorns green"
//   (base, no schedule) and "Christmas" (scheduled 1 Dec to 6 Jan).
//   Element data-testid="saved-count" text "<n> of <limit> saved themes", n = stored themes of the client
//     (themes.list length), limit the savedThemes entitlement ("unlimited" shows "<n> saved themes").
//   Region "Ready-made themes": one li per themePresets entry (11), the name from themes.presets.<id> (for example
//     "Spring"), each with a button "Use <name>" (for example "Use Spring"). Using a preset stores a copy
//     (name = preset name, preset = preset id, same tokens, appliesTo both, no schedule) and makes it the base theme
//     (themes.save then themes.setBase). Using a preset whose copy is already stored does not store a second copy.
//   Region "Your themes": one li per stored theme, text has the name, a note "Base theme" on the base one and a
//     schedule line "Shows 1 Dec 2026 to 6 Jan 2027" on a scheduled one (day month year, London days, end date shown is
//     the last day, so endAt 7 Jan 00:00 London reads 6 Jan 2027), and buttons "Use <name>" (setBase), "Edit <name>"
//     (loads the builder) and "Delete <name>" (themes.remove; the list and the count update).
//   Region "Theme builder": textbox "Theme name"; three ColourField groups named "Main colour", "Accent colour" and
//     "Background tint" (each with its own hex textbox and colour picker; edit the hex textbox); radiogroup "Corner
//     style" with radios "Small", "Medium", "Large" (radius sm, md, lg); group "Show on" with checkboxes "Staff app"
//     and "Admin app" (both ticked for a new theme); textboxes-by-label (date inputs) "Show from" and "Show until"
//     (yyyy-mm-dd; both empty means no schedule; "Show until" is the LAST day shown); button "Save theme".
//     There is no colour field for status, error, success, warning or text colours.
//   Contrast list inside the builder: four elements data-testid="contrast-row", in this order, each with the pair label
//     "Text on the background tint", "Button text on the main colour", "Main colour on the page background",
//     "Accent colour on the page background", the ratio, and "Passes" or "Fails" text (not colour alone).
//   Saving a theme that fails validateTheme(tokens, themeBases.light) is refused: nothing is stored and a role alert
//     lists each failing pair label with its needed ratio ("4.5:1" or "3:1").
//   If the data layer refuses a new theme with the savedThemes limit, a role alert says "You have reached the number of
//     saved themes your package includes."
//   Region "Staff app preview" (PhoneFrame title) holds an element data-testid="theme-preview" whose inline style sets
//     --theme-primary, --theme-accent, --theme-tint and --theme-radius from the builder's current values (radius sm 4px,
//     md 8px, lg 16px), updating as fields change.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import { themePresets } from '@sta/content';
import { themeBases, validateTheme } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const listThemes = (view: { handle: StoreHandle; keys: SeedKeys }) =>
  view.handle.store.themes.list(actorFor('client', view.keys));

const hex = (group: string) =>
  within(screen.getByRole('group', { name: group })).getByRole<HTMLInputElement>('textbox');
async function setHex(group: string, value: string) {
  const box = hex(group);
  await userEvent.clear(box);
  await userEvent.type(box, value);
}
const nameBox = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Theme name' });
async function build(name: string, main: string, accent: string, tint: string) {
  await screen.findByRole('region', { name: 'Theme builder' });
  await userEvent.clear(nameBox());
  await userEvent.type(nameBox(), name);
  await setHex('Main colour', main);
  await setHex('Accent colour', accent);
  await setHex('Background tint', tint);
}
const GOOD = ['#1f5fa8', '#0b7a5c', '#f3f7fb'] as const;
const mine = (name: string) =>
  within(screen.getByRole('region', { name: 'Your themes' }))
    .getByText(name)
    .closest('li')!;

describe('C17 Themes page (BP-7)', () => {
  it('shows the heading, the saved count and the two seeded themes with the schedule and base note', async () => {
    await renderRoute('/client/themes', 'client');
    expect(await screen.findByRole('heading', { level: 1, name: 'Themes' })).toBeTruthy();
    expect((await screen.findByTestId('saved-count')).textContent).toBe('2 of 5 saved themes');
    expect(mine('Little Acorns green').textContent).toContain('Base theme');
    expect(mine('Christmas').textContent).toContain('Shows 1 Dec 2026 to 6 Jan 2027');
    expect(mine('Christmas').textContent).not.toContain('Base theme');
  });

  it('lists all eleven ready-made themes, each with a Use button', async () => {
    await renderRoute('/client/themes', 'client');
    const region = await screen.findByRole('region', { name: 'Ready-made themes' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(themePresets.length);
    expect(within(region).getByRole('button', { name: 'Use Spring' })).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Use Default dark' })).toBeTruthy();
  });

  it('stores a copy of a preset and makes it the base theme, counting it in the saved themes', async () => {
    const view = await renderRoute('/client/themes', 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Use Spring' }));
    await waitFor(async () => {
      expect(await listThemes(view)).toHaveLength(3);
    });
    const spring = need((await listThemes(view)).find((t) => t.preset === 'spring'));
    expect(spring.tokens).toEqual(need(themePresets.find((p) => p.id === 'spring')).tokens);
    expect(spring.schedule).toBeUndefined();
    expect(spring.appliesTo).toEqual({ staff: true, admin: true });
    const active = await view.handle.store.themes.active(actorFor('client', view.keys), 'staff');
    expect(active?.id).toBe(spring.id);
    expect((await screen.findByTestId('saved-count')).textContent).toBe('3 of 5 saved themes');
    await waitFor(() => {
      expect(mine('Spring').textContent).toContain('Base theme');
    });
  });

  it('does not store a second copy when the same preset is used twice', async () => {
    const view = await renderRoute('/client/themes', 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Use Spring' }));
    await waitFor(async () => {
      expect(await listThemes(view)).toHaveLength(3);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Use Spring' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use Little Acorns green' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use Spring' }));
    await waitFor(async () => {
      expect((await listThemes(view)).filter((t) => t.preset === 'spring')).toHaveLength(1);
    });
  });

  it('makes a saved theme the base with its Use button', async () => {
    const view = await renderRoute('/client/themes', 'client');
    await screen.findByRole('region', { name: 'Your themes' });
    const yourThemes = screen.getByRole('region', { name: 'Your themes' });
    await userEvent.click(within(yourThemes).getByRole('button', { name: 'Use Christmas' }));
    await waitFor(() => {
      expect(mine('Christmas').textContent).toContain('Base theme');
    });
    const christmas = need((await listThemes(view)).find((t) => t.name === 'Christmas'));
    expect(
      ((await view.handle.admin.dumpAll()) as Record<string, { id: string; settings?: { themeId?: string } }[]>)[
        'clients'
      ]!.find((c) => c.id === view.keys.clients['littleAcorns'])!.settings?.themeId,
    ).toBe(christmas.id);
  });

  it('deletes a theme and updates the list and the count', async () => {
    const view = await renderRoute('/client/themes', 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Christmas' }));
    await waitFor(async () => {
      expect((await listThemes(view)).map((t) => t.name)).toEqual(['Little Acorns green']);
    });
    expect((await screen.findByTestId('saved-count')).textContent).toBe('1 of 5 saved themes');
    expect(within(screen.getByRole('region', { name: 'Your themes' })).queryByText('Christmas')).toBeNull();
  });
});

describe('C17 builder (BP-7)', () => {
  it('saves a custom theme with a schedule, applying to staff only', async () => {
    const view = await renderRoute('/client/themes', 'client');
    await build('Spring fair', ...GOOD);
    await userEvent.click(screen.getByRole('radio', { name: 'Large' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Show on' })).getByRole('checkbox', { name: 'Admin app' }),
    );
    await userEvent.type(screen.getByLabelText('Show from'), '2027-04-01');
    await userEvent.type(screen.getByLabelText('Show until'), '2027-04-12');
    await userEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await waitFor(async () => {
      expect(await listThemes(view)).toHaveLength(3);
    });
    const t = need((await listThemes(view)).find((x) => x.name === 'Spring fair'));
    expect(t.tokens).toMatchObject({ primary: GOOD[0], accent: GOOD[1], backgroundTint: GOOD[2], radius: 'lg' });
    expect(t.appliesTo).toEqual({ staff: true, admin: false });
    // The last day shown is 12 April, so the schedule ends at the start of 13 April London time (BST, so 12 April 23:00 UTC).
    expect(t.schedule).toEqual({ startAt: '2027-03-31T23:00:00.000Z', endAt: '2027-04-12T23:00:00.000Z' });
    expect((await screen.findByTestId('saved-count')).textContent).toBe('3 of 5 saved themes');
  });

  it('refuses a save that fails contrast, lists the failing pairs and stores nothing', async () => {
    const view = await renderRoute('/client/themes', 'client');
    // Pale yellow main colour: white button text and the page background both fail; a dark tint keeps the text check failing too.
    const bad = ['#ffee88', '#ffff99', '#222222'] as const;
    expect(
      validateTheme({ primary: bad[0], accent: bad[1], backgroundTint: bad[2], radius: 'md' }, themeBases.light)
        .failures.length,
    ).toBe(4);
    await build('Too pale', ...bad);
    await userEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    const alert = await screen.findByRole('alert');
    for (const label of [
      'Text on the background tint',
      'Button text on the main colour',
      'Main colour on the page background',
      'Accent colour on the page background',
    ])
      expect(alert.textContent).toContain(label);
    expect(alert.textContent).toContain('4.5:1');
    expect(alert.textContent).toContain('3:1');
    expect(await listThemes(view)).toHaveLength(2);
  });

  it('lists only the failing pair when one pair fails', async () => {
    const view = await renderRoute('/client/themes', 'client');
    // Good main colour and tint, accent too light for the page background.
    await build('Light accent', GOOD[0], '#e6e6e6', GOOD[2]);
    await userEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Accent colour on the page background');
    expect(alert.textContent).not.toContain('Button text on the main colour');
    expect(alert.textContent).not.toContain('Text on the background tint');
    expect(await listThemes(view)).toHaveLength(2);
  });

  it('shows four contrast rows with a words-and-ratio result, not colour alone', async () => {
    await renderRoute('/client/themes', 'client');
    await build('Check me', '#ffee88', GOOD[1], GOOD[2]);
    const rows = await screen.findAllByTestId('contrast-row');
    expect(rows).toHaveLength(4);
    expect(rows[1]!.textContent).toContain('Button text on the main colour');
    expect(rows[1]!.textContent).toContain('Fails');
    expect(rows[1]!.textContent).toMatch(/\d+(\.\d+)?:1/);
    expect(rows[0]!.textContent).toContain('Passes');
  });

  it('has no colour field for status, error, success or warning colours', async () => {
    await renderRoute('/client/themes', 'client');
    await screen.findByRole('region', { name: 'Theme builder' });
    const names = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label') ?? '');
    expect(names.filter((n) => /status|error|success|warning|danger/i.test(n))).toEqual([]);
    expect(screen.getAllByLabelText(/colour|tint/i).length).toBeLessThanOrEqual(8);
  });

  it('refuses a new theme beyond the package limit with a plain message', async () => {
    const view = await renderRoute('/client/themes', 'client', {
      prepare: async ({ handle, keys }) => {
        const actor = actorFor('client', keys);
        for (const [i, n] of ['One', 'Two', 'Three'].entries())
          await handle.store.themes.save(actor, {
            id: `T${i}`.padStart(26, '0'),
            name: n,
            tokens: { primary: GOOD[0], accent: GOOD[1], backgroundTint: GOOD[2], radius: 'md' },
            appliesTo: { staff: true, admin: true },
          });
      },
    });
    expect((await screen.findByTestId('saved-count')).textContent).toBe('5 of 5 saved themes');
    await build('Sixth', ...GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'You have reached the number of saved themes your package includes.',
    );
    expect(await listThemes(view)).toHaveLength(5);
  });

  it('edits a stored theme in place without using up another saved theme', async () => {
    const view = await renderRoute('/client/themes', 'client');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Little Acorns green' }));
    expect(nameBox().value).toBe('Little Acorns green');
    expect(hex('Main colour').value.toLowerCase()).toBe('#1f6b3a');
    await userEvent.click(screen.getByRole('radio', { name: 'Small' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await waitFor(async () => {
      expect(need((await listThemes(view)).find((t) => t.name === 'Little Acorns green')).tokens.radius).toBe('sm');
    });
    expect(await listThemes(view)).toHaveLength(2);
  });

  it('previews the theme on a phone frame and follows the fields', async () => {
    await renderRoute('/client/themes', 'client');
    await build('Preview me', '#1f5fa8', '#0b7a5c', '#f3f7fb');
    await userEvent.click(screen.getByRole('radio', { name: 'Large' }));
    const frame = screen.getByRole('region', { name: 'Staff app preview' });
    const preview = within(frame).getByTestId('theme-preview');
    await waitFor(() => {
      expect(preview.style.getPropertyValue('--theme-primary').toLowerCase()).toBe('#1f5fa8');
    });
    expect(preview.style.getPropertyValue('--theme-accent').toLowerCase()).toBe('#0b7a5c');
    expect(preview.style.getPropertyValue('--theme-tint').toLowerCase()).toBe('#f3f7fb');
    expect(preview.style.getPropertyValue('--theme-radius')).toBe('16px');
    await setHex('Main colour', '#8a1c1c');
    await waitFor(() => {
      expect(preview.style.getPropertyValue('--theme-primary').toLowerCase()).toBe('#8a1c1c');
    });
  });
});

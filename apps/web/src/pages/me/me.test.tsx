// M2 chunk 12 (BP-7): S11 Me, S12 Display and accessibility, DisplayPrefsProvider.
// Contract the implementer must provide:
//   app/display/DisplayPrefsProvider.tsx, mounted inside AppProviders. It reads the own person's prefs (me.get) or, with no
//     person (provider side), DemoState.displayPrefs, and applies displayAttributes() to document.documentElement
//     (attributes and CSS variables). Updates are optimistic: apply first, then me.updatePrefs; on failure revert and show
//     role="alert" text "We could not save that setting. Your settings were not changed."
//   Routes /staff/me (S11), /staff/me/display and /client/display (S12), one level 1 heading each.
//   S11: h1 "Me"; text box "Nickname" with button "Save nickname"; switch "Hide me from leaderboards"; region
//     "Display name" (data-testid="display-name-preview") showing the name others see; links "Display and accessibility"
//     (/staff/me/display) and "Notifications" (/staff/notifications).
//   S12 controls (all in the DOM, roles as named):
//     switch "Simple view"; radiogroup "Text size" radios 100%,125%,150%,175%,200%; radiogroup "Display zoom" radios
//     100%,125%,150%; radiogroup "Contrast" Standard|High; radiogroup "Colour mode" Auto|Light|Dark; switches "Reduce motion",
//     "Sound", "Haptics", "Dyslexia-friendly font", "Bigger buttons", "Read aloud"; radiogroup "Spacing" Standard|Wide;
//     radiogroup "Read aloud speed" radios 0.75x,1x,1.25x,1.5x; button "Reset to defaults"; region "Preview"
//     (data-testid="display-preview").
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../../test/harness';
import { actorFor } from '../../test/harness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  const root = document.documentElement;
  for (const a of [...root.attributes]) if (a.name.startsWith('data-')) root.removeAttribute(a.name);
  root.removeAttribute('style');
});

const root = () => document.documentElement;
const group = (name: string) => screen.findByRole('radiogroup', { name });
const pick = async (groupName: string, option: string) => {
  const g = await group(groupName);
  await userEvent.click(within(g).getByRole('radio', { name: option }));
};
const toggle = async (name: string) => {
  await userEvent.click(await screen.findByRole('switch', { name }));
};

describe('S11 Me', () => {
  it('shows one heading, the display name preview and links to Display and accessibility and Notifications', async () => {
    await renderRoute('/staff/me', 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: 'Me' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId('display-name-preview').textContent).toContain('Jade');
    expect(screen.getByRole('link', { name: 'Display and accessibility' }).getAttribute('href')).toMatch(
      /\/staff\/me\/display$/,
    );
    expect(screen.getByRole('link', { name: 'Notifications' }).getAttribute('href')).toMatch(/\/staff\/notifications$/);
  });

  it('saves a nickname for the learner and shows it in the preview', async () => {
    const { handle, keys } = await renderRoute('/staff/me', 'staff');
    const box = await screen.findByRole('textbox', { name: 'Nickname' });
    await userEvent.clear(box);
    await userEvent.type(box, 'Jay');
    await userEvent.click(screen.getByRole('button', { name: 'Save nickname' }));
    await waitFor(async () => {
      const me = await handle.store.me.get(actorFor('staff', keys));
      expect(me.nickname).toBe('Jay');
    });
    await waitFor(() => {
      expect(screen.getByTestId('display-name-preview').textContent).toContain('Jay');
    });
  });

  it('rejects an invalid nickname with an inline error and does not save it', async () => {
    const { handle, keys } = await renderRoute('/staff/me', 'staff');
    const box = await screen.findByRole('textbox', { name: 'Nickname' });
    await userEvent.clear(box);
    await userEvent.type(box, '!!!');
    await userEvent.click(screen.getByRole('button', { name: 'Save nickname' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    const me = await handle.store.me.get(actorFor('staff', keys));
    expect(me.nickname).not.toBe('!!!');
  });

  it('turns hide from leaderboards on and off, stored on the person', async () => {
    const { handle, keys } = await renderRoute('/staff/me', 'staff');
    const sw = await screen.findByRole('switch', { name: 'Hide me from leaderboards' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(sw);
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Hide me from leaderboards' }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });
    const people = await handle.admin.dumpAll();
    const jade = (people.people as { id: string; hideFromLeaderboards?: boolean; firstName?: string }[]).find(
      (p) =>
        p.id === (people.users as { id: string; personId: string }[]).find((u) => u.id === keys.users.jade)?.personId,
    );
    expect(jade?.hideFromLeaderboards).toBe(true);
    await userEvent.click(screen.getByRole('switch', { name: 'Hide me from leaderboards' }));
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Hide me from leaderboards' }).getAttribute('aria-checked')).toBe(
        'false',
      );
    });
  });
});

describe('S12 Display and accessibility', () => {
  it('renders every brief 19.3 setting with a preview and one level 1 heading', async () => {
    await renderRoute('/staff/me/display', 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: 'Display and accessibility' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const g of ['Text size', 'Display zoom', 'Contrast', 'Colour mode', 'Spacing', 'Read aloud speed'])
      expect(await group(g)).toBeTruthy();
    for (const s of [
      'Simple view',
      'Reduce motion',
      'Sound',
      'Haptics',
      'Dyslexia-friendly font',
      'Bigger buttons',
      'Read aloud',
    ])
      expect(screen.getByRole('switch', { name: s })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeTruthy();
    expect(screen.getByTestId('display-preview')).toBeTruthy();
  });

  it('applies text size 200% to the html element immediately', async () => {
    await renderRoute('/staff/me/display', 'staff');
    await pick('Text size', '200%');
    expect(root().style.getPropertyValue('--text-scale')).toBe('2');
  });

  it('applies display zoom 150% immediately', async () => {
    await renderRoute('/staff/me/display', 'staff');
    await pick('Display zoom', '150%');
    expect(root().style.getPropertyValue('--ui-scale')).toBe('1.5');
  });

  it('applies high contrast and dark mode immediately', async () => {
    await renderRoute('/staff/me/display', 'staff');
    await pick('Contrast', 'High');
    expect(root().getAttribute('data-contrast')).toBe('high');
    await pick('Colour mode', 'Dark');
    expect(root().getAttribute('data-colour-mode')).toBe('dark');
  });

  it('applies reduce motion, wide spacing, bigger buttons and the dyslexia-friendly font immediately', async () => {
    await renderRoute('/staff/me/display', 'staff');
    await toggle('Reduce motion');
    expect(root().getAttribute('data-reduce-motion')).toBe('true');
    await pick('Spacing', 'Wide');
    expect(root().getAttribute('data-spacing')).toBe('wide');
    expect(root().style.getPropertyValue('--line-height')).toBe('1.8');
    await toggle('Bigger buttons');
    expect(root().getAttribute('data-bigger-buttons')).toBe('true');
    expect(root().style.getPropertyValue('--touch-target')).toBe('56px');
    await toggle('Dyslexia-friendly font');
    expect(root().getAttribute('data-reading-font')).toBe('dyslexiaFriendly');
  });

  it('applies Simple view immediately, with larger text and no motion', async () => {
    await renderRoute('/staff/me/display', 'staff');
    await toggle('Simple view');
    expect(root().getAttribute('data-simple-view')).toBe('true');
    expect(Number(root().style.getPropertyValue('--text-scale'))).toBeGreaterThanOrEqual(1.25);
    expect(root().getAttribute('data-reduce-motion')).toBe('true');
  });

  it('stores sound, haptics, read aloud and speed on the person', async () => {
    const { handle, keys } = await renderRoute('/staff/me/display', 'staff');
    await toggle('Sound');
    await toggle('Haptics');
    await toggle('Read aloud');
    await pick('Read aloud speed', '1.5x');
    await waitFor(async () => {
      const me = await handle.store.me.get(actorFor('staff', keys));
      expect(me.prefs).toMatchObject({ sound: true, haptics: false, readAloud: false, readAloudRate: 1.5 });
    });
  });

  it('persists a change through the data layer so it survives a reload', async () => {
    const { handle, keys } = await renderRoute('/staff/me/display', 'staff');
    await pick('Text size', '150%');
    await waitFor(async () => {
      expect((await handle.store.me.get(actorFor('staff', keys))).prefs.textScale).toBe(1.5);
    });
  });

  it('Reset to defaults restores every setting on the page and on the html element', async () => {
    const { handle, keys } = await renderRoute('/staff/me/display', 'staff');
    await pick('Text size', '200%');
    await pick('Contrast', 'High');
    await pick('Colour mode', 'Dark');
    await toggle('Bigger buttons');
    await toggle('Simple view');
    await userEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await waitFor(() => {
      expect(root().getAttribute('data-contrast')).toBe('standard');
    });
    expect(root().getAttribute('data-colour-mode')).toBe('auto');
    expect(root().getAttribute('data-bigger-buttons')).toBe('false');
    expect(root().getAttribute('data-simple-view')).toBe('false');
    expect(root().style.getPropertyValue('--text-scale')).toBe('1');
    expect(screen.getByRole('switch', { name: 'Simple view' }).getAttribute('aria-checked')).toBe('false');
    expect(within(await group('Text size')).getByRole<HTMLInputElement>('radio', { name: '100%' }).checked).toBe(true);
    await waitFor(async () => {
      const me = await handle.store.me.get(actorFor('staff', keys));
      expect(me.prefs).toMatchObject({ textScale: 1, contrast: 'standard', colourMode: 'auto', simpleView: false });
    });
  });

  it('reverts the setting and shows an inline error when saving fails', async () => {
    const { handle } = await renderRoute('/staff/me/display', 'staff');
    await group('Contrast');
    vi.spyOn(handle.store.me, 'updatePrefs').mockRejectedValue(new Error('disk full'));
    await pick('Contrast', 'High');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('We could not save that setting. Your settings were not changed.');
    await waitFor(() => {
      expect(root().getAttribute('data-contrast')).toBe('standard');
    });
    expect(within(await group('Contrast')).getByRole<HTMLInputElement>('radio', { name: 'Standard' }).checked).toBe(
      true,
    );
  });

  it('is also served at /client/display for client admins, using the same controls', async () => {
    await renderRoute('/client/display', 'client');
    expect(await screen.findByRole('heading', { level: 1, name: 'Display and accessibility' })).toBeTruthy();
    await pick('Text size', '175%');
    expect(root().style.getPropertyValue('--text-scale')).toBe('1.75');
  });
});

describe('DisplayPrefsProvider', () => {
  it("applies the signed-in person's saved prefs to html on load (Maureen: Simple view, 150% text)", async () => {
    await renderRoute('/staff', 'staff', {
      actor: (keys) => ({ ...actorFor('staff', keys), userId: keys.users.maureen }),
    });
    await waitFor(() => {
      expect(root().getAttribute('data-simple-view')).toBe('true');
    });
    expect(root().style.getPropertyValue('--text-scale')).toBe('1.5');
  });

  it('applies defaults for a person with no saved display settings (Jade)', async () => {
    await renderRoute('/staff', 'staff');
    await waitFor(() => {
      expect(root().getAttribute('data-contrast')).toBe('standard');
    });
    expect(root().getAttribute('data-simple-view')).toBe('false');
    expect(root().style.getPropertyValue('--text-scale')).toBe('1');
  });

  it('on the provider side uses device prefs from DemoState.displayPrefs', async () => {
    await renderRoute('/provider', 'provider');
    await waitFor(() => {
      expect(root().getAttribute('data-contrast')).toBe('standard');
    });
  });

  it('keeps the default reading font until the dyslexia-friendly font is chosen (font request checked in e2e)', async () => {
    await renderRoute('/staff/me/display', 'staff');
    await screen.findByRole('switch', { name: 'Dyslexia-friendly font' });
    expect(root().getAttribute('data-reading-font')).toBe('default');
    await toggle('Dyslexia-friendly font');
    await waitFor(() => {
      expect(root().getAttribute('data-reading-font')).toBe('dyslexiaFriendly');
    });
  });
});

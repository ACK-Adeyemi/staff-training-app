// M3 chunk 19b (BP-7, plan assumption 52): the active theme is applied to the page. Written before the implementation.
//
// UI CONTRACT (data layer = store.themes.active(actor, side) for side 'staff' (staff actors) or 'admin' (client actors);
// domain = themeCssVariables(theme, { contrast, colourMode }); DisplayPrefsProvider in apps/web/src/app/display):
//   The provider asks themes.active for the actor's side (never for the provider side) and writes the variables from
//   themeCssVariables(activeTheme, { contrast, colourMode }) onto document.documentElement.style:
//   --theme-primary, --theme-accent, --theme-tint and --theme-radius. They are set after the accessibility attributes, so
//   when contrast is 'high' or colourMode is 'dark' only --theme-radius is set and the three colour variables are
//   removed (not left at an old value). With no active theme all four are removed. The values follow the injected
//   clock (the route's `now`), so Fast-forward switches a scheduled theme on and off. Accessibility variables
//   (--text-scale, --ui-scale and the data-* attributes) are never touched by a theme.
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { Theme } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../test/harness';

const GREEN = '#1f6b3a';
const CHRISTMAS = '#b3202a';
const root = () => document.documentElement;
const v = (name: string) => root().style.getPropertyValue(name).toLowerCase();

beforeEach(() => {
  root().removeAttribute('style');
  for (const a of [...root().getAttributeNames()]) root().removeAttribute(a);
});
afterEach(() => {
  cleanup();
  root().removeAttribute('style');
  for (const a of [...root().getAttributeNames()]) root().removeAttribute(a);
});

const editThemes = async (handle: StoreHandle, keys: SeedKeys, change: (t: Theme) => Theme) => {
  const actor = actorFor('client', keys);
  for (const t of await handle.store.themes.list(actor)) await handle.store.themes.save(actor, change(t));
};
const jadePrefs = async (handle: StoreHandle, keys: SeedKeys, prefs: Record<string, string | number>) => {
  await handle.store.me.updatePrefs(actorFor('staff', keys), prefs);
};

describe('theme application on the staff side', () => {
  it('applies the base theme colours and radius to the page', async () => {
    await renderRoute('/staff', 'staff');
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(GREEN);
    });
    expect(v('--theme-accent')).toBe('#8a5a00');
    expect(v('--theme-tint')).toBe('#f2f9f0');
    expect(v('--theme-radius')).toBe('8px');
  });

  it('switches the scheduled Christmas theme on at 1 December and back off after 6 January', async () => {
    await renderRoute('/staff', 'staff', { now: '2026-11-30T09:00:00.000Z' });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(GREEN);
    });
    cleanup();
    await renderRoute('/staff', 'staff', { now: '2026-12-01T09:00:00.000Z' });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(CHRISTMAS);
    });
    cleanup();
    await renderRoute('/staff', 'staff', { now: '2027-01-06T20:00:00.000Z' });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(CHRISTMAS);
    });
    cleanup();
    await renderRoute('/staff', 'staff', { now: '2027-01-08T09:00:00.000Z' });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(GREEN);
    });
  });

  it('does not theme the staff app with a theme that applies to admins only', async () => {
    await renderRoute('/staff', 'staff', {
      now: '2026-12-02T09:00:00.000Z',
      prepare: async ({ handle, keys }) => {
        await editThemes(handle, keys, (t) =>
          t.name === 'Christmas' ? { ...t, appliesTo: { staff: false, admin: true } } : t,
        );
      },
    });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(GREEN);
    });
  });

  it('removes the colour variables when there is no theme at all, not leaving old values behind', async () => {
    await renderRoute('/staff', 'staff');
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(GREEN);
    });
    cleanup();
    await renderRoute('/staff', 'staff', {
      prepare: async ({ handle, keys }) => {
        const actor = actorFor('client', keys);
        await handle.store.themes.setBase(actor, null);
        for (const t of await handle.store.themes.list(actor)) await handle.store.themes.remove(actor, t.id);
      },
    });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe('');
    });
    expect(v('--theme-radius')).toBe('');
  });

  it('ignores theme colours in dark mode but keeps the radius', async () => {
    await renderRoute('/staff', 'staff', {
      prepare: async ({ handle, keys }) => {
        await jadePrefs(handle, keys, { colourMode: 'dark' });
        await editThemes(handle, keys, (t) =>
          t.name === 'Little Acorns green' ? { ...t, tokens: { ...t.tokens, radius: 'lg' } } : t,
        );
      },
    });
    await waitFor(() => {
      expect(v('--theme-radius')).toBe('16px');
    });
    expect(root().getAttribute('data-colour-mode')).toBe('dark');
    expect(v('--theme-primary')).toBe('');
    expect(v('--theme-accent')).toBe('');
    expect(v('--theme-tint')).toBe('');
  });

  it('ignores theme colours with high contrast on but keeps the radius', async () => {
    await renderRoute('/staff', 'staff', {
      prepare: async ({ handle, keys }) => {
        await jadePrefs(handle, keys, { contrast: 'high' });
        await editThemes(handle, keys, (t) =>
          t.name === 'Little Acorns green' ? { ...t, tokens: { ...t.tokens, radius: 'sm' } } : t,
        );
      },
    });
    await waitFor(() => {
      expect(v('--theme-radius')).toBe('4px');
    });
    expect(root().getAttribute('data-contrast')).toBe('high');
    expect(v('--theme-primary')).toBe('');
  });

  it('keeps accessibility settings when a theme is on', async () => {
    await renderRoute('/staff', 'staff', {
      prepare: async ({ handle, keys }) => {
        await jadePrefs(handle, keys, { textScale: 1.5 });
      },
    });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(GREEN);
    });
    expect(root().style.getPropertyValue('--text-scale')).toBe('1.5');
  });
});

describe('theme application on the admin side', () => {
  it('applies the base theme to the client admin app and the scheduled theme in December', async () => {
    await renderRoute('/client', 'client');
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(GREEN);
    });
    cleanup();
    await renderRoute('/client', 'client', { now: '2026-12-15T09:00:00.000Z' });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(CHRISTMAS);
    });
  });

  it('does not theme the admin app with a theme that applies to staff only', async () => {
    await renderRoute('/client', 'client', {
      now: '2026-12-02T09:00:00.000Z',
      prepare: async ({ handle, keys }) => {
        await editThemes(handle, keys, (t) =>
          t.name === 'Christmas' ? { ...t, appliesTo: { staff: true, admin: false } } : t,
        );
      },
    });
    await waitFor(() => {
      expect(v('--theme-primary')).toBe(GREEN);
    });
  });
});

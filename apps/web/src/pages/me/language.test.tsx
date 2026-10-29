// M5 chunk 5 (F-4): language picker on S11 Me, staff-only language, <html lang>. Written before the implementation.
// Contract assumed:
//   Language keys (en-GB, and Polish overlay in pl-PL.json): me.languageTitle "Language", me.languageMachineNote
//     "Machine translated, not yet checked by a person" (also translated), me.languageSaveError.
//   S11 Me has a radiogroup named t('me.languageTitle') with radios "English (UK)" and "Polski" (names are the registry
//     labels, never translated). Choosing one calls store.me.updatePrefs(actor, { language }) and the staff shell switches
//     to that language (lazy-loaded pl-PL with en-GB fallback). The machine-translated note shows while Polski is chosen.
//   The staff shell sets document.documentElement.lang to 'pl' for pl-PL and 'en-GB' otherwise; client and provider are
//     always en-GB. English-only content (FAQs, modules without a translation) sits in an element with lang="en-GB"
//     while the interface is Polish.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { faqs } from '@sta/content';
import enGB from '../../../../../packages/content/src/lang/en-GB.json';
import plPL from '../../../../../packages/content/src/lang/pl-PL.json';
import { actorFor, renderRoute, t } from '../../test/harness';
import { sgModule } from '../../test/quizHelpers';

afterEach(() => {
  cleanup();
  document.documentElement.lang = 'en-GB';
});

const root = () => document.documentElement;
// <html lang="en-GB"> is an ancestor of everything, so "wrapped" means a closer element than the root carries it.
const wrapper = (el: Element): Element | null => {
  const found = el.closest('[lang="en-GB"]');
  return found === root() ? null : found;
};
const lang = (o: unknown, path: string): string =>
  path.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], o) as string;
const kasia = (keys: SeedKeys) => ({ ...actorFor('staff', keys), userId: keys.users['kasia'] });
const savedLanguage = async (handle: StoreHandle, keys: SeedKeys, actor = actorFor('staff', keys)) =>
  (await handle.store.me.get(actor)).prefs.language;
const setPl = async ({ handle, keys }: { handle: StoreHandle; keys: SeedKeys }) => {
  await handle.store.me.updatePrefs(kasia(keys), { language: 'pl-PL' });
};
const withKasia = { actor: kasia } as const;

describe('S11 language picker', () => {
  it('offers English (UK) and Polski and notes the translation for Polish', async () => {
    await renderRoute('/staff/me', 'staff');
    const group = await screen.findByRole('radiogroup', { name: t('me.languageTitle') });
    expect(within(group).getByRole('radio', { name: 'English (UK)' })).toBeTruthy();
    expect(within(group).getByRole('radio', { name: 'Polski' })).toBeTruthy();
    expect(screen.queryByText(/Machine translated/)).toBeNull();
  });

  it('shows English (UK) as chosen for a learner with no language preference', async () => {
    await renderRoute('/staff/me', 'staff');
    const english = await screen.findByRole('radio', { name: 'English (UK)' });
    expect((english as HTMLInputElement).checked).toBe(true);
  });

  it('choosing Polski saves the preference through the data layer and shows the machine-translated note', async () => {
    const { handle, keys } = await renderRoute('/staff/me', 'staff');
    await userEvent.click(await screen.findByRole('radio', { name: 'Polski' }));
    await waitFor(async () => {
      expect(await savedLanguage(handle, keys)).toBe('pl-PL');
    });
    expect(await screen.findByText(lang(plPL, 'me.languageMachineNote'))).toBeTruthy();
  });

  it('choosing Polski changes the staff chrome and page text to Polish', async () => {
    expect(lang(plPL, 'me.title')).not.toBe(lang(enGB, 'me.title'));
    expect(lang(plPL, 'nav.staff.home')).not.toBe(lang(enGB, 'nav.staff.home'));
    await renderRoute('/staff/me', 'staff');
    await screen.findByRole('heading', { level: 1, name: lang(enGB, 'me.title') });
    await userEvent.click(await screen.findByRole('radio', { name: 'Polski' }));
    expect(await screen.findByRole('heading', { level: 1, name: lang(plPL, 'me.title') })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: lang(plPL, 'nav.staff.home') }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: lang(enGB, 'nav.staff.home') })).toBeNull();
    // The picker option names are not translated.
    expect(screen.getByRole('radio', { name: 'Polski' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'English (UK)' })).toBeTruthy();
  });

  it('switching back to English (UK) restores English text and saves en-GB', async () => {
    const { handle, keys } = await renderRoute('/staff/me', 'staff', { ...withKasia, prepare: setPl });
    await screen.findByRole('heading', { level: 1, name: lang(plPL, 'me.title') });
    await userEvent.click(await screen.findByRole('radio', { name: 'English (UK)' }));
    expect(await screen.findByRole('heading', { level: 1, name: lang(enGB, 'me.title') })).toBeTruthy();
    expect(await savedLanguage(handle, keys, kasia(keys))).toBe('en-GB');
    expect(screen.queryByText(/Machine translated/)).toBeNull();
  });

  it('starts in Polish for a learner whose saved preference is pl-PL (Kasia)', async () => {
    await renderRoute('/staff/me', 'staff', withKasia);
    expect(await screen.findByRole('heading', { level: 1, name: lang(plPL, 'me.title') })).toBeTruthy();
    const polski = await screen.findByRole<HTMLInputElement>('radio', { name: 'Polski' });
    expect(polski.checked).toBe(true);
  });
});

describe('<html lang>', () => {
  it('is en-GB for English staff', async () => {
    await renderRoute('/staff/me', 'staff');
    await screen.findByRole('heading', { level: 1 });
    expect(root().lang).toBe('en-GB');
  });

  it('is pl when the staff language is pl-PL, and follows a change in the picker', async () => {
    await renderRoute('/staff/me', 'staff', withKasia);
    await waitFor(() => {
      expect(root().lang).toBe('pl');
    });
    await userEvent.click(await screen.findByRole('radio', { name: 'English (UK)' }));
    await waitFor(() => {
      expect(root().lang).toBe('en-GB');
    });
  });
});

describe('English-only content in the Polish interface', () => {
  const faq = faqs.find((f) => f.audience === 'staff') ?? faqs[0]!;
  const faqText = lang(enGB, faq.questionKey);
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  it('wraps FAQ questions in lang="en-GB" while the chrome stays Polish', async () => {
    await renderRoute('/staff/help', 'staff', withKasia);
    const question = await screen.findByRole('button', { name: new RegExp(esc(faqText.slice(0, 20))) });
    expect(question.closest('[lang]')?.getAttribute('lang')).toBe('en-GB');
    expect(wrapper(screen.getByRole('heading', { level: 1 }))).toBeNull();
  });

  it('wraps an untranslated module lesson in lang="en-GB" in the Polish interface', async () => {
    await renderRoute(`/staff/module/${sgModule.id}/lesson/${sgModule.lessons[0]!.id}`, 'staff', withKasia);
    const title = await screen.findByText(sgModule.lessons[0]!.title);
    expect(title.closest('[lang]')?.getAttribute('lang')).toBe('en-GB');
  });

  it('adds no lang="en-GB" wrapper around FAQs when the interface is English', async () => {
    await renderRoute('/staff/help', 'staff');
    const question = await screen.findByRole('button', { name: new RegExp(esc(faqText.slice(0, 20))) });
    expect(wrapper(question)).toBeNull();
  });
});

describe('client and provider stay English', () => {
  it('shows the client admin in English with lang en-GB even when the signed-in user prefers pl-PL', async () => {
    await renderRoute('/client/team', 'client', {
      prepare: async ({ handle, keys }) => {
        await handle.store.me.updatePrefs(actorFor('client', keys), { language: 'pl-PL' });
      },
    });
    expect(await screen.findByRole('heading', { level: 1, name: t('team.title') })).toBeTruthy();
    expect(root().lang).toBe('en-GB');
  });

  it('shows the provider surface in English with lang en-GB even if a pl-PL preference is stored', async () => {
    await renderRoute('/provider', 'provider', {
      prepare: async ({ handle, keys }) => {
        // The provider owner has no learner record, so the save may be refused; either way the surface is English.
        await handle.store.me.updatePrefs(actorFor('provider', keys), { language: 'pl-PL' }).catch(() => undefined);
      },
    });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('heading', { level: 1, name: lang(plPL, 'me.title') })).toBeNull();
    expect(root().lang).toBe('en-GB');
  });
});

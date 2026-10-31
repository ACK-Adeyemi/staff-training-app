// M5 chunk 7 (F-5): S3 to S6 for a module that has a translation. Plan docs/plans/m5.md F-5 and assumption 6; brief 21.4.
// Written before the implementation. Assumed (the implementer must match):
//   Module ids: moduleIds.saferSleep (English original) and moduleIds.saferSleepPl (Polish, translatedFrom the original).
//   Language keys, all under a `translation` group in en-GB.json and pl-PL.json:
//     translation.alsoIn            "Also in: {language}"        (language is the label from the registry: "Polski", "English")
//     translation.machineTranslated "Machine translated"
//     translation.englishIsOfficial "The English version is the official text"
//     translation.openEnglish       "Read the English version"   (the link; name starts with this text)
//     translation.openVersion       "Open the {language} version" (the "Also in" link; name contains the language name)
//   S4 /staff/module/:id: when the module has other published language versions, a region (any element) shows
//     "Also in: Polski" (on the English module) or "Also in: English" (on the Polish module) with a link to that version
//     at #/staff/module/<id>. No such text on a module without translations. S4 does not redirect: the id in the URL is
//     the module shown, so the "Also in" link can always be followed.
//   S4, S5, S6 of a machine translated module show the label "Machine translated" and "The English version is the
//     official text" and a link to the English module's S4. The English module and untranslated modules show neither.
//   S3 Learn lists one row for Safer sleep, never two: it links to the version matching the signed-in person's
//     prefs.language (Kasia pl-PL: Polish module; Jade en-GB: the English original), so the module count does not change.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { moduleIds, languages } from '@sta/content';
import { actorFor, renderRoute, type Side } from '../../test/harness';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(() => {
  cleanup();
});

const EN_ID = moduleIds.saferSleep;
const PL_ID = (moduleIds as Record<string, string | undefined>)['saferSleepPl'] as string;
const EN = `/staff/module/${EN_ID}`;
const PL = `/staff/module/${PL_ID}`;
const side: Side = 'staff';
const kasia = (keys: Parameters<typeof actorFor>[1]) => ({ ...actorFor(side, keys), userId: keys.users['kasia'] });
const asKasia = {
  actor: kasia,
  prepare: async ({
    handle,
    keys,
  }: Parameters<NonNullable<Parameters<typeof renderRoute>[2]>['prepare'] & object>[0]) => {
    await handle.store.me.updatePrefs(kasia(keys), { language: 'pl-PL' });
  },
};

// Messages are nested objects; keys are dotted paths (the test first read them as flat keys, which never exist).
const msg = (messages: unknown, key: string): string | undefined => {
  let node = messages;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string' ? node : undefined;
};

const hrefTo = (id: string) => (a: Element) => (a.getAttribute('href') ?? '').endsWith(`/staff/module/${id}`);
const linksTo = (id: string) => screen.queryAllByRole('link').filter(hrefTo(id));

describe('S4 shows the other language version', () => {
  it('says Also in: Polski on the English module and links to the Polish module', async () => {
    await renderRoute(EN, 'staff');
    expect(await screen.findByText('Also in: Polski')).toBeTruthy();
    expect(linksTo(PL_ID).length).toBeGreaterThan(0);
  });

  it('says Also in: English on the Polish module and links to the English module', async () => {
    await renderRoute(PL, 'staff');
    expect(await screen.findByText('Also in: English')).toBeTruthy();
    expect(linksTo(EN_ID).length).toBeGreaterThan(0);
  });

  it('says nothing about other languages on a module with no translation', async () => {
    await renderRoute(`/staff/module/${moduleIds.safeguardingAndWhistleblowing}`, 'staff');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/Also in:/)).toBeNull();
    expect(screen.queryByText('Machine translated')).toBeNull();
  });

  it('does not redirect: the module in the URL is the one shown', async () => {
    const view = await renderRoute(EN, 'staff', asKasia);
    await screen.findByRole('heading', { level: 1 });
    expect(view.router.state.location.pathname).toBe(EN);
  });
});

describe('machine translated label on S4, S5 and S6', () => {
  const official = 'The English version is the official text';

  async function expectLabel(path: string) {
    await renderRoute(path, 'staff');
    expect(await screen.findByText('Machine translated')).toBeTruthy();
    expect(screen.getByText(official)).toBeTruthy();
    expect(linksTo(EN_ID).length, `${path} link to the English module`).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Read the English version/ })).toBeTruthy();
  }

  it('shows on the Polish module overview (S4)', async () => {
    await expectLabel(PL);
  });

  it('shows on the Polish lesson player (S5)', async () => {
    await expectLabel(`${PL}/lesson/lesson-1`);
  });

  it('shows on the Polish quiz page (S6)', async () => {
    await expectLabel(`${PL}/quiz`);
  });

  it('shows on S6 even when the lessons are not done yet', async () => {
    await renderRoute(`${PL}/quiz`, 'staff');
    await screen.findByText('Machine translated');
    expect(screen.getByText(official)).toBeTruthy();
  });

  it.each([EN, `${EN}/lesson/lesson-1`, `${EN}/quiz`])('is absent from the English original %s', async (path) => {
    await renderRoute(path, 'staff');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Machine translated')).toBeNull();
    expect(screen.queryByText(official)).toBeNull();
  });

  it('keeps the module content in Polish while the label belongs to the interface language', async () => {
    await renderRoute(PL, 'staff');
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.textContent).not.toBe('Safer sleep');
    expect(h1.textContent.trim().length).toBeGreaterThan(0);
  });
});

describe('Polish interface labels', () => {
  it('has the translation keys in en-GB and in pl-PL, translated and with the same placeholders', async () => {
    const en = (key: string) => msg(languages['en-GB'].messages, key);
    const plMessages = await languages['pl-PL'].load();
    const pl = (key: string) => msg(plMessages, key);
    for (const key of [
      'translation.alsoIn',
      'translation.machineTranslated',
      'translation.englishIsOfficial',
      'translation.openEnglish',
      'translation.openVersion',
    ]) {
      expect(en(key), `en-GB ${key}`).toBeTruthy();
      expect(pl(key), `pl-PL ${key}`).toBeTruthy();
      expect(pl(key), `${key} is translated`).not.toBe(en(key));
      expect(pl(key)!.match(/\{\w+\}/g) ?? [], key).toEqual(en(key)!.match(/\{\w+\}/g) ?? []);
    }
    expect(en('translation.machineTranslated')).toBe('Machine translated');
    expect(en('translation.englishIsOfficial')).toBe('The English version is the official text');
    expect(en('translation.alsoIn')).toBe('Also in: {language}');
  });

  it('shows the label in Polish for Kasia, with a link to the English module', async () => {
    const plMessages = await languages['pl-PL'].load();
    const pl = (key: string) => msg(plMessages, key) ?? '';
    await renderRoute(PL, 'staff', asKasia);
    expect(await screen.findByText(pl('translation.machineTranslated'))).toBeTruthy();
    expect(screen.getByText(pl('translation.englishIsOfficial'))).toBeTruthy();
    expect(screen.queryByText('Machine translated')).toBeNull();
    expect(linksTo(EN_ID).length).toBeGreaterThan(0);
  });
});

describe('the version matching the learner language opens by default', () => {
  const learnRows = () => screen.getAllByRole('list').flatMap((l) => within(l).queryAllByRole('listitem'));

  it('Learn links Kasia (Polish) to the Polish Safer sleep and Jade (English) to the original, once each', async () => {
    await renderRoute('/staff/learn', 'staff', asKasia);
    await waitFor(() => {
      expect(linksTo(PL_ID).length).toBeGreaterThan(0);
    });
    expect(linksTo(EN_ID)).toEqual([]);
    expect(learnRows().filter((li) => within(li).queryAllByRole('link').some(hrefTo(PL_ID)))).toHaveLength(1);
    cleanup();

    await renderRoute('/staff/learn', 'staff');
    await waitFor(() => {
      expect(linksTo(EN_ID).length).toBeGreaterThan(0);
    });
    expect(linksTo(PL_ID)).toEqual([]);
  });

  it('never lists the English and Polish Safer sleep as two modules', async () => {
    await renderRoute('/staff/learn', 'staff');
    await waitFor(() => {
      expect(screen.getAllByTestId('path-node').length).toBeGreaterThan(5);
    });
    const titles = screen.getAllByTestId('path-node').map((n) => n.textContent);
    expect(titles.filter((t) => /Safer sleep/.test(t)).length).toBe(1);
    expect(titles.some((t) => /Bezpieczny sen/.test(t))).toBe(false);
  });
});

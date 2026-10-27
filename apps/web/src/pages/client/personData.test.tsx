// M3 chunk 20b (BP-19, BP-8, F-4): C3 Person record, Export this person and Erase or anonymise. Written before the
// implementation. Data layer: store.exports.person(ctx, personId, code), store.people.erase(ctx, id,
// { mode, confirmName, code }); the step-up code is the demo code 123456.
//
// UI CONTRACT (C3 /client/people/:id, additions):
//   Button "Export this person" when can('reports.export') for the person's sites. It opens dialog "Export this
//     person" with textbox "Confirmation code" and buttons "Download" and "Cancel". Blank code: role=alert "Enter your
//     code to continue."; wrong code: "That code is not right." A right code downloads a ZIP (anchor `download` ending
//     .zip) for that one person only (people.csv has only them, data.json people has one entry) and shows role=status
//     "Your export is ready. It has been saved to your device." Never learner notes.
//   Button "Erase or anonymise" when can('staff.delete') for the person's sites. It opens dialog "Erase or anonymise
//     <full name>" showing the warning text "Anonymise keeps their training records and certificates, without their
//     name. Delete everything removes them too." and radios "Anonymise (keep training records without the name)"
//     (selected by default) and "Delete everything (remove training records and certificates too)", textbox "Type
//     <full name> to confirm", textbox "Confirmation code", and buttons "Erase" and "Cancel".
//     A wrong typed name: role=alert "That name does not match." and nothing changes. A wrong or blank code behaves as
//     in export. Success closes the dialog, goes to #/client/people and shows role=status "<full name> was
//     anonymised." or "<full name> was deleted." Anonymise: the data layer keeps their Evidence and the person is
//     "Former staff member". Delete everything: their Evidence is gone too.
//   Daniel (Supervisor, no export or delete permission) sees neither button.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { Evidence, Person } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { captureDownloads } from '../../test/calendarHelpers';
import { actorFor, renderRoute } from '../../test/harness';
import { readZip } from '../../test/zipHelpers';

afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const need = <T,>(v: T | undefined | null): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const evidenceOf = async (c: Ctx, who: string) =>
  (await dump<Evidence>(c.handle, 'evidence')).filter((e) => e.personId === c.keys.personas[who]);
const personOf = async (c: Ctx, who: string) =>
  need((await dump<Person>(c.handle, 'people')).find((p) => p.id === c.keys.personas[who]));

async function open(who: string, opts: { daniel?: boolean } = {}) {
  let c!: Ctx;
  const r = await renderRoute('/client', 'client', {
    ...(opts.daniel ? { actor: (k: SeedKeys) => ({ ...actorFor('client', k), userId: need(k.users['daniel']) }) } : {}),
    prepare: (x) => ((c = x), Promise.resolve()),
  });
  await r.router.navigate(`/client/people/${need(c.keys.personas[who])}`);
  await screen.findByRole('heading', { level: 1, name: /\w/ });
  return { r, c };
}

describe('C3 Export this person', () => {
  it('downloads a ZIP for that person only, after the code, with no notes', async () => {
    const cap = captureDownloads();
    try {
      const { c } = await open('kasia');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Export this person' }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Export this person' }));
      await user.type(dialog.getByRole('textbox', { name: 'Confirmation code' }), '123456');
      await user.click(dialog.getByRole('button', { name: 'Download' }));
      expect((await screen.findByRole('status')).textContent).toContain('Your export is ready.');
      expect(cap.names).toHaveLength(1);
      expect(cap.names[0]).toMatch(/\.zip$/);
      const zip = await readZip(cap.blobs[0] as Blob);
      expect(zip.names).toContain('people.csv');
      expect(zip.names).toContain('data.json');
      const people = (JSON.parse(zip.text('data.json')) as { people: { id: string }[] }).people;
      expect(people.map((p) => p.id)).toEqual([c.keys.personas['kasia']]);
      expect(zip.text('people.csv')).toContain('Kasia');
      expect(zip.text('people.csv')).not.toContain('Mark');
      expect(zip.names.some((n) => n.toLowerCase().includes('note'))).toBe(false);
    } finally {
      cap.restore();
    }
  });

  it('refuses blank and wrong codes without downloading', async () => {
    const cap = captureDownloads();
    try {
      await open('kasia');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Export this person' }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Export this person' }));
      await user.click(dialog.getByRole('button', { name: 'Download' }));
      expect((await dialog.findByRole('alert')).textContent).toBe('Enter your code to continue.');
      await user.type(dialog.getByRole('textbox', { name: 'Confirmation code' }), '000000');
      await user.click(dialog.getByRole('button', { name: 'Download' }));
      await waitFor(() => {
        expect(dialog.getByRole('alert').textContent).toBe('That code is not right.');
      });
      expect(cap.blobs).toHaveLength(0);
    } finally {
      cap.restore();
    }
  });

  it('hides both buttons from Daniel, who lacks the permissions', async () => {
    await open('kasia', { daniel: true });
    await screen.findByRole('heading', { level: 1, name: 'Kasia Nowak' });
    expect(screen.queryByRole('button', { name: 'Export this person' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Erase or anonymise' })).toBeNull();
  });
});

describe('C3 Erase or anonymise', () => {
  const openErase = async (who: string, name: string) => {
    const o = await open(who);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Erase or anonymise' }));
    const dialog = within(await screen.findByRole('dialog', { name: `Erase or anonymise ${name}` }));
    return { ...o, user, dialog };
  };

  it('warns that training records are kept under Anonymise and defaults to it', async () => {
    const { dialog } = await openErase('kasia', 'Kasia Nowak');
    expect(
      dialog.getByText(
        'Anonymise keeps their training records and certificates, without their name. Delete everything removes them too.',
      ),
    ).toBeTruthy();
    expect(dialog.getByRole('radio', { name: 'Anonymise (keep training records without the name)' })).toHaveProperty(
      'checked',
      true,
    );
    expect(
      dialog.getByRole('radio', { name: 'Delete everything (remove training records and certificates too)' }),
    ).toBeTruthy();
  });

  it('anonymise keeps the Evidence and removes the name', async () => {
    const { c, user, dialog } = await openErase('kasia', 'Kasia Nowak');
    const before = (await evidenceOf(c, 'kasia')).length;
    expect(before).toBeGreaterThan(0);
    await user.type(dialog.getByRole('textbox', { name: 'Type Kasia Nowak to confirm' }), 'Kasia Nowak');
    await user.type(dialog.getByRole('textbox', { name: 'Confirmation code' }), '123456');
    await user.click(dialog.getByRole('button', { name: 'Erase' }));
    expect((await screen.findByRole('status')).textContent).toContain('Kasia Nowak was anonymised.');
    expect((await evidenceOf(c, 'kasia')).length).toBe(before);
    const person = await personOf(c, 'kasia');
    expect(person.firstName).toBe('Former staff member');
    expect(JSON.stringify(person)).not.toMatch(/Kasia|Nowak/);
  });

  it('delete everything removes the Evidence as well', async () => {
    const { c, user, dialog } = await openErase('kasia', 'Kasia Nowak');
    expect((await evidenceOf(c, 'kasia')).length).toBeGreaterThan(0);
    await user.click(
      dialog.getByRole('radio', { name: 'Delete everything (remove training records and certificates too)' }),
    );
    await user.type(dialog.getByRole('textbox', { name: 'Type Kasia Nowak to confirm' }), 'Kasia Nowak');
    await user.type(dialog.getByRole('textbox', { name: 'Confirmation code' }), '123456');
    await user.click(dialog.getByRole('button', { name: 'Erase' }));
    expect((await screen.findByRole('status')).textContent).toContain('Kasia Nowak was deleted.');
    expect(await evidenceOf(c, 'kasia')).toHaveLength(0);
  });

  it('changes nothing when the typed name does not match or the code is wrong', async () => {
    const { c, user, dialog } = await openErase('kasia', 'Kasia Nowak');
    const before = JSON.stringify(await personOf(c, 'kasia'));
    await user.type(dialog.getByRole('textbox', { name: 'Type Kasia Nowak to confirm' }), 'Kasia');
    await user.type(dialog.getByRole('textbox', { name: 'Confirmation code' }), '123456');
    await user.click(dialog.getByRole('button', { name: 'Erase' }));
    expect((await dialog.findByRole('alert')).textContent).toBe('That name does not match.');
    await user.clear(dialog.getByRole('textbox', { name: 'Type Kasia Nowak to confirm' }));
    await user.type(dialog.getByRole('textbox', { name: 'Type Kasia Nowak to confirm' }), 'Kasia Nowak');
    await user.clear(dialog.getByRole('textbox', { name: 'Confirmation code' }));
    await user.type(dialog.getByRole('textbox', { name: 'Confirmation code' }), '000000');
    await user.click(dialog.getByRole('button', { name: 'Erase' }));
    await waitFor(() => {
      expect(dialog.getByRole('alert').textContent).toBe('That code is not right.');
    });
    expect(JSON.stringify(await personOf(c, 'kasia'))).toBe(before);
  });
});

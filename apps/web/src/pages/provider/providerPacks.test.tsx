// M4 chunk 11b (BP-6, U layer): P6 "Industry packs" read-only screen. Written before the implementation.
//
// UI CONTRACT (no store operations: data comes straight from `allPacks` in @sta/content):
//   Proposed language keys (en-GB):
//     provider.packs.heading "Industry packs"  provider.packs.statusFull "Full pack"  provider.packs.statusStub "Stub"
//     provider.packs.roles "Job roles: {count}"  provider.packs.requirements "Requirements: {count}"
//     provider.packs.terminologyHeading "Terminology"  provider.packs.prizesHeading "Prize suggestions"
//     provider.packs.stubNote "Stub pack: terminology only. Roles, requirements and prize lists arrive with the pack's build."
//   P6 /provider/packs:
//     - a heading "Industry packs".
//     - one data-testid="pack-card" per entry of allPacks, in order, each with data-pack-id = pack.id and text containing the pack name.
//     - each card shows a status as text: "Full pack" when status is full, "Stub" when stub (never colour alone).
//       The luxury retail placeholder is a stub for now.
//     - each card shows the number of job roles and of requirements as text.
//     - each card has a data-testid="pack-terminology" list with one row per term (data-term-key = the key), whose text contains the value.
//     - cards with prize suggestions show them as text; stub cards (none) show the stub note instead.
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { allPacks, nurseryPack } from '@sta/content';
import { renderRoute } from '../../test/harness';

afterEach(cleanup);

const STUB_NOTE = "Stub pack: terminology only. Roles, requirements and prize lists arrive with the pack's build.";

const open = async (): Promise<HTMLElement[]> => {
  await renderRoute('/provider/packs', 'provider');
  await screen.findByRole('heading', { name: 'Industry packs' });
  return screen.findAllByTestId('pack-card');
};

describe('P6 Industry packs', () => {
  it('renders for the provider persona with the heading and one card per pack in order', async () => {
    const cards = await open();
    expect(cards).toHaveLength(allPacks.length);
    expect(cards.map((c) => c.getAttribute('data-pack-id'))).toEqual(allPacks.map((p) => p.id));
    cards.forEach((card, i) => {
      expect(card.textContent).toContain(allPacks[i]!.name);
    });
  });

  it('states Full pack or Stub as text on every card, with luxury retail as a stub', async () => {
    const cards = await open();
    cards.forEach((card, i) => {
      const pack = allPacks[i]!;
      const expected = pack.status === 'full' ? 'Full pack' : 'Stub';
      expect(within(card).getByText(expected)).toBeTruthy();
      if (pack.status === 'full') expect(within(card).queryByText('Stub')).toBeNull();
    });
    const luxury = cards.find((c) => c.textContent.includes('Luxury retail'))!;
    expect(within(luxury).getByText('Stub')).toBeTruthy();
    const nursery = cards.find((c) => c.getAttribute('data-pack-id') === nurseryPack.id)!;
    expect(within(nursery).getByText('Full pack')).toBeTruthy();
  });

  it('shows the job role and requirement counts on each card', async () => {
    const cards = await open();
    const nursery = cards.find((c) => c.getAttribute('data-pack-id') === nurseryPack.id)!;
    expect(nurseryPack.jobRoles.length).toBeGreaterThan(0);
    expect(nursery.textContent).toContain(`Job roles: ${nurseryPack.jobRoles.length}`);
    expect(nursery.textContent).toContain(`Requirements: ${nurseryPack.requirements.length}`);
    const schools = cards.find((c) => c.textContent.includes('Schools'))!;
    expect(schools.textContent).toContain('Job roles: 0');
    expect(schools.textContent).toContain('Requirements: 0');
  });

  it('lists a terminology row per term on each card, including the Schools site term', async () => {
    const cards = await open();
    cards.forEach((card, i) => {
      const pack = allPacks[i]!;
      const list = within(card).getByTestId('pack-terminology');
      const rows = Array.from(list.querySelectorAll('[data-term-key]'));
      expect(rows.map((r) => r.getAttribute('data-term-key'))).toEqual(Object.keys(pack.terminology));
      rows.forEach((row) => {
        expect(row.textContent).toContain(pack.terminology[row.getAttribute('data-term-key')!]!);
      });
    });
    const schools = cards.find((c) => c.textContent.includes('Schools'))!;
    const siteRow = within(schools).getByTestId('pack-terminology').querySelector('[data-term-key="site"]')!;
    expect(siteRow.textContent).toContain('school');
  });

  it('shows nursery prize suggestions and the stub note only on stub cards', async () => {
    const cards = await open();
    expect(nurseryPack.prizeSuggestions.length).toBeGreaterThan(0);
    const nursery = cards.find((c) => c.getAttribute('data-pack-id') === nurseryPack.id)!;
    expect(within(nursery).getByText(nurseryPack.prizeSuggestions[0]!)).toBeTruthy();
    expect(nursery.textContent).not.toContain(STUB_NOTE);
    cards.forEach((card, i) => {
      if (allPacks[i]!.status === 'stub') expect(card.textContent).toContain(STUB_NOTE);
    });
  });
});

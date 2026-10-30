// M4 chunk 11d (U layer): P8 "Add-on catalogue" at /provider/add-ons. Written before the implementation.
//
// UI CONTRACT
//   Read-mostly screen. The catalogue is the `addOns` list in @sta/content (catalogue order); the page may read each record
//   with store.addOns.get(actor, id) (provider actors read addOns with clients.read or billing.read). store.addOns.list is
//   per client and is NOT used. Reading the page needs billing.read; editing a price uses store.addOns.put, which the data
//   layer allows for providers holding billing.write (PROVIDER_WRITE_ONLY), so the 'Edit price' control is shown only when
//   holdsAnywhere(perms, 'billing.write') (never role names). Without billing.read: role=alert "noPermission" text.
//   Money uses formatPounds from src/demo/format (the one the client AddOns page uses). Descriptions come from addOnCopy
//   (whatKey), through the language file.
//   Proposed language keys (en-GB):
//     provider.addOns.heading "Add-on catalogue"
//     provider.addOns.priceFlat "{price} per month"
//     provider.addOns.priceUsage "{price} per {unit}, {included} included each month"
//     provider.addOns.appliesTo "Applies to: {options}"      provider.addOns.optionA "Option A"   provider.addOns.optionB "Option B"
//     provider.addOns.demoAi "Demo AI"  (shown on the AI Assistant card only)
//     provider.addOns.editPrice "Edit price"   provider.addOns.noPermission "You don't have permission to see add-ons."
//   P8 /provider/add-ons:
//     - h1 "Add-on catalogue".
//     - data-testid="addon-card" per catalogue add-on, data-addon-id = add-on id, in catalogue order. Text contains the name,
//       the addOnCopy "what" text, the price text, and "Option A" and "Option B" (add-ons sit on any tier or on the one plan).
//     - Flat price: "£15.00 per month". Usage price: "£0.05 per question" (unit text from the record).
//     - AI Assistant card text contains "Demo AI".
//     - Each card has a button "Edit price" for users with billing.write; none for users without it.
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { addOnCopy, addOnIds, addOns } from '@sta/content';
import { actorFor, renderRoute, t } from '../../test/harness';
import { formatPounds } from '../../demo/format';

afterEach(cleanup);

const openP8 = async () => {
  await renderRoute('/provider/add-ons', 'provider');
  await screen.findByRole('heading', { level: 1, name: 'Add-on catalogue' });
  return screen.findAllByTestId('addon-card');
};

const cardFor = (cards: HTMLElement[], id: string) => cards.find((c) => c.getAttribute('data-addon-id') === id)!;

describe('P8 Add-on catalogue', () => {
  it('shows one card per catalogue add-on, in catalogue order, with its plain-English name and description', async () => {
    const cards = await openP8();
    expect(cards.map((c) => c.getAttribute('data-addon-id'))).toEqual(addOns.map((a) => a.id));
    for (const a of addOns) {
      const card = cardFor(cards, a.id);
      expect(card.textContent).toContain(a.name);
      const copy = addOnCopy[a.id]!;
      const what = t(copy.whatKey as Parameters<typeof t>[0]);
      expect(what.length).toBeGreaterThan(10);
      expect(card.textContent).toContain(what);
    }
  });

  it('shows flat prices as pounds per month and usage prices as pounds per unit', async () => {
    const cards = await openP8();
    const translation = addOns.find((a) => a.id === addOnIds.translation)!;
    if (translation.pricing.kind !== 'flat') throw new Error('fixture changed');
    const flat = cardFor(cards, addOnIds.translation).textContent;
    expect(flat).toContain(`${formatPounds(translation.pricing.price)} per month`);
    expect(flat).toContain('£15.00 per month');

    const ai = addOns.find((a) => a.id === addOnIds.aiAssistant)!;
    if (ai.pricing.kind !== 'usage') throw new Error('fixture changed');
    const usage = cardFor(cards, addOnIds.aiAssistant).textContent;
    expect(usage).toContain(`${formatPounds(ai.pricing.pricePerUnit)} per ${ai.pricing.unit}`);
    expect(usage).toContain('£0.05 per question');
    const sms = cardFor(cards, addOnIds.reminders).textContent;
    expect(sms).toContain('£0.04 per message');
  });

  it('says on every card that the add-on applies to Option A and Option B', async () => {
    const cards = await openP8();
    expect(cards).toHaveLength(addOns.length);
    for (const card of cards) {
      expect(card.textContent).toContain('Option A');
      expect(card.textContent).toContain('Option B');
    }
  });

  it('labels the AI Assistant card as a Demo AI and no other card', async () => {
    const cards = await openP8();
    expect(cardFor(cards, addOnIds.aiAssistant).textContent).toContain('Demo AI');
    for (const card of cards.filter((c) => c.getAttribute('data-addon-id') !== addOnIds.aiAssistant))
      expect(card.textContent).not.toContain('Demo AI');
  });

  it('gives a provider who can edit billing an Edit price button on every card', async () => {
    const cards = await openP8();
    for (const card of cards) expect(within(card).getByRole('button', { name: 'Edit price' })).toBeTruthy();
  });

  it('shows no Edit price control to the read-only provider user', async () => {
    await renderRoute('/provider/add-ons', 'provider', {
      actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users['tom'] }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Add-on catalogue' });
    await screen.findByText(/don't have permission|Applies to/i);
    expect(screen.queryAllByRole('button', { name: 'Edit price' })).toHaveLength(0);
  });
});

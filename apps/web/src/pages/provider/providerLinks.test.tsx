// M4 chunk 11a (BP-5, U layer): P5 "Learn more links" panel with a simulated Check links button and open counts.
// Written before the implementation.
//
// UI CONTRACT (data: store.linkCheck.run/last, store.learnMore.counts; both need content.write via can()):
//   Proposed language keys (en-GB):
//     provider.links.region "Learn more links"  provider.links.check "Check links"  provider.links.checking "Checking links"
//     provider.links.simulated "This check is simulated in the demo. No web requests are made."
//     provider.links.result "Checked {checked} links. {broken} broken."  provider.links.noneBroken "No broken links found."
//     provider.links.brokenHeading "Broken links"  provider.links.opensHeading "Opens across all clients"
//     provider.links.opens "{count} opens"  provider.links.loadError "Could not load link information."
//   P5 /provider/content: a region (section with aria-labelledby heading) named "Learn more links" holds:
//     - a button "Check links". Clicking it calls store.linkCheck.run and shows the result in the same region.
//     - before the click, no data-testid="broken-link" is shown.
//     - after the click, one data-testid="broken-link" (data-link-id) per broken result, here exactly the seeded one,
//       its text containing the link address (url).
//     - data-testid="link-open-count" rows (data-link-id, data-opens = the number, text containing the number of opens), one per entry of
//       store.learnMore.counts, in the same order. These are shown without needing the button click.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const provider = (keys: SeedKeys): ActorContext => actorFor('provider', keys);

const open = async (): Promise<Ctx> => {
  let ctx!: Ctx;
  await renderRoute('/provider/content', 'provider', {
    prepare: (c) => {
      ctx = c;
      return Promise.resolve();
    },
  });
  return ctx;
};

describe('P5 Learn more links panel', () => {
  it('has a Learn more links region with a Check links button and no broken link before checking', async () => {
    await open();
    const region = await screen.findByRole('region', { name: 'Learn more links' });
    expect(within(region).getByRole('button', { name: 'Check links' })).toBeTruthy();
    expect(within(region).queryAllByTestId('broken-link')).toHaveLength(0);
  });

  it('reports exactly the seeded broken link after Check links is clicked', async () => {
    const ctx = await open();
    const seeded = (await ctx.handle.store.linkCheck.last(provider(ctx.keys))).filter((r) => r.status === 'broken');
    expect(seeded).toHaveLength(1);
    const region = await screen.findByRole('region', { name: 'Learn more links' });
    await userEvent.click(within(region).getByRole('button', { name: 'Check links' }));
    await waitFor(() => {
      expect(within(region).getAllByTestId('broken-link')).toHaveLength(1);
    });
    const item = within(region).getByTestId('broken-link');
    expect(item.getAttribute('data-link-id')).toBe(seeded[0]!.linkId);
    expect(item.textContent).toContain(seeded[0]!.url);
  });

  it('records the check in the store when Check links is clicked', async () => {
    const ctx = await open();
    const region = await screen.findByRole('region', { name: 'Learn more links' });
    const before = await ctx.handle.store.linkCheck.last(provider(ctx.keys));
    await userEvent.click(within(region).getByRole('button', { name: 'Check links' }));
    await waitFor(() => {
      expect(within(region).getAllByTestId('broken-link')).toHaveLength(1);
    });
    const after = await ctx.handle.store.linkCheck.last(provider(ctx.keys));
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!.checkedAt >= before[0]!.checkedAt).toBe(true);
  });

  it('lists open counts whose rows and totals match the store aggregate', async () => {
    const ctx = await open();
    const counts = await ctx.handle.store.learnMore.counts(provider(ctx.keys));
    expect(counts.length).toBeGreaterThan(0);
    const region = await screen.findByRole('region', { name: 'Learn more links' });
    await waitFor(() => {
      expect(within(region).getAllByTestId('link-open-count')).toHaveLength(counts.length);
    });
    const rows = within(region).getAllByTestId('link-open-count');
    expect(rows.map((r) => r.getAttribute('data-link-id'))).toEqual(counts.map((c) => c.linkId));
    rows.forEach((row, i) => {
      expect(row.textContent).toContain(String(counts[i]!.opens));
    });
    const total = rows.reduce((sum, r) => sum + Number(r.getAttribute('data-opens')), 0);
    expect(total).toBe(counts.reduce((sum, c) => sum + c.opens, 0));
  });
});

// M4 chunk 18a (BP-13): demo-script Track B, the provider tour (build pack 8.2), as automated steps.
// Desktop project only. The provider desktop page is the main page; a second page sized 390 by 844 plays the client
// and staff views the tour shows (Willow Lane). Both pages share one browser context, so they share IndexedDB and
// talk over BroadcastChannel like two tabs. The clock is fixed at PINNED before the first load.
// Each tour step is its own test (a fresh context each), so a gap in one step does not hide the others.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';

const PINNED = new Date('2026-10-19T09:00:01.000Z');
const BASE_ORIGIN = 'http://localhost:4173';

test.skip(({ isMobile }) => isMobile, 'desktop project only');

const panel = (page: Page) => page.getByRole('dialog', { name: 'Presenter panel' });

/** Pins the clock and records every request that leaves the app (Learn more targets are stubbed). */
async function setUp(context: BrowserContext) {
  await context.clock.setFixedTime(PINNED);
  const outside: string[] = [];
  await context.route(
    (url) => url.origin !== BASE_ORIGIN && url.protocol.startsWith('http'),
    (route) => {
      outside.push(route.request().url());
      return route.fulfill({ contentType: 'text/html', body: '<title>Stub</title>stub' });
    },
  );
  return outside;
}

async function jumpTo(page: Page, name: RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('group', { name: 'Jump to persona' }).getByRole('button', { name }).click();
  await expect(panel(page)).toBeHidden();
}

async function inPanel(page: Page, button: string | RegExp) {
  await page.keyboard.press('Shift+Alt+KeyP');
  await panel(page).getByRole('button', { name: button }).click();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
}

async function noSeriousAxe(page: Page) {
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function openProvider(page: Page, hash: string, heading: string | RegExp) {
  await page.goto(`./#/provider${hash}`);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

async function phone(context: BrowserContext) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 390, height: 844 });
  return p;
}

test.describe('Track B: provider tour', () => {
  test('step 1: overview and client list, the Simulated data badge, and Keep billing name on Profile changes', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const outside = await setUp(context);

    await openProvider(page, '', 'Overview');
    await expect(page.getByTestId('demo-badge')).toBeVisible();
    await expect(page.getByText('Simulated data')).toBeVisible();
    await expect(page.getByText('Health scores are simulated for this demo.')).toBeVisible();
    const clientsInStore = await readStore(page, 'clients');
    const people = await readStore(page, 'people');
    await expect(page.getByTestId('overview-total-clients')).toContainText(String(clientsInStore.length));
    await expect(page.getByTestId('overview-total-people')).toContainText(
      String(people.filter((p) => p['status'] === 'active').length),
    );
    const byState = page.getByRole('region', { name: 'Clients by account state' });
    await expect(byState).toContainText('Payment overdue: 1');
    await expect(page.getByRole('region', { name: 'Needs attention' }).getByTestId('attention-item')).not.toHaveCount(
      0,
    );
    await noSeriousAxe(page);

    // Client list: each client with state, sites, people and a simulated health score.
    await page.getByRole('link', { name: 'Clients', exact: true }).first().click();
    await expect(page).toHaveURL(/#\/provider\/clients$/);
    const rows = page.getByTestId('client-row');
    await expect(rows).toHaveCount(clientsInStore.length);
    const willow = rows.filter({ hasText: 'Willow Lane Nursery' });
    await expect(willow).toContainText('Payment overdue');
    await expect(willow).toContainText(/Sites: 1/);
    await expect(willow).toContainText(/Health score: \d+ \(simulated\)/);
    await page.getByLabel('Account state').selectOption('pastDue');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Willow Lane Nursery');
    await page.getByLabel('Account state').selectOption('all');
    await expect(rows).toHaveCount(clientsInStore.length);

    // Profile changes: Oak Tree renamed itself; compare with the billing name and Keep billing name.
    await page.goto('./#/provider/profile-changes');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile changes' })).toBeVisible();
    const pending = page.getByTestId('pc-row').filter({ hasText: 'Oak Tree' });
    await expect(pending).toHaveCount(1);
    await expect(pending).toContainText('Old name');
    await expect(pending).toContainText('New name');
    await expect(pending).toContainText('Billing name');
    await expect(pending).toContainText('Waiting for review');
    await noSeriousAxe(page);
    await pending.getByRole('button', { name: 'Keep billing name' }).click();
    await expect(pending.getByRole('status')).toHaveText('Billing name kept.');
    await expect(pending).toContainText('Billing name kept');
    await expect(pending.getByRole('button', { name: 'Keep billing name' })).toHaveCount(0);

    // Stored: the billing profile still has the billing name and the request is marked reviewed.
    const requests = await readStore(page, 'profileChangeRequests');
    expect(requests.some((r) => r['status'] === 'billingKept')).toBe(true);
    expect(outside).toEqual([]);
  });

  test('step 2a: Little Acorns detail shows usage by feature and errors and logs', async ({ page, context }) => {
    test.setTimeout(120_000);
    const outside = await setUp(context);
    await openProvider(page, '/clients', 'Clients');
    await page.getByTestId('client-row').filter({ hasText: 'Little Acorns' }).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: /Little Acorns/ })).toBeVisible();

    await page.getByRole('tab', { name: 'Usage' }).click();
    const usage = page.getByRole('tabpanel');
    await expect(usage).toContainText(/\d+ uses, \d+ active people/);
    expect(await usage.getByRole('listitem').count()).toBeGreaterThanOrEqual(2);
    await noSeriousAxe(page);

    await page.getByRole('tab', { name: 'Errors and logs' }).click();
    const errors = page.getByRole('tabpanel');
    await expect(errors.getByRole('listitem').first()).toContainText(/seen \d+ times, \d+ people affected/);
    await expect(errors).toContainText('Status:');
    expect(outside).toEqual([]);
  });

  test('step 2b: the Audit tab on Little Acorns lists what Priya did on this device', async ({ page, context }) => {
    test.setTimeout(120_000);
    await setUp(context);
    await page.goto('./#/client/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.getByRole('checkbox', { name: /Let staff raise support tickets/ }).uncheck();
    await page.getByRole('button', { name: 'Save settings' }).click();

    await openProvider(page, '/clients', 'Clients');
    await page.getByTestId('client-row').filter({ hasText: 'Little Acorns' }).getByRole('link').click();
    await page.getByRole('tab', { name: 'Audit' }).click();
    const rows = page.getByRole('tabpanel').getByTestId('audit-row');
    await expect(rows.first()).toContainText('Priya');
  });

  test('step 2c: the Content library shows provider-module feedback without names, a question report, and Check links finds the broken link', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const outside = await setUp(context);
    await page.goto('./#/staff');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const people = await readStore(page, 'people');

    await openProvider(page, '/content', 'Content');
    const feedback = page.getByRole('region', { name: 'Module feedback' });
    await expect(feedback.getByTestId('provider-feedback-module').first()).toBeVisible();
    await expect(feedback.getByTestId('provider-feedback-item').first()).toBeVisible();
    const text = (await feedback.textContent()) ?? '';
    for (const p of people) expect(text).not.toContain(`${String(p['firstName'])} ${String(p['lastName'])}`);
    // A question report: at least one item points at a question, across all clients.
    expect(await feedback.getByText(/^Question: /).count()).toBeGreaterThan(0);
    await noSeriousAxe(page);

    // Check links: nothing listed before, then exactly the seeded broken link, with no web request made.
    const links = page.getByRole('region', { name: 'Learn more links' });
    await expect(links.getByTestId('broken-link')).toHaveCount(0);
    await links.getByRole('button', { name: 'Check links' }).click();
    await expect(links.getByText(/^Checked \d+ links\. 1 broken\.$/)).toBeVisible();
    await expect(links.getByTestId('broken-link')).toHaveCount(1);
    await expect(links.getByTestId('broken-link')).toContainText('http');
    expect(outside).toEqual([]);
  });

  test('step 3: Willow Lane ticket reply with a saved reply, In progress, internal note, then Other entries re-tag of the 5 certificate tickets', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const outside = await setUp(context);
    await openProvider(page, '/tickets', 'Ticket inbox');
    await page.getByLabel('Client').selectOption({ label: 'Willow Lane Nursery' });
    const row = page.getByTestId('ticket-row').filter({ hasText: 'Cannot download a training certificate' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Received');
    await noSeriousAxe(page);
    await row.getByRole('link', { name: 'Cannot download a training certificate' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cannot download a training certificate' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ticket details' })).toContainText('Willow Lane Nursery');
    const conversation = page.getByRole('region', { name: 'Conversation' });
    await expect(conversation.getByTestId('ticket-message')).toHaveCount(1);

    // Saved reply, filled with the customer's first name, then sent.
    await page.getByLabel('Insert saved reply').selectOption({ label: 'Thanks, we are looking' });
    const reply = page.getByRole('textbox', { name: 'Reply to customer' });
    await expect(reply).toHaveValue(/^Hi Gemma, thanks for telling us\./);
    await expect(reply).not.toHaveValue(/\{\{/);
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(conversation.getByTestId('ticket-message')).toHaveCount(2);
    await expect(conversation.getByTestId('ticket-message').nth(1)).toContainText('Hi Gemma, thanks for telling us.');
    await expect(conversation.getByTestId('ticket-message').nth(1)).not.toHaveAttribute('data-internal', 'true');

    await page.getByLabel('Status', { exact: true }).selectOption('inProgress');
    await expect(page.getByRole('region', { name: 'Ticket details' })).toContainText('In progress');

    await page.getByRole('checkbox', { name: 'Add internal note' }).check();
    await page.getByRole('textbox', { name: 'Internal note' }).fill('Same fault reported by four other nurseries.');
    await page.getByRole('button', { name: 'Add note' }).click();
    const note = conversation.locator('[data-internal="true"]');
    await expect(note).toHaveCount(1);
    await expect(note).toContainText('Internal note');
    await expect(note).toContainText('Same fault reported by four other nurseries.');

    // The customer never sees the note: Gemma's ticket thread on the client side shows the reply only.
    const ticketId = page.url().split('/').pop();
    const stored = (await readStore(page, 'tickets')).find((t) => t['id'] === ticketId);
    expect(stored?.['status']).toBe('inProgress');
    const messages = (await readStore(page, 'ticketMessages')).filter((m) => m['ticketId'] === ticketId);
    expect(messages.filter((m) => m['internal'] === true)).toHaveLength(1);
    expect(messages.filter((m) => m['side'] === 'provider' && m['internal'] !== true)).toHaveLength(1);

    // Support settings: the five certificate tickets become one new issue type.
    await page.goto('./#/provider/support-settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Support settings' })).toBeVisible();
    const other = page.getByRole('region', { name: 'Other entries review' });
    await other.getByRole('radio', { name: 'Issue type' }).check();
    const group = other.getByTestId('other-entry-group').filter({ hasText: "certificate won't download" });
    await expect(group).toHaveCount(1);
    await expect(group).toContainText('Used by 2 clients');
    await expect(group).toContainText('5 tickets');
    await expect(group).toContainText('Trending');
    await group.getByRole('button', { name: 'Create issue type' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create issue type' });
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue("certificate won't download");
    const boxes = dialog.getByTestId('retag-ticket');
    await expect(boxes).toHaveCount(5);
    for (const b of await boxes.all()) await expect(b).toBeChecked();
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Certificate download');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTestId('retag-confirmation')).toHaveText('Re-tagged 5 tickets');

    const certTickets = (await readStore(page, 'tickets')).filter(
      (t) => t['title'] === 'Cannot download a training certificate',
    );
    expect(certTickets).toHaveLength(5);
    expect(certTickets.every((t) => typeof t['issueTypeId'] === 'string')).toBe(true);
    expect(new Set(certTickets.map((t) => t['issueTypeId'])).size).toBe(1);
    await noSeriousAxe(page);
    expect(outside).toEqual([]);
  });

  test('step 3b: a Willow Lane ticket opens with its screenshot', async ({ page, context }) => {
    test.setTimeout(120_000);
    await setUp(context);
    await openProvider(page, '/tickets', 'Ticket inbox');
    await page.getByLabel('Client').selectOption({ label: 'Willow Lane Nursery' });
    await page.getByTestId('ticket-row').filter({ hasText: 'progress bar' }).getByRole('link').click();
    await expect(page.getByRole('img', { name: /screenshot/i })).toBeVisible();
  });

  test('step 4: Willow Lane is Past due, goes Limited, staff keep training, exports stay open, and paying restores everything', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const outside = await setUp(context);

    // Provider: Dunning lists Willow Lane as Past due with an amount.
    await openProvider(page, '/dunning', 'Dunning');
    const dun = page.getByTestId('dunning-row').filter({ hasText: 'Willow Lane Nursery' });
    await expect(dun).toHaveCount(1);
    await expect(dun).toContainText(/Outstanding: £\d/);
    await noSeriousAxe(page);

    // Client view: Gemma sees the Past due banner (day 10) with an amount and Fix this now.
    const gemma = await phone(context);
    await gemma.goto('./');
    await jumpTo(gemma, /Gemma Holt, Willow Lane/);
    await gemma.goto('./#/client');
    const banner = gemma.getByTestId('account-banner');
    await expect(banner).toContainText('Your last payment did not go through');
    await expect(banner.getByRole('button', { name: 'Fix this now' })).toBeVisible();

    // Fast-forward to Limited. The banner changes, extras lock, the state shows on the provider side.
    await inPanel(gemma, 'Fast-forward 7 days');
    await expect(gemma.getByTestId('account-banner')).toContainText('Your account is limited');
    await gemma.goto('./#/client/billing/add-ons');
    await expect(gemma.getByRole('heading', { level: 1, name: 'Add-ons' })).toBeVisible();
    const ai = gemma.getByRole('region', { name: 'AI Assistant' });
    await ai.getByRole('button', { name: 'Turn on' }).click();
    await gemma
      .getByRole('dialog')
      .getByRole('button', { name: /confirm/i })
      .click();
    // Extras are locked while Limited: the add-on stays off and nothing is switched on.
    await expect(ai).toContainText('Off');
    await expect(ai).not.toContainText(/\bOn\b/);
    await openProvider(page, '/dunning', 'Dunning');
    await inPanel(page, 'Fast-forward 7 days');
    await expect(dun).toContainText('Limited');

    // Exports stay open while Limited.
    await gemma.goto('./#/client/data');
    await expect(gemma.getByRole('heading', { level: 1, name: 'Data and retention' })).toBeVisible();
    await expect(gemma.getByRole('button', { name: 'Export all data (ZIP)' })).toBeEnabled();

    // Staff still train: a Willow Lane member of staff has a working home screen, with no payment wording.
    await jumpTo(gemma, /Edith Pryce, Willow Lane/);
    await gemma.goto('./#/staff');
    await expect(gemma.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(gemma.getByRole('region', { name: 'Next up' })).toBeVisible();
    await expect(gemma.locator('main')).not.toContainText(/billing|payment|invoice|pay now|£/i);
    await gemma.goto('./#/staff/learn');
    await expect(gemma.getByRole('searchbox', { name: 'Search' })).toBeEnabled();

    // Pay on the mock page: everything returns.
    await jumpTo(gemma, /Gemma Holt, Willow Lane/);
    await gemma.goto('./#/client');
    await gemma.getByTestId('account-banner').getByRole('button', { name: 'Fix this now' }).click();
    await expect(gemma).toHaveURL(/#\/client\/billing\/pay$/);
    await gemma.getByRole('button', { name: 'Pay now' }).click();
    await expect(gemma.getByText('Payment received. Thank you.')).toBeVisible();
    await gemma.goto('./#/client');
    await expect(gemma.getByTestId('account-banner')).toHaveCount(0);
    await page.reload();
    await openProvider(page, '/dunning', 'Dunning');
    await expect(dun).toHaveCount(0);
    expect(outside).toEqual([]);
  });

  test('step 4c: the provider client list follows Fast-forward to Limited', async ({ page, context }) => {
    test.setTimeout(120_000);
    await setUp(context);
    await openProvider(page, '/clients', 'Clients');
    await inPanel(page, 'Fast-forward 7 days');
    await expect(page.getByTestId('client-row').filter({ hasText: 'Willow Lane Nursery' })).toContainText('Limited');
  });

  test('step 4b: Simulate failed payment puts a client into Past due and the provider sees it', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await setUp(context);
    await page.goto('./#/client');
    await expect(page.getByTestId('account-banner')).toHaveCount(0);
    await inPanel(page, 'Simulate failed payment');
    await expect(page.getByTestId('account-banner')).toContainText('Your last payment did not go through', {
      timeout: 20_000,
    });
    await openProvider(page, '/clients', 'Clients');
    await expect(page.getByTestId('client-row').filter({ hasText: 'Little Acorns' })).toContainText('Payment overdue');
  });

  test('step 5: the permission matrix, a new Account manager style role, and an invitation that lands in the Outbox', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const outside = await setUp(context);
    await openProvider(page, '/team', 'Team and roles');
    await expect(page.getByTestId('member-row')).not.toHaveCount(0);
    const roles = page.getByTestId('role-row');
    await expect(roles.filter({ hasText: 'Account manager' })).toContainText('Custom role');
    await expect(roles.filter({ hasText: 'Owner' }).first()).toContainText('System role');
    await noSeriousAxe(page);

    // Permission matrix: the editor groups permissions by area, flags sensitive ones and adds dependencies.
    await page.getByRole('button', { name: 'New role' }).click();
    const editor = page.getByRole('region', { name: 'Role editor' });
    await expect(editor.getByTestId('perm-area').first()).toBeVisible();
    expect(await editor.getByTestId('perm-area').count()).toBeGreaterThan(5);
    await expect(editor.getByText('Sensitive').first()).toBeVisible();
    await editor.getByRole('textbox', { name: 'Role name' }).fill('Account manager north');
    await editor
      .getByRole('textbox', { name: 'Description' })
      .fill('Clients, tickets and support reports for the northern clients');
    await editor.locator('[data-permission-id="tickets.write"] input[type="checkbox"]').check();
    await expect(editor.getByRole('status')).toContainText('Also added because it needs them');
    await expect(editor.locator('[data-permission-id="tickets.read"] input[type="checkbox"]')).toBeChecked();
    await editor.getByRole('button', { name: 'Save role' }).click();
    await expect(roles.filter({ hasText: 'Account manager north' })).toContainText('Custom role');
    const stored = (await readStore(page, 'roles')).find((r) => r['name'] === 'Account manager north');
    expect(stored?.['permissionIds']).toEqual(expect.arrayContaining(['tickets.read', 'tickets.write']));

    // Compare roles: Account manager north against the seeded Account manager.
    const compare = page.getByRole('region', { name: 'Compare roles' });
    await compare.getByLabel('From role').selectOption({ label: 'Account manager' });
    await compare.getByLabel('To role').selectOption({ label: 'Account manager north' });
    await expect(compare.getByTestId('compare-added')).toBeVisible();
    await expect(compare.getByTestId('compare-removed')).toBeVisible();

    // Invite by email with the role preset; the email is in the Outbox.
    const invite = page.getByRole('region', { name: 'Invite someone' });
    await invite.getByRole('textbox', { name: 'Email' }).fill('asha.new@example.test');
    await invite.getByRole('textbox', { name: 'Name' }).fill('Asha New');
    await invite.getByLabel('Role').selectOption({ label: 'Account manager' });
    await invite.getByRole('button', { name: 'Send invite' }).click();
    const member = page.getByTestId('member-row').filter({ hasText: 'Asha New' });
    await expect(member).toContainText('Invited');
    await expect(member).toContainText('Account manager');

    await page.goto('./#/demo/outbox');
    await expect(page.getByRole('heading', { level: 1, name: 'Outbox' })).toBeVisible();
    await expect(page.getByText('asha.new@example.test')).toBeVisible();
    await noSeriousAxe(page);
    expect(outside).toEqual([]);
  });

  // The scope is chosen when someone is invited (it sits on the role assignment, as in the permission model), so the
  // control is on the invite form of P18, not in the role editor.
  test('step 5b: an invitation can be limited to selected clients', async ({ page, context }) => {
    test.setTimeout(120_000);
    await setUp(context);
    await openProvider(page, '/team', 'Team and roles');
    const invite = page.getByRole('region', { name: 'Invite someone' });
    await invite.getByRole('textbox', { name: 'Email' }).fill('sam.scoped@example.test');
    await invite.getByRole('textbox', { name: 'Name' }).fill('Sam Scoped');
    await invite.getByLabel('Role').selectOption({ label: 'Account manager' });
    await invite.getByRole('radio', { name: 'Selected clients' }).check();
    const scope = invite.getByRole('group', { name: 'Choose clients' });
    await scope.getByRole('checkbox', { name: 'Harbour Cafe Group' }).check();
    await scope.getByRole('checkbox', { name: 'Summit Builders' }).check();
    await invite.getByRole('button', { name: 'Send invite' }).click();
    await expect(page.getByTestId('member-row').filter({ hasText: 'Sam Scoped' })).toContainText(
      'Selected clients only: 2',
    );
  });

  test('step 6: price changes, a 15 per cent retention discount for two at-risk clients, step-up confirm, visible on Harbour Cafe Group billing tab', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const outside = await setUp(context);
    await openProvider(page, '/pricing', 'Price changes');
    await page.getByRole('button', { name: 'New change' }).click();
    await page.getByRole('radio', { name: 'Several clients' }).check();
    await page.getByRole('checkbox', { name: 'Harbour Cafe Group' }).check();
    await page.getByRole('checkbox', { name: 'Summit Builders' }).check();
    await page.getByLabel('Type').selectOption('discount');
    await page.getByLabel('Applies to').selectOption('plan');
    await page.getByLabel('Value').fill('15');
    await page.getByLabel('Reason').selectOption('retention');
    await page.getByLabel('Notice days').fill('0');
    await page.getByLabel('End date (optional)').fill('2027-01-19');
    await page.getByRole('button', { name: 'Preview' }).click();
    const preview = page.getByTestId('price-preview');
    await expect(preview.getByTestId('preview-row')).toHaveCount(2);
    await expect(preview).toContainText('Harbour Cafe Group');
    await expect(preview).toContainText('Summit Builders');
    await expect(preview.getByTestId('preview-row').first()).toContainText(/£\d/);
    await noSeriousAxe(page);

    // Nothing is stored by the preview.
    const seeded = (await readStore(page, 'priceAdjustments')).length;
    expect(await readStore(page, 'priceAdjustments')).toHaveLength(seeded);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    const row = page.getByTestId('price-row').filter({ hasText: 'Harbour Cafe Group' });
    await expect(row).toContainText('Draft');
    await expect(row).toContainText('-15%');
    await row.getByRole('button', { name: 'Submit for confirmation' }).click();
    await expect(row).toContainText('Awaiting confirmation');

    // Confirm with the demo authenticator code; a wrong code is refused first.
    await row.getByRole('button', { name: 'Confirm', exact: true }).click();
    await row.getByRole('textbox', { name: 'Step-up code' }).fill('000000');
    await row.getByRole('button', { name: 'Confirm change' }).click();
    await expect(row.getByRole('alert')).toHaveText('That code is not right.');
    await row.getByRole('textbox', { name: 'Step-up code' }).fill('123456');
    await row.getByRole('button', { name: 'Confirm change' }).click();
    await expect(page.getByText('Price change confirmed.')).toBeVisible();
    // Notice is 0 days, so the change is already in force.
    await expect(row).toContainText('Active');
    await expect(page.getByTestId('price-group').filter({ has: row })).toHaveAttribute('data-status', 'active');

    // Harbour Cafe Group's Billing tab shows the discount.
    await page.goto('./#/provider/clients');
    await page.getByTestId('client-row').filter({ hasText: 'Harbour Cafe Group' }).getByRole('link').click();
    await page.getByRole('tab', { name: 'Billing' }).click();
    const tabPanel = page.getByTestId('price-panel');
    await expect(tabPanel.getByTestId('price-row')).toHaveCount(1);
    await expect(tabPanel).toContainText('-15%');
    await expect(tabPanel).toContainText('Active');
    expect(outside).toEqual([]);
  });

  test('step 6b: Harbour Cafe Group billing tab shows the end date of the discount', async ({ page, context }) => {
    test.setTimeout(120_000);
    await setUp(context);
    await openProvider(page, '/pricing', 'Price changes');
    await page.getByRole('button', { name: 'New change' }).click();
    await page.getByRole('combobox', { name: 'Client' }).selectOption({ label: 'Harbour Cafe Group' });
    await page.getByLabel('Type').selectOption('discount');
    await page.getByLabel('Value').fill('15');
    await page.getByLabel('Reason').selectOption('retention');
    await page.getByLabel('Notice days').fill('0');
    await page.getByLabel('End date (optional)').fill('2027-01-19');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    await page.goto('./#/provider/clients');
    await page.getByTestId('client-row').filter({ hasText: 'Harbour Cafe Group' }).getByRole('link').click();
    await page.getByRole('tab', { name: 'Billing' }).click();
    await expect(page.getByTestId('price-panel')).toContainText(/19 January 2027|19 Jan 2027/);
  });

  test('step 7: security and data commitments, with the honest note that authentication, payments and messaging are simulated', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await setUp(context);
    await openProvider(page, '/security', 'Security');
    await expect(page.getByText('Demo only')).toBeVisible();
    await expect(page.getByText(/Two-step sign-in is required for all provider team members/)).toBeVisible();
    await noSeriousAxe(page);
    await page.goto('./#/provider/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
    await noSeriousAxe(page);
  });

  test('step 7b: a closing screen lists the commitments and the simulation note', async ({ page, context }) => {
    test.setTimeout(120_000);
    await setUp(context);
    await openProvider(page, '/security', 'Security');
    const main = page.locator('main');
    await expect(main).toContainText(/audit log/i);
    await expect(main).toContainText(/retention/i);
    await expect(main).toContainText(/exports/i);
    await expect(main).toContainText(/simulates/i);
  });
});

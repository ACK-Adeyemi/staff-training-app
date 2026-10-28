// M3 chunk 15b (BP-1 builder and overlay parts, BP-2, BP-3 C7 part, and Track A step 6 first part): the Module Builder
// C7 at #/client/modules/new and #/client/modules/:id/edit. Runs on the phone (390 by 844) and desktop projects.
// Contract: see apps/web/src/pages/client/moduleBuilder.test.tsx (accessible names, data-testid values). After the
// first Save draft of a new module the address becomes #/client/modules/<id>/edit (replace), so a reload reopens it.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readStore } from './helpers/idb';

const PROVIDER_MODULE = '01M0C0N7000000000000000201';
const NOT_HTTPS = 'Links must start with https://.';
const MARKDOWN = [
  '# Raise the alarm',
  'Shout fire and press the nearest call point.',
  '',
  '# Leave the building',
  'Lead the children to the assembly point.',
  '',
  '# Check everyone is out',
  'Count heads against the register.',
].join('\n');
const PDF = {
  name: 'policy.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'),
};

async function pinClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-19T09:00:00.000Z') });
}

async function expectTouchTargets(...targets: Locator[]) {
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  }
}

async function newModule(page: Page) {
  await pinClock(page);
  await page.goto('./#/client/modules');
  await page.getByRole('link', { name: 'New module' }).click();
  await expect(page).toHaveURL(/#\/client\/modules\/new$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Module builder' })).toBeVisible();
}

async function addMcq(page: Page, index: number, prompt: string) {
  await page.getByRole('button', { name: 'Add multiple choice question' }).click();
  const card = page.getByTestId('builder-question').nth(index);
  await card.getByRole('textbox', { name: 'Question' }).fill(prompt);
  await card.getByRole('textbox', { name: 'Option 1' }).fill('Right answer');
  await card.getByRole('textbox', { name: 'Option 2' }).fill('Wrong answer');
  await card.getByRole('checkbox', { name: 'Option 1 is correct' }).check();
  await card.getByRole('textbox', { name: 'Explanation' }).fill('Because the right answer keeps everyone safe.');
}

async function addTrueFalse(page: Page, index: number, prompt: string) {
  await page.getByRole('button', { name: 'Add true or false question' }).click();
  const card = page.getByTestId('builder-question').nth(index);
  await card.getByRole('textbox', { name: 'Question' }).fill(prompt);
  await card.getByRole('radio', { name: 'False is correct' }).check();
  await card.getByRole('textbox', { name: 'Explanation' }).fill('Never use the lifts in a fire.');
}

test('Track A step 6: paste three headings, see three lessons, add three questions, preview, publish and assign to everyone (BP-2, BP-20)', async ({
  page,
}) => {
  await newModule(page);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Fire drill for new starters');
  await page.getByRole('textbox', { name: 'Paste your lessons' }).fill(MARKDOWN);
  await page.getByRole('button', { name: 'Turn into lessons' }).click();
  await expect(page.getByTestId('builder-lesson')).toHaveCount(3);

  await addMcq(page, 0, 'Where do you take the children?');
  await addMcq(page, 1, 'What do you take with you?');
  await addTrueFalse(page, 2, 'Lifts are safe in a fire. True or false?');
  await expect(page.getByTestId('builder-question')).toHaveCount(3);

  const preview = page.getByRole('region', { name: 'Phone preview' });
  await expect(preview.getByRole('heading', { level: 2, name: 'Raise the alarm' })).toBeVisible();
  await preview.getByRole('button', { name: 'Next lesson' }).click();
  await expect(preview.getByRole('heading', { level: 2, name: 'Leave the building' })).toBeVisible();
  const frame = await page.locator('[data-phone-frame]').boundingBox();
  expect(frame?.width ?? 0).toBeLessThanOrEqual(390.5);

  await page.getByRole('checkbox', { name: 'This module is optional' }).check();
  await expect(page.getByTestId('checklist-item').and(page.locator('[data-passed="false"]'))).toHaveCount(0);
  const before = (await readStore(page, 'assignments')).length;

  await page.getByRole('button', { name: 'Publish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish as version 1' });
  await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
  expect((await readStore(page, 'assignments')).length).toBe(before);

  await page.getByRole('button', { name: 'Assign to everyone' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Assigned to \d+ people\./ })).toBeVisible();
  const after = await readStore(page, 'assignments');
  expect(after.length).toBeGreaterThanOrEqual(before + 10);
  const modules = await readStore(page, 'modules');
  const mine = modules.find((m) => m['title'] === 'Fire drill for new starters');
  expect(mine?.['status']).toBe('published');
  expect(mine?.['version']).toBe(1);
});

test('Save draft keeps the work across a reload (BP-2)', async ({ page }) => {
  await newModule(page);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Reload test module');
  await page.getByRole('textbox', { name: 'Paste your lessons' }).fill(MARKDOWN);
  await page.getByRole('button', { name: 'Turn into lessons' }).click();
  await addMcq(page, 0, 'Reload question?');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  await expect(page).toHaveURL(/#\/client\/modules\/[^/]+\/edit$/);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Reload test module');
  await expect(page.getByTestId('builder-lesson')).toHaveCount(3);
  await expect(page.getByTestId('builder-question')).toHaveCount(1);
  await expect(page.getByTestId('builder-question').getByRole('textbox', { name: 'Question' })).toHaveValue(
    'Reload question?',
  );
});

test('Publish is blocked with each failing checklist item listed, and the layout is usable (BP-2)', async ({
  page,
}) => {
  await newModule(page);
  const items = page.getByTestId('checklist-item');
  await expect(items).toHaveCount(6);
  await expect(items.filter({ hasText: 'To do' })).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: "This can't be published yet. Fix the items listed first." }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const text of [
    'Give it a title of 3 to 100 characters',
    'Add at least one lesson with text',
    'Add at least one question',
    'Link a requirement or mark the module optional',
  ]) {
    await expect(items.filter({ hasText: text })).toHaveAttribute('data-passed', 'false');
  }
  await expectTouchTargets(
    page.getByRole('button', { name: 'Save draft' }),
    page.getByRole('button', { name: 'Publish' }),
    page.getByRole('button', { name: 'Turn into lessons' }),
    page.getByRole('button', { name: 'Add multiple choice question' }),
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('editing a published own module and publishing makes the next version, and the versions list shows the earlier ones (BP-2)', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/client/modules');
  const fire = page.getByTestId('module-item').filter({ hasText: 'Fire evacuation' });
  await expect(fire).toContainText('Version 2');
  await fire.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Module builder' })).toBeVisible();
  await expect(page.getByTestId('version-row')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Fire evacuation (revised)');
  await page.getByRole('checkbox', { name: 'This module is optional' }).check();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  const published = (await readStore(page, 'modules')).filter((m) => m['title'] === 'Fire evacuation at Little Acorns');
  expect(published).toHaveLength(1);
  expect(published[0]?.['version']).toBe(2);
  const assignments = (await readStore(page, 'assignments')).length;
  await page.getByRole('button', { name: 'Publish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish as version 3' });
  await expect(
    dialog.getByRole('checkbox', { name: 'Ask people who completed version 2 to take it again' }),
  ).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
  expect((await readStore(page, 'assignments')).length).toBe(assignments);
  const modules = await readStore(page, 'modules');
  expect(modules.find((m) => m['title'] === 'Fire evacuation (revised)')?.['version']).toBe(3);
  const versions = (await readStore(page, 'moduleVersions')).filter((v) => v['version'] !== undefined);
  expect(versions.length).toBeGreaterThanOrEqual(2);
});

test('own module Learn more panel accepts https links and a PDF and refuses http, javascript, data and relative addresses (BP-1)', async ({
  page,
}) => {
  await newModule(page);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Links module');
  await page.getByRole('textbox', { name: 'Paste your lessons' }).fill('# One\nSome text.');
  await page.getByRole('button', { name: 'Turn into lessons' }).click();
  const lesson = page.locator('[data-testid="link-target"][data-target-kind="lesson"]').first();
  for (const bad of ['http://example.invalid/a', 'javascript:alert(1)', 'data:text/html,hi', '/relative']) {
    await lesson.getByRole('textbox', { name: 'Link title' }).fill('Bad');
    await lesson.getByRole('textbox', { name: 'Web address' }).fill(bad);
    await lesson.getByRole('button', { name: 'Add link' }).click();
    await expect(lesson.getByRole('alert')).toHaveText(NOT_HTTPS);
    await expect(lesson.getByTestId('link-item')).toHaveCount(0);
  }
  await lesson.getByRole('textbox', { name: 'Link title' }).fill('GOV.UK fire safety');
  await lesson
    .getByRole('textbox', { name: 'Web address' })
    .fill('https://www.gov.uk/workplace-fire-safety-your-responsibilities');
  await lesson.getByRole('button', { name: 'Add link' }).click();
  await expect(lesson.getByTestId('link-item')).toHaveCount(1);
  await lesson.getByRole('textbox', { name: 'Link title' }).fill('Our policy');
  await lesson.getByLabel('Choose a PDF').setInputFiles(PDF);
  await expect(lesson.getByTestId('link-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  const saved = (await readStore(page, 'modules')).find((m) => m['title'] === 'Links module') as
    { lessons: { furtherReading?: { url?: string; attachmentId?: string }[] }[] } | undefined;
  const links = saved?.lessons[0]?.furtherReading ?? [];
  expect(links.map((l) => Boolean(l.url))).toEqual([true, false]);
  expect(links[1]?.attachmentId).toBeTruthy();
});

test('a provider module shows only the Add our own links panel and saves overlays without changing the module (BP-1, BP-3)', async ({
  page,
}) => {
  await pinClock(page);
  await page.goto('./#/client/modules');
  await page
    .locator(`[data-testid="module-item"][data-module-id="${PROVIDER_MODULE}"]`)
    .getByRole('link', { name: 'Add our own links' })
    .click();
  await expect(page.getByRole('heading', { name: 'Add our own links' })).toBeVisible();
  await expect(
    page.getByText('This training belongs to the provider, so you cannot change it. You can make your own copy.'),
  ).toBeVisible();
  for (const name of ['Title', 'Paste your lessons']) {
    await expect(page.getByRole('textbox', { name, exact: true })).toHaveCount(0);
  }
  for (const name of ['Save draft', 'Publish']) await expect(page.getByRole('button', { name })).toHaveCount(0);

  const before = (await readStore(page, 'modules')).find((m) => m['id'] === PROVIDER_MODULE);
  const lesson = page.locator('[data-testid="link-target"][data-target-kind="lesson"]').first();
  await lesson.getByRole('textbox', { name: 'Link title' }).fill('Our safeguarding lead');
  await lesson.getByRole('textbox', { name: 'Web address' }).fill('http://example.invalid/lead');
  await lesson.getByRole('button', { name: 'Add link' }).click();
  await expect(lesson.getByRole('alert')).toHaveText(NOT_HTTPS);
  await lesson.getByRole('textbox', { name: 'Web address' }).fill('https://example.invalid/lead');
  await lesson.getByRole('button', { name: 'Add link' }).click();
  await expect(lesson.getByTestId('link-item')).toHaveCount(1);
  const question = page.locator('[data-testid="link-target"][data-target-kind="question"]').first();
  // The seed already holds the client's policy link on some questions, so count what was there.
  const seededLinks = await question.getByTestId('link-item').count();
  await question.getByRole('textbox', { name: 'Link title' }).fill('Our policy');
  await question.getByLabel('Choose a PDF').setInputFiles(PDF);
  await expect(question.getByTestId('link-item')).toHaveCount(seededLinks + 1);
  await expectTouchTargets(
    lesson.getByRole('button', { name: 'Add link' }),
    lesson.getByRole('button', { name: 'Remove link' }),
  );

  const overlays = (await readStore(page, 'clientLinkOverlays')).filter((o) => o['moduleId'] === PROVIDER_MODULE);
  const titles = overlays.flatMap((o) => ((o['links'] as { title: string }[] | undefined) ?? []).map((l) => l.title));
  expect(titles).toEqual(expect.arrayContaining(['Our safeguarding lead', 'Our policy']));
  expect((await readStore(page, 'modules')).find((m) => m['id'] === PROVIDER_MODULE)).toEqual(before);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('Edit module can open the builder at a given lesson with ?lesson=2', async ({ page }) => {
  await pinClock(page);
  await page.goto('./#/client/modules');
  const fire = page.getByTestId('module-item').filter({ hasText: 'Fire evacuation' });
  const href = await fire.getByRole('link', { name: 'Edit' }).getAttribute('href');
  await page.goto(`./${href ?? ''}?lesson=2`);
  const second = await page
    .getByTestId('builder-lesson')
    .nth(1)
    .getByRole('textbox', { name: 'Lesson title' })
    .inputValue();
  expect(second.length).toBeGreaterThan(0);
  await expect(page.getByRole('region', { name: 'Phone preview' }).getByRole('heading', { level: 2 })).toHaveText(
    second,
  );
});

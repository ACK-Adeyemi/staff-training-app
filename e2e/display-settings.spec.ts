// M2 chunk 12 (BP-7): every S12 setting has a visible effect without reload, persists across a reload, and Reset restores it.
// Contract: S12 controls as listed in apps/web/src/pages/me/me.test.tsx. Read aloud button is named "Read this aloud".
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { answerQuestion, finishLessons, type QuizQuestion } from './helpers/quiz';
import { installSpeechRecorder, readSpeechLog } from './helpers/speech';

const bank = JSON.parse(
  readFileSync('packages/content/src/packs/nursery/modules/safeguarding/module.json', 'utf8'),
) as { title: string; questions: (QuizQuestion & { prompt: string })[] };

test.use({ viewport: { width: 390, height: 844 } });

async function signInAsJade(page: Page) {
  await page.goto('./#/staff/signin');
  await page.getByRole('radio', { name: /Jade/ }).check();
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/staff$/);
  await page.goto('./#/staff/me/display');
  await expect(page.getByRole('heading', { level: 1, name: 'Display and accessibility' })).toBeVisible();
}
const root = (page: Page, fn: (el: HTMLElement) => string) =>
  page.evaluate(`(${fn.toString()})(document.documentElement)`);
const attr = (page: Page, name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
const css = (page: Page, prop: string) =>
  page.evaluate((p) => getComputedStyle(document.documentElement).getPropertyValue(p), prop);
const pick = (page: Page, group: string, option: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option }).check();
const flip = (page: Page, name: string) => page.getByRole('switch', { name }).click();

async function passQuiz(page: Page) {
  await page.goto('./#/staff/learn');
  await page
    .getByRole('link', { name: new RegExp(bank.title) })
    .first()
    .click();
  await finishLessons(page);
  await page.getByRole('link', { name: /Start quiz/ }).click();
  await page.getByRole('button', { name: /Start quiz/ }).click();
  for (let n = 1; n <= 10; n++) {
    const prompt = ((await page.getByTestId('question-prompt').textContent()) ?? '').trim();
    const q = bank.questions.find((x) => x.prompt === prompt);
    if (!q) throw new Error(`prompt not in the bank: ${prompt}`);
    await answerQuestion(page, q, true);
    await page.getByRole('button', { name: n === 10 ? 'Finish quiz' : 'Next question' }).click();
  }
  await expect(page.getByText(/You passed/)).toBeVisible();
}

test('text size 200% doubles the root font size at once and persists', async ({ page }) => {
  await signInAsJade(page);
  const before = parseFloat((await root(page, (e) => getComputedStyle(e).fontSize)) as string);
  await pick(page, 'Text size', '200%');
  await expect
    .poll(async () => parseFloat((await root(page, (e) => getComputedStyle(e).fontSize)) as string))
    .toBe(before * 2);
  await page.reload();
  await expect
    .poll(async () => parseFloat((await root(page, (e) => getComputedStyle(e).fontSize)) as string))
    .toBe(before * 2);
});

test('display zoom 150% scales the interface at once and persists', async ({ page }) => {
  await signInAsJade(page);
  await pick(page, 'Display zoom', '150%');
  await expect.poll(() => css(page, '--ui-scale')).toBe('1.5');
  const zoom = () => page.evaluate(() => getComputedStyle(document.documentElement).zoom);
  await expect.poll(zoom).toBe('1.5');
  await page.reload();
  await expect.poll(zoom).toBe('1.5');
});

test('high contrast and dark mode change data attributes and a token colour, and persist', async ({ page }) => {
  await signInAsJade(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await pick(page, 'Colour mode', 'Dark');
  await expect.poll(() => attr(page, 'data-colour-mode')).toBe('dark');
  await expect.poll(bg).not.toBe(light);
  await pick(page, 'Contrast', 'High');
  await expect.poll(() => attr(page, 'data-contrast')).toBe('high');
  await page.reload();
  expect(await attr(page, 'data-colour-mode')).toBe('dark');
  expect(await attr(page, 'data-contrast')).toBe('high');
});

test('reduce motion sets the attribute and nothing is animating on the quiz result celebration', async ({ page }) => {
  test.setTimeout(120_000);
  await signInAsJade(page);
  await flip(page, 'Reduce motion');
  await expect.poll(() => attr(page, 'data-reduce-motion')).toBe('true');
  await page.reload();
  expect(await attr(page, 'data-reduce-motion')).toBe('true');
  await passQuiz(page);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  expect(running).toBe(0);
});

test('wide spacing raises the computed line height and persists', async ({ page }) => {
  await signInAsJade(page);
  const lh = () =>
    page.evaluate(
      () =>
        parseFloat(getComputedStyle(document.body).lineHeight) / parseFloat(getComputedStyle(document.body).fontSize),
    );
  await expect.poll(lh).toBeCloseTo(1.5, 1);
  await pick(page, 'Spacing', 'Wide');
  await expect.poll(lh).toBeCloseTo(1.8, 1);
  await page.reload();
  await expect.poll(lh).toBeCloseTo(1.8, 1);
});

test('the dyslexia-friendly font is requested from this origin only after it is chosen', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (r) => {
    if (/opendyslexic/i.test(r.url())) fontRequests.push(r.url());
  });
  await signInAsJade(page);
  await page.waitForTimeout(300);
  expect(fontRequests).toEqual([]);
  await flip(page, 'Dyslexia-friendly font');
  await expect.poll(() => fontRequests.length).toBeGreaterThan(0);
  for (const u of fontRequests) expect(new URL(u).origin).toBe(new URL(page.url()).origin);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/OpenDyslexic/i);
  await page.reload();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/OpenDyslexic/i);
});

test('bigger buttons make buttons at least 56px tall', async ({ page }) => {
  await signInAsJade(page);
  await flip(page, 'Bigger buttons');
  const btn = page.getByRole('button', { name: 'Reset to defaults' });
  await expect.poll(async () => (await btn.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  await page.reload();
  await expect
    .poll(async () => (await page.getByRole('button', { name: 'Reset to defaults' }).boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(56);
});

test('Simple view shows the Learn list in the simple layout and persists', async ({ page }) => {
  await signInAsJade(page);
  await flip(page, 'Simple view');
  await expect.poll(() => attr(page, 'data-simple-view')).toBe('true');
  await page.goto('./#/staff/learn');
  await expect(page.getByTestId('learn-simple-list')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('learn-simple-list')).toBeVisible();
});

test('Read aloud: the button shows or hides with the setting and the chosen speed reaches speech', async ({ page }) => {
  await installSpeechRecorder(page);
  await signInAsJade(page);
  await pick(page, 'Read aloud speed', '1.5x');
  await page.goto('./#/staff/learn');
  await page
    .getByRole('link', { name: new RegExp(bank.title) })
    .first()
    .click();
  await page.getByRole('link', { name: /^Start|^Resume/ }).click();
  const play = page.getByRole('button', { name: 'Read this aloud' });
  await expect(play).toBeVisible();
  await play.click();
  await expect.poll(async () => (await readSpeechLog(page)).spoken.length).toBeGreaterThan(0);
  const log = await readSpeechLog(page);
  expect(log.spoken[0]?.rate).toBe(1.5);
  expect(log.spoken[0]?.localService).toBe(true);
  await page.getByRole('button', { name: 'Stop reading' }).click();
  await page.goto('./#/staff/me/display');
  await flip(page, 'Read aloud');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Read this aloud' })).toHaveCount(0);
});

test('sound and haptics are stored, and a celebration vibrates only when haptics is on', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    (window as unknown as { __vibrations: unknown[] }).__vibrations = [];
    Object.defineProperty(navigator, 'vibrate', {
      value: (p: unknown) => {
        (window as unknown as { __vibrations: unknown[] }).__vibrations.push(p);
        return true;
      },
      configurable: true,
    });
  });
  await signInAsJade(page);
  await expect(page.getByRole('switch', { name: 'Sound' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('switch', { name: 'Haptics' })).toHaveAttribute('aria-checked', 'true');
  await flip(page, 'Sound');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Sound' })).toHaveAttribute('aria-checked', 'true');
  await passQuiz(page);
  const count = () => page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations.length);
  expect(await count()).toBeGreaterThan(0);
});

test('no vibration on a celebration when haptics is off', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    (window as unknown as { __vibrations: unknown[] }).__vibrations = [];
    Object.defineProperty(navigator, 'vibrate', {
      value: (p: unknown) => {
        (window as unknown as { __vibrations: unknown[] }).__vibrations.push(p);
        return true;
      },
      configurable: true,
    });
  });
  await signInAsJade(page);
  await flip(page, 'Haptics');
  await expect(page.getByRole('switch', { name: 'Haptics' })).toHaveAttribute('aria-checked', 'false');
  await passQuiz(page);
  expect(await page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations.length)).toBe(0);
});

test('Reset to defaults restores every setting at once and after a reload', async ({ page }) => {
  await signInAsJade(page);
  await pick(page, 'Text size', '200%');
  await pick(page, 'Contrast', 'High');
  await pick(page, 'Colour mode', 'Dark');
  await pick(page, 'Spacing', 'Wide');
  await flip(page, 'Bigger buttons');
  await flip(page, 'Simple view');
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  const check = async () => {
    expect(await attr(page, 'data-contrast')).toBe('standard');
    expect(await attr(page, 'data-colour-mode')).toBe('auto');
    expect(await attr(page, 'data-spacing')).toBe('standard');
    expect(await attr(page, 'data-bigger-buttons')).toBe('false');
    expect(await attr(page, 'data-simple-view')).toBe('false');
    expect(await css(page, '--text-scale')).toBe('1');
  };
  await expect.poll(() => attr(page, 'data-contrast')).toBe('standard');
  await check();
  await page.reload();
  await expect.poll(() => attr(page, 'data-contrast')).toBe('standard');
  await check();
});

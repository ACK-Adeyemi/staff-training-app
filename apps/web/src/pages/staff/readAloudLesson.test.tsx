// M5 chunk 8 (F-6, BP-4): S5 read-aloud bar and paragraph highlight. Plan docs/plans/m5.md F-6 and assumption 16.
// Written before the implementation. Assumed (the implementer must match):
//   Language keys (en-GB.json and pl-PL.json), all in the existing `readAloud` group:
//     readAloud.previous "Previous paragraph", readAloud.next "Next paragraph", readAloud.pause "Pause",
//     readAloud.speed "Read aloud speed" (the select's accessible name), readAloud.play "Read this aloud" (existing).
//     Speed options are named "0.75x", "1x", "1.25x", "1.5x" and the select starts at prefs.readAloudRate.
//   Paragraphs of a text step: the output of parseMarkdown(block.markdown) from @sta/ui, flattened to one unit per
//     heading, per paragraph and per bullet item, each spoken as plainText(unit). Every rendered unit element (h2/h3,
//     p, li) carries data-read-aloud-paragraph="<index>". The one being read also has aria-current="true" and
//     data-reading="true"; data-reading is the hook for the non-colour marker (thick start border and bold).
//     The highlight shows only once reading has been started with Play (before that nothing is marked).
//   The bar replaces the single "Read this aloud" button on S5; there is exactly one "Read this aloud" button.
//   With prefs.readAloud off there is no bar, no marker and no data-read-aloud-paragraph is needed.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseMarkdown } from '@sta/ui';
import { actorFor, renderRoute } from '../../test/harness';
import { nurseryModules } from '@sta/content';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { stubSpeech } from '../../test/speechStub';
import { plainText } from '../../app/speech';

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
  vi.unstubAllGlobals();
});

const unitsOf = (markdown: string): string[] =>
  parseMarkdown(markdown).flatMap((b) => (b.kind === 'ul' ? b.items.map(plainText) : [plainText(b.text)]));
// The first nursery lesson whose first step is a text block with at least three paragraphs to read.
const found = nurseryModules
  .flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l })))
  .find(
    ({ lesson: l }) =>
      l.blocks[0]?.kind === 'text' && unitsOf((l.blocks[0] as { markdown: string }).markdown).length >= 3,
  );
const sgModule = found!.module;
const lesson = found!.lesson;
const first = lesson.blocks[0]!;
const units: string[] = first.kind === 'text' ? unitsOf(first.markdown) : [];
const path = `/staff/module/${sgModule.id}/lesson/${lesson.id}`;

type Prefs = { readAloud?: boolean; readAloudRate?: 0.75 | 1 | 1.25 | 1.5 };
type Ctx = { handle: StoreHandle; keys: SeedKeys };
const withPrefs = (prefs: Prefs) => async (ctx: Ctx) => {
  await ctx.handle.store.me.updatePrefs(actorFor('staff', ctx.keys), prefs);
};
const marked = () => [...document.querySelectorAll('[aria-current="true"]')];
const unitEl = (i: number) => document.querySelector(`[data-read-aloud-paragraph="${i}"]`);

describe('S5 read-aloud bar', () => {
  it('the lesson used here has several paragraphs to read (fixture check)', () => {
    expect(found).toBeTruthy();
    expect(first.kind).toBe('text');
    expect(units.length).toBeGreaterThanOrEqual(3);
  });

  it('shows Previous paragraph, Read this aloud, Next paragraph and a speed control starting at the saved speed', async () => {
    stubSpeech();
    await renderRoute(path, 'staff', { prepare: withPrefs({ readAloud: true, readAloudRate: 1.25 }) });
    expect(await screen.findByRole('button', { name: 'Previous paragraph' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Read this aloud' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Next paragraph' })).toBeTruthy();
    const speed = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Read aloud speed' });
    expect(speed.value).toBe('1.25');
  });

  it('does not show the lesson text twice: each paragraph is rendered once, marked for the bar', async () => {
    stubSpeech();
    await renderRoute(path, 'staff', { prepare: withPrefs({ readAloud: true }) });
    await screen.findByRole('button', { name: 'Next paragraph' });
    expect(document.querySelectorAll('[data-read-aloud-paragraph]')).toHaveLength(units.length);
    units.forEach((u, i) => {
      expect(unitEl(i)?.textContent).toBe(u);
    });
  });

  it('Play speaks the first paragraph at the saved speed and marks it with aria-current and data-reading', async () => {
    const user = userEvent.setup();
    const { spoken } = stubSpeech();
    await renderRoute(path, 'staff', { prepare: withPrefs({ readAloud: true, readAloudRate: 1.5 }) });
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.text).toBe(units[0]);
    expect(spoken[0]!.rate).toBe(1.5);
    expect(marked()).toHaveLength(1);
    expect(unitEl(0)?.getAttribute('aria-current')).toBe('true');
    expect(unitEl(0)?.getAttribute('data-reading')).toBe('true');
    expect(unitEl(1)?.hasAttribute('data-reading')).toBe(false);
  });

  it('the highlight follows the spoken paragraph: auto-advance, then Next paragraph, then Previous paragraph', async () => {
    const user = userEvent.setup();
    const { spoken } = stubSpeech();
    await renderRoute(path, 'staff', { prepare: withPrefs({ readAloud: true }) });
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    spoken[0]!.end();
    await waitFor(() => {
      expect(unitEl(1)?.getAttribute('aria-current')).toBe('true');
    });
    expect(spoken.at(-1)!.text).toBe(units[1]);
    expect(marked()).toHaveLength(1);
    expect(unitEl(0)?.hasAttribute('aria-current')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Next paragraph' }));
    expect(unitEl(2)?.getAttribute('aria-current')).toBe('true');
    expect(spoken.at(-1)!.text).toBe(units[2]);

    await user.click(screen.getByRole('button', { name: 'Previous paragraph' }));
    expect(unitEl(1)?.getAttribute('data-reading')).toBe('true');
    expect(marked()).toHaveLength(1);
  });

  it('Pause stops speech; Play again restarts at the start of the current paragraph', async () => {
    const user = userEvent.setup();
    const { spoken, state } = stubSpeech();
    await renderRoute(path, 'staff', { prepare: withPrefs({ readAloud: true }) });
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    await user.click(screen.getByRole('button', { name: 'Next paragraph' }));
    const before = state.cancels;
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(state.cancels).toBeGreaterThan(before);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    const count = spoken.length;
    await user.click(screen.getByRole('button', { name: 'Read this aloud' }));
    expect(spoken).toHaveLength(count + 1);
    expect(spoken.at(-1)!.text).toBe(units[1]);
    expect(unitEl(1)?.getAttribute('aria-current')).toBe('true');
  });

  it('changing the speed while reading restarts the current paragraph at the new speed', async () => {
    const user = userEvent.setup();
    const { spoken } = stubSpeech();
    await renderRoute(path, 'staff', { prepare: withPrefs({ readAloud: true }) });
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Read aloud speed' }), '1.5x');
    expect(spoken.at(-1)!.text).toBe(units[0]);
    expect(spoken.at(-1)!.rate).toBe(1.5);
  });

  it('disables Previous paragraph on the first paragraph', async () => {
    stubSpeech();
    await renderRoute(path, 'staff', { prepare: withPrefs({ readAloud: true }) });
    const prev = await screen.findByRole<HTMLButtonElement>('button', { name: 'Previous paragraph' });
    expect(prev.disabled).toBe(true);
  });

  it('shows no bar, no highlight and speaks nothing when Read aloud is off', async () => {
    const { spoken } = stubSpeech();
    await renderRoute(path, 'staff', { prepare: withPrefs({ readAloud: false }) });
    await screen.findByText(/^Step 1 of/);
    expect(screen.queryByRole('button', { name: 'Previous paragraph' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read this aloud' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next paragraph' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Read aloud speed' })).toBeNull();
    expect(marked()).toHaveLength(0);
    expect(spoken).toHaveLength(0);
  });

  it('never speaks a learner note on the lesson page', async () => {
    const user = userEvent.setup();
    const { spoken } = stubSpeech();
    await renderRoute(path, 'staff', {
      prepare: async (ctx) => {
        await withPrefs({ readAloud: true })(ctx);
        await ctx.handle.store.notes.save(actorFor('staff', ctx.keys), {
          moduleId: sgModule.id,
          lessonId: lesson.id,
          body: 'My private memory aid ZX81',
        });
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    await user.click(screen.getByRole('button', { name: 'Next paragraph' }));
    expect(spoken.length).toBeGreaterThan(0);
    for (const s of spoken) expect(s.text).not.toContain('ZX81');
    const bar = within(document.body);
    expect(bar.queryByText(/ZX81/)).toBeNull();
  });
});

// M5 chunk 8 (F-6, BP-4): S6 read-aloud gains Pause, and only the question and its options are ever spoken.
// Written before the implementation. Assumed (the implementer must match):
//   While a question is being read, the single-question control shows a "Pause" button (key readAloud.pause) next to
//   "Stop reading". Pause stops speech and the "Read this aloud" button comes back; pressing it again restarts the
//   same question from its start (plan assumption 16). S6 has no previous/next paragraph bar.
//   Speech text is the question prompt (and scenario step text) plus every option, never any note, open or closed.
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, TODAY } from '../../test/harness';
import { completeAllLessons, currentQuestion, sgModule } from '../../test/quizHelpers';
import { stubSpeech } from '../../test/speechStub';

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

const quizPath = `/staff/module/${sgModule.id}/quiz`;
const SECRET = 'My private memory aid ZX81';
type Ctx = { handle: StoreHandle; keys: SeedKeys };

const prepareOpen = async (ctx: Ctx) => {
  const actor = actorFor('staff', ctx.keys);
  await completeAllLessons(ctx.handle, actor);
  await ctx.handle.store.notes.save(actor, { moduleId: sgModule.id, body: SECRET });
  await ctx.handle.store.me.updatePrefs(actor, { readAloud: true });
};
const prepareClosed = async (ctx: Ctx) => {
  await prepareOpen(ctx);
  const comps = ((await ctx.handle.admin.dumpAll()) as Record<string, Record<string, unknown>[]>)['competitions']!;
  const cb = comps.find((c) => c['name'] === 'Closed-Book Challenge');
  if (!cb) throw new Error('seed has no Closed-Book Challenge');
  const start = new Date(new Date(TODAY).getTime() - 86_400_000).toISOString();
  await ctx.handle.admin.bulkPut('competitions', [{ ...cb, startAt: start }]);
};
const startOpen = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Start quiz' }));
  await screen.findByTestId('question-prompt');
};
const startClosed = async (user: ReturnType<typeof userEvent.setup>) => {
  const group = await screen.findByRole('radiogroup', { name: 'How do you want to take this quiz?' });
  await user.click(within(group).getByRole('radio', { name: /^Closed-book/ }));
  await user.click(screen.getByRole('button', { name: 'Start quiz' }));
  await screen.findByTestId('question-prompt');
};

describe('S6 read-aloud Pause', () => {
  it('shows Pause while the question is being read; Pause stops speech and offers Read this aloud again', async () => {
    const user = userEvent.setup();
    const { spoken, state } = stubSpeech();
    await renderRoute(quizPath, 'staff', { prepare: prepareOpen });
    await startOpen(user);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    expect(spoken).toHaveLength(1);
    const cancelsBefore = state.cancels;
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(state.cancels).toBeGreaterThan(cancelsBefore);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Read this aloud' })).toBeTruthy();
  });

  it('reading again after Pause starts the same question from its start', async () => {
    const user = userEvent.setup();
    const { spoken } = stubSpeech();
    await renderRoute(quizPath, 'staff', { prepare: prepareOpen });
    await startOpen(user);
    const q = currentQuestion();
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Read this aloud' }));
    expect(spoken).toHaveLength(2);
    expect(spoken[1]!.text).toBe(spoken[0]!.text);
    expect(spoken[1]!.text.startsWith(q.prompt)).toBe(true);
  });

  it('shows no Pause or Read this aloud when Read aloud is off', async () => {
    const user = userEvent.setup();
    stubSpeech();
    await renderRoute(quizPath, 'staff', {
      prepare: async (ctx) => {
        await prepareOpen(ctx);
        await ctx.handle.store.me.updatePrefs(actorFor('staff', ctx.keys), { readAloud: false });
      },
    });
    await startOpen(user);
    expect(screen.queryByRole('button', { name: 'Read this aloud' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });
});

describe('S6 read-aloud never speaks notes', () => {
  it('closed-book: only the prompt and the options are spoken, across Pause and a second read, and no notes panel exists', async () => {
    const user = userEvent.setup();
    const { spoken } = stubSpeech();
    await renderRoute(quizPath, 'staff', { prepare: prepareClosed });
    await startClosed(user);
    const q = currentQuestion();
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Read this aloud' }));
    expect(spoken.length).toBeGreaterThanOrEqual(2);
    const allowed = [q.prompt, ...(q.options ?? []).map((o) => o.text)];
    for (const s of spoken) {
      expect(s.text).not.toContain(SECRET);
      expect(s.text).toContain(q.prompt);
      for (const o of q.options ?? []) expect(s.text).toContain(o.text);
      // Nothing beyond the prompt, the options and the ". " joins between them.
      let rest = s.text;
      for (const piece of allowed) rest = rest.replace(piece, '');
      expect(rest.replace(/[.\s]/g, '')).toBe('');
    }
    expect(screen.getByTestId('notes-locked')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: /^Notes for/ })).toBeNull();
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('open-book: with the notes panel open, reading still speaks only the prompt and options', async () => {
    const user = userEvent.setup();
    const { spoken } = stubSpeech();
    await renderRoute(quizPath, 'staff', { prepare: prepareOpen });
    await startOpen(user);
    await user.click(screen.getByRole('button', { name: 'Notes hidden: bonus XP' }));
    const panel = await screen.findByRole('dialog', { name: `Notes for ${sgModule.title}` });
    await within(panel).findByText(SECRET);
    await user.keyboard('{Escape}');
    const q = currentQuestion();
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.text).toContain(q.prompt);
    expect(spoken[0]!.text).not.toContain(SECRET);
    expect(spoken[0]!.text).not.toContain(sgModule.title);
  });
});

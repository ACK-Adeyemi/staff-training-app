// M2 chunk 14 (BP-4, BP-5, F-7): S6 notes control, closed-book choice, locked mode, Leave this attempt, read-aloud.
// Contract the implementer must provide (English strings come from language files):
//   S6 intro (before "Start quiz" starts the attempt):
//     - when a live closed-book-only competition the person is eligible for covers the module: a radiogroup named
//       "How do you want to take this quiz?" with radios "Closed-book" and "Open-book" (each name starts with that word),
//       text naming the competition ("Closed-Book Challenge"), and "Start quiz" disabled until one is chosen. The choice
//       is stored on the attempt (`mode`). With no such competition there is no radiogroup and the attempt is open.
//   S6 question view, open attempt: a button named "Notes hidden: bonus XP" (notes hidden is the default). Pressing it
//     opens the dialog "Notes for <module title>" and the button's name becomes "Notes shown: standard XP" while the
//     panel is open. questionAnswered events store notesVisible true when the panel was open at any time while that
//     question was on screen, else false; a new question starts hidden again.
//   S6 question view, closed attempt: no Notes button; instead an element data-testid="notes-locked" whose text
//     contains "locked". No notes dialog can be opened. Feedback has no Learn more links (the explanation and source
//     still show). The Results page ("Review what you missed") shows every Learn more link of missed questions and
//     opening one records a learnMoreOpened event with the attemptId.
//   S6 both modes: a button "Leave this attempt" opens a confirm dialog "Leave this attempt?" with "Yes, leave" and
//     "Stay". Yes, leave calls learning.abandonAttempt and navigates to the module overview (#/staff/module/:id).
//   Read aloud (preference on): a button "Read this aloud" on each question speaks the prompt and every option text
//     (and never any note text), in open and closed attempts.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute, TODAY } from '../../test/harness';
import { answerCurrent, completeAllLessons, currentQuestion, feedbackRegion, sgModule } from '../../test/quizHelpers';

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
type Dump = Record<string, Record<string, unknown>[]>;
const dump = async (h: StoreHandle) => (await h.admin.dumpAll()) as Dump;
const SECRET = 'My private memory aid ZX81';

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const lessonsDone = async ({ handle, keys }: Ctx) => {
  await completeAllLessons(handle, actorFor('staff', keys));
};
const withNote = async (ctx: Ctx) => {
  await lessonsDone(ctx);
  await ctx.handle.store.notes.save(actorFor('staff', ctx.keys), { moduleId: sgModule.id, body: SECRET });
};
/** Moves the seeded Closed-Book Challenge (scheduled for 5 days ahead) so that it is live today. */
const closedBookLive = async (ctx: Ctx) => {
  await withNote(ctx);
  const comps = (await dump(ctx.handle)).competitions!;
  const cb = comps.find((c) => c['name'] === 'Closed-Book Challenge');
  if (!cb) throw new Error('seed has no Closed-Book Challenge');
  const start = new Date(new Date(TODAY).getTime() - 86_400_000).toISOString();
  await ctx.handle.admin.bulkPut('competitions', [{ ...cb, startAt: start }]);
};
const jadeAttempts = async (h: StoreHandle, _keys?: SeedKeys) => {
  const d = await dump(h);
  const jade = d.people!.find((p) => p['firstName'] === 'Jade')!['id'];
  return d.attempts!.filter((a) => a['moduleId'] === sgModule.id && a['personId'] === jade);
};
async function startOpen(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Start quiz' }));
  await screen.findByTestId('question-prompt');
}
async function startClosed(user: ReturnType<typeof userEvent.setup>) {
  const group = await screen.findByRole('radiogroup', { name: 'How do you want to take this quiz?' });
  await user.click(within(group).getByRole('radio', { name: /^Closed-book/ }));
  await user.click(screen.getByRole('button', { name: 'Start quiz' }));
  await screen.findByTestId('question-prompt');
}
const nextOrFinish = async (user: ReturnType<typeof userEvent.setup>) => {
  const finish = screen.queryByRole('button', { name: 'Finish quiz' });
  await user.click(finish ?? (await screen.findByRole('button', { name: 'Next question' })));
};

describe('S6 notes control in an open-book attempt', () => {
  it('defaults to "Notes hidden: bonus XP" and shows the course notes panel when pressed', async () => {
    const user = userEvent.setup();
    await renderRoute(quizPath, 'staff', { prepare: withNote });
    await startOpen(user);
    const control = screen.getByRole('button', { name: 'Notes hidden: bonus XP' });
    await user.click(control);
    const panel = await screen.findByRole('dialog', { name: `Notes for ${sgModule.title}` });
    expect(await within(panel).findByText(SECRET)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notes shown: standard XP' })).toBeTruthy();
  });

  it('records notesVisible per question: true only for the question where notes were opened', async () => {
    const user = userEvent.setup();
    const { handle } = await renderRoute(quizPath, 'staff', { prepare: withNote });
    // The seed already holds answers to these questions from earlier attempts; only this attempt's events count.
    const earlier = new Set((await dump(handle)).learningEvents!.map((e) => e['id']));
    await startOpen(user);
    await user.click(screen.getByRole('button', { name: 'Notes hidden: bonus XP' }));
    const panel = await screen.findByRole('dialog', { name: `Notes for ${sgModule.title}` });
    await within(panel).findByText(SECRET);
    await user.keyboard('{Escape}');
    const first = await answerCurrent(user, true);
    feedbackRegion();
    await nextOrFinish(user);
    await screen.findByText(/^Question 2 of/);
    expect(screen.getByRole('button', { name: 'Notes hidden: bonus XP' })).toBeTruthy();
    const second = await answerCurrent(user, true);
    await waitFor(async () => {
      const again = (await dump(handle)).learningEvents!.filter(
        (e) => e['type'] === 'questionAnswered' && e['moduleId'] === sgModule.id && !earlier.has(e['id']),
      );
      expect(again.find((e) => e['questionId'] === first.id)?.['notesVisible']).toBe(true);
      expect(again.find((e) => e['questionId'] === second.id)?.['notesVisible']).toBe(false);
    });
  });

  it('shows Learn more links in feedback for a wrong answer, as before', async () => {
    const user = userEvent.setup();
    await renderRoute(quizPath, 'staff', { prepare: lessonsDone });
    await startOpen(user);
    let q = await answerCurrent(user, false);
    while (q.learnMore.length === 0 && q.type !== 'scenario') {
      await nextOrFinish(user);
      await screen.findByTestId('question-prompt');
      q = await answerCurrent(user, false);
    }
    expect(within(feedbackRegion()).getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('does not offer the open/closed choice when no closed-book competition is live', async () => {
    await renderRoute(quizPath, 'staff', { prepare: lessonsDone });
    await screen.findByRole('button', { name: 'Start quiz' });
    expect(screen.queryByRole('radiogroup', { name: 'How do you want to take this quiz?' })).toBeNull();
  });
});

describe('S6 closed-book choice and locked mode', () => {
  it('offers Closed-book or Open-book, names the competition, and will not start until one is chosen', async () => {
    await renderRoute(quizPath, 'staff', { prepare: closedBookLive });
    const group = await screen.findByRole('radiogroup', { name: 'How do you want to take this quiz?' });
    expect(within(group).getByRole('radio', { name: /^Closed-book/ })).toBeTruthy();
    expect(within(group).getByRole('radio', { name: /^Open-book/ })).toBeTruthy();
    expect(document.body.textContent).toContain('Closed-Book Challenge');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Start quiz' }).disabled).toBe(true);
  });

  it('choosing Open-book stores an open attempt with the notes control available', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(quizPath, 'staff', { prepare: closedBookLive });
    const group = await screen.findByRole('radiogroup', { name: 'How do you want to take this quiz?' });
    await user.click(within(group).getByRole('radio', { name: /^Open-book/ }));
    await user.click(screen.getByRole('button', { name: 'Start quiz' }));
    await screen.findByRole('button', { name: 'Notes hidden: bonus XP' });
    expect((await jadeAttempts(handle, keys)).map((a) => a['mode'])).toEqual(['open']);
  });

  it('choosing Closed-book stores a closed attempt and replaces the notes control with a locked indicator', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(quizPath, 'staff', { prepare: closedBookLive });
    await startClosed(user);
    expect((await jadeAttempts(handle, keys)).map((a) => a['mode'])).toEqual(['closed']);
    expect(screen.getByTestId('notes-locked').textContent).toMatch(/locked/i);
    expect(screen.queryByRole('button', { name: /^Notes (hidden|shown)/ })).toBeNull();
    expect(screen.queryByRole('dialog', { name: `Notes for ${sgModule.title}` })).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
    // The data layer agrees: the learner cannot list notes while the attempt is open.
    await expect(handle.store.notes.list(actorFor('staff', keys), { moduleId: sgModule.id })).rejects.toMatchObject({
      rule: 'notesLocked',
    });
  });

  it('shows no Learn more links in feedback during a closed attempt but still explains the answer', async () => {
    const user = userEvent.setup();
    await renderRoute(quizPath, 'staff', { prepare: closedBookLive });
    await startClosed(user);
    const q = await answerCurrent(user, false);
    const fb = feedbackRegion();
    expect(within(fb).getByText(q.explanation)).toBeTruthy();
    expect(within(fb).queryAllByRole('link')).toHaveLength(0);
    expect(within(fb).queryByText(/Learn more/)).toBeNull();
  });

  it('records closed answers with notesVisible false and attemptMode closed', async () => {
    const user = userEvent.setup();
    const { handle } = await renderRoute(quizPath, 'staff', { prepare: closedBookLive });
    await startClosed(user);
    const q = await answerCurrent(user, true);
    await waitFor(async () => {
      const e = (await dump(handle)).learningEvents!.find(
        (x) => x['type'] === 'questionAnswered' && x['questionId'] === q.id && x['moduleId'] === sgModule.id,
      );
      expect(e).toMatchObject({ notesVisible: false, attemptMode: 'closed' });
    });
  });

  it('after finishing, the results list the links of every missed question, opening one records learnMoreOpened, and notes unlock', async () => {
    const user = userEvent.setup();
    const stop = (e: Event) => {
      if ((e.target as HTMLElement).closest('a')) e.preventDefault();
    };
    document.addEventListener('click', stop);
    const { handle, keys, router } = await renderRoute(quizPath, 'staff', { prepare: closedBookLive });
    await startClosed(user);
    const total = Number(/of (\d+)/.exec(screen.getByText(/^Question 1 of/).textContent)?.[1]);
    for (let n = 1; n <= total; n++) {
      await screen.findByText(new RegExp(`^Question ${n} of`));
      await answerCurrent(user, n !== 1);
      feedbackRegion();
      await nextOrFinish(user);
    }
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/staff/module/${sgModule.id}/done`);
    });
    await screen.findByRole('heading', { name: 'Review what you missed' });
    const links = screen.getAllByRole('link', { name: /^Learn more:/ });
    expect(links.length).toBeGreaterThan(0);
    const earlierOpens = (await dump(handle)).learningEvents!.filter((e) => e['type'] === 'learnMoreOpened');
    const before = earlierOpens.length;
    const earlierIds = new Set(earlierOpens.map((e) => e['id']));
    await user.click(links[0]!);
    await waitFor(async () => {
      const opened = (await dump(handle)).learningEvents!.filter((e) => e['type'] === 'learnMoreOpened');
      expect(opened.length).toBe(before + 1);
      const added = opened.filter((e) => !earlierIds.has(e['id']));
      expect(added[0]).toMatchObject({ moduleId: sgModule.id });
      expect(added[0]!['attemptId']).toBeTruthy();
    });
    expect((await handle.store.notes.list(actorFor('staff', keys), { moduleId: sgModule.id })).length).toBe(1);
    document.removeEventListener('click', stop);
  });
});

describe('S6 Leave this attempt', () => {
  it('asks first: Stay keeps the attempt going', async () => {
    const user = userEvent.setup();
    const { handle, keys } = await renderRoute(quizPath, 'staff', { prepare: lessonsDone });
    await startOpen(user);
    await user.click(screen.getByRole('button', { name: 'Leave this attempt' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave this attempt?' });
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.getByTestId('question-prompt')).toBeTruthy();
    expect((await jadeAttempts(handle, keys))[0]).not.toHaveProperty('abandoned', true);
  });

  it('Yes, leave abandons a closed attempt, returns to the module overview and unlocks notes', async () => {
    const user = userEvent.setup();
    const { handle, keys, router } = await renderRoute(quizPath, 'staff', { prepare: closedBookLive });
    await startClosed(user);
    await user.click(screen.getByRole('button', { name: 'Leave this attempt' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave this attempt?' });
    await user.click(within(dialog).getByRole('button', { name: 'Yes, leave' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/staff/module/${sgModule.id}`);
    });
    const attempts = await jadeAttempts(handle, keys);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ abandoned: true });
    expect(attempts[0]!['score']).toBeUndefined();
    const notes = await handle.store.notes.list(actorFor('staff', keys), { moduleId: sgModule.id });
    expect(notes.map((n) => n.body)).toContain(SECRET);
  });

  it('is also available in an open attempt', async () => {
    const user = userEvent.setup();
    const { handle, keys, router } = await renderRoute(quizPath, 'staff', { prepare: lessonsDone });
    await startOpen(user);
    await user.click(screen.getByRole('button', { name: 'Leave this attempt' }));
    await user.click(await screen.findByRole('button', { name: 'Yes, leave' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/staff/module/${sgModule.id}`);
    });
    expect((await jadeAttempts(handle, keys))[0]).toMatchObject({ abandoned: true });
  });
});

describe('S6 read aloud', () => {
  function stubSpeech() {
    const spoken: string[] = [];
    const voice = { name: 'Test', lang: 'en-GB', localService: true };
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [voice],
      speak: (u: { text: string }) => spoken.push(u.text),
      cancel: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        rate = 1;
        lang = '';
        voice: unknown = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    return spoken;
  }
  const readAloudOn = async (ctx: Ctx) => {
    await withNote(ctx);
    await ctx.handle.store.me.updatePrefs(actorFor('staff', ctx.keys), { readAloud: true });
  };

  it('reads the question and every answer option aloud, and never the learner notes', async () => {
    const user = userEvent.setup();
    const spoken = stubSpeech();
    await renderRoute(quizPath, 'staff', { prepare: readAloudOn });
    await startOpen(user);
    const q = currentQuestion();
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain(q.prompt);
    for (const o of q.options ?? []) expect(spoken[0]).toContain(o.text);
    expect(spoken[0]).not.toContain(SECRET);
  });

  it('does the same in a closed attempt', async () => {
    const user = userEvent.setup();
    const spoken = stubSpeech();
    await renderRoute(quizPath, 'staff', {
      prepare: async (ctx) => {
        await closedBookLive(ctx);
        await ctx.handle.store.me.updatePrefs(actorFor('staff', ctx.keys), { readAloud: true });
      },
    });
    await startClosed(user);
    const q = currentQuestion();
    await user.click(await screen.findByRole('button', { name: 'Read this aloud' }));
    expect(spoken[0]).toContain(q.prompt);
    expect(spoken[0]).not.toContain(SECRET);
  });

  it('shows no Read this aloud button on a question when Read aloud is off', async () => {
    const user = userEvent.setup();
    stubSpeech();
    await renderRoute(quizPath, 'staff', {
      prepare: async (ctx) => {
        await lessonsDone(ctx);
        await ctx.handle.store.me.updatePrefs(actorFor('staff', ctx.keys), { readAloud: false });
      },
    });
    await startOpen(user);
    expect(screen.queryByRole('button', { name: 'Read this aloud' })).toBeNull();
  });
});

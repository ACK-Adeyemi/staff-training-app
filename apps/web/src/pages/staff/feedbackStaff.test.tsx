// M3 chunk 16 (BP-14, F-4): staff module feedback. S5 lesson thumbs, S6 Report a problem with this question, S7 the
// end-of-module feedback card, and the reply notification in S13. Written before the implementation. New text goes in
// language files (feedback.* keys hold these English strings already).
//
// UI CONTRACT (data layer = store.moduleFeedback.submit; Jade is the staff persona):
//   S5 /staff/module/:id/lesson/:lessonId. On the LAST step of a lesson, above the "Finish lesson" button, a group
//     (role=group) named "Was this lesson helpful?" with two buttons "Yes, it was helpful" and "No, it was not helpful"
//     (aria-pressed once chosen; 44px targets). Pressing one calls moduleFeedback.submit({ kind: 'lessonThumb',
//     moduleId, lessonId, thumb, tags: [], anonymous: false }) and shows role=status "Thanks for letting us know.".
//     Pressing again changes nothing stored beyond the first press (one item per visit). Finish lesson still works.
//     The group is not shown on earlier steps.
//   S6 /staff/module/:id/quiz while a question is on screen: a button "Report a problem with this question" opens a
//     dialog named "Report a problem with this question" holding a toggle button "Mistake in a question"
//     (aria-pressed, starts pressed because it is the only tag), a textbox "What is wrong?" (optional) and buttons
//     "Send report" and "Cancel". Send report calls submit({ kind: 'questionReport', moduleId, questionId (the question
//     on screen), tags: ['mistakeInQuestion'], text, anonymous: false }); the dialog closes and role=status "Thank you.
//     This will be looked at." shows. The quiz carries on (the question is still on screen and unanswered).
//   S7 /staff/module/:id/done. A region (section) named "How was this training?" with: radiogroup "Your rating"
//     (RatingInput, radios named by their number: 1 to 5); TagPicker group "What stood out?" (toggle buttons with the
//     tag labels from feedback.tags.*); textbox "Anything to add? (optional)" (max 500, plain text); checkbox
//     "Send without my name" with the note "In a small team, people may still guess who sent it." beside it;
//     button "Send feedback" (disabled until a rating is chosen). Sending calls submit({ kind: 'moduleCard',
//     rating, tags, text, anonymous }) and replaces the form with role=status "Thank you for your feedback.".
//     The card is shown after a pass and after a fail. Nothing about payment appears.
//   S13 /staff/notifications: a feedbackReply notification reads "Your manager replied to your feedback on <module
//     title>." (staff.notifications.feedbackReply), never the generic "You have a new message.".
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';
import { answerCurrent, completeAllLessons, currentQuestion, finishViaStore, sgModule } from '../../test/quizHelpers';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; close?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});
afterEach(cleanup);

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const base = `/staff/module/${sgModule.id}`;
const allFor = async ({ handle, keys }: Ctx) =>
  handle.store.moduleFeedback.list(actorFor('client', keys), { moduleId: sgModule.id });

/** Walks a lesson to its last step (ticking any acknowledge box on the way). */
async function toLastStep(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 30; i++) {
    const ack = screen.queryByRole('checkbox');
    if (ack && !(ack as HTMLInputElement).checked) await user.click(ack);
    if (screen.queryByRole('button', { name: 'Finish lesson' })) return;
    await user.click(await screen.findByRole('button', { name: 'Next' }));
  }
  throw new Error('no last step');
}

describe('S5 lesson thumbs', () => {
  it('shows the thumbs only on the last step', async () => {
    await renderRoute(`${base}/lesson/lesson-1`, 'staff');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('group', { name: 'Was this lesson helpful?' })).toBeNull();
    await toLastStep(userEvent.setup());
    const g = screen.getByRole('group', { name: 'Was this lesson helpful?' });
    expect(within(g).getByRole('button', { name: 'Yes, it was helpful' })).toBeTruthy();
    expect(within(g).getByRole('button', { name: 'No, it was not helpful' })).toBeTruthy();
  });

  it('stores a named thumbs down for the lesson and thanks the learner', async () => {
    let ctx!: Ctx;
    await renderRoute(`${base}/lesson/lesson-1`, 'staff', {
      prepare: (c) => {
        ctx = c;
        return Promise.resolve();
      },
    });
    const before = (await allFor(ctx)).length;
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 1 });
    await toLastStep(user);
    await user.click(screen.getByRole('button', { name: 'No, it was not helpful' }));
    expect((await screen.findByRole('status')).textContent).toContain('Thanks for letting us know.');
    const after = await allFor(ctx);
    expect(after).toHaveLength(before + 1);
    const added = need(after.find((f) => f.kind === 'lessonThumb' && f.createdAt >= '2026-10-19'));
    expect(added.thumb).toBe('down');
    expect(added.lessonId).toBe('lesson-1');
    expect(added.anonymous).toBe(false);
    expect(added.personId).toBe(ctx.keys.personas['jade']);
    // Finishing the lesson still works.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Finish lesson' }).disabled).toBe(false);
  });
});

describe('S6 Report a problem with this question', () => {
  it('stores a question report for the question on screen with the Mistake tag and leaves the quiz running', async () => {
    let ctx!: Ctx;
    await renderRoute(`${base}/quiz`, 'staff', {
      prepare: async (c) => {
        ctx = c;
        await completeAllLessons(c.handle, actorFor('staff', c.keys));
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Start quiz' }));
    await screen.findByTestId('question-prompt');
    const q = currentQuestion();
    await user.click(screen.getByRole('button', { name: 'Report a problem with this question' }));
    const dialog = await screen.findByRole('dialog', { name: 'Report a problem with this question' });
    expect(within(dialog).getByRole('button', { name: 'Mistake in a question' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'What is wrong?' }),
      'The second option is also right.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect((await screen.findByRole('status')).textContent).toContain('Thank you. This will be looked at.');
    const report = need(
      (await allFor(ctx)).find(
        (f) => f.kind === 'questionReport' && f.questionId === q.id && f.text === 'The second option is also right.',
      ),
    );
    expect(report.tags).toEqual(['mistakeInQuestion']);
    expect(report.anonymous).toBe(false);
    expect(report.personId).toBe(ctx.keys.personas['jade']);
    expect(currentQuestion().id).toBe(q.id);
    await answerCurrent(user, true);
  });

  it('closes without storing anything on Cancel', async () => {
    let ctx!: Ctx;
    await renderRoute(`${base}/quiz`, 'staff', {
      prepare: async (c) => {
        ctx = c;
        await completeAllLessons(c.handle, actorFor('staff', c.keys));
      },
    });
    const before = (await allFor(ctx)).length;
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Start quiz' }));
    await screen.findByTestId('question-prompt');
    await user.click(screen.getByRole('button', { name: 'Report a problem with this question' }));
    const dialog = await screen.findByRole('dialog', { name: 'Report a problem with this question' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await allFor(ctx)).toHaveLength(before);
  });
});

describe('S7 module feedback card', () => {
  const passAll = async (c: Ctx) => {
    const actor = actorFor('staff', c.keys);
    await completeAllLessons(c.handle, actor);
    await finishViaStore(c.handle, actor, 0);
  };

  it('keeps Send feedback disabled until a rating is chosen, then stores a named card', async () => {
    let ctx!: Ctx;
    await renderRoute(`${base}/done`, 'staff', {
      prepare: async (c) => {
        ctx = c;
        await passAll(c);
      },
    });
    const card = await screen.findByRole('region', { name: 'How was this training?' });
    const send = within(card).getByRole('button', { name: 'Send feedback' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    const user = userEvent.setup();
    const before = (await allFor(ctx)).length;
    await user.click(within(card).getByRole('radio', { name: /4/ }));
    await user.click(within(card).getByRole('button', { name: 'Clear' }));
    await user.type(within(card).getByRole('textbox', { name: 'Anything to add? (optional)' }), 'Easy to follow.');
    expect((send as HTMLButtonElement).disabled).toBe(false);
    await user.click(send);
    expect((await screen.findByRole('status')).textContent).toContain('Thank you for your feedback.');
    const after = await allFor(ctx);
    expect(after).toHaveLength(before + 1);
    const added = need(after.find((f) => f.text === 'Easy to follow.'));
    expect(added).toMatchObject({ kind: 'moduleCard', rating: 4, tags: ['clear'], anonymous: false });
    expect(added.personId).toBe(ctx.keys.personas['jade']);
    expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull();
  });

  it('notes that a small team may still guess who sent it, and stores nothing identifying when sent without a name', async () => {
    let ctx!: Ctx;
    await renderRoute(`${base}/done`, 'staff', {
      prepare: async (c) => {
        ctx = c;
        await passAll(c);
      },
    });
    const card = await screen.findByRole('region', { name: 'How was this training?' });
    expect(within(card).getByText('In a small team, people may still guess who sent it.')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(card).getByRole('radio', { name: /2/ }));
    await user.click(within(card).getByRole('button', { name: 'Too long' }));
    await user.type(
      within(card).getByRole('textbox', { name: 'Anything to add? (optional)' }),
      'Lesson three dragged on.',
    );
    await user.click(within(card).getByRole('checkbox', { name: 'Send without my name' }));
    await user.click(within(card).getByRole('button', { name: 'Send feedback' }));
    await screen.findByText('Thank you for your feedback.');
    const raw = ((await ctx.handle.admin.dumpAll()) as unknown as { moduleFeedback: Record<string, unknown>[] })
      .moduleFeedback;
    const stored = need(raw.find((f) => f['text'] === 'Lesson three dragged on.'));
    expect(stored['anonymous']).toBe(true);
    expect(stored).not.toHaveProperty('personId');
    expect(stored).not.toHaveProperty('userId');
    expect(JSON.stringify(stored)).not.toContain(need(ctx.keys.users['jade']));
    expect(JSON.stringify(stored)).not.toContain(need(ctx.keys.personas['jade']));
  });

  it('shows the card after a fail as well and uses no payment words', async () => {
    await renderRoute(`${base}/done`, 'staff', {
      prepare: async (c) => {
        const actor = actorFor('staff', c.keys);
        await completeAllLessons(c.handle, actor);
        await finishViaStore(c.handle, actor, 'all');
      },
    });
    const card = await screen.findByRole('region', { name: 'How was this training?' });
    expect(card.textContent).not.toMatch(/billing|payment|invoice|£/i);
  });
});

describe('S13 reply notification (BP-14)', () => {
  it('shows a reply from the manager with the module title', async () => {
    await renderRoute('/staff/notifications', 'staff', {
      prepare: async ({ handle, keys }) => {
        const priya = actorFor('client', keys);
        const jadeItem = need(
          (await handle.store.moduleFeedback.list(priya)).find(
            (f) => f.personId === keys.personas['jade'] && f.reply === undefined,
          ),
        );
        await handle.store.moduleFeedback.reply(priya, jadeItem.id, 'Thanks, we have updated the lesson.');
      },
    });
    await waitFor(() => {
      expect(screen.getByText(/Your manager replied to your feedback on /)).toBeTruthy();
    });
    expect(screen.queryByText('You have a new message.')).toBeNull();
  });
});

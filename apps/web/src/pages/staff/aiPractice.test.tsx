// M5 chunk 9 (F-7): "Quiz me for practice" (plan docs/plans/m5.md F-7 and assumption 12; brief 20.7).
// Written before the implementation. Assumed (the implementer must match):
//   Data: store.ai.practice(actor, { moduleId }) => { label: 'Demo AI', questions } (see packages/data/src/contract/aiPractice.ts).
//   Language keys, group `aiPractice` in en-GB.json and pl-PL.json (the staff translation coverage test needs the Polish values):
//     aiPractice.button  "Quiz me for practice"
//     aiPractice.label   "Demo AI"
//     aiPractice.notice  "Practice only: no XP, and it does not count towards your training record or competitions"
//   S4 /staff/module/:id and S7 /staff/module/:id/done: a link or button named "Quiz me for practice" when the client has the
//     AI Assistant, going to #/staff/module/:id/practice. Nothing at all (no locked card, no payment wording) without it.
//   Practice page /staff/module/:id/practice: calls ai.practice once when it opens (one usage unit, nothing else written).
//     Shows the text "Demo AI" and the notice. Each drawn question is a group (fieldset) whose legend is the prompt, with a
//     radio per option. Picking a radio checks the answer straight away (domain checkAnswer) and shows, inside the group,
//     an element data-testid="practice-feedback" with data-correct="true"|"false", the words "Correct" or "Not quite",
//     and the question explanation. Once every question is answered, data-testid="practice-summary" reads
//     "You got {right} of {total} right". Picking an answer writes nothing (usage stays at 1).
//     Without the add-on the page shows a plain role=alert sentence, no "Demo AI", no payment wording and no questions.
//   C6 /client/modules/:id/preview (admin Preview as a learner): without the AI Assistant a locked card
//     data-testid="practice-locked" (same wording and request/add-ons link pattern as explain-locked) and no
//     "Quiz me for practice" button. Staff never see a locked card.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addOnIds, languages } from '@sta/content';
import type { Module, Question } from '@sta/domain';
import type { StoreHandle } from '@sta/data';
import { actorFor, renderRoute } from '../../test/harness';
import { completeAllLessons, finishViaStore, sgModule } from '../../test/quizHelpers';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(cleanup);

const NOTICE = 'Practice only: no XP, and it does not count towards your training record or competitions';
type Ctx = Parameters<NonNullable<Parameters<typeof renderRoute>[2]>['prepare'] & object>[0];

const mcq = (n: number): Question => ({
  id: `pq${String(n)}`,
  type: 'mcq',
  prompt: `Practice prompt number ${String(n)}`,
  options: [
    { id: `pq${String(n)}-yes`, text: `Right answer ${String(n)}`, correct: true },
    { id: `pq${String(n)}-no`, text: `Wrong answer ${String(n)}`, correct: false },
  ],
  explanation: `Explanation for ${String(n)}.`,
  learnMore: [],
  tags: [],
});
const practiceModule: Module = {
  ...sgModule,
  id: '01J0000000000000000000PRAC',
  title: 'Practice test module',
  owner: 'provider',
  status: 'published',
  questions: [1, 2, 3, 4, 5].map(mcq),
};
const aiOn = async ({ handle, keys }: Ctx) => {
  await handle.store.addOns.turnOn(actorFor('client', keys), addOnIds.aiAssistant);
};
const withModule = async (ctx: Ctx) => {
  await ctx.handle.admin.bulkPut('modules', [practiceModule]);
};
const withAi = async (ctx: Ctx) => {
  await withModule(ctx);
  await aiOn(ctx);
};
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const usage = async (handle: StoreHandle) =>
  (await dump<{ addOnId: string; usageThisPeriod: number }>(handle, 'addOnSubscriptions')).find(
    (s) => s.addOnId === addOnIds.aiAssistant && s.usageThisPeriod > 0,
  )?.usageThisPeriod ?? 0;
const practiceButton = () =>
  screen
    .queryAllByRole('link', { name: /quiz me for practice/i })
    .concat(screen.queryAllByRole('button', { name: /quiz me for practice/i }));
const PRACTICE = `/staff/module/${practiceModule.id}/practice`;

describe('Quiz me for practice buttons', () => {
  it('S4 shows the button to staff whose client has the AI Assistant', async () => {
    await renderRoute(`/staff/module/${practiceModule.id}`, 'staff', { prepare: withAi });
    await screen.findAllByRole('heading', { level: 1 });
    await waitFor(() => {
      expect(practiceButton().length).toBeGreaterThan(0);
    });
  });

  it('S4 shows staff nothing, no locked card and no payment wording, without the AI Assistant', async () => {
    await renderRoute(`/staff/module/${practiceModule.id}`, 'staff', { prepare: withModule });
    await screen.findAllByRole('heading', { level: 1 });
    expect(practiceButton()).toHaveLength(0);
    expect(screen.queryByTestId('practice-locked')).toBeNull();
    expect(document.body.textContent).not.toMatch(/quiz me for practice|billing|payment|add-on|upgrade|£/i);
  });

  it('S7 shows the button after a pass when the AI Assistant is on, and nothing when it is off', async () => {
    const pass = async ({ handle, keys }: Ctx) => {
      const actor = actorFor('staff', keys);
      await completeAllLessons(handle, actor);
      await finishViaStore(handle, actor, 0);
    };
    await renderRoute(`/staff/module/${sgModule.id}/done`, 'staff', {
      prepare: async (ctx) => {
        await aiOn(ctx);
        await pass(ctx);
      },
    });
    await screen.findByTestId('xp-total');
    expect(practiceButton().length).toBeGreaterThan(0);
    cleanup();
    await renderRoute(`/staff/module/${sgModule.id}/done`, 'staff', { prepare: pass });
    await screen.findByTestId('xp-total');
    expect(practiceButton()).toHaveLength(0);
    expect(screen.queryByTestId('practice-locked')).toBeNull();
  });

  it('opens the practice page from the button', async () => {
    const { router } = await renderRoute(`/staff/module/${practiceModule.id}`, 'staff', { prepare: withAi });
    await screen.findAllByRole('heading', { level: 1 });
    const first = (await screen.findAllByRole('link', { name: /quiz me for practice/i }))[0]!;
    await userEvent.click(first);
    expect(router.state.location.pathname).toBe(PRACTICE);
  });
});

describe('Practice page', () => {
  it('labels the quiz Demo AI and says it is practice only', async () => {
    await renderRoute(PRACTICE, 'staff', { prepare: withAi });
    expect(await screen.findByText(NOTICE)).toBeTruthy();
    expect(screen.getAllByText(/demo ai/i).length).toBeGreaterThan(0);
  });

  it('shows 3 questions from the module, each with its options', async () => {
    await renderRoute(PRACTICE, 'staff', { prepare: withAi });
    const groups = await screen.findAllByRole('group');
    expect(groups).toHaveLength(3);
    for (const g of groups) {
      const legend = within(g).getByText(/Practice prompt number \d/);
      expect(legend).toBeTruthy();
      expect(within(g).getAllByRole('radio')).toHaveLength(2);
    }
  });

  it('writes only one usage unit: no attempt, no learning event, no XP, and answering adds nothing', async () => {
    const { handle } = await renderRoute(PRACTICE, 'staff', { prepare: withAi });
    const attempts = JSON.stringify(await dump(handle, 'attempts'));
    const events = JSON.stringify(await dump(handle, 'learningEvents'));
    const groups = await screen.findAllByRole('group');
    expect(await usage(handle)).toBe(1);
    for (const g of groups) await userEvent.click(within(g).getAllByRole('radio')[0]!);
    expect(await usage(handle)).toBe(1);
    expect(JSON.stringify(await dump(handle, 'attempts'))).toBe(attempts);
    expect(JSON.stringify(await dump(handle, 'learningEvents'))).toBe(events);
  });

  it('marks a right answer Correct and a wrong one Not quite, each with its explanation', async () => {
    await renderRoute(PRACTICE, 'staff', { prepare: withAi });
    const groups = await screen.findAllByRole('group');
    const [g1, g2] = groups as [HTMLElement, HTMLElement];
    await userEvent.click(within(g1).getByRole('radio', { name: /Right answer/ }));
    await userEvent.click(within(g2).getByRole('radio', { name: /Wrong answer/ }));
    const f1 = within(g1).getByTestId('practice-feedback');
    const f2 = within(g2).getByTestId('practice-feedback');
    expect(f1.getAttribute('data-correct')).toBe('true');
    expect(f1.textContent).toContain('Correct');
    expect(f2.getAttribute('data-correct')).toBe('false');
    expect(f2.textContent).toContain('Not quite');
    const n1 = /Practice prompt number (\d)/.exec(g1.textContent)![1]!;
    expect(f1.textContent).toContain(`Explanation for ${n1}.`);
    const n2 = /Practice prompt number (\d)/.exec(g2.textContent)![1]!;
    expect(f2.textContent).toContain(`Explanation for ${n2}.`);
  });

  it('shows no feedback before an answer is picked, and no summary until every question is answered', async () => {
    await renderRoute(PRACTICE, 'staff', { prepare: withAi });
    const groups = await screen.findAllByRole('group');
    expect(screen.queryAllByTestId('practice-feedback')).toHaveLength(0);
    await userEvent.click(within(groups[0]!).getAllByRole('radio')[0]!);
    expect(screen.queryByTestId('practice-summary')).toBeNull();
  });

  it('summarises the result once all three are answered', async () => {
    await renderRoute(PRACTICE, 'staff', { prepare: withAi });
    const groups = await screen.findAllByRole('group');
    await userEvent.click(within(groups[0]!).getByRole('radio', { name: /Right answer/ }));
    await userEvent.click(within(groups[1]!).getByRole('radio', { name: /Right answer/ }));
    await userEvent.click(within(groups[2]!).getByRole('radio', { name: /Wrong answer/ }));
    expect((await screen.findByTestId('practice-summary')).textContent).toContain('You got 2 of 3 right');
  });

  it('shows staff without the AI Assistant one plain sentence, no questions and no payment wording', async () => {
    const { handle } = await renderRoute(PRACTICE, 'staff', { prepare: withModule });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/demo ai|billing|payment|add-on|upgrade|£/i);
    expect(await usage(handle)).toBe(0);
  });
});

describe('Admin Preview as a learner', () => {
  it('shows the locked card, and no Quiz me for practice button, without the AI Assistant', async () => {
    await renderRoute(`/client/modules/${practiceModule.id}/preview`, 'client', { prepare: withModule });
    const locked = await screen.findByTestId('practice-locked');
    expect(locked.textContent).toMatch(/ask someone with billing access/i);
    expect(practiceButton()).toHaveLength(0);
  });

  it('shows no practice locked card on the preview once the AI Assistant is on', async () => {
    await renderRoute(`/client/modules/${practiceModule.id}/preview`, 'client', { prepare: withAi });
    await screen.findAllByRole('heading', { level: 2 });
    expect(screen.queryByTestId('practice-locked')).toBeNull();
  });
});

describe('Language files', () => {
  const msg = (messages: unknown, key: string): string | undefined => {
    let node = messages;
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === 'string' ? node : undefined;
  };
  it('holds the practice strings in English with the exact wording', () => {
    const en = languages['en-GB'].messages;
    expect(msg(en, 'aiPractice.button')).toBe('Quiz me for practice');
    expect(msg(en, 'aiPractice.label')).toBe('Demo AI');
    expect(msg(en, 'aiPractice.notice')).toBe(NOTICE);
  });
  it('holds Polish values for every aiPractice key', () => {
    const en = (languages['en-GB'].messages as { aiPractice?: Record<string, string> }).aiPractice ?? {};
    const pl = languages['pl-PL'].messages as { aiPractice?: Record<string, string> };
    expect(Object.keys(en).length).toBeGreaterThanOrEqual(3);
    for (const key of Object.keys(en)) expect(pl.aiPractice?.[key], key).toBeTruthy();
  });
});

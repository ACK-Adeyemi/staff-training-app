// M5 chunk 10 (F-7 client admin part; brief 20.7, brief 08 last paragraph; build pack C7): Draft from a policy, Suggest
// questions, AI-drafted labels, Mark as checked and the checklist message in the Module Builder.
// Written before the implementation. UI contract (English values; new strings in en-GB.json under the group `aiDraft`,
// client admin keys stay English-only):
//   Keys: aiDraft.heading "Draft from a policy", aiDraft.pasteLabel "Paste your policy", aiDraft.warning
//     "Do not paste personal data, such as names of children, parents or staff.", aiDraft.draftButton "Make a draft",
//     aiDraft.tooLong "The policy is too long. Keep it to 20,000 characters or fewer.", aiDraft.empty "Paste your policy first.",
//     aiDraft.suggestButton "Suggest questions", aiDraft.noText "Add some lesson text first.",
//     aiDraft.label "AI-drafted: check before publishing", aiDraft.checked "AI-drafted and checked",
//     aiDraft.markChecked "Mark as checked", aiDraft.uncheckedMessage "Check every AI-drafted lesson and question before
//     publishing. {count} still to check.", aiDraft.locked (locked card wording, no payment words except those the
//     existing preview.explainLocked also uses), aiDraft.error.
//   C7 (own module, modules.manage) when the client has the AI Assistant:
//     a section with h2 "Draft from a policy", textarea "Paste your policy", the warning line as
//     data-testid="ai-policy-warning" and a button "Make a draft". No maxLength on the textarea (so the length error can show).
//     "Make a draft" calls store.ai.draftFromPolicy once. Success: the Title is filled when it was blank, the drafted
//     lessons and questions are ADDED to the form (builder-lesson / builder-question cards), role=status
//     "Draft added. Check each item before publishing." is not required. Nothing is saved until Save draft (no module row).
//     A policy of more than 20,000 characters, or a blank one: role=alert with aiDraft.tooLong / aiDraft.empty, no
//     lessons added, no usage counted.
//     Each lesson card has a button "Suggest questions" (uses that lesson's current text from the form; ai.suggestQuestions);
//     up to 3 questions are added to the questions list, all AI-drafted, with ids unique among all questions.
//     A lesson with no text: role=alert aiDraft.noText, nothing added.
//   Every AI-drafted lesson card and question card contains data-testid="ai-label" with the text "AI-drafted: check
//     before publishing" and a button "Mark as checked" (for a saved module this calls authoring.markAiChecked and the
//     card then shows the label text "AI-drafted and checked" and no button). The behaviour on an unsaved module is the
//     implementer's call; the tests below save first.
//   Checklist: still exactly six data-testid="checklist-item" rows. While any AI-drafted item is unchecked an extra
//     element data-testid="ai-unchecked-message" shows the message with the count; it is absent otherwise. Publish while
//     unchecked opens no dialog and shows the checklistFailed alert.
//   Without the add-on (or with the P22 kill switch on): data-testid="draft-locked" locked card (admin pattern of
//     explain-locked) and none of the paste box or Suggest questions buttons. AI-drafted labels still show on items.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addOnIds } from '@sta/content';
import en from '../../../../../packages/content/src/lang/en-GB.json';
import type { StoreHandle } from '@sta/data';
import type { Module, Question } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { actorFor, renderRoute } from '../../test/harness';

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
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const usage = async (handle: StoreHandle) =>
  (await dump<{ addOnId: string; usageThisPeriod: number }>(handle, 'addOnSubscriptions')).find(
    (s) => s.addOnId === addOnIds.aiAssistant,
  )?.usageThisPeriod ?? 0;
const aiOn = async ({ handle, keys }: Ctx) => {
  await handle.store.addOns.turnOn(actorFor('client', keys), addOnIds.aiAssistant);
};

const LABEL = 'AI-drafted: check before publishing';
const POLICY = [
  'Outings policy',
  '',
  '# Before we go',
  'A named adult counts the children. The first aid kit goes in the bag. Parents sign the form.',
  '',
  '# On the way',
  'Children hold hands in pairs. A leader walks at the front.',
].join('\n');

const tf = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  type: 'trueFalse',
  prompt: `Statement ${id} is true.`,
  options: [
    { id: `${id}-t`, text: 'True', correct: true },
    { id: `${id}-f`, text: 'False', correct: false },
  ],
  explanation: 'Because.',
  learnMore: [],
  tags: [],
  ...over,
});

/** A saved own draft module with one AI-drafted lesson, two AI-drafted questions and one ordinary question. */
async function makeAiModule({ handle, keys }: Ctx): Promise<Module> {
  const priya = actorFor('client', keys);
  const [req] = await handle.store.requirements.list(priya);
  return handle.store.authoring.create(priya, {
    title: 'Outings',
    description: 'From a policy',
    estimatedMinutes: 5,
    language: 'en-GB',
    requirementIds: [need(req).id],
    roleTags: [],
    lessons: [
      {
        id: 'intro',
        title: 'Before we go',
        minutes: 3,
        blocks: [{ kind: 'text', markdown: 'A named adult counts the children. Parents sign the form.' }],
        aiDrafted: true,
      },
      { id: 'plain', title: 'Plain lesson', minutes: 3, blocks: [{ kind: 'text', markdown: 'Wear a hat.' }] },
      { id: 'blank', title: 'Blank lesson', minutes: 3, blocks: [] },
    ],
    questions: [tf('q1', { aiDrafted: true }), tf('q2', { aiDrafted: true }), tf('q3')],
    quiz: {
      mode: 'mcq',
      drawCount: 2,
      shuffleQuestions: true,
      shuffleOptions: true,
      passMark: 80,
      maxRetakes: null,
      feedback: true,
      showSourceRef: true,
      notesInQuiz: 'choice',
      learnMoreFor: 'all',
    },
  });
}

/** Opens the builder on a module created in `prepare`, by navigating inside the same store. */
async function openAiModule(prepare: (c: Ctx) => Promise<void> = aiOn) {
  let id = '';
  const c = await renderRoute('/client/modules/new', 'client', {
    prepare: async (x) => {
      await prepare(x);
      id = (await makeAiModule(x)).id;
    },
  });
  await act(async () => {
    await c.router.navigate(`/client/modules/${id}/edit`);
  });
  await screen.findByRole('heading', { level: 2, name: 'Before you publish' }).catch(() => undefined);
  await screen.findAllByTestId('builder-lesson');
  return { c, id };
}
const openNew = async (prepare: (c: Ctx) => Promise<void> = aiOn) => {
  const c = await renderRoute('/client/modules/new', 'client', { prepare });
  await screen.findByRole('textbox', { name: 'Title' });
  return c;
};
const pasteAndDraft = async (policy: string) => {
  fireEvent.change(await screen.findByRole('textbox', { name: 'Paste your policy' }), { target: { value: policy } });
  fireEvent.click(screen.getByRole('button', { name: 'Make a draft' }));
};
const lessons = () => screen.queryAllByTestId('builder-lesson');
const questions = () => screen.queryAllByTestId('builder-question');
const unchecked = () => screen.queryByTestId('ai-unchecked-message');
const lessonCard = (title: string) =>
  need(
    lessons().find((el) => within(el).getByRole<HTMLInputElement>('textbox', { name: 'Lesson title' }).value === title),
  );

describe('C7 Draft from a policy', () => {
  it('shows the paste box, a heading, and the warning not to paste personal data', async () => {
    await openNew();
    expect(await screen.findByRole('heading', { level: 2, name: 'Draft from a policy' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Paste your policy' })).toBeTruthy();
    expect(screen.getByTestId('ai-policy-warning').textContent).toContain('Do not paste personal data');
    expect(screen.getByRole('button', { name: 'Make a draft' })).toBeTruthy();
  });

  it('adds the drafted lessons and questions to the form, each labelled AI-drafted with Mark as checked', async () => {
    const c = await openNew();
    await pasteAndDraft(POLICY);
    await waitFor(() => {
      expect(lessons()).toHaveLength(2);
    });
    expect(questions()).toHaveLength(5);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Title', exact: true }).value).toBe('Outings policy');
    for (const card of [...lessons(), ...questions()]) {
      expect(within(card).getByTestId('ai-label').textContent).toContain(LABEL);
      expect(within(card).getByRole('button', { name: 'Mark as checked' })).toBeTruthy();
    }
    expect(await usage(c.handle)).toBe(1);
  });

  it('saves nothing until Save draft: no module row, no draft row', async () => {
    const c = await openNew();
    const before = (await dump<Module>(c.handle, 'modules')).length;
    await pasteAndDraft(POLICY);
    await waitFor(() => {
      expect(lessons()).toHaveLength(2);
    });
    expect((await dump<Module>(c.handle, 'modules')).length).toBe(before);
    expect(await dump(c.handle, 'moduleDrafts')).toHaveLength(0);
    // Pasted text never reaches the audit log.
    expect(JSON.stringify(await dump(c.handle, 'audit'))).not.toContain('named adult');
  });

  it('shows a plain length error for more than 20,000 characters and adds nothing', async () => {
    const c = await openNew();
    await pasteAndDraft('Policy\n\n' + 'Staff wash their hands. '.repeat(1000));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The policy is too long. Keep it to 20,000 characters or fewer.');
    expect(lessons()).toHaveLength(0);
    expect(questions()).toHaveLength(0);
    expect(await usage(c.handle)).toBe(0);
  });

  it('asks for a policy when the box is blank', async () => {
    await openNew();
    fireEvent.click(await screen.findByRole('button', { name: 'Make a draft' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Paste your policy first.');
    expect(lessons()).toHaveLength(0);
  });

  it('shows pasted HTML as text and never as markup', async () => {
    await openNew();
    await pasteAndDraft(
      'Policy\n\n# Odd\nNever trust <img src="x" onerror="window.pwned=1"> here. Keep <b>calm</b> always.',
    );
    await waitFor(() => {
      expect(lessons()).toHaveLength(1);
    });
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('main b')).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it('shows the locked card, and no paste box, without the AI Assistant', async () => {
    await openNew(() => Promise.resolve());
    expect(await screen.findByTestId('draft-locked')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Paste your policy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Make a draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggest questions' })).toBeNull();
  });

  it('shows the locked card while the provider kill switch is on', async () => {
    await openNew(async (x) => {
      await aiOn(x);
      await x.handle.store.aiSettings.setKillSwitch(
        actorFor('provider', x.keys),
        need(x.keys.clients.littleAcorns),
        true,
      );
    });
    expect(await screen.findByTestId('draft-locked')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Paste your policy' })).toBeNull();
  });

  it('keeps the locked card out of the way of staff: a staff user cannot open the builder', async () => {
    await renderRoute('/client/modules/new', 'staff', { prepare: aiOn });
    expect(screen.queryByTestId('draft-locked')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Paste your policy' })).toBeNull();
  });
});

describe('C7 Suggest questions', () => {
  it('adds up to 3 AI-drafted questions from that lesson text, each labelled', async () => {
    const { c } = await openAiModule();
    const before = questions().length;
    fireEvent.click(within(lessonCard('Before we go')).getByRole('button', { name: 'Suggest questions' }));
    await waitFor(() => {
      expect(questions().length).toBeGreaterThan(before);
    });
    const added = questions().length - before;
    expect(added).toBeGreaterThanOrEqual(1);
    expect(added).toBeLessThanOrEqual(3);
    const newOnes = questions().slice(before);
    for (const card of newOnes) {
      expect(within(card).getByTestId('ai-label').textContent).toContain(LABEL);
      expect(within(card).getByRole<HTMLInputElement>('textbox', { name: 'Question' }).value).toMatch(
        /named adult|counts the children|Parents sign the form/,
      );
    }
    expect(await usage(c.handle)).toBe(1);
  });

  it('keeps question ids unique when asked twice for the same lesson', async () => {
    await openAiModule();
    const button = () => within(lessonCard('Before we go')).getByRole('button', { name: 'Suggest questions' });
    fireEvent.click(button());
    await waitFor(() => {
      expect(questions().length).toBeGreaterThan(3);
    });
    const afterOne = questions().length;
    fireEvent.click(button());
    await waitFor(() => {
      expect(questions().length).toBeGreaterThan(afterOne);
    });
    const ids = questions().map((q) => q.getAttribute('data-question-id'));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says to add lesson text first for an empty lesson, and adds nothing and counts nothing', async () => {
    const { c } = await openAiModule();
    const before = questions().length;
    fireEvent.click(within(lessonCard('Blank lesson')).getByRole('button', { name: 'Suggest questions' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Add some lesson text first.');
    expect(questions()).toHaveLength(before);
    expect(await usage(c.handle)).toBe(0);
  });

  it('shows no Suggest questions buttons without the AI Assistant', async () => {
    await openAiModule(() => Promise.resolve());
    expect(await screen.findByTestId('draft-locked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Suggest questions' })).toBeNull();
  });
});

describe('C7 Mark as checked and the publish checklist', () => {
  it('labels only the AI-drafted items', async () => {
    await openAiModule();
    expect(within(lessonCard('Before we go')).getByTestId('ai-label').textContent).toContain(LABEL);
    expect(within(lessonCard('Plain lesson')).queryByTestId('ai-label')).toBeNull();
    const plain = need(questions().find((q) => q.getAttribute('data-question-id') === 'q3'));
    expect(within(plain).queryByTestId('ai-label')).toBeNull();
    expect(within(plain).queryByRole('button', { name: 'Mark as checked' })).toBeNull();
  });

  it('keeps six checklist items and adds the unchecked message with the count while items are unchecked', async () => {
    await openAiModule();
    expect(screen.getAllByTestId('checklist-item')).toHaveLength(6);
    const message = need(unchecked());
    expect(message.textContent).toContain('Check every AI-drafted lesson and question before publishing.');
    expect(message.textContent).toContain('3 still to check');
  });

  it('refuses Publish while items are unchecked: no dialog and the cannot-publish alert', async () => {
    await openAiModule();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      "This can't be published yet. Fix the items listed first.",
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stores who checked an item, updates the label and the count, and audits it', async () => {
    const { c, id } = await openAiModule();
    const user = userEvent.setup();
    const q1 = need(questions().find((q) => q.getAttribute('data-question-id') === 'q1'));
    await user.click(within(q1).getByRole('button', { name: 'Mark as checked' }));
    await waitFor(() => {
      const again = need(questions().find((q) => q.getAttribute('data-question-id') === 'q1'));
      expect(within(again).queryByRole('button', { name: 'Mark as checked' })).toBeNull();
      expect(within(again).getByTestId('ai-label').textContent).toContain('AI-drafted and checked');
    });
    expect(need(unchecked()).textContent).toContain('2 still to check');
    const row = need((await dump<Module>(c.handle, 'modules')).find((m) => m.id === id));
    expect(row.questions.find((q) => q.id === 'q1')?.aiReviewedBy).toBe(need(c.keys.users['priya']));
    expect(
      (await dump<{ action: string }>(c.handle, 'audit')).some((e) => e.action === 'authoring.markAiChecked'),
    ).toBe(true);
  });

  it('removes the message and lets Publish open once every item is checked', async () => {
    await openAiModule();
    const user = userEvent.setup();
    for (const left of [2, 1, 0]) {
      await user.click(need(screen.getAllByRole('button', { name: 'Mark as checked' })[0]));
      await waitFor(() => {
        expect(screen.queryAllByRole('button', { name: 'Mark as checked' })).toHaveLength(left);
      });
    }
    await waitFor(() => {
      expect(unchecked()).toBeNull();
    });
    expect(screen.queryAllByRole('button', { name: 'Mark as checked' })).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('dialog', { name: 'Publish as version 1' })).toBeTruthy();
  });
});

describe('aiDraft language keys', () => {
  const group = (en as unknown as Record<string, Record<string, string>>)['aiDraft'];
  it('has the group with the agreed English wording', () => {
    expect(group).toBeDefined();
    expect(group?.['heading']).toBe('Draft from a policy');
    expect(group?.['pasteLabel']).toBe('Paste your policy');
    expect(group?.['warning']).toContain('Do not paste personal data');
    expect(group?.['draftButton']).toBe('Make a draft');
    expect(group?.['suggestButton']).toBe('Suggest questions');
    expect(group?.['label']).toBe(LABEL);
    expect(group?.['markChecked']).toBe('Mark as checked');
    expect(group?.['tooLong']).toBe('The policy is too long. Keep it to 20,000 characters or fewer.');
    expect(group?.['uncheckedMessage']).toContain('{count} still to check');
  });
  it('has no payment wording outside the locked card', () => {
    for (const [key, value] of Object.entries(group ?? {})) {
      if (key === 'locked') continue;
      expect(value, key).not.toMatch(/billing|payment|invoice|£|price/i);
    }
  });
});

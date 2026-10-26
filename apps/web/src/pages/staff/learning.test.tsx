// M1 chunk 9 (BP-1, BP-2): staff learning flow S4 to S7, the certificate and the organisation document page.
// Contract the implementer must provide (routes sit in the staff shell except #/doc/:attachmentId, which is outside it):
//   S4  /staff/module/:id            h1 = module title; "Draft content" badge when module.draftContent; the module's
//        sourceAttribution text; "Renew every 2 years"; a list of lessons (links named by title, with minutes) where a
//        completed lesson's list item contains the word "Done". One primary link: "Start" (href ends /lesson/<first>)
//        when nothing is done; "Resume" (to the first lesson not done) when some are; "Start quiz" (href ends /quiz)
//        once every lesson of this version has lessonCompleted. No quiz link before that. Learn, Home and Progress
//        "Start" links point at #/staff/module/:id.
//   S5  /staff/module/:id/lesson/:lessonId   h1 = lesson title; one block per step; Stepper text "Step n of N" with a
//        role=progressbar; "Next" and "Back" buttons (Back absent or disabled on step 1); keyPoints render as list items;
//        an acknowledge step shows a checkbox labelled with the statement and its forward button is disabled until
//        ticked; the last step's button is "Finish lesson": it records lessonCompleted and goes to the module overview.
//        When lessons are not all done the quiz page says "Finish all the lessons first" with a link back to the overview.
//   S6  /staff/module/:id/quiz       intro with "Draft content" badge and button "Start quiz" (blocked with a message
//        and a link back to the overview when lessons are not all done). Then "Question n of N", the prompt in an
//        element with data-testid="question-prompt", a radiogroup of choices, button "Submit answer". After submit a
//        region named "Feedback" shows the word "Correct" or "Not quite", the explanation, "Source: <sourceRef>" and
//        Learn more links (each an anchor named "Learn more: <title> ..." ending "(opens in a new tab)"), grouped
//        official first then a "From your organisation" group. Scenario: each step submit shows the choice feedback and
//        the outcome word (Best choice, Acceptable, Not the best choice) and a "Continue" button until the last step.
//        Then "Next question", or "Finish quiz" on the last question, which finishes the attempt and goes to /done.
//        Leaving and returning resumes at the first unanswered question.
//   S7  /staff/module/:id/done       "You passed" or "Not passed this time"; the score as "NN%"; a link "View certificate"
//        (href ends /certificate) when passed; a link or button "Retake the quiz" when not passed (starts a new attempt
//        and goes to /quiz); a heading "Review what you missed" with one item per missed question (prompt, explanation,
//        every Learn more link) and no such heading when nothing was missed.
//   Certificate /staff/module/:id/certificate  "Certificate of completion", the person's name, module title, version,
//        London completion date written like "19 October 2026", client display name, a button "Print or save as PDF"
//        that calls window.print; the name of the site the evidence was recorded against (siteIdAtTime).
//   Doc  /doc/:attachmentId          h1 = attachment title, body rendered as Markdown; same-client actors only; an
//        unknown or other-client id shows role=alert and none of the body. Organisation links in feedback point at
//        #/doc/<attachmentId> with target=_blank and rel=noopener noreferrer.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { actorFor, renderRoute, seededStore } from '../../test/harness';
import { displayDomain, type Module } from '@sta/domain';
import type { StoreHandle } from '@sta/data';
import {
  answerCurrent,
  completeAllLessons,
  currentQuestion,
  feedbackRegion,
  finishViaStore,
  sgModule,
} from '../../test/quizHelpers';

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

const base = `/staff/module/${sgModule.id}`;
type Dump = Record<string, Record<string, unknown>[]>;
const dump = async (h: { admin: { dumpAll(): Promise<unknown> } }) => (await h.admin.dumpAll()) as Dump;
// The M2 seed holds history for other people and modules (conflict 11), so these helpers look at Jade's Safeguarding
// records only: she has none in the seed, which is what these tests were written against.
const isJadeSg = (d: Dump, r: Record<string, unknown>) =>
  r['moduleId'] === sgModule.id && r['personId'] === d.people!.find((p) => p['firstName'] === 'Jade')!['id'];
const events = async (h: Parameters<typeof dump>[0], type: string) => {
  const d = await dump(h);
  return d.learningEvents!.filter((e) => e['type'] === type && isJadeSg(d, e));
};
const jadeAttempts = async (h: Parameters<typeof dump>[0]) => {
  const d = await dump(h);
  return d.attempts!.filter((a) => isJadeSg(d, a));
};

// Stops jsdom trying to navigate when a target=_blank link is clicked.
function blockNavigation() {
  const stop = (e: Event) => {
    if ((e.target as HTMLElement).closest('a')) e.preventDefault();
  };
  document.addEventListener('click', stop);
  return () => {
    document.removeEventListener('click', stop);
  };
}

describe('S4 module overview', () => {
  it('shows the title, Draft content badge, attribution, renewal and every lesson with minutes', async () => {
    await renderRoute(base, 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: sgModule.title })).toBeTruthy();
    expect(screen.getByText('Draft content')).toBeTruthy();
    expect(screen.getByText(sgModule.sourceAttribution as string)).toBeTruthy();
    expect(screen.getByText(/Renew every 2 years/)).toBeTruthy();
    for (const l of sgModule.lessons) {
      const link = screen.getByRole('link', { name: new RegExp(l.title) });
      expect(link.closest('li')?.textContent).toMatch(new RegExp(`${l.minutes}\\s*min`));
    }
  });

  it('offers Start to the first lesson and no quiz link before the lessons are done', async () => {
    await renderRoute(base, 'staff');
    const start = await screen.findByRole('link', { name: /^Start/ });
    expect(start.getAttribute('href')).toMatch(/\/lesson\/lesson-1$/);
    expect(screen.queryByRole('link', { name: /Start quiz/ })).toBeNull();
  });

  it('marks finished lessons Done and offers Resume at the first lesson not done', async () => {
    await renderRoute(base, 'staff', {
      prepare: async ({ handle, keys }) => {
        await handle.store.learning.recordLesson(actorFor('staff', keys), {
          moduleId: sgModule.id,
          lessonId: 'lesson-1',
          kind: 'completed',
        });
      },
    });
    const resume = await screen.findByRole('link', { name: /^Resume/ });
    expect(resume.getAttribute('href')).toMatch(/\/lesson\/lesson-2$/);
    const first = screen.getByRole('link', { name: new RegExp(sgModule.lessons[0]!.title) });
    expect(first.closest('li')?.textContent).toMatch(/Done/);
    const second = screen.getByRole('link', { name: new RegExp(sgModule.lessons[1]!.title) });
    expect(second.closest('li')?.textContent).not.toMatch(/Done/);
  });

  it('offers Start quiz once every lesson is complete', async () => {
    await renderRoute(base, 'staff', {
      prepare: ({ handle, keys }) => completeAllLessons(handle, actorFor('staff', keys)),
    });
    const quiz = await screen.findByRole('link', { name: /Start quiz/ });
    expect(quiz.getAttribute('href')).toMatch(/\/quiz$/);
  });

  it('Learn, Home and Progress start links open the module overview', async () => {
    const learn = await renderRoute('/staff/learn', 'staff');
    const link = await screen.findByRole('link', { name: sgModule.title });
    expect(link.getAttribute('href')).toBe(`#/staff/module/${sgModule.id}`);
    learn.unmount();
    await renderRoute('/staff', 'staff');
    const start = await screen.findByRole('link', { name: /Start/ });
    expect(start.getAttribute('href')).toBe(`#/staff/module/${sgModule.id}`);
  });
});

describe('S5 lesson player', () => {
  const lesson = sgModule.lessons[0]!;
  const lessonPath = `${base}/lesson/${lesson.id}`;

  it('shows the lesson title, "Step 1 of N", a progress bar and the first block', async () => {
    await renderRoute(lessonPath, 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: lesson.title })).toBeTruthy();
    expect(screen.getByText(`Step 1 of ${lesson.blocks.length}`)).toBeTruthy();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe(String(lesson.blocks.length));
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    const back = screen.queryByRole('button', { name: 'Back' });
    if (back) expect((back as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves forward and back through the steps', async () => {
    const user = userEvent.setup();
    await renderRoute(lessonPath, 'staff');
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(screen.getByText(`Step 2 of ${lesson.blocks.length}`)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(`Step 1 of ${lesson.blocks.length}`)).toBeTruthy();
  });

  it('shows key points as a list', async () => {
    const user = userEvent.setup();
    await renderRoute(lessonPath, 'staff');
    const kp = lesson.blocks.findIndex((b) => b.kind === 'keyPoints');
    const block = lesson.blocks[kp];
    if (block?.kind !== 'keyPoints') throw new Error('lesson 1 has no key points');
    await screen.findByRole('button', { name: 'Next' });
    for (let i = 0; i < kp; i++) await user.click(screen.getByRole('button', { name: 'Next' }));
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    for (const k of block.items) expect(items).toContain(k);
  });

  it('keeps the forward button disabled until the acknowledge box is ticked, then Finish lesson records lessonCompleted and returns to the overview', async () => {
    const user = userEvent.setup();
    const r = await renderRoute(lessonPath, 'staff');
    await screen.findByRole('button', { name: 'Next' });
    const ack = lesson.blocks.find((b) => b.kind === 'acknowledge');
    if (ack?.kind !== 'acknowledge') throw new Error('lesson 1 has no acknowledge step');
    for (let i = 0; i < lesson.blocks.length - 1; i++) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByText(`Step ${lesson.blocks.length} of ${lesson.blocks.length}`)).toBeTruthy();
    const finish = screen.getByRole<HTMLButtonElement>('button', { name: 'Finish lesson' });
    expect(finish.disabled).toBe(true);
    const before = (await events(r.handle, 'lessonCompleted')).length;
    await user.click(screen.getByRole('checkbox', { name: ack.statement }));
    expect(finish.disabled).toBe(false);
    await user.click(finish);
    await waitFor(() => {
      expect(r.router.state.location.pathname).toBe(base);
    });
    const after = await events(r.handle, 'lessonCompleted');
    expect(after).toHaveLength(before + 1);
    expect(after.some((e) => e['lessonId'] === lesson.id && e['moduleId'] === sgModule.id)).toBe(true);
  });
});

// A copy of the Safeguarding module (same id and version) with different quiz settings or a smaller bank, so a test
// can control what is drawn. Written through the demo admin, as the seed does.
function withModule(patch: { quiz?: Partial<Module['quiz']>; questionIds?: string[] }) {
  return async ({ handle, keys }: { handle: StoreHandle; keys: Parameters<typeof actorFor>[1] }) => {
    const m: Module = {
      ...sgModule,
      quiz: { ...sgModule.quiz, ...patch.quiz },
      questions: patch.questionIds
        ? sgModule.questions.filter((q) => patch.questionIds!.includes(q.id))
        : sgModule.questions,
    };
    await handle.admin.bulkPut('modules', [m]);
    await completeAllLessons(handle, actorFor('staff', keys));
  };
}
const ready = ({ handle, keys }: { handle: StoreHandle; keys: Parameters<typeof actorFor>[1] }) =>
  completeAllLessons(handle, actorFor('staff', keys));

const nextButton = () => screen.findByRole('button', { name: /^(Next question|Finish quiz)$/ });
const linksIn = (el: HTMLElement) => within(el).queryAllByRole('link', { name: /^Learn more:/ });

describe('S6 quiz', () => {
  it('blocks the quiz until every lesson is done and points back to the overview', async () => {
    await renderRoute(`${base}/quiz`, 'staff');
    expect(await screen.findByText(/Finish all the lessons first/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start quiz/ })).toBeNull();
    expect(screen.getByRole('link', { name: /module|lessons|back/i }).getAttribute('href')).toContain(
      `#/staff/module/${sgModule.id}`,
    );
  });

  it('starts an attempt that draws 10 questions and shows Question 1 of 10 with the Draft content badge', async () => {
    const user = userEvent.setup();
    const r = await renderRoute(`${base}/quiz`, 'staff', { prepare: ready });
    expect(await screen.findByText('Draft content')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Start quiz/ }));
    expect(await screen.findByText('Question 1 of 10')).toBeTruthy();
    const mine = await jadeAttempts(r.handle);
    expect(mine).toHaveLength(1);
    expect((mine[0]!['questionIds'] as string[]).length).toBe(10);
  });

  it('shows the choices as a radio group and keeps Submit answer disabled until one is chosen', async () => {
    const user = userEvent.setup();
    await renderRoute(`${base}/quiz`, 'staff', { prepare: ready });
    await user.click(await screen.findByRole('button', { name: /Start quiz/ }));
    await screen.findByTestId('question-prompt');
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit answer' }).disabled).toBe(true);
    await user.click(screen.getAllByRole('radio')[0]!);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit answer' }).disabled).toBe(false);
  });

  it('a right answer says Correct with the explanation and source, and shows only links whose showFor is all', async () => {
    const user = userEvent.setup();
    await renderRoute(`${base}/quiz`, 'staff', {
      prepare: withModule({ quiz: { mode: 'mcq', drawCount: 3 } }),
    });
    await user.click(await screen.findByRole('button', { name: /Start quiz/ }));
    await screen.findByTestId('question-prompt');
    const q = await answerCurrent(user, true);
    const fb = feedbackRegion();
    expect(within(fb).getByText('Correct')).toBeTruthy();
    expect(within(fb).getByText(q.explanation)).toBeTruthy();
    if (q.sourceRef) expect(within(fb).getByText(`Source: ${q.sourceRef}`)).toBeTruthy();
    const own = q.learnMore.filter((l) => l.showFor === 'all').length;
    expect(linksIn(fb).length).toBeGreaterThanOrEqual(own);
  });

  it('a right answer shows no Learn more links when the module says learnMoreFor wrong', async () => {
    const user = userEvent.setup();
    await renderRoute(`${base}/quiz`, 'staff', {
      prepare: withModule({ quiz: { mode: 'mcq', drawCount: 3, learnMoreFor: 'wrong' } }),
    });
    await user.click(await screen.findByRole('button', { name: /Start quiz/ }));
    await screen.findByTestId('question-prompt');
    await answerCurrent(user, true);
    const fb = feedbackRegion();
    expect(within(fb).getByText('Correct')).toBeTruthy();
    expect(linksIn(fb)).toHaveLength(0);
  });

  it('a wrong answer says Not quite and shows the explanation and every Learn more link with kind, icon, domain and new-tab attributes', async () => {
    const user = userEvent.setup();
    await renderRoute(`${base}/quiz`, 'staff', {
      prepare: withModule({ quiz: { mode: 'mcq', drawCount: 1 }, questionIds: ['q-dsl-role'] }),
    });
    await user.click(await screen.findByRole('button', { name: /Start quiz/ }));
    await screen.findByTestId('question-prompt');
    const q = await answerCurrent(user, false);
    const fb = feedbackRegion();
    expect(within(fb).getByText('Not quite')).toBeTruthy();
    expect(within(fb).getByText(q.explanation)).toBeTruthy();
    expect(within(fb).getByText('Source: EYFS 3.4')).toBeTruthy();
    for (const l of q.learnMore) {
      const a = within(fb).getByRole('link', { name: new RegExp(`Learn more: ${l.title.replace(/[()]/g, '\\$&')}`) });
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('href')).toBe(l.url);
      expect(a.getAttribute('aria-label') ?? a.textContent).toMatch(/\(opens in a new tab\)\s*$/);
      expect(a.querySelector('svg')).not.toBeNull();
      expect(a.textContent).toContain(displayDomain(l.url as string));
      if (l.locator) expect(a.textContent).toContain(l.locator);
    }
    expect(within(fb).getAllByText(/gov\.uk/).length).toBeGreaterThan(0);
  });

  it('lists From your organisation links after the official ones and opens the policy page in a new tab', async () => {
    const user = userEvent.setup();
    const r = await renderRoute(`${base}/quiz`, 'staff', {
      prepare: withModule({ quiz: { mode: 'mcq', drawCount: 1 }, questionIds: ['q-dsl-role'] }),
    });
    await user.click(await screen.findByRole('button', { name: /Start quiz/ }));
    await screen.findByTestId('question-prompt');
    await answerCurrent(user, false);
    const fb = feedbackRegion();
    const heading = within(fb).getByText('From your organisation');
    const org = within(fb).getByRole('link', { name: /Little Acorns Safeguarding policy/ });
    const policy = (await dump(r.handle)).attachments![0]!;
    expect(org.getAttribute('href')).toMatch(new RegExp(`#/doc/${String(policy['id'])}$`));
    expect(org.getAttribute('target')).toBe('_blank');
    expect(org.getAttribute('rel')).toBe('noopener noreferrer');
    const official = linksIn(fb).filter((a) => a !== org);
    expect(official.length).toBeGreaterThan(0);
    for (const a of official) {
      expect(a.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(heading.compareDocumentPosition(org) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opening a Learn more link records exactly one learnMoreOpened event and changes nothing else', async () => {
    const user = userEvent.setup();
    const unblock = blockNavigation();
    const r = await renderRoute(`${base}/quiz`, 'staff', {
      prepare: withModule({ quiz: { mode: 'mcq', drawCount: 1 }, questionIds: ['q-dsl-role'] }),
    });
    await user.click(await screen.findByRole('button', { name: /Start quiz/ }));
    await screen.findByTestId('question-prompt');
    const q = await answerCurrent(user, false);
    const link = linksIn(feedbackRegion()).find((a) => a.getAttribute('href') === q.learnMore[0]!.url);
    if (!link) throw new Error('official link not shown');
    const before = await dump(r.handle);
    await user.click(link);
    await waitFor(async () => {
      expect((await events(r.handle, 'learnMoreOpened')).length).toBe(1);
    });
    unblock();
    const after = await dump(r.handle);
    const opened = after.learningEvents!.filter((e) => e['type'] === 'learnMoreOpened' && isJadeSg(after, e));
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ linkId: q.learnMore[0]!.id, questionId: q.id, moduleId: sgModule.id });
    expect(after.learningEvents!.length).toBe(before.learningEvents!.length + 1);
    for (const store of Object.keys(before)) {
      if (store === 'learningEvents') continue;
      expect(JSON.stringify(after[store])).toBe(JSON.stringify(before[store]));
    }
  });

  it('walks a two-step scenario: step feedback and outcome word, Continue, then the question feedback', async () => {
    const user = userEvent.setup();
    const r = await renderRoute(`${base}/quiz`, 'staff', {
      prepare: withModule({ quiz: { mode: 'scenario', drawCount: 1 }, questionIds: ['q-sc-tired-child'] }),
    });
    await user.click(await screen.findByRole('button', { name: /Start quiz/ }));
    await screen.findByTestId('question-prompt');
    const q = currentQuestion();
    const [s1, s2] = q.scenario!.steps;
    const poor = s1!.choices.find((c) => c.outcome === 'poor')!;
    await user.click(screen.getByRole('radio', { name: (n) => n.includes(poor.text) }));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText(poor.feedback)).toBeTruthy();
    expect(screen.getByText('Not the best choice')).toBeTruthy();
    expect(screen.queryByText('Not quite')).toBeNull();
    expect((await events(r.handle, 'questionAnswered')).length).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(s2!.text)).toBeTruthy();
    const best = s2!.choices.find((c) => c.outcome === 'best')!;
    await user.click(screen.getByRole('radio', { name: (n) => n.includes(best.text) }));
    await user.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText(best.feedback)).toBeTruthy();
    expect(screen.getByText('Best choice')).toBeTruthy();
    const fb = feedbackRegion();
    expect(within(fb).getByText('Not quite')).toBeTruthy();
    expect(within(fb).getByText(q.explanation)).toBeTruthy();
    // The seed adds organisation links only to q-dsl-role and q-wb-outside, so this scenario shows its own links.
    expect(linksIn(fb).length).toBe(q.learnMore.length);
    const answered = await events(r.handle, 'questionAnswered');
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({ correct: false, scenarioOutcome: 'poor' });
  });

  it('resumes an unfinished attempt at the first unanswered question without drawing again', async () => {
    const user = userEvent.setup();
    const r = await renderRoute(`${base}/quiz`, 'staff', {
      prepare: async (ctx) => {
        await ready(ctx);
        const actor = actorFor('staff', ctx.keys);
        const attempt = await ctx.handle.store.learning.startAttempt(actor, sgModule.id);
        const q = sgModule.questions.find((x) => x.id === attempt.questionIds[0])!;
        if (q.type === 'scenario') {
          await ctx.handle.store.learning.answer(actor, {
            attemptId: attempt.id,
            questionId: q.id,
            choiceIds: scenarioIds(q),
          });
        } else {
          await ctx.handle.store.learning.answer(actor, {
            attemptId: attempt.id,
            questionId: q.id,
            optionId: q.options!.find((o) => o.correct)!.id,
          });
        }
      },
    });
    await user.click(await screen.findByRole('button', { name: /(Start|Resume) quiz/ }));
    expect(await screen.findByText('Question 2 of 10')).toBeTruthy();
    expect(await jadeAttempts(r.handle)).toHaveLength(1);
  });

  it('BP-1: answering every question and finishing passes, writes Evidence for the Safeguarding requirement and closes the assignment', async () => {
    const user = userEvent.setup();
    const r = await renderRoute(`${base}/quiz`, 'staff', { prepare: ready });
    const jadePersonId = (await dump(r.handle)).users!.find((u) => u['id'] === r.keys.users['jade'])![
      'personId'
    ] as string;
    const jadePerson = (await dump(r.handle)).people!.find((p) => p['id'] === jadePersonId)!;
    const evBefore = (await dump(r.handle)).evidence!.length;
    await user.click(await screen.findByRole('button', { name: /Start quiz/ }));
    for (let i = 0; i < 10; i++) {
      await screen.findByText(`Question ${i + 1} of 10`);
      await answerCurrent(user, true);
      await user.click(await nextButton());
    }
    await waitFor(() => {
      expect(r.router.state.location.pathname).toBe(`${base}/done`);
    });
    const d = await dump(r.handle);
    const fresh = d.evidence!.filter(
      (e) => e['personId'] === jadePersonId && e['completedAt'] === '2026-10-19T09:00:00.000Z',
    );
    expect(d.evidence!.length).toBe(evBefore + fresh.length);
    expect(fresh.length).toBeGreaterThanOrEqual(1);
    for (const e of fresh) {
      expect(e).toMatchObject({
        kind: 'module',
        moduleId: sgModule.id,
        moduleVersion: sgModule.version,
        siteIdAtTime: jadePerson['primarySiteId'],
        expiresAt: '2028-10-19T09:00:00.000Z',
      });
    }
    const assignments = d.assignments!.filter((a) => a['personId'] === jadePersonId);
    expect(assignments.length).toBeGreaterThan(0);
    expect(assignments.every((a) => a['status'] === 'done')).toBe(true);
    expect((await events(r.handle, 'moduleCompleted')).length).toBe(1);
  });
});

function scenarioIds(q: (typeof sgModule.questions)[number]): string[] {
  const steps = q.scenario!.steps;
  const ids: string[] = [];
  let step: (typeof steps)[number] | undefined = steps[0];
  while (step) {
    const c = step.choices.find((x) => x.outcome === 'best') ?? step.choices[0]!;
    ids.push(c.id);
    step = c.next ? steps.find((s) => s.id === c.next) : undefined;
  }
  return ids;
}

describe('S7 results', () => {
  it('a perfect pass says You passed with 100%, links to the certificate and lists nothing missed', async () => {
    await renderRoute(`${base}/done`, 'staff', {
      prepare: async (ctx) => {
        await ready(ctx);
        await finishViaStore(ctx.handle, actorFor('staff', ctx.keys), 0);
      },
    });
    expect(await screen.findByText(/You passed/)).toBeTruthy();
    expect(screen.getByText(/100%/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /View certificate/ }).getAttribute('href')).toMatch(/\/certificate$/);
    expect(screen.queryByText('Review what you missed')).toBeNull();
    expect(screen.queryByRole('button', { name: /Retake/ })).toBeNull();
  });

  it('a pass with one miss lists that question with its explanation and every Learn more link', async () => {
    let missedId = '';
    await renderRoute(`${base}/done`, 'staff', {
      prepare: async (ctx) => {
        await ready(ctx);
        const res = await finishViaStore(ctx.handle, actorFor('staff', ctx.keys), 1);
        missedId = res.missed[0]!;
      },
    });
    expect(await screen.findByText(/You passed/)).toBeTruthy();
    expect(screen.getByText(/90%/)).toBeTruthy();
    const review = screen.getByRole('region', { name: 'Review what you missed' });
    const q = sgModule.questions.find((x) => x.id === missedId)!;
    expect(within(review).getAllByRole('listitem').length).toBeGreaterThanOrEqual(1);
    expect(within(review).getByText(q.prompt)).toBeTruthy();
    expect(within(review).getByText(q.explanation)).toBeTruthy();
    for (const l of q.learnMore) {
      const a = within(review).getByRole('link', {
        name: new RegExp(`Learn more: ${l.title.replace(/[()]/g, '\\$&')}`),
      });
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('a fail says Not passed this time, lists every missed question, and Retake the quiz starts a new attempt', async () => {
    const user = userEvent.setup();
    const r = await renderRoute(`${base}/done`, 'staff', {
      prepare: async (ctx) => {
        await ready(ctx);
        await finishViaStore(ctx.handle, actorFor('staff', ctx.keys), 'all');
      },
    });
    expect(await screen.findByText(/Not passed this time/)).toBeTruthy();
    expect(screen.getByText(/0%/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /View certificate/ })).toBeNull();
    const review = screen.getByRole('region', { name: 'Review what you missed' });
    expect(within(review).getAllByRole('listitem').length).toBeGreaterThanOrEqual(10);
    await user.click(screen.getByRole('button', { name: /Retake the quiz/ }));
    await waitFor(() => {
      expect(r.router.state.location.pathname).toBe(`${base}/quiz`);
    });
    expect(await jadeAttempts(r.handle)).toHaveLength(2);
    const fresh = (await dump(r.handle)).evidence!.filter((e) => e['completedAt'] === '2026-10-19T09:00:00.000Z');
    expect(fresh).toHaveLength(0);
  });
});

describe('certificate', () => {
  it('shows the name, module, version, London date and client, and Print calls window.print', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    let siteName = '';
    await renderRoute(`${base}/certificate`, 'staff', {
      prepare: async (ctx) => {
        await ready(ctx);
        const d = await dump(ctx.handle);
        const personId = d.users!.find((u) => u['id'] === ctx.keys.users['jade'])!['personId'];
        const siteId = d.people!.find((p) => p['id'] === personId)!['primarySiteId'];
        siteName = String(d.sites!.find((x) => x['id'] === siteId)!['name']);
        await finishViaStore(ctx.handle, actorFor('staff', ctx.keys), 0);
      },
    });
    expect(await screen.findByText('Certificate of completion')).toBeTruthy();
    expect(screen.getByText(/Jade/)).toBeTruthy();
    expect(screen.getByText(sgModule.title)).toBeTruthy();
    expect(screen.getByText(/Version 1/)).toBeTruthy();
    expect(screen.getByText(/19 October 2026/)).toBeTruthy();
    expect(screen.getByText(/Little Acorns/)).toBeTruthy();
    expect(screen.getByText(new RegExp(siteName))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Print or save as PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('does not show a certificate for a module that does not exist', async () => {
    await renderRoute('/staff/module/01M0DDDDDDDDDDDDDDDDDDDDDD/certificate', 'staff');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Certificate of completion')).toBeNull();
  });
});

describe('organisation document page', () => {
  const policyId = async () => {
    const { handle } = await seededStore();
    return String((await dump(handle)).attachments![0]!['id']);
  };

  it('renders the Little Acorns policy as Markdown for a same-client person, outside the shell navigation', async () => {
    await renderRoute(`/doc/${await policyId()}`, 'staff');
    expect(await screen.findByRole('heading', { level: 1, name: 'Little Acorns Safeguarding policy' })).toBeTruthy();
    expect(screen.getByText(/Section 2: Who to tell/)).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows an alert and none of the text for an unknown id', async () => {
    await renderRoute('/doc/01M0CCCCCCCCCCCCCCCCCCCCCC', 'staff');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Section 2: Who to tell/)).toBeNull();
  });

  it("refuses another client's document", async () => {
    const otherId = '01M0BBBBBBBBBBBBBBBBBBBBBB';
    await renderRoute(`/doc/${otherId}`, 'staff', {
      prepare: async ({ handle, keys }) => {
        const other = Object.entries(keys.clients).find(([k]) => k !== 'littleAcorns')?.[1];
        if (!other) throw new Error('no second client in the seed');
        await handle.admin.bulkPut('attachments', [
          {
            id: otherId,
            clientId: other,
            title: 'Other secret policy',
            mime: 'text/markdown',
            body: 'Hidden words',
            createdAt: '2026-10-01T09:00:00.000Z',
          },
        ]);
      },
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Hidden words')).toBeNull();
    expect(screen.queryByText('Other secret policy')).toBeNull();
  });
});

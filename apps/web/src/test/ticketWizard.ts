// Test helper for S15 / C23 raise-a-ticket tests (M3 chunk 20a). Not part of the app. It walks the steps in brief 25.3
// using the accessible names the UI CONTRACT in helpStaff.test.tsx fixes. Each step is an h2 and one step shows at a time.
import { fireEvent, screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

export const step = (name: string) => screen.findByRole('heading', { level: 2, name });
export const next = (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Next' }));

export type TicketAnswers = {
  feature?: string;
  /** Typed into the "A few words" box after choosing Other. */
  featureOther?: string;
  issue?: string;
  impact?: string;
  title: string;
  description: string;
};

/** Goes from the Check Help first step to the details step, answering each step on the way. */
export async function answerUpToDetails(user: UserEvent, a: TicketAnswers): Promise<void> {
  await step('Check Help first');
  await next(user);
  await step('Which part of the app?');
  await user.click(screen.getByRole('radio', { name: a.feature ?? 'Notes' }));
  if (a.featureOther !== undefined) await user.type(screen.getByPlaceholderText('A few words'), a.featureOther);
  await next(user);
  await step('What kind of problem?');
  await user.click(screen.getByRole('radio', { name: a.issue ?? "Something isn't working" }));
  await next(user);
  await step('How much does this affect you?');
  await user.click(screen.getByRole('radio', { name: a.impact ?? 'Just a question' }));
  await next(user);
  await step('Tell us what happened');
}

export async function fillDetails(user: UserEvent, a: Pick<TicketAnswers, 'title' | 'description'>): Promise<void> {
  const title = screen.getByRole('textbox', { name: 'Title' });
  await user.clear(title);
  if (a.title) await user.type(title, a.title);
  const what = screen.getByRole('textbox', { name: 'What happened?' });
  await user.clear(what);
  if (a.description) await user.type(what, a.description);
}

/** Goes all the way to the Check and send step. */
export async function answerUpToReview(user: UserEvent, a: TicketAnswers, screenshots?: () => Promise<void>) {
  await answerUpToDetails(user, a);
  await fillDetails(user, a);
  await next(user);
  await step('Add screenshots (optional)');
  if (screenshots) await screenshots();
  await next(user);
  await step('Check and send');
}

export function screenshotInput(): HTMLInputElement {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const plain = all.find((i) => !i.hasAttribute('capture'));
  if (!plain) throw new Error('no screenshot input');
  return plain;
}
export const addScreenshot = (name = 'screen.png', type = 'image/png') => {
  fireEvent.change(screenshotInput(), {
    target: { files: [new File([new Uint8Array([1, 2, 3])], name, { type })] },
  });
};

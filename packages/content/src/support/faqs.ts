// FAQs for the staff app and the client admin app (brief 19.2). Text lives in en-GB.json under faq.staff.<id> and
// faq.client.<id> (question and answer); categories under faq.categories. Answers are plain text.
export interface Faq {
  id: string;
  audience: 'staff' | 'client';
  categoryKey: string;
  questionKey: string;
  answerKey: string;
}

const faq = (audience: 'staff' | 'client', id: string, category: string): Faq => ({
  id: `${audience}-${id}`,
  audience,
  categoryKey: `faq.categories.${category}`,
  questionKey: `faq.${audience}.${id}.question`,
  answerKey: `faq.${audience}.${id}.answer`,
});

export const faqs: Faq[] = [
  faq('staff', 'mustDo', 'training'),
  faq('staff', 'renewals', 'training'),
  faq('staff', 'xp', 'progress'),
  faq('staff', 'notes', 'learning'),
  faq('staff', 'closedBook', 'learning'),
  faq('staff', 'leaderboards', 'progress'),
  faq('staff', 'textSize', 'settings'),
  faq('staff', 'cannotLogIn', 'signIn'),
  faq('staff', 'upload', 'training'),
  faq('staff', 'reportMistake', 'learning'),
  faq('client', 'inviteStaff', 'people'),
  faq('client', 'publishModule', 'content'),
  faq('client', 'categories', 'content'),
  faq('client', 'autoAssign', 'people'),
  faq('client', 'competitions', 'engagement'),
  faq('client', 'themes', 'settings'),
  faq('client', 'sitesRoles', 'people'),
  faq('client', 'inspectorExport', 'reports'),
  faq('client', 'billing', 'account'),
  faq('client', 'twoStep', 'signIn'),
];

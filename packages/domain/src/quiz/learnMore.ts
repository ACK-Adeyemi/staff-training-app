// Which Learn more links show, and how they are labelled. Brief section 31.1; plan Assumptions 8 and 9.
import { isSafeHttpsUrl } from '../schemas/learning';
import type { ClientLinkOverlay, LearnMoreLink, Question, QuizSettings } from '../schemas/learning';

export interface VisibleLearnMoreInput {
  question: Question;
  overlays: readonly ClientLinkOverlay[];
  correct: boolean;
  settings: QuizSettings;
  phase: 'feedback' | 'results';
  attemptMode: 'open' | 'closed';
}

export const visibleLearnMore = (
  input: VisibleLearnMoreInput,
): { official: LearnMoreLink[]; organisation: LearnMoreLink[] } => {
  const { question, overlays, correct, settings, phase, attemptMode } = input;
  const none = { official: [], organisation: [] };
  // Closed book: nothing until results, and results show links only for missed questions.
  if (attemptMode === 'closed' && phase === 'feedback') return none;
  if (phase === 'results' && correct) return none;
  const allowed = (l: LearnMoreLink): boolean => !correct || (settings.learnMoreFor === 'all' && l.showFor === 'all');
  return {
    official: question.learnMore.filter(allowed),
    organisation: overlays
      .filter((o) => o.questionId === question.id)
      .flatMap((o) => o.links)
      .filter(allowed),
  };
};

export { isSafeHttpsUrl };

const TWO_PART_SUFFIXES = ['org.uk', 'co.uk', 'ac.uk', 'nhs.uk'];

/** The website name shown beside a link, for example gov.uk or nspcc.org.uk. */
export const displayDomain = (url: string): string => {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'gov.uk' || host.endsWith('.gov.uk')) return 'gov.uk';
  const labels = host.split('.');
  const keep = TWO_PART_SUFFIXES.some((s) => host.endsWith(`.${s}`)) ? 3 : 2;
  return labels.slice(-keep).join('.');
};

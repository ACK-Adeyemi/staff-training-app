import type { MessageKey } from '../i18n';

/** One checkpoint of a guided tour (build pack 8.4). */
export type TourStep = {
  id: string;
  captionKey: MessageKey;
  /** First name of a seeded person, or 'Provider' for the provider side (no person to switch to). */
  persona: string;
  /** App path without the hash, for example '/client/calendar'. */
  route: string;
  /** Value of a `data-tour` attribute on a page element to highlight. */
  target?: string;
};

export type Tour = {
  id: string;
  steps: TourStep[];
  /** Language keys for the Try this next list shown after the last step. */
  tryNext: MessageKey[];
};

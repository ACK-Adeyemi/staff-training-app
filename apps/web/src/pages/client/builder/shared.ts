import type { LearnMoreLink } from '@sta/domain';
import { focusLink } from '../../staff/styles';
import type { Form } from './builderForm';
import type { NewLink, PanelLink } from './LinkPanel';

export const labelClass = 'flex flex-col gap-1 font-semibold';
export const groupClass = 'm-0 min-w-0 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3';
export const cardClass =
  'rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3';
export const checkLabel = `flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 ${focusLink}`;
export const checkBox = 'h-5 w-5 shrink-0 accent-[var(--color-accent)]';

export type Update = (change: (f: Form) => Form) => void;

/** How the own-module panels read and change the links held in the form. */
export type OwnLinks = {
  of: (links: LearnMoreLink[] | undefined) => PanelLink[];
  add: (kind: 'lesson' | 'question', targetId: string, link: NewLink) => void;
  remove: (kind: 'lesson' | 'question', targetId: string, linkId: string) => void;
};

export type AiCheck = {
  /** Marks one AI-drafted item as checked by this person (saves the draft first). */
  mark: (kind: 'lesson' | 'question', id: string) => void;
  busy: boolean;
};

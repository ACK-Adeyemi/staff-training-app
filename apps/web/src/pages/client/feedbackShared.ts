// Shared by the module feedback inbox (C29) and the feedback region of the module results page (C8).
import { useQuery } from '@tanstack/react-query';
import { feedbackTags, type MessageKey } from '@sta/content';
import { orderFeedback, type Module, type ModuleFeedback, type Person } from '@sta/domain';
import { useActor, useStore } from '../../app/hooks';

export const FEEDBACK_STATUSES = [
  { id: 'new', key: 'feedback.status.new' },
  { id: 'reviewed', key: 'feedback.status.reviewed' },
  { id: 'actioned', key: 'feedback.status.actioned' },
  { id: 'noAction', key: 'feedback.status.noAction' },
] as const satisfies readonly { id: ModuleFeedback['status']; key: MessageKey }[];

export const statusKey = (status: ModuleFeedback['status']): MessageKey =>
  FEEDBACK_STATUSES.find((s) => s.id === status)?.key ?? 'feedback.status.new';

export const tagKey = (id: string): MessageKey | undefined =>
  feedbackTags.find((x) => x.id === id)?.labelKey as MessageKey | undefined;

export const fieldClass =
  'min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]';

export type FeedbackData = { items: ModuleFeedback[]; people: Person[]; modules: Module[] };

/** The client's module feedback, with the people and modules needed to show it. Optional reads fall back to empty. */
export function useFeedbackData(moduleId?: string) {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['moduleFeedback', actor.userId, moduleId ?? 'all'],
    queryFn: async (): Promise<FeedbackData> => {
      const [items, people, modules] = await Promise.all([
        store.moduleFeedback.list(actor, moduleId === undefined ? undefined : { moduleId }),
        store.people.list(actor).catch((): Person[] => []),
        store.modules.list(actor).catch((): Module[] => []),
      ]);
      return { items: orderFeedback(items), people, modules };
    },
  });
}

// Module feedback: summary, the provider projection and the reply rule. Brief 19.1; M3 plan assumption 18.
// The provider never receives who said what: people, sites, replies and escalation notes are stripped.
import type { Module } from '../schemas/learning';
import type { ModuleFeedback } from '../schemas/support';

export type FeedbackSummary = {
  count: number;
  averageRating: number | null;
  tagCounts: Record<string, number>;
  thumbsUp: number;
  thumbsDown: number;
  questionReports: number;
};

const averageOf = (items: readonly ModuleFeedback[]): number | null => {
  const ratings = items.filter((f) => f.kind === 'moduleCard' && f.rating !== undefined).map((f) => f.rating ?? 0);
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((n, r) => n + r, 0) / ratings.length) * 10) / 10;
};

export function feedbackSummary(items: readonly ModuleFeedback[]): FeedbackSummary {
  const tagCounts: Record<string, number> = {};
  for (const f of items) for (const tag of f.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  return {
    count: items.length,
    averageRating: averageOf(items),
    tagCounts,
    thumbsUp: items.filter((f) => f.kind === 'lessonThumb' && f.thumb === 'up').length,
    thumbsDown: items.filter((f) => f.kind === 'lessonThumb' && f.thumb === 'down').length,
    questionReports: items.filter((f) => f.kind === 'questionReport').length,
  };
}

export type ProviderFeedbackItem = {
  id: string;
  moduleVersion: number;
  kind: ModuleFeedback['kind'];
  lessonId?: string;
  questionId?: string;
  rating?: number;
  thumb?: 'up' | 'down';
  tags: string[];
  text?: string;
  status: ModuleFeedback['status'];
  createdAt: string;
};

export type ProviderFeedbackProjection = {
  modules: {
    moduleId: string;
    title: string;
    itemCount: number;
    averageRating: number | null;
    items: ProviderFeedbackItem[];
  }[];
  ownModules: { clientId: string; moduleCount: number; itemCount: number }[];
};

const project = (f: ModuleFeedback): ProviderFeedbackItem => ({
  id: f.id,
  moduleVersion: f.moduleVersion,
  kind: f.kind,
  ...(f.lessonId !== undefined ? { lessonId: f.lessonId } : {}),
  ...(f.questionId !== undefined ? { questionId: f.questionId } : {}),
  ...(f.rating !== undefined ? { rating: f.rating } : {}),
  ...(f.thumb !== undefined ? { thumb: f.thumb } : {}),
  tags: [...f.tags],
  ...(f.text !== undefined ? { text: f.text } : {}),
  status: f.status,
  createdAt: f.createdAt,
});

/** What the provider may see: provider-module feedback without people, and only counts for client-own modules. */
export function providerProjection(
  items: readonly ModuleFeedback[],
  modules: readonly Module[],
): ProviderFeedbackProjection {
  const byModule = new Map(modules.map((m) => [m.id, m]));
  const providerItems = new Map<string, ModuleFeedback[]>();
  const ownItemCount = new Map<string, number>();
  const ownModuleIds = new Map<string, Set<string>>();
  for (const f of items) {
    const m = byModule.get(f.moduleId);
    if (!m) continue;
    if (m.owner === 'provider') {
      providerItems.set(m.id, [...(providerItems.get(m.id) ?? []), f]);
    } else {
      const clientId = m.owner.clientId;
      ownItemCount.set(clientId, (ownItemCount.get(clientId) ?? 0) + 1);
      ownModuleIds.set(clientId, (ownModuleIds.get(clientId) ?? new Set()).add(m.id));
    }
  }
  const rank = (f: ModuleFeedback): number => (f.kind === 'questionReport' ? 0 : 1);
  return {
    modules: [...providerItems.entries()]
      .map(([moduleId, list]) => ({
        moduleId,
        title: byModule.get(moduleId)?.title ?? '',
        itemCount: list.length,
        averageRating: averageOf(list),
        items: [...list].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt)).map(project),
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    ownModules: [...ownItemCount.entries()]
      .map(([clientId, itemCount]) => ({
        clientId,
        moduleCount: ownModuleIds.get(clientId)?.size ?? 0,
        itemCount,
      }))
      .sort((a, b) => a.clientId.localeCompare(b.clientId)),
  };
}

/** Anonymous feedback cannot be replied to: there is nobody to reply to. */
export const canReplyToFeedback = (item: Pick<ModuleFeedback, 'anonymous'>): boolean => !item.anonymous;

/** The order managers read feedback in: question reports first, then newest first. */
export function orderFeedback<T extends Pick<ModuleFeedback, 'kind' | 'createdAt' | 'id'>>(items: readonly T[]): T[] {
  const rank = (f: T): number => (f.kind === 'questionReport' ? 0 : 1);
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}

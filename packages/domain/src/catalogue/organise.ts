// Organising categories and groups with buttons (brief 17.1; plan M2 assumption 26). Pure plans; the data layer applies them.
import type { ModulePlacement } from '../schemas/engagement';

export function reorder<T extends { id: string }>(items: readonly T[], id: string, direction: 'up' | 'down'): T[] {
  const out = [...items];
  const from = out.findIndex((i) => i.id === id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= out.length) return out;
  const moving = out[from] as T;
  out[from] = out[to] as T;
  out[to] = moving;
  return out;
}

export type CategoryPlan = { deleteCategoryId: string; updates: ModulePlacement[] };

export function planCategoryDelete(
  categoryId: string,
  moveToCategoryId: string | undefined,
  placements: readonly ModulePlacement[],
): CategoryPlan {
  if (moveToCategoryId === categoryId) throw new Error('Cannot move modules into the category being deleted');
  const updates = placements
    .filter((p) => p.categoryId === categoryId)
    .map((p): ModulePlacement => {
      const next: ModulePlacement = { ...p };
      if (moveToCategoryId === undefined) delete next.categoryId;
      else next.categoryId = moveToCategoryId;
      return next;
    });
  return { deleteCategoryId: categoryId, updates };
}

export function planMerge(sourceId: string, targetId: string, placements: readonly ModulePlacement[]): CategoryPlan {
  if (sourceId === targetId) throw new Error('Cannot merge a category into itself');
  return planCategoryDelete(sourceId, targetId, placements);
}

// Shared reads for categories, groups and placements (staff Learn and client Organise). Data layer only.
import { useQuery } from '@tanstack/react-query';
import type { Category, ModuleGroup, ModulePlacement } from '@sta/domain';
import { useActor, useStore } from '../../app/hooks';

/** The client's categories, in their saved order. */
export function useCategories() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['categories', actor.userId],
    queryFn: async (): Promise<Category[]> =>
      [...(await store.categories.list(actor))].sort((a, b) => a.order - b.order),
  });
}

/** The client's module groups. */
export function useGroups() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['moduleGroups', actor.userId],
    queryFn: (): Promise<ModuleGroup[]> => store.moduleGroups.list(actor),
  });
}

export function usePlacements() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['modulePlacements', actor.userId],
    queryFn: (): Promise<ModulePlacement[]> => store.modulePlacements.list(actor),
  });
}

/** Category colour name to its token key (--cat-1 to --cat-8). */
const COLOUR_ORDER = ['green', 'blue', 'amber', 'purple', 'rose', 'teal', 'slate', 'brown'];
export const catToken = (colour: string): string => `cat-${Math.max(0, COLOUR_ORDER.indexOf(colour)) + 1}`;

export const countKey = (n: number): 'one' | 'other' => (n === 1 ? 'one' : 'other');

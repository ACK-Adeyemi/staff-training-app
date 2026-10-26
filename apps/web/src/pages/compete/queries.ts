// Data loading for the competition screens (S10, C11 to C14, S2 banners). Everything goes through the data layer.
import { useQuery } from '@tanstack/react-query';
import type { BoardPeriodId } from '@sta/data';
import { londonDateString, type BoardId } from '@sta/domain';
import { useActor, useClock, useStore } from '../../app/hooks';

const useDay = (): string => londonDateString(useClock().now());

export function useCompetitions() {
  const store = useStore();
  const actor = useActor();
  const day = useDay();
  return useQuery({
    queryKey: ['competitions', actor.userId, day],
    queryFn: () => store.competitions.list(actor),
  });
}

export function useCompetition(id: string) {
  const store = useStore();
  const actor = useActor();
  const day = useDay();
  return useQuery({
    queryKey: ['competition', actor.userId, id, day],
    queryFn: () => store.competitions.get(actor, id),
    retry: false,
  });
}

export function useStandings(id: string, enabled = true) {
  const store = useStore();
  const actor = useActor();
  const day = useDay();
  return useQuery({
    queryKey: ['standings', actor.userId, id, day],
    queryFn: () => store.competitions.standings(actor, id),
    enabled,
  });
}

export function useStandingBoard(board: BoardId, period: BoardPeriodId) {
  const store = useStore();
  const actor = useActor();
  const day = useDay();
  return useQuery({
    queryKey: ['standingBoard', actor.userId, board, period, day],
    queryFn: () => store.leaderboards.standing(actor, { board, period }),
  });
}

export function useBoardSettings() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['boardSettings', actor.userId],
    queryFn: () => store.leaderboards.settings(actor),
  });
}

export function useEntitlements() {
  const store = useStore();
  const actor = useActor();
  return useQuery({
    queryKey: ['competitionEntitlements', actor.userId],
    queryFn: () => store.competitions.entitlements(actor),
  });
}

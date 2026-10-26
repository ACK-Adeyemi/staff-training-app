// The prize suggestion walk (plan M2 assumption 18, brief 13.3).
// A shuffled pass through the list; at the end it reshuffles so the new first is never the old last.
import type { Rng } from './rng';

export type PrizeWalk = { order: readonly string[]; next: number };

const sameItems = (order: readonly string[], list: readonly string[]): boolean =>
  order.length === list.length && order.every((t) => list.includes(t));

export function nextSuggestion(
  list: readonly string[],
  state: PrizeWalk | undefined,
  rng: Rng,
): { text: string; state: PrizeWalk } {
  if (list.length === 0) throw new Error('There are no prize suggestions');
  let walk = state !== undefined && sameItems(state.order, list) ? state : undefined;
  if (walk === undefined || walk.next >= walk.order.length) {
    const last = walk?.order[walk.order.length - 1];
    let order = rng.shuffle(list);
    if (last !== undefined && order.length > 1 && order[0] === last) {
      const j = rng.int(1, order.length - 1);
      [order[0], order[j]] = [order[j] as string, order[0]];
      order = [...order];
    }
    walk = { order, next: 0 };
  }
  return { text: walk.order[walk.next] as string, state: { order: walk.order, next: walk.next + 1 } };
}

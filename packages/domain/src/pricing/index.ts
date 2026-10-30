// Provider price engine (brief 23.11). Pure: money is integer pence, times are ISO strings passed in.
import type { PriceAdjustment } from '../schemas/m4';

export const DEFAULT_NOTICE_DAYS = 30;
const DAY_MS = 86_400_000;
const INCREASE_WARNING_PERCENT = 20;

type Scope = PriceAdjustment['scope'];

const ms = (iso: string): number => new Date(iso).getTime();

const sameScope = (a: Scope, b: Scope): boolean =>
  a.kind === b.kind && (a.kind !== 'addOn' || (b.kind === 'addOn' && a.addOnId === b.addOnId));

/** Confirmation date plus the notice period, in whole days. */
export function effectiveDateFor(confirmedAt: string, noticeDays: number): string {
  return new Date(ms(confirmedAt) + noticeDays * DAY_MS).toISOString();
}

const inForce = (a: PriceAdjustment, at: string): boolean =>
  (a.status === 'scheduled' || a.status === 'active') &&
  a.effectiveAt !== undefined &&
  ms(a.effectiveAt) <= ms(at) &&
  (a.endsAt === undefined || ms(a.endsAt) > ms(at));

/** The newest change of one type that applies at the time (at most one should exist). */
function pick(
  list: PriceAdjustment[],
  type: PriceAdjustment['type'],
  scope: Scope,
  at: string,
): PriceAdjustment | undefined {
  return list
    .filter((a) => a.type === type && sameScope(a.scope, scope) && inForce(a, at))
    .sort((x, y) => ms(y.effectiveAt ?? at) - ms(x.effectiveAt ?? at))[0];
}

/** List price, then any override, then any percentage; never below zero; rounded to the penny. */
export function priceFor(input: {
  listPrice: number;
  scope: Scope;
  adjustments: PriceAdjustment[];
  at: string;
}): number {
  const { listPrice, scope, adjustments, at } = input;
  let price = listPrice;
  const override = pick(adjustments, 'override', scope, at);
  if (override) price = override.value;
  const percent = pick(adjustments, 'percent', scope, at);
  if (percent) price = (price * (100 + percent.value)) / 100;
  return Math.max(0, Math.round(price));
}

const need = (ok: boolean, message: string): void => {
  if (!ok) throw new Error(message);
};

export function submitAdjustment(a: PriceAdjustment): PriceAdjustment {
  need(a.status === 'draft', 'Only a draft can be submitted');
  return { ...a, status: 'submitted' };
}

export function confirmAdjustment(
  a: PriceAdjustment,
  input: { confirmerId: string; confirmedAt: string },
): PriceAdjustment {
  need(a.status === 'submitted', 'Only a submitted change can be confirmed');
  need(input.confirmerId.trim() !== '', 'A confirmer is needed');
  const effectiveAt = effectiveDateFor(input.confirmedAt, a.noticeDays);
  need(a.endsAt === undefined || ms(a.endsAt) > ms(effectiveAt), 'The end date must be after the effective date');
  return {
    ...a,
    status: a.noticeDays === 0 ? 'active' : 'scheduled',
    confirmedBy: input.confirmerId,
    confirmedAt: input.confirmedAt,
    effectiveAt,
  };
}

export function cancelAdjustment(a: PriceAdjustment): PriceAdjustment {
  need(['draft', 'submitted', 'scheduled'].includes(a.status), 'This change can no longer be cancelled');
  return { ...a, status: 'cancelled' };
}

/** Active or scheduled changes the incoming one would replace: same client, scope item and type. */
export function replacedBy(existing: PriceAdjustment[], incoming: PriceAdjustment): PriceAdjustment[] {
  return existing.filter(
    (e) =>
      e.id !== incoming.id &&
      (e.status === 'active' || e.status === 'scheduled') &&
      e.type === incoming.type &&
      sameScope(e.scope, incoming.scope) &&
      e.clientIds.some((c) => incoming.clientIds.includes(c)),
  );
}

/**
 * What confirming `incoming` (already given its effective date) does to the changes it replaces. The old change keeps
 * applying until the new one starts, so there is no gap during the notice period: it is ended at that moment (or
 * never applies, if it would have started later). Where it also covers clients the new change does not, those
 * clients stay on it and a copy (with a new id) carries the overlapping clients up to the switch.
 */
export function supersede(
  existing: PriceAdjustment[],
  incoming: PriceAdjustment,
  newId: () => string,
): { updates: PriceAdjustment[]; replacedIds: string[] } {
  const start = incoming.effectiveAt;
  const updates: PriceAdjustment[] = [];
  const replacedIds: string[] = [];
  if (start === undefined) return { updates, replacedIds };
  for (const e of replacedBy(existing, incoming)) {
    // Already ending on or before the switch: nothing to change.
    if (e.endsAt !== undefined && ms(e.endsAt) <= ms(start)) continue;
    replacedIds.push(e.id);
    const never = e.effectiveAt === undefined || ms(e.effectiveAt) >= ms(start);
    const cut = (x: PriceAdjustment): PriceAdjustment => (never ? { ...x, status: 'ended' } : { ...x, endsAt: start });
    const overlap = e.clientIds.filter((c) => incoming.clientIds.includes(c));
    const rest = e.clientIds.filter((c) => !incoming.clientIds.includes(c));
    if (rest.length === 0) {
      updates.push(cut(e));
    } else {
      updates.push({ ...e, clientIds: rest });
      updates.push(cut({ ...e, id: newId(), clientIds: overlap }));
    }
  }
  return { updates, replacedIds };
}

export type PreviewWarning = 'increaseOver20' | 'belowFloor';

export interface PreviewRow {
  clientId: string;
  currentPrice: number;
  newPrice: number;
  monthlyEffect: number;
  effectiveAt: string;
}

export function previewAdjustment(input: {
  clients: { clientId: string; listPrice: number }[];
  adjustment: PriceAdjustment;
  at: string;
  existing?: PriceAdjustment[];
  floorPence?: number;
}): { rows: PreviewRow[]; warnings: PreviewWarning[] } {
  const { clients, adjustment, at, floorPence } = input;
  const existing = input.existing ?? [];
  const effectiveAt = effectiveDateFor(at, adjustment.noticeDays);
  const replaced = new Set(replacedBy(existing, adjustment).map((e) => e.id));
  const kept = existing.filter((e) => !replaced.has(e.id));
  const incoming: PriceAdjustment = { ...adjustment, status: 'active', effectiveAt, endsAt: adjustment.endsAt };
  const rows = clients.map((c) => {
    const currentPrice = priceFor({ listPrice: c.listPrice, scope: adjustment.scope, adjustments: existing, at });
    const newPrice = priceFor({
      listPrice: c.listPrice,
      scope: adjustment.scope,
      adjustments: [...kept, incoming],
      at: effectiveAt,
    });
    return { clientId: c.clientId, currentPrice, newPrice, monthlyEffect: newPrice - currentPrice, effectiveAt };
  });
  const warnings: PreviewWarning[] = [];
  const jump = (r: PreviewRow): boolean =>
    r.currentPrice > 0 && ((r.newPrice - r.currentPrice) * 100) / r.currentPrice > INCREASE_WARNING_PERCENT;
  if ((adjustment.type === 'percent' && adjustment.value > INCREASE_WARNING_PERCENT) || rows.some(jump))
    warnings.push('increaseOver20');
  if (floorPence !== undefined && rows.some((r) => r.newPrice < floorPence)) warnings.push('belowFloor');
  return { rows, warnings };
}

export interface InvoiceLine {
  amount: number;
  /** Set on the list price line. */
  label?: string;
  /** Set on the separate adjustment line. Codes only: the screen words them from the language file. */
  adjustment?: {
    reason: PriceAdjustment['reason'];
    direction: 'discount' | 'increase';
    type: PriceAdjustment['type'];
    value: number;
  };
}

/** The list price line, plus one separate adjustment line when a change applies. */
export function invoiceLinesFor(input: {
  listPrice: number;
  adjustments: PriceAdjustment[];
  at: string;
  label: string;
  scope?: Scope;
}): InvoiceLine[] {
  const scope: Scope = input.scope ?? { kind: 'plan' };
  const lines: InvoiceLine[] = [{ label: input.label, amount: input.listPrice }];
  const net = priceFor({ listPrice: input.listPrice, scope, adjustments: input.adjustments, at: input.at });
  const main =
    pick(input.adjustments, 'percent', scope, input.at) ?? pick(input.adjustments, 'override', scope, input.at);
  if (!main || net === input.listPrice) return lines;
  lines.push({
    amount: net - input.listPrice,
    adjustment: {
      reason: main.reason,
      direction: net < input.listPrice ? 'discount' : 'increase',
      type: main.type,
      value: main.value,
    },
  });
  return lines;
}

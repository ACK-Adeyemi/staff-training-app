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
  return {
    ...a,
    status: a.noticeDays === 0 ? 'active' : 'scheduled',
    confirmedBy: input.confirmerId,
    confirmedAt: input.confirmedAt,
    effectiveAt: effectiveDateFor(input.confirmedAt, a.noticeDays),
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
  if (adjustment.type === 'percent' && adjustment.value > INCREASE_WARNING_PERCENT) warnings.push('increaseOver20');
  if (floorPence !== undefined && rows.some((r) => r.newPrice < floorPence)) warnings.push('belowFloor');
  return { rows, warnings };
}

const REASON_LABELS: Record<PriceAdjustment['reason'], string> = {
  loyalty: 'Loyalty',
  retention: 'Retention',
  introductory: 'Introductory offer',
  annualReview: 'Annual review',
  correction: 'Correction',
  other: 'Price change',
};

export interface InvoiceLine {
  label: string;
  amount: number;
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
  const percent = pick(input.adjustments, 'percent', scope, input.at);
  const override = pick(input.adjustments, 'override', scope, input.at);
  const main = percent ?? override;
  if (!main || net === input.listPrice) return lines;
  const reason = REASON_LABELS[main.reason];
  let detail: string;
  if (percent) {
    const size = Math.abs(percent.value);
    detail = `${percent.value < 0 ? 'minus' : 'plus'} ${size} per cent`;
  } else {
    detail = 'fixed price';
  }
  const word = net < input.listPrice ? 'discount' : 'increase';
  lines.push({ label: `${reason} ${word}, ${detail}`, amount: net - input.listPrice });
  return lines;
}

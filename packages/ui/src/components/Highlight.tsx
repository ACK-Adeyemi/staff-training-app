import { Fragment } from 'react';

export interface HighlightRange {
  start: number;
  end: number;
}
export interface HighlightProps {
  text: string;
  ranges: HighlightRange[];
}

/** Wraps match ranges in <mark>. Invalid, out of range and overlapping ranges are skipped; text is never lost. */
export function Highlight({ text, ranges }: HighlightProps) {
  const sorted = [...ranges]
    .filter(
      (r) =>
        Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end > r.start && r.end <= text.length,
    )
    .sort((a, b) => a.start - b.start);
  const parts: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const r of sorted) {
    if (r.start < at) continue;
    if (r.start > at) parts.push({ text: text.slice(at, r.start), mark: false });
    parts.push({ text: text.slice(r.start, r.end), mark: true });
    at = r.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return (
    <>
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className="rounded-sm bg-[var(--color-accent)] px-0.5 font-bold text-[var(--color-on-accent)]">
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

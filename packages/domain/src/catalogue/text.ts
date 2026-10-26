// Plain-text matching shared by module search and note search. Substring only; a query is never a pattern.

const MARKS = /\p{M}/gu;

/** Lower-case and strip accents, one output unit per input unit so match offsets still point into the original. */
export function fold(text: string): string {
  let out = '';
  for (const ch of text) {
    const folded = ch.normalize('NFD').replace(MARKS, '').toLowerCase();
    out += folded.length === ch.length ? folded : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch;
  }
  return out;
}

export const searchTerms = (query: string): string[] =>
  fold(query)
    .split(/\s+/u)
    .filter((t) => t.length > 0);

/** Every start/end range where `term` occurs in `foldedText`. */
export function findRanges(foldedText: string, term: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  if (term.length === 0) return ranges;
  let from = 0;
  for (;;) {
    const at = foldedText.indexOf(term, from);
    if (at < 0) return ranges;
    ranges.push({ start: at, end: at + term.length });
    from = at + term.length;
  }
}

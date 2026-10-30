// The canned "Demo AI" answer and the usage-cap rule (M3 assumption 42 and 44). Pure: no network, no real AI.
import type { Rng } from './rng';
import type { Lesson, Module, Question } from './schemas/learning';

/** First sentence of a markdown paragraph, with heading and emphasis marks removed. */
function firstSentence(markdown: string): string {
  const plain = markdown
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const end = /[.!?](\s|$)/.exec(plain);
  return end ? plain.slice(0, end.index + 1) : plain;
}

/**
 * Simpler words for a lesson, built only from the lesson itself: its key points, or the first sentence of each text
 * block when it has none. Returns one point per line.
 */
export function explainLesson(lesson: Pick<Lesson, 'blocks'>): string {
  const points = lesson.blocks.flatMap((b) => (b.kind === 'keyPoints' ? b.items : []));
  const lines =
    points.length > 0 ? points : lesson.blocks.flatMap((b) => (b.kind === 'text' ? [firstSentence(b.markdown)] : []));
  return lines
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .join('\n');
}

/**
 * Usage pricing: units beyond `includedUnits` cost `pricePerUnit`. True when one more unit would take the spend above
 * the cap. No cap means no limit.
 */
export function usageCapReached(
  usageThisPeriod: number,
  pricing: { includedUnits: number; pricePerUnit: number },
  capPence: number | undefined,
): boolean {
  if (capPence === undefined) return false;
  const over = usageThisPeriod + 1 - pricing.includedUnits;
  return over > 0 && over * pricing.pricePerUnit > capPence;
}

/**
 * Practice questions for "Quiz me for practice": up to `count` different questions drawn from the module's own bank
 * (so a translated module keeps its own wording). Only single-answer questions (multiple choice and true or false) are
 * drawn; scenarios are multi-step and stay in the real quiz. The module is not changed.
 */
export function practiceQuestions(module: Pick<Module, 'questions'>, rng: Rng, count: number): Question[] {
  const pool = module.questions.filter((q) => q.type !== 'scenario');
  return rng.shuffle(pool).slice(0, Math.max(0, count));
}

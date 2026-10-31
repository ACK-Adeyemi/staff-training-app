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

// ---------------------------------------------------------------------------------------------------------------
// Drafting from a pasted policy and suggesting questions (M5 chunk 10). Canned and deterministic: the text is split
// by rules, nothing is rewritten, and nothing leaves the browser. Pasted HTML stays plain text (never rendered).

/** Longest policy text accepted, in characters. */
export const POLICY_MAX_CHARS = 20000;
const TITLE_MAX = 100;
const QUESTIONS_PER_LESSON = 3;

export type PolicyDraft =
  { ok: false; reason: 'empty' | 'tooLong' } | { ok: true; title: string; lessons: Lesson[]; questions: Question[] };

const HEADING = /^\s*#+\s*(\S.*)$/;

/** Sentences of a text, whitespace tidied, list marks removed, repeats dropped. */
function sentencesOf(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/(?<=[.!?])\s+|\n+/)) {
    const s = raw
      .replace(/^\s*[-*•]\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length < 2 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

const lessonText = (blocks: Lesson['blocks']): string =>
  blocks
    .map((b) =>
      b.kind === 'text' || b.kind === 'callout' ? b.markdown : b.kind === 'keyPoints' ? b.items.join('\n') : '',
    )
    .join('\n');

/** A true or false question whose statement is one sentence of the lesson (and so true). */
function trueFalseFrom(id: string, sentence: string, explanation: string, lessonId: string): Question {
  return {
    id,
    type: 'trueFalse',
    prompt: `True or false: ${sentence}`,
    options: [
      { id: 't', text: 'True', correct: true },
      { id: 'f', text: 'False', correct: false },
    ],
    explanation,
    learnMore: [],
    tags: [lessonId],
    aiDrafted: true,
  };
}

const shortTitle = (s: string): string => {
  const first = sentencesOf(s)[0] ?? s;
  const plain = first.replace(/[.!?]+$/, '').trim();
  return plain.length > 60 ? `${plain.slice(0, 57).trimEnd()}...` : plain;
};

/**
 * A draft module from pasted policy text: the first line is the title; lessons split at heading lines (# ...) or, with
 * no headings, at blank lines; each lesson gets up to 3 true or false questions from its own sentences. Everything is
 * marked aiDrafted and unchecked. Questions point at "Your policy, part N"; there is no sourceRef (no https address).
 */
export function draftFromPolicy(text: string): PolicyDraft {
  if (text.trim() === '') return { ok: false, reason: 'empty' };
  if (text.length > POLICY_MAX_CHARS) return { ok: false, reason: 'tooLong' };
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== '');
  const titleLine = (lines[first] ?? '').trim();
  const title = (HEADING.exec(titleLine)?.[1] ?? titleLine).trim().slice(0, TITLE_MAX);
  const rest = lines.slice(first + 1);

  const parts: { title: string; body: string }[] = [];
  if (rest.some((l) => HEADING.test(l))) {
    let current: { title: string; lines: string[] } = { title, lines: [] };
    const flush = (): void => {
      const body = current.lines.join('\n').trim();
      if (body !== '') parts.push({ title: current.title, body });
    };
    for (const line of rest) {
      const h = HEADING.exec(line);
      if (h) {
        flush();
        current = { title: (h[1] ?? '').trim(), lines: [] };
      } else {
        current.lines.push(line);
      }
    }
    flush();
  } else {
    for (const group of rest.join('\n').split(/\n\s*\n/)) {
      const body = group.trim();
      if (body !== '') parts.push({ title: shortTitle(body), body });
    }
  }

  const lessons: Lesson[] = [];
  const questions: Question[] = [];
  parts.forEach((part, i) => {
    const n = i + 1;
    const id = `part-${String(n)}`;
    const words = part.body.split(/\s+/).length;
    lessons.push({
      id,
      title: part.title,
      minutes: Math.max(1, Math.round(words / 200)),
      blocks: [{ kind: 'text', markdown: part.body }],
      aiDrafted: true,
    });
    sentencesOf(part.body)
      .slice(0, QUESTIONS_PER_LESSON)
      .forEach((s, k) => {
        questions.push(
          trueFalseFrom(
            `${id}-q${String(k + 1)}`,
            s,
            `This statement comes from your own policy. Source: Your policy, part ${String(n)}`,
            id,
          ),
        );
      });
  });
  return { ok: true, title, lessons, questions };
}

/**
 * Up to 3 true or false questions from the lesson's own sentences, all aiDrafted and unchecked. With more sentences than
 * that, the seeded `rng` picks which (without one, the first ones). The lesson is not changed.
 */
export function suggestQuestions(lesson: Pick<Lesson, 'id' | 'title' | 'blocks'>, rng?: Rng): Question[] {
  const all = sentencesOf(lessonText(lesson.blocks));
  const chosen =
    rng && all.length > QUESTIONS_PER_LESSON
      ? rng.sample(all, QUESTIONS_PER_LESSON)
      : all.slice(0, QUESTIONS_PER_LESSON);
  const base = lesson.id.slice(0, 30);
  return chosen.map((s, k) =>
    trueFalseFrom(
      `${base}-ai-${String(k + 1)}`,
      s,
      `This statement comes from the lesson "${lesson.title}".`,
      lesson.id,
    ),
  );
}

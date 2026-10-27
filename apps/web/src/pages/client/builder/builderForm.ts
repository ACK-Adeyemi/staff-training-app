// The Module Builder form: plain data plus small pure edit functions. Rules (Markdown import, the checklist, the
// schema) stay in @sta/domain and the data layer; this file only shapes what the screen edits.
import {
  markdownToLessons,
  type LearnMoreLink,
  type Lesson,
  type Module,
  type Question,
  type QuizSettings,
} from '@sta/domain';
import type { ModuleInput } from '@sta/data';

export type Form = {
  title: string;
  description: string;
  lessons: Lesson[];
  questions: Question[];
  roleTags: string[];
  requirementIds: string[];
  optional: boolean;
  categoryId: string;
  quiz: QuizSettings;
  /** True once the author changed Questions per attempt (or it came from a saved module). */
  drawTouched: boolean;
};

export const DEFAULT_QUIZ: QuizSettings = {
  mode: 'mcq',
  drawCount: 5,
  shuffleQuestions: true,
  shuffleOptions: true,
  passMark: 80,
  maxRetakes: null,
  feedback: true,
  showSourceRef: true,
  notesInQuiz: 'choice',
  learnMoreFor: 'wrong',
};

export const emptyForm = (): Form => ({
  title: '',
  description: '',
  lessons: [],
  questions: [],
  roleTags: [],
  requirementIds: [],
  optional: false,
  categoryId: '',
  quiz: { ...DEFAULT_QUIZ },
  drawTouched: false,
});

export const formFromModule = (m: Module, categoryId: string): Form => ({
  title: m.title,
  description: m.description,
  lessons: structuredClone(m.lessons),
  questions: structuredClone(m.questions),
  roleTags: [...m.roleTags],
  requirementIds: [...m.requirementIds],
  optional: m.optional === true,
  categoryId,
  quiz: structuredClone(m.quiz),
  drawTouched: true,
});

/** Questions per attempt: the author's number, or 5 capped to the questions there are. */
export const effectiveQuiz = (f: Form): QuizSettings =>
  f.drawTouched ? f.quiz : { ...f.quiz, drawCount: Math.max(1, Math.min(5, f.questions.length)) };

const minutesOf = (lessons: Lesson[]): number => Math.max(1, Math.round(lessons.reduce((n, l) => n + l.minutes, 0)));

/** The module as the form currently describes it, for the checklist and the preview. */
export function moduleOf(f: Form, base: Module | null): Module {
  const start: Partial<Module> = base
    ? { ...base }
    : { id: '01NEWMODULE000000000000000', owner: 'provider', language: 'en-GB', status: 'draft', version: 1 };
  delete start.optional;
  return {
    ...(start as Module),
    title: f.title,
    description: f.description,
    estimatedMinutes: minutesOf(f.lessons),
    requirementIds: f.requirementIds,
    roleTags: f.roleTags,
    lessons: f.lessons,
    questions: f.questions,
    quiz: effectiveQuiz(f),
    ...(f.optional ? { optional: true } : {}),
  };
}

/** What the data layer is given on Save draft and Publish. */
export function inputOf(f: Form, base: Module | null): ModuleInput {
  const content: Partial<Module> = moduleOf(f, base);
  delete content.id;
  delete content.owner;
  delete content.status;
  delete content.version;
  delete content.updatedAt;
  delete content.duplicatedFrom;
  return {
    ...(content as ModuleInput),
    title: f.title.trim(),
    questions: f.questions.map((q) => {
      const { sourceRef, ...rest } = q;
      const ref = sourceRef?.trim();
      return ref ? { ...rest, sourceRef: ref } : rest;
    }),
  };
}

// ----------------------------------------------------------------- keys

const keysOf = (f: Form): Set<string> => {
  const used = new Set<string>();
  for (const l of f.lessons) used.add(l.id);
  for (const q of f.questions) {
    used.add(q.id);
    for (const o of q.options ?? []) used.add(o.id);
    for (const s of q.scenario?.steps ?? []) {
      used.add(s.id);
      for (const c of s.choices) used.add(c.id);
    }
  }
  return used;
};

/** The next unused local key with the prefix. Keys are lowercase letters, digits and hyphens, at most 40 long. */
export function freshKey(prefix: string, used: Set<string>): string {
  for (let n = 1; ; n += 1) {
    const key = `${prefix}-${String(n)}`;
    if (!used.has(key)) return key;
  }
}

/** A key for a Learn more link: unique among the links the form already holds. */
export function freshLinkKey(f: Form): string {
  const used = new Set<string>();
  for (const l of f.lessons) for (const k of l.furtherReading ?? []) used.add(k.id);
  for (const q of f.questions) for (const k of q.learnMore) used.add(k.id);
  return freshKey('link', used);
}

// ----------------------------------------------------------------- lessons

export function pasteLessons(f: Form, text: string) {
  const { lessons, warnings } = markdownToLessons(text);
  const before = new Map(f.lessons.map((l) => [l.id, l.furtherReading] as const));
  const kept = lessons.map((l) => {
    const links = before.get(l.id);
    return links && links.length > 0 ? { ...l, furtherReading: links } : l;
  });
  return { form: { ...f, lessons: kept }, warnings };
}

export const setLesson = (f: Form, id: string, patch: Partial<Lesson>): Form => ({
  ...f,
  lessons: f.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)),
});

// ----------------------------------------------------------------- questions

export function addQuestion(f: Form, type: 'mcq' | 'trueFalse'): Form {
  const used = keysOf(f);
  const id = freshKey('question', used);
  used.add(id);
  const options =
    type === 'mcq'
      ? [1, 2].map((n) => ({ id: `${id}-option-${String(n)}`, text: '', correct: false }))
      : [
          { id: `${id}-true`, text: 'True', correct: false },
          { id: `${id}-false`, text: 'False', correct: false },
        ];
  const q: Question = { id, type, prompt: '', options, explanation: '', learnMore: [], tags: [] };
  return { ...f, questions: [...f.questions, q] };
}

export const removeQuestion = (f: Form, id: string): Form => ({
  ...f,
  questions: f.questions.filter((q) => q.id !== id),
});

export const setQuestion = (f: Form, id: string, patch: Partial<Question>): Form => ({
  ...f,
  questions: f.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
});

export function setOptionText(f: Form, qid: string, oid: string, text: string): Form {
  const q = f.questions.find((x) => x.id === qid);
  return setQuestion(f, qid, { options: (q?.options ?? []).map((o) => (o.id === oid ? { ...o, text } : o)) });
}

/** One option is correct at most: ticking one clears the others; ticking it again clears it. */
export function setCorrect(f: Form, qid: string, oid: string, correct: boolean): Form {
  const q = f.questions.find((x) => x.id === qid);
  return setQuestion(f, qid, {
    options: (q?.options ?? []).map((o) => ({ ...o, correct: o.id === oid ? correct : false })),
  });
}

export function addOption(f: Form, qid: string): Form {
  const q = f.questions.find((x) => x.id === qid);
  const options = q?.options ?? [];
  if (options.length >= 6) return f;
  const id = freshKey(`${qid}-option`, keysOf(f));
  return setQuestion(f, qid, { options: [...options, { id, text: '', correct: false }] });
}

export function removeOption(f: Form, qid: string, oid: string): Form {
  const q = f.questions.find((x) => x.id === qid);
  const options = q?.options ?? [];
  if (options.length <= 2) return f;
  return setQuestion(f, qid, { options: options.filter((o) => o.id !== oid) });
}

// ----------------------------------------------------------------- links

export function setLessonLinks(f: Form, lessonId: string, links: LearnMoreLink[]): Form {
  return setLesson(f, lessonId, { furtherReading: links });
}
export const setQuestionLinks = (f: Form, questionId: string, links: LearnMoreLink[]): Form =>
  setQuestion(f, questionId, { learnMore: links });

export const toggle = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

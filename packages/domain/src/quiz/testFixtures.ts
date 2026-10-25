// Test-only builders for the quiz engine tests (M1 chunk 2). Plain data, no behaviour.
import type { Module, Question, QuizSettings } from '../schemas/learning';

export const MODULE_ID = '01HZX0000000000000000000A1';
export const REQ_ID = '01HZX0000000000000000000B1';

export const mcq = (id: string, correctIndex = 0, count = 4): Question => ({
  id,
  type: 'mcq',
  prompt: `Prompt ${id}`,
  options: Array.from({ length: count }, (_, i) => ({
    id: `${id}-o${i}`,
    text: `Option ${i}`,
    correct: i === correctIndex,
  })),
  explanation: `Because ${id}.`,
  learnMore: [],
  tags: [],
});

export const trueFalse = (id: string, answer = true): Question => ({
  id,
  type: 'trueFalse',
  prompt: `Statement ${id}`,
  options: [
    { id: `${id}-true`, text: 'True', correct: answer },
    { id: `${id}-false`, text: 'False', correct: !answer },
  ],
  explanation: `Because ${id}.`,
  learnMore: [],
  tags: [],
});

/** Two-step scenario: s1 (best -> s2, ok -> s2, poor ends) then s2 (best, ok, poor all end). */
export const scenario = (id: string): Question => ({
  id,
  type: 'scenario',
  prompt: `Scenario ${id}`,
  scenario: {
    steps: [
      {
        id: `${id}-s1`,
        text: 'First step',
        choices: [
          { id: `${id}-a`, text: 'A', outcome: 'best', feedback: 'Good', next: `${id}-s2` },
          { id: `${id}-b`, text: 'B', outcome: 'ok', feedback: 'Fine', next: `${id}-s2` },
          { id: `${id}-c`, text: 'C', outcome: 'poor', feedback: 'No' },
        ],
      },
      {
        id: `${id}-s2`,
        text: 'Second step',
        choices: [
          { id: `${id}-d`, text: 'D', outcome: 'best', feedback: 'Good' },
          { id: `${id}-e`, text: 'E', outcome: 'ok', feedback: 'Fine' },
          { id: `${id}-f`, text: 'F', outcome: 'poor', feedback: 'No' },
        ],
      },
    ],
  },
  explanation: `Because ${id}.`,
  learnMore: [],
  tags: [],
});

export const settings = (over: Partial<QuizSettings> = {}): QuizSettings => ({
  mode: 'mix',
  mixScenarioShare: 0.4,
  drawCount: 10,
  shuffleQuestions: true,
  shuffleOptions: true,
  passMark: 80,
  maxRetakes: null,
  feedback: true,
  showSourceRef: true,
  notesInQuiz: 'choice',
  learnMoreFor: 'all',
  ...over,
});

export const moduleWith = (questions: Question[], quiz: Partial<QuizSettings> = {}): Module => ({
  id: MODULE_ID,
  owner: 'provider',
  title: 'Test module',
  description: 'A module for tests.',
  estimatedMinutes: 10,
  language: 'en-GB',
  status: 'published',
  version: 1,
  requirementIds: [REQ_ID],
  roleTags: [],
  lessons: [{ id: 'lesson-1', title: 'Lesson one', minutes: 3, blocks: [{ kind: 'text', markdown: 'Hello.' }] }],
  questions,
  quiz: settings(quiz),
});

/** 8 MCQ (m1..m8), 4 true or false (t1..t4), 6 scenarios (s1..s6), in that bank order. */
export const bank = (): Question[] => [
  ...Array.from({ length: 8 }, (_, i) => mcq(`m${i + 1}`, i % 4)),
  ...Array.from({ length: 4 }, (_, i) => trueFalse(`t${i + 1}`, i % 2 === 0)),
  ...Array.from({ length: 6 }, (_, i) => scenario(`s${i + 1}`)),
];

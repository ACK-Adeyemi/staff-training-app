// Learning schemas (build pack 6, plan Chunk 2): link safety, question refines, quiz settings, module keys.
import { describe, expect, it } from 'vitest';
import { learnMoreLinkSchema, lessonSchema, moduleSchema, questionSchema, quizSettingsSchema } from './learning';
import { bank, mcq, moduleWith, scenario, settings, trueFalse } from '../quiz/testFixtures';

const goodLink = {
  id: 'eyfs-3-4',
  title: 'EYFS 3.4',
  url: 'https://www.gov.uk/government/publications/eyfs',
  publisher: 'GOV.UK',
  kind: 'official',
  language: 'en-GB',
  showFor: 'all',
};
const ATT = '01HZX0000000000000000000F1';

describe('learnMoreLinkSchema', () => {
  it('accepts an https url link and an attachment link', () => {
    expect(learnMoreLinkSchema.safeParse(goodLink).success).toBe(true);
    const { url: _u, ...noUrl } = goodLink;
    expect(learnMoreLinkSchema.safeParse({ ...noUrl, attachmentId: ATT, kind: 'organisation' }).success).toBe(true);
  });

  it.each([
    'http://www.gov.uk/',
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://u:p@www.gov.uk/',
    'https://u@www.gov.uk/',
    'nonsense',
  ])('refuses url %s', (url) => {
    expect(learnMoreLinkSchema.safeParse({ ...goodLink, url }).success).toBe(false);
  });

  it('refuses both url and attachmentId', () => {
    expect(learnMoreLinkSchema.safeParse({ ...goodLink, attachmentId: ATT }).success).toBe(false);
  });

  it('refuses neither url nor attachmentId', () => {
    const { url: _u, ...noUrl } = goodLink;
    expect(learnMoreLinkSchema.safeParse(noUrl).success).toBe(false);
  });

  it('refuses an unknown kind and a bad local id', () => {
    expect(learnMoreLinkSchema.safeParse({ ...goodLink, kind: 'blog' }).success).toBe(false);
    expect(learnMoreLinkSchema.safeParse({ ...goodLink, id: 'Bad Id!' }).success).toBe(false);
  });
});

describe('questionSchema', () => {
  it('accepts valid mcq, true or false and scenario questions', () => {
    for (const q of [mcq('m1'), trueFalse('t1'), scenario('s1')])
      expect(questionSchema.safeParse(q).success).toBe(true);
  });

  it('refuses an mcq with zero or two correct options', () => {
    const q = mcq('m1');
    const none = { ...q, options: q.options!.map((o) => ({ ...o, correct: false })) };
    const two = { ...q, options: q.options!.map((o, i) => ({ ...o, correct: i < 2 })) };
    expect(questionSchema.safeParse(none).success).toBe(false);
    expect(questionSchema.safeParse(two).success).toBe(false);
  });

  it('refuses an mcq with 1 or 7 options and accepts 2 and 6', () => {
    expect(questionSchema.safeParse(mcq('m1', 0, 1)).success).toBe(false);
    expect(questionSchema.safeParse(mcq('m1', 0, 7)).success).toBe(false);
    expect(questionSchema.safeParse(mcq('m1', 0, 2)).success).toBe(true);
    expect(questionSchema.safeParse(mcq('m1', 0, 6)).success).toBe(true);
  });

  it('refuses true or false with three options', () => {
    const q = trueFalse('t1');
    const three = { ...q, options: [...q.options!, { id: 't1-maybe', text: 'Maybe', correct: false }] };
    expect(questionSchema.safeParse(three).success).toBe(false);
  });

  it('refuses a scenario with a next to an unknown step', () => {
    const q = scenario('s1');
    q.scenario!.steps[0]!.choices[0]!.next = 'missing';
    expect(questionSchema.safeParse(q).success).toBe(false);
  });

  it('refuses a scenario with a next to an earlier step or itself (cycle)', () => {
    const back = scenario('s1');
    back.scenario!.steps[1]!.choices[0]!.next = 's1-s1';
    expect(questionSchema.safeParse(back).success).toBe(false);
    const self = scenario('s1');
    self.scenario!.steps[0]!.choices[0]!.next = 's1-s1';
    expect(questionSchema.safeParse(self).success).toBe(false);
  });

  it('refuses a scenario with no path that ends in best', () => {
    const q = scenario('s1');
    for (const step of q.scenario!.steps) for (const c of step.choices) if (c.outcome === 'best') c.outcome = 'ok';
    expect(questionSchema.safeParse(q).success).toBe(false);
  });

  it('refuses a scenario with zero or five steps', () => {
    const q = scenario('s1');
    expect(questionSchema.safeParse({ ...q, scenario: { steps: [] } }).success).toBe(false);
    const step = q.scenario!.steps[1]!;
    const five = Array.from({ length: 5 }, (_, i) => ({
      ...step,
      id: `x${i}`,
      choices: step.choices.map((c) => ({ ...c, id: `x${i}-${c.id}` })),
    }));
    expect(questionSchema.safeParse({ ...q, scenario: { steps: five } }).success).toBe(false);
  });

  it('refuses an empty explanation', () => {
    expect(questionSchema.safeParse({ ...mcq('m1'), explanation: '' }).success).toBe(false);
  });

  it('refuses a sourceRef with no learnMore links, and accepts it with one', () => {
    expect(questionSchema.safeParse({ ...mcq('m1'), sourceRef: 'EYFS 3.4' }).success).toBe(false);
    expect(questionSchema.safeParse({ ...mcq('m1'), sourceRef: 'EYFS 3.4', learnMore: [goodLink] }).success).toBe(true);
  });
});

describe('quizSettingsSchema', () => {
  it('accepts the Safeguarding placeholder settings', () => {
    expect(quizSettingsSchema.safeParse(settings()).success).toBe(true);
  });

  it('refuses drawCount below 1', () => {
    expect(quizSettingsSchema.safeParse(settings({ drawCount: 0 })).success).toBe(false);
  });

  it('refuses mixScenarioShare outside 0..1 and requires it in mix mode', () => {
    expect(quizSettingsSchema.safeParse(settings({ mixScenarioShare: 1.1 })).success).toBe(false);
    expect(quizSettingsSchema.safeParse(settings({ mixScenarioShare: -0.1 })).success).toBe(false);
    expect(quizSettingsSchema.safeParse(settings({ mixScenarioShare: 0 })).success).toBe(true);
    const { mixScenarioShare: _m, ...noShare } = settings();
    expect(quizSettingsSchema.safeParse(noShare).success).toBe(false);
    expect(quizSettingsSchema.safeParse({ ...noShare, mode: 'mcq' }).success).toBe(true);
  });

  it('refuses passMark outside 0..100', () => {
    expect(quizSettingsSchema.safeParse(settings({ passMark: 101 })).success).toBe(false);
    expect(quizSettingsSchema.safeParse(settings({ passMark: -1 })).success).toBe(false);
    expect(quizSettingsSchema.safeParse(settings({ passMark: 100 })).success).toBe(true);
  });

  it('allows maxRetakes null but not negative', () => {
    expect(quizSettingsSchema.safeParse(settings({ maxRetakes: null })).success).toBe(true);
    expect(quizSettingsSchema.safeParse(settings({ maxRetakes: -1 })).success).toBe(false);
  });
});

describe('moduleSchema', () => {
  it('accepts a module with a full bank', () => {
    expect(moduleSchema.safeParse(moduleWith(bank())).success).toBe(true);
  });

  it('accepts draftContent and refuses version 0', () => {
    expect(moduleSchema.safeParse({ ...moduleWith(bank()), draftContent: true }).success).toBe(true);
    expect(moduleSchema.safeParse({ ...moduleWith(bank()), version: 0 }).success).toBe(false);
  });

  it('refuses duplicate question keys', () => {
    expect(moduleSchema.safeParse(moduleWith([mcq('m1'), mcq('m1')])).success).toBe(false);
  });

  it('refuses a lesson key that collides with a question key', () => {
    const m = moduleWith([mcq('lesson-1')]);
    expect(moduleSchema.safeParse(m).success).toBe(false);
  });

  it('refuses duplicate option keys across questions', () => {
    const a = mcq('m1');
    const b = mcq('m2');
    b.options![0]!.id = a.options![0]!.id;
    expect(moduleSchema.safeParse(moduleWith([a, b])).success).toBe(false);
  });

  it('refuses duplicate scenario step or choice keys', () => {
    const a = scenario('s1');
    const b = scenario('s2');
    b.scenario!.steps[0]!.choices[0]!.id = 's1-a';
    expect(moduleSchema.safeParse(moduleWith([a, b])).success).toBe(false);
  });

  it('refuses a local key that is not lower-case kebab', () => {
    expect(moduleSchema.safeParse(moduleWith([mcq('Bad_Key')])).success).toBe(false);
  });
});

// M5 chunk 1, F-7: optional AI-drafted flags on lessons and questions (brief 20.7).
describe('AI-drafted flags', () => {
  const REVIEWER = '01HZX0000000000000000000C1';
  const lesson = { id: 'l1', title: 'Lesson', minutes: 3, blocks: [] };

  it('keeps existing lessons and questions valid without the flags', () => {
    expect(lessonSchema.safeParse(lesson).success).toBe(true);
    expect(questionSchema.safeParse(trueFalse('q1')).success).toBe(true);
  });
  it('keeps aiDrafted and aiReviewedBy on a lesson', () => {
    const r = lessonSchema.safeParse({ ...lesson, aiDrafted: true, aiReviewedBy: REVIEWER });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ aiDrafted: true, aiReviewedBy: REVIEWER });
  });
  it('keeps aiDrafted and aiReviewedBy on a question', () => {
    const r = questionSchema.safeParse({ ...trueFalse('q2'), aiDrafted: true, aiReviewedBy: REVIEWER });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ aiDrafted: true, aiReviewedBy: REVIEWER });
  });
  it('rejects a non-boolean aiDrafted on a lesson and on a question', () => {
    expect(lessonSchema.safeParse({ ...lesson, aiDrafted: 'yes' }).success).toBe(false);
    expect(questionSchema.safeParse({ ...trueFalse('q3'), aiDrafted: 'yes' }).success).toBe(false);
  });
  it('rejects an aiReviewedBy that is not an id', () => {
    expect(lessonSchema.safeParse({ ...lesson, aiDrafted: true, aiReviewedBy: 'not an id' }).success).toBe(false);
    expect(questionSchema.safeParse({ ...trueFalse('q4'), aiDrafted: true, aiReviewedBy: '' }).success).toBe(false);
  });
  it('carries the flags through a whole module', () => {
    const m = {
      ...moduleWith([{ ...trueFalse('q5'), aiDrafted: true, aiReviewedBy: REVIEWER }]),
      lessons: [{ ...lesson, aiDrafted: true }],
    };
    const r = moduleSchema.safeParse(m);
    expect(r.success).toBe(true);
    expect(r.data?.lessons[0]?.aiDrafted).toBe(true);
    expect(r.data?.questions[0]?.aiReviewedBy).toBe(REVIEWER);
  });
});

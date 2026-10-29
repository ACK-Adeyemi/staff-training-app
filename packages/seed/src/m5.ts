// M5 seed (plan docs/plans/m5.md chunk 3; seed version 9). One forked stream `m5`, drawn after every earlier stream so no
// earlier record moves. Adds Little Acorns' draft "Mobile phone policy", a client's own draft that no one has published.
// Everything is fictional. Nothing here reads the real time or makes a request.
import { addDays, ulid, type Clock, type Module, type Rng } from '@sta/domain';
import type { SeedData, SeedKeys } from './world';

const need = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Seed: a record the M5 data refers to is missing');
  return value;
};

type Input = { data: SeedData; keys: SeedKeys; today: Date; clock: Clock; rng: Rng };

export function buildM5({ data, keys, today, clock, rng }: Input): void {
  const la = need(keys.clients['littleAcorns']);
  const phone: Module = {
    id: ulid(clock, rng),
    owner: { clientId: la },
    title: 'Mobile phone policy',
    description: 'Where phones are kept and when you may use them at Little Acorns. Fictional draft for the demo.',
    estimatedMinutes: 4,
    language: 'en-GB',
    status: 'draft',
    version: 1,
    requirementIds: [],
    roleTags: [],
    lessons: [
      {
        id: 'lesson-1',
        title: 'Phones at work',
        minutes: 3,
        blocks: [
          {
            kind: 'text',
            markdown:
              'At Little Acorns, personal phones stay in the staff room lockers while you are with the children. This is our own draft and the manager is still checking it.',
          },
          {
            kind: 'keyPoints',
            items: ['Phones go in the locker', 'Use your break to make calls', 'Use the setting tablet for photos'],
          },
        ],
      },
    ],
    questions: [
      {
        id: 'q-phone-where',
        type: 'mcq',
        prompt: 'Where do you keep your personal phone while you are with the children?',
        options: [
          { id: 'q-phone-where-o1', text: 'In the staff room locker', correct: true },
          { id: 'q-phone-where-o2', text: 'In your apron pocket', correct: false },
        ],
        explanation: 'Phones stay in the locker so you can give the children your full attention.',
        learnMore: [],
        tags: [],
      },
      {
        id: 'q-phone-photos',
        type: 'trueFalse',
        prompt: 'You can take photos of the children on your own phone if you delete them later. True or false?',
        options: [
          { id: 'q-phone-photos-o1', text: 'True', correct: false },
          { id: 'q-phone-photos-o2', text: 'False', correct: true },
        ],
        explanation: 'Use the setting tablet for photos. Personal phones are not used for pictures of children.',
        learnMore: [],
        tags: [],
      },
    ],
    quiz: {
      mode: 'mcq',
      drawCount: 2,
      shuffleQuestions: true,
      shuffleOptions: true,
      passMark: 80,
      maxRetakes: null,
      feedback: true,
      showSourceRef: false,
      notesInQuiz: 'choice',
      learnMoreFor: 'wrong',
    },
    draftContent: true,
    updatedAt: addDays(today, -2).toISOString(),
  };
  data.modules.push(phone);
  keys.modules = { ...keys.modules, mobilePhonePolicy: phone.id };
}

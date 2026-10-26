// BP-2: which Learn more links show when (brief 31.1, plan Assumptions 8 and 9).
import { describe, expect, it } from 'vitest';
import type { ClientLinkOverlay, LearnMoreLink, Question } from '../schemas/learning';
import { displayDomain, isSafeHttpsUrl, visibleLearnMore } from './learnMore';
import { mcq, settings } from './testFixtures';

const link = (id: string, over: Partial<LearnMoreLink> = {}): LearnMoreLink => ({
  id,
  title: `Link ${id}`,
  url: `https://www.gov.uk/${id}`,
  publisher: 'GOV.UK',
  kind: 'official',
  language: 'en-GB',
  showFor: 'all',
  ...over,
});

const questionWith = (links: LearnMoreLink[]): Question => ({ ...mcq('m1'), learnMore: links });

const overlay = (links: LearnMoreLink[], over: Partial<ClientLinkOverlay> = {}): ClientLinkOverlay => ({
  id: '01HZX0000000000000000000C1',
  clientId: '01HZX0000000000000000000D1',
  moduleId: '01HZX0000000000000000000A1',
  questionId: 'm1',
  links,
  addedBy: '01HZX0000000000000000000E1',
  addedAt: '2026-10-19T09:00:00Z',
  ...over,
});

const ids = (links: LearnMoreLink[]): string[] => links.map((l) => l.id);
const base = { phase: 'feedback' as const, attemptMode: 'open' as const };

describe('visibleLearnMore', () => {
  const q = questionWith([link('all1'), link('wrong1', { showFor: 'wrong' }), link('law', { kind: 'legislation' })]);

  it('shows every link after a wrong answer', () => {
    const r = visibleLearnMore({
      ...base,
      question: q,
      overlays: [],
      correct: false,
      settings: settings({ learnMoreFor: 'wrong' }),
    });
    expect(ids(r.official)).toEqual(['all1', 'wrong1', 'law']);
    expect(r.organisation).toEqual([]);
  });

  it('shows only showFor all links after a right answer when the module says all', () => {
    const r = visibleLearnMore({
      ...base,
      question: q,
      overlays: [],
      correct: true,
      settings: settings({ learnMoreFor: 'all' }),
    });
    expect(ids(r.official)).toEqual(['all1', 'law']);
  });

  it('shows nothing after a right answer when the module says wrong only', () => {
    const r = visibleLearnMore({
      ...base,
      question: q,
      overlays: [],
      correct: true,
      settings: settings({ learnMoreFor: 'wrong' }),
    });
    expect(r).toEqual({ official: [], organisation: [] });
  });

  it('groups organisation links separately from official ones', () => {
    const r = visibleLearnMore({
      ...base,
      question: q,
      overlays: [overlay([link('org1', { kind: 'organisation', publisher: 'Little Acorns' })])],
      correct: false,
      settings: settings(),
    });
    expect(ids(r.official)).toEqual(['all1', 'wrong1', 'law']);
    expect(ids(r.organisation)).toEqual(['org1']);
  });

  it('applies the same right-answer rules to organisation links', () => {
    const r = visibleLearnMore({
      ...base,
      question: q,
      overlays: [
        overlay([link('o-all', { kind: 'organisation' }), link('o-wrong', { kind: 'organisation', showFor: 'wrong' })]),
      ],
      correct: true,
      settings: settings({ learnMoreFor: 'all' }),
    });
    expect(ids(r.organisation)).toEqual(['o-all']);
  });

  it('ignores overlays for a different question', () => {
    const r = visibleLearnMore({
      ...base,
      question: q,
      overlays: [overlay([link('elsewhere', { kind: 'organisation' })], { questionId: 'other' })],
      correct: false,
      settings: settings(),
    });
    expect(r.organisation).toEqual([]);
  });

  it('shows nothing in the feedback phase of a closed-book attempt', () => {
    const r = visibleLearnMore({
      question: q,
      overlays: [overlay([link('org1', { kind: 'organisation' })])],
      correct: false,
      settings: settings(),
      phase: 'feedback',
      attemptMode: 'closed',
    });
    expect(r).toEqual({ official: [], organisation: [] });
  });

  it('shows all links for a missed question in the results phase of a closed-book attempt', () => {
    const r = visibleLearnMore({
      question: q,
      overlays: [overlay([link('org1', { kind: 'organisation' })])],
      correct: false,
      settings: settings({ learnMoreFor: 'wrong' }),
      phase: 'results',
      attemptMode: 'closed',
    });
    expect(ids(r.official)).toEqual(['all1', 'wrong1', 'law']);
    expect(ids(r.organisation)).toEqual(['org1']);
  });
});

describe('displayDomain', () => {
  it.each([
    ['https://assets.publishing.service.gov.uk/media/x.pdf', 'gov.uk'],
    ['https://www.legislation.gov.uk/ukpga/2006/21', 'gov.uk'],
    ['https://learning.nspcc.org.uk/safeguarding', 'nspcc.org.uk'],
    ['https://www.example.co.uk/page', 'example.co.uk'],
    ['https://www.hse.gov.uk/pubns/', 'gov.uk'],
    ['https://sub.example.com/a', 'example.com'],
    ['https://ico.org.uk/for-organisations/', 'ico.org.uk'],
    ['https://www.nhs.uk/conditions/', 'nhs.uk'],
    ['https://www.cam.ac.uk/research', 'cam.ac.uk'],
  ])('shows %s as %s', (url, expected) => {
    expect(displayDomain(url)).toBe(expected);
  });
});

describe('isSafeHttpsUrl', () => {
  it.each([
    ['https://www.gov.uk/guidance', true],
    ['HTTPS://WWW.GOV.UK/', true],
    ['http://www.gov.uk/', false],
    ['javascript:alert(1)', false],
    ['data:text/html,hi', false],
    ['https://user:pass@www.gov.uk/', false],
    ['https://user@www.gov.uk/', false],
    ['//www.gov.uk/', false],
    ['not a url', false],
    ['', false],
    ['ftp://example.com/', false],
  ])('%s -> %s', (url, expected) => {
    expect(isSafeHttpsUrl(url)).toBe(expected);
  });
});

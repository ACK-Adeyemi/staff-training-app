// BP-14: module feedback summary, the provider projection and the reply rule (plan Assumption 18; brief 19.1).
//
// API under test:
//   feedbackSummary(items: ModuleFeedback[]): { count: number; averageRating: number | null; tagCounts: Record<string, number>;
//       thumbsUp: number; thumbsDown: number; questionReports: number }
//       averageRating = mean of moduleCard ratings to one decimal; null with none.
//   providerProjection(items: ModuleFeedback[], modules: Module[]): {
//       modules: { moduleId: string; title: string; itemCount: number; averageRating: number | null; items: ProviderFeedbackItem[] }[];
//       ownModules: { clientId: string; moduleCount: number; itemCount: number }[] }
//       ProviderFeedbackItem = { id, moduleVersion, kind, lessonId?, questionId?, rating?, thumb?, tags, text?, status, createdAt }
//       (no personId, siteId, reply, escalatedToProvider, anonymous flag); only provider modules appear in `modules`, question reports
//       first then newest first; items for client-own modules appear only as counts per client; items for unknown modules are ignored.
//   canReplyToFeedback(item): boolean   // false for anonymous feedback
import { describe, expect, it } from 'vitest';
import type { ModuleFeedback } from '../schemas/support';
import { moduleFor } from '../progress/testFixtures';
import { canReplyToFeedback, feedbackSummary, providerProjection } from './moduleFeedback';

const ID = (n: number): string => `01HZX${String(n).padStart(21, '0')}`;
const CLIENT_A = ID(1);
const CLIENT_B = ID(2);
const SITE_A = ID(3);
const PERSON_NAMED = ID(4);
const PERSON_REPLIED = ID(5);
const REPLIER = ID(6);
let n = 100;
const fb = (over: Partial<ModuleFeedback> = {}): ModuleFeedback => ({
  id: ID(n++),
  clientId: CLIENT_A,
  siteId: SITE_A,
  personId: PERSON_NAMED,
  anonymous: false,
  moduleId: ID(50),
  moduleVersion: 1,
  kind: 'moduleCard',
  tags: [],
  status: 'new',
  createdAt: '2026-10-19T09:00:00.000Z',
  ...over,
});

describe('feedbackSummary', () => {
  const items = [
    fb({ rating: 4, tags: ['Clear', 'Really useful'] }),
    fb({ rating: 5, tags: ['Clear'] }),
    fb({ rating: 5 }),
    fb({ kind: 'lessonThumb', lessonId: 'l1', thumb: 'up', tags: ['Clear'] }),
    fb({ kind: 'lessonThumb', lessonId: 'l1', thumb: 'down' }),
    fb({ kind: 'lessonThumb', lessonId: 'l2', thumb: 'up' }),
    fb({ kind: 'questionReport', questionId: 'q1', tags: ['Mistake in a question'], text: 'Wrong answer' }),
  ];
  const s = feedbackSummary(items);

  it('counts items, thumbs and question reports', () => {
    expect(s).toMatchObject({ count: 7, thumbsUp: 2, thumbsDown: 1, questionReports: 1 });
  });

  it('averages only module card ratings, to one decimal', () => {
    expect(s.averageRating).toBe(4.7);
  });

  it('counts every tag across all kinds', () => {
    expect(s.tagCounts).toEqual({ Clear: 3, 'Really useful': 1, 'Mistake in a question': 1 });
  });

  it('gives a null average and zero counts with no feedback', () => {
    expect(feedbackSummary([])).toEqual({
      count: 0,
      averageRating: null,
      tagCounts: {},
      thumbsUp: 0,
      thumbsDown: 0,
      questionReports: 0,
    });
  });
});

describe('providerProjection', () => {
  const providerA = moduleFor({ id: ID(50), title: 'Safeguarding' });
  const providerB = moduleFor({ id: ID(51), title: 'Fire evacuation' });
  const ownA1 = moduleFor({ id: ID(60), title: 'Our policy', owner: { clientId: CLIENT_A } });
  const ownA2 = moduleFor({ id: ID(61), title: 'Our induction', owner: { clientId: CLIENT_A } });
  const ownB1 = moduleFor({ id: ID(62), title: 'Their policy', owner: { clientId: CLIENT_B } });
  const modules = [providerA, providerB, ownA1, ownA2, ownB1];

  const named = fb({
    moduleId: providerA.id,
    rating: 3,
    text: 'Too long',
    tags: ['Too long'],
    createdAt: '2026-10-10T09:00:00.000Z',
  });
  const replied = fb({
    moduleId: providerA.id,
    personId: PERSON_REPLIED,
    rating: 5,
    createdAt: '2026-10-12T09:00:00.000Z',
    reply: { byUserId: REPLIER, text: 'Thanks Jade, noted', at: '2026-10-13T09:00:00.000Z' },
    escalatedToProvider: { by: REPLIER, note: 'Please check the second answer', at: '2026-10-13T09:00:00.000Z' },
  });
  const anon = fb({ moduleId: providerA.id, anonymous: true, rating: 4, createdAt: '2026-10-11T09:00:00.000Z' });
  delete (anon as { personId?: string }).personId;
  const report = fb({
    moduleId: providerA.id,
    kind: 'questionReport',
    questionId: 'q1',
    tags: ['Mistake in a question'],
    createdAt: '2026-10-01T09:00:00.000Z',
  });
  const other = fb({ moduleId: providerB.id, rating: 5 });
  const ownItems = [
    fb({ moduleId: ownA1.id, text: 'Private to us' }),
    fb({ moduleId: ownA1.id }),
    fb({ moduleId: ownA2.id }),
    fb({ moduleId: ownB1.id, clientId: CLIENT_B }),
  ];
  const unknown = fb({ moduleId: ID(99) });
  const items = [named, replied, anon, report, other, ...ownItems, unknown];
  const p = providerProjection(items, modules);

  it('groups provider-module items per module with counts and the average rating', () => {
    const a = p.modules.find((m) => m.moduleId === providerA.id);
    expect(a).toMatchObject({ title: 'Safeguarding', itemCount: 4, averageRating: 4 });
    expect(p.modules.find((m) => m.moduleId === providerB.id)).toMatchObject({ itemCount: 1, averageRating: 5 });
    expect(p.modules.map((m) => m.moduleId).sort()).toEqual([providerA.id, providerB.id].sort());
  });

  it('puts question reports first, then newest first', () => {
    const a = p.modules.find((m) => m.moduleId === providerA.id);
    expect(a?.items.map((i) => i.id)).toEqual([report.id, replied.id, anon.id, named.id]);
  });

  it('keeps the useful fields', () => {
    const a = p.modules.find((m) => m.moduleId === providerA.id)?.items.find((i) => i.id === named.id);
    expect(a).toMatchObject({
      kind: 'moduleCard',
      rating: 3,
      text: 'Too long',
      tags: ['Too long'],
      status: 'new',
      moduleVersion: 1,
    });
  });

  it('removes people, sites, replies and escalation notes everywhere in the result', () => {
    const json = JSON.stringify(p);
    const keys: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          keys.push(k);
          walk(x);
        }
      }
    };
    walk(p);
    for (const banned of [
      'personId',
      'siteId',
      'reply',
      'escalatedToProvider',
      'userId',
      'byUserId',
      'anonymous',
      'name',
    ]) {
      expect(keys).not.toContain(banned);
    }
    for (const value of [
      PERSON_NAMED,
      PERSON_REPLIED,
      REPLIER,
      SITE_A,
      'Jade',
      'Thanks Jade',
      'Please check the second answer',
    ]) {
      expect(json).not.toContain(value);
    }
  });

  it('gives client-own modules as counts per client only', () => {
    expect([...p.ownModules].sort((a, b) => a.clientId.localeCompare(b.clientId))).toEqual([
      { clientId: CLIENT_A, moduleCount: 2, itemCount: 3 },
      { clientId: CLIENT_B, moduleCount: 1, itemCount: 1 },
    ]);
    const json = JSON.stringify(p);
    expect(json).not.toContain('Private to us');
    expect(json).not.toContain('Our policy');
  });

  it('is empty with no feedback', () => {
    expect(providerProjection([], modules)).toEqual({ modules: [], ownModules: [] });
  });
});

describe('canReplyToFeedback', () => {
  it('allows replying to named feedback', () => {
    expect(canReplyToFeedback(fb())).toBe(true);
  });

  it('refuses replying to anonymous feedback', () => {
    const anon = fb({ anonymous: true });
    delete (anon as { personId?: string }).personId;
    expect(canReplyToFeedback(anon)).toBe(false);
  });
});

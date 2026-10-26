// F-2: history timeline, weekly activity and score trend (plan M2 Design > Domain package).
import { describe, expect, it } from 'vitest';
import { historyTimeline, scoreTrend, weeklyActivity } from './history';
import { attemptFor, bankModule, event, nextId } from './testFixtures';

const m1 = bankModule(2, 3);
const m2 = bankModule(2, 3);
const NOW = new Date('2026-10-19T09:00:00.000Z');
const lessonAt = (m: typeof m1, iso: string, id = 'l1') =>
  event({ type: 'lessonCompleted', moduleId: m.id, lessonId: id, at: iso });
const att = (m: typeof m1, finishedAt: string, score: number, over = {}) =>
  attemptFor(m, { startedAt: finishedAt, finishedAt, score, passed: score >= 80, ...over });

describe('historyTimeline', () => {
  const events = [
    lessonAt(m1, '2026-10-10T10:00:00.000Z'),
    lessonAt(m2, '2025-12-30T10:00:00.000Z'),
    event({ type: 'login', at: '2026-10-11T10:00:00.000Z' }),
  ];
  const attempts = [
    att(m1, '2026-10-12T10:00:00.000Z', 90),
    att(m1, '2026-10-13T10:00:00.000Z', 40, { abandoned: true, score: undefined, passed: undefined }),
  ];
  const badges = [{ badgeId: 'firstModule', at: '2026-10-12T10:05:00.000Z' }];

  it('lists lessons, finished attempts and badges newest first, leaving out logins and abandoned attempts', () => {
    const t = historyTimeline(events, attempts, badges, {});
    expect(t.map((i) => i.kind)).toEqual(['badge', 'attempt', 'lesson', 'lesson']);
    expect(t.map((i) => i.at)).toEqual([...t.map((i) => i.at)].sort().reverse());
    expect(t[1]).toMatchObject({ kind: 'attempt', moduleId: m1.id, score: 90, passed: true });
    expect(t[0]).toMatchObject({ kind: 'badge', badgeId: 'firstModule' });
  });

  it('filters by year using London time', () => {
    const edge = [lessonAt(m1, '2025-12-31T23:30:00.000Z'), lessonAt(m1, '2026-01-01T00:30:00.000Z')];
    expect(historyTimeline(edge, [], [], { year: 2026 })).toHaveLength(1);
    expect(historyTimeline(events, attempts, badges, { year: 2025 }).map((i) => i.moduleId)).toEqual([m2.id]);
  });

  it('filters by module and drops badges that are not about that module', () => {
    const t = historyTimeline(events, attempts, badges, { moduleId: m1.id });
    expect(t.every((i) => i.kind !== 'badge' && i.moduleId === m1.id)).toBe(true);
    expect(t).toHaveLength(2);
  });

  it('returns an empty list for nothing', () => {
    expect(historyTimeline([], [], [], {})).toEqual([]);
  });
});

describe('weeklyActivity', () => {
  it('returns 12 weeks oldest first ending with this London week, with empty weeks as zeros', () => {
    const w = weeklyActivity(
      [
        lessonAt(m1, '2026-10-19T08:00:00.000Z'),
        lessonAt(m1, '2026-10-14T08:00:00.000Z'),
        lessonAt(m1, '2026-10-15T08:00:00.000Z'),
        event({ type: 'attemptFinished', at: '2026-08-04T10:00:00.000Z' }),
      ],
      NOW,
    );
    expect(w).toHaveLength(12);
    expect(w[11]).toMatchObject({ weekStart: '2026-10-19', lessons: 1 });
    expect(w[10]).toMatchObject({ weekStart: '2026-10-12', lessons: 2 });
    expect(w[0]!.weekStart).toBe('2026-08-03');
    expect(w[0]).toMatchObject({ attempts: 1, lessons: 0 });
    expect(w[5]).toMatchObject({ lessons: 0, attempts: 0 });
  });

  it('leaves out events older than the window and honours a custom length', () => {
    const w = weeklyActivity([lessonAt(m1, '2026-01-05T08:00:00.000Z')], NOW, 4);
    expect(w).toHaveLength(4);
    expect(w.every((x) => x.lessons === 0)).toBe(true);
  });
});

describe('scoreTrend', () => {
  it('lists scored, finished, non-abandoned attempts oldest first', () => {
    const a = att(m1, '2026-10-05T10:00:00.000Z', 60);
    const b = att(m2, '2026-10-12T10:00:00.000Z', 85);
    const open = attemptFor(m1, { id: nextId() });
    const gone = att(m1, '2026-10-13T10:00:00.000Z', 10, { abandoned: true });
    const t = scoreTrend([b, open, gone, a]);
    expect(t.map((x) => x.score)).toEqual([60, 85]);
    expect(t[0]).toMatchObject({ attemptId: a.id, moduleId: m1.id, at: '2026-10-05T10:00:00.000Z' });
  });

  it('is empty with no attempts', () => {
    expect(scoreTrend([])).toEqual([]);
  });
});

// F-1: London weeks and the weekly goal (plan M2 assumption 7).
import { describe, expect, it } from 'vitest';
import { activeWeeks, londonWeekKey, weeklyGoal } from './weeks';
import { event, me, nextId } from './testFixtures';

// NOW is Monday 19 October 2026, 10:00 London (BST).
const NOW = new Date('2026-10-19T09:00:00.000Z');
const lessonAt = (iso: string) => event({ type: 'lessonCompleted', moduleId: nextId(), lessonId: 'l1', at: iso });

describe('londonWeekKey', () => {
  it('is the London Monday date (YYYY-MM-DD) of the week', () => {
    expect(londonWeekKey('2026-10-21T12:00:00.000Z')).toBe('2026-10-19');
  });

  it('keeps Sunday evening in the old week and Monday in the new one', () => {
    expect(londonWeekKey('2026-10-18T22:59:00.000Z')).toBe('2026-10-12'); // Sunday 23:59 BST
    expect(londonWeekKey('2026-10-18T23:00:00.000Z')).toBe('2026-10-19'); // Monday 00:00 BST
  });

  it('is correct across the clock change on Sunday 25 October 2026', () => {
    expect(londonWeekKey('2026-10-25T23:30:00.000Z')).toBe('2026-10-19'); // still Sunday 23:30 GMT
    expect(londonWeekKey('2026-10-26T00:00:00.000Z')).toBe('2026-10-26'); // Monday 00:00 GMT
  });

  it('is correct across the spring change on Sunday 29 March 2026', () => {
    expect(londonWeekKey('2026-03-29T22:30:00.000Z')).toBe('2026-03-23'); // Sunday 23:30 BST
    expect(londonWeekKey('2026-03-29T23:00:00.000Z')).toBe('2026-03-30'); // Monday 00:00 BST
  });
});

describe('activeWeeks', () => {
  it('counts a week with a completed lesson or finished attempt, once, sorted', () => {
    const keys = activeWeeks([
      lessonAt('2026-10-14T10:00:00.000Z'),
      lessonAt('2026-10-15T10:00:00.000Z'),
      event({ type: 'attemptFinished', at: '2026-10-05T10:00:00.000Z' }),
      event({ type: 'login', at: '2026-09-28T10:00:00.000Z' }),
      event({ type: 'lessonViewed', at: '2026-09-21T10:00:00.000Z' }),
    ]);
    expect(keys).toEqual(['2026-10-05', '2026-10-12']);
  });
});

describe('weeklyGoal', () => {
  it('reports lessons done this London week against the goal and says met when reached', () => {
    const events = [
      lessonAt('2026-10-19T08:00:00.000Z'),
      lessonAt('2026-10-18T10:00:00.000Z'), // last week
    ];
    expect(weeklyGoal({ events, goal: 2, now: NOW, person: me }).thisWeek).toEqual({ done: 1, goal: 2, met: false });
    const more = [...events, lessonAt('2026-10-19T08:30:00.000Z')];
    expect(weeklyGoal({ events: more, goal: 2, now: NOW, person: me }).thisWeek).toEqual({
      done: 2,
      goal: 2,
      met: true,
    });
  });

  it('counts an attempt as activity but not towards the lesson goal', () => {
    const r = weeklyGoal({
      events: [event({ type: 'attemptFinished', at: '2026-10-19T08:00:00.000Z' })],
      goal: 1,
      now: NOW,
      person: me,
    });
    expect(r.thisWeek).toEqual({ done: 0, goal: 1, met: false });
    expect(r.totalActiveWeeks).toBe(1);
  });

  it('counts total active weeks without ever resetting after a gap', () => {
    const events = [
      lessonAt('2026-08-03T10:00:00.000Z'),
      lessonAt('2026-08-10T10:00:00.000Z'),
      lessonAt('2026-10-12T10:00:00.000Z'),
    ];
    const r = weeklyGoal({ events, goal: 1, now: NOW, person: me });
    expect(r.totalActiveWeeks).toBe(3);
    expect(r.currentRun).toBe(1); // only last week; the earlier run is not "lost", just not current
  });

  it('counts a run ending this week or last week', () => {
    const lastWeekOnly = [lessonAt('2026-10-05T10:00:00.000Z'), lessonAt('2026-10-12T10:00:00.000Z')];
    expect(weeklyGoal({ events: lastWeekOnly, goal: 1, now: NOW, person: me }).currentRun).toBe(2);
    const withThis = [...lastWeekOnly, lessonAt('2026-10-19T08:00:00.000Z')];
    expect(weeklyGoal({ events: withThis, goal: 1, now: NOW, person: me }).currentRun).toBe(3);
  });

  it('is 0 when neither this week nor last week was active', () => {
    expect(
      weeklyGoal({ events: [lessonAt('2026-10-05T10:00:00.000Z')], goal: 1, now: NOW, person: me }).currentRun,
    ).toBe(0);
  });

  it('continues the run over a rest week (pausedUntil) without extending it', () => {
    const events = [
      lessonAt('2026-09-28T10:00:00.000Z'),
      lessonAt('2026-10-05T10:00:00.000Z'),
      // week of 12 October: on leave, nothing
      lessonAt('2026-10-19T08:00:00.000Z'),
    ];
    const plain = weeklyGoal({ events, goal: 1, now: NOW, person: me });
    expect(plain.currentRun).toBe(1);
    const paused = weeklyGoal({
      events,
      goal: 1,
      now: NOW,
      person: { ...me, pausedUntil: '2026-10-14T00:00:00.000Z' },
    });
    expect(paused.currentRun).toBe(3);
    expect(paused.restWeeks).toContain('2026-10-12');
    expect(paused.totalActiveWeeks).toBe(3);
  });

  it('treats this week as a rest week when the person is on leave, and keeps last weeks run', () => {
    const events = [lessonAt('2026-10-05T10:00:00.000Z'), lessonAt('2026-10-12T10:00:00.000Z')];
    const r = weeklyGoal({ events, goal: 1, now: NOW, person: { ...me, status: 'onLeave' } });
    expect(r.currentRun).toBe(2);
    expect(r.restWeeks).toContain('2026-10-19');
  });

  it('has no lost or broken state anywhere in its output', () => {
    const r = weeklyGoal({ events: [], goal: 1, now: NOW, person: me });
    expect(Object.keys(r).sort()).toEqual(['currentRun', 'restWeeks', 'thisWeek', 'totalActiveWeeks']);
    expect(JSON.stringify(r)).not.toMatch(/lost|broken|reset|red/i);
    expect(r).toMatchObject({ currentRun: 0, totalActiveWeeks: 0, thisWeek: { done: 0, goal: 1, met: false } });
  });
});

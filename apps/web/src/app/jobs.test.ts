import { describe, expect, it } from 'vitest';
import { inQuietHours } from '@sta/domain';
import { fastForwardRunTimes } from './jobs';

const quiet = [{ from: '21:00', to: '07:00' }];

describe('fastForwardRunTimes', () => {
  const night = new Date('2026-10-19T22:30:00.000Z');

  it('runs the days in between at London midday and the last at the new now', () => {
    const times = fastForwardRunTimes(night, 3);
    expect(times).toHaveLength(3);
    expect(times[0]).toBe('2026-10-20T11:00:00.000Z'); // 12:00 BST
    expect(times[1]).toBe('2026-10-21T11:00:00.000Z'); // 12:00 BST
    expect(times[2]).toBe('2026-10-22T22:30:00.000Z');
  });

  it('never runs the in-between days inside quiet hours, so a night-time presenter loses nothing', () => {
    for (const at of fastForwardRunTimes(night, 10).slice(0, -1)) expect(inQuietHours(new Date(at), quiet)).toBe(false);
  });

  it('runs once, at the new now, for one day, and not at all for none', () => {
    expect(fastForwardRunTimes(night, 1)).toEqual(['2026-10-20T22:30:00.000Z']);
    expect(fastForwardRunTimes(night, 0)).toEqual([]);
  });
});

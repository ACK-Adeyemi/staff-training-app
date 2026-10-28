// M4 chunk 3: announcements, maintenance windows and Learn more open counts, written before the implementation.
//
// API under test (comms.ts):
//   type CommsTarget = { clientId: string; packageId: string; packId: string; side: 'staff' | 'client' }
//   announcementReaches(a: Announcement, target: CommsTarget): boolean
//     side must be in audience.sides; with no clientIds/packageIds/packIds the audience is every client;
//     otherwise a target matches if ANY given list contains its client, package or pack.
//   announcementState(a, clock): 'scheduled' | 'active' | 'expired'   // publishAt inclusive, expiresAt exclusive
//   bannersFor(announcements, target, clock): Announcement[]           // active, reaches target, banner channel, newest publishAt first
//   type MaintenanceWindow = { id; apps: ('staff' | 'client' | 'provider')[]; startsAt; endsAt; message }
//   maintenanceFlags(windows, clock): Record<'staff' | 'client' | 'provider', boolean>  // window start inclusive, end exclusive
//   learnMoreCounts(events: LearningEvent[]): { linkId: string; opens: number }[]      // learnMoreOpened with linkId only; opens desc, then linkId asc
import { describe, expect, it } from 'vitest';
import { fixedClock } from './clock';
import {
  announcementReaches,
  announcementState,
  bannersFor,
  learnMoreCounts,
  maintenanceFlags,
  type MaintenanceWindow,
} from './comms';
import type { Announcement } from './schemas/m4';
import type { LearningEvent } from './schemas/learning';

const uid = (n: number) => String(n).padStart(26, '0'); // ids are 26-character ULIDs
const clock = fixedClock('2026-03-10T12:00:00.000Z');

const ann = (n: number, over: Partial<Announcement> = {}): Announcement => ({
  id: uid(n),
  title: 'Update',
  body: 'Something changed.',
  audience: { sides: ['client'] },
  channels: ['banner'],
  publishAt: '2026-03-10T08:00:00.000Z',
  createdBy: uid(90),
  reads: 0,
  ...over,
});
const target = { clientId: uid(1), packageId: uid(2), packId: uid(3), side: 'client' as const };

describe('announcement audience', () => {
  it('reaches every client when no client, package or pack is chosen', () => {
    const a = ann(10);
    expect(announcementReaches(a, target)).toBe(true);
    expect(announcementReaches(a, { ...target, clientId: uid(7), packageId: uid(8), packId: uid(9) })).toBe(true);
  });

  it('reaches only chosen clients when clientIds is set', () => {
    const a = ann(11, { audience: { clientIds: [uid(1)], sides: ['client'] } });
    expect(announcementReaches(a, target)).toBe(true);
    expect(announcementReaches(a, { ...target, clientId: uid(7) })).toBe(false);
  });

  it('reaches clients on a chosen package or industry pack, and not others', () => {
    const byPackage = ann(12, { audience: { packageIds: [uid(2)], sides: ['client'] } });
    const byPack = ann(13, { audience: { packIds: [uid(3)], sides: ['client'] } });
    const other = { ...target, packageId: uid(8), packId: uid(9) };
    expect(announcementReaches(byPackage, target)).toBe(true);
    expect(announcementReaches(byPackage, other)).toBe(false);
    expect(announcementReaches(byPack, target)).toBe(true);
    expect(announcementReaches(byPack, other)).toBe(false);
  });

  it('only reaches the sides it names, so client-only does not reach staff', () => {
    const a = ann(14, { audience: { sides: ['client'] } });
    expect(announcementReaches(a, { ...target, side: 'staff' })).toBe(false);
    const both = ann(15, { audience: { sides: ['staff', 'client'] } });
    expect(announcementReaches(both, { ...target, side: 'staff' })).toBe(true);
  });
});

describe('announcement schedule', () => {
  it('is scheduled before publishAt, active from publishAt, and expired from expiresAt', () => {
    const a = ann(20, { publishAt: '2026-03-10T12:00:00.000Z', expiresAt: '2026-03-11T12:00:00.000Z' });
    expect(announcementState(a, fixedClock('2026-03-10T11:59:59.000Z'))).toBe('scheduled');
    expect(announcementState(a, fixedClock('2026-03-10T12:00:00.000Z'))).toBe('active');
    expect(announcementState(a, fixedClock('2026-03-11T11:59:59.000Z'))).toBe('active');
    expect(announcementState(a, fixedClock('2026-03-11T12:00:00.000Z'))).toBe('expired');
  });

  it('bannersFor returns only active, targeted, banner announcements, newest first', () => {
    const older = ann(21, { publishAt: '2026-03-09T08:00:00.000Z' });
    const newer = ann(22, { publishAt: '2026-03-10T09:00:00.000Z' });
    const future = ann(23, { publishAt: '2026-03-12T09:00:00.000Z' });
    const expired = ann(24, { publishAt: '2026-03-01T09:00:00.000Z', expiresAt: '2026-03-02T09:00:00.000Z' });
    const notifyOnly = ann(25, { channels: ['notification'] });
    const elsewhere = ann(26, { audience: { clientIds: [uid(7)], sides: ['client'] } });
    const got = bannersFor([older, future, expired, notifyOnly, elsewhere, newer], target, clock);
    expect(got.map((a) => a.id)).toEqual([newer.id, older.id]);
  });
});

describe('maintenance flags', () => {
  const win = (n: number, apps: MaintenanceWindow['apps'], startsAt: string, endsAt: string): MaintenanceWindow => ({
    id: uid(n),
    apps,
    startsAt,
    endsAt,
    message: 'Short planned maintenance.',
  });

  it('is on per app only inside its window and for the apps it names', () => {
    const w = win(30, ['client', 'provider'], '2026-03-10T11:00:00.000Z', '2026-03-10T13:00:00.000Z');
    expect(maintenanceFlags([w], clock)).toEqual({ staff: false, client: true, provider: true });
  });

  it('is off before the window starts and from the moment it ends', () => {
    const w = win(31, ['staff', 'client', 'provider'], '2026-03-10T12:00:00.000Z', '2026-03-10T14:00:00.000Z');
    const off = { staff: false, client: false, provider: false };
    expect(maintenanceFlags([w], fixedClock('2026-03-10T11:59:59.000Z'))).toEqual(off);
    expect(maintenanceFlags([w], fixedClock('2026-03-10T12:00:00.000Z'))).toEqual({ staff: true, client: true, provider: true });
    expect(maintenanceFlags([w], fixedClock('2026-03-10T14:00:00.000Z'))).toEqual(off);
  });
});

describe('Learn more open counts', () => {
  const ev = (n: number, type: LearningEvent['type'], linkId?: string): LearningEvent => ({
    id: uid(n),
    clientId: uid(1),
    siteId: uid(4),
    personId: uid(5),
    at: '2026-03-10T10:00:00.000Z',
    type,
    ...(linkId === undefined ? {} : { linkId }),
  });

  it('counts learnMoreOpened events per link, sorted by opens then link, ignoring other events', () => {
    const events = [
      ev(40, 'learnMoreOpened', 'eyfs-ratios'),
      ev(41, 'learnMoreOpened', 'fire-guide'),
      ev(42, 'learnMoreOpened', 'eyfs-ratios'),
      ev(43, 'learnMoreOpened', 'eyfs-ratios'),
      ev(44, 'learnMoreOpened', 'abc-link'),
      ev(45, 'lessonViewed', 'eyfs-ratios'),
      ev(46, 'learnMoreOpened'),
    ];
    expect(learnMoreCounts(events)).toEqual([
      { linkId: 'eyfs-ratios', opens: 3 },
      { linkId: 'abc-link', opens: 1 },
      { linkId: 'fire-guide', opens: 1 },
    ]);
    expect(learnMoreCounts([])).toEqual([]);
  });
});

// Announcements, maintenance windows and Learn more open counts (build pack M4). Pure: time comes from the injected Clock.
import type { Clock } from './clock';
import type { Announcement } from './schemas/m4';
import type { LearningEvent } from './schemas/learning';

export type CommsTarget = { clientId: string; packageId: string; packId: string; side: 'staff' | 'client' };
export type MaintenanceApp = 'staff' | 'client' | 'provider';
export type MaintenanceWindow = {
  id: string;
  apps: MaintenanceApp[];
  startsAt: string;
  endsAt: string;
  message: string;
};

export const announcementReaches = (a: Announcement, target: CommsTarget): boolean => {
  const { clientIds, packageIds, packIds, sides } = a.audience;
  if (!sides.includes(target.side)) return false;
  const lists = [
    clientIds && clientIds.length > 0 ? clientIds.includes(target.clientId) : undefined,
    packageIds && packageIds.length > 0 ? packageIds.includes(target.packageId) : undefined,
    packIds && packIds.length > 0 ? packIds.includes(target.packId) : undefined,
  ].filter((v): v is boolean => v !== undefined);
  return lists.length === 0 || lists.some(Boolean);
};

export const announcementState = (a: Announcement, clock: Clock): 'scheduled' | 'active' | 'expired' => {
  const now = clock.now().getTime();
  if (now < Date.parse(a.publishAt)) return 'scheduled';
  if (a.expiresAt !== undefined && now >= Date.parse(a.expiresAt)) return 'expired';
  return 'active';
};

export const bannersFor = (announcements: Announcement[], target: CommsTarget, clock: Clock): Announcement[] =>
  announcements
    .filter(
      (a) =>
        a.channels.includes('banner') && announcementState(a, clock) === 'active' && announcementReaches(a, target),
    )
    .sort((x, y) => Date.parse(y.publishAt) - Date.parse(x.publishAt));

export const maintenanceFlags = (windows: MaintenanceWindow[], clock: Clock): Record<MaintenanceApp, boolean> => {
  const now = clock.now().getTime();
  const flags: Record<MaintenanceApp, boolean> = { staff: false, client: false, provider: false };
  for (const w of windows) {
    if (now >= Date.parse(w.startsAt) && now < Date.parse(w.endsAt)) for (const app of w.apps) flags[app] = true;
  }
  return flags;
};

export const learnMoreCounts = (events: LearningEvent[]): { linkId: string; opens: number }[] => {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'learnMoreOpened' && e.linkId !== undefined) counts.set(e.linkId, (counts.get(e.linkId) ?? 0) + 1);
  }
  return [...counts]
    .map(([linkId, opens]) => ({ linkId, opens }))
    .sort((a, b) => b.opens - a.opens || (a.linkId < b.linkId ? -1 : a.linkId > b.linkId ? 1 : 0));
};

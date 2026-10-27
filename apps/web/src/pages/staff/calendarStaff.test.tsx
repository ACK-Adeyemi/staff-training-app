// M3 chunk 18b (BP-13, F-4 staff part): S18 Calendar and its entry points. Written before the implementation.
// Seed (build pack 7.3): today is Monday 19 October 2026. Jade has one open assignment, Safeguarding and
// whistleblowing, due Monday 2 November 2026 (two weeks on), so it sits in "Later".
//
// UI CONTRACT (data layer: a new store.calendar service, see calendarClient.test.tsx; the page may also derive items
// with the domain calendarItems from reads Jade is allowed. Titles come from the language file keys named by the
// domain titleKey, so every calendar.* titleKey in packages/domain/src/calendar/items.ts needs a string):
//   S18 /staff/calendar: h1 "Calendar". Radiogroup "View" with radios "List" (default) and "Month".
//   List view: agenda groups with headings "Today", "This week", "Next week", "Later" (a group with no items is not
//     drawn). Range today to 90 days. Each item is a listitem with data-kind (the domain CalendarKind), a title
//     (text) and buttons:
//       - the action button, named by kind: assignmentDue and refresherStart "Start training" (opens
//         /staff/module/<moduleId>), awaitingCheck and expiry "See my compliance" (opens /staff/progress),
//         competitionStart/End/Winners "See competitions" (opens /staff/compete), weeklyGoal "See my progress"
//         (opens /staff/progress), leaveEnd none,
//       - "Add to phone calendar" (accessible name starts "Add to phone calendar") which downloads a .ics file holding
//         exactly that one item.
//     Button "See further" adds 90 days at a time up to 365 and disappears at the limit. Button "Download all (.ics)"
//     downloads every item currently listed. Downloads are Blobs of type text/calendar (app/ics.ts) saved with a
//     name ending ".ics" and role=status "Calendar file downloaded." follows.
//   Month view: role=grid for the month (MonthGrid), gridcells with a count label on days that have items, button
//     "Next" moves to next month; choosing a day lists that day's items (same listitems as above).
//   Home (S2): a link "See calendar" to /staff/calendar. Progress (S8): a link "Calendar" to /staff/calendar.
//   Staff never see other people's names or payment/billing items (no data-kind planRenewal, invoiceDue,
//   addOnTrialEnd, accountStateChange).
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Assignment } from '@sta/domain';
import { renderRoute } from '../../test/harness';
import { captureDownloads, ICS_ALLOWED, parseIcs, readBlob } from '../../test/calendarHelpers';

afterEach(cleanup);

const items = () => Array.from(document.querySelectorAll<HTMLElement>('li[data-kind]'));
const dump = async <R,>(handle: { admin: { dumpAll: () => Promise<unknown> } }, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as Record<string, unknown[]>)[store] as R[];

async function open() {
  const view = await renderRoute('/staff/calendar', 'staff');
  await screen.findByRole('heading', { level: 1, name: 'Calendar' });
  await waitFor(() => {
    expect(items().length).toBeGreaterThan(0);
  });
  return view;
}

describe('S18 Calendar (list)', () => {
  it("lists Jade's open Safeguarding assignment under Later, due in two weeks", async () => {
    await open();
    const later = screen.getByRole('heading', { name: 'Later' }).closest('section') as HTMLElement;
    const due = within(later)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('data-kind') === 'assignmentDue');
    expect(due?.textContent).toMatch(/Safeguarding and whistleblowing/);
  });

  it('shows only the four group headings that have items, in order, with none of the admin or payment kinds', async () => {
    await open();
    const headings = screen
      .getAllByRole('heading')
      .map((h) => h.textContent)
      .filter((x) => ['Today', 'This week', 'Next week', 'Later'].includes(x));
    const order = ['Today', 'This week', 'Next week', 'Later'];
    expect(headings).toEqual(order.filter((h) => headings.includes(h)));
    expect(headings).toContain('Later');
    const kinds = items().map((li) => li.getAttribute('data-kind'));
    for (const banned of [
      'planRenewal',
      'invoiceDue',
      'addOnTrialEnd',
      'accountStateChange',
      'newStarter',
      'ruleRefresher',
    ]) {
      expect(kinds).not.toContain(banned);
    }
  });

  it("opens the assignment's module from the item action", async () => {
    const { router, handle } = await open();
    const [a] = (await dump<Assignment>(handle, 'assignments')).filter(
      (x) => x.status === 'open' && 'moduleId' in x.target,
    );
    expect(a).toBeDefined();
    const li = items().find((x) => x.getAttribute('data-kind') === 'assignmentDue') as HTMLElement;
    await userEvent.click(within(li).getByRole('button', { name: 'Start training' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/staff\/module\/[^/]+$/);
    });
  });

  it('shows See further until 365 days, adding more items or none, and then hides it', async () => {
    await open();
    const user = userEvent.setup();
    const before = items().length;
    await user.click(screen.getByRole('button', { name: 'See further' }));
    await waitFor(() => {
      expect(items().length).toBeGreaterThanOrEqual(before);
    });
    for (let i = 0; i < 6 && screen.queryByRole('button', { name: 'See further' }); i++) {
      await user.click(screen.getByRole('button', { name: 'See further' }));
    }
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'See further' })).toBeNull();
    });
  });
});

describe('S18 .ics downloads', () => {
  it('Add to phone calendar downloads a one-event file with only the title and dates', async () => {
    const cap = captureDownloads();
    try {
      await open();
      const li = items().find((x) => x.getAttribute('data-kind') === 'assignmentDue') as HTMLElement;
      const title = li.querySelector('[data-title]')?.textContent ?? '';
      await userEvent.click(within(li).getByRole('button', { name: /^Add to phone calendar/ }));
      await waitFor(() => {
        expect(cap.blobs).toHaveLength(1);
      });
      expect(cap.blobs[0]?.type).toMatch(/^text\/calendar/);
      expect(cap.names[0]).toMatch(/\.ics$/);
      const lines = parseIcs(await readBlob(cap.blobs[0] as Blob));
      expect(lines.filter((l) => l.name === 'BEGIN' && l.value === 'VEVENT')).toHaveLength(1);
      const summary = lines.find((l) => l.name === 'SUMMARY');
      expect(summary?.value.length).toBeGreaterThan(0);
      if (title) expect(summary?.value.replace(/\\/g, '')).toContain(title);
      const dtstart = lines.find((l) => l.name === 'DTSTART');
      expect(dtstart?.params).toBe('VALUE=DATE');
      expect(dtstart?.value).toBe('20261102');
      expect(lines.find((l) => l.name === 'DTSTAMP')?.value).toBe('20261019T090000Z');
      for (const l of lines) expect(ICS_ALLOWED.has(l.name)).toBe(true);
      await screen.findByText('Calendar file downloaded.');
    } finally {
      cap.restore();
    }
  });

  it('Download all (.ics) holds one event per listed item and nothing but the allowed properties', async () => {
    const cap = captureDownloads();
    try {
      await open();
      const listed = items().length;
      await userEvent.click(screen.getByRole('button', { name: 'Download all (.ics)' }));
      await waitFor(() => {
        expect(cap.blobs).toHaveLength(1);
      });
      expect(cap.blobs[0]?.type).toMatch(/^text\/calendar/);
      const text = await readBlob(cap.blobs[0] as Blob);
      expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
      expect(text.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
      const lines = parseIcs(text);
      expect(lines.filter((l) => l.name === 'BEGIN' && l.value === 'VEVENT')).toHaveLength(listed);
      expect(lines.find((l) => l.name === 'VERSION')?.value).toBe('2.0');
      for (const l of lines) expect(ICS_ALLOWED.has(l.name)).toBe(true);
      // No other person's name and no ids.
      expect(text).not.toMatch(/Hannah|Chris Wood|Lucy|Priya|Daniel/);
      expect(text).not.toMatch(/01[0-9A-HJKMNP-TV-Z]{24}/);
    } finally {
      cap.restore();
    }
  });
});

describe('S18 Calendar (month)', () => {
  it('shows a month grid, moves to November and lists 2 November when chosen', async () => {
    await open();
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Month' }));
    const grid = await screen.findByRole('grid');
    expect(grid).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const cells = within(await screen.findByRole('grid')).getAllByRole('gridcell');
    const second = cells.find((c) => c.textContent.startsWith('2') && c.getAttribute('aria-label') !== '2');
    expect(second, 'the cell for 2 November carries a count label').toBeTruthy();
    await user.click(second as HTMLElement);
    await waitFor(() => {
      expect(items().some((li) => li.getAttribute('data-kind') === 'assignmentDue')).toBe(true);
    });
  });
});

describe('entry points', () => {
  it('Home has a See calendar link to the calendar', async () => {
    await renderRoute('/staff', 'staff');
    const link = await screen.findByRole('link', { name: 'See calendar' });
    expect(link.getAttribute('href')).toContain('/staff/calendar');
  });

  it('My compliance has a Calendar link to the calendar', async () => {
    await renderRoute('/staff/progress', 'staff');
    await screen.findByRole('heading', { level: 1 });
    const links = await within(screen.getByRole('main')).findAllByRole('link', { name: 'Calendar' });
    expect(links.some((l) => l.getAttribute('href')?.includes('/staff/calendar'))).toBe(true);
  });
});

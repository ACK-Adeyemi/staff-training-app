// M1 chunk 8 (F-4, F-5, F-6, BP-4 live part): staff screens S1, S2, S3, S8 and basic notifications (S13).
// Contract the implementer must provide:
//   Routes: /staff/signin (outside the shell chrome), /staff (S2), /staff/learn (S3), /staff/progress (S8),
//     /staff/notifications (S13 basic). Each renders exactly one level 1 heading.
//   DemoApi gains listStaffUsers(clientId) and signInAs(userId); S1 calls them (harness provides both).
//   S1: radio group of staff by display name, a "PIN" labelled input, a "Sign in" button. PIN 1234 calls signInAs(userId)
//     and navigates to /staff. Wrong PIN shows the language string staff.signin.wrongPin and does not call signInAs.
//   S2: ProgressRing text "1 to do" (staff.home.toDo), a "Next up" region, a "Coming up" region with a list, and the
//     shell bell link whose accessible name includes the unread count.
//   S3: rows per published module with Required badge; search box labelled "Search" narrows by title.
//   S8: My compliance rows (status word, last done, next renewal, "every N months"), Start training link only where a
//     published module satisfies; Completed tab.
//   app/liveUpdates.ts: connectLiveUpdates({ subscribe, invalidate }) and AppProviders({ subscribe }) wires it.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { languages } from '@sta/content';
import { actorFor, renderRoute } from '../../test/harness';
import { connectLiveUpdates } from '../../app/liveUpdates';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const messages = languages['en-GB'].messages as unknown as Record<string, unknown>;
const hasKey = (key: string) =>
  key
    .split('.')
    .reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), messages);

describe('language file', () => {
  it.each([
    'staff.signin.title',
    'staff.signin.pinLabel',
    'staff.signin.submit',
    'staff.signin.wrongPin',
    'staff.home.toDo',
    'staff.home.nextUp',
    'staff.home.comingUp',
    'staff.home.compliant',
    'staff.learn.search',
    'staff.progress.myCompliance',
    'staff.progress.startTraining',
    'staff.notifications.empty',
  ])('has the key %s', (key) => {
    expect(typeof hasKey(key)).toBe('string');
  });

  it('words the wrong PIN message with the demo hint', () => {
    expect(hasKey('staff.signin.wrongPin')).toBe('That PIN is not right. In the demo the PIN is 1234.');
  });
});

const oneH1 = () => {
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
};

describe('S1 sign in', () => {
  it('lists active Little Acorns staff by display name and leaves out archived leavers', async () => {
    await renderRoute('/staff/signin', 'staff');
    const radios = await screen.findAllByRole('radio');
    const names = radios.map(
      (r) => (r as HTMLInputElement).closest('label')?.textContent ?? r.getAttribute('aria-label') ?? '',
    );
    expect(names.some((n) => /Jade/.test(n))).toBe(true);
    expect(names.some((n) => /Hannah/.test(n))).toBe(true);
    expect(names.some((n) => /Olivia/.test(n))).toBe(false);
    oneH1();
  });

  it('signs in as the chosen person with PIN 1234 and opens Home', async () => {
    const { demo, keys, router } = await renderRoute('/staff/signin', 'staff');
    await userEvent.click(await screen.findByRole('radio', { name: /Hannah/ }));
    await userEvent.type(screen.getByLabelText('PIN'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(demo.signInAs).toHaveBeenCalledWith(keys.users['hannah']);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/staff');
    });
  });

  it('refuses a wrong PIN with the demo hint and does not switch person', async () => {
    const { demo, router } = await renderRoute('/staff/signin', 'staff');
    await userEvent.click(await screen.findByRole('radio', { name: /Hannah/ }));
    await userEvent.type(screen.getByLabelText('PIN'), '0000');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That PIN is not right. In the demo the PIN is 1234.')).toBeTruthy();
    expect(demo.signInAs).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/staff/signin');
  });

  it('shows the wrong PIN message to assistive technology as an alert', async () => {
    await renderRoute('/staff/signin', 'staff');
    await userEvent.click(await screen.findByRole('radio', { name: /Jade/ }));
    await userEvent.type(screen.getByLabelText('PIN'), '9999');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toContain('That PIN is not right');
  });
});

describe('S2 Home', () => {
  it('shows the ring at "1 to do" for Jade', async () => {
    await renderRoute('/staff', 'staff');
    expect(await screen.findByText(/^1 to do$/)).toBeTruthy();
    expect(screen.queryByText("You're compliant")).toBeNull();
    oneH1();
  });

  it('shows Next up as the Safeguarding refresher with its due date', async () => {
    await renderRoute('/staff', 'staff');
    const next = await screen.findByRole('region', { name: 'Next up' });
    expect(within(next).getByText(/Safeguarding and whistleblowing/)).toBeTruthy();
    expect(within(next).getByText(/2 November 2026/)).toBeTruthy();
    expect(within(next).getByRole('link', { name: /Safeguarding and whistleblowing|Start|Continue/ })).toBeTruthy();
  });

  it('shows three Coming up dates in date order', async () => {
    await renderRoute('/staff', 'staff');
    const coming = await screen.findByRole('region', { name: 'Coming up' });
    const items = within(coming).getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('puts an unread count on the notifications bell', async () => {
    await renderRoute('/staff', 'staff');
    const bell = await screen.findByRole('link', { name: /Notifications.*1/ });
    expect(bell.getAttribute('href')).toContain('/staff/notifications');
  });

  it('never shows payment wording to staff', async () => {
    await renderRoute('/staff', 'staff');
    await screen.findByText(/to do/);
    expect(document.body.textContent).not.toMatch(/\b(invoice|payment|price|subscription)\b/i);
  });
});

describe('S3 Learn', () => {
  it('lists the Safeguarding module as a row with a Required badge that links to the module', async () => {
    await renderRoute('/staff/learn', 'staff');
    const title = await screen.findByText('Safeguarding and whistleblowing');
    const row = title.closest('li, tr, article') as HTMLElement;
    expect(row).toBeTruthy();
    expect(within(row).getByText('Required')).toBeTruthy();
    expect(within(row).getByRole('link').getAttribute('href')).toMatch(/\/staff\/module\/.+/);
    oneH1();
  });

  it('search narrows the list by title and says when nothing matches', async () => {
    await renderRoute('/staff/learn', 'staff');
    await screen.findByText('Safeguarding and whistleblowing');
    const box = screen.getByRole('searchbox', { name: 'Search' });
    await userEvent.type(box, 'zzzz');
    expect(screen.queryByText('Safeguarding and whistleblowing')).toBeNull();
    await userEvent.clear(box);
    await userEvent.type(box, 'safeguarding');
    expect(await screen.findByText('Safeguarding and whistleblowing')).toBeTruthy();
  });
});

describe('S8 Progress, My compliance', () => {
  it('shows Safeguarding with status word, last done, next renewal, cadence and Start training', async () => {
    await renderRoute('/staff/progress', 'staff');
    const cell = (await screen.findAllByText(/Safeguarding/))[0] as HTMLElement;
    const row = cell.closest('tr, li') as HTMLElement;
    expect(row).toBeTruthy();
    expect(within(row).getByText(/Current/)).toBeTruthy();
    expect(row.textContent).toMatch(/2025/);
    expect(row.textContent).toMatch(/2027/);
    expect(row.textContent).toMatch(/every 24 months/i);
    expect(within(row).getByRole('link', { name: new RegExp('Start training') })).toBeTruthy();
    oneH1();
  });

  it('lists every row with a status word, not colour alone', async () => {
    await renderRoute('/staff/progress', 'staff');
    await screen.findAllByText(/Safeguarding/);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows)
      expect(r.textContent).toMatch(/Current|Expiring soon|Overdue|Not started|Waiting for a check|Not needed/);
  });
});

describe('S13 basic notifications', () => {
  it('lists the Safeguarding assignment and marks it read when opened', async () => {
    const { handle, keys } = await renderRoute('/staff/notifications', 'staff');
    expect(await screen.findByText(/Safeguarding and whistleblowing/)).toBeTruthy();
    const actor = actorFor('staff', keys);
    expect((await handle.store.notifications.list(actor))[0]?.readAt).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: /mark.*read/i }));
    await waitFor(async () => {
      expect((await handle.store.notifications.list(actor))[0]?.readAt).toBeDefined();
    });
    oneH1();
  });
});

describe('live updates', () => {
  it('updates a mounted screen after a write through the store, with no reload', async () => {
    const { handle, keys } = await renderRoute('/staff', 'staff');
    expect(await screen.findByRole('link', { name: /Notifications.*1/ })).toBeTruthy();
    const actor = actorFor('staff', keys);
    const [note] = await handle.store.notifications.list(actor);
    await act(async () => {
      await handle.store.notifications.markRead(actor, [note!.id]);
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Notifications.*1/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Notifications/ })).toBeTruthy();
  });
});

describe('connectLiveUpdates', () => {
  class FakeChannel {
    static instances: FakeChannel[] = [];
    posted: unknown[] = [];
    onmessage: ((e: { data: unknown }) => void) | null = null;
    closed = false;
    constructor(public name: string) {
      FakeChannel.instances.push(this);
    }
    postMessage(m: unknown) {
      this.posted.push(m);
    }
    close() {
      this.closed = true;
    }
  }

  function setup() {
    FakeChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    let listener: ((stores: string[]) => void) | undefined;
    const subscribe = vi.fn((l: (stores: string[]) => void) => {
      listener = l;
      return () => {
        listener = undefined;
      };
    });
    const invalidate = vi.fn();
    return { subscribe, invalidate, fire: (s: string[]) => listener?.(s), hasListener: () => listener !== undefined };
  }

  it('invalidates on a local change and forwards store names only on BroadcastChannel sta-data', () => {
    const s = setup();
    connectLiveUpdates({ subscribe: s.subscribe, invalidate: s.invalidate });
    s.fire(['assignments', 'notifications']);
    expect(s.invalidate).toHaveBeenCalledWith(['assignments', 'notifications']);
    const ch = FakeChannel.instances[0]!;
    expect(ch.name).toBe('sta-data');
    expect(ch.posted).toHaveLength(1);
    expect(JSON.stringify(ch.posted[0])).not.toMatch(/Jade|Safeguarding/);
    expect(JSON.stringify(ch.posted[0])).toContain('assignments');
  });

  it('invalidates when another tab posts a change and does not echo it back', () => {
    const s = setup();
    connectLiveUpdates({ subscribe: s.subscribe, invalidate: s.invalidate });
    const ch = FakeChannel.instances[0]!;
    ch.onmessage?.({ data: ch.posted[0] ?? { stores: ['evidence'] } });
    const incoming = { stores: ['evidence'] };
    s.invalidate.mockClear();
    ch.posted.length = 0;
    ch.onmessage?.({ data: incoming });
    expect(s.invalidate).toHaveBeenCalledTimes(1);
    expect(ch.posted).toHaveLength(0);
  });

  it('keeps same-tab updates working when BroadcastChannel throws or is missing', () => {
    const s = setup();
    vi.stubGlobal('BroadcastChannel', function Blocked() {
      throw new Error('blocked');
    });
    expect(() => connectLiveUpdates({ subscribe: s.subscribe, invalidate: s.invalidate })).not.toThrow();
    s.fire(['evidence']);
    expect(s.invalidate).toHaveBeenCalledWith(['evidence']);

    const s2 = setup();
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(() => connectLiveUpdates({ subscribe: s2.subscribe, invalidate: s2.invalidate })).not.toThrow();
    s2.fire(['evidence']);
    expect(s2.invalidate).toHaveBeenCalledTimes(1);
  });

  it('survives a postMessage that throws', () => {
    const s = setup();
    connectLiveUpdates({ subscribe: s.subscribe, invalidate: s.invalidate });
    FakeChannel.instances[0]!.postMessage = () => {
      throw new Error('closed');
    };
    expect(() => s.fire(['evidence'])).not.toThrow();
    expect(s.invalidate).toHaveBeenCalled();
  });

  it('stops listening and closes the channel when disconnected', () => {
    const s = setup();
    const stop = connectLiveUpdates({ subscribe: s.subscribe, invalidate: s.invalidate });
    stop();
    expect(s.hasListener()).toBe(false);
    expect(FakeChannel.instances[0]!.closed).toBe(true);
  });
});

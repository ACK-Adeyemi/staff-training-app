// M2 chunk 15 (F-1, F-2): S8 History, XP and level tabs, and the record print view.
// Contract on /staff/progress (existing tabs "My compliance" and "Completed" stay):
//   - tab "History": comboboxes "Year" (first option "All years") and "Module" (first option "All modules"); a list of
//     data-testid="timeline-item" (data-kind lesson|attempt|badge, data-at ISO) newest first, each text naming its module
//     (or badge); attempt items show "<score>%". Tables "Weekly activity" (12 rows) and "Score trend" are the text
//     alternatives to the charts. Link "Download my record" with href ending /staff/progress/record.
//   - tab "XP and level": progressbar whose valuetext starts "Level <n>", text "<total> XP in total", the note
//     "Taking longer never costs you anything", and entries data-testid="xp-entry" (data-kind, newest first).
//   /staff/progress/record: h1 "My training record", the person's full name, a "Completed training" table, text
//     "Level <n>", a "Print" button calling window.print, and never any note text.
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { levelConfig, nurseryModules } from '@sta/content';
import { levelFor, xpLedger, xpTotal } from '@sta/domain';
import type { StoreHandle } from '@sta/data';
import { actorFor, renderRoute } from '../../test/harness';
import { sgModule } from '../../test/quizHelpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
type Dump = Record<string, Record<string, unknown>[]>;

async function expectedXp(handle: StoreHandle) {
  const d = (await handle.admin.dumpAll()) as unknown as Dump;
  const jade = d.people!.find((p) => p['firstName'] === 'Jade')!['id'] as string;
  const ledger = xpLedger({
    events: d.learningEvents as never,
    attempts: d.attempts as never,
    modules: nurseryModules,
    evidence: d.evidence as never,
    requirements: d.requirements as never,
    weeklyGoalLessons: 1,
    personId: jade,
  });
  const total = xpTotal(ledger);
  return { ledger, total, level: levelFor(total, levelConfig.thresholds, levelConfig.stepAfterTable) };
}
async function openTab(name: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name }));
  return user;
}

describe('S8 History tab', () => {
  it('lists a timeline of lessons, attempts and badges with the weekly and score tables', async () => {
    await renderRoute('/staff/progress', 'staff');
    await openTab('History');
    const items = await screen.findAllByTestId('timeline-item');
    const kinds = new Set(items.map((i) => i.getAttribute('data-kind')));
    expect(kinds.has('attempt')).toBe(true);
    const ats = items.map((i) => i.getAttribute('data-at')!);
    expect(ats).toEqual([...ats].sort().reverse());
    expect(items.find((i) => i.getAttribute('data-kind') === 'attempt')!.textContent).toMatch(/\d+%/);
    expect(within(screen.getByRole('table', { name: 'Weekly activity' })).getAllByRole('row')).toHaveLength(13);
    expect(screen.getByRole('table', { name: 'Score trend' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download my record' }).getAttribute('href')).toMatch(
      /\/staff\/progress\/record$/,
    );
  });

  it('filters by module', async () => {
    await renderRoute('/staff/progress', 'staff');
    const user = await openTab('History');
    const all = (await screen.findAllByTestId('timeline-item')).length;
    await user.selectOptions(screen.getByRole('combobox', { name: 'Module' }), sgModule.title);
    const some = screen.getAllByTestId('timeline-item');
    expect(some.length).toBeGreaterThan(0);
    expect(some.length).toBeLessThan(all);
    for (const i of some) expect(i.textContent).toContain(sgModule.title);
  });

  it('filters by year', async () => {
    await renderRoute('/staff/progress', 'staff');
    const user = await openTab('History');
    await screen.findAllByTestId('timeline-item');
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Year' });
    const year = [...select.options].map((o) => o.text).find((x) => /^\d{4}$/.test(x))!;
    await user.selectOptions(select, year);
    const shown = screen.getAllByTestId('timeline-item');
    for (const i of shown) expect(i.getAttribute('data-at')).toMatch(new RegExp(`^${year}`));
  });
});

describe('S8 XP and level tab', () => {
  it('shows the level bar, total XP and recent entries from the derived ledger', async () => {
    const { handle } = await renderRoute('/staff/progress', 'staff');
    await openTab('XP and level');
    const want = await expectedXp(handle);
    const bar = await screen.findByRole('progressbar');
    expect(bar.getAttribute('aria-valuetext')).toMatch(new RegExp(`^Level ${want.level.level}\\b`));
    expect(screen.getByText(`${want.total} XP in total`)).toBeTruthy();
    expect(screen.getByText(/Taking longer never costs you anything/)).toBeTruthy();
    const entries = screen.getAllByTestId('xp-entry');
    expect(entries.length).toBeGreaterThan(0);
    const newest = [...want.ledger].reverse().find((e) => e.amount > 0 || e.capped);
    expect(entries[0]!.getAttribute('data-kind')).toBe(newest!.kind);
  });
});

describe('S8 record print view', () => {
  it('shows the learner their own record, with level and completed training, and no notes', async () => {
    const SECRET = 'Private memory aid QX42';
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const user = userEvent.setup();
    const { handle } = await renderRoute('/staff/progress/record', 'staff', {
      prepare: async ({ handle: h, keys }) => {
        await h.store.notes.save(actorFor('staff', keys), { moduleId: sgModule.id, body: SECRET });
      },
    });
    expect((await screen.findByRole('heading', { level: 1, name: 'My training record' })).textContent).toBeTruthy();
    const want = await expectedXp(handle);
    expect(screen.getByText(/Jade/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`Level ${want.level.level}\\b`))).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Completed training' })).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRET);
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
  });
});

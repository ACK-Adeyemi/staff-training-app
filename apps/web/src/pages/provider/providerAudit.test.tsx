// M4 chunk 15b: P20 "Audit log" at /provider/audit (BP-8, brief 22). Written before the implementation
// (component `Audit` in ./ProviderAudit.tsx).
//
// UI CONTRACT
//   Data (exists): store.audit.list (needs audit.read; the page checks holdsAnywhere(perms, 'audit.read'), never role names).
//   Proposed language keys (en-GB):
//     provider.audit.heading "Audit log"   .noAccess "You do not have access to the audit log."
//     provider.audit.action "Action"  .allActions "All actions"  .client "Client"  .allClients "All clients"
//     provider.audit.empty "No events match."   .actor "Who"   .when "When"
//   h1 "Audit log". Without audit.read: only the no-access message, no rows or filters.
//   data-testid="audit-row" (data-event-id) per event, newest first (by `at`), each with the actor's name and a
//   <time dateTime={at}> element. Rows show action and target only: never before/after values or reason text.
//   Comboboxes "Action" (options: "All actions" plus each distinct action as its text) and "Client" (options: "All
//   clients" plus client names); choosing narrows the rows. Events with no clientId are hidden by a client filter.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditEvent, Role, RoleAssignment } from '@sta/domain';
import { actorFor, renderRoute } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
type Prepare = NonNullable<NonNullable<Opts>['prepare']>;
const as = (key: string): Opts => ({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users[key]! }) });

const SECRET = 'private.person@example.test';
const ev = (
  n: number,
  actorId: string,
  action: string,
  at: string,
  clientId?: string,
  extra: Partial<AuditEvent> = {},
): AuditEvent => ({
  id: `01HZX00000000000000000AD${String(n).padStart(2, '0')}`,
  actorId,
  actorSide: 'provider',
  ...(clientId ? { clientId } : {}),
  action,
  target: `target-${n}`,
  at,
  ...extra,
});

const withEvents: Prepare = async ({ handle, keys }) => {
  const owner = keys.users['providerOwner'];
  const sophie = keys.users['sophie'];
  const little = keys.clients['littleAcorns'];
  await handle.admin.bulkPut('audit', [
    ev(1, owner, 'zz.first', '2026-10-10T08:00:00.000Z', little, { after: { email: SECRET }, reason: SECRET }),
    ev(2, sophie, 'zz.second', '2026-10-12T08:00:00.000Z'),
    ev(3, owner, 'zz.third', '2026-10-11T08:00:00.000Z', little),
  ]);
};

const openP20 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/audit', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Audit log' });
  return view;
};
const mine = () =>
  screen
    .getAllByTestId('audit-row')
    .filter((r) => /^01HZX00000000000000000AD/.test(r.getAttribute('data-event-id') ?? ''));
const ids = () => mine().map((r) => r.getAttribute('data-event-id')!.slice(-2));

describe('P20 Audit log', () => {
  it('shows only a no-access message to someone without audit.read', async () => {
    await renderRoute('/provider/audit', 'provider', { ...as('sophie'), prepare: withEvents });
    expect(await screen.findByText('You do not have access to the audit log.')).toBeTruthy();
    expect(screen.queryAllByTestId('audit-row')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox', { name: 'Action' })).toHaveLength(0);
  });

  it('lists the events newest first, each with the actor name and the time', async () => {
    await openP20({ prepare: withEvents });
    await waitFor(() => {
      expect(mine()).toHaveLength(3);
    });
    expect(ids()).toEqual(['02', '03', '01']);
    const first = mine()[0]!;
    expect(first.textContent).toContain('zz.second');
    expect(first.textContent).toContain('Sophie');
    expect(
      within(first)
        .getByText((_, el) => el?.tagName === 'TIME')
        .getAttribute('datetime'),
    ).toBe('2026-10-12T08:00:00.000Z');
    expect(mine()[1]!.textContent).toContain('Owner');
  });

  it('filters by action', async () => {
    await openP20({ prepare: withEvents });
    await waitFor(() => {
      expect(mine()).toHaveLength(3);
    });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'zz.third');
    await waitFor(() => {
      expect(ids()).toEqual(['03']);
    });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'All actions');
    await waitFor(() => {
      expect(mine()).toHaveLength(3);
    });
  });

  it('filters by client, hiding events with no client', async () => {
    await openP20({ prepare: withEvents });
    await waitFor(() => {
      expect(mine()).toHaveLength(3);
    });
    const select = screen.getByRole('combobox', { name: 'Client' });
    const named = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
      .find((n) => n.includes('Little Acorns'))!;
    await userEvent.selectOptions(select, named);
    await waitFor(() => {
      expect(ids()).toEqual(['03', '01']);
    });
  });

  it('shows no personal data from before, after or reason', async () => {
    await openP20({ prepare: withEvents });
    await waitFor(() => {
      expect(mine()).toHaveLength(3);
    });
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('lets an Admin (audit.read, not an owner) in', async () => {
    const rajIsAdmin: Prepare = async (ctx) => {
      const dump = await ctx.handle.admin.dumpAll();
      const admin = (dump['roles'] as Role[]).find((r) => r.system && r.systemKey === 'providerAdmin')!;
      const a = (dump['roleAssignments'] as RoleAssignment[]).find((x) => x.userId === ctx.keys.users['raj'])!;
      await ctx.handle.admin.bulkPut('roleAssignments', [{ ...a, roleIds: [admin.id] }]);
      await withEvents(ctx);
    };
    await openP20({ ...as('raj'), prepare: rajIsAdmin });
    await waitFor(() => {
      expect(mine()).toHaveLength(3);
    });
  });
});

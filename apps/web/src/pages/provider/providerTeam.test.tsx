// M4 chunk 15a (U layer): P18 "Team and roles" at /provider/team (BP-8, brief 22.2 to 22.4). Written before the
// implementation (component `Team` in ./ProviderTeam.tsx).
//
// UI CONTRACT
//   Data (all exist already): store.providerTeam (list, invite, setRole, suspend, reactivate, createRole, updateRole,
//   deleteRole), store.ownership (request, accept, confirmWithCode, complete, cancel, list), store.roles.list and
//   store.roleAssignments.list (team.read) for the role list, compare and effective permissions. The permission
//   catalogue is the static providerCatalogue from @sta/domain, so NO new data read is required. Domain helpers:
//   permissionGrid, withDependencies, dependantsOf, sensitiveIn, compareRoles, effectiveWithSources, demoTwoFactorCode.
//   Buttons and fields show only when holdsAnywhere(perms, <permission>) (never role names): team.read for the page,
//   team.manage for invite / change role / suspend / reactivate, roles.manage for role edits, owner.transfer for the
//   transfer form, owner.manageOwnerRoles for the Owner and Co-Owner roles. The page re-renders after a change.
//   Permission names in the matrix are the catalogue descriptions (for example "Manage the provider team").
//   Proposed language keys (en-GB):
//     provider.team.heading "Team and roles"   .noAccess "You do not have access to the team."
//     provider.team.readOnly "You can look at the team but not change anything here."
//     provider.team.members "Members"   .status.{active,invited,suspended} "Active", "Invited", "Suspended"
//     provider.team.invite.heading "Invite someone"  .email "Email"  .name "Name"  .role "Role"  .submit "Send invite"
//     provider.team.invite.error "Check the email address and name, then try again."
//     provider.team.changeRole "Change role"   .suspend "Suspend"  .reactivate "Reactivate"
//     provider.team.lastOwner "There must always be at least one Account Owner."
//     provider.team.roles "Roles"  .system "System role"  .custom "Custom role"  .new "New role"  .edit "Edit role"
//     provider.team.editor "Role editor"  .roleName "Role name"  .roleDescription "Description"  .save "Save role"
//     provider.team.sensitive "Sensitive"
//     provider.team.addedDeps "Also added because it needs them: {names}"
//     provider.team.blockedRemove "Cannot remove this yet. Needed by: {names}"
//     provider.team.compare "Compare roles"  .from "From role"  .to "To role"  .added "Added"  .removed "Removed"
//     provider.team.effective "Effective permissions"  .effectiveFor "Effective permissions for {name}"
//     provider.team.grantedBy "Granted by {role}"
//     provider.team.transfer.heading "Ownership transfer"  .newOwner "New owner"  .afterwards "Role for you afterwards"
//     provider.team.transfer.start "Start transfer"  .cancel "Cancel transfer"  .code "Confirmation code"
//     provider.team.transfer.confirm "Confirm"  .complete "Complete transfer"
//     provider.team.transfer.status.requested "Waiting for {name} to accept"
//     provider.team.transfer.status.accepted "{name} has accepted. Enter your confirmation code."
//     provider.team.transfer.status.confirmed "Confirmed. Cooling off ends in {days} days"  (singular "1 day")
//     provider.team.transfer.status.done "Done"  .status.cancelled "Cancelled"
//     provider.team.transfer.completeWaiting "Complete is available when the cooling-off period has ended."
//   P18 /provider/team:
//     - h1 "Team and roles". Without team.read: only the no-access message.
//     - data-testid="member-row" (data-user-id) per list() row: name, role names, status label. Row controls (team.manage):
//       combobox "Change role" (options are role names; choosing one calls setRole), buttons "Suspend" / "Reactivate",
//       and button "Effective permissions" (any team.read holder) which opens a region "Effective permissions for {name}"
//       with data-testid="effective-row" (data-permission-id) rows holding the description and "Granted by {role}".
//       A refused change (last Owner) shows its message in role="alert" and the row is unchanged.
//     - Invite (team.manage): region "Invite someone" with textboxes "Email" and "Name", combobox "Role" (option labels are
//       role names; Owner and Co-Owner are absent or disabled without owner.manageOwnerRoles), button "Send invite".
//     - Roles: data-testid="role-row" (data-role-id) with name and "System role" or "Custom role". Custom rows have
//       button "Edit role" and the page has "New role" (both roles.manage). Editor region "Role editor": textboxes
//       "Role name", "Description"; per area a data-testid="perm-area" (data-area) holding data-testid="perm-row"
//       (data-permission-id) rows, each a checkbox named by the description, plus the text "Sensitive" when the
//       permission is sensitive; role="status" text "Also added because it needs them: ..." after ticking; unticking a
//       permission others in the role need is blocked (stays ticked, role="alert" "Cannot remove this yet. Needed by: ...");
//       button "Save role".
//     - Region "Compare roles": comboboxes "From role" and "To role"; data-testid="compare-added" and "compare-removed"
//       list the permission descriptions going from the first role to the second.
//     - Region "Ownership transfer" (owner.transfer): comboboxes "New owner" (other active members by name) and "Role for
//       you afterwards", button "Start transfer". data-testid="transfer-row" shows the state text above, with button
//       "Cancel transfer" while open; once accepted a textbox "Confirmation code" and button "Confirm"; once confirmed the
//       button "Complete transfer", disabled with the completeWaiting text until coolingOffEndsAt has passed.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareRoles,
  demoTwoFactorCode,
  providerCatalogue,
  type OwnershipTransfer,
  type Role,
  type RoleAssignment,
} from '@sta/domain';
import { actorFor, renderRoute, TODAY } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
type Prepare = NonNullable<NonNullable<Opts>['prepare']>;
const as = (key: string): Opts => ({ actor: (keys) => ({ ...actorFor('provider', keys), userId: keys.users[key]! }) });
const describeOf = (id: string) => providerCatalogue.find((p) => p.id === id)!.description;

/** Gives Raj the Admin role (team.manage and roles-free, no owner rights, no owner.transfer). */
const rajIsAdmin: Prepare = async ({ handle, keys }) => {
  const dump = await handle.admin.dumpAll();
  const admin = (dump['roles'] as Role[]).find((r) => r.system && r.systemKey === 'providerAdmin')!;
  const a = (dump['roleAssignments'] as RoleAssignment[]).find((x) => x.userId === keys.users['raj'])!;
  await handle.admin.bulkPut('roleAssignments', [{ ...a, roleIds: [admin.id] }]);
};

const openP18 = async (opts?: Opts) => {
  const view = await renderRoute('/provider/team', 'provider', opts);
  await screen.findByRole('heading', { level: 1, name: 'Team and roles' });
  return view;
};
type View = Awaited<ReturnType<typeof openP18>>;
const rowOf = (view: View, userKey: string) => {
  const el = screen
    .getAllByTestId('member-row')
    .find((r) => r.getAttribute('data-user-id') === view.keys.users[userKey]);
  if (!el) throw new Error(`no member row for ${userKey}`);
  return el;
};
const ctxOf = (view: View, userKey: string) => ({
  ...actorFor('provider', view.keys),
  userId: view.keys.users[userKey]!,
  now: TODAY,
});
const nameOf = async (view: View, userKey: string) =>
  (await view.handle.store.providerTeam.list(ctxOf(view, 'providerOwner'))).find(
    (m) => m.userId === view.keys.users[userKey],
  )!.name;
const roleByName = async (view: View, name: string) =>
  ((await view.handle.admin.dumpAll())['roles'] as Role[]).find((r) => r.owner === 'provider' && r.name === name)!;
const permRow = (id: string) =>
  within(screen.getByRole('region', { name: 'Role editor' }))
    .getAllByTestId('perm-row')
    .find((r) => r.getAttribute('data-permission-id') === id)!;
const box = (id: string) => within(permRow(id)).getByRole<HTMLInputElement>('checkbox');
const openNewRole = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'New role' }));
  await screen.findByRole('region', { name: 'Role editor' });
};

describe('P18 Team and roles: members and invites', () => {
  it('lists every provider member with role names and status', async () => {
    const view = await openP18();
    const members = await view.handle.store.providerTeam.list(ctxOf(view, 'providerOwner'));
    expect(screen.getAllByTestId('member-row')).toHaveLength(members.length);
    const sophie = rowOf(view, 'sophie').textContent;
    expect(sophie).toContain(await nameOf(view, 'sophie'));
    expect(sophie).toContain('Support');
    expect(sophie).toContain('Active');
    expect(rowOf(view, 'providerOwner').textContent).toContain('Owner');
    expect(rowOf(view, 'raj').textContent).toContain('Billing');
  });

  it('shows only a no-access message to someone without team.read', async () => {
    await renderRoute('/provider/team', 'provider', as('sophie'));
    expect(await screen.findByText('You do not have access to the team.')).toBeTruthy();
    expect(screen.queryAllByTestId('member-row')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Send invite' })).toHaveLength(0);
  });

  it('invites a person with a preset role, who then appears as Invited with that role', async () => {
    const view = await openP18();
    const form = screen.getByRole('region', { name: 'Invite someone' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Email' }), 'new.person@example.test');
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Nia Newcomer');
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Role' }), 'Content Editor');
    await userEvent.click(within(form).getByRole('button', { name: 'Send invite' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('member-row').some((r) => r.textContent.includes('Nia Newcomer'))).toBe(true);
    });
    const row = screen.getAllByTestId('member-row').find((r) => r.textContent.includes('Nia Newcomer'))!;
    expect(row.textContent).toContain('Invited');
    expect(row.textContent).toContain('Content Editor');
    const members = await view.handle.store.providerTeam.list(ctxOf(view, 'providerOwner'));
    expect(members.find((m) => m.email === 'new.person@example.test')?.roleNames).toEqual(['Content Editor']);
  });

  it('does not invite when the email is invalid and says so', async () => {
    const view = await openP18();
    const before = screen.getAllByTestId('member-row').length;
    const form = screen.getByRole('region', { name: 'Invite someone' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Email' }), 'not-an-email');
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Bad Email');
    await userEvent.click(within(form).getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByText('Check the email address and name, then try again.')).toBeTruthy();
    expect(screen.getAllByTestId('member-row')).toHaveLength(before);
    expect((await view.handle.store.providerTeam.list(ctxOf(view, 'providerOwner'))).length).toBe(before);
  });

  it('offers Owner and Co-Owner to someone holding owner.manageOwnerRoles, but not to someone without it', async () => {
    await openP18();
    const owned = within(screen.getByRole('region', { name: 'Invite someone' })).getByRole('combobox', {
      name: 'Role',
    });
    const usable = (name: string) =>
      within(owned)
        .queryAllByRole('option', { name })
        .some((o) => !(o as HTMLOptionElement).disabled);
    expect(usable('Owner')).toBe(true);
    expect(usable('Co-Owner')).toBe(true);
    cleanup();

    await openP18({ ...as('raj'), prepare: rajIsAdmin });
    const limited = within(screen.getByRole('region', { name: 'Invite someone' })).getByRole('combobox', {
      name: 'Role',
    });
    const usableLimited = (name: string) =>
      within(limited)
        .queryAllByRole('option', { name })
        .some((o) => !(o as HTMLOptionElement).disabled);
    expect(usableLimited('Owner')).toBe(false);
    expect(usableLimited('Co-Owner')).toBe(false);
    expect(usableLimited('Support')).toBe(true);
  });

  it('gives a viewer without team.manage a read-only view', async () => {
    await openP18(as('tom'));
    expect(screen.getByText('You can look at the team but not change anything here.')).toBeTruthy();
    expect(screen.getAllByTestId('member-row').length).toBeGreaterThan(1);
    expect(screen.getAllByTestId('role-row').length).toBeGreaterThan(1);
    for (const name of ['Send invite', 'Suspend', 'Reactivate', 'New role', 'Edit role', 'Start transfer']) {
      expect(screen.queryAllByRole('button', { name })).toHaveLength(0);
    }
    expect(screen.queryAllByRole('combobox', { name: 'Change role' })).toHaveLength(0);
  });

  it('refuses to suspend the last Owner and shows why, leaving them Active', async () => {
    const view = await openP18();
    await userEvent.click(within(rowOf(view, 'providerOwner')).getByRole('button', { name: 'Suspend' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'There must always be at least one Account Owner.',
    );
    expect(rowOf(view, 'providerOwner').textContent).toContain('Active');
    expect(rowOf(view, 'providerOwner').textContent).not.toContain('Suspended');
  });

  it('refuses to demote the last Owner and shows why, keeping the Owner role', async () => {
    const view = await openP18();
    await userEvent.selectOptions(
      within(rowOf(view, 'providerOwner')).getByRole('combobox', { name: 'Change role' }),
      'Admin',
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'There must always be at least one Account Owner.',
    );
    const members = await view.handle.store.providerTeam.list(ctxOf(view, 'providerOwner'));
    expect(members.find((m) => m.userId === view.keys.users['providerOwner'])!.roleNames).toContain('Owner');
  });
});

describe('P18 Team and roles: role editor, compare and effective permissions', () => {
  it('lists system roles and custom roles with a text label for each kind', async () => {
    const view = await openP18({
      prepare: async ({ handle, keys }) => {
        await handle.store.providerTeam.createRole(
          { ...actorFor('provider', keys), now: TODAY },
          { name: 'Rota helper', description: 'Helps with rotas', permissionIds: ['team.read'] },
        );
      },
    });
    const rows = screen.getAllByTestId('role-row');
    const support = rows.find((r) => r.textContent.includes('Support'))!;
    expect(support.textContent).toContain('System role');
    const custom = rows.find((r) => r.textContent.includes('Rota helper'))!;
    expect(custom.textContent).toContain('Custom role');
    expect(custom.getAttribute('data-role-id')).toBe((await roleByName(view, 'Rota helper')).id);
    expect(within(custom).getByRole('button', { name: 'Edit role' })).toBeTruthy();
    expect(within(support).queryAllByRole('button', { name: 'Edit role' })).toHaveLength(0);
  });

  it("adds a permission's dependencies automatically, says so, and saves them with the role", async () => {
    const view = await openP18();
    await openNewRole();
    await userEvent.type(screen.getByRole('textbox', { name: 'Role name' }), 'Team lead');
    expect(box('team.read').checked).toBe(false);
    await userEvent.click(box('team.manage'));
    expect(box('team.manage').checked).toBe(true);
    expect(box('team.read').checked).toBe(true);
    const note = within(screen.getByRole('region', { name: 'Role editor' })).getByRole('status').textContent;
    expect(note).toContain('Also added because it needs them:');
    expect(note).toContain(describeOf('team.read'));
    await userEvent.click(screen.getByRole('button', { name: 'Save role' }));
    await waitFor(async () => {
      expect(await roleByName(view, 'Team lead')).toBeTruthy();
    });
    const saved = await roleByName(view, 'Team lead');
    expect(saved.permissionIds).toEqual(expect.arrayContaining(['team.manage', 'team.read']));
  });

  it('blocks removing a permission that another ticked permission needs, and names the dependant', async () => {
    await openP18();
    await openNewRole();
    await userEvent.click(box('team.manage'));
    await userEvent.click(box('team.read'));
    expect(box('team.read').checked).toBe(true);
    const alert = within(screen.getByRole('region', { name: 'Role editor' })).getByRole('alert').textContent;
    expect(alert).toContain('Cannot remove this yet. Needed by:');
    expect(alert).toContain(describeOf('team.manage'));
    await userEvent.click(box('team.manage'));
    await userEvent.click(box('team.read'));
    expect(box('team.read').checked).toBe(false);
  });

  it('marks sensitive permissions with the word Sensitive, and not others', async () => {
    await openP18();
    await openNewRole();
    expect(permRow('roles.manage').textContent).toContain('Sensitive');
    expect(permRow('team.reset2fa').textContent).toContain('Sensitive');
    expect(permRow('team.read').textContent).not.toContain('Sensitive');
    const area = permRow('team.read').closest('[data-testid="perm-area"]')!;
    expect(area.getAttribute('data-area')).toBe('team');
    expect(within(area as HTMLElement).getAllByTestId('perm-row').length).toBe(
      providerCatalogue.filter((p) => p.area === 'team').length,
    );
  });

  it('compares two roles, listing what is added and what is removed', async () => {
    const view = await openP18();
    const from = await roleByName(view, 'Read-only');
    const to = await roleByName(view, 'Admin');
    const diff = compareRoles(from.permissionIds, to.permissionIds);
    expect(diff.added.length).toBeGreaterThan(0);
    const region = screen.getByRole('region', { name: 'Compare roles' });
    await userEvent.selectOptions(within(region).getByRole('combobox', { name: 'From role' }), 'Read-only');
    await userEvent.selectOptions(within(region).getByRole('combobox', { name: 'To role' }), 'Admin');
    const added = within(region).getByTestId('compare-added').textContent;
    const removed = within(region).getByTestId('compare-removed').textContent;
    for (const id of diff.added) expect(added).toContain(describeOf(id));
    for (const id of diff.removed) expect(removed).toContain(describeOf(id));
    expect(added).toContain(describeOf('team.manage'));
    expect(removed).not.toContain(describeOf('team.manage'));
  });

  it("shows a member's effective permissions with the name of the role that grants each one", async () => {
    const view = await openP18();
    await userEvent.click(within(rowOf(view, 'sophie')).getByRole('button', { name: 'Effective permissions' }));
    const region = await screen.findByRole('region', {
      name: `Effective permissions for ${await nameOf(view, 'sophie')}`,
    });
    const rows = within(region).getAllByTestId('effective-row');
    const tickets = rows.find((r) => r.getAttribute('data-permission-id') === 'tickets.write')!;
    expect(tickets.textContent).toContain(describeOf('tickets.write'));
    expect(tickets.textContent).toContain('Granted by Support');
    expect(rows.some((r) => r.getAttribute('data-permission-id') === 'team.manage')).toBe(false);
  });
});

describe('P18 Team and roles: ownership transfer', () => {
  const openTransfer = () => screen.getByRole('region', { name: 'Ownership transfer' });
  const transferRow = () => within(openTransfer()).getByTestId('transfer-row');
  const transfers = async (view: View) => view.handle.store.ownership.list(ctxOf(view, 'providerOwner'));

  const startToSophie = async (view: View) => {
    await userEvent.selectOptions(
      within(openTransfer()).getByRole('combobox', { name: 'New owner' }),
      await nameOf(view, 'sophie'),
    );
    await userEvent.selectOptions(
      within(openTransfer()).getByRole('combobox', { name: 'Role for you afterwards' }),
      'Admin',
    );
    await userEvent.click(within(openTransfer()).getByRole('button', { name: 'Start transfer' }));
    await waitFor(() => {
      expect(transferRow()).toBeTruthy();
    });
  };

  it('starts a transfer to another active member and shows it as waiting for them to accept', async () => {
    const view = await openP18();
    await startToSophie(view);
    const name = await nameOf(view, 'sophie');
    expect(transferRow().textContent).toContain(`Waiting for ${name} to accept`);
    expect(within(transferRow()).getByRole('button', { name: 'Cancel transfer' })).toBeTruthy();
    const list = await transfers(view);
    expect(list).toHaveLength(1);
    expect(list[0]!.toUserId).toBe(view.keys.users['sophie']);
    expect(list[0]!.status).toBe('pending');
    // The owner themselves is not offered as the new owner.
    const options = within(within(openTransfer()).getByRole('combobox', { name: 'New owner' })).queryAllByRole(
      'option',
    );
    expect(options.map((o) => o.textContent)).not.toContain(await nameOf(view, 'providerOwner'));
  });

  it('after acceptance and the code it shows the 7 day cooling-off, keeps Complete disabled, and can be cancelled', async () => {
    const view = await openP18();
    await startToSophie(view);
    const id = (await transfers(view))[0]!.id;
    await view.handle.store.ownership.accept(ctxOf(view, 'sophie'), id);
    // The page re-renders when the store changes.
    const name = await nameOf(view, 'sophie');
    await waitFor(() => {
      expect(transferRow().textContent).toContain(`${name} has accepted. Enter your confirmation code.`);
    });
    await userEvent.type(within(transferRow()).getByRole('textbox', { name: 'Confirmation code' }), demoTwoFactorCode);
    await userEvent.click(within(transferRow()).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(transferRow().textContent).toContain('Confirmed. Cooling off ends in 7 days');
    });
    const complete = within(transferRow()).getByRole<HTMLButtonElement>('button', { name: 'Complete transfer' });
    expect(complete.disabled).toBe(true);
    expect(transferRow().textContent).toContain('Complete is available when the cooling-off period has ended.');
    await userEvent.click(within(transferRow()).getByRole('button', { name: 'Cancel transfer' }));
    await waitFor(() => {
      expect(transferRow().textContent).toContain('Cancelled');
    });
    expect((await transfers(view))[0]!.status).toBe('cancelled');
  });

  it('enables Complete once the cooling-off has ended, and completing hands over ownership', async () => {
    const view = await openP18({
      prepare: async ({ handle, keys }) => {
        const dump = await handle.admin.dumpAll();
        const admin = (dump['roles'] as Role[]).find((r) => r.system && r.systemKey === 'providerAdmin')!;
        const past = new Date(new Date(TODAY).getTime() - 3_600_000).toISOString();
        const t: OwnershipTransfer = {
          id: 'transfer-ready',
          side: 'provider',
          fromUserId: keys.users['providerOwner'],
          toUserId: keys.users['sophie'],
          demoteFromTo: admin.id,
          status: 'pending',
          coolingOffEndsAt: past,
          acceptedAt: past,
          twoFactorConfirmedAt: past,
        };
        await handle.admin.bulkPut('ownershipTransfers', [t]);
      },
    });
    const complete = within(transferRow()).getByRole<HTMLButtonElement>('button', { name: 'Complete transfer' });
    expect(complete.disabled).toBe(false);
    expect(transferRow().textContent).not.toContain('Complete is available when the cooling-off period has ended.');
    await userEvent.click(complete);
    await waitFor(() => {
      expect(transferRow().textContent).toContain('Done');
    });
    const members = await view.handle.store.providerTeam.list(ctxOf(view, 'sophie'));
    expect(members.find((m) => m.userId === view.keys.users['sophie'])!.roleNames).toContain('Owner');
  });

  it('hides the transfer form from someone without owner.transfer', async () => {
    await openP18({ ...as('raj'), prepare: rajIsAdmin });
    expect(screen.queryAllByRole('button', { name: 'Start transfer' })).toHaveLength(0);
    expect(screen.queryAllByRole('combobox', { name: 'New owner' })).toHaveLength(0);
  });
});

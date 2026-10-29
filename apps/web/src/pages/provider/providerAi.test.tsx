// M4 chunk 16: P22 "AI add-on settings" at /provider/ai (brief 20.7). Written before the implementation (component
// `AiSettings` in ./AiSettings.tsx, route /provider/ai, a "More" item in the provider shell).
//
// UI CONTRACT
//   Data (new, see packages/data/src/contract/providerGlobalAi.ts): store.aiSettings.overview(actor) rows
//   { clientId, clientName, status, usageThisPeriod, includedUnits, killSwitch } and
//   store.aiSettings.setKillSwitch(actor, clientId, on). Both need ai.manage; the page checks
//   holdsAnywhere(perms, 'ai.manage'), never role names. The kill switch writes audit 'ai.killSwitch'.
//   Proposed language keys (en-GB):
//     nav.provider.ai "AI settings"
//     provider.ai.heading "AI add-on settings"   .noAccess "You do not have access to AI settings."
//     provider.ai.demo "Demo AI"   .demoNote "This is Demo AI: scripted answers, no real model and no network requests."
//     provider.ai.guardrails "Guardrails" (region name) with the four lines below as list items:
//       .guardrail.grounded "Answers use only the client's approved modules and policies, and cite them."
//       .guardrail.noAdvice "No legal advice and no predictions about inspection outcomes."
//       .guardrail.personalData "Staff are warned not to paste personal data. Children's data is never included."
//       .guardrail.draft "AI output is always a draft that a person must review before it is published."
//     provider.ai.usage "Usage by client" (region name)
//     provider.ai.used "{used} of {included} questions used"
//     provider.ai.status.{off,on,trial} "Off" "On" "Trial"
//     provider.ai.killSwitchOn "AI switched off by the provider"   (shown in the row while the switch is on)
//     provider.ai.switchOff "Switch off AI for {name}"   .switchBackOn "Switch AI back on for {name}"  (buttons)
//     provider.ai.switchedOff "AI switched off for {name}."   .switchedOn "AI switched back on for {name}."  (role=status)
//     provider.ai.loadError "Could not load AI settings."
//   h1 "AI add-on settings". Without ai.manage: only the no-access message (no rows, no buttons).
//   Region "Usage by client": one data-testid="ai-client-row" (data-client-id) per overview row, text containing the
//   client name, the status and "N of M questions used". Each row has a button "Switch off AI for <name>" (or "Switch
//   AI back on for <name>" while killed, and then the row text contains "AI switched off by the provider"). Clicking
//   calls setKillSwitch and shows role=status text. Regions "Guardrails" and the "Demo AI" text are on the page.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { addOnIds } from '@sta/content';
import type { AuditEvent } from '@sta/domain';
import type { StoreHandle } from '@sta/data';
import type { SeedKeys } from '@sta/seed';
import { renderRoute } from '../../test/harness';

afterEach(cleanup);

type Opts = Parameters<typeof renderRoute>[2];
type Ctx = { handle: StoreHandle; keys: SeedKeys };
const as = (key: string, prepare?: NonNullable<Opts>['prepare']): Opts => ({
  actor: (keys) => ({ userId: keys.users[key]!, side: 'provider', now: '2026-10-19T09:00:00.000Z' }),
  ...(prepare ? { prepare } : {}),
});

type Overview = { overview(a: unknown): Promise<{ clientId: string; clientName: string; killSwitch: boolean }[]> };
const aiStore = (ctx: Ctx) => (ctx.handle.store as unknown as { aiSettings: Overview }).aiSettings;
const ownerActor = (ctx: Ctx) => ({
  userId: ctx.keys.users['providerOwner'],
  side: 'provider',
  now: '2026-10-19T09:00:00.000Z',
});

// Little Acorns has the add-on on, with some usage.
const withUsage = async ({ handle, keys }: Ctx) => {
  await handle.admin.bulkPut('addOnSubscriptions', [
    {
      clientId: keys.clients['littleAcorns'],
      addOnId: addOnIds.aiAssistant,
      status: 'on',
      startedAt: '2026-10-01T09:00:00.000Z',
      usageThisPeriod: 42,
    },
  ]);
};

const openP22 = async (opts?: Opts) => {
  let ctx!: Ctx;
  await renderRoute('/provider/ai', 'provider', {
    ...opts,
    prepare: async (c) => {
      ctx = c;
      await opts?.prepare?.(c);
    },
  });
  await screen.findByRole('heading', { level: 1, name: 'AI add-on settings' });
  return ctx;
};
const littleRow = async (ctx: Ctx) => {
  const id = ctx.keys.clients['littleAcorns'];
  return await waitFor(() => {
    const row = screen.getAllByTestId('ai-client-row').find((r) => r.getAttribute('data-client-id') === id);
    expect(row).toBeTruthy();
    return row!;
  });
};
const clientName = async (ctx: Ctx) => {
  const id = ctx.keys.clients['littleAcorns'];
  const rows = await aiStore(ctx).overview(ownerActor(ctx));
  return rows.find((r) => r.clientId === id)!.clientName;
};

describe('P22 AI add-on settings', () => {
  it('labels the page as Demo AI and shows the four guardrails', async () => {
    await openP22({ prepare: withUsage });
    expect(screen.getByText('This is Demo AI: scripted answers, no real model and no network requests.')).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Guardrails' });
    for (const line of [
      "Answers use only the client's approved modules and policies, and cite them.",
      'No legal advice and no predictions about inspection outcomes.',
      "Staff are warned not to paste personal data. Children's data is never included.",
      'AI output is always a draft that a person must review before it is published.',
    ]) {
      expect(within(region).getByText(line)).toBeTruthy();
    }
  });

  it('shows each client with its status and usage against the included allowance', async () => {
    const ctx = await openP22({ prepare: withUsage });
    const row = await littleRow(ctx);
    expect(row.textContent).toContain(await clientName(ctx));
    expect(row.textContent).toContain('On');
    expect(row.textContent).toMatch(/42 of 200 questions used/);
    expect(row.textContent).not.toContain('AI switched off by the provider');
  });

  it('switches AI off for a client: shows it, persists it and writes an audit event with the client', async () => {
    const ctx = await openP22({ prepare: withUsage });
    const name = await clientName(ctx);
    const row = await littleRow(ctx);
    await userEvent.click(within(row).getByRole('button', { name: `Switch off AI for ${name}` }));
    expect((await screen.findByRole('status')).textContent).toContain(`AI switched off for ${name}.`);
    await waitFor(async () => {
      const after = await littleRow(ctx);
      expect(after.textContent).toContain('AI switched off by the provider');
      expect(within(after).getByRole('button', { name: `Switch AI back on for ${name}` })).toBeTruthy();
    });
    const stored = (await aiStore(ctx).overview(ownerActor(ctx))).find(
      (r) => r.clientId === ctx.keys.clients['littleAcorns'],
    );
    expect(stored!.killSwitch).toBe(true);
    const events = ((await ctx.handle.admin.dumpAll())['audit'] as AuditEvent[]).filter(
      (e) => e.action === 'ai.killSwitch',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      clientId: ctx.keys.clients['littleAcorns'],
      actorId: ctx.keys.users['providerOwner'],
    });
  });

  it('switches AI back on again', async () => {
    const ctx = await openP22({ prepare: withUsage });
    const name = await clientName(ctx);
    await userEvent.click(within(await littleRow(ctx)).getByRole('button', { name: `Switch off AI for ${name}` }));
    await userEvent.click(await screen.findByRole('button', { name: `Switch AI back on for ${name}` }));
    await waitFor(async () => {
      expect((await littleRow(ctx)).textContent).not.toContain('AI switched off by the provider');
    });
    expect((await screen.findByRole('status')).textContent).toContain(`AI switched back on for ${name}.`);
    expect(
      (await aiStore(ctx).overview(ownerActor(ctx))).find((r) => r.clientId === ctx.keys.clients['littleAcorns'])!
        .killSwitch,
    ).toBe(false);
  });

  it('shows the switch already on when the store says so', async () => {
    const ctx = await openP22({
      prepare: async (c) => {
        await withUsage(c);
        await (
          c.handle.store as unknown as {
            aiSettings: { setKillSwitch(a: unknown, id: string, on: boolean): Promise<unknown> };
          }
        ).aiSettings.setKillSwitch(ownerActor(c), c.keys.clients['littleAcorns'], true);
      },
    });
    expect((await littleRow(ctx)).textContent).toContain('AI switched off by the provider');
  });

  it('shows only a no-access message to someone without ai.manage (Tom, Read-only)', async () => {
    await renderRoute('/provider/ai', 'provider', as('tom', withUsage));
    expect(await screen.findByText('You do not have access to AI settings.')).toBeTruthy();
    expect(screen.queryAllByTestId('ai-client-row')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^Switch/ })).toHaveLength(0);
  });

  it('shows only a no-access message to Support, who also lack ai.manage', async () => {
    await renderRoute('/provider/ai', 'provider', as('sophie', withUsage));
    expect(await screen.findByText('You do not have access to AI settings.')).toBeTruthy();
    expect(screen.queryAllByTestId('ai-client-row')).toHaveLength(0);
  });

  it('is reachable from the provider navigation', async () => {
    await renderRoute('/provider', 'provider');
    const links = await screen.findAllByRole('link', { name: 'AI settings' });
    expect(links.some((l) => /\/provider\/ai$/.test(l.getAttribute('href') ?? ''))).toBe(true);
  });
});

// M5 chunk 6 (F-4): every message key a staff screen uses must exist in pl-PL.json, or be on the short ALLOWED list.
// The staff shell builds its Polish `t` with createT(pl, { fallback: en }). This file wraps createT so each call that has
// a fallback records the keys the Polish set lacked (the ones that would silently show English), then renders every
// staff route as Kasia (saved language pl-PL) and fails with the missing keys, grouped by key prefix.
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const missing = vi.hoisted(() => new Set<string>());

vi.mock('@sta/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sta/content')>();
  const has = (messages: unknown, key: string): boolean => {
    let node: unknown = messages;
    for (const part of key.split('.')) {
      if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) return false;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string';
  };
  return {
    ...actual,
    createT: (messages: never, options?: { fallback?: unknown }) => {
      const t = actual.createT(messages, options as never);
      if (!options?.fallback) return t;
      return ((key: string, params?: never) => {
        if (!has(messages, key)) missing.add(key);
        return (t as (k: string, p?: unknown) => string)(key, params);
      }) as typeof t;
    },
  };
});

import { moduleIds, nurseryModules } from '@sta/content';
import { actorFor, renderRoute } from './test/harness';
import type { SeedKeys } from '@sta/seed';
import type { StoreHandle } from '@sta/data';

afterEach(() => {
  cleanup();
  document.documentElement.lang = 'en-GB';
});

/** Keys that may stay English-only on a staff route. Keep short; each needs a real reason. */
const ALLOWED: Record<string, string> = {
  'faq.staff.': 'FAQ questions are English-only content, shown inside lang="en-GB" (plan assumption 2)',
  'whatsNew.': 'Release note titles and bodies are English-only content shown inside lang="en-GB" (plan assumption 2)',
};
const allowed = (key: string) => Object.keys(ALLOWED).some((k) => key === k || (k.endsWith('.') && key.startsWith(k)));

const kasia = (keys: SeedKeys) => ({ ...actorFor('staff', keys), userId: keys.users['kasia'] });
const need = <T,>(v: T | undefined | null): T => {
  if (v === undefined || v === null) throw new Error('missing seed value');
  return v;
};
const sg = need(nurseryModules.find((m) => m.id === moduleIds.safeguardingAndWhistleblowing));
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];

const setPl = async ({ handle, keys }: { handle: StoreHandle; keys: SeedKeys }) => {
  await handle.store.me.updatePrefs(kasia(keys), { language: 'pl-PL' });
};

/**
 * Staff routes from apps/web/src/app/routes.tsx, with ids filled in from the seed. The training record and the certificate
 * sit outside the staff shell (they print on their own), so they have no staff language provider and are not listed.
 */
const staticRoutes = [
  '/staff',
  '/staff/learn',
  '/staff/notes',
  '/staff/progress',
  '/staff/calendar',
  '/staff/compete',
  '/staff/me',
  '/staff/me/display',
  '/staff/notifications',
  '/staff/help',
  '/staff/help/ticket/new',
  `/staff/module/${sg.id}`,
  `/staff/module/${sg.id}/lesson/${sg.lessons[0]!.id}`,
  `/staff/module/${sg.id}/quiz`,
  `/staff/module/${sg.id}/done`,
];

const group = (key: string) => key.split('.')[0]!;

describe('staff routes use only Polish messages (except the allow list)', () => {
  it('shows no English fallback on any staff route as Kasia', async () => {
    const byRoute = new Map<string, string[]>();
    const seen = new Set<string>();

    const visit = async (path: string | ((c: { handle: StoreHandle; keys: SeedKeys }) => Promise<string>)) => {
      let resolved = typeof path === 'string' ? path : '';
      let ctx: { handle: StoreHandle; keys: SeedKeys } | undefined;
      const view = await renderRoute(typeof path === 'string' ? path : '/staff', 'staff', {
        actor: kasia,
        prepare: async (c) => {
          ctx = c;
          await setPl(c);
        },
      });
      if (typeof path !== 'string') {
        // Id routes: find the id, then navigate inside the same app so the Polish messages stay loaded.
        resolved = await path(ctx!);
        await view.router.navigate(resolved);
      }
      await waitFor(
        () => {
          expect(document.documentElement.lang).toBe('pl');
        },
        { timeout: 5000 },
      );
      await waitFor(
        () => {
          expect(document.querySelector('h1, h2, [role="alert"]')).not.toBeNull();
        },
        { timeout: 5000 },
      );
      // Let queries settle so the keys behind loaded data are recorded too.
      await new Promise((r) => setTimeout(r, 150));
      const keys = [...missing].filter((k) => !seen.has(k));
      for (const k of keys) seen.add(k);
      byRoute.set(resolved, keys);
      cleanup();
    };

    // Make sure the Polish messages are the ones recorded: nothing is recorded while English shows (no fallback set).
    for (const p of staticRoutes) await visit(p);
    await visit(({ keys }) =>
      Promise.resolve(`/staff/progress/upload/${need(keys.requirements['paediatricFirstAid'])}`),
    );
    await visit(async ({ handle }) => {
      const tickets = await dump<{ id: string; number: string }>(handle, 'tickets');
      return `/staff/help/ticket/${need(tickets.find((t) => t.number === 'T-1002') ?? tickets[0]).id}`;
    });

    const notAllowed = [...missing].filter((k) => !allowed(k)).sort();
    const perGroup: Record<string, number> = {};
    for (const k of notAllowed) perGroup[group(k)] = (perGroup[group(k)] ?? 0) + 1;
    expect(
      { count: notAllowed.length, perGroup, keys: notAllowed },
      'keys used on staff routes that pl-PL.json lacks',
    ).toEqual({ count: 0, perGroup: {}, keys: [] });
  }, 180_000);

  it('keeps the allow list short', () => {
    expect(Object.keys(ALLOWED).length).toBeLessThanOrEqual(10);
    for (const reason of Object.values(ALLOWED)) expect(reason.length).toBeGreaterThan(10);
  });
});

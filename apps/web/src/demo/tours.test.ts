// M5 chunk 11 (F-3): every tour step points at a real route and a real seed person.
import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router';
import { trackA, trackB } from '@sta/content';
import { routes } from '../app/routes';
import { seededStore } from '../test/harness';

describe.each([
  ['Track A', trackA],
  ['Track B', trackB],
])('%s tour', (_name, tour) => {
  it('opens only routes that exist in the router table (never the Not found route)', () => {
    for (const step of tour.steps) {
      const path = step.route.split('?')[0] as string;
      const found = matchRoutes(routes, path);
      expect(found, `${step.id}: ${path}`).not.toBeNull();
      expect(found?.some((m) => m.route.path === '*'), `${step.id} is Not found`).toBe(false);
    }
  });

  it('names only people who exist in the seed (or Provider for the provider side)', async () => {
    const { handle } = await seededStore();
    const people = await handle.admin.listPersonas();
    for (const step of tour.steps) {
      if (step.persona === 'Provider') continue;
      expect(
        people.some((p) => p.displayName.split(' ')[0] === step.persona),
        `${step.id}: ${step.persona}`,
      ).toBe(true);
    }
  });

  it('puts client-admin steps on /client and staff steps on /staff', async () => {
    const { handle } = await seededStore();
    const people = await handle.admin.listPersonas();
    for (const step of tour.steps) {
      if (step.persona === 'Provider') {
        expect(step.route.startsWith('/provider'), step.id).toBe(true);
        continue;
      }
      const side = people.find((p) => p.displayName.split(' ')[0] === step.persona)?.side;
      expect(step.route.startsWith(side === 'client' ? '/client' : '/staff'), step.id).toBe(true);
    }
  });
});

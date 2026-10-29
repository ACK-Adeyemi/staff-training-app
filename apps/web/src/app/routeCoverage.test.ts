// M5 chunk 1, BP-3: a route-coverage guard. Every path pattern in the router (apps/web/src/app/routes.tsx) must be
// visited by the e2e axe sweep: present in e2e/routes.ts or e2e/smoke.spec.ts (id routes are written there as
// template strings, and each ${...} stands for one path parameter), or listed in ALLOWED below with a reason.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router';
import { routes } from './routes';

const root = resolve(__dirname, '../../../..');

/** Patterns deliberately absent from the e2e route lists. Keep short; each needs a real reason. */
const ALLOWED: Record<string, string> = {};

function flatten(list: RouteObject[], base = ''): string[] {
  const out: string[] = [];
  for (const r of list) {
    if (r.path === '*') continue;
    const joined =
      r.path === undefined ? base : r.path.startsWith('/') ? r.path : `${base}/${r.path}`.replace(/\/+/g, '/');
    const hasPage = r.index === true || r.path !== undefined;
    if (hasPage && (r.children === undefined || r.index === true || r.element !== undefined || r.lazy !== undefined)) {
      // Layout routes with children only count as pages when they render something at their own path;
      // an index child covers the shell root, so the shell itself is counted once via its index route.
      if (r.index === true || r.children === undefined) out.push(joined || '/');
    }
    if (r.children) out.push(...flatten(r.children, joined));
  }
  return out;
}

/** Hash routes written in an e2e source file, with each ${...} replaced by ':'. */
function e2eRoutes(file: string): string[] {
  const src = readFileSync(resolve(root, file), 'utf8');
  const found: string[] = [];
  for (let i = src.indexOf('#/'); i !== -1; i = src.indexOf('#/', i + 2)) {
    let j = i + 1;
    let out = '';
    while (j < src.length) {
      const c = src[j] as string;
      if (c === '$' && src[j + 1] === '{') {
        let depth = 1;
        j += 2;
        while (j < src.length && depth > 0) {
          if (src[j] === '{') depth++;
          if (src[j] === '}') depth--;
          j++;
        }
        out += ':';
        continue;
      }
      if (/[`'"\s]/.test(c)) break;
      out += c;
      j++;
    }
    found.push(out.replace(/\/+$/, '') || '/');
  }
  return found;
}

const matches = (pattern: string, actual: string): boolean => {
  const a = pattern.split('/');
  const b = actual.split('/');
  return a.length === b.length && a.every((seg, k) => seg.startsWith(':') || seg === b[k]);
};

const patterns = [...new Set(flatten(routes))];
const covered = [...e2eRoutes('e2e/routes.ts'), ...e2eRoutes('e2e/smoke.spec.ts')];

describe('route coverage', () => {
  it('finds the router table (guards against the scan silently reading nothing)', () => {
    expect(patterns.length).toBeGreaterThan(60);
    expect(patterns).toContain('/staff/learn');
    expect(patterns).toContain('/staff/module/:moduleId/lesson/:lessonId');
    expect(patterns).toContain('/client');
    expect(covered.length).toBeGreaterThan(60);
  });

  it('reads id routes from the e2e files as parameter patterns', () => {
    expect(covered.some((c) => matches('/staff/module/:moduleId/quiz', c))).toBe(true);
  });

  it('visits every router path in the e2e route lists or the allow list', () => {
    const missing = patterns.filter((p) => !(p in ALLOWED) && !covered.some((c) => matches(p, c)));
    expect(missing).toEqual([]);
  });

  it('keeps the allow list honest: real routes only, each with a reason, none already covered', () => {
    for (const [pattern, reason] of Object.entries(ALLOWED)) {
      expect(patterns, pattern).toContain(pattern);
      expect(reason.trim().length, pattern).toBeGreaterThan(10);
      expect(
        covered.some((c) => matches(pattern, c)),
        `${pattern} is covered, so remove it from ALLOWED`,
      ).toBe(false);
    }
  });
});

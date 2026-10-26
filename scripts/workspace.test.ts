// Chunk 1 (BP-1 part): the workspace follows the plan's tooling rules.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = (p: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root + p, 'utf8')) as Record<string, unknown>;

const workspaces = ['packages/domain', 'packages/data', 'packages/content', 'packages/seed', 'packages/ui', 'apps/web'];

describe('workspace', () => {
  it('pins pnpm exactly and requires Node 24', () => {
    const pkg = readJson('package.json') as { packageManager: string; engines: { node: string } };
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(pkg.engines.node).toBe('>=24');
  });

  it('defines the root scripts check.sh runs', () => {
    const { scripts } = readJson('package.json') as { scripts: Record<string, string> };
    for (const s of ['lint', 'typecheck', 'test', 'build', 'e2e', 'dev', 'preview']) {
      expect(scripts[s], s).toBeTruthy();
    }
  });

  it.each(workspaces)('%s is a private ESM @sta package with src/index.ts exported', (dir) => {
    const pkg = readJson(`${dir}/package.json`) as { name: string; type: string; private: boolean };
    expect(pkg.name).toBe(`@sta/${dir.split('/')[1]}`);
    expect(pkg.type).toBe('module');
    expect(pkg.private).toBe(true);
    readFileSync(`${root}${dir}/src/index.ts`, 'utf8');
  });

  it('pins every dependency to an exact version (no ^ or ~)', () => {
    for (const dir of ['.', ...workspaces]) {
      const pkg = readJson(`${dir}/package.json`) as Record<string, Record<string, string> | undefined>;
      for (const field of ['dependencies', 'devDependencies']) {
        for (const [name, version] of Object.entries(pkg[field] ?? {})) {
          expect(version, `${dir} ${name}`).not.toMatch(/^[\^~]/);
        }
      }
    }
  });

  it('.env.example documents BASE_PATH and no longer DATABASE_URL', () => {
    const env = readFileSync(`${root}.env.example`, 'utf8');
    expect(env).toContain('BASE_PATH=/staff-training-app/');
    expect(env).not.toContain('DATABASE_URL');
  });
});

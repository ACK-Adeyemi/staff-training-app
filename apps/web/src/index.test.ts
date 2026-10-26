// Chunk 1 smoke test: the @sta/web app exists and is wired into the Vitest projects.
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

describe('@sta/web', () => {
  it('has the workspace package name and loads its entry point', async () => {
    expect(pkg.name).toBe('@sta/web');
    const mod = await import('./index');
    expect(typeof mod).toBe('object');
  });
});

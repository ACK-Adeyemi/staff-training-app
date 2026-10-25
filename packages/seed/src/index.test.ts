// Chunk 1 smoke test: the @sta/seed package exists, is wired into the Vitest projects, and its entry point loads.
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

describe('@sta/seed', () => {
  it('has the workspace package name and loads its entry point', async () => {
    expect(pkg.name).toBe('@sta/seed');
    const mod = await import('./index');
    expect(typeof mod).toBe('object');
  });
});

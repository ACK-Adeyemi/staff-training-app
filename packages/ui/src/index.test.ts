// Chunk 1 smoke test: the @sta/ui package exists, is wired into the Vitest projects, and its entry point loads.
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

describe('@sta/ui', () => {
  it('has the workspace package name and loads its entry point', async () => {
    expect(pkg.name).toBe('@sta/ui');
    const mod = await import('./index');
    expect(typeof mod).toBe('object');
  });
});

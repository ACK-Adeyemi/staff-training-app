// Chunk 2 (BP-3 part): the real names file stays out of git.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('repo hygiene', () => {
  it('lists .protected-names in .gitignore', () => {
    const lines = readFileSync(root + '.gitignore', 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim());
    expect(lines).toContain('.protected-names');
  });

  it('does not track .protected-names', () => {
    const out = execFileSync('git', ['ls-files', '.protected-names'], { cwd: root, encoding: 'utf8' });
    expect(out.trim()).toBe('');
  });

  it('git-ignores .protected-names (git check-ignore exits 0)', () => {
    const r = spawnSync('git', ['check-ignore', '-q', '.protected-names'], { cwd: root });
    expect(r.status).toBe(0);
  });

  it('ships the hook files as executable scripts that call the checker', () => {
    for (const hook of ['pre-commit', 'commit-msg']) {
      const mode = execFileSync('git', ['ls-files', '-s', `.githooks/${hook}`], { cwd: root, encoding: 'utf8' });
      // Not committed yet is fine until the implementer stages them; check the working tree instead.
      const text = readFileSync(`${root}.githooks/${hook}`, 'utf8');
      expect(text.startsWith('#!/bin/sh')).toBe(true);
      expect(text).toContain(`scripts/protected-names.mjs ${hook}`);
      if (mode.trim()) expect(mode.startsWith('100755')).toBe(true);
    }
  });
});

// Chunk 2 (BP-3): the protected-names hook, run with real git in temporary repos.
// Uses invented canary names only. Never reads the real .protected-names file.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const hooksDir = join(root, '.githooks');
const script = join(root, 'scripts', 'protected-names.mjs');

const PLAIN = 'Qorvane Atelier';
const ACCENTED = 'Élodrin Vasq';
const ACCENTED_PLAIN = 'Elodrin Vasq';

let repo: string;

const env = (): NodeJS.ProcessEnv => {
  const e = { ...process.env };
  delete e.PROTECTED_NAMES_FILE;
  return e;
};

const git = (...args: string[]) =>
  spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: env(),
  });

const write = (rel: string, content: string | Buffer) => {
  const full = join(repo, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
};

const stageAndCommit = (message = 'chore: test commit', ...addArgs: string[]) => {
  const add = git('add', ...(addArgs.length ? addArgs : ['.']));
  expect(add.status, add.stderr).toBe(0);
  return git('commit', '-m', message);
};

const output = (r: { stdout: string; stderr: string }) => r.stdout + r.stderr;

const expectNoCanaryEcho = (r: { stdout: string; stderr: string }) => {
  const text = output(r).toLowerCase();
  const folded = text.normalize('NFKD').replace(/\p{M}/gu, '');
  for (const c of [PLAIN, ACCENTED, ACCENTED_PLAIN, 'qorvane', 'elodrin', 'élodrin']) {
    expect(folded, `output must not contain ${c.length} char name`).not.toContain(
      c.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, ''),
    );
  }
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'pn-test-'));
  expect(git('init', '-q').status).toBe(0);
  expect(git('config', 'core.hooksPath', hooksDir).status).toBe(0);
  write('.gitignore', '.protected-names\n');
  write('.protected-names', `# invented canaries\n\n${PLAIN}\n  ${ACCENTED}  \n`);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('protected-names hook', () => {
  it('allows a clean commit', () => {
    write('notes.txt', 'Nothing sensitive here.\n');
    const r = stageAndCommit();
    expect(r.status, output(r)).toBe(0);
  });

  it('refuses content with the exact canary, naming file and line but not the name', () => {
    write('docs/a.txt', `line one\nline two\nWe met ${PLAIN} today\n`);
    const r = stageAndCommit();
    expect(r.status).not.toBe(0);
    expect(output(r)).toContain('protected-names: blocked');
    expect(output(r)).toContain('docs/a.txt');
    expect(output(r)).toMatch(/line 3\b/);
    expectNoCanaryEcho(r);
    expect(output(r)).not.toContain('We met');
  });

  it('refuses an upper-case variant', () => {
    write('a.txt', `${PLAIN.toUpperCase()}\n`);
    const r = stageAndCommit();
    expect(r.status).not.toBe(0);
    expectNoCanaryEcho(r);
  });

  it('refuses a lower-case variant', () => {
    write('a.txt', `${PLAIN.toLowerCase()}\n`);
    expect(stageAndCommit().status).not.toBe(0);
  });

  it('refuses the unaccented form of an accented canary', () => {
    write('a.txt', `${ACCENTED_PLAIN}\n`);
    const r = stageAndCommit();
    expect(r.status).not.toBe(0);
    expectNoCanaryEcho(r);
  });

  it('refuses an accented form of an unaccented canary', () => {
    write('a.txt', 'Qórvane Atelier\n');
    const r = stageAndCommit();
    expect(r.status).not.toBe(0);
    expectNoCanaryEcho(r);
  });

  it('refuses a canary with extra whitespace between words', () => {
    write('a.txt', 'Qorvane    Atelier\n');
    expect(stageAndCommit().status).not.toBe(0);
  });

  it('does not match a canary split across a line break (documented limitation)', () => {
    write('a.txt', 'Qorvane\nAtelier\n');
    const r = stageAndCommit();
    expect(r.status, output(r)).toBe(0);
  });

  it('refuses a canary in a file path', () => {
    write('Qorvane Atelier/readme.txt', 'harmless\n');
    const r = stageAndCommit();
    expect(r.status).not.toBe(0);
    expect(output(r)).toContain('protected-names: blocked');
    expectNoCanaryEcho(r);
  });

  it('refuses a canary in the commit message without echoing it', () => {
    write('a.txt', 'clean\n');
    const r = stageAndCommit(`feat: add ${PLAIN.toUpperCase()} support`);
    expect(r.status).not.toBe(0);
    expect(output(r)).toContain('commit message');
    expectNoCanaryEcho(r);
    const log = git('log', '--oneline');
    expect(log.status).not.toBe(0); // no commit was created
  });

  it('refuses staging .protected-names itself with git add -f', () => {
    const add = git('add', '-f', '.protected-names');
    expect(add.status).toBe(0);
    const r = git('commit', '-m', 'chore: oops');
    expect(r.status).not.toBe(0);
    expect(output(r)).toContain('.protected-names');
    expectNoCanaryEcho(r);
  });

  it('skips binary files', () => {
    const bin = Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(PLAIN), Buffer.from([0])]);
    write('image.bin', bin);
    const r = stageAndCommit();
    expect(r.status, output(r)).toBe(0);
  });

  it('ignores comment and blank lines in the names file', () => {
    write('.protected-names', '# comment-only\n\n   \n# Zzyzx Placeholder\n');
    write('a.txt', 'comment-only and Zzyzx Placeholder and nothing else\n');
    const r = stageAndCommit();
    expect(r.status, output(r)).toBe(0);
  });

  it('skips with a message and exit 0 when the names file is missing', () => {
    rmSync(join(repo, '.protected-names'));
    write('a.txt', `${PLAIN}\n`);
    expect(git('add', 'a.txt').status).toBe(0);
    const r = spawnSync('node', [script, 'pre-commit'], { cwd: repo, encoding: 'utf8', env: env() });
    expect(r.status, output(r)).toBe(0);
    expect(output(r)).toContain('protected-names: no .protected-names file, check skipped');
  });

  it('reads PROTECTED_NAMES_FILE when set', () => {
    rmSync(join(repo, '.protected-names'));
    const alt = join(repo, '..', `alt-names-${Date.now().toString(36)}.txt`);
    writeFileSync(alt, 'Zzyzx Placeholder\n');
    try {
      write('a.txt', 'zzyzx placeholder\n');
      expect(git('add', 'a.txt').status).toBe(0);
      const r = spawnSync('node', [script, 'pre-commit'], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...env(), PROTECTED_NAMES_FILE: alt },
      });
      expect(r.status).toBe(1);
      expect(output(r)).toContain('protected-names: blocked');
      expect(output(r).toLowerCase()).not.toContain('zzyzx');
    } finally {
      rmSync(alt, { force: true });
    }
  });

  it('still allows a clean commit after a refused one', () => {
    write('bad.txt', `${PLAIN}\n`);
    expect(stageAndCommit().status).not.toBe(0);
    rmSync(join(repo, 'bad.txt'));
    write('good.txt', 'fine\n');
    expect(git('reset', '-q').status).toBe(0);
    const r = stageAndCommit('chore: clean');
    expect(r.status, output(r)).toBe(0);
  });
});

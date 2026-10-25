// Pre-commit and commit-msg check: blocks names listed in the git-ignored .protected-names file.
// Never prints a matched name or any file content. No dependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const normalise = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');

const git = (args) => execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024 });

const mode = process.argv[2];
const topLevel = () => git(['rev-parse', '--show-toplevel']).toString('utf8').trim();

// PROTECTED_NAMES_FILE is honoured only under NODE_ENV=test, so a stray variable cannot redirect the check.
const override = process.env.NODE_ENV === 'test' ? process.env.PROTECTED_NAMES_FILE : undefined;
const namesPath = override || join(topLevel(), '.protected-names');
if (!existsSync(namesPath)) {
  console.log('protected-names: no .protected-names file, check skipped');
  process.exit(0);
}
const names = readFileSync(namesPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map(normalise)
  .filter(Boolean);

const hits = (text) => text.split(/\r?\n/).some((l) => names.some((n) => normalise(l).includes(n)));
const firstLine = (text) => {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (hits(lines[i])) return i + 1;
  return 0;
};
const fail = (where) => {
  console.error(
    `protected-names: blocked. A protected name was found in ${where}. The name is not shown. Remove it and try again.`,
  );
  process.exit(1);
};

if (mode === 'pre-commit') {
  const staged = git(['diff', '--cached', '--name-only', '-z']).toString('utf8').split('\0').filter(Boolean);
  if (staged.includes('.protected-names')) {
    console.error(
      'protected-names: blocked. .protected-names must never be committed. Unstage it with: git reset -q .protected-names',
    );
    process.exit(1);
  }
  const files = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  for (const path of files) {
    if (hits(path)) fail('a file path (shown only as a count: path hidden)');
    const blob = git(['show', `:${path}`]);
    if (blob.subarray(0, 8000).includes(0)) continue;
    const text = blob.toString('utf8');
    if (hits(text)) {
      const n = firstLine(text);
      fail(n ? `${path}, line ${n}` : path);
    }
  }
} else if (mode === 'commit-msg') {
  const file = process.argv[3];
  if (!file) {
    console.error('protected-names: commit-msg needs the message file path');
    process.exit(1);
  }
  const text = readFileSync(file, 'utf8');
  if (hits(text)) fail('the commit message');
} else {
  console.error('usage: protected-names.mjs pre-commit | commit-msg <file>');
  process.exit(2);
}

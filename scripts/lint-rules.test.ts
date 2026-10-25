// F-1: the project lint guards, proved through the ESLint Node API with the real project config.
// Virtual files (lintText with a filePath) are linted, so nothing needs to exist on disk.
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: root });

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${root}${filePath}` });
  if (!result) throw new Error('ESLint returned no result');
  const fatal = result.messages.filter((m) => m.fatal);
  // A parse failure would make "not flagged" cases pass for the wrong reason.
  expect(fatal.map((m) => m.message)).toEqual([]);
  return result.messages.map((m) => m.ruleId ?? 'none');
}

const RESTRICTED_PROPS = 'no-restricted-properties';
const RESTRICTED_SYNTAX = 'no-restricted-syntax';
const RESTRICTED_GLOBALS = 'no-restricted-globals';

describe('clock and randomness guards', () => {
  it.each([
    ['packages/domain/src/x.ts'],
    ['packages/data/src/x.ts'],
    ['packages/ui/src/x.tsx'],
    ['apps/web/src/x.tsx'],
  ])('flags Date.now() in %s', async (file) => {
    expect(await ruleIds(file, 'export const a = Date.now();\n')).toContain(RESTRICTED_PROPS);
  });

  it.each([['packages/domain/src/x.ts'], ['packages/data/src/x.ts'], ['apps/web/src/x.tsx']])(
    'flags Math.random() in %s',
    async (file) => {
      expect(await ruleIds(file, 'export const a = Math.random();\n')).toContain(RESTRICTED_PROPS);
    },
  );

  it.each([['packages/domain/src/x.ts'], ['packages/seed/src/x.ts'], ['apps/web/src/x.tsx']])(
    'flags new Date() with no argument in %s',
    async (file) => {
      expect(await ruleIds(file, 'export const a = new Date();\n')).toContain(RESTRICTED_SYNTAX);
    },
  );

  it('allows new Date with an argument', async () => {
    const ids = await ruleIds('packages/domain/src/x.ts', "export const a = new Date('2026-01-01');\n");
    expect(ids).not.toContain(RESTRICTED_SYNTAX);
    expect(ids).not.toContain(RESTRICTED_PROPS);
  });

  it('allows new Date with an argument in a test file', async () => {
    const ids = await ruleIds('packages/domain/src/x.test.ts', "export const a = new Date('2026-10-19T09:00:00Z');\n");
    expect(ids).not.toContain(RESTRICTED_SYNTAX);
  });

  it('allows a Date.now call that carries an eslint-disable-next-line with a reason (systemClock)', async () => {
    const code = [
      '// eslint-disable-next-line no-restricted-properties -- the one real clock read',
      'export const a = Date.now();',
      '',
    ].join('\n');
    expect(await ruleIds('packages/domain/src/clock.ts', code)).not.toContain(RESTRICTED_PROPS);
  });
});

describe('no hard-coded UI text', () => {
  it.each([['apps/web/src/x.tsx'], ['packages/ui/src/x.tsx']])('flags literal JSX text in %s', async (file) => {
    const code = 'export const A = () => <p>Hello there</p>;\n';
    expect(await ruleIds(file, code)).toContain(RESTRICTED_SYNTAX);
  });

  it.each([['aria-label'], ['title'], ['alt'], ['placeholder']])(
    'flags a literal %s attribute in web',
    async (attr) => {
      const code = `export const A = () => <input ${attr}="Search" />;\n`;
      expect(await ruleIds('apps/web/src/x.tsx', code)).toContain(RESTRICTED_SYNTAX);
    },
  );

  it('flags a literal aria-label in the ui package', async () => {
    const code = 'export const A = () => <button aria-label="Close" />;\n';
    expect(await ruleIds('packages/ui/src/x.tsx', code)).toContain(RESTRICTED_SYNTAX);
  });

  it('does not flag text that comes from an expression or whitespace-only JSX text', async () => {
    const code = [
      'declare const t: (k: string) => string;',
      'export const A = () => (',
      '  <p aria-label={t("a")}>',
      '    {t("b")}',
      '  </p>',
      ');',
      '',
    ].join('\n');
    expect(await ruleIds('apps/web/src/x.tsx', code)).not.toContain(RESTRICTED_SYNTAX);
  });
});

describe('dangerouslySetInnerHTML', () => {
  it.each([['apps/web/src/x.tsx'], ['packages/ui/src/x.tsx']])('is flagged in %s', async (file) => {
    const code = 'export const A = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;\n';
    expect(await ruleIds(file, code)).toContain(RESTRICTED_SYNTAX);
  });
});

describe('storage and network globals', () => {
  it('flags localStorage in web source', async () => {
    expect(await ruleIds('apps/web/src/x.ts', "export const a = localStorage.getItem('k');\n")).toContain(
      RESTRICTED_GLOBALS,
    );
  });

  it('allows localStorage in apps/web/src/demo/flags.ts', async () => {
    const code = "export const a = localStorage.getItem('k');\n";
    expect(await ruleIds('apps/web/src/demo/flags.ts', code)).not.toContain(RESTRICTED_GLOBALS);
  });

  it('flags localStorage in another file inside apps/web/src/demo', async () => {
    expect(await ruleIds('apps/web/src/demo/other.ts', "export const a = localStorage.getItem('k');\n")).toContain(
      RESTRICTED_GLOBALS,
    );
  });

  it.each([['sessionStorage'], ['indexedDB']])('flags %s in web source', async (name) => {
    expect(await ruleIds('apps/web/src/x.ts', `export const a = ${name};\n`)).toContain(RESTRICTED_GLOBALS);
  });

  it('flags indexedDB in domain and ui source', async () => {
    expect(await ruleIds('packages/domain/src/x.ts', 'export const a = indexedDB;\n')).toContain(RESTRICTED_GLOBALS);
    expect(await ruleIds('packages/ui/src/x.ts', 'export const a = indexedDB;\n')).toContain(RESTRICTED_GLOBALS);
  });

  it('allows indexedDB in the IndexedDB adapter path', async () => {
    expect(await ruleIds('packages/data/src/indexeddb/x.ts', "export const a = indexedDB.open('x');\n")).not.toContain(
      RESTRICTED_GLOBALS,
    );
  });

  it.each([['apps/web/src/x.ts'], ['packages/ui/src/x.ts'], ['packages/domain/src/x.ts']])(
    'flags fetch in %s',
    async (file) => {
      expect(await ruleIds(file, "export const a = () => fetch('https://example.test');\n")).toContain(
        RESTRICTED_GLOBALS,
      );
    },
  );

  it.each([['XMLHttpRequest'], ['WebSocket']])('flags new %s in web source', async (name) => {
    expect(await ruleIds('apps/web/src/x.ts', `export const a = new ${name}('x');\n`)).toContain(RESTRICTED_GLOBALS);
  });
});

describe('typescript rules', () => {
  it('flags explicit any', async () => {
    expect(await ruleIds('packages/domain/src/x.ts', 'export const a = (v: any) => v;\n')).toContain(
      '@typescript-eslint/no-explicit-any',
    );
  });
});

describe('clean code', () => {
  it('produces none of the project guard violations for ordinary domain code', async () => {
    const code = 'export const add = (a: number, b: number): number => a + b;\n';
    const ids = await ruleIds('packages/domain/src/x.ts', code);
    expect(ids).not.toContain(RESTRICTED_PROPS);
    expect(ids).not.toContain(RESTRICTED_SYNTAX);
    expect(ids).not.toContain(RESTRICTED_GLOBALS);
  });
});

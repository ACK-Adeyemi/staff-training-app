import { existsSync } from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const appSource = ['packages/*/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'];
const uiSource = ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'];
const noBrowserIo = [
  'apps/web/src/**/*.{ts,tsx}',
  'packages/ui/src/**/*.{ts,tsx}',
  'packages/domain/src/**/*.{ts,tsx}',
];

// Virtual files: the lint-rules test lints text at paths that need not exist. Type-aware linting needs a project, so
// those exact paths fall back to the default project. A path that exists on disk is in its package project already
// (listing it too is an error), so only paths that do not exist are listed. Add a name here if a test uses a new one.
const virtualDirs = [
  ...['domain', 'data', 'content', 'seed', 'ui'].map((p) => `packages/${p}/src`),
  'packages/data/src/indexeddb',
  'apps/web/src',
  'apps/web/src/demo',
];
const virtualNames = ['x.ts', 'x.tsx', 'x.test.ts', 'other.ts', 'clock.ts', 'flags.ts'];
const virtualPaths = virtualDirs
  .flatMap((dir) => virtualNames.map((name) => `${dir}/${name}`))
  .filter((path) => !existsSync(`${import.meta.dirname}/${path}`));

const attrs = '^(aria-label|title|alt|placeholder)$';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.agent-logs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Virtual files (the lint-rules test lints text at paths that do not exist) fall back to the default project.
        projectService: {
          allowDefaultProject: virtualPaths,
          defaultProject: 'tsconfig.json',
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 100,
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  { files: ['**/*.js', '**/*.mjs'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: [...uiSource, 'packages/data/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Clock and randomness: only systemClock may read the real clock (it carries an eslint-disable with a reason).
  {
    files: appSource,
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Use the injected Clock.' },
        { object: 'Math', property: 'random', message: 'Use the seeded Rng.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use the injected Clock, not new Date().',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is not allowed.',
        },
      ],
    },
  },
  // Everywhere else (scripts, e2e, root config) HTML injection is still banned.
  {
    files: ['**/*.{tsx,jsx}'],
    ignores: appSource,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is not allowed.',
        },
      ],
    },
  },
  // UI copy comes from language files via t().
  {
    files: uiSource,
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use the injected Clock, not new Date().',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is not allowed.',
        },
        {
          selector: 'JSXText[value=/[A-Za-z]/]',
          message: 'No hard-coded UI text. Use t() and the language file.',
        },
        {
          selector: `JSXAttribute[name.name=/${attrs}/] > Literal`,
          message: 'No hard-coded UI text. Use t() and the language file.',
        },
      ],
    },
  },
  // No direct storage or network access from UI and domain code.
  {
    files: noBrowserIo,
    rules: {
      'no-restricted-globals': [
        'error',
        ...['indexedDB', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'WebSocket'].map((name) => ({
          name,
          message: 'Go through the data layer. No direct storage or network access here.',
        })),
      ],
    },
  },
  {
    files: ['apps/web/src/demo/flags.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['indexedDB', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'WebSocket'].map((name) => ({
          name,
          message: 'Only localStorage is allowed in this file.',
        })),
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**', 'scripts/**'],
    rules: { 'no-restricted-globals': 'off' },
  },
);

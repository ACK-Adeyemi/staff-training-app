// M1 chunk 1 (K-1): owner recognition is by systemKey, so no role-name comparison may remain in the engine or policy.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const files = {
  'packages/domain/src/permissions/engine.ts': fileURLToPath(
    new URL('../../domain/src/permissions/engine.ts', import.meta.url),
  ),
  'packages/data/src/policy.ts': fileURLToPath(new URL('./policy.ts', import.meta.url)),
};

describe('no role-name checks remain', () => {
  it.each(Object.entries(files))('%s does not compare role names', (_label, file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain("'Account Owner'");
    expect(text).not.toContain('"Account Owner"');
    expect(text).not.toMatch(/===\s*['"]Owner['"]/);
  });
});

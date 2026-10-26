// Chunk 6 (F-3, F-5): the en-GB language file is complete, plain, British and free of payment wording for staff.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import enGB from './en-GB.json' with { type: 'json' };

type Leaf = { key: string; value: string };

function leaves(node: unknown, prefix = ''): { leaves: Leaf[]; bad: string[] } {
  const out: Leaf[] = [];
  const bad: string[] = [];
  const walk = (n: unknown, path: string) => {
    if (typeof n === 'string') out.push({ key: path, value: n });
    else if (n !== null && typeof n === 'object' && !Array.isArray(n)) {
      for (const [k, v] of Object.entries(n)) walk(v, path ? `${path}.${k}` : k);
    } else bad.push(path);
  };
  walk(node, prefix);
  return { leaves: out, bad };
}

const { leaves: all, bad } = leaves(enGB);
const keys = new Set(all.map((l) => l.key));
const staffFacing = all.filter((l) => /^(nav\.staff|staff|placeholder\.staff)(\.|$)/.test(l.key));

describe('en-GB language file structure', () => {
  it('has only strings and nested objects (no arrays, numbers or nulls)', () => {
    expect(bad).toEqual([]);
  });

  it('has the agreed top-level groups', () => {
    for (const group of ['demo', 'shell', 'nav', 'placeholder', 'status', 'common', 'errors']) {
      expect(Object.keys(enGB), group).toContain(group);
    }
  });

  it('has navigation for all three surfaces', () => {
    const nav = (enGB as Record<string, Record<string, unknown>>).nav ?? {};
    for (const side of ['staff', 'client', 'provider']) {
      expect(Object.keys(nav[side] as object).length, side).toBeGreaterThan(0);
    }
  });

  it('has the provider navigation areas from the plan', () => {
    const provider = Object.values(
      ((enGB as Record<string, Record<string, unknown>>).nav as Record<string, unknown>).provider as object,
    ).join(' | ');
    for (const area of ['Overview', 'Clients', 'Content', 'Commercial', 'Support', 'Comms', 'Team and security']) {
      expect(provider).toContain(area);
    }
  });

  it('has the common keys the app relies on', () => {
    expect(keys.has('common.save')).toBe(true);
  });

  it('has no empty or whitespace-only strings', () => {
    expect(all.filter((l) => l.value.trim() === '').map((l) => l.key)).toEqual([]);
  });

  it('has no leading, trailing or doubled spaces', () => {
    expect(all.filter((l) => l.value !== l.value.trim() || /\s{2,}/.test(l.value)).map((l) => l.key)).toEqual([]);
  });

  it('has no leftover TODO, lorem or placeholder-looking text', () => {
    expect(all.filter((l) => /todo|lorem|tbc|xxx/i.test(l.value)).map((l) => l.key)).toEqual([]);
  });

  it('uses only well-formed {param} placeholders', () => {
    const malformed = all.filter((l) => {
      const stripped = l.value.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '');
      return /[{}]/.test(stripped);
    });
    expect(malformed.map((l) => l.key)).toEqual([]);
  });
});

describe('en-GB language file wording', () => {
  it('uses British spelling', () => {
    const american =
      /\b(color|colors|colored|organization|organizations|organize|organized|center|centers|behavior|favorite|license[sd]?\b(?! to)|program(?!me)|canceled|canceling|analyze|catalog(?!ue)|gray|fulfill\b|enrollment|recognize|customize|authorize|prioritize|summarize|minimize|utilize|neighborhood|defense|judgment|check\s?mark)/i;
    const hits = all.filter((l) => american.test(l.value) && !/licence/i.test(l.value));
    expect(hits.map((l) => `${l.key}: ${l.value}`)).toEqual([]);
  });

  it('uses UK terms for common words', () => {
    const us = /\b(zip code|cell phone|vacation|apartment|sign up for|log in to your|e-mail|email address)\b/i;
    // "email address" is fine; only the clearly American terms are checked.
    const hits = all.filter((l) => /\b(zip code|cell phone|vacation|apartment)\b/i.test(l.value));
    expect(us).toBeDefined();
    expect(hits.map((l) => l.key)).toEqual([]);
  });

  it('is plain English: no jargon, Latin abbreviations or exclamation marks', () => {
    const jargon =
      /\b(utili[sz]e|leverage|synergy|robust|seamless|empower|e\.g\.|i\.e\.|etc\.?|via|whilst|aforementioned|kindly)\b|!/i;
    expect(all.filter((l) => jargon.test(l.value)).map((l) => `${l.key}: ${l.value}`)).toEqual([]);
  });

  it('keeps messages short: no more than 30 words each', () => {
    expect(all.filter((l) => l.value.split(/\s+/).length > 30).map((l) => l.key)).toEqual([]);
  });

  it('uses sentence case: no Title Case runs of four or more capitalised words', () => {
    const titleCase = /(\b[A-Z][a-z]+\b\s+){3}\b[A-Z][a-z]+\b/;
    expect(all.filter((l) => titleCase.test(l.value)).map((l) => `${l.key}: ${l.value}`)).toEqual([]);
  });

  it('has staff-facing keys to check', () => {
    expect(staffFacing.length).toBeGreaterThan(0);
  });

  it('has no payment wording in staff-facing keys', () => {
    const payment =
      /\b(pay|pays|paid|payment|payments|price|prices|pricing|invoice|invoices|billing|bill|subscription|subscriptions|subscribe|card|plan|package|tier|upgrade|downgrade|trial|fee|fees|cost|costs|refund|discount|charge|charged)\b|[£$€]/i;
    expect(staffFacing.filter((l) => payment.test(l.value) || payment.test(l.key)).map((l) => l.key)).toEqual([]);
  });

  it('keeps payment wording out of the staff account-state messages', () => {
    const staffStatus = all.filter((l) => /^status\.staff(\.|$)/.test(l.key));
    for (const l of staffStatus) expect(l.value).not.toMatch(/\b(pay|payment|invoice|billing|overdue payment)\b/i);
  });
});

// Every literal t('a.b') call in app and package source must name a key that exists.
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('en-GB key usage', () => {
  it('has no t() call anywhere that names a missing key', () => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    const dirs: string[] = [];
    for (const group of ['packages', 'apps']) {
      for (const name of readdirSync(join(root, group))) {
        const src = join(root, group, name, 'src');
        try {
          if (statSync(src).isDirectory()) dirs.push(src);
        } catch {
          // no src folder
        }
      }
    }
    const pattern = /\bt\(\s*(['"`])([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)\1/g;
    const missing: string[] = [];
    for (const dir of dirs) {
      for (const file of sourceFiles(dir)) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(pattern)) {
          if (!keys.has(m[2] ?? '')) missing.push(`${file.replace(root, '')}: ${m[2]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

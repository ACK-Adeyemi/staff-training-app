// M3 chunk 5: every new M3 key group exists, has no empty strings and staff keys carry no payment wording.
import { describe, expect, it } from 'vitest';
import enGB from './en-GB.json';

const get = (path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), enGB);

const leaves = (node: unknown, prefix: string): { key: string; value: string }[] => {
  if (typeof node === 'string') return [{ key: prefix, value: node }];
  if (node && typeof node === 'object' && !Array.isArray(node))
    return Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}.${k}`));
  return [{ key: prefix, value: '' }];
};

const groups = [
  'rules',
  'reminders',
  'calendar',
  'evidenceFlow',
  'feedback',
  'tickets',
  'help',
  'faq',
  'team',
  'twoFactor',
  'org',
  'billing',
  'addOns',
  'account',
  'retention',
  'export',
  'themes',
  'builder',
  'library',
  'stats',
  'sites',
  'sitesBoard',
  'ai',
  'onboarding',
];

// Every RuleName added in M3 (packages/data/src/types.ts).
const newRuleNames = [
  'checklistFailed',
  'providerModuleReadOnly',
  'hasCompletions',
  'storageFull',
  'fileTooLarge',
  'fileType',
  'imageMetadata',
  'notHttps',
  'anonymousNoReply',
  'openSubmission',
  'notExternal',
  'notApplicable',
  'wrongCode',
  'codeLocked',
  'stepUpRequired',
  'usageCapReached',
  'invalidTemplate',
  'invalidTheme',
  'invalidName',
  'staffTicketsOff',
  'duplicateRule',
];

const PAYMENT =
  /\b(pay|pays|paid|payment|payments|price|prices|pricing|invoice|invoices|billing|bill|subscription|card|plan|package|tier|upgrade|downgrade|trial|fee|fees|cost|costs|refund|discount|charge|charged)\b|[£$€]/i;

describe('en-GB M3 key groups', () => {
  it.each(groups)('has a non-empty group %s with no empty strings', (g) => {
    const node = get(g);
    expect(node, g).toBeTypeOf('object');
    const ls = leaves(node, g);
    expect(ls.length, g).toBeGreaterThan(0);
    expect(ls.filter((l) => l.value.trim() === '').map((l) => l.key)).toEqual([]);
  });

  it('has errors.rule.<name> for every new RuleName', () => {
    for (const r of newRuleNames) expect(get(`errors.rule.${r}`), r).toBeTruthy();
  });

  it('has a plain message for two-factor required', () => {
    expect(get('errors.twoFactorRequired')).toBeTruthy();
  });

  it('has the account-state "what works" rows', () => {
    const ls = leaves(get('account.works'), 'account.works');
    expect(ls.length).toBeGreaterThan(0);
    expect(ls.filter((l) => !l.value.trim()).length).toBe(0);
  });

  it('has the staff account notice wording, free of payment words', () => {
    const v = get('staff.accountNotice.speakToManager');
    expect(v).toBeTruthy();
    expect(String(v)).not.toMatch(PAYMENT);
  });

  it('keeps all staff-facing keys free of payment wording', () => {
    const staff = leaves(get('staff'), 'staff').filter(
      (l) => l.key.startsWith('staff.accountNotice') || l.key.startsWith('staff.help'),
    );
    for (const l of staff) expect(l.value, l.key).not.toMatch(PAYMENT);
  });

  it('keeps the staff-facing help, faq and ticket wording free of payment words', () => {
    // help.staff.*, faq.staff.* and tickets.staff.* are the staff-side groups; client-only copy may mention billing.
    for (const prefix of ['help.staff', 'faq.staff', 'tickets.staff', 'calendar.staff', 'feedback.staff']) {
      const node = get(prefix);
      if (node === undefined) continue;
      for (const l of leaves(node, prefix)) expect(l.value, l.key).not.toMatch(PAYMENT);
    }
  });
});

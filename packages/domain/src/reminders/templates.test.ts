import { describe, expect, it } from 'vitest';
import { checkReminderTemplate, defaultReminderText } from './plan';

describe('reminder messages', () => {
  it('has a default for every kind and tone, using only known placeholders', () => {
    for (const tone of ['friendly', 'neutral', 'brief'] as const) {
      for (const kind of ['dueSoon', 'overdue', 'expiring']) {
        expect(checkReminderTemplate(defaultReminderText(kind, tone))).toBe('ok');
      }
    }
  });
  it('refuses empty, long and unknown-placeholder messages', () => {
    expect(checkReminderTemplate('')).toBe('empty');
    expect(checkReminderTemplate('x'.repeat(301))).toBe('tooLong');
    expect(checkReminderTemplate('Hi {surname}')).toBe('unknownPlaceholder');
    expect(checkReminderTemplate('Hi {firstName}')).toBe('ok');
  });
});

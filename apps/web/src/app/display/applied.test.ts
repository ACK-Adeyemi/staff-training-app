// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyToHtml } from './applied';

describe('applyToHtml', () => {
  afterEach(() => {
    const root = document.documentElement;
    for (const a of [...root.getAttributeNames()]) root.removeAttribute(a);
    root.removeAttribute('style');
  });

  it('applies the names and values the display settings produce', () => {
    applyToHtml({
      attributes: { 'data-contrast': 'high' },
      variables: { '--text-scale': '1.5', '--letter-spacing': '0.05em' },
    });
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5');
  });

  it('ignores other attribute names, other variable names and unsafe values', () => {
    applyToHtml({
      attributes: { onclick: 'x', class: 'a', 'data-contrast': 'high;evil' },
      variables: { color: 'red', '--x': 'url(https://example.test/a)', '--text-scale': 'calc(1+1)' },
    });
    const root = document.documentElement;
    expect(root.getAttribute('onclick')).toBeNull();
    expect(root.getAttribute('class')).toBeNull();
    expect(root.getAttribute('data-contrast')).toBeNull();
    expect(root.style.getPropertyValue('--x')).toBe('');
    expect(root.style.getPropertyValue('--text-scale')).toBe('');
    expect(root.style.color).toBe('');
  });
});

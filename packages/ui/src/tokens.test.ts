/// <reference types="node" />
// Chunk 10: tokens.css carries the variables, light/dark selectors and reduced motion rule from the M0 plan.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

describe('tokens.css', () => {
  it.each([
    '--color-bg', '--color-surface', '--color-text', '--color-text-muted', '--color-border',
    '--color-accent', '--color-on-accent', '--color-focus',
    '--status-current', '--status-expiring', '--status-overdue', '--status-not-assigned', '--status-awaiting',
    '--font-sans', '--focus-ring',
  ])('defines %s', (name) => {
    expect(css).toMatch(new RegExp(`${name}\\s*:\\s*[^;]+;`));
  });

  it('defines radius and spacing tokens', () => {
    expect(css).toMatch(/--radius[\w-]*\s*:/);
    expect(css).toMatch(/--space[\w-]*\s*:/);
  });

  it('sets the minimum touch target to 44px', () => {
    expect(css).toMatch(/--target-min\s*:\s*44px/);
  });

  it('uses a system font stack with no web fonts', () => {
    expect(css).not.toMatch(/@font-face|@import\s+url|fonts\.googleapis/i);
    expect(css).toMatch(/--font-sans\s*:[^;]*(system-ui|-apple-system|sans-serif)/);
  });

  it('switches to dark values with prefers-color-scheme', () => {
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  });

  it('supports an explicit data-colour-mode attribute for light and dark', () => {
    expect(css).toMatch(/\[data-colour-mode=['"]?light['"]?\]/);
    expect(css).toMatch(/\[data-colour-mode=['"]?dark['"]?\]/);
  });

  it('lets the explicit attribute win over the media query', () => {
    // The OS-dark rule must not apply when the user chose light explicitly.
    const media = css.slice(css.search(/@media\s*\(prefers-color-scheme:\s*dark\)/));
    expect(media).toMatch(/:root:not\(\[data-colour-mode\]\)|:not\(\[data-colour-mode=['"]?light['"]?\]\)|:not\(\[data-colour-mode\]\)/);
  });

  it('turns transitions off for prefers-reduced-motion', () => {
    const idx = css.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(css.slice(idx)).toMatch(/transition(-duration)?\s*:\s*(none|0s|0ms)/);
  });
});

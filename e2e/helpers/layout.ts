// Layout checks for large text (BP-7): nothing is clipped, truncated, scrolls sideways or overlaps.
import { expect, type Page } from '@playwright/test';

export async function expectNoClipOrOverlap(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      const wide = [...document.body.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute('class')).slice(0, 50)}`);
      out.push(`page scrolls sideways: ${doc.scrollWidth} > ${window.innerWidth} (${wide.join('; ')})`);
    }
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      // A 1px box is visually hidden text for screen readers (sr-only), clipped on purpose.
      return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const label = (el: Element) => `${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}"`;
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (!hasText) continue;
      if (s.textOverflow === 'ellipsis') out.push(`ellipsis: ${label(el)}`);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        if (el.scrollWidth > el.clientWidth + 1) out.push(`clipped width: ${label(el)}`);
        if (el.scrollHeight > el.clientHeight + 1) out.push(`clipped height: ${label(el)}`);
      }
    }
    // A fixed bar (the bottom tab bar) sits over scrolling content by design; the page has bottom padding so nothing
    // is stuck beneath it. Controls inside fixed or sticky containers are not compared with scrolling content.
    const pinned = (el: Element): boolean => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') return true;
      }
      return false;
    };
    const controls = [...document.body.querySelectorAll('button, a[href], input, select, textarea')].filter(visible);
    const boxes = controls
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      // A visually hidden radio overlaying its own label is by design.
      .filter(
        ({ el, r }) =>
          !(
            el instanceof HTMLInputElement &&
            (el.type === 'radio' || el.type === 'checkbox') &&
            getComputedStyle(el).opacity === '0'
          ) && r.width > 0,
      );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (pinned(a.el) !== pinned(b.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 1 && h > 1) out.push(`overlap: ${label(a.el)} and ${label(b.el)}`);
      }
    return out;
  });
  expect(problems).toEqual([]);
}

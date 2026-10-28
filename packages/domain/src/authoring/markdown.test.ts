// BP-2: pasted Markdown becomes lessons (plan Assumption 12; brief 5.1 and 8).
//
// API under test:
//   markdownToLessons(markdown: string): { lessons: Lesson[]; warnings: { kind: 'image' | 'html' | 'unsafeLink'; line: number }[] }
//   '#' or '##' starts a lesson; text before the first heading is lesson 1 "Introduction"; paragraphs are text blocks;
//   a list under a heading named "Key points" (any case) is one keyPoints block; "> " lines are an info callout;
//   images, HTML and non-https links are dropped with a warning; minutes = ceil(words / 200), at least 1;
//   lesson ids are slugged and made unique with -2, -3.
import { describe, expect, it } from 'vitest';
import { lessonSchema } from '../schemas/learning';
import { markdownToLessons } from './markdown';

const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');

describe('markdownToLessons', () => {
  it('turns text with no heading into one lesson called Introduction', () => {
    const { lessons } = markdownToLessons('Welcome to the nursery.\n\nWash your hands.');
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ id: 'introduction', title: 'Introduction' });
    expect(lessons[0]?.blocks).toEqual([
      { kind: 'text', markdown: 'Welcome to the nursery.' },
      { kind: 'text', markdown: 'Wash your hands.' },
    ]);
  });

  it('gives nothing for empty or blank input', () => {
    expect(markdownToLessons('').lessons).toEqual([]);
    expect(markdownToLessons('  \n\n ').lessons).toEqual([]);
  });

  it('starts a lesson at each level 1 and level 2 heading but not deeper ones', () => {
    const { lessons } = markdownToLessons(
      '# Fire exits\nKnow them.\n\n## Assembly point\nGo there.\n\n### Detail\nStill assembly point.',
    );
    expect(lessons.map((l) => l.title)).toEqual(['Fire exits', 'Assembly point']);
    expect(lessons[1]?.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it('puts text before the first heading in an Introduction lesson ahead of the headed lessons', () => {
    const { lessons } = markdownToLessons('Read this first.\n\n# Fire exits\nKnow them.');
    expect(lessons.map((l) => l.title)).toEqual(['Introduction', 'Fire exits']);
  });

  it('turns a list under Key points (any case) into a keyPoints block', () => {
    const { lessons } = markdownToLessons(
      '# Hygiene\nIntro text.\n\n## KEY POINTS\n- Wash hands\n- Dry hands\n* Use soap',
    );
    const lesson = lessons.find((l) => l.title === 'KEY POINTS');
    expect(lesson?.blocks).toEqual([{ kind: 'keyPoints', items: ['Wash hands', 'Dry hands', 'Use soap'] }]);
  });

  it('keeps a list under any other heading as text, not key points', () => {
    const { lessons } = markdownToLessons('# Hygiene\n- Wash hands\n- Dry hands');
    expect(lessons[0]?.blocks.some((b) => b.kind === 'keyPoints')).toBe(false);
    expect(lessons[0]?.blocks.some((b) => b.kind === 'text')).toBe(true);
  });

  it('turns lines starting "> " into an info callout', () => {
    const { lessons } = markdownToLessons('# Fire\n> Never use the lift.\n\nTake the stairs.');
    expect(lessons[0]?.blocks).toEqual([
      { kind: 'callout', tone: 'info', markdown: 'Never use the lift.' },
      { kind: 'text', markdown: 'Take the stairs.' },
    ]);
  });

  it('drops images with a warning', () => {
    const r = markdownToLessons('# Fire\nBefore.\n\n![A map](https://example.org/map.png)\n\nAfter.');
    expect(JSON.stringify(r.lessons)).not.toContain('map.png');
    expect(r.lessons[0]?.blocks.some((b) => b.kind === 'image')).toBe(false);
    expect(r.warnings.map((w) => w.kind)).toEqual(['image']);
  });

  it('drops HTML with a warning', () => {
    const r = markdownToLessons('# Fire\n<script>alert(1)</script>\n\nSafe text.');
    expect(JSON.stringify(r.lessons)).not.toContain('<script');
    expect(JSON.stringify(r.lessons)).toContain('Safe text.');
    expect(r.warnings.map((w) => w.kind)).toContain('html');
  });

  it('drops a link to a non-https address, keeps the words, and warns', () => {
    const r = markdownToLessons('# Fire\nSee [the guide](http://example.org/guide) now.');
    const text = JSON.stringify(r.lessons);
    expect(text).not.toContain('http://');
    expect(text).toContain('the guide');
    expect(r.warnings.map((w) => w.kind)).toEqual(['unsafeLink']);
  });

  it('drops javascript links too and keeps https links untouched', () => {
    const r = markdownToLessons('# Fire\n[bad](javascript:alert(1)) and [good](https://www.gov.uk/fire).');
    const text = JSON.stringify(r.lessons);
    expect(text).not.toContain('javascript:');
    expect(text).toContain('https://www.gov.uk/fire');
    expect(r.warnings.map((w) => w.kind)).toEqual(['unsafeLink']);
  });

  it('reports no warnings for clean input', () => {
    expect(markdownToLessons('# Fire\nFine.').warnings).toEqual([]);
  });

  it('makes lesson ids unique when titles repeat', () => {
    const { lessons } = markdownToLessons('# Fire exits\nA.\n\n# Fire exits\nB.\n\n# Fire exits!\nC.');
    const ids = lessons.map((l) => l.id);
    expect(ids[0]).toBe('fire-exits');
    expect(new Set(ids).size).toBe(3);
  });

  it('slugs titles into valid local keys, even awkward ones', () => {
    const { lessons } = markdownToLessons(
      `# Café & Kitchens: the very long title that goes on and on and on forever\nText.\n\n# 2026!!!\nText.`,
    );
    for (const l of lessons) expect(lessonSchema.safeParse(l).success).toBe(true);
  });

  it('estimates minutes at 200 words a minute, at least 1', () => {
    expect(markdownToLessons(`# Short\nOne two three.`).lessons[0]?.minutes).toBe(1);
    expect(markdownToLessons(`# Mid\n${words(400)}`).lessons[0]?.minutes).toBe(2);
    expect(markdownToLessons(`# Long\n${words(600)}`).lessons[0]?.minutes).toBe(3);
  });

  it('produces lessons that pass the lesson schema', () => {
    const { lessons } = markdownToLessons('Intro.\n\n# One\nText.\n> Note.\n\n## Key points\n- a\n- b');
    for (const l of lessons) expect(lessonSchema.safeParse(l).success).toBe(true);
  });
});

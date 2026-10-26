// M1 chunk 4 (F-1): the lesson Markdown parser. Plan docs/plans/m1.md, Content package.
import { describe, expect, it } from 'vitest';
import { parseLesson } from './lessonParser';

describe('parseLesson', () => {
  it('turns a plain paragraph into a text block', () => {
    expect(parseLesson('Everyone helps keep children safe.')).toEqual([
      { kind: 'text', markdown: 'Everyone helps keep children safe.' },
    ]);
  });

  it('splits steps on a line containing only three dashes', () => {
    const blocks = parseLesson('First step.\n\n---\n\nSecond step.\n---\nThird step.');
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'text', 'text']);
    expect(blocks[1]).toEqual({ kind: 'text', markdown: 'Second step.' });
  });

  it('does not split on dashes that are part of a list or sentence', () => {
    const blocks = parseLesson('- one\n- two\n\nA well-known rule --- sort of.');
    expect(blocks).toHaveLength(1);
  });

  it('turns Key points followed by dash lines into a keyPoints block', () => {
    expect(parseLesson('Key points:\n- Tell the DSL\n- Write it down')).toEqual([
      { kind: 'keyPoints', items: ['Tell the DSL', 'Write it down'] },
    ]);
  });

  it('turns a step made only of quote lines into an info callout', () => {
    expect(parseLesson('> Take your time.\n> Ask if unsure.')).toEqual([
      { kind: 'callout', tone: 'info', markdown: 'Take your time.\nAsk if unsure.' },
    ]);
  });

  it('turns a quote step starting with Warning: into a warning callout', () => {
    const [block] = parseLesson('> Warning: never promise to keep a secret.');
    expect(block).toMatchObject({ kind: 'callout', tone: 'warning' });
    expect((block as { markdown: string }).markdown).toContain('never promise to keep a secret.');
    expect((block as { markdown: string }).markdown).not.toMatch(/^Warning:/);
  });

  it('turns an Acknowledge step into an acknowledge block', () => {
    expect(parseLesson('Acknowledge: I know who our DSL is.')).toEqual([
      { kind: 'acknowledge', statement: 'I know who our DSL is.' },
    ]);
  });

  it('keeps bold, headings and dash lists inside text blocks', () => {
    const [block] = parseLesson('## Your role\n\nYou **must** speak up.\n\n- one\n- two');
    expect(block).toMatchObject({ kind: 'text' });
    expect((block as { markdown: string }).markdown).toContain('**must**');
    expect((block as { markdown: string }).markdown).toContain('## Your role');
  });

  it('ignores empty steps', () => {
    expect(parseLesson('One.\n---\n\n---\nTwo.')).toHaveLength(2);
  });

  it('refuses raw HTML', () => {
    expect(() => parseLesson('Hello <b>there</b>')).toThrow();
    expect(() => parseLesson('<script>alert(1)</script>')).toThrow();
  });

  it('refuses Markdown links', () => {
    expect(() => parseLesson('See [this page](https://example.org).')).toThrow();
  });

  it('refuses Markdown images', () => {
    expect(() => parseLesson('![a picture](https://example.org/a.png)')).toThrow();
  });
});

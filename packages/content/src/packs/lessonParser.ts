// Lesson Markdown to content blocks. Plan docs/plans/m1.md, Content package.
// Steps are separated by a line containing only "---". Allowed Markdown inside text: paragraphs, "-" lists,
// **bold** and "## " headings. Raw HTML, links and images are refused, so lesson text can never inject markup.
import type { ContentBlock } from '@sta/domain';

const refuse = (markdown: string): void => {
  if (/<[a-zA-Z/!?]/.test(markdown)) throw new Error('Lesson Markdown must not contain raw HTML');
  if (/!\[/.test(markdown)) throw new Error('Lesson Markdown must not contain images');
  if (/\]\(|\]\[/.test(markdown)) throw new Error('Lesson Markdown must not contain links');
};

const quoteText = (line: string): string => line.replace(/^>\s?/, '');

const parseStep = (step: string): ContentBlock => {
  const lines = step.split('\n').map((l) => l.trimEnd());
  const first = lines[0] ?? '';

  if (/^Key points:\s*$/i.test(first)) {
    const items = lines.slice(1).filter((l) => l.trim() !== '');
    if (items.length === 0 || !items.every((l) => l.startsWith('- ')))
      throw new Error('Key points must be followed by "- " lines only');
    return { kind: 'keyPoints', items: items.map((l) => l.slice(2).trim()) };
  }

  if (lines.every((l) => l.startsWith('>'))) {
    const text = lines.map(quoteText).join('\n').trim();
    const warning = /^Warning:\s*/.exec(text);
    return warning
      ? { kind: 'callout', tone: 'warning', markdown: text.slice(warning[0].length).trim() }
      : { kind: 'callout', tone: 'info', markdown: text };
  }

  const ack = /^Acknowledge:\s*(.+)$/.exec(step);
  if (ack && lines.length === 1) return { kind: 'acknowledge', statement: (ack[1] ?? '').trim() };

  return { kind: 'text', markdown: step };
};

export const parseLesson = (markdown: string): ContentBlock[] => {
  refuse(markdown);
  const steps: string[] = [];
  let current: string[] = [];
  const flush = (): void => {
    const text = current.join('\n').trim();
    if (text !== '') steps.push(text);
    current = [];
  };
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^---\s*$/.test(line)) flush();
    else current.push(line);
  }
  flush();
  return steps.map(parseStep);
};

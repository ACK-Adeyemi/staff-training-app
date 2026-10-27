import type { ReactNode } from 'react';

/**
 * Safe Markdown subset: "##" and "###" headings, "- " bullet lists, **bold**, paragraphs.
 * Everything else (raw HTML, links, images, code, numbered lists) stays literal text.
 * Output is React elements only, so React escapes all text. No innerHTML.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  parts.forEach((part, i) => {
    if (part === '') return;
    out.push(i % 2 === 1 ? <strong key={`${keyBase}-${i}`}>{part}</strong> : part);
  });
  return out;
}

type Block = { kind: 'h'; level: 2 | 3; text: string } | { kind: 'ul'; items: string[] } | { kind: 'p'; text: string };

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
    if (list) blocks.push({ kind: 'ul', items: list });
    para = [];
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^(##|###) +(.+)$/.exec(line);
    const bullet = /^- +(.+)$/.exec(line);
    if (line === '') {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: 'h', level: heading[1] === '##' ? 2 : 3, text: heading[2] ?? '' });
    } else if (bullet) {
      if (para.length) flush();
      list = [...(list ?? []), bullet[1] ?? ''];
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export interface MarkdownProps {
  source: string;
  className?: string;
  /** Headings one level lower (## as h3, ### as h4), for text shown under a heading of its own. */
  demote?: boolean;
}

export function Markdown({ source, className, demote = false }: MarkdownProps) {
  return (
    <div className={['flex flex-col gap-3 leading-relaxed', className].filter(Boolean).join(' ')}>
      {parseMarkdown(source).map((b, i) => {
        const key = `b${i}`;
        if (b.kind === 'h') {
          const Tag = demote ? (b.level === 2 ? 'h3' : 'h4') : b.level === 2 ? 'h2' : 'h3';
          return (
            <Tag key={key} className={b.level === 2 ? 'text-xl font-bold' : 'text-lg font-semibold'}>
              {inline(b.text, key)}
            </Tag>
          );
        }
        if (b.kind === 'ul') {
          return (
            <ul key={key} className="list-disc ps-6">
              {b.items.map((it, j) => (
                <li key={`${key}-${j}`}>{inline(it, `${key}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={key}>{inline(b.text, key)}</p>;
      })}
    </div>
  );
}

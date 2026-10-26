// Pasted Markdown becomes lessons. Brief 5.1 and 8; M3 plan assumption 12.
// Images, HTML and non-https links are dropped with a warning; nothing unsafe reaches a lesson.
import { isSafeHttpsUrl, type ContentBlock, type Lesson } from '../schemas/learning';

export interface MarkdownWarning {
  kind: 'image' | 'html' | 'unsafeLink';
  line: number;
}

const URL_PART = String.raw`[^\s()]*(?:\([^\s()]*\)[^\s()]*)*`;
const IMAGE = new RegExp(String.raw`!\[[^\]]*\]\(${URL_PART}(?:\s+"[^"]*")?\)`, 'g');
const LINK = new RegExp(String.raw`\[([^\]]*)\]\((${URL_PART})(?:\s+"[^"]*")?\)`, 'g');
const HTML = /<[a-zA-Z!/][^>]*>/;
const HEADING = /^(#{1,3})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;

const slug = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '');

const wordCount = (blocks: ContentBlock[]): number => {
  const text = blocks
    .map((b) => (b.kind === 'keyPoints' ? b.items.join(' ') : 'markdown' in b ? b.markdown : ''))
    .join(' ');
  return text.split(/\s+/).filter(Boolean).length;
};

export const markdownToLessons = (markdown: string): { lessons: Lesson[]; warnings: MarkdownWarning[] } => {
  const warnings: MarkdownWarning[] = [];
  const drafts: { title: string; blocks: ContentBlock[] }[] = [];
  let current: { title: string; blocks: ContentBlock[] } | null = null;
  let para: string[] = [];
  let list: string[] = [];
  let callout: string[] = [];

  const isKeyPoints = (): boolean => current !== null && current.title.trim().toLowerCase() === 'key points';
  const ensure = (): { title: string; blocks: ContentBlock[] } => {
    if (!current) {
      current = { title: 'Introduction', blocks: [] };
      drafts.push(current);
    }
    return current;
  };
  const flush = (): void => {
    if (para.length > 0) ensure().blocks.push({ kind: 'text', markdown: para.join('\n') });
    if (list.length > 0) ensure().blocks.push({ kind: 'keyPoints', items: list });
    if (callout.length > 0) ensure().blocks.push({ kind: 'callout', tone: 'info', markdown: callout.join('\n') });
    para = [];
    list = [];
    callout = [];
  };

  markdown.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (HTML.test(raw)) {
      warnings.push({ kind: 'html', line });
      return;
    }
    let text = raw;
    const withoutImages = text.replace(IMAGE, '');
    if (withoutImages !== text) {
      warnings.push({ kind: 'image', line });
      text = withoutImages;
      if (text.trim() === '') return;
    }
    text = text.replace(LINK, (whole, label: string, url: string) => {
      if (isSafeHttpsUrl(url)) return whole;
      warnings.push({ kind: 'unsafeLink', line });
      return label;
    });
    if (text.trim() === '') {
      flush();
      return;
    }
    const heading = HEADING.exec(text);
    if (heading && heading[1] !== '###') {
      flush();
      current = { title: heading[2]?.trim() || 'Untitled lesson', blocks: [] };
      drafts.push(current);
      return;
    }
    const body = heading ? (heading[2] ?? '') : text.trim();
    if (!heading && text.startsWith('> ')) {
      if (para.length > 0 || list.length > 0) flush();
      callout.push(text.slice(2).trim());
      return;
    }
    const bullet = heading ? null : BULLET.exec(text);
    if (bullet && isKeyPoints()) {
      if (para.length > 0 || callout.length > 0) flush();
      list.push((bullet[1] ?? '').trim());
      return;
    }
    if (list.length > 0 || callout.length > 0) flush();
    para.push(body);
  });
  flush();

  const used = new Set<string>();
  const lessons = drafts.map((d): Lesson => {
    const base = slug(d.title) || 'lesson';
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    return { id, title: d.title, minutes: Math.max(1, Math.ceil(wordCount(d.blocks) / 200)), blocks: d.blocks };
  });
  return { lessons, warnings };
};

import { useEffect, useRef } from 'react';
import { focusClasses } from './Button';
import { Icon } from './Icon';

export interface LearnMoreLinkProps {
  url: string;
  /** For example "Learn more: Keeping children safe in education". */
  label: string;
  /** For example "(opens in a new tab)". Read out last. */
  newTabLabel: string;
  /** For example "Official guidance". */
  kindLabel: string;
  domain: string;
  locator?: string;
  onOpen?: () => void;
}

/** Only plain https links without embedded credentials become anchors. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.username === '' && u.password === '';
  } catch {
    return false;
  }
}

export function LearnMoreLink({ url, label, newTabLabel, kindLabel, domain, locator, onOpen }: LearnMoreLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  });
  const safe = isSafeExternalUrl(url);

  // Native capture listeners so onOpen runs before any other handler, including middle click.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => openRef.current?.();
    el.addEventListener('click', handler, true);
    el.addEventListener('auxclick', handler, true);
    return () => {
      el.removeEventListener('click', handler, true);
      el.removeEventListener('auxclick', handler, true);
    };
  }, [safe]);

  if (!safe) return <span className="font-semibold">{label}</span>;

  return (
    <a
      ref={ref}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'inline-flex min-h-[var(--target-min)] flex-col justify-center py-1 text-[var(--color-accent)]',
        focusClasses,
      ].join(' ')}
    >
      <span className="inline-flex items-center gap-1 font-semibold underline">
        {label}
        <Icon name="external" size={16} />
      </span>
      <span className="text-sm text-[var(--color-text-muted)]">
        {kindLabel} · {domain}
        {locator ? ` · ${locator}` : ''}
      </span>
      <span className="text-sm"> {newTabLabel}</span>
    </a>
  );
}

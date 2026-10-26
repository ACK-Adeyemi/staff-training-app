import type { ReactNode } from 'react';

export interface DescriptionListProps {
  items: { term: string; description: ReactNode }[];
}

export function DescriptionList({ items }: DescriptionListProps) {
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="font-semibold text-[var(--color-text-muted)]">{it.term}</dt>
          <dd className="m-0 mb-2 sm:mb-0">{it.description}</dd>
        </div>
      ))}
    </dl>
  );
}

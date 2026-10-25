import { useState } from 'react';
import { Badge, Card, PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { useStaffData } from './queries';

/** S3. */
export function Learn() {
  const t = useT();
  const q = useStaffData();
  const [search, setSearch] = useState('');
  if (q.isError) return <p role="alert">{t('staff.learn.loadError')}</p>;
  const data = q.data;
  const needle = search.trim().toLowerCase();
  const published = (data?.modules ?? []).filter((m) => m.status === 'published');
  const required = new Set<string>();
  for (const r of data?.summary.rows ?? []) if (r.moduleId) required.add(r.moduleId);
  for (const a of data?.assignments ?? [])
    if (a.status === 'open' && 'moduleId' in a.target) required.add(a.target.moduleId);
  const shown = published.filter((m) => m.title.toLowerCase().includes(needle));
  return (
    <>
      <PageHeader title={t('staff.learn.title')} />
      <label htmlFor="learn-search" className="mb-1 block font-semibold">
        {t('staff.learn.search')}
      </label>
      <input
        id="learn-search"
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        className="mb-4 min-h-[var(--target-min)] w-full rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      />
      {!data ? <p>{t('shell.loading')}</p> : null}
      {data && published.length === 0 ? <p>{t('staff.learn.empty')}</p> : null}
      {data && published.length > 0 && shown.length === 0 ? <p role="status">{t('staff.learn.noResults')}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {shown.map((m) => (
          <li key={m.id}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={`#/staff/module/${m.id}`}
                  className="inline-flex min-h-[var(--target-min)] items-center text-lg font-semibold underline focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                >
                  {m.title}
                </a>
                <Badge tone={required.has(m.id) ? 'demo' : 'neutral'}>
                  {required.has(m.id) ? t('staff.learn.required') : t('staff.learn.optional')}
                </Badge>
              </div>
              <p className="mt-1 mb-0">{t('staff.learn.minutes', { count: m.estimatedMinutes })}</p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

import { useState } from 'react';
import { Card, PageHeader, StatusBadge } from '@sta/ui';
import { overallStatus } from '@sta/domain';
import { useT } from '../../app/hooks';
import { focusLink } from '../staff/styles';
import { fullName, useClientData } from './queries';

/** C2: everyone the actor may see, with the worst status of their requirements. */
export function People() {
  const t = useT();
  const q = useClientData();
  const [search, setSearch] = useState('');
  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const { view } = q.data;
  const needle = search.trim().toLowerCase();
  const rows = view.people
    .filter((p) => p.status !== 'archived')
    .filter((p) => needle === '' || fullName(p).toLowerCase().includes(needle))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    .map((p) => ({ person: p, status: overallStatus(view, p) }));

  return (
    <>
      <PageHeader title={t('nav.client.people')} />
      <div className="mb-4 flex max-w-md flex-col gap-1">
        <label htmlFor="people-search" className="font-semibold">
          {t('client.people.search')}
        </label>
        <input
          id="people-search"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          className="min-h-[var(--target-min)] rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
        />
      </div>
      {rows.length === 0 ? <p>{t('client.people.empty')}</p> : null}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ person, status }) => (
          <li key={person.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={`#/client/people/${person.id}`}
                className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
              >
                {fullName(person)}
              </a>
              <StatusBadge status={status} label={t(`client.status.${status}`)} />
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

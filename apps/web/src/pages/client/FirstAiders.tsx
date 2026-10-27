// The first aiders list, outside the client chrome so it prints cleanly (brief 28.3). Needs evidence.view.
import type { ReactNode } from 'react';
import { Button } from '@sta/ui';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { useFirstAiders, type FirstAidersData } from './evidenceQueries';
import { holdsAnywhere } from '@sta/domain';
import { fullName, usePermissions } from './queries';

function List({ data }: { data: FirstAidersData }) {
  const t = useT();
  const { sites, rows } = data;
  return (
    <>
      {sites.map((site) => {
        const here = rows.filter((r) => r.person.primarySiteId === site.id);
        return (
          <section key={site.id} aria-labelledby={`fa-${site.id}`} className="mb-6">
            <h2 id={`fa-${site.id}`} className="mb-2 text-xl font-bold">
              {site.name}
            </h2>
            {here.length === 0 ? (
              <p className="m-0">{t('evidenceFlow.noFirstAiders')}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {here.map((r) => (
                  <li key={r.person.id}>
                    <span className="font-semibold">{fullName(r.person)}</span>
                    {r.approvedBy && r.approvedAt ? (
                      <span className="block text-sm">
                        {t('evidenceFlow.approvedBy', { name: r.approvedBy, date: formatLondonDate(r.approvedAt) })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <div className="print:hidden">
        <Button
          onClick={() => {
            window.print();
          }}
        >
          {t('evidenceFlow.printList')}
        </Button>
      </div>
    </>
  );
}

export function FirstAiders() {
  const t = useT();
  const perms = usePermissions();
  const q = useFirstAiders();
  const page = (body: ReactNode) => (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mt-0 text-2xl font-bold">{t('evidenceFlow.firstAidersTitle')}</h1>
      {body}
    </main>
  );
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (!holdsAnywhere(perms.data, 'evidence.view')) return page(<p role="alert">{t('errors.forbidden')}</p>);
  if (q.isError) return page(<p role="alert">{t('evidenceFlow.loadError')}</p>);
  // The heading waits for the list, so the page reads as one piece.
  if (!q.data) return <p>{t('shell.loading')}</p>;
  return page(<List data={q.data} />);
}

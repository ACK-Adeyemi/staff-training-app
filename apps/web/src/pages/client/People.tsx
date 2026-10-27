import { useState, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Dialog, PageHeader, SegmentedControl, StatusBadge } from '@sta/ui';
import { can, londonDateString, overallStatus, siteRollup, type ClientView, type Person, type Site } from '@sta/domain';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { useSiteScope } from '../../app/siteScope';
import { focusLink } from '../staff/styles';
import { field } from './organiseShared';
import { fullName, orEmpty, useClientData, usePermissions } from './queries';

/** C2: everyone the actor may see, with the worst status of their requirements. */
const close = (fn: (v: boolean) => void) => () => {
  fn(false);
};

type Row = { person: Person; status: ReturnType<typeof overallStatus> };

function PersonCard({ person, status }: Row) {
  const t = useT();
  return (
    <li>
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
  );
}

const grid = 'm-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3';

/** One site: a button to fold it, the site's figures, and (when open) its people. Floating staff are not in here. */
function SiteGroup({
  site,
  view,
  rows,
  total,
  open,
  onToggle,
}: {
  site: Site;
  view: ClientView;
  rows: Row[];
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const rollup = siteRollup({ ...view, assignments: [], events: [] }, site.id);
  const count = total;
  const listId = `site-group-${site.id}`;
  return (
    <section data-testid="site-group" className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className={`flex min-h-[var(--target-min)] w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-start text-lg font-bold ${focusLink}`}
      >
        {site.name}
      </button>
      <p data-testid="site-group-stats" className="mx-0 my-2">
        {[
          count === 1 ? t('sites.peopleOne') : t('sites.peopleCount', { count }),
          t('sites.complianceFigure', { percent: rollup.compliancePercent }),
          t('sites.overdueFigure', { count: rollup.overdue }),
          t('sites.expiringFigure', { count: rollup.expiring }),
        ].join(' · ')}
      </p>
      <div id={listId}>
        {open ? (
          <ul className={grid}>
            {rows.map((r) => (
              <PersonCard key={r.person.id} {...r} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** Staff from other primary sites who also work at the chosen site: listed, not counted. */
function AlsoWorksHere({ rows }: { rows: Row[] }) {
  const t = useT();
  return (
    <section aria-labelledby="people-also" className="mb-4">
      <h2 id="people-also" className="mb-2 mt-0 text-lg font-bold">
        {t('sites.alsoWorksHere')}
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 p-0">
        {rows.map(({ person }) => (
          <li key={person.id}>
            <a
              href={`#/client/people/${person.id}`}
              className={`inline-flex min-h-[var(--target-min)] items-center font-semibold underline ${focusLink}`}
            >
              {fullName(person)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function People() {
  const t = useT();
  const q = useClientData();
  const perms = usePermissions();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [mode, setMode] = useState<'bySite' | 'oneList'>('bySite');
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const site = useSiteScope();
  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const { view } = q.data;
  // Only sites where the person may manage staff, as the data layer decides.
  const addSites = perms.data
    ? view.sites.filter((s) => can(perms.data, 'staff.manage', { clientId: s.clientId, siteIds: [s.id] }))
    : [];
  const needle = search.trim().toLowerCase();
  const multi = view.sites.length > 1;
  const toRows = (people: Person[]): Row[] =>
    people
      .filter((p) => p.status !== 'archived')
      .filter((p) => needle === '' || fullName(p).toLowerCase().includes(needle))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
      .map((p) => ({ person: p, status: overallStatus(view, p) }));
  const chosen = multi && site !== 'all' ? site : null;
  const rows = toRows(chosen ? view.people.filter((p) => p.primarySiteId === chosen) : view.people);
  const also = chosen
    ? toRows(view.people.filter((p) => p.primarySiteId !== chosen && p.additionalSiteIds.includes(chosen)))
    : [];
  const groups = multi && mode === 'bySite';
  const shownSites = view.sites
    .filter((s) => s.status === 'active' && (chosen === null || s.id === chosen))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));

  return (
    <>
      <PageHeader title={t('nav.client.people')} />
      {addSites.length > 0 ? (
        <div className="mb-4">
          <Button
            onClick={() => {
              setAdded(false);
              setAdding(true);
            }}
          >
            {t('client.people.add')}
          </Button>
        </div>
      ) : null}
      {added ? <p role="status">{t('client.people.added')}</p> : null}
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
      {multi ? (
        <div className="mb-4">
          <SegmentedControl
            legend={t('sites.view')}
            options={[
              { value: 'bySite', label: t('sites.viewBySite') },
              { value: 'oneList', label: t('sites.viewOneList') },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v === 'oneList' ? 'oneList' : 'bySite');
            }}
          />
        </div>
      ) : null}
      {rows.length === 0 ? <p>{t('client.people.empty')}</p> : null}
      {groups ? (
        shownSites.map((s) => (
          <SiteGroup
            key={s.id}
            site={s}
            view={view}
            rows={rows.filter((r) => r.person.primarySiteId === s.id)}
            total={view.people.filter((p) => p.status !== 'archived' && p.primarySiteId === s.id).length}
            open={folded[s.id] !== true}
            onToggle={() => {
              setFolded({ ...folded, [s.id]: folded[s.id] !== true });
            }}
          />
        ))
      ) : (
        <ul className={grid}>
          {rows.map((r) => (
            <PersonCard key={r.person.id} {...r} />
          ))}
        </ul>
      )}
      {also.length > 0 ? <AlsoWorksHere rows={also} /> : null}
      <Dialog open={adding} title={t('client.people.addTitle')} onClose={close(setAdding)}>
        {adding ? (
          <AddForm
            sites={addSites}
            onClose={close(setAdding)}
            onAdded={() => {
              setAdded(true);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function AddForm({ sites, onClose, onAdded }: { sites: Site[]; onClose: () => void; onAdded: () => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ['jobRoles', actor.userId], queryFn: () => orEmpty(store.jobRoles.list(actor)) });
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [site, setSite] = useState(sites[0]?.id ?? '');
  const [role, setRole] = useState('');
  const [start, setStart] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (first.trim() === '' || last.trim() === '') {
      setError(t('client.people.errorName'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await store.people.add(actor, {
        primarySiteId: site,
        additionalSiteIds: [],
        teamIds: [],
        firstName: first.trim(),
        lastName: last.trim(),
        jobRoleIds: role ? [role] : [],
        startDate: `${start || londonDateString(clock.now())}T00:00:00.000Z`,
        status: 'active',
      });
      await queryClient.invalidateQueries();
      onAdded();
      onClose();
    } catch {
      setError(t('client.people.errorSave'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-semibold">
        {t('client.people.firstName')}
        <input
          type="text"
          value={first}
          onChange={(e) => {
            setFirst(e.target.value);
          }}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {t('client.people.lastName')}
        <input
          type="text"
          value={last}
          onChange={(e) => {
            setLast(e.target.value);
          }}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {t('client.people.primarySite')}
        <select
          value={site}
          onChange={(e) => {
            setSite(e.target.value);
          }}
          className={field}
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {t('client.people.jobRole')}
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
          }}
          className={field}
        >
          <option value="">{t('client.people.noJobRole')}</option>
          {(roles.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {t('client.people.startDate')}
        <input
          type="date"
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
          }}
          className={field}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {t('client.people.addPerson')}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {t('client.people.cancel')}
        </Button>
      </div>
    </form>
  );
}

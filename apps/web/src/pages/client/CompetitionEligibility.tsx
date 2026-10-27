// C12 "Who can take part": job role, team, site and person pickers with a live head count (plan M3 note 13).
// None ticked in a group means everyone for that group. The count uses the domain isEligible rule.
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isEligible, type Competition, type Person } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { field } from './organiseShared';
import { fullName, orEmpty } from './queries';

export type Eligibility = Competition['eligibility'];

/** Ticked ids become a key only when there is at least one (an empty group means everyone). */
export function buildEligibility(pick: {
  jobRoleIds: string[];
  teamIds: string[];
  siteIds: string[];
  excludePersonIds: string[];
}): Eligibility {
  const out: Eligibility = { excludePersonIds: pick.excludePersonIds };
  if (pick.jobRoleIds.length > 0) out.jobRoleIds = pick.jobRoleIds;
  if (pick.teamIds.length > 0) out.teamIds = pick.teamIds;
  if (pick.siteIds.length > 0) out.siteIds = pick.siteIds;
  return out;
}

const toggle = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="mb-1 font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Box({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
      />
      <span>{label}</span>
    </label>
  );
}

export function CompetitionEligibility({
  value,
  onChange,
}: {
  value: { jobRoleIds: string[]; teamIds: string[]; siteIds: string[]; excludePersonIds: string[] };
  onChange: (patch: Partial<typeof value>) => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const searchId = useId();
  const [search, setSearch] = useState('');
  const lists = useQuery({
    queryKey: ['eligibilityLists', actor.userId],
    queryFn: async () => {
      const [roles, teams, sites, people] = await Promise.all([
        orEmpty(store.jobRoles.list(actor)),
        orEmpty(store.teams.list(actor)),
        orEmpty(store.sites.list(actor)),
        orEmpty(store.people.list(actor)),
      ]);
      return { roles, teams, sites, people: people.filter((p) => p.status !== 'archived') };
    },
  });
  const people = useMemo<Omit<Person, 'prefs'>[]>(() => lists.data?.people ?? [], [lists.data]);
  const count = useMemo(
    () => people.filter((p) => isEligible({ eligibility: buildEligibility(value) }, p as Person)).length,
    [people, value],
  );
  if (!lists.data) return <p>{t('shell.loading')}</p>;
  const { roles, teams, sites } = lists.data;
  const needle = search.trim().toLowerCase();
  const shown = people.filter(
    (p) => value.excludePersonIds.includes(p.id) || needle === '' || fullName(p).toLowerCase().includes(needle),
  );
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 font-semibold">{t('competition.eligibility.title')}</legend>
      <p className="m-0">{t('competition.builder.everyone')}</p>
      <Group legend={t('competition.eligibility.jobRoles')}>
        {roles.map((r) => (
          <Box
            key={r.id}
            label={r.name}
            checked={value.jobRoleIds.includes(r.id)}
            onChange={() => {
              onChange({ jobRoleIds: toggle(value.jobRoleIds, r.id) });
            }}
          />
        ))}
      </Group>
      <Group legend={t('competition.eligibility.teams')}>
        {teams.map((x) => (
          <Box
            key={x.id}
            label={x.name}
            checked={value.teamIds.includes(x.id)}
            onChange={() => {
              onChange({ teamIds: toggle(value.teamIds, x.id) });
            }}
          />
        ))}
      </Group>
      {sites.length > 1 ? (
        <Group legend={t('competition.eligibility.sites')}>
          {sites.map((s) => (
            <Box
              key={s.id}
              label={s.name}
              checked={value.siteIds.includes(s.id)}
              onChange={() => {
                onChange({ siteIds: toggle(value.siteIds, s.id) });
              }}
            />
          ))}
        </Group>
      ) : null}
      <Group legend={t('competition.eligibility.leaveOut')}>
        <label htmlFor={searchId} className="font-semibold">
          {t('competition.eligibility.find')}
        </label>
        <input
          id={searchId}
          type="text"
          value={search}
          autoComplete="off"
          className={field}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {shown.map((p) => (
            <Box
              key={p.id}
              label={fullName(p)}
              checked={value.excludePersonIds.includes(p.id)}
              onChange={() => {
                onChange({ excludePersonIds: toggle(value.excludePersonIds, p.id) });
              }}
            />
          ))}
        </div>
      </Group>
      <p data-testid="eligibility-summary" className="m-0 font-semibold">
        {t(count === 1 ? 'competition.eligibility.countOne' : 'competition.eligibility.count', { n: String(count) })}
      </p>
    </fieldset>
  );
}

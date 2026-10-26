import { useMemo, useState } from 'react';
import { nurseryCategories, nurseryComingSoon, nurseryPack, type MessageKey } from '@sta/content';
import {
  Badge,
  Button,
  Card,
  ChoiceList,
  Chip,
  Highlight,
  Icon,
  PageHeader,
  SearchField,
  Sheet,
  Switch,
} from '@sta/ui';
import {
  fold,
  findRanges,
  groupProgress,
  searchModules,
  searchTerms,
  type CatalogueFilters,
  type CatalogueRow,
  type CatalogueSort,
  type ModuleStatus,
} from '@sta/domain';
import { useT } from '../../app/hooks';
import { useDisplayPrefs } from '../../app/display/context';
import { catToken, countKey } from '../organise/queries';
import { useLearnCatalogue } from './learnQueries';
import { focusLink } from './styles';

type Draft = { filters: CatalogueFilters; sort: CatalogueSort };
const ALL = 'all';
const STATUSES: { id: ModuleStatus; key: MessageKey }[] = [
  { id: 'notStarted', key: 'staff.learn.statusNotStarted' },
  { id: 'inProgress', key: 'staff.learn.statusInProgress' },
  { id: 'completed', key: 'staff.learn.statusCompleted' },
];
const SORTS: { id: CatalogueSort; key: MessageKey }[] = [
  { id: 'due', key: 'staff.learn.sortDue' },
  { id: 'recent', key: 'staff.learn.sortRecent' },
  { id: 'az', key: 'staff.learn.sortAz' },
];
const STATE_LABELS = { correct: '', incorrect: '' };
const sectionHeading = 'mb-2 mt-6 text-lg font-bold';
const cardButton =
  'flex min-h-[var(--target-min)] w-full cursor-pointer flex-col items-start gap-1 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-start text-[var(--color-text)] ' +
  focusLink;

const withoutKey = (f: CatalogueFilters, key: keyof CatalogueFilters): CatalogueFilters =>
  Object.fromEntries(Object.entries(f).filter(([k]) => k !== key));
const isActive = (f: CatalogueFilters): boolean => Object.keys(f).length > 0;

/** S3. */
export function Learn() {
  const t = useT();
  const q = useLearnCatalogue();
  const { prefs } = useDisplayPrefs();
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<Draft>({ filters: {}, sort: 'due' });
  const [draft, setDraft] = useState<Draft>(applied);
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const result = useMemo(() => searchModules(rows, search, applied.filters, applied.sort), [rows, search, applied]);
  const draftCount = useMemo(() => searchModules(rows, search, draft.filters, draft.sort).count, [rows, search, draft]);

  if (q.isError) return <p role="alert">{t('staff.learn.loadError')}</p>;
  const data = q.data;
  const categories = (data?.categories ?? []).filter((c) => rows.some((r) => r.category?.id === c.id));
  const groups = (data?.groups ?? []).filter((g) => groupProgress(g, rows).total > 0);
  const terms = searchTerms(search);
  const filtering = terms.length > 0 || isActive(applied.filters);

  const countText = (n: number) => t(`staff.learn.count.${countKey(n)}`, { n });
  const setFilters = (filters: CatalogueFilters) => {
    setApplied((a) => ({ ...a, filters }));
  };
  const openFilters = () => {
    setDraft(applied);
    setOpen(true);
  };
  const patchDraft = (patch: Partial<CatalogueFilters>) => {
    setDraft((d) => ({ ...d, filters: { ...d.filters, ...patch } }));
  };
  const clearDraftKey = (key: keyof CatalogueFilters) => {
    setDraft((d) => ({ ...d, filters: withoutKey(d.filters, key) }));
  };

  const chips: { key: keyof CatalogueFilters; label: string; colour?: string }[] = [];
  const f = applied.filters;
  if (f.categoryId !== undefined) {
    const c = data?.categories.find((x) => x.id === f.categoryId);
    if (c) chips.push({ key: 'categoryId', label: c.name, colour: catToken(c.colour) });
  }
  if (f.groupId !== undefined) {
    const g = data?.groups.find((x) => x.id === f.groupId);
    if (g) chips.push({ key: 'groupId', label: g.name });
  }
  if (f.status !== undefined)
    chips.push({ key: 'status', label: t(STATUSES.find((s) => s.id === f.status)?.key ?? 'staff.learn.status') });
  if (f.requirement !== undefined)
    chips.push({
      key: 'requirement',
      label: t(f.requirement === 'required' ? 'staff.learn.required' : 'staff.learn.optional'),
    });
  if (f.due) chips.push({ key: 'due', label: t('staff.learn.dueSoon') });
  if (f.underTenMinutes) chips.push({ key: 'underTenMinutes', label: t('staff.learn.underTen') });

  const catRanges = (r: CatalogueRow) => {
    const name = r.category?.name ?? '';
    const folded = fold(name);
    return terms.flatMap((term) => findRanges(folded, term));
  };

  const rowBody = (r: CatalogueRow, big: boolean) => (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={`#/staff/module/${r.module.id}`}
          className={`inline-flex min-h-[var(--target-min)] items-center ${big ? 'text-xl' : 'text-lg'} font-semibold underline ${focusLink}`}
        >
          <Highlight text={r.module.title} ranges={result.highlights[r.module.id] ?? []} />
        </a>
        <Badge tone={r.required ? 'demo' : 'neutral'}>
          {r.required ? t('staff.learn.required') : t('staff.learn.optional')}
        </Badge>
      </div>
      <p className="mt-1 mb-0">
        {t('staff.learn.minutes', { count: r.minutes })}
        {' · '}
        {t(STATUSES.find((s) => s.id === r.status)?.key ?? 'staff.learn.status')}
        {r.dueState === 'dueSoon' ? ` · ${t('staff.learn.dueLabel')}` : ''}
        {r.dueState === 'overdue' ? ` · ${t('staff.learn.overdueLabel')}` : ''}
      </p>
      {r.category ? (
        <p className="mt-1 mb-0 inline-flex items-center gap-1 text-sm">
          <Icon name={r.category.icon} size={16} />
          <span>
            <Highlight text={r.category.name} ranges={catRanges(r)} />
          </span>
        </p>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader title={t('staff.learn.title')} />
      <SearchField
        label={t('staff.learn.search')}
        value={search}
        onChange={setSearch}
        clearLabel={t('staff.learn.clearSearchBox')}
        placeholder={t('staff.learn.searchHint')}
      />
      <div className="my-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={openFilters}>
          {t('staff.learn.filters')}
        </Button>
        <span data-testid="learn-count" aria-live="polite" className="font-semibold">
          {countText(result.count)}
        </span>
      </div>
      {chips.length > 0 ? (
        <div data-testid="learn-active-filters" className="mb-3 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              {...(c.colour ? { colour: c.colour } : {})}
              removeLabel={t('staff.learn.removeFilter', { label: c.label })}
              onRemove={() => {
                setFilters(withoutKey(applied.filters, c.key));
              }}
            />
          ))}
        </div>
      ) : null}

      {!data ? <p>{t('shell.loading')}</p> : null}
      {data && rows.length === 0 ? <p>{t('staff.learn.empty')}</p> : null}
      {data && rows.length > 0 && result.count === 0 ? (
        <div className="mb-4">
          <p role="status" className="mb-2">
            {t('staff.learn.noResults')}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setSearch('');
              setFilters({});
            }}
          >
            {t('staff.learn.clearSearch')}
          </Button>
        </div>
      ) : null}

      {prefs.simpleView ? (
        <ul data-testid="learn-simple-list" className="m-0 flex list-none flex-col gap-4 p-0">
          {result.rows.map((r) => (
            <li key={r.module.id} className="border-b-2 border-[var(--color-border)] pb-3">
              {rowBody(r, true)}
            </li>
          ))}
        </ul>
      ) : (
        <ul data-testid="learn-path" className="m-0 flex list-none flex-col gap-3 p-0">
          {result.rows.map((r) => (
            <li key={r.module.id} data-testid="path-node" className="flex items-stretch gap-3">
              <span aria-hidden="true" className="flex flex-col items-center">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)]">
                  <Icon
                    name={r.status === 'completed' ? 'check' : r.status === 'inProgress' ? 'clock' : 'book'}
                    size={16}
                  />
                </span>
                <span className="w-0.5 flex-1 bg-[var(--color-border)]" />
              </span>
              <Card className="flex-1">{rowBody(r, false)}</Card>
            </li>
          ))}
        </ul>
      )}

      {categories.length > 0 ? (
        <section aria-labelledby="learn-categories">
          <h2 id="learn-categories" className={sectionHeading}>
            {t('staff.learn.categories')}
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {categories.map((c) => {
              const n = rows.filter((r) => r.category?.id === c.id).length;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={f.categoryId === c.id}
                    style={{ borderInlineStartColor: `var(--${catToken(c.colour)})`, borderInlineStartWidth: 8 }}
                    className={cardButton}
                    onClick={() => {
                      setFilters({ ...applied.filters, categoryId: c.id });
                    }}
                  >
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <Icon name={c.icon} size={18} />
                      {c.name}
                    </span>
                    <span className="text-sm">{countText(n)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {groups.length > 0 ? (
        <section aria-labelledby="learn-groups">
          <h2 id="learn-groups" className={sectionHeading}>
            {t('staff.learn.groups')}
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {groups.map((g) => {
              const p = groupProgress(g, rows);
              const next = p.nextModuleId ? rows.find((r) => r.module.id === p.nextModuleId) : undefined;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    aria-pressed={f.groupId === g.id}
                    className={cardButton}
                    onClick={() => {
                      setFilters({ ...applied.filters, groupId: g.id });
                    }}
                  >
                    <span className="font-semibold">{g.name}</span>
                    <span className="text-sm">
                      {t('staff.learn.groupProgress', { done: p.completed, total: p.total })}
                    </span>
                    {next ? (
                      <span className="text-sm">
                        {t('staff.learn.nextInGroup')}: {next.module.title}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {data && !filtering && data.packId === nurseryPack.id ? (
        <section aria-labelledby="learn-soon">
          <h2 id="learn-soon" className={sectionHeading}>
            {t('staff.learn.comingSoon')}
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {nurseryComingSoon.map((topic) => {
              const cat = nurseryCategories.find((c) => c.key === topic.categoryKey);
              return (
                <li key={topic.id}>
                  <Card className="border-dashed">
                    <p className="m-0 font-semibold">{t(topic.titleKey as MessageKey)}</p>
                    {cat ? <p className="m-0 text-sm">{cat.name}</p> : null}
                    <p className="m-0 mt-1 text-sm">
                      <Badge>{t('staff.learn.comingSoon')}</Badge>
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Sheet
        open={open}
        title={t('staff.learn.filters')}
        onClose={() => {
          setOpen(false);
        }}
      >
        {open ? (
          <div className="flex flex-col gap-4">
            <ChoiceList
              name="learn-category"
              legend={t('staff.learn.category')}
              type="single"
              radioGroup
              stateLabels={STATE_LABELS}
              options={[
                { id: ALL, label: t('staff.learn.all') },
                ...categories.map((c) => ({ id: c.id, label: c.name })),
              ]}
              value={[draft.filters.categoryId ?? ALL]}
              onChange={([id]) => {
                if (id === undefined || id === ALL) clearDraftKey('categoryId');
                else patchDraft({ categoryId: id });
              }}
            />
            <ChoiceList
              name="learn-group"
              legend={t('staff.learn.group')}
              type="single"
              radioGroup
              stateLabels={STATE_LABELS}
              options={[{ id: ALL, label: t('staff.learn.all') }, ...groups.map((g) => ({ id: g.id, label: g.name }))]}
              value={[draft.filters.groupId ?? ALL]}
              onChange={([id]) => {
                if (id === undefined || id === ALL) clearDraftKey('groupId');
                else patchDraft({ groupId: id });
              }}
            />
            <ChoiceList
              name="learn-status"
              legend={t('staff.learn.status')}
              type="single"
              radioGroup
              stateLabels={STATE_LABELS}
              options={[
                { id: ALL, label: t('staff.learn.all') },
                ...STATUSES.map((s) => ({ id: s.id, label: t(s.key) })),
              ]}
              value={[draft.filters.status ?? ALL]}
              onChange={([id]) => {
                const s = STATUSES.find((x) => x.id === id);
                if (s) patchDraft({ status: s.id });
                else clearDraftKey('status');
              }}
            />
            <ChoiceList
              name="learn-requirement"
              legend={t('staff.learn.requirement')}
              type="single"
              radioGroup
              stateLabels={STATE_LABELS}
              options={[
                { id: ALL, label: t('staff.learn.all') },
                { id: 'required', label: t('staff.learn.required') },
                { id: 'optional', label: t('staff.learn.optional') },
              ]}
              value={[draft.filters.requirement ?? ALL]}
              onChange={([id]) => {
                if (id === 'required' || id === 'optional') patchDraft({ requirement: id });
                else clearDraftKey('requirement');
              }}
            />
            <Switch
              label={t('staff.learn.dueSoon')}
              checked={draft.filters.due === true}
              onLabel={t('staff.learn.on')}
              offLabel={t('staff.learn.off')}
              onChange={(on) => {
                if (on) patchDraft({ due: true });
                else clearDraftKey('due');
              }}
            />
            <Switch
              label={t('staff.learn.underTen')}
              checked={draft.filters.underTenMinutes === true}
              onLabel={t('staff.learn.on')}
              offLabel={t('staff.learn.off')}
              onChange={(on) => {
                if (on) patchDraft({ underTenMinutes: true });
                else clearDraftKey('underTenMinutes');
              }}
            />
            <ChoiceList
              name="learn-sort"
              legend={t('staff.learn.sortBy')}
              type="single"
              radioGroup
              stateLabels={STATE_LABELS}
              options={SORTS.map((s) => ({ id: s.id, label: t(s.key) }))}
              value={[draft.sort]}
              onChange={([id]) => {
                const s = SORTS.find((x) => x.id === id);
                if (s) setDraft((d) => ({ ...d, sort: s.id }));
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft((d) => ({ ...d, filters: {} }));
                }}
              >
                {t('staff.learn.resetFilters')}
              </Button>
              <Button
                onClick={() => {
                  setApplied(draft);
                  setOpen(false);
                }}
              >
                {t(`staff.learn.show.${countKey(draftCount)}`, { n: draftCount })}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setOpen(false);
                }}
              >
                {t('staff.learn.closeFilters')}
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

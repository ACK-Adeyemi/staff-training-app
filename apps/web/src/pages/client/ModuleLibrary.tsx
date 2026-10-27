// C6 Module Library: every provider module and the client's own modules, as cards or a table, with search, filters,
// sorting and the per-module actions. Provider modules never show edit controls (BP-3).
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Dialog, PageHeader } from '@sta/ui';
import { holdsAnywhere, type Module } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { foundationsErrorKey, inputClass } from './foundationsErrors';
import { PermissionGate } from './PermissionGate';
import { usePermissions } from './queries';

type SourceFilter = '' | 'provider' | 'own';
type SortKey = 'edited' | 'title' | 'completion' | 'overdue';
type Notice = { kind: 'ok' | 'error'; text: string } | null;

const isOwn = (m: Module): boolean => m.owner !== 'provider';
const STATUS_KEY: Record<Module['status'], MessageKey> = {
  draft: 'client.library.statusDraft',
  published: 'client.library.statusPublished',
  archived: 'client.library.statusArchived',
};

const actionClass = `inline-flex min-h-[var(--target-min)] min-w-[var(--target-min)] cursor-pointer items-center justify-center rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-semibold text-[var(--color-text)] ${focusLink}`;

function useLibraryData() {
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  return useQuery({
    queryKey: ['moduleLibrary', actor.userId],
    queryFn: async () => {
      const [modules, placements, categories, assignments, feedback] = await Promise.all([
        store.modules.list(actor),
        // Everything but the modules is a bonus: a role that cannot read it just sees less (no filter, no rating).
        store.modulePlacements.list(actor).catch(() => []),
        store.categories.list(actor).catch(() => []),
        store.assignments.list(actor).catch(() => []),
        store.moduleFeedback.list(actor).catch(() => []),
      ]);
      const now = clock.now().toISOString();
      const stats = new Map<string, { total: number; done: number; overdue: number }>();
      for (const a of assignments) {
        if (!('moduleId' in a.target) || a.status === 'cancelled') continue;
        const s = stats.get(a.target.moduleId) ?? { total: 0, done: 0, overdue: 0 };
        s.total += 1;
        if (a.status === 'done') s.done += 1;
        else if (a.dueAt < now) s.overdue += 1;
        stats.set(a.target.moduleId, s);
      }
      const ratings = new Map<string, number[]>();
      for (const f of feedback) {
        if (f.kind !== 'moduleCard' || f.rating === undefined) continue;
        ratings.set(f.moduleId, [...(ratings.get(f.moduleId) ?? []), f.rating]);
      }
      return { modules, placements, categories, stats, ratings };
    },
  });
}

function slug(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'module';
}

function LibraryBody() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const q = useLibraryData();
  const perms = usePermissions();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SourceFilter>('');
  const [status, setStatus] = useState<'' | Module['status']>('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<SortKey>('edited');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [notice, setNotice] = useState<Notice>(null);
  const [toDelete, setToDelete] = useState<Module | null>(null);

  if (q.isError) return <p role="alert">{t('client.loadError')}</p>;
  if (!q.data || !perms.data) return <p>{t('shell.loading')}</p>;
  const { modules, placements, categories, stats, ratings } = q.data;
  const canManage = holdsAnywhere(perms.data, 'modules.manage');
  const canAddLinks = canManage || holdsAnywhere(perms.data, 'modules.addLinks');

  const needle = search.trim().toLowerCase();
  const rate = (id: string): number => {
    const s = stats.get(id);
    return s && s.total > 0 ? s.done / s.total : 0;
  };
  const shown = modules
    .filter((m) => (source === '' ? true : source === 'own' ? isOwn(m) : !isOwn(m)))
    .filter((m) => status === '' || m.status === status)
    .filter((m) => category === '' || placements.some((p) => p.moduleId === m.id && p.categoryId === category))
    .filter((m) => needle === '' || m.title.toLowerCase().includes(needle))
    .sort((a, b) => {
      const byTitle = a.title.localeCompare(b.title);
      switch (sort) {
        case 'title':
          return byTitle;
        case 'completion':
          return rate(b.id) - rate(a.id) || byTitle;
        case 'overdue':
          return (stats.get(b.id)?.overdue ?? 0) - (stats.get(a.id)?.overdue ?? 0) || byTitle;
        default:
          // Newest first. Provider modules carry no date and come first, as the current provider content.
          if (a.updatedAt === undefined || b.updatedAt === undefined)
            return (a.updatedAt === undefined ? 0 : 1) - (b.updatedAt === undefined ? 0 : 1) || byTitle;
          return b.updatedAt.localeCompare(a.updatedAt) || byTitle;
      }
    });

  const run = async (work: () => Promise<string | null>) => {
    setNotice(null);
    try {
      const ok = await work();
      if (ok) setNotice({ kind: 'ok', text: ok });
      await queryClient.invalidateQueries();
    } catch (e) {
      setNotice({ kind: 'error', text: t(foundationsErrorKey(e)) });
    }
  };

  const duplicate = (m: Module) =>
    run(async () => {
      await store.authoring.duplicate(actor, m.id);
      return t('client.library.duplicated');
    });
  const archive = (m: Module) =>
    run(async () => {
      await store.authoring.archive(actor, m.id);
      return null;
    });
  const exportJson = (m: Module) =>
    run(async () => {
      const text = await store.authoring.exportJson(actor, m.id);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug(m.title)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return null;
    });
  const confirmDelete = () => {
    const m = toDelete;
    setToDelete(null);
    if (m) {
      void run(async () => {
        await store.authoring.remove(actor, m.id);
        return null;
      });
    }
  };

  const actions = (m: Module): ReactNode => {
    const own = isOwn(m);
    const button = (label: MessageKey, onClick: () => void) => (
      <Button variant="secondary" onClick={onClick}>
        {t(label)}
      </Button>
    );
    return (
      <div className="flex flex-wrap gap-2">
        <a href={`#/client/modules/${m.id}/preview`} className={actionClass}>
          {t('client.library.preview')}
        </a>
        {canManage ? button('client.library.duplicate', () => void duplicate(m)) : null}
        {own && canManage ? (
          <a href={`#/client/modules/${m.id}/edit`} className={actionClass}>
            {t('client.library.edit')}
          </a>
        ) : null}
        {own && canManage && m.status !== 'archived' ? button('client.library.archive', () => void archive(m)) : null}
        {own && canManage
          ? button('client.library.delete', () => {
              setNotice(null);
              setToDelete(m);
            })
          : null}
        {own && canManage ? button('client.library.exportJson', () => void exportJson(m)) : null}
        {!own && canAddLinks ? (
          <a href={`#/client/modules/${m.id}/edit`} className={actionClass}>
            {t('client.library.addLinks')}
          </a>
        ) : null}
      </div>
    );
  };

  const ratingLine = (m: Module): string => {
    const list = ratings.get(m.id);
    if (!list || list.length === 0) return t('client.library.noRatings');
    return t('client.library.rating', { rating: (list.reduce((a, b) => a + b, 0) / list.length).toFixed(1) });
  };
  const sourceBadge = (m: Module) => (
    <Badge>{t(isOwn(m) ? 'client.library.badgeOwn' : 'client.library.badgeProvider')}</Badge>
  );
  const edited = (m: Module): string =>
    m.updatedAt ? t('client.library.edited', { date: formatLondonDate(m.updatedAt) }) : '';

  const select = (
    label: MessageKey,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <label className="flex flex-col gap-1 font-semibold">
      {t(label)}
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <PageHeader title={t('client.library.title')} />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 font-semibold">
          {t('client.library.search')}
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            className={inputClass}
          />
        </label>
        {select(
          'client.library.source',
          source,
          (v) => {
            setSource(v as SourceFilter);
          },
          [
            { value: '', label: t('client.library.sourceAll') },
            { value: 'provider', label: t('client.library.sourceProvider') },
            { value: 'own', label: t('client.library.sourceOwn') },
          ],
        )}
        {select(
          'client.library.status',
          status,
          (v) => {
            setStatus(v as '' | Module['status']);
          },
          [
            { value: '', label: t('client.library.statusAll') },
            { value: 'draft', label: t('client.library.statusDraft') },
            { value: 'published', label: t('client.library.statusPublished') },
            { value: 'archived', label: t('client.library.statusArchived') },
          ],
        )}
        {select('client.library.category', category, setCategory, [
          { value: '', label: t('client.library.categoryAll') },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ])}
        {select(
          'client.library.sort',
          sort,
          (v) => {
            setSort(v as SortKey);
          },
          [
            { value: 'edited', label: t('client.library.sortEdited') },
            { value: 'title', label: t('client.library.sortTitle') },
            { value: 'completion', label: t('client.library.sortCompletion') },
            { value: 'overdue', label: t('client.library.sortOverdue') },
          ],
        )}
        <div role="group" aria-label={t('client.library.view')} className="flex items-end gap-2">
          {(['cards', 'table'] as const).map((v) => (
            <Button
              key={v}
              variant={view === v ? 'primary' : 'secondary'}
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
              }}
            >
              {t(v === 'cards' ? 'client.library.cards' : 'client.library.table')}
            </Button>
          ))}
        </div>
      </div>

      {notice ? (
        <p
          role={notice.kind === 'ok' ? 'status' : 'alert'}
          className="mb-4 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3 font-semibold"
        >
          {notice.text}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p>{t('client.library.empty')}</p>
      ) : view === 'cards' ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {shown.map((m) => (
            <li key={m.id} data-testid="module-item" data-module-id={m.id}>
              <Card className="flex h-full flex-col gap-2">
                <h2 className="m-0 text-lg font-bold">{m.title}</h2>
                <p className="m-0 flex flex-wrap items-center gap-2">
                  {sourceBadge(m)}
                  <span>{t(STATUS_KEY[m.status])}</span>
                  <span>{t('client.library.version', { version: m.version })}</span>
                </p>
                {m.updatedAt ? <p className="m-0">{edited(m)}</p> : null}
                <p className="m-0">{ratingLine(m)}</p>
                {actions(m)}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto" role="region" aria-label={t('client.library.tableCaption')} tabIndex={0}>
          <table className="w-full border-collapse">
            <caption className="pb-2 text-start font-semibold">{t('client.library.tableCaption')}</caption>
            <thead>
              <tr>
                {(
                  ['colTitle', 'colSource', 'colStatus', 'colVersion', 'colEdited', 'colRating', 'colActions'] as const
                ).map((k) => (
                  <th key={k} scope="col" className="border-b border-[var(--color-border)] px-3 py-2 text-start">
                    {t(`client.library.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} data-testid="module-item" data-module-id={m.id}>
                  <th scope="row" className="border-b border-[var(--color-border)] px-3 py-2 text-start align-top">
                    {m.title}
                  </th>
                  {[
                    sourceBadge(m),
                    t(STATUS_KEY[m.status]),
                    t('client.library.version', { version: m.version }),
                    m.updatedAt ? formatLondonDate(m.updatedAt) : '',
                    ratingLine(m),
                    actions(m),
                  ].map((cell, i) => (
                    <td key={i} className="border-b border-[var(--color-border)] px-3 py-2 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={toDelete !== null}
        title={t('client.library.deleteTitle')}
        onClose={() => {
          setToDelete(null);
        }}
      >
        <p className="mt-0">{t('client.library.deleteBody', { title: toDelete?.title ?? '' })}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={confirmDelete}>{t('common.confirm')}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setToDelete(null);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function ModuleLibrary() {
  return (
    <PermissionGate permission="modules.view" message="errors.forbidden" anyScope>
      <LibraryBody />
    </PermissionGate>
  );
}

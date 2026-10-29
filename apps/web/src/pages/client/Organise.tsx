import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageKey } from '@sta/content';
import { Button, Card, Icon, PageHeader, Switch } from '@sta/ui';
import { can, reorder, type Category, type Module, type ModulePlacement } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { catToken, countKey, useCategories, useGroups, usePlacements } from '../organise/queries';
import { usePermissions } from './queries';
import { field, organiseErrorKey, type Dlg } from './organiseShared';
import { CategoryDialog, DeleteCategoryDialog, DeleteGroupDialog, GroupDialog, MergeDialog } from './organiseDialogs';

const h2 = 'mb-2 mt-6 text-lg font-bold';

/** C10: categories, modules and groups. Anyone with modules.view can read; modules.manage unlocks the controls. */
export function Organise() {
  const t = useT();
  const actor = useActor();
  const perms = usePermissions();
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  const target = actor.clientId ? { clientId: actor.clientId } : undefined;
  const canView = target !== undefined && can(perms.data, 'modules.view', target, 'read');
  const canManage = target !== undefined && can(perms.data, 'modules.manage', target, 'write');
  return (
    <>
      <PageHeader title={t('organise.title')} />
      {canView ? <OrganiseLists canManage={canManage} /> : <p role="alert">{t('organise.noAccess')}</p>}
    </>
  );
}

function OrganiseLists({ canManage }: { canManage: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const cats = useCategories();
  const groups = useGroups();
  const placements = usePlacements();
  const modulesQ = useQuery({
    queryKey: ['organiseModules', actor.userId],
    queryFn: async (): Promise<Module[]> =>
      (await store.modules.list(actor)).filter((m) => m.status === 'published' && m.translatedFrom === undefined),
  });
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkGroup, setBulkGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<MessageKey | null>(null);

  if (cats.isError || groups.isError || placements.isError || modulesQ.isError)
    return <p role="alert">{t('organise.loadError')}</p>;
  if (!cats.data || !groups.data || !placements.data || !modulesQ.data) return <p>{t('shell.loading')}</p>;
  const categories = cats.data;
  const modules = modulesQ.data;
  const placementOf = (id: string): ModulePlacement | undefined => placements.data.find((p) => p.moduleId === id);
  const countIn = (c: Category) => modules.filter((m) => placementOf(m.id)?.categoryId === c.id).length;
  const countText = (n: number) => t(`organise.count.${countKey(n)}`, { n });

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      void queryClient.invalidateQueries();
    } catch (e) {
      setProblem(organiseErrorKey(e));
    } finally {
      setBusy(false);
    }
  };
  const move = (c: Category, direction: 'up' | 'down') =>
    run(() =>
      store.categories.reorder(
        actor,
        reorder(categories, c.id, direction).map((x) => x.id),
      ),
    );
  const setCategory = (moduleIds: string[], categoryId: string) =>
    run(() => store.modulePlacements.setCategory(actor, categoryId ? { moduleIds, categoryId } : { moduleIds }));
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const addToGroup = () =>
    run(async () => {
      const group = groups.data.find((g) => g.id === bulkGroup);
      if (!group) return;
      const merged = [...group.moduleIds, ...[...picked].filter((id) => !group.moduleIds.includes(id))];
      await store.moduleGroups.save(actor, {
        id: group.id,
        ...(group.siteId !== undefined ? { siteId: group.siteId } : {}),
        name: group.name,
        description: group.description,
        moduleIds: merged,
        inOrder: group.inOrder,
      });
      setPicked(new Set());
      setBulkGroup('');
    });
  const close = () => {
    setDlg(null);
  };
  const btn = 'px-3';

  return (
    <>
      <p className="mt-0">{t('organise.intro')}</p>
      {problem ? <p role="alert">{t(problem)}</p> : null}

      <section aria-labelledby="org-categories">
        <h2 id="org-categories" className={h2}>
          {t('organise.categories')}
        </h2>
        {canManage ? (
          <Button
            variant="secondary"
            onClick={() => {
              setDlg({ kind: 'newCategory' });
            }}
          >
            {t('organise.newCategory')}
          </Button>
        ) : null}
        {categories.length === 0 ? <p>{t('organise.noCategories')}</p> : null}
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {categories.map((c, i) => (
            <li key={c.id} data-testid="category-row">
              <Card className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <span
                    aria-hidden="true"
                    style={{ background: `var(--${catToken(c.colour)})` }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white"
                  >
                    <Icon name={c.icon} size={16} />
                  </span>
                  {c.name}
                </span>
                <span>{countText(countIn(c))}</span>{' '}
                {canManage ? (
                  <span className="flex flex-wrap gap-1">
                    <Button
                      variant="secondary"
                      className={btn}
                      disabled={busy || i === 0}
                      aria-label={t('organise.moveUpLabel', { name: c.name })}
                      onClick={() => {
                        void move(c, 'up');
                      }}
                    >
                      {t('organise.moveUp')}
                    </Button>
                    <Button
                      variant="secondary"
                      className={btn}
                      disabled={busy || i === categories.length - 1}
                      aria-label={t('organise.moveDownLabel', { name: c.name })}
                      onClick={() => {
                        void move(c, 'down');
                      }}
                    >
                      {t('organise.moveDown')}
                    </Button>
                    <Button
                      variant="secondary"
                      className={btn}
                      aria-label={t('organise.editLabel', { name: c.name })}
                      onClick={() => {
                        setDlg({ kind: 'editCategory', category: c });
                      }}
                    >
                      {t('organise.edit')}
                    </Button>
                    <Button
                      variant="secondary"
                      className={btn}
                      disabled={categories.length < 2}
                      aria-label={t('organise.mergeLabel', { name: c.name })}
                      onClick={() => {
                        setDlg({ kind: 'mergeCategory', category: c });
                      }}
                    >
                      {t('organise.merge')}
                    </Button>
                    <Button
                      variant="secondary"
                      className={btn}
                      aria-label={t('organise.deleteLabel', { name: c.name })}
                      onClick={() => {
                        setDlg({ kind: 'deleteCategory', category: c });
                      }}
                    >
                      {t('organise.delete')}
                    </Button>
                  </span>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="org-modules">
        <h2 id="org-modules" className={h2}>
          {t('organise.modules')}
        </h2>
        {modules.length === 0 ? <p>{t('organise.noModules')}</p> : null}
        {canManage && modules.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 font-semibold">
              {t('organise.moveSelectedTo')}
              <select
                className={field}
                value={bulkCategory}
                onChange={(e) => {
                  setBulkCategory(e.target.value);
                }}
              >
                <option value="">{t('organise.choose')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              disabled={busy || picked.size === 0 || bulkCategory === ''}
              onClick={() => {
                void setCategory([...picked], bulkCategory).then(() => {
                  setPicked(new Set());
                  setBulkCategory('');
                });
              }}
            >
              {t('organise.moveSelected')}
            </Button>
            <label className="flex flex-col gap-1 font-semibold">
              {t('organise.addSelectedToGroup')}
              <select
                className={field}
                value={bulkGroup}
                onChange={(e) => {
                  setBulkGroup(e.target.value);
                }}
              >
                <option value="">{t('organise.choose')}</option>
                {groups.data.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              disabled={busy || picked.size === 0 || bulkGroup === ''}
              onClick={() => {
                void addToGroup();
              }}
            >
              {t('organise.addToGroup')}
            </Button>
          </div>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {modules.map((m) => {
            const placement = placementOf(m.id);
            const category = categories.find((c) => c.id === placement?.categoryId);
            return (
              <li key={m.id} data-testid="module-row">
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-semibold">
                    {canManage ? (
                      <input
                        type="checkbox"
                        aria-label={t('organise.select', { title: m.title })}
                        checked={picked.has(m.id)}
                        onChange={() => {
                          toggle(m.id);
                        }}
                        className="h-6 w-6 accent-[var(--color-accent)]"
                      />
                    ) : null}
                    {m.title}
                  </span>
                  {canManage ? (
                    <>
                      <select
                        aria-label={t('organise.categoryFor', { title: m.title })}
                        className={field}
                        disabled={busy}
                        value={category?.id ?? ''}
                        onChange={(e) => {
                          void setCategory([m.id], e.target.value);
                        }}
                      >
                        <option value="">{t('organise.noCategory')}</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <Switch
                        label={t('organise.availableAll', { title: m.title })}
                        checked={placement?.availableToAll ?? true}
                        onLabel={t('organise.availableOn')}
                        offLabel={t('organise.availableOff')}
                        disabled={busy}
                        onChange={(on) => {
                          void run(() =>
                            store.modulePlacements.setAvailable(actor, { moduleIds: [m.id], availableToAll: on }),
                          );
                        }}
                      />
                    </>
                  ) : (
                    <span>{category?.name ?? t('organise.noCategory')}</span>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="org-groups">
        <h2 id="org-groups" className={h2}>
          {t('organise.groups')}
        </h2>
        {canManage ? (
          <Button
            variant="secondary"
            onClick={() => {
              setDlg({ kind: 'newGroup' });
            }}
          >
            {t('organise.newGroup')}
          </Button>
        ) : null}
        {groups.data.length === 0 ? <p>{t('organise.noGroups')}</p> : null}
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {groups.data.map((g) => (
            <li key={g.id} data-testid="group-row">
              <Card className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{g.name}</span>
                <span>{countText(g.moduleIds.length)}</span>
                <span>{g.inOrder ? t('organise.inOrder') : t('organise.anyOrder')}</span>
                {canManage ? (
                  <span className="flex flex-wrap gap-1">
                    <Button
                      variant="secondary"
                      className={btn}
                      aria-label={t('organise.editLabel', { name: g.name })}
                      onClick={() => {
                        setDlg({ kind: 'editGroup', group: g });
                      }}
                    >
                      {t('organise.edit')}
                    </Button>
                    <Button
                      variant="secondary"
                      className={btn}
                      aria-label={t('organise.deleteLabel', { name: g.name })}
                      onClick={() => {
                        setDlg({ kind: 'deleteGroup', group: g });
                      }}
                    >
                      {t('organise.delete')}
                    </Button>
                  </span>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {canManage ? (
        <>
          <CategoryDialog dlg={dlg} categories={categories} onClose={close} />
          <MergeDialog dlg={dlg} categories={categories} onClose={close} />
          <DeleteCategoryDialog dlg={dlg} categories={categories} onClose={close} />
          <GroupDialog dlg={dlg} modules={modules} onClose={close} />
          <DeleteGroupDialog dlg={dlg} onClose={close} />
        </>
      ) : null}
    </>
  );
}

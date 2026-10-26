import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, Icon } from '@sta/ui';
import {
  CATEGORY_COLOURS,
  CATEGORY_ICONS,
  reorder,
  type Category,
  type CategoryColour,
  type CategoryIcon,
  type Module,
  type ModuleGroup,
} from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { catToken } from '../organise/queries';
import { field, organiseErrorKey, type Dlg } from './organiseShared';

const NAME_MAX = 40;

/** Runs one save: shows a plain message in the dialog if it fails, closes it if it works. */
function useSubmit(onClose: () => void) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      void queryClient.invalidateQueries();
      onClose();
    } catch (e) {
      setError(organiseErrorKey(e));
    } finally {
      setBusy(false);
    }
  };
  return { error, setError, busy, submit };
}

function Actions({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const t = useT();
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {children}
      <Button variant="quiet" onClick={onClose}>
        {t('organise.cancel')}
      </Button>
    </div>
  );
}

function Picker<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  swatch,
}: {
  legend: string;
  name: string;
  options: { id: T; label: string; icon?: CategoryIcon; colour?: string }[];
  value: T;
  onChange: (v: T) => void;
  swatch?: boolean;
}) {
  return (
    <fieldset role="radiogroup" className="m-0 border-0 p-0">
      <legend className="mb-1 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id}
            className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-3 has-[:checked]:border-[var(--color-accent)] has-[:checked]:bg-[var(--color-surface)] has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]"
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={value === o.id}
              onChange={() => {
                onChange(o.id);
              }}
              className="h-5 w-5 accent-[var(--color-accent)]"
            />
            {swatch && o.colour ? (
              <span
                aria-hidden="true"
                style={{ background: `var(--${o.colour})` }}
                className="inline-block h-4 w-4 rounded-full"
              />
            ) : null}
            {o.icon ? <Icon name={o.icon} size={18} /> : null}
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** New category and Edit category. */
export function CategoryDialog({
  dlg,
  categories,
  onClose,
}: {
  dlg: Dlg | null;
  categories: Category[];
  onClose: () => void;
}) {
  const t = useT();
  const open = dlg?.kind === 'newCategory' || dlg?.kind === 'editCategory';
  const title = dlg?.kind === 'editCategory' ? t('organise.editCategory') : t('organise.newCategory');
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      {open ? (
        <CategoryForm
          key={dlg.kind === 'editCategory' ? dlg.category.id : 'new'}
          existing={dlg.kind === 'editCategory' ? dlg.category : undefined}
          categories={categories}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function CategoryForm({
  existing,
  categories,
  onClose,
}: {
  existing: Category | undefined;
  categories: Category[];
  onClose: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [name, setName] = useState(existing?.name ?? '');
  const [colour, setColour] = useState<CategoryColour>(existing?.colour ?? 'blue');
  const [icon, setIcon] = useState<CategoryIcon>(existing?.icon ?? 'book');
  const { error, setError, busy, submit } = useSubmit(onClose);
  const save = () => {
    const trimmed = name.trim();
    const clash = categories.some(
      (c) => c.id !== existing?.id && c.name.trim().toLocaleLowerCase('en-GB') === trimmed.toLocaleLowerCase('en-GB'),
    );
    const problem: MessageKey | null =
      trimmed === ''
        ? 'organise.errorEmptyName'
        : trimmed.length > NAME_MAX
          ? 'organise.errorTooLong'
          : clash
            ? 'errors.rule.nameTaken'
            : null;
    if (problem) {
      setError(problem);
      return;
    }
    void submit(async () => {
      await store.categories.save(actor, { ...(existing ? { id: existing.id } : {}), name: trimmed, colour, icon });
    });
  };
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1 font-semibold">
        {t('organise.name')}
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className={field}
        />
      </label>
      <Picker
        legend={t('organise.colour')}
        name="category-colour"
        swatch
        value={colour}
        onChange={setColour}
        options={CATEGORY_COLOURS.map((c) => ({ id: c, label: t(`organise.colours.${c}`), colour: catToken(c) }))}
      />
      <Picker
        legend={t('organise.icon')}
        name="category-icon"
        value={icon}
        onChange={setIcon}
        options={CATEGORY_ICONS.map((i) => ({ id: i, label: t(`organise.icons.${i}`), icon: i }))}
      />
      {error ? <p role="alert">{t(error)}</p> : null}
      <Actions onClose={onClose}>
        <Button type="submit" disabled={busy}>
          {t('organise.saveCategory')}
        </Button>
      </Actions>
    </form>
  );
}

export function MergeDialog({
  dlg,
  categories,
  onClose,
}: {
  dlg: Dlg | null;
  categories: Category[];
  onClose: () => void;
}) {
  const t = useT();
  const open = dlg?.kind === 'mergeCategory';
  return (
    <Dialog open={open} title={t('organise.mergeCategory')} onClose={onClose}>
      {open ? <MergeForm category={dlg.category} categories={categories} onClose={onClose} /> : null}
    </Dialog>
  );
}

function MergeForm({
  category,
  categories,
  onClose,
}: {
  category: Category;
  categories: Category[];
  onClose: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const others = categories.filter((c) => c.id !== category.id);
  const [into, setInto] = useState(others[0]?.id ?? '');
  const { error, busy, submit } = useSubmit(onClose);
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0">{t('organise.mergeHelp', { name: category.name })}</p>
      <label className="flex flex-col gap-1 font-semibold">
        {t('organise.mergeInto')}
        <select
          className={field}
          value={into}
          onChange={(e) => {
            setInto(e.target.value);
          }}
        >
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error ? <p role="alert">{t(error)}</p> : null}
      <Actions onClose={onClose}>
        <Button
          disabled={busy || into === ''}
          onClick={() => {
            void submit(() => store.categories.merge(actor, category.id, into));
          }}
        >
          {t('organise.mergeCategories')}
        </Button>
      </Actions>
    </div>
  );
}

export function DeleteCategoryDialog({
  dlg,
  categories,
  onClose,
}: {
  dlg: Dlg | null;
  categories: Category[];
  onClose: () => void;
}) {
  const t = useT();
  const open = dlg?.kind === 'deleteCategory';
  return (
    <Dialog open={open} title={t('organise.deleteCategory')} onClose={onClose}>
      {open ? <DeleteCategoryForm category={dlg.category} categories={categories} onClose={onClose} /> : null}
    </Dialog>
  );
}

function DeleteCategoryForm({
  category,
  categories,
  onClose,
}: {
  category: Category;
  categories: Category[];
  onClose: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [moveTo, setMoveTo] = useState('');
  const { error, busy, submit } = useSubmit(onClose);
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0">{t('organise.deleteHelp', { name: category.name })}</p>
      <label className="flex flex-col gap-1 font-semibold">
        {t('organise.moveModulesTo')}
        <select
          className={field}
          value={moveTo}
          onChange={(e) => {
            setMoveTo(e.target.value);
          }}
        >
          <option value="">{t('organise.noCategory')}</option>
          {categories
            .filter((c) => c.id !== category.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      {error ? <p role="alert">{t(error)}</p> : null}
      <Actions onClose={onClose}>
        <Button
          disabled={busy}
          onClick={() => {
            void submit(() => store.categories.remove(actor, category.id, moveTo ? { moveTo } : undefined));
          }}
        >
          {t('organise.deleteCategory')}
        </Button>
      </Actions>
    </div>
  );
}

/** New group and Edit group. */
export function GroupDialog({ dlg, modules, onClose }: { dlg: Dlg | null; modules: Module[]; onClose: () => void }) {
  const t = useT();
  const open = dlg?.kind === 'newGroup' || dlg?.kind === 'editGroup';
  return (
    <Dialog
      open={open}
      title={dlg?.kind === 'editGroup' ? t('organise.editGroup') : t('organise.newGroup')}
      onClose={onClose}
    >
      {open ? (
        <GroupForm
          key={dlg.kind === 'editGroup' ? dlg.group.id : 'new'}
          group={dlg.kind === 'editGroup' ? dlg.group : undefined}
          modules={modules}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function GroupForm({
  group,
  modules,
  onClose,
}: {
  group: ModuleGroup | undefined;
  modules: Module[];
  onClose: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const known = new Set(modules.map((m) => m.id));
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [ids, setIds] = useState<string[]>((group?.moduleIds ?? []).filter((id) => known.has(id)));
  const [inOrder, setInOrder] = useState(group?.inOrder ?? false);
  const { error, setError, busy, submit } = useSubmit(onClose);
  const titleOf = (id: string) => modules.find((m) => m.id === id)?.title ?? '';
  const toggle = (id: string) => {
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  const save = () => {
    const problem: MessageKey | null =
      name.trim() === '' ? 'organise.errorEmptyName' : ids.length === 0 ? 'organise.noGroupModules' : null;
    if (problem) {
      setError(problem);
      return;
    }
    void submit(async () => {
      await store.moduleGroups.save(actor, {
        ...(group ? { id: group.id } : {}),
        ...(group?.siteId !== undefined ? { siteId: group.siteId } : {}),
        name: name.trim(),
        description: description.trim(),
        moduleIds: ids,
        inOrder,
      });
    });
  };
  const box = 'h-6 w-6 accent-[var(--color-accent)]';
  const step = 'px-3';
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1 font-semibold">
        {t('organise.groupName')}
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {t('organise.groupDescription')}
        <input
          type="text"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          className={field}
        />
      </label>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1 font-semibold">{t('organise.groupModules')}</legend>
        <div className="flex flex-col gap-1">
          {modules.map((m) => (
            <label key={m.id} className="flex min-h-[var(--target-min)] items-center gap-3">
              <input
                type="checkbox"
                className={box}
                checked={ids.includes(m.id)}
                onChange={() => {
                  toggle(m.id);
                }}
              />
              {m.title}
            </label>
          ))}
        </div>
      </fieldset>
      <Picker
        legend={t('organise.groupOrder')}
        name="group-order"
        value={inOrder ? 'in' : 'any'}
        onChange={(v) => {
          setInOrder(v === 'in');
        }}
        options={[
          { id: 'any', label: t('organise.anyOrder') },
          { id: 'in', label: t('organise.inOrder') },
        ]}
      />
      {ids.length > 0 ? (
        <ol aria-label={t('organise.modulesInGroup')} className="m-0 flex list-decimal flex-col gap-1 ps-6">
          {ids.map((id, i) => {
            const items = ids.map((x) => ({ id: x }));
            return (
              <li key={id}>
                <span className="inline-flex flex-wrap items-center gap-2">
                  {titleOf(id)}
                  <Button
                    variant="secondary"
                    className={step}
                    disabled={i === 0}
                    aria-label={t('organise.moveUpLabel', { name: titleOf(id) })}
                    onClick={() => {
                      setIds(reorder(items, id, 'up').map((x) => x.id));
                    }}
                  >
                    {t('organise.moveUp')}
                  </Button>
                  <Button
                    variant="secondary"
                    className={step}
                    disabled={i === ids.length - 1}
                    aria-label={t('organise.moveDownLabel', { name: titleOf(id) })}
                    onClick={() => {
                      setIds(reorder(items, id, 'down').map((x) => x.id));
                    }}
                  >
                    {t('organise.moveDown')}
                  </Button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {error ? <p role="alert">{t(error)}</p> : null}
      <Actions onClose={onClose}>
        <Button type="submit" disabled={busy}>
          {t('organise.saveGroup')}
        </Button>
      </Actions>
    </form>
  );
}

export function DeleteGroupDialog({ dlg, onClose }: { dlg: Dlg | null; onClose: () => void }) {
  const t = useT();
  const open = dlg?.kind === 'deleteGroup';
  return (
    <Dialog open={open} title={t('organise.deleteGroup')} onClose={onClose}>
      {open ? <DeleteGroupForm group={dlg.group} onClose={onClose} /> : null}
    </Dialog>
  );
}

function DeleteGroupForm({ group, onClose }: { group: { id: string; name: string }; onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { error, busy, submit } = useSubmit(onClose);
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0">{t('organise.deleteGroupHelp', { name: group.name })}</p>
      {error ? <p role="alert">{t(error)}</p> : null}
      <Actions onClose={onClose}>
        <Button
          disabled={busy}
          onClick={() => {
            void submit(() => store.moduleGroups.remove(actor, group.id));
          }}
        >
          {t('organise.deleteGroup')}
        </Button>
      </Actions>
    </div>
  );
}

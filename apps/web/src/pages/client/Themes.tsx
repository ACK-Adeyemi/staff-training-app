// C17 Themes (brief 19.4; plan assumptions 51 and 52): ready-made themes, the saved list, and a builder with contrast
// checks, a schedule, where to show it and a staff phone preview. The rules live in @sta/domain; saving goes through
// store.themes, which checks contrast and the package limit again.
import { useRef, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NotEntitledError, RuleError } from '@sta/data';
import { themePresets } from '@sta/content';
import type { MessageKey } from '@sta/content';
import {
  can,
  createRng,
  holdsAnywhere,
  londonDateString,
  themeBases,
  ulid,
  validateTheme,
  type Theme,
  type ThemePair,
  type ThemeTokens,
} from '@sta/domain';
import { Button, Card, ColourField, ContrastCheck, PageHeader, PhoneFrame } from '@sta/ui';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { formatLondonDayMonthYear } from '../../demo/format';
import { londonDayStart } from '../compete/shared';
import { foundationsErrorKey, inputClass } from './foundationsErrors';
import { usePermissions } from './queries';

const RADIUS_PX = { sm: '4px', md: '8px', lg: '16px' } as const;
const RADII = [
  { id: 'sm', label: 'themes.small' },
  { id: 'md', label: 'themes.medium' },
  { id: 'lg', label: 'themes.large' },
] as const;
const PAIRS: { pair: ThemePair; minimum: number }[] = [
  { pair: 'textOnTint', minimum: 4.5 },
  { pair: 'buttonTextOnPrimary', minimum: 4.5 },
  { pair: 'primaryOnBackground', minimum: 3 },
  { pair: 'accentOnBackground', minimum: 3 },
];
const HEX = /^#[0-9a-f]{6}$/i;

type Form = {
  editing: Theme | null;
  name: string;
  tokens: ThemeTokens;
  staff: boolean;
  admin: boolean;
  from: string;
  until: string;
};
type Problem =
  | { kind: 'text'; key: MessageKey }
  | { kind: 'contrast'; failures: { pair: ThemePair; ratio: number; required: number }[] };

const blank = (): Form => {
  const base = themePresets[0]?.tokens ?? {
    primary: '#1f5fa8',
    accent: '#0b7a5c',
    backgroundTint: '#f3f7fb',
    radius: 'md' as const,
  };
  return { editing: null, name: '', tokens: { ...base }, staff: true, admin: true, from: '', until: '' };
};
const shiftDay = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
/** The last day shown: the schedule ends at the start of the next London day. */
const lastDay = (endAt: string): string => londonDateString(new Date(Date.parse(endAt) - 1));

export function Themes() {
  const t = useT();
  const actor = useActor();
  const perms = usePermissions();
  const header = <PageHeader title={t('themes.title')} />;
  if (!perms.data) {
    return (
      <>
        {header}
        <p>{t('shell.loading')}</p>
      </>
    );
  }
  if (actor.clientId === undefined || !holdsAnywhere(perms.data, 'themes.view')) {
    return (
      <>
        {header}
        <p role="alert">{t('themes.noAccess')}</p>
      </>
    );
  }
  const manage = can(perms.data, 'themes.manage', { clientId: actor.clientId }, 'write');
  return (
    <>
      {header}
      <ThemesContent manage={manage} />
    </>
  );
}

function ThemesContent({ manage }: { manage: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const qc = useQueryClient();
  const themes = useQuery({ queryKey: ['themes', actor.userId], queryFn: () => store.themes.list(actor) });
  const client = useQuery({
    queryKey: ['themesClient', actor.userId],
    queryFn: () => store.clients.get(actor, actor.clientId as string),
  });
  const limit = useQuery({
    queryKey: ['themesLimit', actor.userId],
    queryFn: async () => {
      try {
        return (await store.competitions.entitlements(actor)).savedThemes;
      } catch {
        return null;
      }
    },
  });
  const [form, setForm] = useState<Form>(blank);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const created = useRef(0);
  if (!themes.data || !client.data || limit.data === undefined) return <p>{t('shell.loading')}</p>;

  const stored = themes.data;
  const baseId = client.data.settings.themeId;
  const presetName = (id: string) => t(`themes.presets.${id}` as MessageKey);
  const patch = (p: Partial<Form>) => {
    setForm((f) => ({ ...f, ...p }));
    setNotice(null);
  };
  const patchTokens = (p: Partial<ThemeTokens>) => {
    patch({ tokens: { ...form.tokens, ...p } });
  };
  const newId = () => {
    created.current += 1;
    const rng = createRng(clock.now().getTime()).fork(`theme:${String(stored.length)}:${String(created.current)}`);
    return ulid(clock, rng.fork('theme'));
  };
  const errorKey = (e: unknown): MessageKey =>
    e instanceof NotEntitledError && e.feature === 'savedThemes'
      ? 'themes.limit'
      : e instanceof RuleError && e.rule === 'invalidTheme'
        ? 'errors.rule.invalidTheme'
        : foundationsErrorKey(e);
  const run = async (work: () => Promise<void>, done: MessageKey) => {
    setProblem(null);
    setNotice(null);
    setBusy(true);
    try {
      await work();
      await qc.invalidateQueries();
      setNotice(done);
    } catch (e) {
      setProblem({ kind: 'text', key: errorKey(e) });
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (id: string) =>
    run(async () => {
      const preset = themePresets.find((p) => p.id === id);
      if (!preset) return;
      const copy = stored.find((s) => s.preset === id);
      if (copy) {
        await store.themes.setBase(actor, copy.id);
        return;
      }
      const saved = await store.themes.save(actor, {
        id: newId(),
        name: presetName(id),
        preset: id,
        tokens: { ...preset.tokens },
        appliesTo: { staff: true, admin: true },
      });
      await store.themes.setBase(actor, saved.id);
    }, 'themes.baseSet');

  const edit = (theme: Theme) => {
    setProblem(null);
    setNotice(null);
    setForm({
      editing: theme,
      name: theme.name,
      tokens: { ...theme.tokens },
      staff: theme.appliesTo.staff,
      admin: theme.appliesTo.admin,
      from: theme.schedule ? londonDateString(new Date(theme.schedule.startAt)) : '',
      until: theme.schedule ? lastDay(theme.schedule.endAt) : '',
    });
  };

  const save = () => {
    const name = form.name.trim();
    const startAt = form.from === '' ? null : londonDayStart(form.from);
    const endAt = form.until === '' ? null : londonDayStart(shiftDay(form.until, 1));
    const wrong: MessageKey | null =
      name === ''
        ? 'themes.nameRequired'
        : !form.staff && !form.admin
          ? 'themes.whereRequired'
          : (form.from === '') !== (form.until === '') || (form.from !== '' && (!startAt || !endAt))
            ? 'themes.scheduleBoth'
            : form.from !== '' && form.until < form.from
              ? 'themes.scheduleOrder'
              : null;
    if (wrong) {
      setNotice(null);
      setProblem({ kind: 'text', key: wrong });
      return;
    }
    const check = validateTheme(form.tokens, themeBases.light);
    if (!check.ok) {
      setNotice(null);
      setProblem({ kind: 'contrast', failures: check.failures });
      return;
    }
    const editing = form.editing;
    const tokensChanged = editing ? JSON.stringify(editing.tokens) !== JSON.stringify(form.tokens) : true;
    const theme: Omit<Theme, 'clientId'> = {
      id: editing?.id ?? newId(),
      name,
      tokens: { ...form.tokens },
      appliesTo: { staff: form.staff, admin: form.admin },
      ...(editing?.preset !== undefined && !tokensChanged ? { preset: editing.preset } : {}),
      ...(startAt && endAt ? { schedule: { startAt, endAt } } : {}),
    };
    void run(async () => {
      await store.themes.save(actor, theme);
      setForm(blank());
    }, 'themes.saved');
  };

  const t4 = form.tokens;
  const previewStyle = {
    '--theme-primary': t4.primary,
    '--theme-accent': t4.accent,
    '--theme-tint': t4.backgroundTint,
    '--theme-radius': RADIUS_PX[t4.radius],
    background: themeBases.light.background,
    color: themeBases.light.text,
  } as CSSProperties;
  const count = limit.data === null || limit.data === 'unlimited' ? null : limit.data;

  return (
    <div className="flex max-w-[60rem] flex-col gap-6">
      <p className="m-0">{t('themes.intro')}</p>
      <p data-testid="saved-count" className="m-0 font-semibold">
        {count === null
          ? t('themes.savedCountUnlimited', { n: String(stored.length) })
          : t('themes.savedCount', { n: String(stored.length), limit: String(count) })}
      </p>
      <p className="m-0">{t('themes.accessibilityNote')}</p>
      {!manage ? (
        <p role="note" className="m-0">
          {t('themes.readOnlyNote')}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="m-0 font-semibold">
          {t(notice)}
        </p>
      ) : null}
      {problem?.kind === 'text' ? (
        <p role="alert" className="m-0 font-semibold">
          {t(problem.key)}
        </p>
      ) : null}

      <section aria-labelledby="themes-ready" className="flex flex-col gap-2">
        <h2 id="themes-ready" className="m-0 text-xl font-bold">
          {t('themes.readyMade')}
        </h2>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {themePresets.map((p) => {
            const name = presetName(p.id);
            const copy = stored.some((s) => s.preset === p.id);
            const unusable = !validateTheme(p.tokens, themeBases.light).ok;
            return (
              <li key={p.id}>
                <Card className="flex h-full flex-col gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <span aria-hidden="true" className="inline-flex">
                      {[p.tokens.primary, p.tokens.accent, p.tokens.backgroundTint].map((c) => (
                        <span
                          key={c}
                          style={{ background: c }}
                          className="block h-6 w-6 border border-[var(--color-border)]"
                        />
                      ))}
                    </span>
                    {name}
                  </span>
                  {copy ? (
                    <span>{t('themes.inYours')}</span>
                  ) : unusable ? (
                    <span>{t('themes.darkOnly')}</span>
                  ) : manage ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={t('themes.use', { name })}
                      onClick={() => {
                        void applyPreset(p.id);
                      }}
                    >
                      {t('themes.use', { name })}
                    </Button>
                  ) : null}
                  {!copy && unusable && manage ? (
                    <Button variant="secondary" disabled aria-label={t('themes.use', { name })}>
                      {t('themes.use', { name })}
                    </Button>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="themes-yours" className="flex flex-col gap-2">
        <h2 id="themes-yours" className="m-0 text-xl font-bold">
          {t('themes.yours')}
        </h2>
        {stored.length === 0 ? <p className="m-0">{t('themes.yoursEmpty')}</p> : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {stored.map((th) => (
            <li key={th.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-semibold">{th.name}</span>
                  {th.id === baseId ? <span>{t('themes.baseNote')}</span> : null}
                  {th.schedule ? (
                    <span>
                      {t('themes.schedule', {
                        from: formatLondonDayMonthYear(th.schedule.startAt),
                        to: formatLondonDayMonthYear(new Date(Date.parse(th.schedule.endAt) - 1).toISOString()),
                      })}
                    </span>
                  ) : null}
                </div>
                {manage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={t('themes.use', { name: th.name })}
                      onClick={() => {
                        void run(async () => {
                          await store.themes.setBase(actor, th.id);
                        }, 'themes.baseSet');
                      }}
                    >
                      {t('themes.useShort')}
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={t('themes.edit', { name: th.name })}
                      onClick={() => {
                        edit(th);
                      }}
                    >
                      {t('themes.editShort')}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={t('themes.delete', { name: th.name })}
                      onClick={() => {
                        void run(async () => {
                          await store.themes.remove(actor, th.id);
                          if (form.editing?.id === th.id) setForm(blank());
                        }, 'themes.deleted');
                      }}
                    >
                      {t('themes.deleteShort')}
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {manage ? (
        <section aria-labelledby="themes-builder" className="flex flex-col gap-4">
          <h2 id="themes-builder" className="m-0 text-xl font-bold">
            {t('themes.builder')}
          </h2>
          <p className="m-0 font-semibold">
            {form.editing ? t('themes.builderEditing', { name: form.editing.name }) : t('themes.builderNew')}
          </p>
          {form.editing ? (
            <div>
              <Button
                variant="quiet"
                onClick={() => {
                  setForm(blank());
                  setProblem(null);
                }}
              >
                {t('themes.startNew')}
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-[16rem] flex-1 flex-col gap-4">
              <label className="flex flex-col gap-1 font-semibold">
                {t('themes.name')}
                <input
                  type="text"
                  value={form.name}
                  maxLength={60}
                  className={inputClass}
                  onChange={(e) => {
                    patch({ name: e.target.value });
                  }}
                />
              </label>
              {(
                [
                  ['primary', 'primary'],
                  ['accent', 'accent'],
                  ['tint', 'backgroundTint'],
                ] as const
              ).map(([key, token]) => (
                <ColourField
                  key={key}
                  label={t(`themes.${key}`)}
                  value={t4[token]}
                  hexLabel={t(`themes.hex.${key}`)}
                  pickerLabel={t(`themes.picker.${key}`)}
                  invalidText={t('themes.invalidHex')}
                  onChange={(hex) => {
                    if (HEX.test(hex)) patchTokens({ [token]: hex });
                  }}
                />
              ))}
              <fieldset
                role="radiogroup"
                aria-label={t('themes.cornerStyle')}
                className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
              >
                {RADII.map((r) => (
                  <label
                    key={r.id}
                    className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-3 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]"
                  >
                    <input
                      type="radio"
                      name="theme-radius"
                      checked={t4.radius === r.id}
                      className="h-5 w-5 accent-[var(--color-accent)]"
                      onChange={() => {
                        patchTokens({ radius: r.id });
                      }}
                    />
                    <span>{t(r.label)}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
                <legend className="mb-1 font-semibold">{t('themes.showOn')}</legend>
                {(
                  [
                    ['staff', 'themes.staffApp'],
                    ['admin', 'themes.adminApp'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      className="h-5 w-5 accent-[var(--color-accent)]"
                      onChange={(e) => {
                        patch({ [key]: e.target.checked });
                      }}
                    />
                    <span>{t(label)}</span>
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1 font-semibold">
                  {t('themes.showFrom')}
                  <input
                    type="date"
                    value={form.from}
                    className={inputClass}
                    onChange={(e) => {
                      patch({ from: e.target.value });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 font-semibold">
                  {t('themes.showUntil')}
                  <input
                    type="date"
                    value={form.until}
                    className={inputClass}
                    onChange={(e) => {
                      patch({ until: e.target.value });
                    }}
                  />
                </label>
              </div>
              <p className="m-0 text-sm">{t('themes.scheduleHelp')}</p>
            </div>
            <div className="flex min-w-[16rem] flex-1 flex-col gap-4">
              <h3 className="m-0 text-lg font-bold">{t('themes.contrastTitle')}</h3>
              <div className="flex flex-col gap-3">
                {PAIRS.map(({ pair, minimum }) => {
                  const [fg, bg] =
                    pair === 'textOnTint'
                      ? [themeBases.light.text, t4.backgroundTint]
                      : pair === 'buttonTextOnPrimary'
                        ? [themeBases.light.buttonText, t4.primary]
                        : [pair === 'primaryOnBackground' ? t4.primary : t4.accent, themeBases.light.background];
                  return (
                    <div key={pair} data-testid="contrast-row">
                      <ContrastCheck
                        foreground={fg}
                        background={bg}
                        label={t(`themes.pairs.${pair}`)}
                        ratioLabel={(ratio) => t('themes.contrastRatio', { ratio })}
                        passText={t('themes.pass')}
                        failText={t('themes.fail')}
                        minimum={minimum}
                      />
                    </div>
                  );
                })}
              </div>
              <PhoneFrame title={t('themes.preview')}>
                <div
                  data-testid="theme-preview"
                  aria-hidden="true"
                  style={{
                    ...previewStyle,
                    backgroundColor: 'var(--theme-tint)',
                    borderRadius: 'var(--theme-radius)',
                    padding: '1rem',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1.25rem' }}>{t('themes.previewHeading')}</p>
                  <p style={{ margin: '0.5rem 0', color: 'var(--theme-accent)', fontWeight: 600 }}>
                    {t('themes.previewAccent')}
                  </p>
                  <p style={{ margin: '0.5rem 0' }}>{t('themes.previewBody')}</p>
                  <span
                    style={{
                      display: 'inline-block',
                      background: 'var(--theme-primary)',
                      color: themeBases.light.buttonText,
                      borderRadius: 'var(--theme-radius)',
                      padding: '0.5rem 1rem',
                      fontWeight: 600,
                    }}
                  >
                    {t('themes.previewButton')}
                  </span>
                </div>
              </PhoneFrame>
            </div>
          </div>
          {problem?.kind === 'contrast' ? (
            <div role="alert" className="flex flex-col gap-1">
              <p className="m-0 font-semibold">{t('themes.contrastFailTitle')}</p>
              <ul className="m-0 pl-5">
                {problem.failures.map((f) => (
                  <li key={f.pair}>
                    {t('themes.contrastFail', {
                      pair: t(`themes.pairs.${f.pair}`),
                      ratio: (Math.floor(f.ratio * 10) / 10).toFixed(1),
                      required: String(f.required),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <Button disabled={busy} onClick={save}>
              {t('themes.save')}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

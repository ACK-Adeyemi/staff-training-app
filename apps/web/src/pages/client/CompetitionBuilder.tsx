// C12 Competition builder: new and edit. Built-in templates with their reasoning, or a custom competition.
// The prize field has a Suggest a prize button (domain nextSuggestion with the app's seeded Rng).
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { allPacks, type MessageKey } from '@sta/content';
import { Button, Card, PageHeader, Switch } from '@sta/ui';
import {
  CLOSED_BOOK_TEMPLATES,
  COMPETITION_TEMPLATES,
  addDays,
  can,
  competitionStatus,
  createRng,
  entitled,
  londonDateString,
  nextSuggestion,
  ulid,
  validateCompetition,
  type Competition,
  type CompetitionTemplateId,
  type PrizeWalk,
} from '@sta/domain';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { competitionErrorKey } from '../compete/errors';
import { useCompetition, useEntitlements } from '../compete/queries';
import { londonDayEnd, londonDayStart, templateText } from '../compete/shared';
import { CompetitionEligibility, buildEligibility } from './CompetitionEligibility';
import { field } from './organiseShared';
import { usePermissions } from './queries';

let sessions = 0;
const BUILT_IN_ONLY = [
  'templateId',
  'winnerSelection',
  'winnerCount',
  'liveLeaderboard',
  'closedBookOnly',
  'moduleIds',
  'teamUnit',
  'teamTarget',
] as const;
const omit = <T extends object, K extends keyof T>(o: T, keys: readonly K[]): Omit<T, K> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;
const DRAW_TEMPLATES: readonly CompetitionTemplateId[] = ['beatTheExpiry', 'completeAndWin'];
type Winner = NonNullable<Competition['winnerSelection']>;

type Form = {
  type: 'builtIn' | 'custom';
  templateId: CompetitionTemplateId | undefined;
  name: string;
  description: string;
  start: string;
  end: string;
  prize: string;
  liveLeaderboard: boolean;
  closedBookOnly: boolean;
  winnerSelection: Winner;
  winnerCount: number;
  teamTarget: number;
  teamUnit: 'team' | 'site';
  moduleIds: string[];
  jobRoleIds: string[];
  teamIds: string[];
  siteIds: string[];
  excludePersonIds: string[];
};

function RadioGroup<T extends string>({
  legend,
  value,
  options,
  disabled,
  onChange,
}: {
  legend: string;
  value: T | undefined;
  options: { id: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset role="radiogroup" className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1 font-semibold">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.id}
          className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] px-3 py-2 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]"
        >
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            disabled={disabled}
            onChange={() => {
              onChange(o.id);
            }}
            className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-semibold">
      {label}
      {children}
    </label>
  );
}

function initialForm(existing: Competition | undefined, today: Date): Form {
  if (existing) {
    return {
      type: existing.type,
      templateId: existing.templateId,
      name: existing.name,
      description: existing.description ?? '',
      start: londonDateString(new Date(existing.startAt)),
      end: londonDateString(new Date(existing.endAt)),
      prize: existing.prizeText,
      liveLeaderboard: existing.liveLeaderboard ?? true,
      closedBookOnly: existing.closedBookOnly ?? false,
      winnerSelection: existing.winnerSelection ?? 'top',
      winnerCount: existing.winnerCount ?? 1,
      teamTarget: existing.teamTarget ?? 90,
      teamUnit: existing.teamUnit ?? 'team',
      moduleIds: existing.moduleIds ?? [],
      jobRoleIds: existing.eligibility.jobRoleIds ?? [],
      teamIds: existing.eligibility.teamIds ?? [],
      siteIds: existing.eligibility.siteIds ?? [],
      excludePersonIds: existing.eligibility.excludePersonIds,
    };
  }
  return {
    type: 'builtIn',
    templateId: undefined,
    name: '',
    description: '',
    start: londonDateString(today),
    end: londonDateString(addDays(today, 28)),
    prize: '',
    liveLeaderboard: true,
    closedBookOnly: false,
    winnerSelection: 'top',
    winnerCount: 1,
    teamTarget: 90,
    teamUnit: 'team',
    moduleIds: [],
    jobRoleIds: [],
    teamIds: [],
    siteIds: [],
    excludePersonIds: [],
  };
}

function Builder({ existing }: { existing?: Competition }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ents = useEntitlements();
  const client = useQuery({
    queryKey: ['builderClient', actor.clientId],
    queryFn: () => store.clients.get(actor, actor.clientId as string),
  });
  const modules = useQuery({
    queryKey: ['builderModules', actor.userId],
    queryFn: async () => (await store.modules.list(actor)).filter((m) => m.status === 'published'),
  });
  const [form, setForm] = useState<Form>(() => initialForm(existing, clock.now()));
  const [session] = useState(() => `builder:${String((sessions += 1))}`);
  const rng = useMemo(() => createRng(clock.now().getTime()).fork(session), [clock, session]);
  const [id] = useState(() => existing?.id ?? ulid(clock, rng.fork('competition')));
  const walk = useRef<PrizeWalk | undefined>(undefined);
  const prizeRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
  };

  if (!ents.data || !client.data || !modules.data) return <p>{t('shell.loading')}</p>;
  const closedBookAllowed = entitled(ents.data, 'closedBookCompetitions');
  const pack = allPacks.find((p) => p.id === client.data.industryPackId);
  const suggestions = pack?.prizeSuggestions ?? [];
  const now = clock.now();
  const was = existing ? competitionStatus(existing, now) : undefined;
  const started = was === 'live';
  const finished = was === 'ended' || was === 'cancelled';
  const isDraft = existing === undefined || existing.status === 'draft';
  const builtIn = form.type === 'builtIn';
  const closedCapable = form.templateId !== undefined && CLOSED_BOOK_TEMPLATES.includes(form.templateId);
  const forcedClosed = form.templateId === 'closedBookChallenge';

  const chooseTemplate = (templateId: CompetitionTemplateId) => {
    set({
      templateId,
      winnerSelection: DRAW_TEMPLATES.includes(templateId) ? 'draw' : 'top',
      teamUnit: 'team',
      closedBookOnly: templateId === 'closedBookChallenge',
    });
  };

  const suggest = () => {
    if (suggestions.length === 0) return;
    const next = nextSuggestion(suggestions, walk.current, rng);
    walk.current = next.state;
    set({ prize: next.text });
  };

  const candidate = (): Competition | MessageKey => {
    if (builtIn && !form.templateId) return 'competition.builder.pickTemplate';
    if (form.name.trim() === '') return 'competition.builder.nameRequired';
    const startAt = londonDayStart(form.start);
    const endAt = londonDayEnd(form.end);
    if (!startAt || !endAt) return 'competition.builder.datesRequired';
    if (form.templateId === 'completeAndWin' && form.moduleIds.length === 0) return 'competition.builder.pickModules';
    const base: Competition = {
      ...existing,
      id,
      clientId: actor.clientId as string,
      type: form.type,
      name: form.name.trim(),
      startAt,
      endAt,
      prizeText: form.prize.trim(),
      eligibility: buildEligibility(form),
      status: existing?.status ?? 'draft',
    };
    if (form.description.trim() !== '') base.description = form.description.trim();
    else delete base.description;
    if (!builtIn) return omit(base, BUILT_IN_ONLY);
    base.templateId = form.templateId;
    base.winnerSelection = form.winnerSelection;
    base.winnerCount = form.winnerCount;
    base.liveLeaderboard = form.liveLeaderboard;
    if (closedCapable) base.closedBookOnly = form.closedBookOnly || forcedClosed;
    else delete base.closedBookOnly;
    if (form.templateId === 'completeAndWin') base.moduleIds = form.moduleIds;
    if (form.templateId === 'teamShowdown') base.teamUnit = form.teamUnit;
    if (form.winnerSelection === 'teamTarget') base.teamTarget = form.teamTarget;
    else delete base.teamTarget;
    return base;
  };

  const submit = async (publish: boolean) => {
    setProblem(null);
    const c = candidate();
    if (typeof c === 'string') {
      setProblem(t(c));
      return;
    }
    const rules = validateCompetition(existing, { ...c, status: publish ? 'scheduled' : c.status }, now);
    if (rules[0]) {
      setProblem(t(`errors.rule.${rules[0]}`));
      return;
    }
    setBusy(true);
    try {
      await store.competitions.save(actor, c);
      if (publish) await store.competitions.publish(actor, c.id);
      await queryClient.invalidateQueries();
      void navigate('/client/competitions');
    } catch (e) {
      setProblem(t(competitionErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const nameText = form.name.trim() || t('competition.builder.previewNoName');
  const endText = londonDayEnd(form.end);
  return (
    <>
      <PageHeader title={t(existing ? 'competition.editTitle' : 'competition.newTitle')} />
      {finished ? (
        <p role="note">{t(was === 'ended' ? 'errors.rule.competitionEnded' : 'errors.rule.competitionCancelled')}</p>
      ) : null}
      <div className="flex max-w-[40rem] flex-col gap-4">
        <RadioGroup
          legend={t('competition.builder.type')}
          value={form.type}
          disabled={existing !== undefined}
          options={[
            { id: 'builtIn', label: t('competition.builder.builtIn') },
            { id: 'custom', label: t('competition.builder.custom') },
          ]}
          onChange={(type) => {
            set({ type });
          }}
        />
        {builtIn ? (
          <>
            <RadioGroup
              legend={t('competition.builder.template')}
              value={form.templateId}
              disabled={started || finished}
              options={COMPETITION_TEMPLATES.map((id) => ({ id, label: templateText(t, id, 'name') }))}
              onChange={chooseTemplate}
            />
            {started ? <p className="m-0">{t('errors.rule.metricLocked')}</p> : null}
            {form.templateId ? (
              <Card>
                <h2 className="mb-1 mt-0 text-lg font-bold">{t('competition.howToWin')}</h2>
                <p className="mt-0">{templateText(t, form.templateId, 'howToWin')}</p>
                <h2 className="mb-1 mt-0 text-lg font-bold">{t('competition.why')}</h2>
                <p data-testid="template-why" className="m-0">
                  {templateText(t, form.templateId, 'why')}
                </p>
              </Card>
            ) : null}
          </>
        ) : null}
        <Labelled label={t('competition.builder.name')}>
          <input
            type="text"
            value={form.name}
            maxLength={80}
            className={field}
            onChange={(e) => {
              set({ name: e.target.value });
            }}
          />
        </Labelled>
        <Labelled label={t('competition.builder.description')}>
          <textarea
            value={form.description}
            maxLength={500}
            rows={3}
            className={`${field} py-2`}
            onChange={(e) => {
              set({ description: e.target.value });
            }}
          />
        </Labelled>
        <div className="flex flex-wrap gap-4">
          <Labelled label={t('competition.builder.start')}>
            <input
              type="date"
              value={form.start}
              className={field}
              onChange={(e) => {
                set({ start: e.target.value });
              }}
            />
          </Labelled>
          <Labelled label={t('competition.builder.end')}>
            <input
              type="date"
              value={form.end}
              className={field}
              onChange={(e) => {
                set({ end: e.target.value });
              }}
            />
          </Labelled>
        </div>
        <div className="flex flex-col gap-2">
          <Labelled label={t('competition.prize')}>
            <input
              ref={prizeRef}
              type="text"
              value={form.prize}
              maxLength={120}
              aria-describedby="prize-disclaimer"
              className={field}
              onChange={(e) => {
                set({ prize: e.target.value });
              }}
            />
          </Labelled>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={suggest}>
              {t('competition.suggestPrize')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                set({ prize: '' });
                prizeRef.current?.focus();
              }}
            >
              {t('competition.clearPrize')}
            </Button>
          </div>
          <p id="prize-disclaimer" className="m-0 text-sm">
            {t('competition.prizeDisclaimer')}
          </p>
        </div>
        {builtIn ? (
          <>
            <Switch
              label={t('competition.builder.liveLeaderboard')}
              checked={form.liveLeaderboard}
              onLabel={t('competition.builder.on')}
              offLabel={t('competition.builder.off')}
              onChange={(v) => {
                set({ liveLeaderboard: v });
              }}
            />
            {closedCapable ? (
              <div className="flex flex-col gap-1">
                <Switch
                  label={t('competition.builder.closedBook')}
                  checked={(form.closedBookOnly || forcedClosed) && closedBookAllowed}
                  disabled={!closedBookAllowed || forcedClosed || started || finished}
                  onLabel={t('competition.builder.on')}
                  offLabel={t('competition.builder.off')}
                  onChange={(v) => {
                    set({ closedBookOnly: v });
                  }}
                />
                {closedBookAllowed ? null : (
                  <p role="note" className="m-0">
                    {t('competition.builder.closedBookNotIncluded')}
                  </p>
                )}
              </div>
            ) : null}
            {DRAW_TEMPLATES.includes(form.templateId as CompetitionTemplateId) ? (
              <p className="m-0">{t('competition.builder.winnerDraw')}</p>
            ) : form.templateId ? (
              <RadioGroup<Winner>
                legend={t('competition.builder.winnerSelection')}
                value={form.winnerSelection}
                options={[
                  { id: 'top', label: t('competition.builder.winnerTop') },
                  ...(form.templateId === 'teamShowdown'
                    ? [{ id: 'teamTarget' as const, label: t('competition.builder.winnerTarget') }]
                    : []),
                ]}
                onChange={(winnerSelection) => {
                  set({ winnerSelection });
                }}
              />
            ) : null}
            {form.winnerSelection === 'teamTarget' ? (
              <Labelled label={t('competition.builder.teamTarget')}>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.teamTarget}
                  className={field}
                  onChange={(e) => {
                    set({ teamTarget: Number(e.target.value) });
                  }}
                />
              </Labelled>
            ) : (
              <Labelled label={t('competition.builder.winnerCount')}>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.winnerCount}
                  className={field}
                  onChange={(e) => {
                    set({ winnerCount: Math.min(20, Math.max(1, Number(e.target.value) || 1)) });
                  }}
                />
              </Labelled>
            )}
            {form.templateId === 'teamShowdown' ? (
              <RadioGroup
                legend={t('competition.builder.teamUnit')}
                value={form.teamUnit}
                disabled={started || finished}
                options={[
                  { id: 'team', label: t('competition.builder.unitTeam') },
                  { id: 'site', label: t('competition.builder.unitSite') },
                ]}
                onChange={(teamUnit) => {
                  set({ teamUnit });
                }}
              />
            ) : null}
            {form.templateId === 'completeAndWin' ? (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1 font-semibold">{t('competition.builder.modules')}</legend>
                {modules.data.map((m) => (
                  <label key={m.id} className="flex min-h-[var(--target-min)] items-center gap-3">
                    <input
                      type="checkbox"
                      checked={form.moduleIds.includes(m.id)}
                      disabled={started || finished}
                      className="h-5 w-5 accent-[var(--color-accent)]"
                      onChange={() => {
                        set({
                          moduleIds: form.moduleIds.includes(m.id)
                            ? form.moduleIds.filter((x) => x !== m.id)
                            : [...form.moduleIds, m.id],
                        });
                      }}
                    />
                    <span>{m.title}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </>
        ) : null}
        <CompetitionEligibility value={form} onChange={set} />
        <section aria-labelledby="banner-preview">
          <h2 id="banner-preview" className="mb-2 mt-0 text-lg font-bold">
            {t('competition.builder.preview')}
          </h2>
          <Card>
            <p className="m-0 font-bold">{nameText}</p>
            <p className="m-0">
              {t('competition.prize')}: {form.prize.trim() || t('competition.builder.previewNoPrize')}
            </p>
            {endText ? (
              <p className="m-0 text-sm">{t('competition.builder.previewEnds', { date: formatLondonDate(endText) })}</p>
            ) : null}
          </Card>
        </section>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={busy || finished}
            onClick={() => {
              void submit(false);
            }}
          >
            {t(isDraft ? 'competition.builder.saveDraft' : 'competition.builder.saveChanges')}
          </Button>
          {isDraft ? (
            <Button
              disabled={busy || finished}
              onClick={() => {
                void submit(true);
              }}
            >
              {t('competition.builder.publish')}
            </Button>
          ) : null}
        </div>
        {problem ? (
          <p role="alert" className="m-0 font-semibold">
            {problem}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function CompetitionBuilder() {
  const t = useT();
  const actor = useActor();
  const { id } = useParams();
  const perms = usePermissions();
  const existing = useCompetition(id ?? '');
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  const target = actor.clientId ? { clientId: actor.clientId } : undefined;
  if (!target || !can(perms.data, 'competitions.manage', target, 'write')) {
    return <p role="alert">{t('competition.noAccess')}</p>;
  }
  if (id === undefined) return <Builder />;
  if (existing.isError) return <p role="alert">{t('competition.notFound')}</p>;
  if (!existing.data) return <p>{t('shell.loading')}</p>;
  return <Builder key={existing.data.id} existing={existing.data} />;
}

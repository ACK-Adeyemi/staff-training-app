// S15 / C23 Raise a ticket (brief 25.3): seven short steps, one at a time. Staff tickets are private unless shared.
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { issueTypes, supportFeatures, type MessageKey } from '@sta/content';
import { validateTicket, type Ticket } from '@sta/domain';
import { Button, FilePickerButtons, ImageRedactor, LinkButton, PageHeader, type RedactBox } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { prepareImage } from '../../app/images';
import { inputClass } from '../client/foundationsErrors';
import { FaqItem, useFaqSearch } from './FaqBrowser';
import { appVersion, contextLabelKey, CONTEXT_ITEMS, deviceSummary, type ContextKey } from './context';
import { helpHref, helpPath, useCanRaise, useHelpSide } from './shared';

const STEPS = ['help', 'feature', 'issue', 'impact', 'details', 'screenshots', 'review'] as const;
type Step = (typeof STEPS)[number];
const OTHER = 'other';
const MAX_SHOTS = 5;
const ACCEPT = 'image/jpeg,image/png,image/webp';
const IMPACTS: { id: Ticket['impact']; key: MessageKey }[] = [
  { id: 'blocked', key: 'tickets.impact.cantUse' },
  { id: 'workaround', key: 'tickets.impact.workaround' },
  { id: 'question', key: 'tickets.impact.question' },
];
/** Staff never see payment wording, so billing choices are for admins only. */
const ADMIN_ONLY = new Set(['billing', 'reports']);

type Shot = { key: number; file: File; url: string; boxes: RedactBox[]; alt: string };

export function TicketWizard() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const side = useHelpSide();
  const navigate = useNavigate();
  const location = useLocation();
  const allowed = useCanRaise();
  const headingId = useId();
  const nextKey = useRef(1);

  const [step, setStep] = useState<Step>('help');
  const [error, setError] = useState<MessageKey | null>(null);
  const [query, setQuery] = useState('');
  const [feature, setFeature] = useState<string | null>(null);
  const [featureOther, setFeatureOther] = useState('');
  const [issue, setIssue] = useState<string | null>(null);
  const [issueOther, setIssueOther] = useState('');
  const [impact, setImpact] = useState<Ticket['impact'] | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [removed, setRemoved] = useState<ContextKey[]>([]);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentNumber, setSentNumber] = useState<string | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
    },
    [],
  );

  const header = <PageHeader title={t('tickets.raise')} />;
  if (allowed === undefined) {
    return (
      <>
        {header}
        <p>{t('help.loading')}</p>
      </>
    );
  }
  if (!allowed) {
    return (
      <>
        {header}
        <p role="alert">{t('tickets.staff.off')}</p>
      </>
    );
  }
  if (sentNumber !== null) {
    return (
      <>
        {header}
        <p role="status" className="font-semibold">
          {t('tickets.sent', { number: sentNumber })}
        </p>
        <LinkButton href={helpHref(side)}>{t('tickets.viewMine')}</LinkButton>
      </>
    );
  }

  const features = supportFeatures.filter((f) => side === 'client' || !ADMIN_ONLY.has(f.id));
  const issues = issueTypes.filter((i) => side === 'client' || i.id !== 'billing');

  const contextValue = (k: ContextKey): string =>
    k === 'screen'
      ? location.pathname
      : k === 'device'
        ? deviceSummary()
        : k === 'role'
          ? t(side === 'client' ? 'tickets.context.roleClient' : 'tickets.context.roleStaff')
          : appVersion();

  const check = (): MessageKey | null => {
    const base = { title: 'abc', description: 'x' };
    if (step === 'feature') {
      if (feature === null) return 'tickets.errors.choose';
      return feature === OTHER &&
        validateTicket({ ...base, featureId: OTHER, featureOtherText: featureOther }).length > 0
        ? 'tickets.errors.otherText'
        : null;
    }
    if (step === 'issue') {
      if (issue === null) return 'tickets.errors.choose';
      return issue === OTHER &&
        validateTicket({ ...base, issueTypeId: OTHER, issueTypeOtherText: issueOther }).length > 0
        ? 'tickets.errors.otherText'
        : null;
    }
    if (step === 'impact') return impact === null ? 'tickets.errors.choose' : null;
    if (step === 'details') {
      const errors = validateTicket({ title, description });
      if (errors.some((e) => e.field === 'title')) return 'tickets.errors.title';
      if (errors.some((e) => e.field === 'description')) return 'tickets.errors.description';
    }
    return null;
  };
  const go = (to: number) => {
    const target = STEPS[to];
    if (target) {
      setError(null);
      setStep(target);
    }
  };
  const index = STEPS.indexOf(step);
  const next = () => {
    const problem = check();
    if (problem) setError(problem);
    else go(index + 1);
  };

  const addFile = (file: File) => {
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('tickets.screenshots.badType');
      return;
    }
    if (shots.length >= MAX_SHOTS) {
      setError('tickets.screenshots.max');
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setShots((s) => [...s, { key: nextKey.current++, file, url, boxes: [], alt: '' }]);
  };
  const patchShot = (key: number, patch: Partial<Shot>) => {
    setShots((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const attachmentIds: string[] = [];
      for (const [i, shot] of shots.entries()) {
        const prepared = await prepareImage(shot.file, shot.boxes);
        const stored = await store.attachments.upload(actor, {
          purpose: 'ticketScreenshot',
          title: t('tickets.screenshots.title', { n: i + 1 }),
          mime: prepared.mime,
          data: prepared.data,
          ...(shot.alt.trim() !== '' ? { alt: shot.alt.trim() } : {}),
          redacted: shot.boxes.length > 0,
        });
        attachmentIds.push(stored.id);
      }
      const context = Object.fromEntries(
        CONTEXT_ITEMS.filter((k) => !removed.includes(k)).map((k) => [k, contextValue(k)]),
      );
      const ticket = await store.tickets.raise(actor, {
        title: title.trim(),
        description: description.trim(),
        impact: impact ?? 'question',
        ...(feature !== null ? { featureId: feature } : {}),
        ...(feature === OTHER ? { featureOtherText: featureOther } : {}),
        ...(issue !== null ? { issueTypeId: issue } : {}),
        ...(issue === OTHER ? { issueTypeOtherText: issueOther } : {}),
        ...(side === 'staff' ? { sharedWithManager: shared } : {}),
        context,
        attachmentIds,
      });
      setSentNumber(ticket.number);
    } catch {
      setError('tickets.errors.send');
    } finally {
      setBusy(false);
    }
  };

  const radio = (name: string, id: string, label: string, checked: boolean, onChange: () => void) => (
    <label
      key={id}
      className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]"
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
      />
      <span>{label}</span>
    </label>
  );
  const otherBox = (value: string, set: (v: string) => void) => (
    <input
      type="text"
      aria-label={t('tickets.other')}
      placeholder={t('tickets.otherPlaceholder')}
      value={value}
      onChange={(e) => {
        set(e.target.value);
      }}
      className={inputClass}
    />
  );

  const body = () => {
    switch (step) {
      case 'help':
        return <HelpFirst query={query} setQuery={setQuery} onAnswered={() => void navigate(helpPath(side))} />;
      case 'feature':
        return (
          <>
            {features.map((f) =>
              radio('feature', f.id, t(f.labelKey as MessageKey), feature === f.id, () => {
                setFeature(f.id);
              }),
            )}
            {radio('feature', OTHER, t('tickets.other'), feature === OTHER, () => {
              setFeature(OTHER);
            })}
            {feature === OTHER ? otherBox(featureOther, setFeatureOther) : null}
          </>
        );
      case 'issue':
        return (
          <>
            {issues.map((i) =>
              radio('issue', i.id, t(i.labelKey as MessageKey), issue === i.id, () => {
                setIssue(i.id);
              }),
            )}
            {radio('issue', OTHER, t('tickets.other'), issue === OTHER, () => {
              setIssue(OTHER);
            })}
            {issue === OTHER ? otherBox(issueOther, setIssueOther) : null}
          </>
        );
      case 'impact':
        return IMPACTS.map((i) =>
          radio('impact', i.id, t(i.key), impact === i.id, () => {
            setImpact(i.id);
          }),
        );
      case 'details':
        return (
          <>
            <label className="flex flex-col gap-1 font-semibold">
              {t('tickets.title_label')}
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              {t('tickets.whatHappened')}
              <textarea
                rows={5}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
                className={inputClass}
              />
            </label>
          </>
        );
      case 'screenshots':
        return (
          <>
            <p className="m-0">{t('tickets.screenshots.reminder')}</p>
            <p className="m-0">{t('tickets.screenshots.metadata')}</p>
            <FilePickerButtons
              takePhotoLabel={t('tickets.screenshots.take')}
              chooseFileLabel={t('tickets.screenshots.add')}
              accept={ACCEPT}
              onFile={addFile}
            />
            {shots.map((shot, i) => (
              <div
                key={shot.key}
                role="group"
                aria-label={t('tickets.screenshots.title', { n: i + 1 })}
                className="flex flex-col gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
              >
                <ImageRedactor
                  src={shot.url}
                  alt={t('tickets.screenshots.previewAlt', { n: i + 1 })}
                  boxes={shot.boxes}
                  onChange={(boxes) => {
                    patchShot(shot.key, { boxes });
                  }}
                  addBoxLabel={t('evidenceFlow.addBox')}
                  removeBoxLabel={t('evidenceFlow.removeBox')}
                  boxLabel={(n) => t('evidenceFlow.boxLabel', { n })}
                  helpText={t('tickets.screenshots.blurHelp')}
                />
                <label className="flex flex-col gap-1 font-semibold">
                  {t('tickets.screenshots.altText')}
                  <input
                    type="text"
                    value={shot.alt}
                    maxLength={200}
                    onChange={(e) => {
                      patchShot(shot.key, { alt: e.target.value });
                    }}
                    className={inputClass}
                  />
                </label>
                <div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShots((s) => s.filter((x) => x.key !== shot.key));
                    }}
                  >
                    {t('tickets.screenshots.remove')}
                  </Button>
                </div>
              </div>
            ))}
          </>
        );
      case 'review':
        return (
          <>
            <div role="group" aria-label={t('tickets.context.title')} className="flex flex-col gap-2">
              <p className="m-0 text-sm">{t('tickets.context.note')}</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {CONTEXT_ITEMS.map((k) => (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{t(contextLabelKey(k))}</strong>
                      {removed.includes(k) ? null : <> {contextValue(k)}</>}
                    </span>
                    {removed.includes(k) ? (
                      <span className="font-semibold">{t('tickets.context.removed')}</span>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRemoved((r) => [...r, k]);
                        }}
                      >
                        {t('tickets.context.removeItem', { label: t(contextLabelKey(k)) })}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {shots.length > 0 ? (
              <p className="m-0">{t('tickets.screenshots.attached', { count: shots.length })}</p>
            ) : null}
            {side === 'staff' ? (
              <div className="flex flex-col gap-1">
                <label className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]">
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={(e) => {
                      setShared(e.target.checked);
                    }}
                    className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span>{t('tickets.share')}</span>
                </label>
                <p className="m-0 text-sm">{t('tickets.shareNote')}</p>
              </div>
            ) : null}
          </>
        );
    }
  };

  return (
    <>
      {header}
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <h2 id={headingId} className="m-0 text-xl font-bold">
          {t(`tickets.steps.${step}` as MessageKey)}
        </h2>
        <p className="m-0 text-sm">{t('tickets.stepOf', { n: index + 1, total: STEPS.length })}</p>
        <div
          {...(['feature', 'issue', 'impact'].includes(step)
            ? { role: 'radiogroup', 'aria-labelledby': headingId }
            : {})}
          className="flex flex-col gap-2"
        >
          {body()}
        </div>
        {error ? (
          <p role="alert" className="m-0">
            {t(error)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {index > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                go(index - 1);
              }}
            >
              {t('common.back')}
            </Button>
          ) : null}
          {step === 'review' ? (
            <Button
              disabled={busy}
              onClick={() => {
                void send();
              }}
            >
              {t('tickets.submit')}
            </Button>
          ) : (
            <Button onClick={next}>{t('common.next')}</Button>
          )}
        </div>
      </section>
    </>
  );
}

/** Step 1: look for an answer first. Only matches are shown, as disclosures. */
function HelpFirst({
  query,
  setQuery,
  onAnswered,
}: {
  query: string;
  setQuery: (q: string) => void;
  onAnswered: () => void;
}) {
  const t = useT();
  const side = useHelpSide();
  const searchId = useId();
  const { shown } = useFaqSearch(side, query, null);
  const searching = query.trim() !== '';
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="font-semibold">
          {t('help.search')}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          className={inputClass}
        />
      </div>
      {searching && shown.length === 0 ? <p className="m-0">{t('help.noResults')}</p> : null}
      {searching && shown.length > 0 ? (
        <>
          <h3 className="m-0 text-base font-bold">{t('tickets.suggestions')}</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {shown.map((f) => (
              <FaqItem key={f.id} faq={f} />
            ))}
          </ul>
          <div>
            <Button variant="secondary" onClick={onAnswered}>
              {t('tickets.stopHere')}
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}

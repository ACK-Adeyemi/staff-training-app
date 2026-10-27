import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useParams } from 'react-router';
import { Badge, Button, Dialog, PageHeader } from '@sta/ui';
import { can, holdsAnywhere, isOwnOrAboutSelf, type EffectivePermission, type RejectionReason } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useActor, useCurrentUser, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { focusLink } from '../staff/styles';
import { foundationsErrorKey, inputClass } from './foundationsErrors';
import { useSubmissionReview, type ReviewData } from './evidenceQueries';
import { fullName, usePermissions } from './queries';

const REASONS: RejectionReason[] = ['notRightCourse', 'nameMismatch', 'expired', 'unreadable', 'other'];
const dateOnly = (iso: string | undefined): string => (iso ? iso.slice(0, 10) : '');
const midnight = (date: string): string => `${date}T00:00:00.000Z`;

const blobUrl = (file: NonNullable<ReviewData['file']>): string =>
  URL.createObjectURL(new Blob([new Uint8Array(file.data)], { type: file.mime }));

/** Shows the certificate: an image inline, a PDF from a button that opens it in a new tab. */
function CertificateViewer({ file }: { file: ReviewData['file'] }) {
  const t = useT();
  const isPdf = file?.mime === 'application/pdf';
  // The image address is made while rendering, so the picture is there with the details.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const image = useMemo(() => (file && !isPdf ? blobUrl(file) : null), [file?.id, isPdf]);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!image) return undefined;
    // React's development double run unmounts and mounts again at once; revoking waits a tick so it can be cancelled.
    if (pending.current) clearTimeout(pending.current);
    return () => {
      pending.current = setTimeout(() => {
        URL.revokeObjectURL(image);
      }, 0);
    };
  }, [image]);
  return (
    <section aria-labelledby="ev-cert" className="flex flex-col gap-2">
      <h2 id="ev-cert" className="m-0 text-lg font-bold">
        {t('evidenceFlow.certificateRegion')}
      </h2>
      {!file ? <p>{t('evidenceFlow.noFile')}</p> : null}
      {image ? (
        <img
          src={image}
          alt={t('evidenceFlow.certificateImageAlt')}
          className="block max-h-[70vh] max-w-full self-start"
        />
      ) : null}
      {file && isPdf ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              const url = blobUrl(file);
              window.open(url, '_blank', 'noopener,noreferrer');
              setTimeout(() => {
                URL.revokeObjectURL(url);
              }, 60_000);
            }}
          >
            {t('evidenceFlow.openPdf')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

type Dialogs = 'betterCopy' | 'reject' | null;

function Review({
  id,
  data,
  perms,
  personId,
}: {
  id: string;
  data: ReviewData;
  perms: EffectivePermission[];
  personId: string | undefined;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<RejectionReason>('notRightCourse');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const { submission: s, requirement, person, file } = data;
  const waiting = s.status === 'awaitingCheck';
  const mayDecide = waiting && can(perms, 'evidence.approve', { clientId: s.clientId, siteIds: [s.siteId] });
  const blocked = isOwnOrAboutSelf(s, {
    userId: actor.userId,
    ...(personId !== undefined ? { personId } : {}),
  });
  const completedValue = completed ?? dateOnly(s.completedAt);
  const expiresValue = expires ?? dateOnly(s.expiresAt);

  const run = async (decision: Parameters<typeof store.evidenceFlow.review>[2], done: string, fromDialog: boolean) => {
    setBusy(true);
    try {
      await store.evidenceFlow.review(actor, id, decision);
      setMessage(done);
      setDialog(null);
      setError(null);
      setDialogError(null);
    } catch (e) {
      const text = t(foundationsErrorKey(e));
      if (fromDialog) setDialogError(text);
      else setError(text);
    } finally {
      setBusy(false);
    }
  };

  const approve = (e: SyntheticEvent) => {
    e.preventDefault();
    const changedCompleted = completedValue !== dateOnly(s.completedAt) && completedValue !== '';
    const changedExpiry = expiresValue !== dateOnly(s.expiresAt) && expiresValue !== '';
    void run(
      {
        kind: 'approve',
        ...(changedCompleted ? { completedAt: midnight(completedValue) } : {}),
        ...(changedExpiry ? { expiresAt: midnight(expiresValue) } : {}),
      },
      t('evidenceFlow.approvedDone'),
      false,
    );
  };

  const sendDecision = (e: SyntheticEvent) => {
    e.preventDefault();
    if (dialog === 'betterCopy') {
      if (note.trim() === '') {
        setDialogError(t('evidenceFlow.noteRequired'));
        return;
      }
      void run({ kind: 'betterCopy', note: note.trim() }, t('evidenceFlow.decisionSent'), true);
    } else {
      void run(
        { kind: 'reject', reason, ...(note.trim() !== '' ? { note: note.trim() } : {}) },
        t('evidenceFlow.decisionSent'),
        true,
      );
    }
  };
  const openDialog = (which: Dialogs) => {
    setNote('');
    setDialogError(null);
    setDialog(which);
  };

  const term = 'font-semibold';
  const statusWord: Record<string, MessageKey> = {
    awaitingCheck: 'evidenceFlow.waiting',
    needsBetterCopy: 'evidenceFlow.needsBetterCopy',
    approved: 'evidenceFlow.approved',
    rejected: 'evidenceFlow.rejected',
    withdrawn: 'evidenceFlow.withdrawn',
  };
  return (
    <div className="flex flex-col gap-6">
      {!waiting ? (
        <p className="m-0">
          <Badge>{t(statusWord[s.status] ?? 'evidenceFlow.waiting')}</Badge>
        </p>
      ) : null}
      <section aria-labelledby="ev-details" className="flex flex-col gap-2">
        <h2 id="ev-details" className="m-0 text-lg font-bold">
          {t('evidenceFlow.details')}
        </h2>
        <dl className="m-0 flex flex-col gap-1 break-words">
          <dt className={term}>{t('evidenceFlow.person')}</dt>
          <dd className="m-0 mb-2 break-words">{person ? fullName(person) : t('evidenceFlow.someone')}</dd>
          <dt className={term}>{t('evidenceFlow.requirement')}</dt>
          <dd className="m-0 mb-2 break-words">{requirement?.name ?? ''}</dd>
          <dt className={term}>{t('evidenceFlow.provider')}</dt>
          <dd className="m-0 mb-2 break-words">{s.providerName}</dd>
          <dt className={term}>{t('evidenceFlow.dateCompleted')}</dt>
          <dd className="m-0 mb-2 break-words">{formatLondonDate(s.completedAt)}</dd>
          <dt className={term}>{t('evidenceFlow.expiryDate')}</dt>
          <dd className="m-0 mb-2 break-words">{s.expiresAt ? formatLondonDate(s.expiresAt) : ''}</dd>
          {s.certificateRef ? (
            <>
              <dt className={term}>{t('evidenceFlow.certificateRef')}</dt>
              <dd className="m-0 mb-2 break-words">{s.certificateRef}</dd>
            </>
          ) : null}
        </dl>
        {s.decisionNote ? <p className="m-0">{s.decisionNote}</p> : null}
      </section>
      <CertificateViewer file={file} />
      {mayDecide ? (
        <>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 font-bold">{t('evidenceFlow.checklist')}</legend>
            {(requirement?.approverChecklist ?? []).map((item, i) => (
              <label key={i} className="flex min-h-[var(--target-min)] items-start gap-2 py-2">
                <input type="checkbox" className="mt-1 size-5 shrink-0" />
                <span>{item}</span>
              </label>
            ))}
          </fieldset>
          <p className="m-0">{t('evidenceFlow.confirmStatement')}</p>
          {blocked ? <p className="m-0 font-semibold">{t('evidenceFlow.blockedSelf')}</p> : null}
          <form aria-label={t('evidenceFlow.approve')} onSubmit={approve} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="ev-done" className={term}>
                  {t('evidenceFlow.dateCompleted')}
                </label>
                <input
                  id="ev-done"
                  type="date"
                  value={completedValue}
                  onChange={(e) => {
                    setCompleted(e.target.value);
                  }}
                  disabled={blocked}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="ev-exp" className={term}>
                  {t('evidenceFlow.expiryDate')}
                </label>
                <input
                  id="ev-exp"
                  type="date"
                  value={expiresValue}
                  onChange={(e) => {
                    setExpires(e.target.value);
                  }}
                  disabled={blocked}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={blocked || busy}>
                {t('evidenceFlow.approve')}
              </Button>
              <Button
                variant="secondary"
                disabled={blocked || busy}
                onClick={() => {
                  openDialog('betterCopy');
                }}
              >
                {t('evidenceFlow.requestBetterCopy')}
              </Button>
              <Button
                variant="secondary"
                disabled={blocked || busy}
                onClick={() => {
                  openDialog('reject');
                }}
              >
                {t('evidenceFlow.reject')}
              </Button>
            </div>
          </form>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <Dialog
        open={dialog !== null}
        title={dialog === 'reject' ? t('evidenceFlow.reject') : t('evidenceFlow.requestBetterCopy')}
        onClose={() => {
          setDialog(null);
        }}
      >
        {dialog ? (
          <form onSubmit={sendDecision} noValidate className="flex flex-col gap-3">
            {dialog === 'reject' ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="ev-reason" className={term}>
                  {t('evidenceFlow.reason')}
                </label>
                <select
                  id="ev-reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value as RejectionReason);
                  }}
                  className={inputClass}
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`evidenceFlow.reasons.${r}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <label htmlFor="ev-note" className={term}>
                {t('evidenceFlow.note')}
              </label>
              <textarea
                id="ev-note"
                rows={3}
                maxLength={300}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
                className={`${inputClass} py-2`}
              />
            </div>
            {dialogError ? <p role="alert">{dialogError}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                {t('evidenceFlow.sendDecision')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDialog(null);
                }}
              >
                {t('evidenceFlow.cancel')}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
      <a
        href="#/client/evidence"
        className={`inline-flex min-h-[var(--target-min)] items-center self-start underline ${focusLink}`}
      >
        {t('evidenceFlow.queueTitle')}
      </a>
    </div>
  );
}

/** C27, one certificate: the details, the file, the checklist and the decision. Needs evidence.view. */
export function EvidenceReview() {
  const t = useT();
  const { id } = useParams();
  const perms = usePermissions();
  const user = useCurrentUser();
  const q = useSubmissionReview(id ?? '');
  const header = <PageHeader title={t('evidenceFlow.reviewTitle')} />;
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (!holdsAnywhere(perms.data, 'evidence.view')) {
    return (
      <>
        {header}
        <p role="alert">{t('errors.forbidden')}</p>
      </>
    );
  }
  if (q.isError) {
    return (
      <>
        {header}
        <p role="alert">{t('evidenceFlow.notFound')}</p>
      </>
    );
  }
  if (!q.data || user.isPending) return <p>{t('shell.loading')}</p>;
  return (
    <>
      {header}
      <Review id={id ?? ''} data={q.data} perms={perms.data} personId={user.data?.personId} />
    </>
  );
}

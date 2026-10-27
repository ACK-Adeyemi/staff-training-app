// The certificate form shared by S17 (a person sends their own) and the C3 dialog (an admin sends for someone).
// Photos go through prepareImage (metadata stripped, blur boxes applied); PDFs are stored as they are.
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Button, FilePickerButtons, ImageRedactor, type RedactBox } from '@sta/ui';
import { expiryFor, londonDateString, type EvidenceSubmission, type Requirement } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { prepareImage } from '../../app/images';
import { useActor, useStore, useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';
import { foundationsErrorKey, inputClass } from '../client/foundationsErrors';

export const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
const OTHER = '__other__';

const isImage = (file: File): boolean => IMAGES.includes(file.type);
const day = (date: string): string => `${date}T00:00:00.000Z`;

/** The file as bytes. Falls back to FileReader where Blob.arrayBuffer is missing (older engines, jsdom). */
function readBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      reject(new Error('read'));
    };
    reader.readAsArrayBuffer(file);
  });
}

export type UploadFormProps = {
  requirement: Requirement;
  personId: string;
  siteId: string;
  /** An admin sending for someone else: the person is named on the submission. */
  onBehalf?: boolean;
  /** The rejected or better-copy-wanted submission being sent again. */
  resubmitting?: EvidenceSubmission;
  onSent?: () => void;
};

export function UploadForm({ requirement, personId, siteId, onBehalf = false, resubmitting, onSent }: UploadFormProps) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [provider, setProvider] = useState('');
  const [otherName, setOtherName] = useState('');
  const [completed, setCompleted] = useState('');
  const [expiry, setExpiry] = useState('');
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const url = useRef<string | null>(null);
  const fromCertificate = requirement.expiryMode === 'fromCertificate';

  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  const choose = (next: File) => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPreview(null);
    setBoxes([]);
    if (!ACCEPT.split(',').includes(next.type)) {
      setFile(null);
      setError(t('evidenceFlow.badType'));
      return;
    }
    if (next.size > MAX_BYTES) {
      setFile(null);
      setError(t('evidenceFlow.tooBig'));
      return;
    }
    setError(null);
    setFile(next);
    if (isImage(next)) {
      url.current = URL.createObjectURL(next);
      setPreview(url.current);
    }
  };

  const expected = !fromCertificate && completed !== '' ? expiryFor(requirement, day(completed)) : undefined;

  const check = (): MessageKey | null => {
    if (!file) return 'evidenceFlow.errorNoFile';
    if (provider === '') return 'evidenceFlow.errorProvider';
    if (provider === OTHER && otherName.trim() === '') return 'evidenceFlow.errorProviderName';
    if (completed === '') return 'evidenceFlow.errorCompleted';
    if (fromCertificate) {
      if (expiry === '') return 'evidenceFlow.errorExpiry';
      const result = expiryFor(requirement, day(completed), day(expiry));
      if (!result.ok)
        return result.error === 'expiryRequired' ? 'evidenceFlow.errorExpiry' : 'evidenceFlow.errorExpiryBefore';
    }
    return null;
  };

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    const problem = check();
    if (problem || !file) {
      setError(t(problem ?? 'evidenceFlow.errorNoFile'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let data: Uint8Array;
      let mime: string;
      if (isImage(file)) {
        const prepared = await prepareImage(file, boxes);
        data = prepared.data;
        mime = prepared.mime;
      } else {
        data = await readBytes(file);
        mime = file.type;
      }
      const stored = await store.attachments.upload(actor, {
        purpose: 'certificate',
        title: t('evidenceFlow.fileTitle', { requirement: requirement.name }),
        mime,
        data,
        personId,
        siteId,
        redacted: boxes.length > 0,
      });
      const details = {
        providerName: provider === OTHER ? otherName.trim() : provider,
        completedAt: day(completed),
        ...(fromCertificate ? { expiresAt: day(expiry) } : {}),
        ...(ref.trim() !== '' ? { certificateRef: ref.trim() } : {}),
        fileAttachmentId: stored.id,
      };
      if (resubmitting) await store.evidenceFlow.resubmit(actor, resubmitting.id, details);
      else {
        await store.evidenceFlow.submit(actor, {
          requirementId: requirement.id,
          ...(onBehalf ? { personId } : {}),
          ...details,
        });
      }
      setSent(true);
      onSent?.();
    } catch (err) {
      setError(t(foundationsErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <p role="status">{t('evidenceFlow.submitted')}</p>;

  const label = 'font-semibold';
  const row = 'flex flex-col gap-1';
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0">{t('evidenceFlow.limits')}</p>
      <FilePickerButtons
        takePhotoLabel={t('evidenceFlow.takePhoto')}
        chooseFileLabel={t('evidenceFlow.chooseFile')}
        accept={ACCEPT}
        onFile={choose}
      />
      {error && !file ? <p role="alert">{error}</p> : null}
      {file ? (
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
          {preview ? (
            <>
              <p className="m-0">{t('evidenceFlow.blurHint')}</p>
              <ImageRedactor
                src={preview}
                alt={t('evidenceFlow.previewAlt')}
                boxes={boxes}
                onChange={setBoxes}
                addBoxLabel={t('evidenceFlow.addBox')}
                removeBoxLabel={t('evidenceFlow.removeBox')}
                boxLabel={(n) => t('evidenceFlow.boxLabel', { n })}
                helpText={t('evidenceFlow.redactHelp')}
              />
            </>
          ) : (
            <p className="m-0 break-words">{file.name}</p>
          )}
          <div className={row}>
            <label htmlFor="ev-provider" className={label}>
              {t('evidenceFlow.provider')}
            </label>
            <select
              id="ev-provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
              }}
              className={inputClass}
            >
              <option value="">{t('evidenceFlow.chooseProvider')}</option>
              {requirement.acceptedProviders.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
              <option value={OTHER}>{t('evidenceFlow.providerOther')}</option>
            </select>
          </div>
          {provider === OTHER ? (
            <div className={row}>
              <label htmlFor="ev-other" className={label}>
                {t('evidenceFlow.providerOtherName')}
              </label>
              <input
                id="ev-other"
                type="text"
                value={otherName}
                maxLength={100}
                onChange={(e) => {
                  setOtherName(e.target.value);
                }}
                className={inputClass}
              />
            </div>
          ) : null}
          <div className={row}>
            <label htmlFor="ev-completed" className={label}>
              {t('evidenceFlow.date')}
            </label>
            <input
              id="ev-completed"
              type="date"
              value={completed}
              max={londonDateString(new Date(actor.now))}
              onChange={(e) => {
                setCompleted(e.target.value);
              }}
              className={inputClass}
            />
          </div>
          {fromCertificate ? (
            <div className={row}>
              <label htmlFor="ev-expiry" className={label}>
                {t('evidenceFlow.expiry')}
              </label>
              <input
                id="ev-expiry"
                type="date"
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value);
                }}
                className={inputClass}
              />
            </div>
          ) : expected?.ok && expected.expiresAt ? (
            <p className="m-0 font-semibold">
              {t('evidenceFlow.expectedExpiry', { date: formatLondonDate(expected.expiresAt) })}
            </p>
          ) : null}
          <div className={row}>
            <label htmlFor="ev-ref" className={label}>
              {t('evidenceFlow.certificateNumber')}
            </label>
            <input
              id="ev-ref"
              type="text"
              value={ref}
              maxLength={60}
              onChange={(e) => {
                setRef(e.target.value);
              }}
              className={inputClass}
            />
          </div>
          {error ? <p role="alert">{error}</p> : null}
          <div>
            <Button type="submit" disabled={busy}>
              {resubmitting ? t('evidenceFlow.resubmit') : t('evidenceFlow.submit')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

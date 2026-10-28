// The Learn more panel for one lesson or one question: existing links, a title and https address, or a PDF upload.
// The same panel serves an own module (links held in the form) and a provider module (links saved as overlays).
import { useId, useState } from 'react';
import { Button } from '@sta/ui';
import { isSafeHttpsUrl } from '@sta/domain';
import { useActor, useStore, useT } from '../../../app/hooks';
import { foundationsErrorKey, inputClass } from '../foundationsErrors';

export type PanelLink = { id: string; title: string; isPdf: boolean };
export type NewLink = { title: string; url: string } | { title: string; attachmentId: string };

const readBytes = (file: File): Promise<Uint8Array> => {
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
};

export function LinkPanel({
  kind,
  targetId,
  name,
  links,
  onAdd,
  onRemove,
}: {
  kind: 'lesson' | 'question';
  targetId: string;
  name: string;
  links: PanelLink[];
  onAdd: (link: NewLink) => Promise<void> | void;
  onRemove: (linkId: string) => Promise<void> | void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const uid = useId();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attempt = async (work: () => Promise<void> | void) => {
    setError(null);
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setError(t(foundationsErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const clean = title.trim();
    if (clean === '') {
      setError(t('client.builder.links.titleNeeded'));
      return;
    }
    const address = url.trim();
    if (!isSafeHttpsUrl(address)) {
      setError(t('errors.rule.notHttps'));
      return;
    }
    void attempt(async () => {
      await onAdd({ title: clean, url: address });
      setTitle('');
      setUrl('');
    });
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    const clean = title.trim();
    if (clean === '') {
      setError(t('client.builder.links.titleNeeded'));
      return;
    }
    void attempt(async () => {
      let stored;
      try {
        stored = await store.attachments.upload(actor, {
          purpose: 'learningDocument',
          title: clean,
          mime: file.type,
          data: await readBytes(file),
        });
      } catch {
        setError(t('client.builder.links.uploadFailed'));
        return;
      }
      await onAdd({ title: clean, attachmentId: stored.id });
      setTitle('');
    });
  };

  return (
    <fieldset
      data-testid="link-target"
      data-target-kind={kind}
      data-target-id={targetId}
      className="m-0 mt-3 min-w-0 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3"
    >
      <legend className="px-1 font-semibold">{t('client.builder.links.legend', { name })}</legend>
      {links.length > 0 ? (
        <ul className="m-0 mb-3 flex list-none flex-col gap-2 p-0">
          {links.map((l) => (
            <li key={l.id} data-testid="link-item" className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {l.title}
                {l.isPdf ? ` (${t('client.builder.links.pdfTag')})` : ''}
              </span>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void attempt(() => onRemove(l.id));
                }}
              >
                {t('client.builder.links.remove')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 font-semibold">
          {t('client.builder.links.title')}
          <input
            type="text"
            value={title}
            maxLength={120}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {t('client.builder.links.url')}
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
            className={inputClass}
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={add}>
            {t('client.builder.links.add')}
          </Button>
          <label htmlFor={`${uid}-pdf`} className="flex min-w-0 max-w-full flex-col gap-1 font-semibold">
            {t('client.builder.links.pdf')}
            <input
              id={`${uid}-pdf`}
              type="file"
              accept="application/pdf"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                upload(file);
              }}
              className="min-h-[var(--target-min)] w-full min-w-0 max-w-full text-[var(--color-text)]"
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="m-0 font-semibold">
            {error}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

// The app feedback sheet (brief 26.1, F-4). It goes to the product team, never to the person's manager.
import { useId, useState } from 'react';
import { useLocation } from 'react-router';
import { Button, Dialog } from '@sta/ui';
import type { MessageKey } from '@sta/content';
import { useActor, useStore, useT } from '../../app/hooks';
import { inputClass } from '../client/foundationsErrors';
import { deviceSummary } from './context';
import { helpHref, useHelpSide } from './shared';

const KINDS = ['idea', 'problem', 'praise'] as const;

export function FeedbackSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const side = useHelpSide();
  const location = useLocation();
  const textId = useId();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('idea');
  const [text, setText] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setError(null);
    onClose();
  };
  const send = async () => {
    if (text.trim() === '') {
      setError('feedback.app.empty');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await store.appFeedback.submit(actor, {
        kind,
        text: text.trim(),
        context: { screen: location.pathname, device: deviceSummary() },
      });
      setText('');
      setKind('idea');
      onClose();
      onSent();
    } catch {
      setError('feedback.app.sendError');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title={t('feedback.app.title')} onClose={close}>
      {open ? (
        <div className="flex flex-col gap-3">
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 p-0 font-semibold">{t('feedback.app.type')}</legend>
            {KINDS.map((k) => (
              <label
                key={k}
                className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]"
              >
                <input
                  type="radio"
                  name="app-feedback-kind"
                  checked={kind === k}
                  onChange={() => {
                    setKind(k);
                  }}
                  className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
                />
                <span>{t(`feedback.app.${k}` as MessageKey)}</span>
              </label>
            ))}
          </fieldset>
          <label htmlFor={textId} className="font-semibold">
            {t('feedback.app.text')}
          </label>
          <textarea
            id={textId}
            rows={4}
            maxLength={2000}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            className={inputClass}
          />
          <p className="m-0 text-sm">{t('feedback.app.goesTo')}</p>
          <p className="m-0 text-sm">{t('feedback.app.noNames')}</p>
          <p className="m-0 text-sm">{t('feedback.app.context')}</p>
          <a
            href={helpHref(side, '/ticket/new')}
            onClick={close}
            className="inline-flex min-h-[var(--target-min)] items-center underline focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          >
            {t('feedback.app.stuck')}
          </a>
          {error ? (
            <p role="alert" className="m-0">
              {t(error)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() => {
                void send();
              }}
            >
              {t('feedback.app.submit')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('feedback.app.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

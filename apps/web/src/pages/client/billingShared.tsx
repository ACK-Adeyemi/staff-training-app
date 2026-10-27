// Small pieces shared by the billing screens and Explain this.
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Dialog } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { foundationsErrorKey, inputClass } from './foundationsErrors';

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-4">
      <Card>
        <h2 id={id} className="mt-0 mb-3 text-lg font-bold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

/** Asks the people with billing access to turn an add-on on. Any client admin may send one (brief 24.8). */
export function RequestAddOnDialog({
  open,
  addOnId,
  addOnName,
  onClose,
  onSent,
}: {
  open: boolean;
  addOnId: string;
  addOnName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setNote('');
    setError(null);
    onClose();
  };
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const trimmed = note.trim();
      await store.addOnRequests.create(actor, { addOnId, ...(trimmed ? { note: trimmed } : {}) });
      setNote('');
      onSent();
      onClose();
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(t(foundationsErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title={t('addOns.requestTitle', { name: addOnName })} onClose={close}>
      {open ? (
        <form
          onSubmit={(e) => {
            void submit(e);
          }}
          className="flex flex-col gap-3"
        >
          <p className="m-0">{t('addOns.requestHelp')}</p>
          <label htmlFor="addon-request-note" className="font-semibold">
            {t('addOns.noteLabel')}
          </label>
          <textarea
            id="addon-request-note"
            value={note}
            maxLength={300}
            rows={3}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            className={`${inputClass} py-2`}
          />
          {error ? <p role="alert">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              {t('addOns.sendRequest')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}

// The "Confirm it's you" step shared by Export all data and Export this person: asks for the code, runs the export
// and downloads the ZIP. Wrong or blank codes are explained in the dialog and nothing is downloaded.
import { useState, type SyntheticEvent } from 'react';
import { Button, Dialog } from '@sta/ui';
import { RuleError } from '@sta/data';
import type { ExportBundle } from '@sta/data';
import { useActor, useClock, useStore, useT } from '../../app/hooks';
import { downloadZip } from '../../app/zip';
import { inputClass } from './foundationsErrors';
import { buildExport } from './exportRun';

export function ExportDialog({
  open,
  title,
  fetchBundle,
  nameFor,
  onClose,
  onDone,
}: {
  open: boolean;
  title: string;
  fetchBundle: (code: string) => Promise<ExportBundle>;
  nameFor: (clientName: string) => string;
  onClose: () => void;
  onDone: (outcome: { ok: boolean }) => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      {open ? <ExportForm fetchBundle={fetchBundle} nameFor={nameFor} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function ExportForm({
  fetchBundle,
  nameFor,
  onClose,
  onDone,
}: {
  fetchBundle: (code: string) => Promise<ExportBundle>;
  nameFor: (clientName: string) => string;
  onClose: () => void;
  onDone: (outcome: { ok: boolean }) => void;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (code.trim() === '') {
      setError(t('dataPage.codeNeeded'));
      return;
    }
    setBusy(true);
    try {
      const built = await buildExport(store, actor, t, clock.now(), () => fetchBundle(code.trim()), nameFor);
      downloadZip(built.bytes, built.filename);
      onDone({ ok: true });
      onClose();
    } catch (err) {
      if (err instanceof RuleError && err.rule === 'wrongCode') setError(t('dataPage.codeWrong'));
      else if (err instanceof RuleError && err.rule === 'stepUpRequired') setError(t('dataPage.codeNeeded'));
      else setError(t('dataPage.exportError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      noValidate
      onSubmit={(e) => {
        void submit(e);
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="export-code" className="font-semibold">
          {t('dataPage.code')}
        </label>
        <input
          id="export-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          className={inputClass}
        />
        <span className="text-sm">{t('dataPage.codeHelp')}</span>
      </div>
      {error ? (
        <p role="alert" className="m-0 font-semibold">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {t('dataPage.download')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('dataPage.cancel')}
        </Button>
      </div>
    </form>
  );
}

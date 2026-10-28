// C3: Export this person (a ZIP for that one person) and Erase or anonymise (BP-19, BP-8). Both need the step-up code.
import { useState, type SyntheticEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button, Dialog } from '@sta/ui';
import { RuleError } from '@sta/data';
import type { Person } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { ExportDialog } from './ExportDialog';
import { inputClass } from './foundationsErrors';
import { fullName } from './queries';

type Mode = 'anonymise' | 'deleteEverything';

function EraseForm({ person, onClose }: { person: Person; onClose: () => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('anonymise');
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = fullName(person);
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (code.trim() === '') {
      setError(t('dataPage.codeNeeded'));
      return;
    }
    setBusy(true);
    try {
      await store.people.erase(actor, person.id, { mode, confirmName: typed, code: code.trim() });
      const notice = t(mode === 'anonymise' ? 'dataPage.erase.anonymised' : 'dataPage.erase.deleted', { name });
      onClose();
      await queryClient.invalidateQueries();
      void navigate('/client/people', { state: { notice } });
    } catch (err) {
      if (err instanceof RuleError && err.rule === 'wrongCode') setError(t('dataPage.codeWrong'));
      else if (err instanceof RuleError && err.rule === 'stepUpRequired') setError(t('dataPage.codeNeeded'));
      else if (err instanceof RuleError && err.rule === 'revokeAccessFirst') setError(t('dataPage.erase.revokeFirst'));
      else if (err instanceof RuleError && err.rule === 'invalidName') setError(t('dataPage.erase.nameWrong'));
      else setError(t('dataPage.erase.error'));
    } finally {
      setBusy(false);
    }
  };
  const radio = (value: Mode, label: string) => (
    <label className="inline-flex min-h-[var(--target-min)] items-center gap-2">
      <input
        type="radio"
        name="erase-mode"
        checked={mode === value}
        onChange={() => {
          setMode(value);
        }}
        className="h-5 w-5 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        void submit(e);
      }}
      className="flex flex-col gap-3"
    >
      <p className="m-0">{t('dataPage.erase.warning')}</p>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="font-semibold">{t('dataPage.erase.mode')}</legend>
        {radio('anonymise', t('dataPage.erase.anonymise'))}
        {radio('deleteEverything', t('dataPage.erase.deleteEverything'))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="erase-name" className="font-semibold">
          {t('dataPage.erase.typeName', { name })}
        </label>
        <input
          id="erase-name"
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
          }}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="erase-code" className="font-semibold">
          {t('dataPage.code')}
        </label>
        <input
          id="erase-code"
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
          {t('dataPage.erase.confirm')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('dataPage.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function PersonDataActions({
  person,
  mayExport,
  mayErase,
}: {
  person: Person;
  mayExport: boolean;
  mayErase: boolean;
}) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [exporting, setExporting] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [ready, setReady] = useState(false);
  if (!mayExport && !mayErase) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {mayExport ? (
        <Button
          variant="secondary"
          onClick={() => {
            setReady(false);
            setExporting(true);
          }}
        >
          {t('dataPage.exportPerson')}
        </Button>
      ) : null}
      {mayErase ? (
        <Button
          variant="secondary"
          onClick={() => {
            setErasing(true);
          }}
        >
          {t('dataPage.erase.button')}
        </Button>
      ) : null}
      {ready ? (
        <p role="status" className="m-0 font-semibold">
          {t('dataPage.ready')}
        </p>
      ) : null}
      <ExportDialog
        open={exporting}
        title={t('dataPage.exportPerson')}
        fetchBundle={(code) => store.exports.person(actor, person.id, code)}
        nameFor={(client) => `${client} ${fullName(person)}`}
        onClose={() => {
          setExporting(false);
        }}
        onDone={() => {
          setReady(true);
        }}
      />
      <Dialog
        open={erasing}
        title={t('dataPage.erase.title', { name: fullName(person) })}
        onClose={() => {
          setErasing(false);
        }}
      >
        {erasing ? (
          <EraseForm
            person={person}
            onClose={() => {
              setErasing(false);
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

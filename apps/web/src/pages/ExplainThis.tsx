// Explain this in simpler words (M3 assumption 44). Staff see the button only when the AI Assistant is on and never a
// locked card or payment wording. Admins, in Preview as a learner, see a calm locked card when it is off.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@sta/ui';
import { holdsAnywhere } from '@sta/domain';
import { addOnIds } from '@sta/content';
import { useActor, useStore, useT } from '../app/hooks';
import { foundationsErrorKey } from './client/foundationsErrors';
import { useFeatures } from './client/billingQueries';
import { RequestAddOnDialog } from './client/billingShared';
import { usePermissions } from './client/queries';

function Explain({ moduleId, lessonId, admin }: { moduleId: string; lessonId: string; admin: boolean }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<{ label: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await store.ai.explain(actor, { moduleId, lessonId }));
      await queryClient.invalidateQueries({ queryKey: ['addOns'] });
    } catch (e) {
      // Staff get one plain sentence; the reason may be about the account.
      setError(t(admin ? foundationsErrorKey(e) : 'ai.staffError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="my-4">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          void run();
        }}
      >
        {t('ai.explainButton')}
      </Button>
      <div aria-live="polite">
        {result ? (
          <Card data-testid="explain-result" className="mt-3">
            <p className="mt-0 mb-1 font-bold">{result.label}</p>
            <p className="m-0">{result.text}</p>
            <p className="mt-2 mb-0 text-sm">{t('ai.basedOn')}</p>
          </Card>
        ) : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function Locked() {
  const t = useT();
  const perms = usePermissions();
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);
  const canTurnOn = perms.data ? holdsAnywhere(perms.data, 'billing.manageAddOns') : false;
  return (
    <>
      <div data-testid="explain-locked" className="my-4">
        <Card>
          <p className="m-0">{t('preview.explainLocked')}</p>
          {perms.data && canTurnOn ? (
            <p className="mt-2 mb-0">
              {t('preview.explainLockedManage')}{' '}
              <a
                href="#/client/billing/add-ons"
                className="inline-flex min-h-[var(--target-min)] items-center font-semibold underline focus-visible:outline-[length:3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              >
                {t('preview.goToAddOns')}
              </a>
            </p>
          ) : null}
          {perms.data && !canTurnOn ? (
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setSent(false);
                  setAsking(true);
                }}
              >
                {t('addOns.request')}
              </Button>
            </div>
          ) : null}
          {sent ? (
            <p role="status" className="mt-3 mb-0 font-semibold">
              {t('preview.requestSent')}
            </p>
          ) : null}
        </Card>
      </div>
      <RequestAddOnDialog
        open={asking}
        addOnId={addOnIds.aiAssistant}
        addOnName="AI Assistant"
        onClose={() => {
          setAsking(false);
        }}
        onSent={() => {
          setSent(true);
        }}
      />
    </>
  );
}

export function ExplainThis({ moduleId, lessonId, admin }: { moduleId: string; lessonId: string; admin: boolean }) {
  const features = useFeatures();
  if (!features.data) return null;
  if (features.data.aiAssistant)
    return <Explain key={lessonId} moduleId={moduleId} lessonId={lessonId} admin={admin} />;
  return admin ? <Locked /> : null;
}

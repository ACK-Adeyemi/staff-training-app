// "Draft from a policy" in the Module Builder (brief 20.7). The paste box, its warning and the Make a draft button.
// The draft is only added to the form; nothing is saved until Save draft. Pasted text is shown as text, never as markup.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@sta/ui';
import { POLICY_MAX_CHARS } from '@sta/domain';
import { useActor, useStore, useT } from '../../../app/hooks';
import { foundationsErrorKey, inputClass } from '../foundationsErrors';
import { Locked } from '../../ExplainThis';
import { useFeatures } from '../billingQueries';
import { addPolicyDraft } from './builderForm';
import { cardClass, labelClass, type Update } from './shared';

export function PolicyDraft({ update }: { update: Update }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const queryClient = useQueryClient();
  const features = useFeatures();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!features.data) return null;
  if (!features.data.aiAssistant) return <Locked testId="draft-locked" messageKey="aiDraft.locked" />;

  const make = async () => {
    setAdded(false);
    if (text.trim() === '') {
      setError(t('aiDraft.empty'));
      return;
    }
    if (text.length > POLICY_MAX_CHARS) {
      setError(t('aiDraft.tooLong'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const draft = await store.ai.draftFromPolicy(actor, { text });
      update((f) => addPolicyDraft(f, draft));
      setText('');
      setAdded(true);
      await queryClient.invalidateQueries({ queryKey: ['addOns'] });
    } catch (e) {
      setError(t(foundationsErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="builder-policy" className={`${cardClass} flex flex-col gap-3`}>
      <h2 id="builder-policy" className="m-0 text-xl font-bold">
        {t('aiDraft.heading')}
      </h2>
      <p className="m-0">{t('aiDraft.intro')}</p>
      <label className={labelClass}>
        {t('aiDraft.pasteLabel')}
        <textarea
          value={text}
          rows={8}
          onChange={(e) => {
            setText(e.target.value);
          }}
          aria-describedby="builder-policy-warning"
          className={`${inputClass} max-w-none py-2`}
        />
      </label>
      <p id="builder-policy-warning" data-testid="ai-policy-warning" className="m-0 font-semibold">
        {t('aiDraft.warning')}
      </p>
      <div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void make();
          }}
        >
          {t('aiDraft.draftButton')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="m-0 font-semibold">
          {error}
        </p>
      ) : null}
      {added ? (
        <p role="status" className="m-0 font-semibold">
          {t('aiDraft.added')}
        </p>
      ) : null}
    </section>
  );
}

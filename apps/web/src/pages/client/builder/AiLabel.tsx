// The label on an AI-drafted lesson or question, with Mark as checked until a person has checked it (brief 20.7).
import { Button } from '@sta/ui';
import { useT } from '../../../app/hooks';
import type { AiCheck } from './shared';

export function AiLabel({
  item,
  kind,
  check,
}: {
  item: { id: string; aiDrafted?: boolean | undefined; aiReviewedBy?: string | undefined };
  kind: 'lesson' | 'question';
  check: AiCheck;
}) {
  const t = useT();
  if (item.aiDrafted !== true) return null;
  const done = item.aiReviewedBy !== undefined;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p data-testid="ai-label" className="m-0 font-semibold">
        {t(done ? 'aiDraft.checked' : 'aiDraft.label')}
      </p>
      {done ? null : (
        <Button
          variant="secondary"
          disabled={check.busy}
          onClick={() => {
            check.mark(kind, item.id);
          }}
        >
          {t('aiDraft.markChecked')}
        </Button>
      )}
    </div>
  );
}

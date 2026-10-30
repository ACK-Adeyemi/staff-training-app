// The right-hand column of the Module Builder: phone preview, publish checklist and the versions list.
import { Button, Icon, PhoneFrame } from '@sta/ui';
import type { Lesson, ModuleVersion } from '@sta/domain';
import type { ChecklistItemId } from '@sta/domain';
import type { MessageKey } from '@sta/content';
import { useT } from '../../../app/hooks';
import { formatLondonDate } from '../../../demo/format';
import { Block } from '../../staff/LessonPlayer';
import { cardClass } from './shared';

export function PhonePreview({
  lessons,
  index,
  onIndex,
}: {
  lessons: Lesson[];
  index: number;
  onIndex: (i: number) => void;
}) {
  const t = useT();
  const at = Math.min(Math.max(index, 0), Math.max(0, lessons.length - 1));
  const lesson = lessons[at];
  return (
    <PhoneFrame title={t('client.builder.previewTitle')}>
      {lesson ? (
        <>
          <h2 className="mt-0 text-xl font-bold">{lesson.title}</h2>
          {lesson.blocks.map((block, i) => (
            <div key={i} className="mb-3">
              <Block block={block} acknowledged={false} onAcknowledge={() => undefined} demoteHeadings />
            </div>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={at === 0}
              onClick={() => {
                onIndex(at - 1);
              }}
            >
              {t('client.builder.previousLesson')}
            </Button>
            <Button
              disabled={at >= lessons.length - 1}
              onClick={() => {
                onIndex(at + 1);
              }}
            >
              {t('client.builder.nextLesson')}
            </Button>
          </div>
        </>
      ) : (
        <p className="m-0">{t('client.builder.previewEmpty')}</p>
      )}
    </PhoneFrame>
  );
}

export function Checklist({
  items,
  aiUnchecked,
}: {
  items: { id: ChecklistItemId; passed: boolean }[];
  aiUnchecked: number;
}) {
  const t = useT();
  return (
    <section aria-labelledby="builder-checklist" className={cardClass}>
      <h2 id="builder-checklist" className="m-0 mb-2 text-xl font-bold">
        {t('client.builder.checklist.heading')}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid="checklist-item"
            data-item-id={item.id}
            data-passed={item.passed ? 'true' : 'false'}
            className="flex items-start gap-2"
          >
            <Icon name={item.passed ? 'check' : 'alert'} size={24} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-bold">
                {t(item.passed ? 'client.builder.checklist.done' : 'client.builder.checklist.todo')}
              </span>
              {': '}
              {t(`client.builder.checklist.${item.id}` as MessageKey)}
            </span>
          </li>
        ))}
      </ul>
      {aiUnchecked > 0 ? (
        <p data-testid="ai-unchecked-message" className="m-0 mt-3 font-semibold">
          {t('aiDraft.uncheckedMessage', { count: aiUnchecked })}
        </p>
      ) : null}
    </section>
  );
}

export function Versions({
  current,
  earlier,
}: {
  current: number;
  /** Snapshots, oldest first (as authoring.versions returns them). */
  earlier: ModuleVersion[];
}) {
  const t = useT();
  return (
    <section aria-labelledby="builder-versions" className={cardClass}>
      <h2 id="builder-versions" className="m-0 mb-2 text-xl font-bold">
        {t('client.builder.versionsHeading')}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        <li data-testid="version-row">{t('client.builder.versionCurrent', { version: current })}</li>
        {[...earlier].reverse().map((v) => (
          <li key={v.key} data-testid="version-row">
            {t('client.builder.versionEarlier', { version: v.version, date: formatLondonDate(v.publishedAt) })}
          </li>
        ))}
      </ul>
    </section>
  );
}

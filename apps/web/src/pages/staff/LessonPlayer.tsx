import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Markdown, PageHeader, Stepper } from '@sta/ui';
import type { ContentBlock, Lesson, Module } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { ExplainThis } from '../ExplainThis';
import { LearnMoreGroups } from './LearnMoreList';
import { ReadAloud } from './ReadAloud';
import { LearningFrame } from './LearningFrame';
import { NoteSheet, NotesButton } from './Notes';
import { focusLink } from './styles';

export function Block({
  block,
  acknowledged,
  onAcknowledge,
}: {
  block: ContentBlock;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const t = useT();
  switch (block.kind) {
    case 'text':
      return <Markdown source={block.markdown} />;
    case 'keyPoints':
      return (
        <ul className="list-disc ps-6">
          {block.items.map((item, i) => (
            <li key={i} className="mb-1">
              {item}
            </li>
          ))}
        </ul>
      );
    case 'callout':
      return (
        <div className="rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <p className="mt-0 mb-1 font-bold">
            {block.tone === 'warning' ? t('staff.lesson.calloutWarning') : t('staff.lesson.calloutInfo')}
          </p>
          <Markdown source={block.markdown} />
        </div>
      );
    case 'image':
      return <p className="italic">{t('staff.lesson.image', { alt: block.alt })}</p>;
    case 'acknowledge':
      return (
        <label className="flex min-h-[var(--target-min)] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] p-3 has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => {
              onAcknowledge(e.target.checked);
            }}
            className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
          />
          <span>{block.statement}</span>
        </label>
      );
  }
}

/** What a block says, for Read aloud. */
function blockText(block: ContentBlock | undefined): string {
  if (!block) return '';
  switch (block.kind) {
    case 'text':
      return block.markdown;
    case 'keyPoints':
      return block.items.join('. ');
    case 'callout':
      return block.markdown;
    case 'acknowledge':
      return block.statement;
    case 'image':
      return block.alt;
  }
}

function Player({ module, lesson, organisationName }: { module: Module; lesson: Lesson; organisationName: string }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const moduleId = module.id;
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState(0);
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const total = lesson.blocks.length;
  const block = lesson.blocks[step];
  const last = step >= total - 1;
  const blocked = block?.kind === 'acknowledge' && !ticked[step];

  const finish = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await store.learning.recordLesson(actor, { moduleId, lessonId: lesson.id, kind: 'completed' });
      // Refresh first, so the overview never shows the old progress and offers a lesson that is already done.
      await queryClient.invalidateQueries({ queryKey: ['learning'] });
      await navigate(`/staff/module/${moduleId}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={lesson.title} />
      <Stepper
        current={step + 1}
        total={total}
        label={t('staff.lesson.step', { current: step + 1, total })}
        progressLabel={t('staff.lesson.progress')}
      />
      <div className="mt-4">
        <ReadAloud text={blockText(block)} />
      </div>
      <div className="my-4 min-h-40">
        {block ? (
          <Block
            block={block}
            acknowledged={ticked[step] === true}
            onAcknowledge={(v) => {
              setTicked((s) => ({ ...s, [step]: v }));
            }}
          />
        ) : null}
        {last && lesson.furtherReading ? (
          <LearnMoreGroups
            official={lesson.furtherReading}
            organisation={[]}
            organisationName={organisationName}
            onOpen={(l) => {
              void store.learning
                .learnMoreOpened(actor, { moduleId, lessonId: lesson.id, linkId: l.id })
                .catch(() => undefined);
            }}
          />
        ) : null}
      </div>
      <ExplainThis moduleId={moduleId} lessonId={lesson.id} admin={false} />
      {failed ? <p role="alert">{t('staff.lesson.saveError')}</p> : null}
      <div className="flex gap-3">
        <Button
          variant="secondary"
          disabled={step === 0}
          onClick={() => {
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          {t('staff.lesson.back')}
        </Button>
        {last ? (
          <Button
            disabled={blocked || busy}
            onClick={() => {
              void finish();
            }}
          >
            {t('staff.lesson.finish')}
          </Button>
        ) : (
          <Button
            disabled={blocked}
            onClick={() => {
              setStep((s) => Math.min(total - 1, s + 1));
            }}
          >
            {t('staff.lesson.next')}
          </Button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            setAdding(true);
          }}
        >
          {t('notes.add')}
        </Button>
        <NotesButton module={module} />
      </div>
      <NoteSheet
        module={module}
        target={adding ? { lessonId: lesson.id } : null}
        onClose={() => {
          setAdding(false);
        }}
      />
      <p className="mt-4">
        <a
          href={`#/staff/module/${moduleId}`}
          className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}
        >
          {t('staff.module.back')}
        </a>
      </p>
    </>
  );
}

/** S5. */
export function LessonPlayer() {
  const t = useT();
  const { lessonId } = useParams();
  return (
    <LearningFrame>
      {({ module, client }) => {
        const lesson = module.lessons.find((l) => l.id === lessonId);
        if (!lesson) {
          return (
            <>
              <PageHeader title={t('staff.module.notFoundTitle')} />
              <p role="alert">{t('staff.lesson.notFound')}</p>
            </>
          );
        }
        return <Player key={lesson.id} module={module} lesson={lesson} organisationName={client.displayName} />;
      }}
    </LearningFrame>
  );
}

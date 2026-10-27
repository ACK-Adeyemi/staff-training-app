// C6 Preview as a learner (minimal; the module library arrives in chunk 15): one lesson in a phone-sized frame, with
// Explain this in simpler words so an admin can see what learners will see.
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PhoneFrame } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { ExplainThis } from '../ExplainThis';
import { Block } from '../staff/LessonPlayer';
import { foundationsErrorKey } from './foundationsErrors';
import { PermissionGate } from './PermissionGate';

function PreviewBody() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { moduleId = '', lessonId = '' } = useParams();
  const q = useQuery({
    queryKey: ['modulePreview', actor.userId, moduleId],
    queryFn: () => store.modules.get(actor, moduleId),
  });
  if (q.isError) return <p role="alert">{t(foundationsErrorKey(q.error))}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const lesson = q.data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return <p role="alert">{t('preview.notFound')}</p>;
  return (
    <>
      <PageHeader title={t('preview.title')} />
      <p className="mt-0">{t('preview.intro')}</p>
      <PhoneFrame title={t('preview.lessonTitle', { title: lesson.title })}>
        <h2 className="mt-0 text-xl font-bold">{lesson.title}</h2>
        {lesson.blocks.map((block, i) => (
          <div key={i} className="mb-3">
            <Block block={block} acknowledged={false} onAcknowledge={() => undefined} />
          </div>
        ))}
        <ExplainThis moduleId={q.data.id} lessonId={lesson.id} admin />
      </PhoneFrame>
    </>
  );
}

export function ModulePreview() {
  return (
    <PermissionGate permission="modules.view" message="errors.forbidden" anyScope>
      <PreviewBody />
    </PermissionGate>
  );
}

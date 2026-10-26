import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { Markdown, PageHeader } from '@sta/ui';
import { useActor, useStore, useT } from '../../app/hooks';
import { focusLink } from '../staff/styles';

/** An organisation document (such as a policy), read through the data layer. Own organisation only. */
export function OrgDoc() {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const { attachmentId = '' } = useParams();
  const q = useQuery({
    queryKey: ['attachment', actor.userId, attachmentId],
    queryFn: () => store.attachments.get(actor, attachmentId),
  });
  return (
    <main className="mx-auto max-w-2xl p-4">
      {q.isError || (q.data && q.data.kind !== 'document') ? (
        <>
          <PageHeader title={t('doc.notFoundTitle')} />
          <p role="alert">{t('doc.notFound')}</p>
        </>
      ) : q.data?.kind === 'document' ? (
        <>
          <PageHeader title={q.data.title} />
          <Markdown source={q.data.body} />
        </>
      ) : (
        <p>{t('shell.loading')}</p>
      )}
      <p className="mt-6">
        <a href="#/staff" className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}>
          {t('doc.back')}
        </a>
      </p>
    </main>
  );
}

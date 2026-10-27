// C7 Module Builder at /client/modules/new and /client/modules/:id/edit. An own module is edited here (paste Markdown,
// questions, settings, links, phone preview, checklist, versions, publish). A provider module is read only and only
// takes the client's own links (BP-1 to BP-3). Rules come from @sta/domain and the data layer.
import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@sta/ui';
import { holdsAnywhere } from '@sta/domain';
import { useActor, useStore, useT } from '../../app/hooks';
import { foundationsErrorKey } from './foundationsErrors';
import { usePermissions } from './queries';
import { loadBuilder } from './builder/builderData';
import { BuilderEditor } from './builder/BuilderEditor';
import { ProviderLinks } from './builder/ProviderLinks';
import { focusLink } from '../staff/styles';

const backClass = `inline-flex min-h-[var(--target-min)] items-center font-semibold text-[var(--color-accent)] underline ${focusLink}`;

function BuilderLoader({ initialId, onCreated }: { initialId: string | undefined; onCreated: (id: string) => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const perms = usePermissions();
  const q = useQuery({
    queryKey: ['moduleBuilder', actor.userId, initialId ?? 'new'],
    queryFn: () => loadBuilder(store, actor, initialId),
    // The form is filled in once from this; a refetch must never replace what the author is typing.
    staleTime: Infinity,
    gcTime: 0,
  });
  const heading = (
    <PageHeader title={t('client.builder.title')}>
      <a href="#/client/modules" className={backClass}>
        {t('client.builder.backToLibrary')}
      </a>
    </PageHeader>
  );
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  if (initialId === undefined && !holdsAnywhere(perms.data, 'modules.manage')) {
    return <p role="alert">{t('errors.forbidden')}</p>;
  }
  if (q.isError) return <p role="alert">{t(foundationsErrorKey(q.error))}</p>;
  if (!q.data) return <p>{t('shell.loading')}</p>;
  const data = q.data;
  const provider = data.module !== null && data.module.owner === 'provider';
  if (!holdsAnywhere(perms.data, provider ? 'modules.addLinks' : 'modules.manage')) {
    return <p role="alert">{t('errors.forbidden')}</p>;
  }
  return (
    <>
      {heading}
      {provider && data.module ? (
        <ProviderLinks module={data.module} initial={data.overlays} />
      ) : (
        <BuilderEditor data={data} onCreated={onCreated} />
      )}
    </>
  );
}

export function ModuleBuilder() {
  const { moduleId } = useParams();
  // After the first Save draft the address becomes .../:id/edit. That must not reset the page, so the key only
  // changes when the address names a different module than the one this page created.
  const [session, setSession] = useState<{ param: string | undefined; key: number; created: string | null }>({
    param: moduleId,
    key: 0,
    created: null,
  });
  let current = session;
  if (moduleId !== session.param) {
    current =
      moduleId !== undefined && moduleId === session.created
        ? { ...session, param: moduleId }
        : { param: moduleId, key: session.key + 1, created: null };
    setSession(current);
  }
  return (
    <BuilderLoader
      key={current.key}
      initialId={current.created === null ? moduleId : undefined}
      onCreated={(id) => {
        setSession((s) => ({ ...s, created: id }));
      }}
    />
  );
}

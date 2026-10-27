// A provider module in the builder: read only, with the Add our own links panels. Links save as overlays at once and
// never change the module itself (BP-1, BP-3).
import { useState } from 'react';
import { Button } from '@sta/ui';
import type { ClientLinkOverlay, LearnMoreLink, Module } from '@sta/domain';
import type { LinkInput } from '@sta/data';
import { useActor, useStore, useT } from '../../../app/hooks';
import { foundationsErrorKey } from '../foundationsErrors';
import { freshKey } from './builderForm';
import { LinkPanel, type NewLink, type PanelLink } from './LinkPanel';
import { cardClass } from './shared';

const inputOf = (l: LearnMoreLink): LinkInput =>
  l.url !== undefined
    ? { id: l.id, title: l.title, url: l.url }
    : { id: l.id, title: l.title, attachmentId: l.attachmentId ?? '' };

const panelLinks = (links: LearnMoreLink[]): PanelLink[] =>
  links.map((l) => ({ id: l.id, title: l.title, isPdf: l.attachmentId !== undefined }));

export function ProviderLinks({ module, initial }: { module: Module; initial: ClientLinkOverlay[] }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const [overlays, setOverlays] = useState<ClientLinkOverlay[]>(initial);
  const [error, setError] = useState<string | null>(null);

  const lessonIds = new Set(module.lessons.map((l) => l.id));
  const questionIds = new Set(module.questions.map((q) => q.id));
  const forTarget = (kind: 'lesson' | 'question', id: string): ClientLinkOverlay | undefined =>
    overlays.find((o) => (kind === 'lesson' ? o.lessonId === id : o.questionId === id));
  const orphans = overlays.filter((o) =>
    o.lessonId !== undefined ? !lessonIds.has(o.lessonId) : !questionIds.has(o.questionId ?? ''),
  );

  const replace = (saved: ClientLinkOverlay) => {
    setOverlays((all) => [...all.filter((o) => o.id !== saved.id), saved]);
  };
  const drop = (id: string) => {
    setOverlays((all) => all.filter((o) => o.id !== id));
  };
  const target = (kind: 'lesson' | 'question', id: string) =>
    kind === 'lesson' ? { lessonId: id } : { questionId: id };

  const add = async (kind: 'lesson' | 'question', id: string, link: NewLink) => {
    const existing = forTarget(kind, id);
    const used = new Set(overlays.flatMap((o) => o.links.map((l) => l.id)));
    const next: LinkInput = { id: freshKey('link', used), ...link };
    const saved = await store.linkOverlays.save(actor, {
      moduleId: module.id,
      ...target(kind, id),
      links: [...(existing?.links ?? []).map(inputOf), next],
    });
    replace(saved);
  };
  const remove = async (kind: 'lesson' | 'question', id: string, linkId: string) => {
    const existing = forTarget(kind, id);
    if (!existing) return;
    const rest = existing.links.filter((l) => l.id !== linkId);
    if (rest.length === 0) {
      await store.linkOverlays.remove(actor, existing.id);
      drop(existing.id);
      return;
    }
    replace(
      await store.linkOverlays.save(actor, {
        moduleId: module.id,
        ...target(kind, id),
        links: rest.map(inputOf),
      }),
    );
  };
  const removeOrphan = async (o: ClientLinkOverlay) => {
    setError(null);
    try {
      await store.linkOverlays.remove(actor, o.id);
      drop(o.id);
    } catch (e) {
      setError(t(foundationsErrorKey(e)));
    }
  };

  return (
    <>
      <p className="mt-0">{t('client.builder.readOnly')}</p>
      <section aria-labelledby="builder-overlay" className="flex flex-col gap-3">
        <h2 id="builder-overlay" className="m-0 text-xl font-bold">
          {t('client.builder.overlayHeading')}
        </h2>
        <p className="m-0">{t('client.builder.overlayIntro')}</p>
        {module.lessons.map((l) => (
          <LinkPanel
            key={l.id}
            kind="lesson"
            targetId={l.id}
            name={l.title}
            links={panelLinks(forTarget('lesson', l.id)?.links ?? [])}
            onAdd={(link) => add('lesson', l.id, link)}
            onRemove={(linkId) => remove('lesson', l.id, linkId)}
          />
        ))}
        {module.questions.map((q) => (
          <LinkPanel
            key={q.id}
            kind="question"
            targetId={q.id}
            name={q.prompt}
            links={panelLinks(forTarget('question', q.id)?.links ?? [])}
            onAdd={(link) => add('question', q.id, link)}
            onRemove={(linkId) => remove('question', q.id, linkId)}
          />
        ))}
      </section>
      {orphans.length > 0 ? (
        <section aria-labelledby="builder-orphans" className="mt-4 flex flex-col gap-3">
          <h2 id="builder-orphans" className="m-0 text-xl font-bold">
            {t('client.builder.orphansHeading')}
          </h2>
          <p className="m-0">{t('client.builder.orphansIntro')}</p>
          {error ? <p role="alert">{error}</p> : null}
          {orphans.map((o) => (
            <div
              key={o.id}
              data-testid="orphan-overlay"
              className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}
            >
              <span>{o.links.map((l) => l.title).join(', ')}</span>
              <Button
                variant="secondary"
                onClick={() => {
                  void removeOrphan(o);
                }}
              >
                {t('client.builder.orphanRemove')}
              </Button>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

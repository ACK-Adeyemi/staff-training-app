// The editor for an own module: the form, Save draft, the publish choice, and the right-hand column.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog } from '@sta/ui';
import { addDays, publishChecklist, type LearnMoreLink, type Module, type ModuleVersion } from '@sta/domain';
import { RuleError } from '@sta/data';
import { useActor, useClock, useStore, useT } from '../../../app/hooks';
import { foundationsErrorKey, inputClass } from '../foundationsErrors';
import type { BuilderData } from './builderData';
import {
  effectiveQuiz,
  emptyForm,
  formFromModule,
  freshLinkKey,
  inputOf,
  moduleOf,
  setLessonLinks,
  setQuestionLinks,
  type Form,
} from './builderForm';
import { LessonsSection } from './LessonsSection';
import { QuestionsSection } from './QuestionsSection';
import { SettingsSection } from './SettingsSection';
import { Checklist, PhonePreview, Versions } from './SidePanels';
import { labelClass, type OwnLinks, type Update } from './shared';

type Message =
  { kind: 'saved' } | { kind: 'published' } | { kind: 'assigned'; count: number } | { kind: 'error'; text: string };

const ASSIGN_DAYS = 30;

export function BuilderEditor({ data, onCreated }: { data: BuilderData; onCreated: (id: string) => void }) {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const clock = useClock();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const source = data.draft?.module ?? data.module;
  const [form, setForm] = useState<Form>(() => (source ? formFromModule(source, data.categoryId) : emptyForm()));
  const [base, setBase] = useState<Module | null>(source);
  const [savedCategory, setSavedCategory] = useState(data.categoryId);
  const [earlier, setEarlier] = useState<ModuleVersion[]>(data.versions);
  const [previewIndex, setPreviewIndex] = useState(() => {
    const n = Number.parseInt(params.get('lesson') ?? '', 10);
    return Number.isNaN(n) || n < 1 ? 0 : n - 1;
  });
  const [message, setMessage] = useState<Message | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reassign, setReassign] = useState(false);
  const [busy, setBusy] = useState(false);

  const update: Update = (change) => {
    setForm(change);
  };
  const quiz = effectiveQuiz(form);
  const checklist = useMemo(
    () => publishChecklist(moduleOf(form, base), data.requirements),
    [form, base, data.requirements],
  );
  const nextVersion = base && base.status === 'published' ? base.version + 1 : 1;

  const links: OwnLinks = {
    of: (list) => (list ?? []).map((l) => ({ id: l.id, title: l.title, isPdf: l.attachmentId !== undefined })),
    add: (kind, targetId, link) => {
      update((f) => {
        const made: LearnMoreLink = {
          id: freshLinkKey(f),
          title: link.title,
          ...('url' in link ? { url: link.url } : { attachmentId: link.attachmentId }),
          publisher: data.clientName,
          kind: 'organisation',
          language: base?.language ?? 'en-GB',
          showFor: f.quiz.learnMoreFor,
        };
        if (kind === 'lesson') {
          const lesson = f.lessons.find((l) => l.id === targetId);
          return setLessonLinks(f, targetId, [...(lesson?.furtherReading ?? []), made]);
        }
        const question = f.questions.find((q) => q.id === targetId);
        return setQuestionLinks(f, targetId, [...(question?.learnMore ?? []), made]);
      });
    },
    remove: (kind, targetId, linkId) => {
      update((f) => {
        if (kind === 'lesson') {
          const lesson = f.lessons.find((l) => l.id === targetId);
          return setLessonLinks(
            f,
            targetId,
            (lesson?.furtherReading ?? []).filter((l) => l.id !== linkId),
          );
        }
        const question = f.questions.find((q) => q.id === targetId);
        return setQuestionLinks(
          f,
          targetId,
          (question?.learnMore ?? []).filter((l) => l.id !== linkId),
        );
      });
    },
  };

  /** Creates the module the first time, saves the draft after, and files it in its category. */
  const persist = async (): Promise<Module> => {
    const input = inputOf(form, base);
    let saved: Module;
    if (base === null || base.owner === 'provider') {
      saved = await store.authoring.create(actor, input);
      onCreated(saved.id);
      void navigate(`/client/modules/${saved.id}/edit`, { replace: true });
    } else {
      saved = await store.authoring.saveDraft(actor, base.id, input);
    }
    if (form.categoryId !== savedCategory) {
      await store.modulePlacements.setCategory(actor, {
        moduleIds: [saved.id],
        ...(form.categoryId === '' ? {} : { categoryId: form.categoryId }),
      });
      setSavedCategory(form.categoryId);
    }
    setBase(saved);
    return saved;
  };

  const refreshOthers = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'moduleBuilder' });

  const run = async (work: () => Promise<Message | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await work());
      await refreshOthers();
    } catch (e) {
      setConfirming(false);
      setMessage({ kind: 'error', text: t(foundationsErrorKey(e)) });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = () =>
    run(async () => {
      await persist();
      return { kind: 'saved' };
    });

  const askToPublish = () => {
    if (!checklist.ok) {
      setMessage({ kind: 'error', text: t('errors.rule.checklistFailed') });
      return;
    }
    setMessage(null);
    setReassign(false);
    setConfirming(true);
  };

  const publish = () =>
    run(async () => {
      const saved = await persist();
      try {
        const result = await store.authoring.publish(actor, saved.id, { reassign });
        setBase(result.module);
        setEarlier(await store.authoring.versions(actor, saved.id));
        setConfirming(false);
        return { kind: 'published' };
      } catch (e) {
        if (e instanceof RuleError) setConfirming(false);
        throw e;
      }
    });

  const assignAll = () =>
    run(async () => {
      if (!base) return null;
      const people = await store.people.list(actor);
      const result = await store.assignments.assign(actor, {
        moduleId: base.id,
        personIds: people.filter((p) => p.status === 'active').map((p) => p.id),
        dueAt: addDays(clock.now(), ASSIGN_DAYS).toISOString(),
      });
      return { kind: 'assigned', count: result.created.length };
    });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <label className={labelClass}>
          {t('client.builder.titleField')}
          <input
            type="text"
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              update((f) => ({ ...f, title }));
            }}
            className={`${inputClass} max-w-none`}
          />
        </label>
        <label className={labelClass}>
          {t('client.builder.description')}
          <textarea
            value={form.description}
            rows={3}
            onChange={(e) => {
              const description = e.target.value;
              update((f) => ({ ...f, description }));
            }}
            className={`${inputClass} max-w-none py-2`}
          />
        </label>
        <LessonsSection form={form} update={update} links={links} onShow={setPreviewIndex} />
        <QuestionsSection form={form} update={update} links={links} />
        <SettingsSection
          form={form}
          quiz={quiz}
          update={update}
          jobRoles={data.jobRoles}
          requirements={data.requirements}
          categories={data.categories}
        />
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => void saveDraft()}>
              {t('client.builder.saveDraft')}
            </Button>
            <Button disabled={busy} onClick={askToPublish}>
              {t('client.builder.publish')}
            </Button>
          </div>
          {message?.kind === 'error' ? (
            <p role="alert" className="m-0 font-semibold">
              {message.text}
            </p>
          ) : null}
          {message && message.kind !== 'error' ? (
            <div role="status" className="flex flex-wrap items-center gap-3">
              <p className="m-0 font-semibold">
                {message.kind === 'saved'
                  ? t('client.builder.saved')
                  : message.kind === 'published'
                    ? t('client.builder.published')
                    : message.count === 1
                      ? t('client.builder.assignedOne')
                      : t('client.builder.assigned', { count: message.count })}
              </p>
              {message.kind === 'published' ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    void assignAll();
                  }}
                >
                  {t('client.builder.assignAll')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <PhonePreview lessons={form.lessons} index={previewIndex} onIndex={setPreviewIndex} />
        <Checklist items={checklist.items} />
        {base && (base.status === 'published' || earlier.length > 0) ? (
          <Versions current={base.version} earlier={earlier} />
        ) : null}
      </aside>
      <Dialog
        open={confirming}
        title={t('client.builder.publishAs', { version: nextVersion })}
        onClose={() => {
          setConfirming(false);
        }}
      >
        {nextVersion > 1 ? (
          <label className="mb-4 flex min-h-[var(--target-min)] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={reassign}
              onChange={(e) => {
                setReassign(e.target.checked);
              }}
              className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
            />
            {t('client.builder.reassign', { previous: nextVersion - 1 })}
          </label>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void publish()}>
            {t('client.builder.publishNow')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setConfirming(false);
            }}
          >
            {t('client.builder.cancel')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

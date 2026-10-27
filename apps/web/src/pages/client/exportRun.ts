// Runs an export through the data layer and builds the ZIP on the device. Certificate files are read with the actor's
// own attachment access, so a file they may not see is simply left out.
import type { ActorContext, DataStore, ExportBundle } from '@sta/data';
import type { TFunction } from '@sta/content';
import { exportFileNames } from '@sta/domain';
import { buildExportZip, type ExportFile } from '../../app/zip';

async function certificateFiles(store: DataStore, actor: ActorContext, bundle: ExportBundle): Promise<ExportFile[]> {
  const wanted = new Map<string, Omit<ExportFile, 'mime' | 'bytes'>>();
  for (const s of bundle.evidenceSubmissions) {
    if (s.status !== 'approved') continue;
    wanted.set(s.fileAttachmentId, {
      submissionId: s.id,
      ...(s.evidenceId ? { evidenceId: s.evidenceId } : {}),
      personId: s.personId,
      requirementId: s.requirementId,
      completedAt: s.completedAt,
    });
  }
  for (const e of bundle.evidence) {
    if (!e.attachmentId || wanted.has(e.attachmentId)) continue;
    wanted.set(e.attachmentId, {
      evidenceId: e.id,
      personId: e.personId,
      requirementId: e.requirementId,
      completedAt: e.completedAt,
    });
  }
  const files: ExportFile[] = [];
  for (const [id, info] of wanted) {
    try {
      const a = await store.attachments.get(actor, id);
      if (a.kind === 'file') files.push({ ...info, mime: a.mime, bytes: a.data });
    } catch {
      // Not readable by this person (or already removed): left out of the export.
    }
  }
  return files;
}

/** Fetches the bundle with the step-up code and returns the ZIP bytes and its file name. */
export async function buildExport(
  store: DataStore,
  actor: ActorContext,
  t: TFunction,
  now: Date,
  fetchBundle: () => Promise<ExportBundle>,
  nameFor: (clientName: string) => string,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const bundle = await fetchBundle();
  const client = await store.clients.get(actor, actor.clientId ?? '');
  const label = nameFor(client.displayName);
  return {
    bytes: buildExportZip({
      bundle,
      files: await certificateFiles(store, actor, bundle),
      clientName: client.displayName,
      amberWindowDays: client.settings.amberWindowDays,
      now,
      t,
    }),
    filename: exportFileNames(now, label).zip,
  };
}

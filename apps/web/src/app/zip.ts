// Builds the export ZIP on the device with fflate and hands it to the browser as a download (plan: Web app design for
// app/zip.ts; M3 assumption 48). The data layer returns the records; nothing here touches the network or storage.
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { ExportBundle } from '@sta/data';
import type { MessageKey, TFunction } from '@sta/content';
import {
  certificateFileName,
  exportFileNames,
  matrixCsv,
  personRequirementRows,
  toCsv,
  trainingMatrix,
  londonDateString,
  type CsvCell,
  type CsvColumn,
  type Person,
} from '@sta/domain';

/** A certificate file read through the data layer. */
export type ExportFile = {
  evidenceId?: string;
  submissionId?: string;
  personId: string;
  requirementId: string;
  completedAt: string;
  mime: string;
  bytes: Uint8Array;
};

export type ZipInput = {
  bundle: ExportBundle;
  files: ExportFile[];
  clientName: string;
  amberWindowDays: number;
  now: Date;
  t: TFunction;
};

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A name not used yet: `a.pdf` then `a-2.pdf`, `a-3.pdf`. */
function unique(taken: Set<string>, name: string): string {
  let out = name;
  const dot = name.lastIndexOf('.');
  for (let n = 2; taken.has(out); n += 1) out = `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
  taken.add(out);
  return out;
}

const day = (iso: string | undefined): string => (iso ? londonDateString(new Date(iso)) : '');

export function buildExportZip(input: ZipInput): Uint8Array {
  const { bundle, t, now } = input;
  const names = exportFileNames(now, input.clientName);
  const k = (key: string): string => t(`dataPage.csv.${key}` as MessageKey);
  const col = (key: string): CsvColumn => ({ key, header: k(key) });
  const sites = new Map(bundle.sites.map((s) => [s.id, s.name]));
  const requirements = new Map(bundle.requirements.map((r) => [r.id, r.name]));
  const modules = new Map(bundle.modules.map((m) => [m.id, m.title]));
  const people = new Map(bundle.people.map((p) => [p.id, p]));
  const personName = (id: string): string => {
    const p = people.get(id);
    return p ? `${p.firstName} ${p.lastName}` : '';
  };
  const yesNo = (v: boolean | undefined): string => (v === undefined ? '' : k(v ? 'yes' : 'no'));

  // Certificate files first, so evidence.csv can name them.
  const taken = new Set<string>();
  const zippable: Zippable = {};
  const fileNameFor = new Map<string, string>();
  for (const f of input.files) {
    const p = people.get(f.personId);
    const path = unique(
      taken,
      `${names.certificatesDir}${certificateFileName({
        surname: p?.lastName ?? '',
        firstName: p?.firstName ?? '',
        requirement: requirements.get(f.requirementId) ?? '',
        date: f.completedAt,
        ext: EXT[f.mime] ?? 'bin',
      })}`,
    );
    zippable[path] = [f.bytes, { level: 0 }];
    if (f.evidenceId) fileNameFor.set(f.evidenceId, path);
    if (f.submissionId) fileNameFor.set(f.submissionId, path);
  }

  for (const e of bundle.evidence.filter((x) => x.kind === 'module')) {
    const p = people.get(e.personId);
    const requirement = requirements.get(e.requirementId) ?? '';
    const path = unique(
      taken,
      `${names.moduleCertificatesDir}${certificateFileName({
        surname: p?.lastName ?? '',
        firstName: p?.firstName ?? '',
        requirement,
        date: e.completedAt,
        ext: 'html',
      })}`,
    );
    const body = [
      t('dataPage.moduleCertificate.line', {
        name: personName(e.personId),
        module: (e.moduleId ? modules.get(e.moduleId) : undefined) ?? t('dataPage.moduleCertificate.fallbackModule'),
        requirement,
        date: day(e.completedAt),
      }),
      t('dataPage.moduleCertificate.issuedBy', { client: input.clientName }),
    ];
    const heading = escapeHtml(t('dataPage.moduleCertificate.heading'));
    const html =
      `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${heading}</title></head><body>` +
      `<h1>${heading}</h1>${body.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</body></html>`;
    zippable[path] = [strToU8(html), { level: 6 }];
    fileNameFor.set(e.id, path);
  }

  const text = (name: string, content: string): void => {
    zippable[name] = [strToU8(content), { level: 6 }];
  };
  const csv = (columns: CsvColumn[], rows: Record<string, CsvCell>[]): string => toCsv(columns, rows);

  text(
    names.people,
    csv(
      ['id', 'firstName', 'lastName', 'site', 'status', 'startDate', 'leftDate'].map(col),
      bundle.people.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        site: sites.get(p.primarySiteId) ?? '',
        status: p.status,
        startDate: day(p.startDate),
        leftDate: day(p.leftDate),
      })),
    ),
  );

  // The people here carry no display preferences; the status rules do not read them.
  const view = {
    people: bundle.people as Person[],
    sites: bundle.sites,
    requirements: bundle.requirements,
    evidence: bundle.evidence,
    submissions: bundle.evidenceSubmissions,
    now,
    amberWindowDays: input.amberWindowDays,
  };
  text(
    names.requirementsStatus,
    csv(
      ['person', 'requirement', 'status', 'expires'].map(col),
      bundle.people.flatMap((p) =>
        personRequirementRows(view, p as Person).map((r) => ({
          person: `${p.firstName} ${p.lastName}`,
          requirement: r.requirement.name,
          status: t(`status.${r.status}` as MessageKey),
          expires: day(r.expiresAt),
        })),
      ),
    ),
  );

  text(
    names.evidence,
    csv(
      ['id', 'person', 'requirement', 'kind', 'completed', 'expires', 'approved', 'file'].map(col),
      bundle.evidence.map((e) => ({
        id: e.id,
        person: personName(e.personId),
        requirement: requirements.get(e.requirementId) ?? '',
        kind: k(e.kind === 'module' ? 'kindModule' : 'kindExternal'),
        completed: day(e.completedAt),
        expires: day(e.expiresAt),
        approved: day(e.approvedAt),
        file: fileNameFor.get(e.id) ?? (e.submissionId ? fileNameFor.get(e.submissionId) : undefined) ?? '',
      })),
    ),
  );

  text(
    names.assignments,
    csv(
      ['id', 'person', 'module', 'assigned', 'due', 'status'].map(col),
      bundle.assignments.map((a) => ({
        id: a.id,
        person: personName(a.personId),
        module: 'moduleId' in a.target ? (modules.get(a.target.moduleId) ?? '') : '',
        assigned: day(a.createdAt),
        due: day(a.dueAt),
        status: a.status,
      })),
    ),
  );

  text(
    names.attempts,
    csv(
      ['id', 'person', 'module', 'started', 'finished', 'score', 'passed'].map(col),
      bundle.attempts.map((a) => ({
        id: a.id,
        person: personName(a.personId),
        module: modules.get(a.moduleId) ?? '',
        started: day(a.startedAt),
        finished: day(a.finishedAt),
        score: a.score,
        passed: yesNo(a.passed),
      })),
    ),
  );

  text(
    names.trainingMatrix,
    matrixCsv(
      trainingMatrix({
        people: bundle.people as Person[],
        requirements: bundle.requirements,
        evidence: bundle.evidence,
        submissions: bundle.evidenceSubmissions,
        teams: bundle.teams,
        sites: bundle.sites,
        now,
        amberWindowDays: input.amberWindowDays,
      }),
      (key) => t(key as MessageKey),
    ),
  );

  text(names.data, JSON.stringify(bundle, null, 2));

  const readme = [
    t('dataPage.readme.title', { client: input.clientName }),
    t('dataPage.readme.date', { date: day(bundle.exportedAt) }),
    '',
    t('dataPage.readme.included'),
    ...(
      ['people', 'requirements', 'evidence', 'assignments', 'attempts', 'matrix', 'data', 'certificates'] as const
    ).map((key) => `- ${t(`dataPage.readme.${key}`)}`),
    ...(bundle.evidence.some((e) => e.kind === 'module') ? [`- ${t('dataPage.readme.moduleCertificates')}`] : []),
    '',
    t('dataPage.readme.left'),
    ...(bundle.formerlyNote
      ? [t('dataPage.readme.formerly', { old: bundle.formerlyNote.old, date: day(bundle.formerlyNote.changedAt) })]
      : []),
  ];
  text(names.readme, readme.join('\r\n') + '\r\n');

  return zipSync(zippable);
}

/** Hands bytes to the browser as a file download (blob URL on an anchor with `download`). */
export function downloadZip(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

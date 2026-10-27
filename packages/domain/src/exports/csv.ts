// Generic CSV for the export ZIP and the file names inside it (brief 24.6; M3 assumption 48).
// Pure functions: the caller passes the date. The formula guard is shared with the training matrix export.
import { londonDateString } from '../dates';

/** Stop spreadsheets running a cell as a formula. */
export const csvGuard = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const quote = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** Guard then quote one text cell. */
export const csvField = (s: string): string => quote(csvGuard(s));

export type CsvColumn = { key: string; header: string };
export type CsvCell = string | number | boolean | null | undefined;

/** `footer` is an optional last line of text, such as the "formerly" note. */
export function toCsv(columns: CsvColumn[], rows: Record<string, CsvCell>[], footer?: string): string {
  const cell = (v: CsvCell): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return csvField(v);
    return String(v);
  };
  const lines = [columns.map((c) => csvField(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  if (footer) lines.push(csvField(footer));
  return lines.join('\r\n') + '\r\n';
}

/** Lower case a-z, 0-9 and single hyphens only. */
function slug(text: string, fallback: string): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

export function exportFileNames(now: Date, clientName: string) {
  return {
    zip: `${slug(clientName, 'organisation')}-export-${londonDateString(now)}.zip`,
    people: 'people.csv',
    requirementsStatus: 'requirements-status.csv',
    evidence: 'evidence.csv',
    assignments: 'assignments.csv',
    attempts: 'attempts.csv',
    trainingMatrix: 'training-matrix.csv',
    data: 'data.json',
    readme: 'README.txt',
    certificatesDir: 'certificates/',
    moduleCertificatesDir: 'certificates/module/',
  } as const;
}

export function certificateFileName(p: {
  surname: string;
  firstName: string;
  requirement: string;
  date: Date | string;
  ext: string;
}): string {
  const date = londonDateString(typeof p.date === 'string' ? new Date(p.date) : p.date);
  const parts = [slug(p.surname, 'unknown'), slug(p.firstName, 'unknown'), slug(p.requirement, 'certificate'), date];
  return `${parts.join('-')}.${slug(p.ext, 'bin')}`;
}

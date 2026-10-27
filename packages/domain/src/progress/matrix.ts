// Training matrix and its CSV export. Plan "Domain package", Assumption 2.
import { csvField } from '../exports/csv';
import { personRequirementStatus, type RequirementStatusName } from '../requirements';
import type { Evidence, EvidenceSubmission } from '../schemas/evidence';
import type { Requirement } from '../schemas/packs';
import type { Person, Site, Team } from '../schemas/tenancy';

export type MatrixCell = { status: RequirementStatusName; date?: string; daysLeft?: number };
export type MatrixRow = { person: Person; cells: MatrixCell[] };
export type Matrix = {
  columns: Requirement[];
  groups: { team: Team | null; rows: MatrixRow[] }[];
};

export type MatrixInput = {
  people: Person[];
  requirements: Requirement[];
  evidence: Evidence[];
  submissions: EvidenceSubmission[];
  teams: Team[];
  sites: Site[];
  now: Date;
  amberWindowDays: number;
  siteId?: string;
};

export function trainingMatrix(input: MatrixInput): Matrix {
  const sites = new Map(input.sites.map((s) => [s.id, s]));
  const listed = input.people
    .filter(
      (p) => (p.status === 'active' || p.status === 'onLeave') && (!input.siteId || p.primarySiteId === input.siteId),
    )
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  const status = (p: Person, r: Requirement): MatrixCell => {
    const site = sites.get(p.primarySiteId);
    if (!site) return { status: 'notAssigned' };
    const s = personRequirementStatus(
      r,
      p,
      site,
      input.evidence.filter((e) => e.personId === p.id),
      input.submissions.filter((x) => x.personId === p.id),
      input.now,
      input.amberWindowDays,
    );
    return {
      status: s.status,
      ...(s.expiresAt ? { date: s.expiresAt } : {}),
      ...(s.daysLeft !== undefined ? { daysLeft: s.daysLeft } : {}),
    };
  };

  const all = listed.map((p) => ({ person: p, cells: input.requirements.map((r) => status(p, r)) }));
  const keep = input.requirements.map((_, i) => all.some((row) => row.cells[i]?.status !== 'notAssigned'));
  const columns = input.requirements.filter((_, i) => keep[i]);
  const rows: MatrixRow[] = all.map((row) => ({ person: row.person, cells: row.cells.filter((_, i) => keep[i]) }));

  const groups: Matrix['groups'] = [];
  for (const team of input.teams) {
    const inTeam = rows.filter((r) => r.person.teamIds[0] === team.id);
    if (inTeam.length > 0) groups.push({ team, rows: inTeam });
  }
  const known = new Set(input.teams.map((t) => t.id));
  const loose = rows.filter((r) => {
    const first = r.person.teamIds[0];
    return first === undefined || !known.has(first);
  });
  if (loose.length > 0) groups.push({ team: null, rows: loose });
  return { columns, groups };
}

const field = csvField;

const londonDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function matrixCsv(matrix: Matrix, t: (key: string) => string, footer?: string): string {
  const lines: string[] = [];
  lines.push([t('matrix.csv.name'), t('matrix.csv.team'), ...matrix.columns.map((c) => c.name)].map(field).join(','));
  for (const group of matrix.groups) {
    for (const row of group.rows) {
      const cells = row.cells.map((c) => {
        const label = t(`status.${c.status}`);
        return c.date ? `${label} ${londonDate.format(new Date(c.date))}` : label;
      });
      lines.push(
        [`${row.person.firstName} ${row.person.lastName}`, group.team?.name ?? '', ...cells].map(field).join(','),
      );
    }
  }
  if (footer) lines.push(field(footer));
  return lines.join('\r\n') + '\r\n';
}

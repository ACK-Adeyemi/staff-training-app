// BP-6 (pure part): the training matrix and its CSV. Plan "Domain package" and Assumption 2.
//
// API under test (progress/matrix.ts):
//   trainingMatrix({ people, requirements, evidence, submissions, teams, sites, now, amberWindowDays, siteId? }) => {
//     columns: Requirement[];
//     groups: { team: Team | null; rows: { person: Person; cells: { status: RequirementStatusName; date?: string; daysLeft?: number }[] }[] }[]
//   }
//   Active and on-leave people only. A person is grouped by their first team (by teamIds[0]); groups follow the order of the
//   `teams` argument, people without a team go in a final group with team null; rows by last name then first name.
//   A column for each requirement that applies to at least one listed person (input order). `date` is the expiry ISO string.
//   `siteId` keeps people whose primary site is that site.
//   `sites` is passed so applicability can be worked out (extra to the plan's signature, which does not say where it comes from).
//   matrixCsv(matrix, t) => string: RFC 4180 (CRLF line endings, fields with comma, quote or line break quoted with doubled
//     quotes). First column is the person's full name ("First Last"), then team name, then one column per requirement.
//     Every row has as many fields as the header. Cells starting with = + - or @ are prefixed with a single quote.
//     `t` is the translation function (key => text); the header uses requirement names as given.
import { describe, expect, it } from 'vitest';
import { matrixCsv, trainingMatrix } from './matrix';
import {
  AMBER, NOW, SITE_2_ID, evidenceExpiring, person, requirement, site, team,
} from './testFixtures';

const babies = team('01HZX00000000000000000T001', 'Baby room');
const toddlers = team('01HZX00000000000000000T002', 'Toddler room');
const sg = requirement('Safeguarding', { renewEveryMonths: 24 });
const food = requirement('Food hygiene', { renewEveryMonths: 36, appliesTo: { jobRoleIds: ['role-cook'] } });
const never = requirement('Nobody needs this', { appliesTo: { jobRoleIds: ['role-none'] } });

const maureen = person('Maureen', 'Clarke', { jobRoleIds: ['role-cook'], teamIds: [toddlers.id] });
const jade = person('Jade', 'Mills', { teamIds: [toddlers.id] });
const hannah = person('Hannah', 'Patel', { teamIds: [babies.id, toddlers.id] });
const ana = person('Ana', 'Baker', { teamIds: [babies.id] });
const floater = person('Ben', 'Carter');
const olivia = person('Olivia', 'Grant', { status: 'archived', teamIds: [babies.id] });
const grace = person('Grace', 'Lee', { status: 'onLeave', teamIds: [toddlers.id] });

const people = [jade, olivia, maureen, hannah, floater, grace, ana];
const evidence = [evidenceExpiring(maureen, food, 20), evidenceExpiring(jade, sg, 200)];
const input = {
  people, requirements: [sg, food, never], evidence, submissions: [], teams: [babies, toddlers],
  sites: [site(), site({ id: SITE_2_ID, name: 'Second site' })], now: NOW, amberWindowDays: AMBER,
};

describe('trainingMatrix', () => {
  const m = trainingMatrix(input);
  const rowFor = (p: typeof jade) => m.groups.flatMap((g) => g.rows).find((r) => r.person.id === p.id);

  it('lists active and on-leave people once each and leaves out archived people', () => {
    const ids = m.groups.flatMap((g) => g.rows.map((r) => r.person.id));
    expect(ids.sort()).toEqual([jade, maureen, hannah, floater, grace, ana].map((p) => p.id).sort());
    expect(ids).not.toContain(olivia.id);
  });

  it('groups by first team in team order, then people without a team, rows by last name', () => {
    expect(m.groups.map((g) => g.team?.name ?? null)).toEqual(['Baby room', 'Toddler room', null]);
    expect(m.groups[0]?.rows.map((r) => r.person.lastName)).toEqual(['Baker', 'Patel']);
    expect(m.groups[1]?.rows.map((r) => r.person.lastName)).toEqual(['Clarke', 'Lee', 'Mills']);
    expect(m.groups[2]?.rows.map((r) => r.person.lastName)).toEqual(['Carter']);
  });

  it('has a column for each requirement that applies to someone listed, and none for the rest', () => {
    expect(m.columns.map((c) => c.name)).toEqual(['Safeguarding', 'Food hygiene']);
  });

  it('shows Maureen food hygiene expiring with its date and days left', () => {
    const cell = rowFor(maureen)?.cells[1];
    expect(cell).toMatchObject({ status: 'expiringSoon', daysLeft: 20 });
    expect(cell?.date).toBe(evidence[0]?.expiresAt);
  });

  it('shows not assigned where a requirement does not apply, and not started where it does', () => {
    expect(rowFor(jade)?.cells[1]?.status).toBe('notAssigned');
    expect(rowFor(ana)?.cells[0]?.status).toBe('notStarted');
    expect(rowFor(jade)?.cells[0]?.status).toBe('current');
  });

  it('filters by site, and drops columns nobody at that site needs', () => {
    const other = person('Sasha', 'Other', { primarySiteId: SITE_2_ID, teamIds: [babies.id] });
    const all = trainingMatrix({ ...input, people: [...people, other] });
    expect(all.groups.flatMap((g) => g.rows).some((r) => r.person.id === other.id)).toBe(true);
    const only = trainingMatrix({ ...input, people: [...people, other], siteId: SITE_2_ID });
    expect(only.groups.flatMap((g) => g.rows.map((r) => r.person.id))).toEqual([other.id]);
    expect(only.columns.map((c) => c.name)).toEqual(['Safeguarding']);
  });
});

/** Minimal RFC 4180 parser for the assertions. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

describe('matrixCsv', () => {
  const t = (key: string): string => key;

  it('writes a header with names then requirements, and one row per person with the same field count', () => {
    const rows = parseCsv(matrixCsv(trainingMatrix(input), t));
    expect(rows[0]?.slice(2)).toEqual(['Safeguarding', 'Food hygiene']);
    expect(rows).toHaveLength(1 + 6);
    for (const r of rows) expect(r).toHaveLength(4);
    const maureenRow = rows.find((r) => r[0] === 'Maureen Clarke');
    expect(maureenRow?.[1]).toBe('Toddler room');
  });

  it('uses CRLF line endings', () => {
    const csv = matrixCsv(trainingMatrix(input), t);
    expect(csv.split('\r\n').length).toBeGreaterThan(2);
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('quotes fields with commas and quotes and keeps them intact', () => {
    const odd = person('Pat', 'Smith, "Jr"', { teamIds: [babies.id] });
    const csv = matrixCsv(trainingMatrix({ ...input, people: [odd] }), t);
    expect(csv).toContain('"Pat Smith, ""Jr"""');
    expect(parseCsv(csv)[1]?.[0]).toBe('Pat Smith, "Jr"');
  });

  it('prefixes cells that start with = + - or @ with a single quote', () => {
    for (const lead of ['=', '+', '-', '@']) {
      const bad = person(`${lead}CMD`, 'Evil', { teamIds: [babies.id] });
      const rows = parseCsv(matrixCsv(trainingMatrix({ ...input, people: [bad] }), t));
      expect(rows[1]?.[0]).toBe(`'${lead}CMD Evil`);
    }
  });

  it('guards a team name that starts with a formula character', () => {
    const odd = team('01HZX00000000000000000T009', '=SUM(A1)');
    const p = person('Ok', 'Person', { teamIds: [odd.id] });
    const rows = parseCsv(matrixCsv(trainingMatrix({ ...input, people: [p], teams: [odd] }), t));
    expect(rows[1]?.[1]).toBe("'=SUM(A1)");
  });
});

// BP-8 in the export ZIP: certificates carry the name the organisation had when issued; CSVs and the README carry
// the "formerly" note while the bundle has one.
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createT, languages } from '@sta/content';
import type { ExportBundle } from '@sta/data';
import { buildExportZip } from './zip';

const t = createT(languages['en-GB'].messages);
const bundle = (formerlyNote: ExportBundle['formerlyNote']): ExportBundle =>
  ({
    exportedAt: '2026-10-27T10:00:00.000Z',
    people: [
      {
        id: 'p1',
        clientId: 'c1',
        firstName: 'Jade',
        lastName: 'Smith',
        primarySiteId: 's1',
        status: 'active',
        jobRoleIds: [],
        teamIds: [],
        siteIds: [],
        startDate: '2025-01-01T00:00:00.000Z',
      },
    ],
    evidence: [
      {
        id: 'e1',
        clientId: 'c1',
        personId: 'p1',
        requirementId: 'r1',
        kind: 'module',
        completedAt: '2026-10-01T09:00:00.000Z',
        moduleId: 'm1',
        siteIdAtTime: 's1',
      },
    ],
    evidenceSubmissions: [],
    assignments: [],
    attempts: [],
    sites: [{ id: 's1', clientId: 'c1', name: 'Main site' }],
    teams: [],
    requirements: [
      {
        id: 'r1',
        name: 'Safeguarding',
        appliesTo: { all: true },
        evidence: ['module'],
        satisfiedByModuleIds: ['m1'],
        acceptsExternal: false,
        acceptedProviders: [],
        expiryMode: 'fromRenewalPeriod',
        approverChecklist: [],
      },
    ],
    modules: [{ id: 'm1', title: 'Safeguarding basics' }],
    rules: [],
    competitions: [],
    formerlyNote,
  }) as unknown as ExportBundle;

const run = (note: ExportBundle['formerlyNote']) =>
  unzipSync(
    buildExportZip({
      bundle: bundle(note),
      files: [],
      clientName: 'Oak Tree Group',
      nameAt: (iso) => (iso < '2026-10-25' ? 'Oak Tree' : 'Oak Tree Group'),
      amberWindowDays: 30,
      now: new Date('2026-10-27T10:00:00.000Z'),
      t,
    }),
  );
const text = (files: Record<string, Uint8Array>, suffix: string) => {
  const key = Object.keys(files).find((k) => k.endsWith(suffix));
  if (!key) throw new Error(`no ${suffix}`);
  return strFromU8(files[key]!);
};

describe('export ZIP and the organisation name', () => {
  it('names the organisation as it was when each module certificate was issued', () => {
    const html = text(run(null), '.html');
    expect(html).toContain('Oak Tree');
    expect(html).not.toContain('Oak Tree Group');
  });

  it('adds the formerly note to the CSVs and the README within the window', () => {
    const files = run({ old: 'Oak Tree', changedAt: '2026-10-25T09:00:00.000Z' });
    for (const name of ['people.csv', 'requirements-status.csv', 'training-matrix.csv']) {
      expect(text(files, name)).toContain('Your organisation was called Oak Tree until');
    }
    expect(text(files, 'README.txt')).toContain('was called Oak Tree');
  });

  it('adds no note when the bundle has none (after 90 days)', () => {
    const files = run(null);
    for (const name of ['people.csv', 'requirements-status.csv', 'training-matrix.csv', 'README.txt']) {
      expect(text(files, name)).not.toContain('was called');
    }
  });
});

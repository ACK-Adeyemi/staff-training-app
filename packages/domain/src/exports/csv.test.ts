// BP-8 and BP-19 (pure part): generic CSV for the export ZIP and the file names inside it (brief 24.6; M3 assumption 48).
//
// API under test (exports/csv.ts):
//   toCsv(columns: { key: string; header: string }[], rows: Record<string, string | number | boolean | null | undefined>[]): string
//       RFC 4180: CRLF line endings, a header row, a trailing CRLF; fields with comma, quote or line break are quoted with
//       doubled quotes; string cells starting with = + - @ tab or CR get a leading single quote (same guard as matrixCsv);
//       numbers and booleans are written as they are (a negative number is not a formula); null and undefined are empty;
//       headers get the same guard and quoting
//   exportFileNames(now: Date, clientName: string): {
//       zip: string;                 // `${slug of clientName}-export-${London date}.zip`
//       people, requirementsStatus, evidence, assignments, attempts, trainingMatrix: string;   // the six .csv names
//       data: 'data.json'; readme: 'README.txt'; certificatesDir: 'certificates/'; moduleCertificatesDir: 'certificates/module/' }
//   certificateFileName(p: { surname: string; firstName: string; requirement: string; date: Date | string; ext: string }): string
//       `surname-firstname-requirement-date.ext`, lower case, a-z 0-9 and hyphens only inside the parts, London date yyyy-mm-dd
import { describe, expect, it } from 'vitest';
import { certificateFileName, exportFileNames, toCsv } from './csv';

const COLS = [
  { key: 'name', header: 'Name' },
  { key: 'note', header: 'Note' },
];

describe('toCsv', () => {
  it('writes a header, rows and a trailing CRLF', () => {
    expect(toCsv(COLS, [{ name: 'Jade Mills', note: 'ok' }])).toBe('Name,Note\r\nJade Mills,ok\r\n');
  });

  it('writes just the header for no rows', () => {
    expect(toCsv(COLS, [])).toBe('Name,Note\r\n');
  });

  it('quotes fields with commas, quotes and line breaks, doubling the quotes', () => {
    const csv = toCsv(COLS, [{ name: 'Clarke, Maureen', note: 'said "hi"\nthen left' }]);
    expect(csv).toBe('Name,Note\r\n"Clarke, Maureen","said ""hi""\nthen left"\r\n');
  });

  it.each(['=SUM(A1)', '+44 7700 900000', '-2+3', '@cmd', '\tTab', '\rCR'])(
    'guards a cell that starts like a formula: %j',
    (cell) => {
      const csv = toCsv(COLS, [{ name: cell, note: 'x' }]);
      const body = csv.split('\r\n')[1] as string;
      expect(body.startsWith(`'${cell.slice(0, 1)}`) || body.startsWith(`"'${cell.slice(0, 1)}`)).toBe(true);
    },
  );

  it('does not guard text that merely contains a formula character later on', () => {
    expect(toCsv(COLS, [{ name: 'a=b', note: 'x-y' }])).toBe('Name,Note\r\na=b,x-y\r\n');
  });

  it('writes numbers and booleans as they are, including negatives', () => {
    const csv = toCsv(
      [
        { key: 'n', header: 'N' },
        { key: 'b', header: 'B' },
      ],
      [
        { n: -3, b: true },
        { n: 0, b: false },
      ],
    );
    expect(csv).toBe('N,B\r\n-3,true\r\n0,false\r\n');
  });

  it('writes null and undefined as empty cells and keeps column order from the columns', () => {
    const csv = toCsv(COLS, [{ note: null }, { note: 'n', name: 'a' }]);
    expect(csv).toBe('Name,Note\r\n,\r\na,n\r\n');
  });

  it('guards headers too', () => {
    expect(toCsv([{ key: 'a', header: '=bad' }], [])).toBe("'=bad\r\n");
  });

  it('gives every row as many fields as the header', () => {
    const csv = toCsv(COLS, [{ name: 'a' }, { name: 'b', note: 'c,d' }]);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(3);
  });
});

describe('exportFileNames', () => {
  const names = exportFileNames(new Date('2026-10-26T12:00:00.000Z'), 'Little Acorns Nursery');

  it('names the ZIP after the organisation and the London export date', () => {
    expect(names.zip).toBe('little-acorns-nursery-export-2026-10-26.zip');
  });

  it('uses the London date near midnight (BST)', () => {
    expect(exportFileNames(new Date('2026-07-01T23:30:00.000Z'), 'Oak Tree').zip).toBe(
      'oak-tree-export-2026-07-02.zip',
    );
  });

  it('keeps the ZIP name safe for any organisation name', () => {
    const zip = exportFileNames(new Date('2026-10-26T12:00:00.000Z'), '../Bob\'s "Shop" & Co/\\x').zip;
    expect(zip).toMatch(/^[a-z0-9-]+-export-2026-10-26\.zip$/);
  });

  it('lists the files the plan promises', () => {
    expect(names).toMatchObject({
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
    });
  });
});

describe('certificateFileName', () => {
  it('is surname-firstname-requirement-date.ext in lower case', () => {
    expect(
      certificateFileName({
        surname: 'Clarke',
        firstName: 'Maureen',
        requirement: 'Food hygiene',
        date: '2026-03-04T10:00:00.000Z',
        ext: 'pdf',
      }),
    ).toBe('clarke-maureen-food-hygiene-2026-03-04.pdf');
  });

  it('accepts a Date and uses the London date', () => {
    expect(
      certificateFileName({
        surname: 'Mills',
        firstName: 'Jade',
        requirement: 'Safeguarding',
        date: new Date('2026-07-01T23:30:00.000Z'),
        ext: 'jpg',
      }),
    ).toBe('mills-jade-safeguarding-2026-07-02.jpg');
  });

  it('removes characters that are unsafe in a file name', () => {
    const name = certificateFileName({
      surname: "O'Brien/../",
      firstName: 'Zoë',
      requirement: 'First aid (paediatric)',
      date: '2026-03-04T10:00:00.000Z',
      ext: 'png',
    });
    expect(name).toMatch(/^[a-z0-9-]+\.png$/);
    expect(name).toContain('first-aid');
    expect(name).not.toContain('..');
    expect(name.endsWith('-2026-03-04.png')).toBe(true);
  });
});

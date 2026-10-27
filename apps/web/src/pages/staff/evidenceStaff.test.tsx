// M3 chunk 17 (BP-15, F-4 files part): staff side of external evidence. S8 My compliance actions and submission
// statuses, and S17 Upload certificate. Written before the implementation. New text goes in language files.
//
// UI CONTRACT (data layer = store.attachments.upload + store.evidenceFlow.submit / resubmit; Mark is the staff persona):
//   Image processing: apps/web/src/app/images.ts exports prepareImage(file: File, redactions: RedactBox[]):
//     Promise<{ data: Uint8Array; mime: 'image/jpeg' }>. Tests replace it with vi.mock (jsdom has no canvas). The
//     screen calls it for image files only (never for a PDF) and uploads exactly the bytes it returns.
//   S8 /staff/progress "My compliance" table: a requirement whose `acceptsExternal` is true gets a link named
//     "Upload certificate: <requirement name>" to #/staff/progress/upload/<requirementId> (min 44px). A requirement
//     whose accepted providers carry a courseUrl also gets a link "Go to course: <name>" that opens that URL with
//     target=_blank and rel containing noopener. Requirements that do not accept uploads show neither.
//     The status badge for a person with an open submission reads "Waiting for a check" (existing wording).
//     needsBetterCopy: the row shows the approver's note and a link "Resubmit: <name>" to the same upload route.
//     rejected: the row shows the reason label (Not the right course, Name does not match, Certificate has expired,
//     Cannot read it, Other), the note when given, and the same Resubmit link.
//   S17 /staff/progress/upload/:requirementId (inside the staff shell, h1 "Upload certificate"):
//     Shows the requirement name and the hint "Photos and PDFs only, up to 10 MB.". Buttons "Take a photo" and
//     "Choose a file" (FilePickerButtons; both inputs accept image/jpeg,image/png,image/webp,application/pdf; the
//     camera input has capture). A file of another type, or over 10 MB, gives role=alert: "Please choose a photo or a
//     PDF." / "That file is too big. Please choose one under 10 MB." and no form. An image shows a preview img (alt
//     "Preview of your certificate") with an ImageRedactor (button "Add box"); a PDF shows its file name and no
//     redactor. Form: combobox "Course provider" (the requirement's accepted provider names, then "Other"; choosing
//     Other shows a textbox "Name of the course provider"), date inputs "Date you finished the course" and
//     "Expiry date on the certificate" (only when expiryMode is fromCertificate; required), textbox "Certificate
//     number (optional)". When expiryMode is fromRenewalPeriod there is no expiry input; the text "Expected expiry"
//     with the calculated long date is shown after the completed date is entered. Button "Send for checking" calls
//     attachments.upload({ purpose: 'certificate', mime, data, personId }) then evidenceFlow.submit(...) and shows
//     role=status "Sent. Your manager will check it." Missing fields give role=alert and store nothing.
//     With an open needsBetterCopy or rejected submission the page shows the note and the button reads "Resubmit"
//     and calls evidenceFlow.resubmit (same record, back to awaitingCheck, no second submission).
//     A requirement that does not accept uploads: role=alert "This course does not take uploaded certificates."
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ActorContext, StoreHandle } from '@sta/data';
import type { EvidenceSubmission, Requirement } from '@sta/domain';
import type { SeedKeys } from '@sta/seed';
import { renderRoute, TODAY } from '../../test/harness';

const hoisted = vi.hoisted(() => ({
  prepared: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0xff, 0xd9]),
  calls: [] as { file: File; boxes: unknown[] }[],
}));
vi.mock('../../app/images', () => ({
  prepareImage: (file: File, boxes: unknown[]) => {
    hoisted.calls.push({ file, boxes });
    return Promise.resolve({ data: hoisted.prepared, mime: 'image/jpeg' });
  },
}));

beforeAll(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined }));
});
afterEach(() => {
  cleanup();
  hoisted.calls.length = 0;
});

type Ctx = { handle: StoreHandle; keys: SeedKeys };
const ignore = (_: unknown): void => undefined;
const need = <T,>(v: T | null | undefined): T => {
  if (v === undefined || v === null) throw new Error('missing');
  return v;
};
const asUser =
  (userKey: string, side: 'staff' | 'client' = 'staff') =>
  (keys: SeedKeys): ActorContext => ({
    userId: need(keys.users[userKey]),
    side,
    clientId: need(keys.clients['littleAcorns']),
    now: TODAY,
  });
const mark = asUser('mark');
const daniel = asUser('daniel', 'client');
const dump = async <R,>(handle: StoreHandle, store: string): Promise<R[]> =>
  ((await handle.admin.dumpAll()) as unknown as Record<string, unknown[]>)[store] as R[];
const pdf = (): Uint8Array<ArrayBuffer> => {
  // Built byte by byte so it is a Uint8Array of the test realm (the data layer checks instanceof).
  const text = '%PDF-1.4\n% Fictional certificate for tests only.\n%%EOF\n';
  const out = new Uint8Array(new ArrayBuffer(text.length));
  for (let k = 0; k < text.length; k++) out[k] = text.charCodeAt(k);
  return out;
};
const upload = (path: string) => `/staff/progress/upload/${path}`;

/** Mark sends his paediatric first aid certificate (a PDF) through the data layer. */
async function markSubmits({ handle, keys }: Ctx): Promise<EvidenceSubmission> {
  const actor = mark(keys);
  const person = need(
    (await dump<{ id: string; primarySiteId: string }>(handle, 'people')).find((p) => p.id === keys.personas['mark']),
  );
  const file = await handle.store.attachments.upload(actor, {
    purpose: 'certificate',
    title: 'Paediatric first aid certificate (fictional)',
    mime: 'application/pdf',
    data: pdf(),
    personId: person.id,
    siteId: person.primarySiteId,
  });
  return handle.store.evidenceFlow.submit(actor, {
    requirementId: need(keys.requirements['paediatricFirstAid']),
    providerName: 'Approved paediatric first aid training provider',
    completedAt: '2026-10-10T00:00:00.000Z',
    expiresAt: '2029-10-10T00:00:00.000Z',
    fileAttachmentId: file.id,
  });
}
const decide = (
  keys: SeedKeys,
  handle: StoreHandle,
  id: string,
  d: Parameters<StoreHandle['store']['evidenceFlow']['review']>[2],
) => handle.store.evidenceFlow.review(daniel(keys), id, d);

function fileInputs(): { plain: HTMLInputElement; camera: HTMLInputElement } {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  return {
    plain: need(all.find((i) => !i.hasAttribute('capture'))),
    camera: need(all.find((i) => i.hasAttribute('capture'))),
  };
}
const choose = (file: File) => {
  fireEvent.change(fileInputs().plain, { target: { files: [file] } });
};
const photo = () => new File([new Uint8Array([1, 2, 3])], 'certificate.jpg', { type: 'image/jpeg' });
const pdfFile = () => new File([pdf()], 'certificate.pdf', { type: 'application/pdf' });
const setDate = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('S8 My compliance actions', () => {
  it('offers Upload certificate only on requirements that accept uploads, linked to S17', async () => {
    let c!: Ctx;
    await renderRoute('/staff/progress', 'staff', { actor: mark, prepare: (x) => ((c = x), Promise.resolve()) });
    const link = await screen.findByRole('link', { name: 'Upload certificate: Paediatric first aid' });
    expect(link.getAttribute('href')).toBe(`#${upload(need(c.keys.requirements['paediatricFirstAid']))}`);
    expect(screen.getByRole('link', { name: 'Upload certificate: Safeguarding' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Upload certificate: What changed/ })).toBeNull();
  });

  it('shows Go to course in a new tab only when an accepted provider has a course link', async () => {
    await renderRoute('/staff/progress', 'staff', { actor: mark });
    await screen.findByRole('link', { name: 'Upload certificate: Paediatric first aid' });
    expect(screen.queryByRole('link', { name: /Go to course/ })).toBeNull();
    cleanup();
    await renderRoute('/staff/progress', 'staff', {
      actor: mark,
      prepare: async ({ handle, keys }) => {
        const req = need(
          (await dump<Requirement>(handle, 'requirements')).find((r) => r.id === keys.requirements['safeguarding']),
        );
        await handle.admin.bulkPut('requirements', [
          {
            ...req,
            acceptedProviders: [
              { name: 'DfE early years safeguarding course', courseUrl: 'https://www.gov.uk/example-course' },
            ],
          },
        ]);
      },
    });
    const go = await screen.findByRole('link', { name: 'Go to course: Safeguarding' });
    expect(go.getAttribute('href')).toBe('https://www.gov.uk/example-course');
    expect(go.getAttribute('target')).toBe('_blank');
    expect(go.getAttribute('rel') ?? '').toContain('noopener');
  });

  it('shows Waiting for a check once Mark has sent a certificate', async () => {
    await renderRoute('/staff/progress', 'staff', {
      actor: mark,
      prepare: async (c) => {
        ignore(await markSubmits(c));
      },
    });
    const row = await screen.findByRole('row', { name: /Paediatric first aid/ });
    expect(row.textContent).toContain('Waiting for a check');
  });

  it('shows the approver note and a Resubmit link when a better copy was asked for', async () => {
    let c!: Ctx;
    await renderRoute('/staff/progress', 'staff', {
      actor: mark,
      prepare: async (x) => {
        c = x;
        const s = await markSubmits(x);
        await decide(x.keys, x.handle, s.id, {
          kind: 'betterCopy',
          note: 'The date is cut off. Please retake the photo.',
        });
      },
    });
    const row = await screen.findByRole('row', { name: /Paediatric first aid/ });
    expect(row.textContent).toContain('Needs a better copy');
    expect(row.textContent).toContain('The date is cut off. Please retake the photo.');
    const again = within(row).getByRole('link', { name: 'Resubmit: Paediatric first aid' });
    expect(again.getAttribute('href')).toBe(`#${upload(need(c.keys.requirements['paediatricFirstAid']))}`);
  });

  it('shows the rejection reason and note with a Resubmit link', async () => {
    await renderRoute('/staff/progress', 'staff', {
      actor: mark,
      prepare: async (x) => {
        const s = await markSubmits(x);
        await decide(x.keys, x.handle, s.id, {
          kind: 'reject',
          reason: 'nameMismatch',
          note: 'This one is for someone else.',
        });
      },
    });
    const row = await screen.findByRole('row', { name: /Paediatric first aid/ });
    expect(row.textContent).toContain('Not accepted');
    expect(row.textContent).toContain('Name does not match');
    expect(row.textContent).toContain('This one is for someone else.');
    expect(within(row).getByRole('link', { name: 'Resubmit: Paediatric first aid' })).toBeTruthy();
  });
});

describe('S17 Upload certificate', () => {
  const firstAid = (c: Ctx) => upload(need(c.keys.requirements['paediatricFirstAid']));
  const render = async (path: (c: Ctx) => string, prepare?: (c: Ctx) => Promise<void>) => {
    let c!: Ctx;
    const r = await renderRoute('/staff', 'staff', {
      actor: mark,
      prepare: (x) => ((c = x), prepare ? prepare(x) : Promise.resolve()),
    });
    await r.router.navigate(path(c));
    return { ...r, c };
  };

  it('has one h1, the requirement name, the limits hint and both file buttons', async () => {
    await render(firstAid);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Upload certificate');
    expect(screen.getByText('Paediatric first aid', { exact: false })).toBeTruthy();
    expect(screen.getByText('Photos and PDFs only, up to 10 MB.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy();
    const { plain, camera } = fileInputs();
    for (const i of [plain, camera]) {
      expect(i.accept).toBe('image/jpeg,image/png,image/webp,application/pdf');
    }
    expect(camera.getAttribute('capture')).toBe('environment');
  });

  it('refuses a file that is not an image or a PDF, in plain words, and shows no form', async () => {
    await render(firstAid);
    await screen.findByRole('button', { name: 'Choose a file' });
    choose(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Please choose a photo or a PDF.');
    expect(screen.queryByRole('button', { name: 'Send for checking' })).toBeNull();
    expect(hoisted.calls).toHaveLength(0);
  });

  it('refuses a file over 10 MB with a friendly limit', async () => {
    await render(firstAid);
    await screen.findByRole('button', { name: 'Choose a file' });
    const big = pdfFile();
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    choose(big);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That file is too big. Please choose one under 10 MB.',
    );
    expect(screen.queryByRole('button', { name: 'Send for checking' })).toBeNull();
  });

  it('previews a photo with blur boxes, prepares it with the boxes and stores the prepared bytes', async () => {
    const { c } = await render(firstAid);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Choose a file' });
    choose(photo());
    expect(await screen.findByRole('img', { name: 'Preview of your certificate' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Course provider' }),
      'Approved paediatric first aid training provider',
    );
    setDate('Date you finished the course', '2026-10-12');
    setDate('Expiry date on the certificate', '2029-10-12');
    await user.type(screen.getByRole('textbox', { name: 'Certificate number (optional)' }), 'PFA-0001');
    await user.click(screen.getByRole('button', { name: 'Send for checking' }));
    expect((await screen.findByRole('status')).textContent).toContain('Sent. Your manager will check it.');
    expect(hoisted.calls).toHaveLength(1);
    expect(hoisted.calls[0]?.boxes).toHaveLength(1);
    const files = (
      await dump<{ id: string; mime?: string; data?: Uint8Array; purpose?: string; personId?: string }>(
        c.handle,
        'attachments',
      )
    ).filter((a) => a.purpose === 'certificate' && a.personId === c.keys.personas['mark']);
    expect(files).toHaveLength(1);
    expect(files[0]?.mime).toBe('image/jpeg');
    expect(Array.from(need(files[0]?.data))).toEqual(Array.from(hoisted.prepared));
    const subs = (await dump<EvidenceSubmission>(c.handle, 'evidenceSubmissions')).filter(
      (s) => s.personId === c.keys.personas['mark'],
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      status: 'awaitingCheck',
      requirementId: c.keys.requirements['paediatricFirstAid'],
      providerName: 'Approved paediatric first aid training provider',
      certificateRef: 'PFA-0001',
      fileAttachmentId: files[0]?.id,
    });
    expect(subs[0]?.completedAt.slice(0, 10)).toBe('2026-10-12');
    expect(subs[0]?.expiresAt?.slice(0, 10)).toBe('2029-10-12');
  });

  it('sends a PDF as it is: no image processing and no redaction box', async () => {
    const { c } = await render(firstAid);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Choose a file' });
    choose(pdfFile());
    expect(await screen.findByText('certificate.pdf')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add box' })).toBeNull();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Course provider' }),
      'Local authority paediatric first aid course',
    );
    setDate('Date you finished the course', '2026-10-12');
    setDate('Expiry date on the certificate', '2029-10-12');
    await user.click(screen.getByRole('button', { name: 'Send for checking' }));
    await screen.findByRole('status');
    expect(hoisted.calls).toHaveLength(0);
    const files = (await dump<{ mime?: string; purpose?: string; personId?: string }>(c.handle, 'attachments')).filter(
      (a) => a.purpose === 'certificate' && a.personId === c.keys.personas['mark'],
    );
    expect(files.map((f) => f.mime)).toEqual(['application/pdf']);
  });

  it('lets Mark name another provider with Other', async () => {
    const { c } = await render(firstAid);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Choose a file' });
    choose(pdfFile());
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Course provider' }), 'Other');
    await user.type(screen.getByRole('textbox', { name: 'Name of the course provider' }), 'Sample Training Co');
    setDate('Date you finished the course', '2026-10-12');
    setDate('Expiry date on the certificate', '2029-10-12');
    await user.click(screen.getByRole('button', { name: 'Send for checking' }));
    await screen.findByRole('status');
    const subs = (await dump<EvidenceSubmission>(c.handle, 'evidenceSubmissions')).filter(
      (s) => s.personId === c.keys.personas['mark'],
    );
    expect(subs[0]?.providerName).toBe('Sample Training Co');
  });

  it('needs the expiry date from the certificate when the requirement works that way, and stores nothing without it', async () => {
    const { c } = await render(firstAid);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Choose a file' });
    choose(pdfFile());
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Course provider' }),
      'Local authority paediatric first aid course',
    );
    setDate('Date you finished the course', '2026-10-12');
    await user.click(screen.getByRole('button', { name: 'Send for checking' }));
    expect((await screen.findByRole('alert')).textContent.length).toBeGreaterThan(0);
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      (await dump<EvidenceSubmission>(c.handle, 'evidenceSubmissions')).filter(
        (s) => s.personId === c.keys.personas['mark'],
      ),
    ).toHaveLength(0);
  });

  it('shows the expected expiry, with no expiry field, when it is worked out from the renewal period', async () => {
    const { c } = await render((x) => upload(need(x.keys.requirements['safeguarding'])));
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Choose a file' });
    choose(pdfFile());
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Course provider' }),
      'DfE early years safeguarding course',
    );
    expect(screen.queryByLabelText('Expiry date on the certificate')).toBeNull();
    setDate('Date you finished the course', '2026-10-12');
    expect((await screen.findByText(/Expected expiry/)).textContent).toContain('12 October 2028');
    await user.click(screen.getByRole('button', { name: 'Send for checking' }));
    await screen.findByRole('status');
    const subs = (await dump<EvidenceSubmission>(c.handle, 'evidenceSubmissions')).filter(
      (s) => s.personId === c.keys.personas['mark'],
    );
    expect(subs[0]?.expiresAt?.slice(0, 10)).toBe('2028-10-12');
  });

  it('resubmits on the same record after a better copy was asked for', async () => {
    let first!: EvidenceSubmission;
    const { c } = await render(firstAid, async (x) => {
      first = await markSubmits(x);
      await decide(x.keys, x.handle, first.id, { kind: 'betterCopy', note: 'Please send the whole page.' });
    });
    const user = userEvent.setup();
    expect(await screen.findByText(/Please send the whole page\./)).toBeTruthy();
    choose(photo());
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Course provider' }),
      'Approved paediatric first aid training provider',
    );
    setDate('Date you finished the course', '2026-10-10');
    setDate('Expiry date on the certificate', '2029-10-10');
    expect(screen.queryByRole('button', { name: 'Send for checking' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Resubmit' }));
    await screen.findByRole('status');
    const subs = (await dump<EvidenceSubmission>(c.handle, 'evidenceSubmissions')).filter(
      (s) => s.personId === c.keys.personas['mark'],
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ id: first.id, status: 'awaitingCheck' });
    expect(subs[0]?.fileAttachmentId).not.toBe(first.fileAttachmentId);
  });

  it('says so when the requirement does not take uploaded certificates', async () => {
    await render((x) => upload(need(x.keys.requirements['whatChanged'])));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'This course does not take uploaded certificates.',
    );
    expect(screen.queryByRole('button', { name: 'Choose a file' })).toBeNull();
  });

  it('never shows payment wording to staff', async () => {
    await render(firstAid);
    await screen.findByRole('button', { name: 'Choose a file' });
    expect(document.body.textContent).not.toMatch(/\b(pay|payment|price|invoice|billing|subscription)\b/i);
  });
});

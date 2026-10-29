import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { allPacks, nurseryPack, packages } from '@sta/content';
import { holdsAnywhere } from '@sta/domain';
import { Button, Card, PageHeader } from '@sta/ui';
import { useActor, useDemo, useStore, useT } from '../../app/hooks';
import { usePermissions } from '../client/queries';
import { fieldClass } from '../client/feedbackShared';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TRIAL = 90;

type Errors = {
  name?: true;
  sites: boolean[];
  adminName?: true;
  email?: true;
  billingContact?: true;
  trialDays?: true;
};

const orderedPacks = [
  ...allPacks.filter((p) => p.id === nurseryPack.id),
  ...allPacks.filter((p) => p.id !== nurseryPack.id && p.status !== 'stub'),
  ...allPacks.filter((p) => p.id !== nurseryPack.id && p.status === 'stub'),
];

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  hint?: string;
  type?: string;
}) {
  const hintId = `${props.id}-hint`;
  const errId = `${props.id}-error`;
  const describedBy = [props.hint ? hintId : '', props.error ? errId : ''].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="font-semibold">
        {props.label}
      </label>
      {props.hint ? (
        <p id={hintId} className="m-0 text-sm">
          {props.hint}
        </p>
      ) : null}
      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${fieldClass} ${props.error ? 'border-dashed' : ''}`}
      />
      {props.error ? (
        <p id={errId} role="alert" className="m-0 font-semibold">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

function Created({ clientId, name, email }: { clientId: string; name: string; email: string }) {
  const t = useT();
  const demo = useDemo();
  const outbox = useQuery({ queryKey: ['outbox'], queryFn: () => demo.listOutbox() });
  const sent = outbox.data?.filter((m) => m.to === email).sort((a, b) => b.at.localeCompare(a.at))[0];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div data-testid="new-client-created" role="status">
          <h2 className="mt-0">{t('provider.newClient.created')}</h2>
          <p>{t('provider.newClient.createdBody', { name })}</p>
          <a
            href={`#/provider/clients/${clientId}`}
            className="inline-flex min-h-[var(--target-min)] items-center font-bold underline"
          >
            {t('provider.newClient.viewClient')}
          </a>
        </div>
      </Card>
      {sent ? (
        <Card>
          <div data-testid="new-client-outbox-entry">
            <h2 className="mt-0">{t('provider.newClient.invitationSent')}</h2>
            <p className="my-1 break-words">{t('provider.newClient.invitationTo', { to: sent.to })}</p>
            {sent.subject ? (
              <p className="my-1">{t('provider.newClient.invitationSubject', { subject: sent.subject })}</p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Wizard(): ReactNode {
  const t = useT();
  const store = useStore();
  const actor = useActor();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [packId, setPackId] = useState(orderedPacks[0]?.id ?? '');
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [trial, setTrial] = useState(true);
  const [trialDays, setTrialDays] = useState('14');
  const [billing, setBilling] = useState('');
  const [sites, setSites] = useState<string[]>(['']);
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Errors>({ sites: [] });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<{ clientId: string; name: string; email: string } | null>(null);

  if (done) return <Created {...done} />;

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    const days = Number(trialDays);
    const next: Errors = { sites: sites.map((s) => s.trim() === '') };
    if (name.trim() === '') next.name = true;
    if (adminName.trim() === '') next.adminName = true;
    if (!EMAIL.test(email.trim())) next.email = true;
    if (billing.trim() !== '' && !EMAIL.test(billing.trim())) next.billingContact = true;
    if (trial && (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL)) next.trialDays = true;
    setErrors(next);
    setFailed(false);
    if (
      next.name ||
      next.adminName ||
      next.email ||
      next.billingContact ||
      next.trialDays ||
      next.sites.some(Boolean)
    ) {
      return;
    }
    setSaving(true);
    try {
      const r = await store.providerOps.createClient(actor, {
        displayName: name.trim(),
        industryPackId: packId,
        packageId,
        sites: sites.map((s) => ({ name: s.trim() })),
        billingContact: billing.trim(),
        ...(trial ? { trialDays: days } : {}),
        firstAdmin: { email: email.trim(), displayName: adminName.trim(), roleKey: 'accountOwner' },
      });
      await qc.invalidateQueries({ queryKey: ['providerClients'] });
      await qc.invalidateQueries({ queryKey: ['outbox'] });
      setDone({ clientId: r.client.id, name: r.client.displayName, email: r.invitation.email });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void submit(e);
      }}
      className="flex max-w-xl flex-col gap-4"
    >
      <p className="m-0">{t('provider.newClient.intro')}</p>
      <Field
        id="nc-name"
        label={t('provider.newClient.name')}
        value={name}
        onChange={setName}
        error={errors.name ? t('provider.newClient.error.name') : undefined}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="nc-pack" className="font-semibold">
          {t('provider.newClient.pack')}
        </label>
        <select
          id="nc-pack"
          value={packId}
          onChange={(e) => {
            setPackId(e.target.value);
          }}
          className={`${fieldClass} self-start`}
        >
          {orderedPacks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.status === 'stub' ? `${p.name} ${t('provider.newClient.stubFlag')}` : p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="nc-package" className="font-semibold">
          {t('provider.newClient.package')}
        </label>
        <select
          id="nc-package"
          value={packageId}
          onChange={(e) => {
            setPackageId(e.target.value);
          }}
          className={`${fieldClass} self-start`}
        >
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="font-semibold">{t('provider.newClient.billing')}</legend>
        {[true, false].map((isTrial) => (
          <label key={String(isTrial)} className="inline-flex min-h-[var(--target-min)] items-center gap-2">
            <input
              type="radio"
              name="nc-billing"
              checked={trial === isTrial}
              onChange={() => {
                setTrial(isTrial);
              }}
              className="h-5 w-5"
            />
            {isTrial ? t('provider.newClient.trial') : t('provider.newClient.paid')}
          </label>
        ))}
      </fieldset>
      {trial ? (
        <Field
          id="nc-days"
          type="number"
          label={t('provider.newClient.trialDays')}
          value={trialDays}
          onChange={setTrialDays}
          error={errors.trialDays ? t('provider.newClient.error.trialDays') : undefined}
        />
      ) : null}
      <Field
        id="nc-billing-contact"
        label={t('provider.newClient.billingContact')}
        hint={t('provider.newClient.billingContactHint')}
        value={billing}
        onChange={setBilling}
        error={errors.billingContact ? t('provider.newClient.error.billingContact') : undefined}
      />
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="font-semibold">{t('provider.newClient.sitesHeading')}</legend>
        {sites.map((s, i) => (
          <Field
            key={i}
            id={`nc-site-${String(i)}`}
            label={t('provider.newClient.site')}
            value={s}
            onChange={(v) => {
              setSites(sites.map((x, n) => (n === i ? v : x)));
            }}
            error={errors.sites[i] ? t('provider.newClient.error.site') : undefined}
          />
        ))}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setSites([...sites, '']);
          }}
        >
          {t('provider.newClient.addSite')}
        </Button>
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="font-semibold">{t('provider.newClient.adminHeading')}</legend>
        <Field
          id="nc-admin-name"
          label={t('provider.newClient.adminName')}
          value={adminName}
          onChange={setAdminName}
          error={errors.adminName ? t('provider.newClient.error.adminName') : undefined}
        />
        <Field
          id="nc-admin-email"
          type="email"
          label={t('provider.newClient.adminEmail')}
          value={email}
          onChange={setEmail}
          error={errors.email ? t('provider.newClient.error.email') : undefined}
        />
        <p className="m-0 font-semibold">{t('provider.newClient.adminRole')}</p>
        <p className="m-0">{t('provider.newClient.twoFactor')}</p>
      </fieldset>
      {failed ? <p role="alert">{t('provider.newClient.saveError')}</p> : null}
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? t('provider.newClient.saving') : t('provider.newClient.submit')}
      </Button>
    </form>
  );
}

/** P4: the New client wizard. Needs clients.write (checked with holdsAnywhere, never a role name). */
export function NewClient() {
  const t = useT();
  const perms = usePermissions();
  if (!perms.data) return <p>{t('shell.loading')}</p>;
  return (
    <>
      <PageHeader title={t('provider.newClient.title')} />
      {holdsAnywhere(perms.data, 'clients.write') ? (
        <Wizard />
      ) : (
        <p role="alert">{t('provider.newClient.noPermission')}</p>
      )}
    </>
  );
}

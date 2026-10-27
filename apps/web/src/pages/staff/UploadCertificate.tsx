import { useState } from 'react';
import { useParams } from 'react-router';
import { PageHeader } from '@sta/ui';
import { useT } from '../../app/hooks';
import { UploadForm } from '../evidence/UploadForm';
import { focusLink } from './styles';
import { useStaffData } from './queries';

/** S17: a person sends a certificate from an outside course to be checked. */
export function UploadCertificate() {
  const t = useT();
  const { requirementId } = useParams();
  const q = useStaffData();
  // Once sent, the page keeps showing the confirmation even though the request now reads as waiting.
  const [sentHere, setSentHere] = useState(false);
  const back = (
    <a href="#/staff/progress" className={`inline-flex min-h-[var(--target-min)] items-center underline ${focusLink}`}>
      {t('evidenceFlow.backToProgress')}
    </a>
  );
  const header = <PageHeader title={t('evidenceFlow.uploadTitle')} />;
  if (q.isError) return <p role="alert">{t('staff.progress.loadError')}</p>;
  if (!q.data) {
    return <p>{t('shell.loading')}</p>;
  }
  const row = q.data.summary.rows.find((r) => r.requirement.id === requirementId);
  if (!row?.requirement.acceptsExternal) {
    return (
      <>
        {header}
        <p role="alert">{t('evidenceFlow.notTaken')}</p>
        {back}
      </>
    );
  }
  const open = q.data.submissions.find(
    (s) =>
      s.requirementId === row.requirement.id &&
      (s.status === 'awaitingCheck' || s.status === 'needsBetterCopy' || s.status === 'rejected'),
  );
  const again = open && open.status !== 'awaitingCheck' ? open : undefined;
  return (
    <>
      {header}
      <p className="mt-0 text-lg font-semibold">{row.requirement.name}</p>
      {again?.decisionNote ? <p>{again.decisionNote}</p> : null}
      {open?.status === 'awaitingCheck' && !sentHere ? (
        <p>{t('evidenceFlow.alreadyWaiting')}</p>
      ) : (
        <UploadForm
          requirement={row.requirement}
          personId={q.data.personId}
          siteId={q.data.siteId}
          onSent={() => {
            setSentHere(true);
          }}
          {...(again ? { resubmitting: again } : {})}
        />
      )}
      <div className="mt-4">{back}</div>
    </>
  );
}

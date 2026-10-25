import { useNavigate } from 'react-router';
import { Button, Dialog } from '@sta/ui';
import { useDemo, useT } from '../app/hooks';

export function DemoMenu({
  open,
  onClose,
  onOpenPresenter,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPresenter: () => void;
}) {
  const t = useT();
  const demo = useDemo();
  const navigate = useNavigate();
  // Read at render, and only when open, so tests can stub the build constants.
  const version = open ? __APP_VERSION__ : '';
  const built = open ? __BUILD_DATE__ : '';
  const industry = t(demo.state.industry === 'nursery' ? 'demo.industryNursery' : 'demo.industryLuxuryRetail');
  return (
    <Dialog open={open} title={t('demo.menu')} onClose={onClose}>
      {open ? (
        <>
          <p className="m-0">{t('demo.version', { version })}</p>
          <p className="m-0">{t('demo.builtOn', { date: built })}</p>
          <p className="mt-0 mb-4">{t('demo.currentIndustry', { industry })}</p>
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                void navigate('/');
              }}
            >
              {t('demo.changeIndustry')}
            </Button>
            <Button variant="secondary" onClick={onOpenPresenter}>
              {t('demo.openPresenter')}
            </Button>
            <Button variant="quiet" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

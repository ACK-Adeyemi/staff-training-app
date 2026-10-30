import { useNavigate } from 'react-router';
import { Button, Dialog } from '@sta/ui';
import { useDemo, useT } from '../app/hooks';
import { usePwa } from '../app/usePwa';
import { saveTour, useStoredTour } from './tourStore';
import { useTourStart } from './useTourStart';

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
  const pwa = usePwa();
  const navigate = useNavigate();
  const stored = useStoredTour();
  const starter = useTourStart();
  const tourOn = stored !== null && stored.state.status !== 'complete';
  // Read at render, and only when open, so tests can stub the build constants.
  const version = open ? __APP_VERSION__ : '';
  const built = open ? __BUILD_DATE__ : '';
  const industry = t(demo.state.industry === 'nursery' ? 'demo.industryNursery' : 'demo.industryLuxuryRetail');
  return (
    <>
      <Dialog open={open} title={t('demo.menu')} onClose={onClose}>
        {open ? (
          <>
            <p className="m-0">
              <span>{t('demo.version', { version })}</span>
              {pwa.needRefresh ? <span> {t('pwa.updateAvailable')}</span> : null}
            </p>
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
              {tourOn ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    starter.ask(stored.tour.id);
                  }}
                >
                  {t('tour.restartTour')}
                </Button>
              ) : null}
              {tourOn ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    saveTour({ ...stored.state, status: 'active' });
                    onClose();
                  }}
                >
                  {t('tour.resumeTour')}
                </Button>
              ) : null}
              <Button variant="quiet" onClick={onClose}>
                {t('common.close')}
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
      {starter.dialog}
    </>
  );
}

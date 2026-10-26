import { Button, Card, PageHeader, SegmentedControl, Switch } from '@sta/ui';
import type { AppliedDisplayPrefs, DisplayPatch } from '@sta/domain';
import { useT } from '../../app/hooks';
import { useDisplayPrefs } from '../../app/display/context';

const TEXT_SIZES = [1, 1.25, 1.5, 1.75, 2];
const ZOOMS = [1, 1.25, 1.5];
const RATES = [0.75, 1, 1.25, 1.5];
const percent = (n: number) => `${Math.round(n * 100)}%`;
const num = (v: string) => Number(v);

/** S12, also served at #/client/display. */
export function Display() {
  const t = useT();
  const { prefs, update, reset, saveFailed } = useDisplayPrefs();
  const change = (patch: DisplayPatch) => {
    void update(patch);
  };
  const toggle = (key: 'simpleView' | 'reduceMotion' | 'sound' | 'haptics' | 'biggerButtons' | 'readAloud') => ({
    checked: prefs[key],
    onChange: (checked: boolean) => {
      change({ [key]: checked });
    },
    onLabel: t('display.on'),
    offLabel: t('display.off'),
  });
  const pick = <K extends keyof AppliedDisplayPrefs>(key: K, value: AppliedDisplayPrefs[K]) => {
    change({ [key]: value });
  };
  const rowClass = 'flex flex-col gap-4';
  return (
    <>
      <PageHeader title={t('display.title')} />
      <p className="mt-0">{t('display.intro')}</p>
      {saveFailed ? <p role="alert">{t('display.saveError')}</p> : null}
      <div className={rowClass}>
        <Switch label={t('display.simpleView')} {...toggle('simpleView')} />
        <p className="m-0 text-sm">{t('display.simpleViewHelp')}</p>
        <SegmentedControl
          legend={t('display.textSize')}
          options={TEXT_SIZES.map((n) => ({ value: String(n), label: percent(n) }))}
          value={String(prefs.textScale)}
          onChange={(v) => {
            pick('textScale', num(v));
          }}
        />
        <SegmentedControl
          legend={t('display.displayZoom')}
          options={ZOOMS.map((n) => ({ value: String(n), label: percent(n) }))}
          value={String(prefs.uiScale)}
          onChange={(v) => {
            pick('uiScale', num(v));
          }}
        />
        <SegmentedControl
          legend={t('display.contrast')}
          options={[
            { value: 'standard', label: t('display.contrastStandard') },
            { value: 'high', label: t('display.contrastHigh') },
          ]}
          value={prefs.contrast}
          onChange={(v) => {
            pick('contrast', v as AppliedDisplayPrefs['contrast']);
          }}
        />
        <SegmentedControl
          legend={t('display.colourMode')}
          options={[
            { value: 'auto', label: t('display.colourAuto') },
            { value: 'light', label: t('display.colourLight') },
            { value: 'dark', label: t('display.colourDark') },
          ]}
          value={prefs.colourMode}
          onChange={(v) => {
            pick('colourMode', v as AppliedDisplayPrefs['colourMode']);
          }}
        />
        <Switch label={t('display.reduceMotion')} {...toggle('reduceMotion')} />
        <Switch label={t('display.sound')} {...toggle('sound')} />
        <Switch label={t('display.haptics')} {...toggle('haptics')} />
        <SegmentedControl
          legend={t('display.spacing')}
          options={[
            { value: 'standard', label: t('display.spacingStandard') },
            { value: 'wide', label: t('display.spacingWide') },
          ]}
          value={prefs.spacing}
          onChange={(v) => {
            pick('spacing', v as AppliedDisplayPrefs['spacing']);
          }}
        />
        <Switch
          label={t('display.dyslexiaFont')}
          checked={prefs.readingFont === 'dyslexiaFriendly'}
          onChange={(checked) => {
            pick('readingFont', checked ? 'dyslexiaFriendly' : 'default');
          }}
          onLabel={t('display.on')}
          offLabel={t('display.off')}
        />
        <Switch label={t('display.biggerButtons')} {...toggle('biggerButtons')} />
        <Switch label={t('display.readAloud')} {...toggle('readAloud')} />
        <SegmentedControl
          legend={t('display.readAloudSpeed')}
          options={RATES.map((n) => ({ value: String(n), label: `${n}x` }))}
          value={String(prefs.readAloudRate)}
          onChange={(v) => {
            pick('readAloudRate', num(v) as AppliedDisplayPrefs['readAloudRate']);
          }}
        />
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              void reset();
            }}
          >
            {t('display.reset')}
          </Button>
        </div>
      </div>
      <section aria-labelledby="display-preview-title" data-testid="display-preview" className="mt-6">
        <Card>
          <h2 id="display-preview-title" className="mt-0 text-lg font-bold">
            {t('display.previewTitle')}
          </h2>
          <h3 className="m-0 font-bold">{t('display.previewHeading')}</h3>
          <p>{t('display.previewBody')}</p>
          <Button variant="secondary" tabIndex={-1} aria-hidden="true">
            {t('display.previewButton')}
          </Button>
        </Card>
      </section>
    </>
  );
}

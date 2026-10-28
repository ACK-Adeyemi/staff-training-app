// The list and month views shared by S18 (staff) and C28 (client admin): View switch, the agenda groups, See further,
// the month grid, and the .ics downloads. The page decides which items exist and what each item's button does.
import { useMemo, useState, type ReactNode } from 'react';
import { londonDateString, type CalendarItem, type CalendarRange, type IcsItem } from '@sta/domain';
import { Agenda, Button, MonthGrid, SegmentedControl, type AgendaGroup, type AgendaItem } from '@sta/ui';
import { downloadIcs } from '../../app/ics';
import { useT } from '../../app/hooks';
import { formatLondonDate } from '../../demo/format';

export type ItemAction = { label: string; onClick: () => void };

export type CalendarBodyProps = {
  now: Date;
  /** The items in a range of London dates (both inclusive), already filtered. */
  compute: (range: CalendarRange) => CalendarItem[];
  titleOf: (item: CalendarItem) => string;
  actionFor?: (item: CalendarItem) => ItemAction | undefined;
  /** Staff may add one item to their phone calendar. */
  perItemIcs: boolean;
  /** The .ics events for the items listed (admins get titles without names). */
  icsItems: (items: CalendarItem[]) => IcsItem[];
  /** Extra buttons beside Download all, for example Print. */
  toolbar?: ReactNode;
};

const STEP_DAYS = 90;
const MAX_DAYS = 365;

const shift = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const mondayOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return shift(date, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
};
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function groupKey(date: string, today: string): 'today' | 'week' | 'next' | 'later' {
  if (date <= today) return 'today';
  const thisSunday = shift(mondayOf(today), 6);
  if (date <= thisSunday) return 'week';
  if (date <= shift(thisSunday, 7)) return 'next';
  return 'later';
}

export function CalendarBody(props: CalendarBodyProps) {
  const t = useT();
  const { now, compute, titleOf, actionFor, perItemIcs, icsItems, toolbar } = props;
  const today = londonDateString(now);
  const [view, setView] = useState('list');
  const [days, setDays] = useState(STEP_DAYS);
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [downloaded, setDownloaded] = useState(false);

  const listed = useMemo(() => compute({ from: today, to: shift(today, days) }), [compute, today, days]);
  const first = `${String(month.y).padStart(4, '0')}-${String(month.m).padStart(2, '0')}-01`;
  const last = shift(
    `${month.m === 12 ? month.y + 1 : month.y}-${String(month.m === 12 ? 1 : month.m + 1).padStart(2, '0')}-01`,
    -1,
  );
  const monthItems = useMemo(() => compute({ from: first, to: last }), [compute, first, last]);

  const download = (items: IcsItem[], name: string) => {
    downloadIcs(items, now, name);
    setDownloaded(true);
  };
  const agendaItem = (item: CalendarItem): AgendaItem => {
    const title = titleOf(item);
    const action = actionFor?.(item);
    return {
      id: item.id,
      title,
      detail: formatLondonDate(item.date),
      kind: item.kind,
      ...(action ? { actionLabel: action.label, onAction: action.onClick } : {}),
      ...(perItemIcs
        ? {
            extraActions: [
              {
                label: t('calendar.addToPhone'),
                ariaLabel: t('calendar.addToPhoneFor', { title }),
                onClick: () => {
                  download(icsItems([item]), 'calendar-item.ics');
                },
              },
            ],
          }
        : {}),
    };
  };

  const groups: AgendaGroup[] = (
    [
      ['today', t('calendar.groupToday')],
      ['week', t('calendar.groupThisWeek')],
      ['next', t('calendar.groupNextWeek')],
      ['later', t('calendar.groupLater')],
    ] as const
  ).map(([key, heading]) => ({
    heading,
    items: listed.filter((i) => groupKey(i.date, today) === key).map(agendaItem),
  }));

  const counts: Record<string, number> = {};
  for (const i of monthItems) counts[i.date] = (counts[i.date] ?? 0) + 1;
  const moveMonth = (by: number) => {
    const index = month.y * 12 + (month.m - 1) + by;
    setMonth({ y: Math.floor(index / 12), m: (index % 12) + 1 });
    setPicked(undefined);
  };
  const monthTitle = monthName.format(new Date(Date.UTC(month.y, month.m - 1, 1)));
  const dayNames = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((d) => t(`calendar.day.${d}`));
  const pickedItems = picked ? monthItems.filter((i) => i.date === picked) : [];

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        legend={t('calendar.view')}
        options={[
          { value: 'list', label: t('calendar.list') },
          { value: 'month', label: t('calendar.month') },
        ]}
        value={view}
        onChange={setView}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            download(icsItems(view === 'month' ? monthItems : listed), 'calendar.ics');
          }}
        >
          {t('calendar.downloadAll')}
        </Button>
        {toolbar}
      </div>
      {downloaded ? <p role="status">{t('calendar.downloaded')}</p> : null}
      {view === 'list' ? (
        <>
          <Agenda groups={groups} emptyText={t('calendar.empty')} />
          {days < MAX_DAYS ? (
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  setDays((d) => Math.min(MAX_DAYS, d + STEP_DAYS));
                }}
              >
                {t('calendar.seeFurther')}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                moveMonth(-1);
              }}
            >
              {t('calendar.previous')}
            </Button>
            <h2 className="m-0 text-xl font-bold">{monthTitle}</h2>
            <Button
              variant="secondary"
              onClick={() => {
                moveMonth(1);
              }}
            >
              {t('calendar.next')}
            </Button>
          </div>
          <MonthGrid
            label={monthTitle}
            year={month.y}
            month={month.m}
            weekStartsOn={1}
            dayNames={dayNames}
            counts={counts}
            countLabel={(n, iso) => t('calendar.countLabel', { count: n, date: formatLondonDate(iso) })}
            selected={picked}
            onSelect={setPicked}
            listLabel={t('calendar.monthList')}
            showListLabel={t('calendar.showAsList')}
            hideListLabel={t('calendar.showAsGrid')}
            listItems={monthItems.map((i) => ({ date: formatLondonDate(i.date), text: titleOf(i) }))}
          />
          {picked ? (
            <Agenda
              groups={[{ heading: formatLondonDate(picked), items: pickedItems.map(agendaItem) }]}
              emptyText={t('calendar.noItemsDay')}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

// S18 Calendar (brief 28.2): the person's own dates in Today, This week, Next week and Later, a month view, an action
// on each item, and .ics downloads (one item, or everything listed). Staff see only their own items.
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@sta/ui';
import { calendarItems, type CalendarItem, type CalendarRange } from '@sta/domain';
import { useClock, useT } from '../../app/hooks';
import { CalendarBody, type ItemAction } from '../calendar/CalendarBody';
import { itemTitle } from '../calendar/titles';
import { useStaffCalendar } from './calendarQueries';

export function Calendar() {
  const t = useT();
  const clock = useClock();
  const navigate = useNavigate();
  const q = useStaffCalendar();
  const now = clock.now();
  const data = q.data;
  const nowKey = now.getTime();

  const compute = useCallback(
    (range: CalendarRange): CalendarItem[] => {
      if (!data) return [];
      return calendarItems(
        {
          audience: 'staff',
          person: data.person,
          sites: [data.site],
          requirements: data.requirements,
          evidence: data.evidence,
          submissions: data.submissions,
          assignments: data.assignments,
          modules: data.modules,
          competitions: data.competitions,
          amberWindowDays: data.amberWindowDays,
          now: new Date(nowKey),
        },
        range,
      );
    },
    [data, nowKey],
  );

  const actionFor = useMemo(() => {
    const go = (label: string, path: string): ItemAction => ({
      label,
      onClick: () => {
        void navigate(path);
      },
    });
    return (item: CalendarItem): ItemAction | undefined => {
      switch (item.kind) {
        case 'assignmentDue':
        case 'refresherStart': {
          const moduleId =
            item.moduleId ??
            data?.requirements
              .find((r) => r.id === item.requirementId)
              ?.satisfiedByModuleIds.find((id) => data.modules.some((m) => m.id === id && m.status === 'published'));
          return moduleId ? go(t('calendar.startTraining'), `/staff/module/${moduleId}`) : undefined;
        }
        case 'awaitingCheck':
        case 'expiry':
          return go(t('calendar.seeCompliance'), '/staff/progress');
        case 'competitionStart':
        case 'competitionEnd':
        case 'competitionWinners':
          return go(t('calendar.seeCompetitions'), '/staff/compete');
        case 'weeklyGoal':
          return go(t('calendar.seeProgress'), '/staff/progress');
        default:
          return undefined;
      }
    };
  }, [data, navigate, t]);

  if (q.isError) {
    return (
      <>
        <PageHeader title={t('calendar.title')} />
        <p role="alert">{t('calendar.loadError')}</p>
      </>
    );
  }
  return (
    <>
      <PageHeader title={t('calendar.title')} />
      <p className="mt-0">{t('calendar.staff.intro')}</p>
      {data ? (
        <CalendarBody
          now={now}
          compute={compute}
          titleOf={(item) => itemTitle(t, item)}
          actionFor={actionFor}
          perItemIcs
          icsItems={(items) => items.map((i) => ({ id: i.id, title: itemTitle(t, i), date: i.date }))}
        />
      ) : (
        <p>{t('shell.loading')}</p>
      )}
    </>
  );
}

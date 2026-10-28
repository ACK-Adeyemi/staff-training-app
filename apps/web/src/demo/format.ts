const zone = 'Europe/London';
const dayFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: zone });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: zone });

/** "Monday 19 October 2026", in London time. */
export const formatLondonDay = (date: Date): string => dayFormat.format(date);
/** "19 October 2026 at 09:30", in London time. */
export const formatLondonDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: zone });
/** "2 November 2026", in London time. */
export const formatLondonDate = (iso: string): string => dateFormat.format(new Date(iso));

const shortFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: zone });
/** "2 Nov", in London time. */
export const formatLondonShort = (iso: string): string => shortFormat.format(new Date(iso));

const poundsFormat = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
/** "£12.34" from pence. */
export const formatPounds = (pence: number): string => poundsFormat.format(pence / 100);

const dayMonthYearFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: zone,
});
/** "1 Dec 2026", in London time. */
export const formatLondonDayMonthYear = (iso: string): string => dayMonthYearFormat.format(new Date(iso));

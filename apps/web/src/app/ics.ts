// Downloads calendar items as a .ics file (brief 28.2, plan M3 assumption 33). The file itself is built by the domain
// `toIcs`; this only hands it to the browser as text/calendar.
import { toIcs, type IcsItem } from '@sta/domain';

export function downloadIcs(items: IcsItem[], now: Date, filename: string): void {
  // DTSTAMP is the time the file was made, to the hour: the same file for the same hour, and no seconds to drift.
  const stamp = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const text = toIcs(items, { now: stamp });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

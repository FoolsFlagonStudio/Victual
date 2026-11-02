// Local-date helpers. Plans use local calendar dates (YYYY-MM-DD), never UTC,
// so "today" matches the user's clock.
import type { DayOfWeek } from '@/api/preferences';

export const DAY_ORDER: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export const todayISO = () => toISO(new Date());
export const dayOfWeek = (iso: string): DayOfWeek => DAY_ORDER[fromISO(iso).getDay()];

/** Most recent `startDay` on or before `iso`. */
export function weekStartFor(iso: string, startDay: DayOfWeek): string {
  const back = (fromISO(iso).getDay() - DAY_ORDER.indexOf(startDay) + 7) % 7;
  return addDays(iso, -back);
}

/** The day before `day`, e.g. SUNDAY -> SATURDAY. */
export const dayBefore = (day: DayOfWeek): DayOfWeek => DAY_ORDER[(DAY_ORDER.indexOf(day) + 6) % 7];

export const dayLabel = (day: DayOfWeek) => day.charAt(0) + day.slice(1).toLowerCase();

/** "Oct 26 - Nov 1", or "Oct 18 - 24" within one month. */
export function formatRange(startISO: string, endISO: string, long = false): string {
  const a = fromISO(startISO);
  const b = fromISO(endISO);
  const m = long ? MONTHS_LONG : MONTHS;
  return a.getMonth() === b.getMonth()
    ? `${m[a.getMonth()]} ${a.getDate()} - ${b.getDate()}`
    : `${m[a.getMonth()]} ${a.getDate()} - ${m[b.getMonth()]} ${b.getDate()}`;
}

export const shortDate = (iso: string) => {
  const d = fromISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

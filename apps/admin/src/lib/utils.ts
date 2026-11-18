import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** One formatter for the whole admin: building an `Intl.DateTimeFormat`
 * costs far more than calling `format` (MDN: reuse the object when formatting
 * many dates). Every table row used to build its own — on /users that was a
 * long task on a slow CPU (Lighthouse, 2026-11-09). */
let dateTimeRu: Intl.DateTimeFormat | null = null;
const makeDateTimeRu = () => (dateTimeRu ??= new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }));

// Building the formatter loads the locale's date data: ~20–30 ms at CPU x4
// inside the render that shows the first table rows (Admin Lighthouse trace,
// 2026-11-17). Build it in its own short task right after the app's scripts
// start, while the page still waits for its data (requestIdleCallback came
// too late: the loading page is never idle before that render). If a render
// needs it first, formatDateTime builds it on the spot as before.
if (typeof window !== 'undefined') window.setTimeout(() => void makeDateTimeRu().format(0), 0);

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return makeDateTimeRu().format(new Date(iso));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} д ${h % 24} ч`;
  if (h > 0) return `${h} ч ${Math.floor((seconds % 3600) / 60)} мин`;
  return `${Math.floor(seconds / 60)} мин`;
}

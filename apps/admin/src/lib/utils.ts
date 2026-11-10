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

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  dateTimeRu ??= new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  return dateTimeRu.format(new Date(iso));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} д ${h % 24} ч`;
  if (h > 0) return `${h} ч ${Math.floor((seconds % 3600) / 60)} мин`;
  return `${Math.floor(seconds / 60)} мин`;
}

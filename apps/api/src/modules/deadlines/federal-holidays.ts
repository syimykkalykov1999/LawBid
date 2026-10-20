import {
  addDaysIso,
  formatIsoDate,
  isoWeekday,
} from '../../common/utils/zoned-time';

export interface Holiday {
  date: string;
  names: { en: string; ru: string };
}

/** The n-th [weekday] (1 = Mon … 7 = Sun) of a month; n = -1 is the last. */
function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number,
): string {
  if (n > 0) {
    const first = isoWeekday(year, month, 1);
    const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    return formatIsoDate(year, month, day);
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastWd = isoWeekday(year, month, lastDay);
  return formatIsoDate(year, month, lastDay - ((lastWd - weekday + 7) % 7));
}

/**
 * The federal legal holidays (5 U.S.C. 6103) on the days the courts close:
 * a holiday on a Saturday is observed on the Friday before, one on a Sunday
 * on the Monday after (the same dates the seed holds). Open data.
 */
export function federalHolidays(year: number): Holiday[] {
  const fixed: [number, number, string, string][] = [
    [1, 1, "New Year's Day", 'Новый год'],
    [6, 19, 'Juneteenth', 'Juneteenth'],
    [7, 4, 'Independence Day', 'День независимости'],
    [11, 11, 'Veterans Day', 'День ветеранов'],
    [12, 25, 'Christmas Day', 'Рождество'],
  ];
  const out: Holiday[] = [];
  for (const [m, d, en, ru] of fixed) {
    const date = formatIsoDate(year, m, d);
    const wd = isoWeekday(year, m, d);
    if (wd === 6) {
      out.push({
        date: addDaysIso(date, -1),
        names: { en: `${en} (observed)`, ru: `${ru} (выходной перенесён)` },
      });
    } else if (wd === 7) {
      out.push({
        date: addDaysIso(date, 1),
        names: { en: `${en} (observed)`, ru: `${ru} (выходной перенесён)` },
      });
    } else {
      out.push({ date, names: { en, ru } });
    }
  }
  const floating: [string, string, string][] = [
    [
      nthWeekday(year, 1, 1, 3),
      'Martin Luther King Jr. Day',
      'День Мартина Лютера Кинга',
    ],
    [
      nthWeekday(year, 2, 1, 3),
      "Washington's Birthday",
      'День рождения Вашингтона',
    ],
    [nthWeekday(year, 5, 1, -1), 'Memorial Day', 'День памяти'],
    [nthWeekday(year, 9, 1, 1), 'Labor Day', 'День труда'],
    [nthWeekday(year, 10, 1, 2), 'Columbus Day', 'День Колумба'],
    [nthWeekday(year, 11, 4, 4), 'Thanksgiving Day', 'День благодарения'],
  ];
  for (const [date, en, ru] of floating) out.push({ date, names: { en, ru } });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

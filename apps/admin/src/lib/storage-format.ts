const UNITS = ['КБ', 'МБ', 'ГБ', 'ТБ'];

/** Bytes for people: 1536 → «1,5 КБ», 5 GiB → «5 ГБ». */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString('ru-RU', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${UNITS[i]}`;
}

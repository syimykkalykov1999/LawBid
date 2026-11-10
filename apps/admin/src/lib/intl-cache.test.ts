import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Intl formatters are built once (Lighthouse 2026-11-09: /users TBT)', () => {
  it('formatDateTime builds one Intl.DateTimeFormat for any number of rows', async () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat');
    const { formatDateTime } = await import('./utils');
    const iso = '2026-11-09T15:04:00.000Z';
    const first = formatDateTime(iso);
    for (let i = 0; i < 50; i++) expect(formatDateTime(iso)).toBe(first);
    expect(formatDateTime(null)).toBe('—');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(first).toMatch(/09\.11\.2026/);
  });

  it('usd builds one Intl.NumberFormat per digit count', async () => {
    const spy = vi.spyOn(Intl, 'NumberFormat');
    const { usd } = await import('./labels');
    expect(usd(12345)).toBe('$123');
    expect(usd(12345)).toBe('$123');
    expect(usd(12345, 2)).toBe('$123.45');
    expect(usd(null)).toBe('—');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

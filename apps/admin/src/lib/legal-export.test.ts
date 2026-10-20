import { describe, expect, it } from 'vitest';
import { dayBound, formatBytes, hasActiveExport, legalJustification } from './legal-export';

describe('legal export helpers', () => {
  it('builds an encoded justification of at least 10 characters', () => {
    const j = decodeURIComponent(legalJustification('повестка', 'A-1', 'ФБР'));
    expect(j.length).toBeGreaterThanOrEqual(10);
    expect(j).toContain('A-1');
  });

  it('turns a date into the start / end of that UTC day', () => {
    expect(dayBound('2026-10-20', false)).toBe('2026-10-20T00:00:00.000Z');
    expect(dayBound('2026-10-20', true)).toBe('2026-10-20T23:59:59.999Z');
    expect(dayBound('', false)).toBeUndefined();
  });

  it('formats sizes', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(2048)).toBe('2.0 КБ');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 МБ');
  });

  it('knows when to keep polling', () => {
    expect(hasActiveExport([{ status: 'ready' }])).toBe(false);
    expect(hasActiveExport([{ status: 'ready' }, { status: 'running' }])).toBe(true);
    expect(hasActiveExport(undefined)).toBe(false);
  });
});

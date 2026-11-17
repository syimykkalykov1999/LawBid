import { describe, expect, it } from 'vitest';
import { asReport, formatMetric, hashVersionLabel, HASH_VERSION_OPTIONS, parseVariantWeights, statusLabel, verdictLabel } from './experiments';
import { SECTIONS, canOpen } from './rbac';

describe('experiments page helpers', () => {
  it('names the two ways of splitting people, the new one first (row 150)', () => {
    expect(HASH_VERSION_OPTIONS.map((o) => o.value)).toEqual([2, 1]);
    expect(hashVersionLabel(2)).toBe('новое');
    expect(hashVersionLabel(1)).toBe('старое');
  });

  it('speaks plain Russian', () => {
    expect(statusLabel('running')).toBe('идёт');
    expect(verdictLabel('few')).toBe('мало данных');
    expect(verdictLabel('better')).toBe('лучше');
  });

  it('formats shares, hours and per-1000 with the interval', () => {
    expect(formatMetric('share', { value: 0.1234, low: 0.1, high: 0.15, n: 10 })).toBe('12,3% (10,0-15,0)');
    expect(formatMetric('hours', { value: 12, low: 10.5, high: 13.5, n: 10 })).toBe('12,0 ч (10,5-13,5)');
    expect(formatMetric('per1000', { value: 2, low: 1, high: 3, n: 10 })).toBe('2,0 (1,0-3,0)');
  });

  it('reads a loose report safely', () => {
    expect(asReport({}).metrics).toEqual([]);
    expect(asReport({ metrics: [{ key: 'ctr' }] }).metrics).toHaveLength(1);
  });

  it('the page is in the menu and only the owner opens it', () => {
    expect(SECTIONS.map((s) => s.href)).toContain('/experiments');
    const mod = { role: 'moderator' as const, permissions: { moderation: 'manage' as const } };
    expect(canOpen(mod, '/experiments')).toBe(false);
  });

  it('reads the new variant weights of a surface (owner 2026-11-08)', () => {
    expect(parseVariantWeights('', 'case_feed')).toEqual({ weights: {} });
    expect(parseVariantWeights('urgency=0.3, practice: 0,2', 'case_feed')).toEqual({
      weights: { urgency: 0.3, practice: 0.2 },
    });
    expect(parseVariantWeights('hot=0.5', 'case_feed')).toHaveProperty('error');
    expect(parseVariantWeights('urgency=11', 'case_feed')).toHaveProperty('error');
    expect(parseVariantWeights('urgency', 'case_feed')).toHaveProperty('error');
  });
});

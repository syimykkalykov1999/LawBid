import { describe, expect, it } from 'vitest';
import { KIND_LABEL, marginText } from './pnl';

describe('pnl labels', () => {
  it('margin text', () => {
    expect(marginText(null)).toBe('нет дохода');
    expect(marginText(56.82)).toContain('56,8');
  });
  it('every source has a Russian label', () => {
    for (const k of ['subscriptions', 'seats', 'promotions', 'client_subscriptions', 'stars', 'bid_packs']) {
      expect(KIND_LABEL[k]).toBeTruthy();
    }
  });
});

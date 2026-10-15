import {
  DEFAULT_PROMOTION_SETTINGS,
  isAllowedAdLink,
  parsePromotionSettings,
} from './promotions.settings';

describe('boost settings (owner 2026-10-15)', () => {
  it('ads are 1 per 12 by default and clamp to 10–15', () => {
    expect(DEFAULT_PROMOTION_SETTINGS.feedEveryN).toBe(12);
    expect(DEFAULT_PROMOTION_SETTINGS.reelEveryN).toBe(12);
    const s = parsePromotionSettings({ feedEveryN: 3, reelEveryN: 40 });
    expect(s.feedEveryN).toBe(DEFAULT_PROMOTION_SETTINGS.feedEveryN);
    expect(s.reelEveryN).toBe(DEFAULT_PROMOTION_SETTINGS.reelEveryN);
    expect(parsePromotionSettings({ feedEveryN: 15 }).feedEveryN).toBe(15);
  });

  it('keeps only known button types', () => {
    const s = parsePromotionSettings({ ctaTypes: ['call', 'x', 'more'] });
    expect(s.ctaTypes).toEqual(['call', 'more']);
  });
});

describe('isAllowedAdLink', () => {
  it.each([
    ['https://smith-law.com/contact', true],
    ['http://smith-law.com', false],
    ['https://bit.ly/abc', false],
    ['https://wa.me/123', false],
    ['https://t.me/x', false],
    ['https://127.0.0.1/x', false],
    ['https://user:pw@smith-law.com', false],
    ['smith-law.com', false],
  ])('%s → %s', (url, ok) => {
    expect(isAllowedAdLink(url)).toBe(ok);
  });
});

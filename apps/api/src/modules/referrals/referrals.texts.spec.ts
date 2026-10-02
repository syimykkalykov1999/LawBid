import {
  REFERRAL_CODE_PATTERN,
  normalizeReferralCode,
} from './referral-code.util';
import {
  DEFAULT_REFERRAL_TEXTS,
  parseReferralSettings,
  parseReferralTexts,
  renderReferralText,
} from './referrals.settings';

describe('referral texts and vanity codes', () => {
  it('fills {{code}} and {{url}} and leaves other text alone', () => {
    expect(
      renderReferralText('Hi {{code}} / {{ url }} / {{x}}', {
        code: 'SIMA2026',
        url: 'https://x/r/SIMA2026',
      }),
    ).toBe('Hi SIMA2026 / https://x/r/SIMA2026 / {{x}}');
  });

  it('falls back field by field to the built-in words', () => {
    const t = parseReferralTexts({
      ru: { title: 'Мой заголовок', terms: '  ' },
    });
    expect(t.ru.title).toBe('Мой заголовок');
    expect(t.ru.terms).toBe(DEFAULT_REFERRAL_TEXTS.ru.terms);
    expect(t.en).toEqual(DEFAULT_REFERRAL_TEXTS.en);
  });

  it('keeps old settings rows valid (no texts, no cap)', () => {
    const s = parseReferralSettings({ enabled: true, applyWindowDays: 7 });
    expect(s.enabled).toBe(true);
    expect(s.maxInvitesPerReferrer).toBe(0);
    expect(s.texts.ru.title).toBe(DEFAULT_REFERRAL_TEXTS.ru.title);
  });

  it('accepts generated and vanity codes, in any case', () => {
    expect(REFERRAL_CODE_PATTERN.test(normalizeReferralCode('k7mx2qp'))).toBe(
      true,
    );
    expect(REFERRAL_CODE_PATTERN.test(normalizeReferralCode('sima-2026'))).toBe(
      true,
    );
    expect(REFERRAL_CODE_PATTERN.test('AB')).toBe(false);
    expect(REFERRAL_CODE_PATTERN.test('A'.repeat(25))).toBe(false);
  });
});

import { nonceClaimMatches, sha256Hex } from './nonce.util';

const RAW = 'r4w-n0nce-0123456789abcdef';

describe('nonceClaimMatches', () => {
  it('apple: accepts only sha256hex(raw)', () => {
    expect(nonceClaimMatches('apple', sha256Hex(RAW), RAW)).toBe(true);
    expect(nonceClaimMatches('apple', RAW, RAW)).toBe(false);
  });

  it('google: accepts the raw nonce or its sha256hex', () => {
    expect(nonceClaimMatches('google', RAW, RAW)).toBe(true);
    expect(nonceClaimMatches('google', sha256Hex(RAW), RAW)).toBe(true);
  });

  it.each(['apple', 'google'] as const)(
    '%s: rejects a missing, non-string, empty, or different claim',
    (provider) => {
      expect(nonceClaimMatches(provider, undefined, RAW)).toBe(false);
      expect(nonceClaimMatches(provider, 42, RAW)).toBe(false);
      expect(nonceClaimMatches(provider, '', RAW)).toBe(false);
      expect(nonceClaimMatches(provider, 'someone-elses-nonce', RAW)).toBe(
        false,
      );
      expect(nonceClaimMatches(provider, sha256Hex('other'), RAW)).toBe(false);
    },
  );

  it('rejects an empty raw nonce even if the claim is sha256("")', () => {
    expect(nonceClaimMatches('google', '', '')).toBe(false);
    expect(nonceClaimMatches('apple', sha256Hex(''), '')).toBe(false);
  });
});

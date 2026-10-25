import { contentHash, countLinks, looksLikeIndividualAdvice } from './qa-spam';

describe('qa-spam', () => {
  it('same words give the same hash', () => {
    expect(contentHash('Can I sue?', 'My boss  fired me!')).toBe(
      contentHash('can i sue', 'my boss fired me'),
    );
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });

  it('counts links', () => {
    expect(countLinks('see https://a.com and www.b.org, plus c.io/x')).toBe(3);
    expect(countLinks('e.g. the U.S. court')).toBe(0);
  });

  it('individualized advice needs two signals', () => {
    expect(
      looksLikeIndividualAdvice(
        'In your case you should file immediately and do not sign anything.',
      ),
    ).toBe(true);
    expect(
      looksLikeIndividualAdvice(
        'You should consult an attorney. Deposit rules differ by state.',
      ),
    ).toBe(false);
  });
});

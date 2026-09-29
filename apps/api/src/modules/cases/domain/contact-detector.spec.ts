import { assertNoContactInfo, containsContactInfo } from './contact-detector';

describe('containsContactInfo (docs/04_CASES_BIDS.md §3.3)', () => {
  it.each([
    ['plain email', 'reach me at john.doe@example.com please'],
    ['obfuscated email (en)', 'email me at john dot doe at gmail dot com'],
    ['obfuscated email (ru)', 'пишите john собака gmail точка com'],
    ['http link', 'see https://example.com/case for details'],
    ['www link', 'check www.example.com'],
    ['bare domain', 'my site is example.com for more info'],
    ['raw phone, dashes', 'call me at 555-123-4567 anytime'],
    ['raw phone, dots', 'call 555.123.4567 now'],
    ['raw phone, parens', 'call (555) 123 4567'],
    [
      'spelled-out phone (en)',
      'call five five five one two three four five six seven',
    ],
    [
      'spelled-out phone (ru)',
      'звоните пять пять пять один два три четыре пять шесть семь',
    ],
  ])('flags %s', (_label, text) => {
    expect(containsContactInfo(text)).toBe(true);
  });

  it.each([
    [
      'ordinary description',
      'My landlord kept my deposit of $1500 for no reason.',
    ],
    [
      'abbreviations',
      'This happened in the U.S. and involves e.g. two parties.',
    ],
    [
      'scattered numbers',
      'I have spent $1,234,567 across 3 states and 2 offices.',
    ],
    ['short number', 'I called them 5 times last week.'],
    ['empty', ''],
  ])('does not flag %s', (_label, text) => {
    expect(containsContactInfo(text)).toBe(false);
  });
});

describe('assertNoContactInfo', () => {
  it('throws CASE_CONTAINS_CONTACT_INFO naming the offending field', () => {
    expect(() =>
      assertNoContactInfo({
        title: 'Need help with a contract',
        description: 'Call me at 555-123-4567',
        city: 'Boston',
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'CASE_CONTAINS_CONTACT_INFO',
          details: { field: 'description' },
        }),
      }),
    );
  });

  it('passes clean fields, skips null/undefined ones', () => {
    expect(() =>
      assertNoContactInfo({
        title: 'Need help with a contract',
        description: 'A landlord dispute over a security deposit.',
        city: undefined,
      }),
    ).not.toThrow();
  });
});

describe('maskContactInfo (docs/05 §8.3)', () => {
  const { maskContactInfo, CONTACT_MASK } =
    jest.requireActual<typeof import('./contact-detector')>(
      './contact-detector',
    );

  it.each([
    ['Call me at (555) 123-4567 today', `Call me at ${CONTACT_MASK} today`],
    ['five five five one two three four', CONTACT_MASK],
    ['mail john.doe@example.com now', `mail ${CONTACT_MASK} now`],
    ['john at example dot com', CONTACT_MASK],
    ['see https://evil.io/x please', `see ${CONTACT_MASK} please`],
    ['visit mysite.com', `visit ${CONTACT_MASK}`],
  ])('%s', (input, expected) => {
    expect(maskContactInfo(input)).toEqual({ text: expected, masked: true });
  });

  it('leaves ordinary text alone', () => {
    expect(maskContactInfo('I got one ticket in 2024, e.g. speeding')).toEqual({
      text: 'I got one ticket in 2024, e.g. speeding',
      masked: false,
    });
  });
});

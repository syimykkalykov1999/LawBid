import { matchesIn, nameKey, phoneKey } from './conflict.logic';

const anna = {
  name: 'Анна Петрова',
  phone: '+14155552680',
  email: 'Anna.P@Example.com',
};

describe('conflict matching', () => {
  it('matches a full name in the text, ignoring case, accents and order of punctuation', () => {
    expect(matchesIn(anna, 'Спор с анна  ПЕТРОВА о залоге')).toEqual(['name']);
    expect(
      matchesIn(
        { name: 'José García', phone: null, email: null },
        'client: jose garcia.',
      ),
    ).toEqual(['name']);
  });

  it('does not match a first name alone or part of a longer word', () => {
    expect(matchesIn(anna, 'Анна живёт в Петрозаводске')).toEqual([]);
    expect(
      matchesIn({ name: 'Li Wu', phone: null, email: null }, 'Lily Wuhan'),
    ).toEqual([]);
    expect(nameKey('Madonna')).toBeNull();
  });

  it('matches a phone however it is written, by its last 10 digits', () => {
    expect(matchesIn(anna, 'call (415) 555-2680 tomorrow')).toEqual(['phone']);
    expect(matchesIn(anna, 'call 4155552680')).toEqual(['phone']);
    expect(matchesIn(anna, 'call 415 555 2681')).toEqual([]);
    expect(phoneKey('+1 415')).toBeNull();
  });

  it('matches an e-mail, ignoring case', () => {
    expect(matchesIn(anna, 'write to ANNA.P@example.com please')).toEqual([
      'email',
    ]);
  });

  it('reports every way a person shows up', () => {
    expect(
      matchesIn(anna, 'Анна Петрова, +1 415 555 2680, anna.p@example.com'),
    ).toEqual(['name', 'phone', 'email']);
    expect(
      matchesIn({ name: '', phone: null, email: null }, 'anything'),
    ).toEqual([]);
  });
});

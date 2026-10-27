import { detectPii, kindsOf, parseKinds, redactPii } from './qa-pii';

const kinds = (t: string) => kindsOf(detectPii(t));

describe('qa-pii', () => {
  it('finds a formatted SSN, not an invalid one', () => {
    expect(kinds('my ssn is 123-45-6789 ok')).toContain('ssn');
    expect(kinds('number 000-12-3456')).not.toContain('ssn');
    expect(kinds('social security number 123456789')).toContain('ssn');
  });

  it('finds a card number by Luhn only', () => {
    expect(kinds('card 4111 1111 1111 1111')).toContain('card');
    expect(kinds('order 4111 1111 1111 1112')).not.toContain('card');
  });

  it('finds addresses but not money or durations', () => {
    expect(kinds('I live at 123 Main Street, Apt 4')).toContain('address');
    expect(kinds('lives in Austin, TX 78701')).toContain('address');
    expect(kinds('I paid 500 dollars to the Court')).not.toContain('address');
  });

  it('finds case and docket numbers', () => {
    expect(kinds('case 1:23-cv-01234-ABC')).toContain('case_number');
    expect(kinds('Case No. 2023-FA-4411')).toContain('case_number');
    expect(kinds('docket # CR-2022-0091')).toContain('case_number');
  });

  it('finds the other side by name after a cue, not a place', () => {
    expect(kinds('I am being sued by John Smith over rent')).toContain(
      'party_name',
    );
    expect(kinds('my landlord is Acme Holdings LLC')).toContain('party_name');
    expect(kinds('Smith v. Jones was decided')).toContain('party_name');
    expect(kinds('a lawsuit against New York State')).not.toContain(
      'party_name',
    );
  });

  it('finds immigration ids, dates of birth and phones', () => {
    expect(kinds('my A-number is A123456789')).toContain('immigration_id');
    expect(kinds('receipt EAC2290012345')).toContain('immigration_id');
    expect(kinds('date of birth: 04/12/1988')).toContain('dob');
    expect(kinds('call (415) 555-2671 please')).toContain('phone');
  });

  it('redacts with masks and keeps the rest', () => {
    const t = 'SSN 123-45-6789 and john@x.com';
    const out = redactPii(t, detectPii(t));
    expect(out).toContain('[данные скрыты]');
    expect(out).toContain('[контакт скрыт]');
    expect(out).not.toContain('6789');
  });

  it('plain legal text has no findings', () => {
    expect(
      detectPii('Can my landlord keep the deposit if I move out early?'),
    ).toEqual([]);
  });

  it('parses the kind list', () => {
    expect(parseKinds('ssn, nope ,card')).toEqual(['ssn', 'card']);
  });
});

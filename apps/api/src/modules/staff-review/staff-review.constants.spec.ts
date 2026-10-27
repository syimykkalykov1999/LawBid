import {
  agreementPct,
  baseKind,
  returnedRatePct,
  sameClass,
  toSampleVerdict,
} from './staff-review.constants';

describe('re-check verdict mapping', () => {
  it('confirmed is «same»; overturned is «different»; harmful is «worse»', () => {
    expect(toSampleVerdict('confirmed', [])).toBe('same');
    expect(toSampleVerdict('confirmed', ['harmful'])).toBe('same');
    expect(toSampleVerdict('overturned', ['wrong_outcome'])).toBe('different');
    expect(toSampleVerdict('overturned', ['wrong_outcome', 'harmful'])).toBe(
      'worse',
    );
  });

  it('a peer copy keeps the kind of the original', () => {
    expect(baseKind('cal_verification')).toBe('verification');
    expect(baseKind('support_ticket')).toBe('support_ticket');
  });
});

describe('calibration math', () => {
  it('two verdicts agree when both confirm or both do not', () => {
    expect(sameClass('same', 'same')).toBe(true);
    expect(sameClass('different', 'worse')).toBe(true);
    expect(sameClass('same', 'different')).toBe(false);
    expect(sameClass('worse', 'same')).toBe(false);
  });

  it('agreement in percent; nothing to compare is null', () => {
    expect(agreementPct(0, 0)).toBeNull();
    expect(agreementPct(3, 4)).toBe(75);
    expect(agreementPct(1, 3)).toBe(33);
    expect(agreementPct(5, 5)).toBe(100);
  });

  it('returned rate counts reopened and complaints of the closed ones', () => {
    expect(returnedRatePct(0, 3, 3)).toBeNull();
    expect(returnedRatePct(200, 6, 4)).toBe(5);
    expect(returnedRatePct(30, 1, 0)).toBe(3.3);
    expect(returnedRatePct(10, 20, 20)).toBe(100);
  });
});

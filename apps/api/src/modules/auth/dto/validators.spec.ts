import { checkSmsDestination, isValidE164 } from './validators';

describe('isValidE164', () => {
  it.each(['+12025551001', '+14165550123', '+447911123456'])(
    'accepts valid E.164 %s (format only, any country)',
    (n) => expect(isValidE164(n)).toBe(true),
  );

  it.each(['12025551001', '+1555', 'not-a-phone', '', 42, null])(
    'rejects %p',
    (n) => expect(isValidE164(n)).toBe(false),
  );
});

describe('checkSmsDestination (US-only SMS)', () => {
  const US = ['US'];

  it.each(['+12025551001', '+13125550100'])(
    'allows a US geographic number %s',
    (n) => expect(checkSmsDestination(n, US)).toBe('ok'),
  );

  it.each([
    ['+14165550123', 'Canada (+1 416)'],
    ['+18765550123', 'Jamaica (+1 876)'],
    ['+12684601234', 'Antigua (+1 268)'],
    ['+17875550123', 'Puerto Rico (+1 787)'],
    ['+16715551234', 'Guam (+1 671)'],
    ['+447911123456', 'UK mobile'],
  ])('rejects %s — %s — as country_not_allowed', (n) => {
    expect(checkSmsDestination(n, US)).toBe('country_not_allowed');
  });

  it.each([
    ['+19005551234', 'premium rate (900)'],
    ['+18005551234', 'toll free (800)'],
  ])('rejects %s — %s — as number_type_not_allowed', (n) => {
    expect(checkSmsDestination(n, US)).toBe('number_type_not_allowed');
  });

  it('rejects malformed input as invalid', () => {
    expect(checkSmsDestination('12025551001', US)).toBe('invalid');
    expect(checkSmsDestination('+15550100000', US)).toBe('invalid');
  });

  it('honors a widened allow-list from config (e.g. adding PR)', () => {
    expect(checkSmsDestination('+17875550123', ['US', 'PR'])).toBe('ok');
  });

  it('an empty allow-list blocks everything', () => {
    expect(checkSmsDestination('+12025551001', [])).toBe('country_not_allowed');
  });
});

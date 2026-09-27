import { otpSmsText } from './otp-sms-text';

describe('otpSmsText (docs/01 §10.2 D)', () => {
  it('is the plain message without an app hash', () => {
    expect(otpSmsText('123456')).toBe(
      'LawBid code: 123456. Expires in 10 minutes.',
    );
  });

  it('uses the SMS Retriever format with an app hash', () => {
    const text = otpSmsText('123456', 'FA+9qCX9VSu');
    expect(text.startsWith('<#> LawBid code: 123456.')).toBe(true);
    expect(text.split('\n').at(-1)).toBe('FA+9qCX9VSu');
  });
});

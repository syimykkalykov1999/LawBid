import { otpSmsText } from './otp-sms-text';

describe('otpSmsText (docs/01 §10.2 D)', () => {
  it('is the plain message without an app hash', () => {
    expect(otpSmsText('123456')).toBe(
      'Your LawBid verification code is 123456. It expires in 10 minutes. Do not share this code.',
    );
  });

  it('uses the SMS Retriever format with an app hash', () => {
    const text = otpSmsText('123456', 'FA+9qCX9VSu');
    expect(
      text.startsWith('<#> Your LawBid verification code is 123456.'),
    ).toBe(true);
    expect(text.split('\n').at(-1)).toBe('FA+9qCX9VSu');
  });
});

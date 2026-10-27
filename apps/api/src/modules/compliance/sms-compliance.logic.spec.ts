import {
  classifyKeyword,
  hourIsQuiet,
  inQuietHours,
  keywordFromTwilio,
  normalizeE164,
  twiml,
  withStopNotice,
} from './sms-compliance.logic';

const q = { startHour: 21, endHour: 8 };

describe('sms compliance logic', () => {
  it.each([
    'STOP',
    'stop',
    ' Stop. ',
    'QUIT',
    'end',
    'Cancel',
    'unsubscribe',
    'revoke',
    'opt out',
    'STOPALL',
  ])('reads %p as a revocation', (w) =>
    expect(classifyKeyword(w)).toBe('stop'),
  );

  it('reads START and HELP', () => {
    expect(classifyKeyword('START')).toBe('start');
    expect(classifyKeyword('unstop')).toBe('start');
    expect(classifyKeyword('Help')).toBe('help');
  });

  it('does not treat a sentence as a keyword', () => {
    expect(classifyKeyword('please do not stop the music')).toBeNull();
    expect(classifyKeyword('')).toBeNull();
    expect(classifyKeyword(undefined)).toBeNull();
  });

  it('trusts Twilio’s OptOutType first', () => {
    expect(keywordFromTwilio('STOP', 'hello')).toBe('stop');
    expect(keywordFromTwilio(undefined, 'STOP')).toBe('stop');
    expect(keywordFromTwilio('', 'hi')).toBeNull();
  });

  it('normalizes E.164 only', () => {
    expect(normalizeE164('+1 (555) 123-4567')).toBe('+15551234567');
    expect(normalizeE164('5551234567')).toBeNull();
    expect(normalizeE164(undefined)).toBeNull();
  });

  it('quiet window wraps midnight', () => {
    expect(hourIsQuiet(21, q)).toBe(true);
    expect(hourIsQuiet(23, q)).toBe(true);
    expect(hourIsQuiet(3, q)).toBe(true);
    expect(hourIsQuiet(8, q)).toBe(false);
    expect(hourIsQuiet(20, q)).toBe(false);
    expect(hourIsQuiet(12, { startHour: 8, endHour: 8 })).toBe(false);
  });

  it('uses the person’s own zone', () => {
    // 15:00 UTC = 11:00 New York (ok), 08:00 Los Angeles (ok), 05:00 Honolulu (quiet)
    const now = new Date('2026-07-01T15:00:00Z');
    expect(inQuietHours(now, 'America/New_York', q)).toBe(false);
    expect(inQuietHours(now, 'Pacific/Honolulu', q)).toBe(true);
  });

  it('unknown zone = strictest across US coasts', () => {
    // 12:00 UTC in July = 08:00 New York but 05:00 Los Angeles -> quiet
    expect(inQuietHours(new Date('2026-07-01T12:00:00Z'), null, q)).toBe(true);
    // 17:00 UTC = 13:00 NY / 10:00 LA -> allowed
    expect(inQuietHours(new Date('2026-07-01T17:00:00Z'), null, q)).toBe(false);
    // 01:30 UTC = 21:30 NY -> quiet
    expect(inQuietHours(new Date('2026-07-02T01:30:00Z'), undefined, q)).toBe(
      true,
    );
  });

  it('an invalid zone falls back to the strict set', () => {
    expect(inQuietHours(new Date('2026-07-01T12:00:00Z'), 'Not/AZone', q)).toBe(
      true,
    );
  });

  it('adds a STOP notice only when missing', () => {
    expect(withStopNotice('Hi')).toBe('Hi Reply STOP to opt out.');
    expect(withStopNotice('Hi, reply STOP to end')).toBe(
      'Hi, reply STOP to end',
    );
  });

  it('builds TwiML', () => {
    expect(twiml()).toContain('<Response></Response>');
    expect(twiml('a<b')).toContain('<Message>a&lt;b</Message>');
  });
});

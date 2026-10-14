import {
  checkBarNumber,
  DEFAULT_BAR_FORMATS,
  resolveFormats,
} from './bar-number-format';

const f = DEFAULT_BAR_FORMATS;

describe('bar number format (owner 2026-10-14)', () => {
  it('accepts the state shape and strips separators', () => {
    expect(checkBarNumber('NY', '12-34 567', f)).toMatchObject({
      ok: true,
      normalized: '1234567',
    });
    expect(checkBarNumber('MI', 'p12345', f).ok).toBe(true);
    expect(checkBarNumber('TX', '24012345', f).ok).toBe(true);
  });

  it('refuses digits where the state wants a letter, and wrong lengths', () => {
    expect(checkBarNumber('MI', '12345', f).ok).toBe(false);
    expect(checkBarNumber('TX', '2401234', f).ok).toBe(false);
    expect(checkBarNumber('NY', 'ABC', f)).toMatchObject({
      ok: false,
      example: '1234567',
    });
  });

  it('a state without a format needs 4+ characters with 3+ digits', () => {
    expect(checkBarNumber('AK', '1234', f).ok).toBe(true);
    expect(checkBarNumber('AK', '12', f).ok).toBe(false);
    expect(checkBarNumber('AK', 'ABCDEF', f).ok).toBe(false);
  });

  it('the owner overrides one state; a broken JSON changes nothing', () => {
    const own = resolveFormats(
      '{"IL":{"pattern":"^A\\\\d{6}$","example":"A123456"}}',
    );
    expect(checkBarNumber('IL', 'A123456', own).ok).toBe(true);
    expect(checkBarNumber('IL', '1234567', own).ok).toBe(false);
    expect(checkBarNumber('NY', '1234567', own).ok).toBe(true);
    expect(resolveFormats('{not json')).toBe(DEFAULT_BAR_FORMATS);
  });
});

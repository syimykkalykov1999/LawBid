import { BAR_FORMAT_SOURCES } from './bar-format-sources';
import { STATES_WITH_LOOKUP, stateBarLookupUrl } from './state-bar-links';
import {
  barShape,
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
    expect(checkBarNumber('MI', 'ABCDE', f).ok).toBe(false);
    expect(checkBarNumber('TX', '24', f).ok).toBe(false);
    expect(checkBarNumber('NY', 'ABC', f).ok).toBe(false);
    // Owner 2026-10-18: the check never carries an example to show.
    expect(checkBarNumber('NY', 'ABC', f)).not.toHaveProperty('example');
  });

  it('a state without a format needs 4+ characters with 3+ digits', () => {
    expect(checkBarNumber('ZZ', '1234', f).ok).toBe(true);
    expect(checkBarNumber('ZZ', '12', f).ok).toBe(false);
    expect(checkBarNumber('ZZ', 'ABCDEF', f).ok).toBe(false);
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

  // Owner 2026-10-16: every jurisdiction has a rule and a source, and the
  // rule accepts its own example.
  it('all 50 states + DC have a rule with a source; each accepts its example', () => {
    const states = Object.keys(f);
    expect(states).toHaveLength(51);
    for (const st of states) {
      expect(BAR_FORMAT_SOURCES[st]).toBeDefined();
      expect(checkBarNumber(st, f[st].example, f).ok).toBe(true);
    }
  });

  it('a shape is logged without the number itself', () => {
    expect(barShape('p-12345')).toBe('A99999');
    expect(barShape('24 012345')).toBe('99999999');
  });

  it('every state has a lookup link (a new state cannot end up without)', () => {
    for (const st of Object.keys(f)) {
      expect(STATES_WITH_LOOKUP).toContain(st);
      expect(stateBarLookupUrl(st, '12345')).toMatch(/^https:\/\//);
    }
  });
});

import {
  editDistanceOne,
  handleSuggestions,
  isValidHandle,
  normalizeHandle,
  skeleton,
  withinOneEdit,
} from './username-rules';

describe('username rules (channels, groups)', () => {
  it.each(['lawbid', 'a_b_c_d', 'Abcde', 'x'.repeat(32), 'a1234'])(
    'accepts %s',
    (u) => expect(isValidHandle(u, 'channel')).toBe(true),
  );

  it.each([
    'abcd',
    'x'.repeat(33),
    '1abcde',
    '_abcde',
    'ab__cd',
    'abcde_',
    'ab.cde',
    'ab cde',
  ])('rejects %s', (u) => expect(isValidHandle(u, 'group')).toBe(false));

  it('people keep dots and 3 letters', () => {
    expect(isValidHandle('a.b', 'user')).toBe(true);
    expect(isValidHandle('.ab', 'user')).toBe(false);
  });

  it('normalises @ and case', () => {
    expect(normalizeHandle('  @@PaVel ')).toBe('pavel');
  });

  it('look-alikes share a skeleton', () => {
    const k = skeleton('pavel_law');
    expect(skeleton('Pave1law')).toBe(k);
    expect(skeleton('paveilaw')).toBe(k);
    expect(skeleton('pavelwal')).not.toBe(k);
    expect(skeleton('l0ve')).toBe(skeleton('love'));
  });

  it('one edit away', () => {
    expect(withinOneEdit('lawbid', 'lawbld')).toBe(true);
    expect(withinOneEdit('lawbid', 'lawbids')).toBe(true);
    expect(withinOneEdit('lawbid', 'lawbad1')).toBe(false);
    expect(editDistanceOne('abc')).toContain('acb');
    expect(editDistanceOne('abc')).not.toContain('abc');
  });

  it('suggestions follow the rule and are unique', () => {
    const s = handleSuggestions(['Иван Law', 'ivan_law'], 2026, () => 0.5);
    expect(s.length).toBeGreaterThan(0);
    expect(new Set(s).size).toBe(s.length);
    for (const u of s) expect(isValidHandle(u, 'channel')).toBe(true);
  });
});

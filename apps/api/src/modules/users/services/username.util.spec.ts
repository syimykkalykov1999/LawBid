import {
  isValidUsername,
  pickUsername,
  usernameBase,
  withSuffix,
} from './username.util';

describe('attorney username generation (docs/02 §4.C, docs/03 §6)', () => {
  it('slugs first + last name into a valid lower-case base', () => {
    expect(usernameBase('John', 'Roe')).toBe('john.roe');
    expect(usernameBase('  Jöhn ', "O'Neil-Smith")).toBe('john.o.neil.smith');
    expect(isValidUsername(usernameBase('  Jöhn ', "O'Neil-Smith"))).toBe(true);
  });

  it('falls back when the name has no latin letters or is too short', () => {
    expect(usernameBase('Иван', 'Петров')).toBe('attorney');
    expect(usernameBase('A', null)).toBe('attorney');
    expect(usernameBase(null, null)).toBe('attorney');
  });

  it('caps at 30 characters without a trailing dot', () => {
    const base = usernameBase('Maximiliano', 'Wolfeschlegelsteinhausen');
    expect(base.length).toBeLessThanOrEqual(30);
    expect(isValidUsername(base)).toBe(true);
    const suffixed = withSuffix(base, 123);
    expect(suffixed.length).toBeLessThanOrEqual(30);
    expect(suffixed.endsWith('123')).toBe(true);
    expect(isValidUsername(suffixed)).toBe(true);
  });

  it('adds the smallest free numeric suffix when taken', () => {
    expect(pickUsername('john.roe', new Set(), new Set())).toBe('john.roe');
    expect(
      pickUsername('john.roe', new Set(['john.roe', 'john.roe2']), new Set()),
    ).toBe('john.roe3');
  });

  it('never returns a reserved username', () => {
    expect(pickUsername('admin', new Set(), new Set(['admin']))).toBe('admin2');
    expect(
      pickUsername('support', new Set(['support2']), new Set(['support'])),
    ).toBe('support3');
  });
});

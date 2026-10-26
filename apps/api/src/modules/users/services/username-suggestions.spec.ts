import { isValidUsername, suggestionCandidates } from './username.util';

describe('username suggestions (owner 2026-10-18, «как в инсте»)', () => {
  const fixed = () => 0.5;

  it('offers the typed text and the name forms first, then suffixed ones', () => {
    const c = suggestionCandidates(
      { firstName: 'John', lastName: 'Roe', typed: 'Johnny' },
      2026,
      fixed,
    );
    expect(c.slice(0, 6)).toEqual([
      'johnny',
      'john.roe',
      'john_roe',
      'johnroe',
      'roe.john',
      'john',
    ]);
    expect(c).toContain('johnny2026');
    expect(c).toContain('john.roe_26');
    expect(c).toContain('john.roe.55');
    expect(c).toContain('johnroe550');
  });

  it('transliterates Cyrillic names', () => {
    const c = suggestionCandidates(
      { firstName: 'Иван', lastName: 'Щукин' },
      2026,
      fixed,
    );
    expect(c[0]).toBe('ivan.shchukin');
  });

  it('cleans what was typed to the allowed alphabet', () => {
    const c = suggestionCandidates({ typed: '@_John..Roe!_' }, 2026, fixed);
    expect(c[0]).toBe('john.roe');
  });

  it('returns only valid, unique, lower-case handles of at most 30 chars', () => {
    const c = suggestionCandidates(
      {
        firstName: 'Maximiliano',
        lastName: 'Wolfeschlegelsteinhausenbergerdorff',
        typed: 'A',
      },
      2026,
    );
    expect(c.length).toBeGreaterThan(0);
    expect(new Set(c).size).toBe(c.length);
    for (const u of c) {
      expect(isValidUsername(u)).toBe(true);
      expect(u).toBe(u.toLowerCase());
    }
    expect(c).not.toContain('a');
  });

  it('gives nothing without any latin-able input', () => {
    expect(suggestionCandidates({ typed: '!!!' }, 2026)).toEqual([]);
  });
});

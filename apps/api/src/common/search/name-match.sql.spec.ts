import { nameKeys, nameMatchSql } from './name-match.sql';

/** Load test 2026-10-28 (#2): the typed text's spelling keys are computed
 * once, and the row predicate compares the stored users.name_skel /
 * users.name_cons — no function of a parameter is left per row. */
describe('nameMatchSql / nameKeys', () => {
  it('reads the keys of the words (2+ chars, at most 4) in one query', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          whole: 'emili braun',
          i: 1,
          skel: 'emili',
          skel_like: 'emili',
          cons_like: 'ml',
          use_cons: false,
        },
        {
          whole: 'emili braun',
          i: 2,
          skel: 'braun',
          skel_like: 'braun',
          cons_like: 'brn',
          use_cons: true,
        },
      ]),
    };
    const keys = await nameKeys(db, 'Эмили Браун x');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = db.$queryRaw.mock.calls[0][0];
    // The words sent: two of them ("x" is too short), and their escaped form.
    expect(sql.values).toContainEqual(['Эмили', 'Браун']);
    expect(keys).toEqual({
      whole: 'emili braun',
      words: [
        { skel: 'emili', skelLike: 'emili', consLike: null },
        { skel: 'braun', skelLike: 'braun', consLike: 'brn' },
      ],
    });
  });

  it('a text with no word to match keeps its whole key and matches nothing', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          whole: 'a',
          skel: null,
          skel_like: null,
          cons_like: null,
          use_cons: null,
        },
      ]),
    };
    const keys = await nameKeys(db, 'a');
    expect(keys).toEqual({ whole: 'a', words: [] });
    expect(nameMatchSql(keys).sql).toBe('FALSE');
  });

  it('compares the stored keys; the consonant arm only for 3+ consonants', () => {
    const sql = nameMatchSql(
      {
        whole: 'emili braun',
        words: [
          { skel: 'emili', skelLike: 'emili', consLike: null },
          { skel: 'braun', skelLike: 'braun', consLike: 'brn' },
        ],
      },
      'u',
    );
    expect(sql.sql).toContain('u.name_skel IS NOT NULL');
    expect(sql.sql).not.toContain('f_name_skel');
    expect(sql.sql.match(/u\.name_cons LIKE/g)).toHaveLength(1);
    expect(sql.values).toEqual([
      'emili',
      'emili',
      'braun',
      'braun',
      'brn',
      'emili braun',
    ]);
  });
});

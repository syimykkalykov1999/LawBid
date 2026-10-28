import {
  letterCount,
  nameKeys,
  nameMatchSql,
  NameKeys,
  personTierSql,
  startsAWord,
} from './name-match.sql';
import { Prisma } from '@prisma/client';

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
      fuzzy: true,
      words: [
        {
          skel: 'emili',
          skelLike: 'emili',
          consLike: null,
          rawLike: 'эмили',
          letters: 5,
        },
        {
          skel: 'braun',
          skelLike: 'braun',
          consLike: 'brn',
          rawLike: 'браун',
          letters: 5,
        },
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
    expect(keys).toEqual({ whole: 'a', fuzzy: false, words: [] });
    expect(nameMatchSql(keys).sql).toBe('FALSE');
  });

  const word = (skel: string, raw: string, consLike: string | null = null) => ({
    skel,
    skelLike: skel,
    consLike,
    rawLike: raw,
    letters: letterCount(raw),
  });
  const keysOf = (whole: string, ...w: NameKeys['words']): NameKeys => ({
    whole,
    fuzzy: letterCount(whole) >= 4,
    words: w,
  });

  it('compares the stored keys; word start always, typo arms only from 4 letters', () => {
    const sql = nameMatchSql(
      keysOf(
        'emili braun',
        word('emili', 'emili'),
        word('braun', 'braun', 'brn'),
      ),
      'u',
    );
    expect(sql.sql).toContain('u.name_skel IS NOT NULL');
    expect(sql.sql).not.toContain('f_name_skel');
    expect(sql.sql.match(/u\.name_cons LIKE/g)).toHaveLength(2);
    expect(sql.values).toEqual(
      expect.arrayContaining([
        'emili%',
        '% emili%',
        '%braun%',
        'brn%',
        '% brn%',
      ]),
    );
    expect(sql.sql).toContain('similarity(');
  });

  it('owner 2026-10-28: «jah» (3 letters) never goes through a loose arm', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          whole: 'ia',
          skel: 'ia',
          skel_like: 'ia',
          cons_like: '',
          use_cons: false,
        },
      ]),
    };
    const keys = await nameKeys(db, 'jah');
    expect(keys.fuzzy).toBe(false);
    const sql = nameMatchSql(keys, 'u');
    // Only "a skeleton word starts with «ia»" and "the plain name has «jah»".
    expect(sql.sql).not.toMatch(/<%|similarity|name_cons| % /);
    expect(sql.values).toEqual(['ia%', '% ia%', '%jah%']);
  });

  it('2 letters: a word start as typed only (no other alphabet, «inside» or typo)', () => {
    const sql = nameMatchSql(keysOf('ka', word('ka', 'ka')), 'u');
    expect(sql.values).toEqual(['ka%', '% ka%']);
    expect(sql.sql).toContain('u.full_name_lower LIKE');
    expect(sql.sql).not.toMatch(/<%|similarity|name_skel LIKE/);
  });

  it('the consonant arm needs 4+ letters even with 3 consonants', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          whole: 'klk',
          skel: 'klk',
          skel_like: 'klk',
          cons_like: 'klk',
          use_cons: true,
        },
      ]),
    };
    const keys = await nameKeys(db, 'klk');
    expect(keys.words[0].consLike).toBeNull();
    expect(nameMatchSql(keys, 'u').sql).not.toContain('name_cons');
  });

  it('personTierSql: exact → prefix → word start → contains → other alphabet → typo → topic', () => {
    const tier = (q: string, k: NameKeys) =>
      personTierSql(q, k, Prisma.sql`a.username_lower`, 'u', Prisma.sql`TOPIC`);
    const long = tier(
      'kalykov',
      keysOf('kalikov', word('kalikov', 'kalykov', 'klkv')),
    );
    for (const marker of [
      'translate(',
      'u.name_skel IS NOT NULL AND',
      '<%',
      'TOPIC',
    ]) {
      expect(long.sql).toContain(marker);
    }
    expect(long.sql).toMatch(
      /THEN 0[\s\S]*THEN 1[\s\S]*THEN 2[\s\S]*THEN 3[\s\S]*THEN 4[\s\S]*THEN 5[\s\S]*THEN 6[\s\S]*ELSE 9/,
    );
    // A short text: no «contains» (THEN 3) and no typo (THEN 5) branch.
    const short = tier('ka', keysOf('ka', word('ka', 'ka')));
    expect(short.sql).not.toMatch(/THEN 3|THEN 5|<%| % /);
    const three = tier('jah', keysOf('ia', word('ia', 'jah')));
    expect(three.sql).toContain('THEN 3');
    expect(three.sql).not.toMatch(/THEN 5|<%/);
  });

  it('startsAWord: a practice name by a word start, 3+ letters (owner 2026-10-28)', () => {
    expect(startsAWord('Kejahatan Berat (Felony)', 'jah')).toBe(false);
    expect(startsAWord('Kejahatan Berat (Felony)', 'kejah')).toBe(true);
    expect(startsAWord('Kejahatan Berat (Felony)', 'felony')).toBe(true);
    expect(startsAWord('Развод и раздел имущества', 'развод')).toBe(true);
    expect(startsAWord('Развод и раздел имущества', 'раздел им')).toBe(true);
    expect(startsAWord('Family Law', 'fa')).toBe(false);
    expect(startsAWord('Family Law', 'amily')).toBe(false);
  });
});

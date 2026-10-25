import {
  caseQuery,
  peopleQuery,
  postQuery,
  questionQuery,
  tagQuery,
} from './search-engine.queries';

const W = { title: 1, text: 0.2 };
const json = (q: unknown) => JSON.stringify(q);

describe('post / case / question text queries', () => {
  it('ANDs the words, makes the last a prefix, boosts title over text by the admin weights', () => {
    const q = postQuery('Green Ca', {}, { title: 3, text: 0.5 }, []);
    const mm = (q as any).bool.must[0].bool.should[0].multi_match;
    expect(mm).toMatchObject({
      query: 'green ca',
      type: 'bool_prefix',
      operator: 'and',
      fields: ['title^3', 'body^0.5'],
    });
  });

  it('drops tsquery syntax like the Postgres parser does', () => {
    const q = postQuery("a' | b:*) & !c", {}, W, []);
    expect(json(q)).toContain('"query":"a b c"');
  });

  it('a query with no letters or digits matches nothing', () => {
    expect(json(postQuery('@#!?', {}, W, []))).toContain('match_none');
  });

  it('adds the topics the query names in another language (practice ids)', () => {
    const q = caseQuery('развод', {}, W, ['p1', 'p2'], 'развод');
    expect(json(q)).toContain('{"terms":{"practice_ids":["p1","p2"]}}');
  });

  it('applies the cheap filters: tag, content class, briefs, period, state', () => {
    const since = new Date('2026-01-01T00:00:00Z');
    const p = postQuery(
      'visa',
      { tag: 'visa', contentClass: 'legal', briefsOnly: true, since },
      W,
      [],
    ) as any;
    expect(p.bool.filter).toEqual([
      { term: { tags: 'visa' } },
      { term: { content_class: 'legal' } },
      { term: { kind: 'post' } },
      { range: { created_at: { gte: since.toISOString() } } },
    ]);
    const c = caseQuery('visa', { state: 'ny' }, W, [], 'visa') as any;
    expect(c.bool.filter).toEqual([{ terms: { states: ['NY'] } }]);
  });

  it('finds the place of a case: state code, state name, city word', () => {
    const q = caseQuery('ny', {}, W, [], 'ny');
    expect(json(q)).toContain('"term":{"state":"NY"}');
    expect(json(q)).toContain('"prefix":{"state_name":"ny"}');
    expect(json(q)).toContain('"prefix":{"city":"ny"}');
  });

  it('the typo fallback is fuzzy and drops the prefix and topic branches', () => {
    const q = postQuery('gren card', {}, W, ['p1'], true);
    expect(json(q)).toContain('"fuzziness":"AUTO"');
    expect(json(q)).not.toContain('bool_prefix');
    expect(json(q)).not.toContain('practice_ids');
  });

  it('questions search title, text and answers', () => {
    expect(json(questionQuery('divorce', ['t']))).toContain('answers^0.5');
  });

  it('tags are a prefix match', () => {
    expect(tagQuery('Imm')).toEqual({ prefix: { tag: 'imm' } });
  });
});

describe('peopleQuery', () => {
  const ctx = {
    namedPractices: ['pr1'],
    synonymPractices: ['pr2'],
    nameKeys: [{ skel: 'emili', cons: 'mlbrn' }],
    withClients: true,
  };

  it('has the @username tiers: exact, prefix', () => {
    const q = json(peopleQuery('@emily', {}, ctx));
    expect(q).toContain('"term":{"username":{"value":"@emily","boost":10}}');
    expect(q).toContain('"prefix":{"username":{"value":"@emily","boost":5}}');
  });

  it('matches names across alphabets by skeleton or consonants, and by practice', () => {
    const q = json(peopleQuery('эмили', {}, ctx));
    expect(q).toContain('"match_phrase":{"name_skel":"emili"}');
    expect(q).toContain('"match_phrase":{"name_cons":"mlbrn"}');
    expect(q).toContain('"terms":{"practice_ids":["pr1","pr2"]}');
    expect(q).toContain('practice_names');
  });

  it('attorney-only filters leave clients out and narrow by practice (with subcategories), state, rating, language, verified', () => {
    const q = peopleQuery(
      'smith',
      {
        practiceAreaId: 'cat',
        state: 'NY',
        minRating: 4,
        language: 'ru',
        verifiedOnly: true,
      },
      { ...ctx, withClients: false },
    ) as any;
    expect(q.bool.filter).toEqual(
      expect.arrayContaining([
        { term: { role: 'attorney' } },
        { term: { practice_ids_all: 'cat' } },
        { range: { rating: { gte: 4 } } },
        { term: { languages: 'ru' } },
        { term: { verified: true } },
      ]),
    );
  });

  it('with clients, «verified» is left to Postgres (a client is verified by phone)', () => {
    const q = peopleQuery('x', { verifiedOnly: true }, ctx) as any;
    expect(json(q.bool.filter)).not.toContain('verified');
  });

  it('role=client keeps only clients', () => {
    const q = peopleQuery('x', { role: 'client' }, ctx) as any;
    expect(q.bool.filter).toContainEqual({ term: { role: 'client' } });
  });

  it('the typo fallback uses fuzzy username and name', () => {
    const q = json(peopleQuery('emliy', {}, ctx, true));
    expect(q).toContain('"fuzzy":{"username"');
    expect(q).toContain('"fuzziness":"AUTO"');
  });
});

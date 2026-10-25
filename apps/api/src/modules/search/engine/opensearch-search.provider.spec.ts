import { OpenSearchProvider } from './opensearch-search.provider';
import type { OpenSearchClient } from './opensearch.client';
import type { PostgresSearchProvider } from '../postgres-search.provider';

function make() {
  const pg = {
    practicesNamed: jest.fn().mockResolvedValue(['pr1']),
    synonymPractices: jest.fn().mockResolvedValue(['pr2']),
    nameKeys: jest.fn().mockResolvedValue([{ skel: 'emili', cons: 'ml' }]),
    practiceIdsFor: jest.fn().mockResolvedValue(['pr3']),
    searchAttorneysAmong: jest.fn().mockResolvedValue(['att']),
    searchPeopleAmong: jest
      .fn()
      .mockResolvedValue([{ id: 'p', role: 'client', tier: 2 }]),
    searchCasesRankedAmong: jest.fn().mockResolvedValue(['case']),
    searchPostsAmong: jest.fn().mockResolvedValue(['post']),
    searchQuestionsAmong: jest.fn().mockResolvedValue(['qa']),
    searchCases: jest.fn().mockResolvedValue([]),
    suggest: jest.fn().mockResolvedValue([]),
    practiceMatches: jest.fn().mockResolvedValue([]),
  };
  const client = { searchIds: jest.fn() };
  const p = new OpenSearchProvider(
    pg as unknown as PostgresSearchProvider,
    client as unknown as OpenSearchClient,
  );
  return { p, pg, client };
}

describe('OpenSearchProvider (the engine finds, Postgres decides)', () => {
  it('posts: engine candidates go through the Postgres finishing step', async () => {
    const { p, pg, client } = make();
    client.searchIds.mockResolvedValue(['x', 'y']);
    expect(await p.searchPosts('visa', 20, { tag: 'visa' })).toEqual(['post']);
    expect(client.searchIds.mock.calls[0][0]).toBe('post');
    expect(pg.searchPostsAmong).toHaveBeenCalledWith(
      'visa',
      20,
      { tag: 'visa' },
      ['x', 'y'],
    );
  });

  it('typo fallback: nothing found strictly, the fuzzy query runs', async () => {
    const { p, client } = make();
    client.searchIds.mockResolvedValueOnce([]).mockResolvedValueOnce(['z']);
    await p.searchPosts('gren card', 20);
    expect(client.searchIds).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(client.searchIds.mock.calls[1][1])).toContain(
      'fuzziness',
    );
  });

  it('cases: candidates, then the §4.1 visibility SQL with the text practices', async () => {
    const { p, pg, client } = make();
    client.searchIds.mockResolvedValue(['c1']);
    const out = await p.searchCasesRanked(
      'new york',
      { attorneyId: 'a', state: 'NY' },
      50,
    );
    expect(out).toEqual(['case']);
    expect(pg.searchCasesRankedAmong).toHaveBeenCalledWith(
      'new york',
      { attorneyId: 'a', state: 'NY', textPractices: ['pr3'] },
      50,
      ['c1'],
    );
  });

  it('people: practices, synonyms and name keys feed the query; attorneys vs people', async () => {
    const { p, pg, client } = make();
    client.searchIds.mockResolvedValue(['u1']);
    expect(await p.searchAttorneys('emily', {}, 10)).toEqual(['att']);
    expect(client.searchIds.mock.calls[0][1].bool.filter).toContainEqual({
      term: { role: 'attorney' },
    });
    expect(await p.searchPeople('emily', {}, 10)).toHaveLength(1);
    expect(client.searchIds.mock.calls[1][1].bool.filter).toEqual([]);
    expect(pg.searchPeopleAmong).toHaveBeenCalledWith('emily', {}, 10, ['u1']);
  });

  it('an empty text asks the engine nothing', async () => {
    const { p, client } = make();
    expect(await p.searchPosts('@#!', 10)).toEqual([]);
    expect(await p.searchCasesRanked('?!', { attorneyId: 'a' }, 10)).toEqual(
      [],
    );
    expect(await p.searchQuestions('  ')).toEqual([]);
    expect(client.searchIds).not.toHaveBeenCalled();
  });

  it('an engine error surfaces (the switch turns it into a Postgres answer)', async () => {
    const { p, client } = make();
    client.searchIds.mockRejectedValue(new Error('timeout'));
    await expect(p.searchPosts('visa', 5)).rejects.toThrow('timeout');
  });

  it('questions: engine ids, Postgres keeps only published ones, newest first', async () => {
    const { p, pg, client } = make();
    client.searchIds.mockResolvedValue(['q1']);
    expect(await p.searchQuestions('divorce')).toEqual(['qa']);
    expect(pg.searchQuestionsAmong).toHaveBeenCalledWith(['q1']);
  });

  it('tags come straight from the engine, sorted; type-ahead and the picker stay on Postgres', async () => {
    const { p, pg, client } = make();
    client.searchIds.mockResolvedValue(['immigration']);
    expect(await p.searchTags('imm', 5)).toEqual(['immigration']);
    expect((client.searchIds.mock.calls[0] as unknown[]).slice(4)).toEqual([
      [{ tag: 'asc' }],
      'tag',
    ]);
    await p.suggest('a', 2);
    await p.practiceMatches('a', 2);
    await p.searchCases('', {} as never);
    expect(pg.suggest).toHaveBeenCalled();
    expect(pg.practiceMatches).toHaveBeenCalled();
    expect(pg.searchCases).toHaveBeenCalled();
  });
});

import { Prisma } from '../../generated/prisma/client';
import { PostgresSearchProvider } from './postgres-search.provider';

/** Pack E (25.11, ROUND2 #16): the Q&A search fallback (no index hit: a
 * typo, a fragment inside a text) scans `body ILIKE` over questions and
 * answers, so it runs under the search time budget like every other
 * full-text step; running out of time is "nothing found", not an error. */
describe('PostgresSearchProvider.searchQuestions fallback budget', () => {
  function make() {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const executeRaw = jest.fn().mockResolvedValue(0);
    const transaction = jest.fn((steps: Promise<unknown>[]) =>
      Promise.all(steps),
    );
    const prisma = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      $transaction: transaction,
    };
    const provider = new PostgresSearchProvider(prisma as never);
    return { provider, queryRaw, executeRaw, transaction };
  }
  // A tagged-template call passes the strings; Prisma.sql passes a Sql.
  const sqlOf = (call: unknown[]) => {
    const first = call[0] as readonly string[] | { strings: readonly string[] };
    return ('strings' in first ? first.strings : first).join('?');
  };

  it('the indexed step finds it: no fallback, no budget needed', async () => {
    const t = make();
    t.queryRaw.mockResolvedValueOnce([{ id: 'q1' }]);
    expect(await t.provider.searchQuestions('divorce')).toEqual(['q1']);
    expect(t.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('nothing indexed: the ILIKE fallback runs with a statement timeout', async () => {
    const t = make();
    t.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'q2' }]);
    expect(await t.provider.searchQuestions('dvorce')).toEqual(['q2']);
    expect(t.transaction).toHaveBeenCalledTimes(1);
    const timeouts = t.executeRaw.mock.calls.filter((c) =>
      sqlOf(c).includes('statement_timeout'),
    );
    expect(timeouts).toHaveLength(1);
    expect(sqlOf(t.queryRaw.mock.calls[1])).toContain('q.body ILIKE');
    // Item 9 #16 (25.11): the typo arm reads the title trigram index with
    // `<%`, at the typo threshold the budget sets (0.42 ≤ the 0.45 check).
    expect(sqlOf(t.queryRaw.mock.calls[1])).toContain('<% f_unaccent');
    const thresholds = t.executeRaw.mock.calls.filter((c) =>
      sqlOf(c).includes('word_similarity_threshold'),
    );
    expect((thresholds[0] as unknown[]).slice(1)).toEqual(['0.42']);
  });

  it('the fallback running out of time answers no questions, not a 500', async () => {
    const t = make();
    t.transaction.mockRejectedValueOnce(
      new Error('canceling statement due to statement timeout'),
    );
    expect(await t.provider.searchQuestions('zzzz')).toEqual([]);
  });

  it('any other database error still surfaces', async () => {
    const t = make();
    t.transaction.mockRejectedValueOnce(new Error('connection lost'));
    await expect(t.provider.searchQuestions('zzzz')).rejects.toThrow(
      'connection lost',
    );
  });
});

/** F5 (26.11, docs/dev/SECOND_PASS_2026-11-26.md): best match first. */
describe('PostgresSearchProvider Q&A relevance (F5)', () => {
  // The whole statement with its nested fragments, as Prisma sends it.
  const sqlText = (call: unknown[]) =>
    Prisma.sql(call[0] as readonly string[], ...(call.slice(1) as never[])).sql;

  it('ranks with ts_rank (title A, text B, answer C) before the 500 cap', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'q1' }]);
    const p = new PostgresSearchProvider({ $queryRaw: queryRaw } as never);
    await p.searchQuestions('divorce custody');
    const sql = sqlText(queryRaw.mock.calls[0]);
    expect(sql).toContain('ts_rank(');
    for (const w of ["'A'", "'B'", "'C'"]) expect(sql).toContain(w);
    expect(sql).toMatch(
      /ORDER BY max\(t\.rank\) DESC, max\(t\.created_at\) DESC, t\.id DESC\s+LIMIT 500/,
    );
  });

  it('the engine step keeps the engine order (best first), only published', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'b' }, { id: 'a' }]);
    const p = new PostgresSearchProvider({ $queryRaw: queryRaw } as never);
    expect(await p.searchQuestionsAmong(['a', 'gone', 'b'])).toEqual([
      'a',
      'b',
    ]);
  });
});

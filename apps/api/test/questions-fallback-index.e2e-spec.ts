import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { pgAdapter } from '../src/prisma/pg-adapter';
import { questionsFallbackSql } from '../src/modules/search/postgres-search.provider';

/**
 * Foreman re-check 25.11 (item 9 #16, ROUND2 #16): the fallback of the Q&A
 * search (a typo, a fragment inside a text) read every published question
 * and answer (one OR of arms no index could serve). Now every arm reads a
 * trigram index: the title one and the two of
 * prisma/concurrent/20261224090100_legal_qa_body_trgm.sql. As in
 * db-roles-indexes.e2e-spec.ts the tables get a realistic volume (with a
 * handful of rows a scan is genuinely cheapest) and a fresh ANALYZE, and
 * sequential scans are forbidden: a plan that still walks every published
 * row shows a Seq Scan or the status index (the old query's plan).
 */
describe('Q&A search fallback reads through trigram indexes (EXPLAIN)', () => {
  jest.setTimeout(120_000);
  const root = new PrismaClient({
    adapter: pgAdapter(process.env.DATABASE_URL),
  });

  beforeAll(async () => {
    const client = await root.user.create({ data: { role: 'client' } });
    const attorney = await root.user.create({ data: { role: 'attorney' } });
    // 5 000 published questions with an answer each, varied words.
    await root.$executeRaw`
      INSERT INTO legal_questions (author_id, title, body, updated_at)
      SELECT ${client.id}::UUID,
             'question ' || g || ' ' || md5(g::TEXT),
             'my landlord kept the deposit ' || md5((g * 7)::TEXT) || ' '
               || md5((g * 13)::TEXT),
             now()
      FROM generate_series(1, 5000) AS g`;
    await root.$executeRaw`
      INSERT INTO legal_answers (question_id, attorney_id, body, updated_at)
      SELECT q.id, ${attorney.id}::UUID,
             'send a demand letter ' || md5(q.id::TEXT), now()
      FROM legal_questions q`;
    // VACUUM also merges the GIN pending lists of the fresh rows.
    await root.$executeRawUnsafe('VACUUM ANALYZE legal_questions');
    await root.$executeRawUnsafe('VACUUM ANALYZE legal_answers');
  });

  afterAll(async () => {
    await root.$disconnect();
  });

  async function plan(sql: Prisma.Sql): Promise<string> {
    const rows = await root.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      await tx.$executeRawUnsafe(
        "SET LOCAL pg_trgm.word_similarity_threshold = '0.42'",
      );
      return tx.$queryRaw<Record<string, string>[]>(Prisma.sql`EXPLAIN ${sql}`);
    });
    return rows.map((r) => Object.values(r)[0]).join('\n');
  }

  it('the body indexes exist (built by the online-DDL runner)', async () => {
    const rows = await root.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('legal_questions_body_trgm_idx',
                          'legal_answers_body_trgm_idx')
      ORDER BY indexname`;
    expect(rows.map((r) => r.indexname)).toEqual([
      'legal_answers_body_trgm_idx',
      'legal_questions_body_trgm_idx',
    ]);
  });

  it('no arm full-scans legal_questions or legal_answers', async () => {
    const text = 'qzxkvw custody';
    const p = await plan(questionsFallbackSql(text, `%${text}%`));
    expect(p).not.toMatch(/Seq Scan on legal_questions/);
    expect(p).not.toMatch(/Seq Scan on legal_answers/);
    expect(p).not.toMatch(/legal_questions_status_created_at_idx/);
    expect(p).toMatch(/legal_questions_body_trgm_idx/);
    expect(p).toMatch(/legal_answers_body_trgm_idx/);
    expect(p).toMatch(/legal_questions_title_trgm_idx/);
  });
});

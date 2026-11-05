import { shardContext } from '../../sharding/shard-context';
import {
  buildAttorneyEntries,
  QA_REDIS_PREFIX,
  QA_TOPIC_TOP,
  QaSnapshotService,
} from './qa-snapshot.service';
import { QA_WEIGHTS } from './qa-ranking';
import { DAY_MS } from './ranking.math';

const NOW = new Date(Date.UTC(2026, 10, 4, 5, 20));
const days = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

/** Redis hashes in memory (hmget / hset / exists / expire / del / pipeline). */
function makeRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const ops = {
    hmget: jest.fn((key: string, ...fields: string[]) =>
      Promise.resolve(fields.map((f) => hashes.get(key)?.get(f) ?? null)),
    ),
    exists: jest.fn((key: string) => Promise.resolve(hashes.has(key) ? 1 : 0)),
  };
  const pipeline = () => {
    const cmds: (() => void)[] = [];
    const p = {
      del: (k: string) => (cmds.push(() => hashes.delete(k)), p),
      hset: (k: string, h: Record<string, string>) => (
        cmds.push(() => hashes.set(k, new Map(Object.entries(h)))),
        p
      ),
      expire: () => p,
      exec: () => {
        cmds.forEach((c) => c());
        return Promise.resolve([]);
      },
    };
    return p;
  };
  return { ...ops, pipeline, hashes };
}

function makePrisma(parts: {
  answers?: unknown[];
  questions?: unknown[];
  cases?: unknown[];
  table?: { key: string; payload: unknown }[];
}) {
  const written: { sql: string; values: unknown[] }[] = [];
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('FROM legal_answers a'))
      return Promise.resolve(parts.answers ?? []);
    if (sql.includes('FROM legal_questions q'))
      return Promise.resolve(parts.questions ?? []);
    if (sql.includes('FROM cases c')) return Promise.resolve(parts.cases ?? []);
    if (sql.includes('FROM reco_qa_snapshots'))
      return Promise.resolve(parts.table ?? []);
    return Promise.resolve([]);
  });
  const executeRaw = jest.fn(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      written.push({ sql: strings.join('?'), values });
      return Promise.resolve(1);
    },
  );
  const tx = { $executeRaw: executeRaw };
  return {
    written,
    $queryRaw: queryRaw,
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}

const answer = (attorney: string, over: Record<string, unknown> = {}) => ({
  attorney_id: attorney,
  created_at: days(2),
  likes: 0,
  is_best: false,
  category: 'family',
  ...over,
});

/** R-401: the nightly Q&A snapshot — build, store, read, fall back. */
describe('QaSnapshotService', () => {
  const run = <T>(fn: () => Promise<T>) => shardContext.runOnPrimary(fn);

  it('scores attorneys: more and liked answers first, topics as shares', () => {
    const entries = buildAttorneyEntries(
      [
        answer('a'),
        answer('b'),
        answer('b', { likes: 4, category: 'tax' }),
        answer('b', { is_best: true }),
      ],
      NOW.getTime(),
      1.8,
      QA_WEIGHTS,
    );
    expect(entries.get('b')!.score).toBeGreaterThan(entries.get('a')!.score);
    expect(entries.get('b')!.topics.family).toBe(1);
    expect(entries.get('b')!.topics.tax).toBeCloseTo(0.5, 10);
    expect(entries.get('b')!.counts).toEqual({ answers: 3, likes: 4, best: 1 });
  });

  it('rebuild writes the table whole and the Redis hashes; meta has the counts', async () => {
    const redis = makeRedis();
    const prisma = makePrisma({
      answers: [answer('a'), answer('b'), answer('b', { likes: 2 })],
      questions: [
        { id: 'q1', created_at: days(1), taken: 0, category: 'family' },
        { id: 'q2', created_at: days(20), taken: 8, category: 'family' },
        { id: 'q3', created_at: days(1), taken: 0, category: null },
      ],
      cases: [{ id: 'c1', created_at: days(3), taken: 1, category: 'family' }],
    });
    const s = new QaSnapshotService(prisma as never, redis as never);
    const meta = await run(() => s.rebuild(NOW));
    expect(meta).toMatchObject({ attorneys: 2, questions: 3, cases: 1 });
    // One TRUNCATE, then the rows in one INSERT (fewer than 1000).
    expect(prisma.written[0].sql).toContain('TRUNCATE reco_qa_snapshots');
    expect(prisma.written).toHaveLength(2);
    const kinds = prisma.written[1].values[0] as string[];
    expect(kinds).toEqual(
      expect.arrayContaining([
        'attorney',
        'topic_attorneys',
        'topic_questions',
        'topic_cases',
        'meta',
      ]),
    );
    // The hot copy: the fresh empty question ranks above the old full one;
    // a question without a topic is in no list.
    const list = JSON.parse(
      redis.hashes.get(QA_REDIS_PREFIX + 'topic_questions')!.get('family')!,
    ) as { id: string }[];
    expect(list.map((r) => r.id)).toEqual(['q1', 'q2']);
    const b = JSON.parse(
      redis.hashes.get(QA_REDIS_PREFIX + 'attorney')!.get('b')!,
    ) as {
      score: number;
    };
    const a = JSON.parse(
      redis.hashes.get(QA_REDIS_PREFIX + 'attorney')!.get('a')!,
    ) as {
      score: number;
    };
    expect(b.score).toBeGreaterThan(a.score);
    expect(await s.lastRun()).toMatchObject({ attorneys: 2 });
  });

  it('keeps at most QA_TOPIC_TOP per topic', async () => {
    const redis = makeRedis();
    const prisma = makePrisma({
      questions: Array.from({ length: QA_TOPIC_TOP + 20 }, (_, i) => ({
        id: `q${i}`,
        created_at: days(i % 30),
        taken: 0,
        category: 'family',
      })),
    });
    const s = new QaSnapshotService(prisma as never, redis as never);
    await run(() => s.rebuild(NOW));
    const list = await s.topicList('topic_questions', ['family']);
    expect(list).toHaveLength(QA_TOPIC_TOP);
    expect(list[0].s).toBeGreaterThanOrEqual(list[list.length - 1].s);
  });

  it('reads Redis first, the table when the hash is gone, nothing when both are empty', async () => {
    const redis = makeRedis();
    const prisma = makePrisma({
      table: [{ key: 'a', payload: { score: 0.4, topics: {}, counts: {} } }],
    });
    const s = new QaSnapshotService(prisma as never, redis as never);
    // No hash in Redis: the table answers.
    expect((await s.attorneyScores(['a'])).get('a')).toMatchObject({
      score: 0.4,
    });
    // The hash exists without the key: a true miss, no table read.
    redis.hashes.set(
      QA_REDIS_PREFIX + 'attorney',
      new Map([['z', '{"score":1}']]),
    );
    prisma.$queryRaw.mockClear();
    expect((await s.attorneyScores(['a'])).size).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    // Both empty: nothing (today's behaviour).
    const empty = new QaSnapshotService(
      makePrisma({}) as never,
      makeRedis() as never,
    );
    expect((await empty.attorneyScores(['a'])).size).toBe(0);
    expect(await empty.topicList('topic_questions', ['family'])).toEqual([]);
    expect(await empty.lastRun()).toBeNull();
  });

  it('topic lists merge across topics, best score wins, and the flag can switch it off', async () => {
    const redis = makeRedis();
    redis.hashes.set(
      QA_REDIS_PREFIX + 'topic_questions',
      new Map([
        [
          'family',
          JSON.stringify([
            { id: 'q1', s: 0.9 },
            { id: 'q2', s: 0.2 },
          ]),
        ],
        [
          'tax',
          JSON.stringify([
            { id: 'q2', s: 0.7 },
            { id: 'q3', s: 0.5 },
          ]),
        ],
      ]),
    );
    const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
    const s = new QaSnapshotService(
      makePrisma({}) as never,
      redis as never,
      undefined,
      flags as never,
    );
    expect(
      (await s.topicList('topic_questions', ['family', 'tax'])).map(
        (r) => r.id,
      ),
    ).toEqual(['q1', 'q2', 'q3']);
    flags.isEnabled.mockResolvedValue(false);
    expect(await s.topicList('topic_questions', ['family', 'tax'])).toEqual([]);
    expect((await s.attorneyScores(['a'])).size).toBe(0);
    // The last run is shown in the admin whatever the flag says.
    expect(await s.lastRun()).toBeNull();
  });
});

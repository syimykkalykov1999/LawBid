import { randomUUID } from 'node:crypto';
import { OpenSearchClient } from './opensearch.client';
import { SearchReindexService } from '../search-reindex.service';
import type { SearchEntity } from './search-engine.mappings';

/**
 * OPTIONAL end-to-end test of the zero-downtime reindex against a REAL
 * OpenSearch (owner 2026-10-25): skipped unless OPENSEARCH_TEST_URL is set.
 *   docker run -d --name lb-os -p 9200:9200 -e discovery.type=single-node \
 *     -e DISABLE_SECURITY_PLUGIN=true -e DISABLE_INSTALL_DEMO_CONFIG=true \
 *     opensearchproject/opensearch:2.15.0
 *   OPENSEARCH_TEST_URL=http://localhost:9200 npx jest search-alias.integration
 * The database is replaced by an in-memory "table" so the test needs no
 * Postgres; everything on the engine side (templates, aliases, atomic
 * swap, external versions, delete on every generation, rollback, native
 * _reindex) is the real thing.
 */
const url = process.env.OPENSEARCH_TEST_URL;
const d = url ? describe : describe.skip;

d('zero-downtime reindex (real OpenSearch)', () => {
  jest.setTimeout(120_000);
  const prefix = `lbalias${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const client = new OpenSearchClient(undefined, {
    get: (k: string) => ({ OPENSEARCH_URL: url, OPENSEARCH_PREFIX: prefix })[k],
  });

  // The "database": tags (entity `tag`) by id.
  const rows = new Map<string, string>();
  for (let i = 0; i < 1200; i++) {
    rows.set(
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      `tag${i}`,
    );
  }
  const store = new Map<string, unknown>();
  const prisma = {
    searchIndexState: {
      findUnique: ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
      upsert: ({
        where,
        create,
      }: {
        where: { key: string };
        create: { value: unknown };
      }) => {
        store.set(where.key, JSON.parse(JSON.stringify(create.value)));
        return Promise.resolve();
      },
    },
  };
  const loader = {
    idsAfter: (e: SearchEntity, after: string | null, limit: number) => {
      if (e !== 'tag') return Promise.resolve([]);
      const all = [...rows.keys()].sort();
      const start = after ? all.indexOf(after) + 1 : 0;
      return Promise.resolve(all.slice(start, start + limit));
    },
    load: (e: SearchEntity, ids: string[]) =>
      Promise.resolve(
        new Map(
          e === 'tag'
            ? ids
                .filter((i) => rows.has(i))
                .map((i) => [i, { tag: rows.get(i) }])
            : [],
        ),
      ),
    sampleIds: (e: SearchEntity, n: number) =>
      Promise.resolve(e === 'tag' ? [...rows.keys()].slice(0, n) : []),
  };
  const settings = {
    string: () => Promise.resolve('engine'),
    number: (k: string) =>
      Promise.resolve(k === 'search.reindex_keep_days' ? 7 : 0),
  };
  const svc = new SearchReindexService(
    prisma as never,
    client,
    loader as never,
    settings as never,
  );
  const tagLayout = async () =>
    (await client.layout()).find((l) => l.entity === 'tag')!;
  const searchTag = (t: string) =>
    client.searchIds('tag', { term: { tag: t } }, 5, 5000);

  afterAll(async () => {
    for (const e of ['person', 'case', 'post', 'question', 'tag'] as const) {
      await client.dropIndex(e);
    }
  });

  it('bootstrap creates v1 with read + write aliases', async () => {
    await client.bootstrap();
    const l = await tagLayout();
    expect(l.indexes.map((i) => i.name)).toEqual([`${prefix}-tag-v1`]);
    expect(l.readTarget).toBe(`${prefix}-tag-v1`);
    expect(l.writeTarget).toBe(`${prefix}-tag-v1`);
    expect(await client.mappingVersion(`${prefix}-tag-v1`)).toBe(1);
  });

  it('live writes go through the write alias and are found via the read alias', async () => {
    const id = [...rows.keys()][0];
    await client.bulk([
      { entity: 'tag', id, doc: { tag: 'tag0' }, version: Date.now() },
    ]);
    await client.countIndex(`${prefix}-tag`);
    expect(await searchTag('tag0')).toEqual([id]);
  });

  it('full cycle: build v2, dual-write, verify, swap read, swap write, no gap', async () => {
    // Fill v1 like the first fill does.
    const first = [...rows.keys()];
    await client.bulk(
      first.map((id) => ({
        entity: 'tag' as const,
        id,
        doc: { tag: rows.get(id)! },
        version: Date.now(),
      })),
    );
    await svc.start('postgres', 'tag');
    const building = await svc.state();
    expect(building?.targets.tag?.index).toBe(`${prefix}-tag-v2`);

    // A change made while v2 builds reaches BOTH generations.
    const extra = await svc.extraIndexes();
    const fresh = first[5];
    rows.set(fresh, 'renamed5');
    await client.bulk(
      [
        {
          entity: 'tag',
          id: fresh,
          doc: { tag: 'renamed5' },
          version: Date.now(),
        },
      ],
      extra,
    );
    expect(await client.getDocs(`${prefix}-tag-v1`, [fresh])).toHaveProperty(
      'size',
      1,
    );
    expect(await client.getDocs(`${prefix}-tag-v2`, [fresh])).toHaveProperty(
      'size',
      1,
    );

    // Backfill (older load must not overwrite the newer dual-written doc).
    let s = await svc.step(60_000);
    expect(s?.phase).toBe('built');
    const v2 = await client.getDocs(`${prefix}-tag-v2`, [fresh]);
    expect(v2.get(fresh)).toEqual({ tag: 'renamed5' });

    // The read alias still serves v1 until the swap.
    expect((await tagLayout()).readTarget).toBe(`${prefix}-tag-v1`);

    s = await svc.swap(); // read
    expect(s.phase).toBe('read_swapped');
    expect((await tagLayout()).readTarget).toBe(`${prefix}-tag-v2`);
    expect((await tagLayout()).writeTarget).toBe(`${prefix}-tag-v1`);
    expect(await searchTag('renamed5')).toEqual([fresh]);

    s = await svc.swap(); // write
    expect(s.phase).toBe('write_swapped');
    expect((await tagLayout()).writeTarget).toBe(`${prefix}-tag-v2`);
  });

  it('GDPR: a delete removes the document from EVERY generation', async () => {
    const victim = [...rows.keys()][7];
    expect(await client.getDocs(`${prefix}-tag-v1`, [victim])).toHaveProperty(
      'size',
      1,
    );
    expect(await client.getDocs(`${prefix}-tag-v2`, [victim])).toHaveProperty(
      'size',
      1,
    );
    rows.delete(victim);
    const res = await client.bulk(
      [{ entity: 'tag', id: victim, doc: null, version: Date.now() }],
      await svc.extraIndexes(),
    );
    expect(res.failed).toEqual([]);
    expect(await client.getDocs(`${prefix}-tag-v1`, [victim])).toHaveProperty(
      'size',
      0,
    );
    expect(await client.getDocs(`${prefix}-tag-v2`, [victim])).toHaveProperty(
      'size',
      0,
    );
  });

  it('rollback returns both aliases to v1 atomically; v1 is still fresh', async () => {
    const s = await svc.rollback();
    expect(s.phase).toBe('rolled_back');
    const l = await tagLayout();
    expect(l.readTarget).toBe(`${prefix}-tag-v1`);
    expect(l.writeTarget).toBe(`${prefix}-tag-v1`);
    // v1 got the dual-writes while v2 was primary.
    expect(await searchTag('renamed5')).toHaveLength(1);
  });

  it('native _reindex copies a generation inside the engine', async () => {
    const l0 = await tagLayout();
    const src = l0.readTarget!;
    // _reindex reads the last refreshed state; make the source current first.
    await client.countIndex(src);
    const dest = await client.createGeneration('tag', 9);
    const task = await client.startReindexTask(src, dest, 0);
    let st = await client.reindexTask(task);
    for (let i = 0; !st.completed && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      st = await client.reindexTask(task);
    }
    expect(st.completed).toBe(true);
    expect(st.error).toBeUndefined();
    expect(await client.countIndex(dest)).toBe(await client.countIndex(src));
    await client.deleteIndex(dest);
  });

  it('deleteIndex refuses an index that still carries an alias', async () => {
    await expect(client.deleteIndex(`${prefix}-tag-v1`)).rejects.toThrow(
      /still has an alias/,
    );
  });
});

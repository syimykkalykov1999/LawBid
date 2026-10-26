import type { EntityLayout } from './engine/opensearch.client';
import type { SearchEntity } from './engine/search-engine.mappings';
import { SearchReindexService, ReindexRefused } from './search-reindex.service';

const ENTITIES: SearchEntity[] = ['person', 'case', 'post', 'question', 'tag'];

function make(opts: { engineMode?: string; ids?: string[] } = {}) {
  const store = new Map<string, unknown>();
  const prisma = {
    searchIndexState: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
      ),
      upsert: jest.fn(
        ({
          where,
          create,
        }: {
          where: { key: string };
          create: { value: unknown };
        }) => {
          store.set(where.key, JSON.parse(JSON.stringify(create.value)));
          return Promise.resolve();
        },
      ),
    },
  };
  // A tiny in-memory engine: generations per entity and the two aliases.
  const eng = new Map<
    SearchEntity,
    { gens: number[]; read: number; write: number }
  >(ENTITIES.map((e) => [e, { gens: [1], read: 1, write: 1 }]));
  const name = (e: SearchEntity, g: number) => `lb-${e}-v${g}`;
  const layout = (): EntityLayout[] =>
    ENTITIES.map((entity) => {
      const s = eng.get(entity)!;
      return {
        entity,
        indexes: s.gens.map((g) => ({
          name: name(entity, g),
          generation: g,
          docs: 10,
          sizeBytes: 1,
        })),
        readTarget: name(entity, s.read),
        writeTarget: name(entity, s.write),
      };
    });
  const client = {
    isConfigured: jest.fn().mockResolvedValue(true),
    bootstrap: jest.fn().mockResolvedValue([]),
    layout: jest.fn(() => Promise.resolve(layout())),
    mappingVersion: jest.fn().mockResolvedValue(1),
    createGeneration: jest.fn((e: SearchEntity, g: number) => {
      eng.get(e)!.gens.push(g);
      return Promise.resolve(name(e, g));
    }),
    bulkInto: jest.fn().mockResolvedValue({ failed: [] }),
    countIndex: jest.fn().mockResolvedValue(10),
    sample: jest.fn().mockResolvedValue([]),
    getDocs: jest.fn().mockResolvedValue(new Map()),
    swap: jest.fn(
      (
        changes: {
          entity: SearchEntity;
          which: 'read' | 'write';
          to: string;
        }[],
      ) => {
        for (const c of changes) {
          const g = Number(c.to.split('-v')[1]);
          eng.get(c.entity)![c.which] = g;
        }
        return Promise.resolve();
      },
    ),
    deleteIndex: jest.fn((index: string) => {
      for (const [e, s] of eng) {
        s.gens = s.gens.filter((g) => name(e, g) !== index);
      }
      return Promise.resolve();
    }),
    cancelReindexTask: jest.fn(),
  };
  const ids = opts.ids ?? ['a', 'b'];
  const loader = {
    idsAfter: jest.fn((_e: string, after: string | null, limit: number) => {
      const start = after ? ids.indexOf(after) + 1 : 0;
      return Promise.resolve(ids.slice(start, start + limit));
    }),
    load: jest.fn((_e: string, got: string[]) =>
      Promise.resolve(new Map(got.map((id) => [id, { id }]))),
    ),
    sampleIds: jest.fn().mockResolvedValue([]),
  };
  const settings = {
    string: jest.fn().mockResolvedValue(opts.engineMode ?? 'engine'),
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'search.reindex_keep_days' ? 7 : 0),
    ),
  };
  const svc = new SearchReindexService(
    prisma as never,
    client as never,
    loader as never,
    settings as never,
  );
  return { svc, client, loader, store, eng };
}

describe('SearchReindexService', () => {
  it('refuses to start while search.engine is postgres (no change log)', async () => {
    const { svc } = make({ engineMode: 'postgres' });
    await expect(svc.start()).rejects.toThrow(ReindexRefused);
  });

  it('start creates v2 of every entity and turns dual-writes on', async () => {
    const { svc, client } = make();
    const s = await svc.start();
    expect(s.phase).toBe('building');
    expect(client.createGeneration).toHaveBeenCalledTimes(5);
    expect(s.targets.case).toEqual({ index: 'lb-case-v2', prev: 'lb-case-v1' });
    expect((await svc.extraIndexes()).case).toEqual(['lb-case-v2']);
    await expect(svc.start()).rejects.toThrow(/already building/);
  });

  it('builds from Postgres in batches into the NEW index only, then is built', async () => {
    const { svc, client } = make();
    await svc.start();
    const s = await svc.step(5_000);
    expect(s?.phase).toBe('built');
    const targets = new Set(
      client.bulkInto.mock.calls.map((c: [string]) => c[0]),
    );
    expect([...targets].every((t) => t.endsWith('-v2'))).toBe(true);
    const ops = client.bulkInto.mock.calls[0][1] as { version: number }[];
    expect(ops[0].version).toBeGreaterThan(0);
  });

  it('is resumable: a failed batch keeps the checkpoint and the next step continues', async () => {
    const { svc, client } = make({ ids: ['a', 'b', 'c'] });
    await svc.start();
    client.bulkInto.mockResolvedValueOnce({
      failed: [{ entity: 'person', id: 'a', reason: 'boom' }],
    });
    const failed = await svc.step(5_000);
    expect(failed?.phase).toBe('building');
    expect(failed?.error).toMatch(/rejected/);
    const ok = await svc.step(5_000);
    expect(ok?.phase).toBe('built');
    expect(ok?.error).toBeNull();
  });

  it('swap: read first (after verification), then write, atomically; old stays warm', async () => {
    const { svc, client, eng } = make();
    await svc.start();
    await svc.step(5_000);
    const r = await svc.swap();
    expect(r.phase).toBe('read_swapped');
    expect(eng.get('case')).toMatchObject({ read: 2, write: 1 });
    expect(client.swap).toHaveBeenCalledTimes(1);
    expect((await svc.extraIndexes()).case).toEqual(['lb-case-v2']);
    const w = await svc.swap();
    expect(w.phase).toBe('write_swapped');
    expect(eng.get('case')).toMatchObject({ read: 2, write: 2 });
    expect(w.retainUntil).toBeDefined();
    expect((await svc.extraIndexes()).case).toEqual(['lb-case-v1']);
  });

  it('a failed verification blocks the swap and changes nothing', async () => {
    const { svc, client, eng } = make();
    await svc.start();
    await svc.step(5_000);
    client.countIndex.mockImplementation((i: string) =>
      Promise.resolve(i.endsWith('-v2') ? 1 : 100),
    );
    await expect(svc.swap()).rejects.toThrow(/Verification failed/);
    expect(client.swap).not.toHaveBeenCalled();
    expect(eng.get('case')).toMatchObject({ read: 1, write: 1 });
  });

  it('a document in the new index whose row is gone fails verification', async () => {
    const { svc, client, loader } = make();
    await svc.start();
    await svc.step(5_000);
    client.sample.mockResolvedValue([{ id: 'ghost', doc: { id: 'ghost' } }]);
    loader.load.mockResolvedValue(new Map()); // the database has no such row
    await expect(svc.swap()).rejects.toThrow(/Verification failed/);
  });

  it('rollback after both swaps puts both aliases back in one call', async () => {
    const { svc, client, eng } = make();
    await svc.start();
    await svc.step(5_000);
    await svc.swap();
    await svc.swap();
    client.swap.mockClear();
    const s = await svc.rollback();
    expect(s.phase).toBe('rolled_back');
    expect(client.swap).toHaveBeenCalledTimes(1);
    expect(eng.get('case')).toMatchObject({ read: 1, write: 1 });
    expect(await svc.extraIndexes()).toEqual({});
    expect(s.discard.map((d) => d.index)).toContain('lb-case-v2');
  });

  it('rollback while building cancels and deletes the new index at once', async () => {
    const { svc, client, eng } = make();
    await svc.start();
    const s = await svc.rollback();
    expect(s.phase).toBe('cancelled');
    expect(client.deleteIndex).toHaveBeenCalledWith('lb-case-v2');
    expect(eng.get('case')!.gens).toEqual([1]);
    expect(s.discard).toEqual([]);
  });

  it('keeps the old index until the keep window ends, then deletes it', async () => {
    const { svc, client, eng, store } = make();
    await svc.start();
    await svc.step(5_000);
    await svc.swap();
    await svc.swap();
    expect(client.deleteIndex).not.toHaveBeenCalled();
    const st = store.get('alias-reindex') as { retainUntil: string };
    st.retainUntil = new Date(Date.now() - 1000).toISOString();
    const after = await svc.step(1_000);
    expect(after?.phase).toBe('completed');
    expect(client.deleteIndex).toHaveBeenCalledWith('lb-case-v1');
    expect(eng.get('case')!.gens).toEqual([2]);
  });
});

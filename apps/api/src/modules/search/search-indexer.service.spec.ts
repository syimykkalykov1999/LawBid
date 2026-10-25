import {
  backoffSeconds,
  MAX_ATTEMPTS,
  SearchIndexerService,
} from './search-indexer.service';
import { MAPPING_VERSION } from './engine/search-engine.mappings';

function make(opts: { mode?: string; configured?: boolean } = {}) {
  const store = new Map<string, unknown>();
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    searchIndexState: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
      ),
      upsert: jest.fn(({ where, create }) => {
        store.set(where.key, create.value);
        return Promise.resolve();
      }),
      deleteMany: jest.fn(),
    },
  };
  const client = {
    isConfigured: jest.fn().mockResolvedValue(opts.configured ?? true),
    ensureIndex: jest.fn().mockResolvedValue(true),
    bulk: jest.fn().mockResolvedValue({ failed: [] }),
  };
  const data: Record<string, string[]> = {
    person: [],
    case: ['c1', 'c2', 'c3'],
    post: ['p1'],
    question: [],
    tag: [],
  };
  const loader = {
    idsAfter: jest.fn((entity: string, after: string | null, limit: number) => {
      const all = data[entity];
      const start = after ? all.indexOf(after) + 1 : 0;
      return Promise.resolve(all.slice(start, start + limit));
    }),
    load: jest.fn((entity: string, ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, { entity }]))),
    ),
  };
  const settings = {
    string: jest.fn().mockResolvedValue(opts.mode ?? 'shadow'),
  };
  const svc = new SearchIndexerService(
    prisma as never,
    client as never,
    loader as never,
    settings as never,
  );
  return { svc, prisma, client, loader, store };
}

describe('backoffSeconds', () => {
  it('doubles from 10 s and is capped at an hour', () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([10, 20, 40, 80]);
    expect(backoffSeconds(MAX_ATTEMPTS)).toBeLessThanOrEqual(3600);
    expect(backoffSeconds(40)).toBe(3600);
  });
});

describe('SearchIndexerService.tick', () => {
  it('engine off: only empties the outbox, never touches the engine', async () => {
    const { svc, client, prisma } = make({ mode: 'postgres' });
    expect(await svc.tick()).toMatchObject({ on: false });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1); // DELETE FROM search_outbox
    expect(client.isConfigured).not.toHaveBeenCalled();
    expect(client.bulk).not.toHaveBeenCalled();
  });

  it('engine on but no address: does nothing (the events wait)', async () => {
    const { svc, client } = make({ configured: false });
    expect(await svc.tick()).toEqual({ on: true });
    expect(client.ensureIndex).not.toHaveBeenCalled();
  });

  it('engine on: fills the index once, then only drains', async () => {
    const { svc, client } = make();
    await svc.tick();
    const firstBulks = client.bulk.mock.calls.length;
    expect(firstBulks).toBeGreaterThan(0);
    await svc.tick();
    expect(client.bulk.mock.calls.length).toBe(firstBulks); // already filled
  });

  it('an engine failure is logged, not thrown (the next minute retries)', async () => {
    const { svc, client } = make();
    client.bulk.mockRejectedValue(new Error('down'));
    await expect(svc.tick()).resolves.toMatchObject({ on: true });
  });
});

describe('SearchIndexerService.reindex', () => {
  it('walks every entity in batches and records the checkpoint after each batch', async () => {
    const { svc, store, client } = make();
    const st = await svc.reindex({ batch: 2 });
    expect(st).toMatchObject({
      done: true,
      version: MAPPING_VERSION,
      indexed: 4,
    });
    // case: 2 batches (c1,c2 | c3), post: 1.
    expect(client.bulk).toHaveBeenCalledTimes(3);
    expect(store.get('reindex')).toMatchObject({ done: true });
  });

  it('is resumable: a stopped pass continues after its checkpoint', async () => {
    const { svc, store, client, loader } = make();
    store.set('reindex', {
      version: MAPPING_VERSION,
      entity: 'case',
      after: 'c2',
      indexed: 2,
      done: false,
      startedAt: new Date().toISOString(),
    });
    const st = await svc.reindex({ batch: 2 });
    expect(st.done).toBe(true);
    expect(st.indexed).toBe(4); // 2 before + c3 + p1
    expect(loader.idsAfter).toHaveBeenCalledWith('case', 'c2', 2);
    expect(client.ensureIndex).not.toHaveBeenCalled(); // not a fresh start
  });

  it('a finished reindex of this mapping version does nothing; a new version starts over', async () => {
    const a = make();
    a.store.set('reindex', {
      version: MAPPING_VERSION,
      entity: null,
      after: null,
      indexed: 9,
      done: true,
      startedAt: '',
    });
    await a.svc.reindex();
    expect(a.client.bulk).not.toHaveBeenCalled();

    const b = make();
    b.store.set('reindex', {
      version: MAPPING_VERSION - 1,
      entity: null,
      after: null,
      indexed: 9,
      done: true,
      startedAt: '',
    });
    await b.svc.reindex();
    expect(b.client.bulk).toHaveBeenCalled();
  });

  it('stops at the time budget and keeps the checkpoint', async () => {
    const { svc, store } = make();
    const st = await svc.reindex({ batch: 1, budgetMs: 0.0001 });
    expect(st.done).toBe(false);
    expect(store.get('reindex')).toBeDefined();
  });

  it('rejected documents stop the pass without moving the checkpoint', async () => {
    const { svc, client, store } = make();
    client.bulk.mockResolvedValue({
      failed: [{ entity: 'case', id: 'c1', reason: 'mapping' }],
    });
    await expect(svc.reindex({ batch: 2 })).rejects.toThrow(/rejected/);
    expect((store.get('reindex') as { after: string | null }).after).toBeNull();
  });

  it('skips deletes of non-searchable rows unless asked (--sync)', async () => {
    const { svc, loader, client } = make();
    loader.load.mockResolvedValue(new Map([['c1', { entity: 'case' }]]));
    await svc.reindex({ batch: 3, entity: 'case' });
    expect(client.bulk.mock.calls[0][0]).toHaveLength(1);
    const b = make();
    b.loader.load.mockResolvedValue(new Map([['c1', { entity: 'case' }]]));
    await b.svc.reindex({ batch: 3, entity: 'case', deleteMissing: true });
    expect(b.client.bulk.mock.calls[0][0]).toHaveLength(3);
  });
});

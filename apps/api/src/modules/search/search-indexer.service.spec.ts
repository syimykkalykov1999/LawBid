import {
  backoffSeconds,
  MAX_ATTEMPTS,
  SearchIndexerService,
} from './search-indexer.service';
import { ROUTING } from '../../prisma/prisma.service';
import { shardContext } from '../../sharding/shard-context';
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
    bootstrap: jest.fn().mockResolvedValue(true),
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
    expect(client.bootstrap).not.toHaveBeenCalled();
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

describe('SearchIndexerService back-off', () => {
  it('a failed tick pauses the next ones; a good tick after the pause resets', async () => {
    const { svc, client } = make();
    const now = jest.spyOn(Date, 'now');
    let t = 1_000_000;
    now.mockImplementation(() => t);
    client.bulk.mockRejectedValue(new Error('down'));
    await svc.tick();
    const calls = client.bootstrap.mock.calls.length;
    t += 30_000; // inside the 60 s pause
    await svc.tick();
    expect(client.bootstrap.mock.calls.length).toBe(calls);
    t += 40_000; // pause over
    client.bulk.mockResolvedValue({ failed: [] });
    await svc.tick();
    expect(client.bootstrap.mock.calls.length).toBe(calls + 1);
    now.mockRestore();
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
    expect(client.bootstrap).not.toHaveBeenCalled(); // not a fresh start
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

describe('SearchIndexerService across physical databases', () => {
  /** Two databases: each holds its own outbox rows (written by triggers). */
  function twoDatabases() {
    const seen: string[] = [];
    const rows: Record<string, string[]> = { primary: ['p-1'], db1: ['d-1'] };
    const here = () => shardContext.current()?.physical ?? 'primary';
    const prisma = {
      [ROUTING]: { router: { physicalKeys: () => ['primary', 'db1'] } },
      $queryRaw: jest.fn(() => {
        const db = here();
        seen.push(`claim:${db}`);
        return Promise.resolve(
          rows[db].map((id, i) => ({
            id: `${db}-${i}`,
            entity: 'post',
            entity_id: id,
            attempts: 1,
          })),
        );
      }),
      $executeRaw: jest.fn(() => {
        seen.push(`write:${here()}`);
        return Promise.resolve(2);
      }),
    };
    const client = { bulk: jest.fn().mockResolvedValue({ failed: [] }) };
    const loader = {
      load: jest.fn((_e: string, ids: string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, { id }]))),
      ),
    };
    const svc = new SearchIndexerService(
      prisma as never,
      client as never,
      loader as never,
    );
    return { svc, seen, client };
  }

  it('drain visits every database and sums the answers', async () => {
    const t = twoDatabases();
    const res = await t.svc.drain();
    expect(res).toEqual({ done: 2, failed: 0 });
    expect(t.seen).toEqual([
      'claim:primary',
      'write:primary',
      'claim:db1',
      'write:db1',
    ]);
    const ids = t.client.bulk.mock.calls.flatMap((c) =>
      (c[0] as { id: string }[]).map((o) => o.id),
    );
    expect(ids.sort()).toEqual(['d-1', 'p-1']);
  });

  it('S7-5: drain keeps taking full batches until a short one, within the budget', async () => {
    let call = 0;
    const prisma = {
      $queryRaw: jest.fn(() => {
        call++;
        const n = call <= 2 ? 3 : 1; // two full batches (limit 3), then short
        return Promise.resolve(
          Array.from({ length: n }, (_, i) => ({
            id: `${call}-${i}`,
            entity: 'post',
            entity_id: `p${call}-${i}`,
            attempts: 1,
          })),
        );
      }),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const svc = new SearchIndexerService(
      prisma as never,
      { bulk: jest.fn().mockResolvedValue({ failed: [] }) } as never,
      {
        load: jest.fn((_e: string, ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, { id }]))),
        ),
      } as never,
    );
    expect(await svc.drain(3)).toEqual({ done: 7, failed: 0 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    call = 0;
    prisma.$queryRaw.mockClear();
    // Budget already spent: exactly one batch, the rest waits.
    await svc.drain(3, -1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('prune empties the outbox of every database', async () => {
    const t = twoDatabases();
    expect(await t.svc.prune(false)).toBe(4);
    expect(t.seen).toEqual(['write:primary', 'write:db1']);
  });
});

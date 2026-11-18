import { StorageCleanupService } from './storage-cleanup.service';

/**
 * Verify batch 13 (DB1): the hourly cleanup walks the live files from a
 * saved cursor, a bounded number of pages per run, instead of re-reading
 * every live file from the oldest one on every run.
 */
type Cursor = { id: string; at: Date };

function world(total: number, orphans: Set<number>) {
  const files = Array.from({ length: total }, (_, i) => ({
    id: `f${String(i).padStart(6, '0')}`,
    at: new Date(Date.UTC(2026, 0, 1) + i * 1000),
    live: true,
  }));
  const kv = new Map<string, string>();
  const redis = {
    get: (k: string) => Promise.resolve(kv.get(k) ?? null),
    set: (k: string, v: string) => {
      kv.set(k, v);
      return Promise.resolve('OK');
    },
    del: (k: string) => Promise.resolve(kv.delete(k) ? 1 : 0),
  };
  const svc = new StorageCleanupService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    redis as never,
    { setContext: jest.fn() } as never,
  );
  const read: number[] = [];
  let lastPage = new Set<string>();
  Object.assign(svc, {
    livePage: (_g: Date, after: Cursor | null) => {
      const rows = files
        .filter(
          (f) =>
            f.live &&
            (!after ||
              f.at > after.at ||
              (f.at.getTime() === after.at.getTime() && f.id > after.id)),
        )
        .slice(0, 2000);
      read.push(rows.length);
      lastPage = new Set(rows.map((f) => f.id));
      return Promise.resolve(rows.map((f) => ({ id: f.id, at: f.at })));
    },
    unused: () =>
      Promise.resolve(
        files
          .filter((f, i) => f.live && orphans.has(i) && lastPage.has(f.id))
          .map((f) => f.id),
      ),
    onPosts: () => Promise.resolve([]),
    setAside: (ids: string[]) => {
      for (const f of files) if (ids.includes(f.id)) f.live = false;
      return Promise.resolve(ids.length);
    },
  });
  return { svc, read, kv };
}

describe('StorageCleanupService.sweepOrphans — cursor walk (verify batch 13, DB1)', () => {
  const run = (svc: StorageCleanupService) => {
    const result = { orphansFound: 0, deletedPostMedia: 0 };
    return svc
      .sweepOrphans(new Date(), new Date(), new Date(), result)
      .then(() => result);
  };

  it('one run reads at most 20 pages of 2 000, the next one goes on, the end wraps', async () => {
    const { svc, read, kv } = world(100_000, new Set([99_000]));
    const r1 = await run(svc);
    expect(read).toHaveLength(20);
    expect(read.every((n) => n === 2000)).toBe(true);
    expect(r1.orphansFound).toBe(0);
    expect(kv.size).toBe(1); // the cursor: file 39 999
    read.length = 0;
    await run(svc); // files 40 000 … 79 999
    read.length = 0;
    const r3 = await run(svc); // 80 000 … the end
    expect(r3.orphansFound).toBe(1);
    expect(read.at(-1)).toBeLessThan(2000);
    expect(kv.size).toBe(0); // wrapped: next run starts from the oldest
  });
});

import { PostVideosService } from './post-videos.service';

/**
 * Verify batch 13 (X7): the "uploads nobody attached" step of the minute
 * sweep checks one page of finished videos per run and goes on from where
 * the last run stopped, instead of re-reading every finished video ever
 * uploaded each minute.
 */
type Where = Record<string, unknown>;

function world(total: number, attached: Set<number>) {
  const videos = Array.from({ length: total }, (_, i) => ({
    id: `v${String(i).padStart(5, '0')}`,
    status: 'ready',
    deleted_at: null as Date | null,
    created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000),
  }));
  const pages: Where[] = [];
  const findMany = jest.fn(
    ({ where, take }: { where: Where; take?: number }) => {
      // Steps (a), (b), (d) of the sweep: nothing to do.
      if (
        !('created_at' in where) ||
        (where.status !== undefined && typeof where.status === 'string')
      ) {
        return Promise.resolve([]);
      }
      if ('OR' in where && !('id' in where) && !('deleted_at' in where)) {
        return Promise.resolve([]);
      }
      if ('id' in where) {
        const ids = (where.id as { in: string[] }).in;
        return Promise.resolve(
          videos
            .filter(
              (v, i) => ids.includes(v.id) && !attached.has(i) && !v.deleted_at,
            )
            .slice(0, take ?? Infinity)
            .map((v) => ({ id: v.id })),
        );
      }
      pages.push(where);
      let rows = videos.filter((v) => !v.deleted_at);
      const or = where.OR as
        | [
            { created_at: { gt: Date } },
            { created_at: Date; id: { gt: string } },
          ]
        | undefined;
      if (or) {
        const at = or[0].created_at.gt.getTime();
        const id = or[1].id.gt;
        rows = rows.filter(
          (v) =>
            v.created_at.getTime() > at ||
            (v.created_at.getTime() === at && v.id > id),
        );
      }
      return Promise.resolve(rows.slice(0, take));
    },
  );
  const markDeleted = jest.fn((ids: string[]) => {
    for (const v of videos) if (ids.includes(v.id)) v.deleted_at = new Date();
    return Promise.resolve();
  });
  const prisma = {
    videoAsset: { findMany, updateMany: jest.fn() },
    post: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const svc = new PostVideosService(
    prisma as never,
    {
      onStatusChange: jest.fn(),
      ensureWebhook: jest.fn().mockResolvedValue(undefined),
      markDeleted,
      purgeNow: jest.fn(),
    } as never,
    {} as never,
  );
  return { svc, pages, markDeleted };
}

describe('PostVideosService.sweep — orphan walk (verify batch 13, X7)', () => {
  it('reads one page per run, goes on from the cursor and wraps at the end', async () => {
    const attached = new Set(Array.from({ length: 1200 }, (_, i) => i));
    attached.delete(700); // the one orphan, in the second page
    const { svc, pages, markDeleted } = world(1200, attached);
    const s1 = await svc.sweep();
    expect(s1.orphans).toBe(0);
    expect(pages[0]).not.toHaveProperty('OR');
    const s2 = await svc.sweep();
    expect(s2.orphans).toBe(1);
    expect(markDeleted).toHaveBeenLastCalledWith(['v00700']);
    expect(pages[1]).toHaveProperty('OR');
    await svc.sweep(); // the last, short page
    await svc.sweep(); // starts again from the oldest
    expect(pages[3]).not.toHaveProperty('OR');
  });
});

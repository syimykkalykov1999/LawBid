import { StickersService } from './stickers.service';

/** Pack E (25.11, ROUND2 #19): the admin's sticker caps («own packs»,
 * «stickers in a pack») hold for two requests at the same moment, and two
 * adds never take the same position. The fake keeps rows in memory and
 * models pg_advisory_xact_lock: a second transaction waits on the key until
 * the first one ends. */
describe('StickersService caps under concurrency', () => {
  const tick = () => new Promise((r) => setImmediate(r));

  function make(limits: Record<string, number>) {
    const packs: {
      id: string;
      owner_user_id: string;
      sticker_count: number;
      deleted_at: null;
    }[] = [];
    const stickers: { pack_id: string; position: number }[] = [];
    const stickerPack = {
      count: jest.fn(async (a: { where: { owner_user_id: string } }) => {
        await tick();
        return packs.filter((p) => p.owner_user_id === a.where.owner_user_id)
          .length;
      }),
      create: jest.fn(async (a: { data: { owner_user_id: string } }) => {
        await tick();
        const p = {
          id: `00000000-0000-4000-8000-${String(packs.length + 1).padStart(12, '0')}`,
          owner_user_id: a.data.owner_user_id,
          sticker_count: 0,
          deleted_at: null,
          stickers: [],
        };
        packs.push(p);
        return p;
      }),
      findUnique: jest.fn(async (a: { where: { id: string } }) => {
        await tick();
        const p = packs.find((x) => x.id === a.where.id);
        return p ? { sticker_count: p.sticker_count } : null;
      }),
      findFirst: jest.fn(async (a: { where: { id: string } }) => {
        await tick();
        const p = packs.find((x) => x.id === a.where.id);
        return p ? { ...p, stickers: [] } : null;
      }),
      update: jest.fn(
        async (a: {
          where: { id: string };
          data: { sticker_count: { increment: number } };
        }) => {
          await tick();
          const p = packs.find((x) => x.id === a.where.id)!;
          p.sticker_count += a.data.sticker_count.increment;
          return p;
        },
      ),
    };
    const sticker = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        async (a: { data: { pack_id: string; position: number } }) => {
          await tick();
          stickers.push(a.data);
          return { id: `s${stickers.length}`, ...a.data };
        },
      ),
    };
    const userStickerPack = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    };
    const held = new Map<string, Promise<void>>();
    const tx = (release: (() => void)[]) => ({
      stickerPack,
      sticker,
      userStickerPack,
      $executeRaw: async (_s: TemplateStringsArray, key: string) => {
        while (held.has(key)) await held.get(key);
        let done!: () => void;
        held.set(key, new Promise<void>((r) => (done = r)));
        release.push(() => {
          held.delete(key);
          done();
        });
      },
    });
    const prisma = {
      stickerPack,
      sticker,
      userStickerPack,
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
        const release: (() => void)[] = [];
        try {
          return await fn(tx(release));
        } finally {
          for (const r of release) r();
        }
      },
    };
    const settings = {
      number: jest.fn((k: string) => Promise.resolve(limits[k] ?? 100)),
      raw: jest.fn().mockResolvedValue('off'),
      boolean: jest.fn().mockResolvedValue(false),
    };
    const svc = new StickersService(
      prisma as never,
      { assertAttachable: jest.fn().mockResolvedValue(undefined) } as never,
      settings as never,
      { consume: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
    );
    const internals = svc as unknown as Record<string, unknown>;
    internals.pack = jest.fn().mockResolvedValue({});
    internals.present = jest.fn().mockResolvedValue([{}]);
    internals.initialModeration = jest.fn().mockResolvedValue('active');
    internals.sticker = jest.fn().mockReturnValue({});
    internals.urls = jest.fn().mockResolvedValue(new Map());
    return { svc, packs, stickers };
  }

  it('own packs: two creates with one slot left make one pack', async () => {
    const { svc, packs } = make({ 'stickers.max_own_packs': 1 });
    const out = await Promise.allSettled([
      svc.create('u1', 'A'),
      svc.create('u1', 'B'),
    ]);
    expect(packs).toHaveLength(1);
    expect(out.filter((o) => o.status === 'rejected')).toHaveLength(1);
  });

  it('stickers in a pack: the cap holds and positions stay distinct', async () => {
    const { svc, packs, stickers } = make({ 'stickers.max_per_pack': 2 });
    await svc.create('u1', 'A');
    const out = await Promise.allSettled([
      svc.add('u1', packs[0].id, 'f1'),
      svc.add('u1', packs[0].id, 'f2'),
      svc.add('u1', packs[0].id, 'f3'),
    ]);
    expect(stickers).toHaveLength(2);
    expect(out.filter((o) => o.status === 'rejected')).toHaveLength(1);
    expect(new Set(stickers.map((s) => s.position)).size).toBe(2);
    expect(packs[0].sticker_count).toBe(2);
  });
});

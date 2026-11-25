import { ConflictException } from '@nestjs/common';
import { StoriesService } from './stories.service';

/** Pack E (25.11, ROUND2 #19): the admin's «active stories» cap holds for
 * two posts sent at the same moment (double tap, two devices). The fake
 * keeps stories in memory and models pg_advisory_xact_lock: a second
 * transaction waits on the key until the first one ends. */
describe('StoriesService.create cap under concurrency', () => {
  function make(max: number) {
    const rows: { author_id: string }[] = [];
    const tick = () => new Promise((r) => setImmediate(r));
    const story = {
      count: jest.fn(async (a: { where: { author_id?: string } }) => {
        await tick();
        return rows.filter((r) => r.author_id === a.where.author_id).length;
      }),
      create: jest.fn(async (a: { data: { author_id: string } }) => {
        await tick();
        rows.push(a.data);
        return { id: `s${rows.length}`, ...a.data };
      }),
    };
    const held = new Map<string, Promise<void>>();
    const prisma = {
      story,
      storySetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const release: (() => void)[] = [];
        const tx = {
          story,
          $executeRaw: async (_s: TemplateStringsArray, key: string) => {
            while (held.has(key)) await held.get(key);
            let done!: () => void;
            held.set(key, new Promise<void>((r) => (done = r)));
            release.push(() => {
              held.delete(key);
              done();
            });
          },
        };
        try {
          return await fn(tx);
        } finally {
          for (const r of release) r();
        }
      },
    };
    const settings = {
      number: jest.fn((k: string) =>
        Promise.resolve(k === 'stories.max_active_per_user' ? max : 24),
      ),
    };
    const svc = new StoriesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      settings as never,
      { consume: jest.fn().mockResolvedValue(undefined) } as never,
      { isEnabled: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
    );
    jest.spyOn(svc, 'present').mockResolvedValue([{} as never]);
    return { svc, rows };
  }
  const user = { sub: 'u1' } as never;
  const dto = { kind: 'text', text: 'hello' } as never;

  it('two posts at once with one slot left: one story, one refusal', async () => {
    const { svc, rows } = make(1);
    const out = await Promise.allSettled([
      svc.create(user, dto),
      svc.create(user, dto),
    ]);
    expect(rows).toHaveLength(1);
    const refused = out.filter((o) => o.status === 'rejected');
    expect(refused).toHaveLength(1);
    expect(refused[0].reason).toBeInstanceOf(ConflictException);
  });

  it('room for both: both are posted', async () => {
    const { svc, rows } = make(2);
    await Promise.all([svc.create(user, dto), svc.create(user, dto)]);
    expect(rows).toHaveLength(2);
  });
});

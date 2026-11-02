import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_PIN_SLOT, PinPostDto } from './dto/posts.dto';
import { PostsService } from './posts.service';

// Owner 2026-10-12: pinning takes slot 1..6 (1..3 until 2026-10-28) of the post's own list; a taken
// slot is handed over (swap) or freed, never refused.
type Row = { id: string; pin_slot: number | null; pin_group: string | null };

function service(rows: Row[], brief: boolean) {
  const tx = {
    post: {
      findFirst: jest.fn(
        ({ where }: { where: { pin_slot: number; pin_group: string } }) =>
          Promise.resolve(
            rows.find(
              (r) =>
                r.pin_slot === where.pin_slot &&
                r.pin_group === where.pin_group,
            ) ?? null,
          ),
      ),
      updateMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) => {
        for (const r of rows) {
          if (where.id.in.includes(r.id)) {
            r.pin_slot = null;
            r.pin_group = null;
          }
        }
        return Promise.resolve({ count: where.id.in.length });
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { pin_slot: number; pin_group: string };
        }) => {
          const r = rows.find((x) => x.id === where.id)!;
          r.pin_slot = data.pin_slot;
          r.pin_group = data.pin_group;
          return Promise.resolve({ ...r });
        },
      ),
    },
  };
  const prisma = {
    post: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
      ),
      count: jest.fn(() => Promise.resolve(brief ? 1 : 0)),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const svc = Object.create(PostsService.prototype) as PostsService;
  Object.assign(svc, {
    prisma,
    presenter: { present: jest.fn(() => Promise.resolve([{}])) },
  });
  return svc;
}

const user = { sub: 'u1', role: 'attorney' } as never;

describe('PostsService.pin', () => {
  it('pins into a free slot', async () => {
    const rows: Row[] = [{ id: 'a', pin_slot: null, pin_group: null }];
    await service(rows, false).pin(user, 'a', 2);
    expect(rows[0]).toMatchObject({ pin_slot: 2, pin_group: 'grid' });
  });

  it('puts a brief in the brief group', async () => {
    const rows: Row[] = [{ id: 'a', pin_slot: null, pin_group: null }];
    await service(rows, true).pin(user, 'a', 1);
    expect(rows[0]).toMatchObject({ pin_slot: 1, pin_group: 'brief' });
  });

  it('frees the old holder of a taken slot', async () => {
    const rows: Row[] = [
      { id: 'a', pin_slot: null, pin_group: null },
      { id: 'b', pin_slot: 2, pin_group: 'grid' },
    ];
    await service(rows, false).pin(user, 'a', 2);
    expect(rows[0]).toMatchObject({ pin_slot: 2 });
    expect(rows[1]).toMatchObject({ pin_slot: null, pin_group: null });
  });

  it('swaps when a pinned post moves onto a taken slot', async () => {
    const rows: Row[] = [
      { id: 'a', pin_slot: 1, pin_group: 'grid' },
      { id: 'b', pin_slot: 3, pin_group: 'grid' },
    ];
    await service(rows, false).pin(user, 'a', 3);
    expect(rows[0]).toMatchObject({ pin_slot: 3 });
    expect(rows[1]).toMatchObject({ pin_slot: 1 });
  });

  it('owner 2026-10-28: slots 4..6 work in both groups', async () => {
    const grid: Row[] = [{ id: 'a', pin_slot: null, pin_group: null }];
    await service(grid, false).pin(user, 'a', 6);
    expect(grid[0]).toMatchObject({ pin_slot: 6, pin_group: 'grid' });
    const brief: Row[] = [
      { id: 'a', pin_slot: 2, pin_group: 'brief' },
      { id: 'b', pin_slot: 5, pin_group: 'brief' },
    ];
    await service(brief, true).pin(user, 'a', 5);
    expect(brief[0]).toMatchObject({ pin_slot: 5, pin_group: 'brief' });
    expect(brief[1]).toMatchObject({ pin_slot: 2, pin_group: 'brief' });
  });
});

describe('PinPostDto', () => {
  const check = (slot: unknown) =>
    validateSync(plainToInstance(PinPostDto, { slot })).length;
  it('accepts 1..6, refuses 0 and 7', () => {
    for (const s of [1, 2, 3, 4, 5, 6]) expect(check(s)).toBe(0);
    expect(check(0)).toBeGreaterThan(0);
    expect(check(7)).toBeGreaterThan(0);
    expect(MAX_PIN_SLOT).toBe(6);
  });
});

import type { PrismaService } from '../../prisma/prisma.service';
import { StaffDigestService } from './staff-digest.service';

function build(opts: { existing?: boolean } = {}) {
  const created: unknown[] = [];
  const prisma = {
    staffDigest: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.existing ? { week_start: 1 } : null),
      createMany: jest
        .fn()
        .mockImplementation(({ data }: { data: unknown[] }) => {
          created.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      findMany: jest.fn().mockResolvedValue([
        {
          week_start: new Date('2026-10-19'),
          payload: { decisions: 5 },
          created_at: new Date('2026-10-26T13:00:00Z'),
        },
      ]),
    },
    staffDailyStat: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { decided: 400, reopened: 14 } }),
    },
    adminAppeal: { count: jest.fn().mockResolvedValue(2) },
    staffPieceworkDay: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount_cents: 98765 } }),
    },
    adminProfile: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { user: { id: 'o1', email: 'o@x.test' } },
          { user: { id: 'o2', email: null } },
        ]),
    },
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([
        { status: 'red', c: 1n },
        { status: 'yellow', c: 2n },
        { status: 'green', c: 4n },
        { status: 'ok', c: 50n },
      ])
      .mockResolvedValueOnce([
        { bucket: 'worst', first_name: 'Пётр', last_name: 'И' },
        { bucket: 'best', first_name: 'Анна', last_name: null },
      ]),
  };
  const svc = new StaffDigestService(prisma as unknown as PrismaService);
  return { svc, prisma, created };
}

describe('StaffDigestService', () => {
  it('composes the five numbers from the nightly tables', async () => {
    const { svc } = build();
    expect(await svc.compose(new Date('2026-10-19T00:00:00Z'))).toEqual({
      decisions: 400,
      returnedPct: 3.5,
      appeals: 2,
      worstCount: 3,
      bestCount: 4,
      worstName: 'Пётр И',
      bestName: 'Анна',
      pieceworkCents: 98765,
      currency: 'usd',
    });
  });

  it('stores one row for last week and returns it to be sent', async () => {
    const { svc, created } = build();
    const r = await svc.prepare(new Date('2026-10-26T13:00:00Z'));
    expect(r?.week).toBe('2026-10-19');
    expect(r?.numbers.decisions).toBe(400);
    expect(created).toHaveLength(1);
  });

  it('a week that already has a row is not prepared twice', async () => {
    const { svc, prisma } = build({ existing: true });
    expect(await svc.prepare(new Date('2026-10-26T13:00:00Z'))).toBeNull();
    expect(prisma.staffDailyStat.aggregate).not.toHaveBeenCalled();
  });

  it('a lost race on the unique week returns nothing to send', async () => {
    const { svc, prisma } = build();
    prisma.staffDigest.createMany.mockResolvedValue({ count: 0 });
    expect(await svc.prepare(new Date('2026-10-26T13:00:00Z'))).toBeNull();
  });

  it('the recipients are the active super admins', async () => {
    const { svc } = build();
    expect(await svc.recipients()).toEqual([
      { id: 'o1', email: 'o@x.test' },
      { id: 'o2', email: null },
    ]);
  });

  it('lists the stored digests', async () => {
    const { svc } = build();
    expect((await svc.list()).items[0]).toMatchObject({
      weekStart: '2026-10-19',
    });
  });
});

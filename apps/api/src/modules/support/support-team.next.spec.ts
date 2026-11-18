import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminSupportService } from './admin-support.service';
import { SupportTeamService } from './support-team.service';

const ADMIN = '22222222-2222-4222-8222-222222222222';

type Ctor = ConstructorParameters<typeof SupportTeamService>;

function setup() {
  const prisma = {
    supportTicket: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'free' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  const tickets = { get: jest.fn().mockResolvedValue({ id: 'free' }) };
  const service = new SupportTeamService(
    prisma as unknown as PrismaService,
    {} as Ctor[1],
    tickets as unknown as AdminSupportService,
  );
  return { service, prisma, tickets };
}

describe('SupportTeamService.next — verify 18.11 (SU2)', () => {
  it('a country-scoped agent only looks at and takes tickets of their countries', async () => {
    const { service, prisma, tickets } = setup();
    await service.next(ADMIN, ['CA']);
    expect(prisma.supportTicket.findFirst).toHaveBeenCalledTimes(2);
    for (const call of prisma.supportTicket.findFirst.mock.calls) {
      expect(call[0].where).toMatchObject({ country_code: { in: ['CA'] } });
    }
    expect(tickets.get).toHaveBeenCalledWith('free', ['CA']);
  });

  it('an unscoped agent keeps the whole queue', async () => {
    const { service, prisma } = setup();
    await service.next(ADMIN, null);
    for (const call of prisma.supportTicket.findFirst.mock.calls) {
      expect(call[0].where.country_code).toBeUndefined();
    }
  });
});

import { AdminCountsService } from './admin-counts.service';

describe('AdminCountsService', () => {
  function build() {
    const prisma = {
      verificationRequest: { count: jest.fn(() => Promise.resolve(3)) },
      report: { count: jest.fn(() => Promise.resolve(2)) },
      supportTicket: { count: jest.fn(() => Promise.resolve(1)) },
    };
    const trust = { queueSizeCached: jest.fn(() => Promise.resolve(4)) };
    const summary = {
      get: jest.fn(
        async (_k: string, compute: () => Promise<unknown>, fresh: number) => ({
          data: await compute(),
          computedAt: String(fresh),
        }),
      ),
    };
    const svc = new AdminCountsService(
      prisma as never,
      trust as never,
      summary as never,
    );
    return { svc, prisma, summary };
  }

  it('reads the four counts through the shared 30 s summary', async () => {
    const { svc, summary, prisma } = build();
    expect(await svc.get()).toEqual({
      verificationQueue: 3,
      openReports: 2,
      supportUnread: 1,
      trustQueue: 4,
    });
    expect(summary.get).toHaveBeenCalledWith(
      'admin-counts',
      expect.any(Function),
      30,
    );
    expect(prisma.report.count).toHaveBeenCalledTimes(1);
  });
});

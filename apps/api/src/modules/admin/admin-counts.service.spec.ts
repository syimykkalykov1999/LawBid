import { AdminCountsService } from './admin-counts.service';

describe('AdminCountsService', () => {
  function build() {
    const prisma = {
      verificationRequest: { count: jest.fn(() => Promise.resolve(3)) },
      $queryRaw: jest.fn(() => Promise.resolve([{ n: 2 }])),
      supportTicket: { count: jest.fn(() => Promise.resolve(1)) },
    };
    const trust = { queueSizeCached: jest.fn(() => Promise.resolve(4)) };
    const summary = {
      getScoped: jest.fn(
        async (
          _k: string,
          _scope: string | null,
          compute: () => Promise<unknown>,
          fresh: number,
        ) => ({
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
    return { svc, prisma, summary, trust };
  }

  it('reads the four counts through the shared 30 s summary', async () => {
    const { svc, summary, prisma } = build();
    expect(await svc.get()).toEqual({
      verificationQueue: 3,
      openReports: 2,
      supportUnread: 1,
      trustQueue: 4,
    });
    expect(summary.getScoped).toHaveBeenCalledWith(
      'admin-counts',
      null,
      expect.any(Function),
      30,
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  /** R-403: the badge counts exactly what the default list view shows. */
  it('counts with the list predicates: default verification statuses, grouped open reports, unread tickets', async () => {
    const { svc, prisma } = build();
    await svc.get();
    expect(prisma.verificationRequest.count).toHaveBeenCalledWith({
      where: {
        status: { in: ['submitted', 'needs_more_info'] },
        submitted_at: { not: null },
      },
    });
    const sql = (prisma.$queryRaw.mock.calls[0] as unknown[])[0] as {
      sql: string;
      text: string;
      values: unknown[];
    };
    expect(sql.sql).toMatch(/GROUP BY target_type, target_id/);
    expect(sql.text).toMatch(
      /FROM reports\s+WHERE status = \$1::report_status/,
    );
    expect(sql.values).toEqual(['open']);
    expect(prisma.supportTicket.count).toHaveBeenCalledWith({
      where: { unread_by_admin: true, status: { not: 'closed' } },
    });
  });

  /** R-403: the lists are narrowed to the admin's countries; so are badges. */
  it('counts in the country scope of the admin, one stored copy per scope', async () => {
    const { svc, prisma, summary, trust } = build();
    await svc.get(['US', 'CA']);
    expect(summary.getScoped).toHaveBeenCalledWith(
      'admin-counts',
      'CA,US',
      expect.any(Function),
      30,
    );
    expect(prisma.verificationRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: [{ attorney: { user: { country_code: { in: ['US', 'CA'] } } } }],
      }),
    });
    const sql = (prisma.$queryRaw.mock.calls[0] as unknown[])[0] as {
      sql: string;
      values: unknown[];
    };
    expect(sql.sql).toMatch(/reporter_id IN \(SELECT id FROM users/);
    expect(sql.values).toEqual(['open', ['US', 'CA']]);
    expect(prisma.supportTicket.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ country_code: { in: ['US', 'CA'] } }),
    });
    expect(trust.queueSizeCached).toHaveBeenCalledWith(['US', 'CA']);
  });

  it('bigint-safe: a raw count answers a number, an empty answer is 0', async () => {
    const { svc, prisma } = build();
    prisma.$queryRaw.mockResolvedValueOnce([{ n: 7 }]);
    expect((await svc.get()).openReports).toBe(7);
    prisma.$queryRaw.mockResolvedValueOnce([]);
    expect((await svc.get()).openReports).toBe(0);
  });
});

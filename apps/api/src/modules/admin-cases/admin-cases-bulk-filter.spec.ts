import { AdminCaseManagementController } from './admin-case-management.controller';
import { AdminCaseManagementService } from './admin-case-management.service';

/**
 * Owner 14.11 (row 179 follow-up B6): «Выбрать всё по фильтру» on the
 * cases list sends the FILTER; the server resolves the ids with exactly the
 * list's where (incl. «Только с жалобами», «С датой», country scope).
 */
describe('admin cases bulk by filter', () => {
  const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
  const staff = {
    id: 's',
    ip: null,
    adminRole: 'support',
    countries: ['US'],
  } as never;
  const filter = {
    status: 'open' as const,
    stateCode: 'NV',
    hasReports: true,
    withDeadline: true,
  };

  function build(n = 3) {
    const findMany = jest.fn(
      (a: { take?: number; select?: Record<string, unknown> }) =>
        Promise.resolve(
          a.select && Object.keys(a.select).length === 1
            ? Array.from({ length: Math.min(n, a.take ?? n) }, (_, i) => ({
                id: `c${i}`,
              }))
            : [],
        ),
    );
    const prisma = {
      case: { findMany },
      report: {
        findMany: jest.fn().mockResolvedValue([{ target_id: 'r1' }]),
      },
    };
    const service = Object.create(
      AdminCaseManagementService.prototype,
    ) as AdminCaseManagementService;
    Object.assign(service, {
      prisma,
      settings: { string: jest.fn().mockResolvedValue('America/Los_Angeles') },
    });
    const act = jest
      .spyOn(service, 'act')
      .mockResolvedValue(undefined as never);
    const record = jest.fn().mockResolvedValue(undefined);
    const settings = { number: jest.fn().mockResolvedValue(2) };
    const ctl = Object.create(
      AdminCaseManagementController.prototype,
    ) as AdminCaseManagementController;
    Object.assign(ctl, { cases: service, audit: { record }, settings });
    return { ctl, service, findMany, act, record, settings };
  }

  it('the ids come from the very where of the cases list', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-14T03:00:00Z'));
    try {
      const { service, findMany } = build();
      await service.list(filter, ['US']);
      await service.idsByFilter(filter, ['US'], null);
      const calls = findMany.mock.calls as [
        { where: unknown; select: Record<string, unknown> },
      ][];
      const list = calls.find(([a]) => Object.keys(a.select).length > 1)![0];
      const ids = calls.find(([a]) => Object.keys(a.select).length === 1)![0];
      expect(ids.where).toEqual(list.where);
      expect(JSON.stringify(ids.where)).toContain('deadline_at');
      expect(JSON.stringify(ids.where)).toContain('r1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('staff: capped by admin.bulk_select_cap, the filter audited, each case acted on', async () => {
    const { ctl, act, record, settings } = build();
    const out = await ctl.bulkAdminCases(staff, {
      action: 'archive',
      filter,
      reason: 'spam wave!!',
    } as never);
    expect(settings.number).toHaveBeenCalledWith('admin.bulk_select_cap');
    expect(out.done).toEqual(['c0', 'c1']);
    expect(act).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({
      action: 'admin.cases.bulk_filter',
      targetType: 'case_filter',
      after: { action: 'archive', matched: 2, capped: true },
    });
  });

  it('the owner: every match, no cap', async () => {
    const { ctl, act } = build(3);
    const out = await ctl.bulkAdminCases(owner, {
      action: 'hide',
      filter: {},
      reason: 'spam wave!!',
    } as never);
    expect(out.done).toHaveLength(3);
    expect(act).toHaveBeenCalledTimes(3);
  });

  it('preview', async () => {
    const { ctl } = build(3);
    await expect(ctl.previewAdminCasesBulk(staff, { filter })).resolves.toEqual(
      { matched: 2, capped: true, cap: 2 },
    );
  });
});

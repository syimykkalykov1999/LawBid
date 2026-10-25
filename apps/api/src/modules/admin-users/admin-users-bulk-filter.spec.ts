import { BadRequestException } from '@nestjs/common';
import {
  AdminUsersService,
  BULK_FILTER_CAP,
  USERS_AUDIT,
} from './admin-users.service';

/** S18-10: «select all matching» is resolved on the server and audited. */
describe('AdminUsersService.bulk with a filter', () => {
  const admin = { id: 'adm1', ip: '1.1.1.1', countries: null } as never;

  function build(total: number) {
    const count = jest.fn().mockResolvedValue(total);
    const findMany = jest.fn().mockResolvedValue(
      Array.from({ length: Math.min(total, BULK_FILTER_CAP) }, (_, i) => ({
        id: `u${i}`,
      })),
    );
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = Object.create(AdminUsersService.prototype) as AdminUsersService;
    Object.assign(svc, {
      prisma: { user: { count, findMany } },
      audit: { record },
    });
    const logout = jest
      .spyOn(svc, 'revokeSessions')
      .mockResolvedValue({} as never);
    return { svc, count, findMany, record, logout };
  }

  it('resolves the ids with the list filter, runs the action and audits the filter', async () => {
    const { svc, findMany, record, logout } = build(3);
    const out = await svc.bulk(admin, {
      action: 'logout',
      filter: { role: 'client', status: 'active' },
      reason: '',
    } as never);
    expect(out.done).toEqual(['u0', 'u1', 'u2']);
    expect(logout).toHaveBeenCalledTimes(3);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ role: 'client', status: 'active' });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: USERS_AUDIT.bulkFilter,
        after: expect.objectContaining({
          action: 'logout',
          filter: { role: 'client', status: 'active' },
          matched: 3,
          processed: 3,
        }),
      }),
    );
  });

  it('never touches more than the cap and says how many matched', async () => {
    const { svc, record, logout } = build(BULK_FILTER_CAP + 400);
    await svc.bulk(admin, {
      action: 'logout',
      filter: {},
      reason: '',
    } as never);
    expect(logout).toHaveBeenCalledTimes(BULK_FILTER_CAP);
    expect(record.mock.calls[0][0].after).toMatchObject({
      matched: BULK_FILTER_CAP + 400,
      processed: BULK_FILTER_CAP,
    });
  });

  it('wants exactly one of ids / filter', async () => {
    const { svc } = build(1);
    await expect(
      svc.bulk(admin, { action: 'logout', reason: '' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.bulk(admin, {
        action: 'logout',
        ids: ['a'],
        filter: {},
        reason: '',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('previews the count without running anything', async () => {
    const { svc, logout } = build(42);
    expect(await svc.bulkPreview({ status: 'suspended' })).toEqual({
      count: 42,
      cap: BULK_FILTER_CAP,
    });
    expect(logout).not.toHaveBeenCalled();
  });
});

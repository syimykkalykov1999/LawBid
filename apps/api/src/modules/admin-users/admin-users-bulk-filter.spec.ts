import { BadRequestException } from '@nestjs/common';
import {
  AdminUsersService,
  BULK_PREVIEW_CAP,
  USERS_AUDIT,
} from './admin-users.service';

/** S18-10: «select all matching» is resolved on the server and audited.
 * Owner 2026-10-25: without a live count — a bounded id list (cap + 1). */
describe('AdminUsersService.bulk with a filter', () => {
  const admin = { id: 'adm1', ip: '1.1.1.1', countries: null } as never;

  function build(total: number) {
    const findMany = jest
      .fn()
      .mockImplementation(({ take }: { take: number }) =>
        Promise.resolve(
          Array.from({ length: Math.min(total, take) }, (_, i) => ({
            id: `u${i}`,
          })),
        ),
      );
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = Object.create(AdminUsersService.prototype) as AdminUsersService;
    Object.assign(svc, {
      prisma: { user: { findMany } },
      audit: { record },
    });
    const logout = jest
      .spyOn(svc, 'revokeSessions')
      .mockResolvedValue({} as never);
    return { svc, findMany, record, logout };
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
    const call = findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ role: 'client', status: 'active' });
    expect(call.take).toBe(BULK_PREVIEW_CAP + 1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: USERS_AUDIT.bulkFilter,
        after: expect.objectContaining({
          action: 'logout',
          filter: { role: 'client', status: 'active' },
          matched: 3,
          capped: false,
          processed: 3,
        }),
      }),
    );
  });

  it('never touches more than the cap and says the cap cut the list', async () => {
    const { svc, record, logout } = build(BULK_PREVIEW_CAP + 400);
    await svc.bulk(admin, {
      action: 'logout',
      filter: {},
      reason: '',
    } as never);
    expect(logout).toHaveBeenCalledTimes(BULK_PREVIEW_CAP);
    expect(record.mock.calls[0][0].after).toMatchObject({
      matched: BULK_PREVIEW_CAP,
      capped: true,
      processed: BULK_PREVIEW_CAP,
    });
  });

  it('owner 12.11: the owner acts on every match, read in pages of the cap', async () => {
    const total = BULK_PREVIEW_CAP * 2 + 37;
    const findMany = jest
      .fn()
      .mockImplementation(
        ({ take, cursor }: { take: number; cursor?: { id: string } }) => {
          const start = cursor ? Number(cursor.id.slice(1)) + 1 : 0;
          const end = Math.min(total, start + take);
          return Promise.resolve(
            Array.from({ length: Math.max(0, end - start) }, (_, i) => ({
              id: `u${start + i}`,
            })),
          );
        },
      );
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = Object.create(AdminUsersService.prototype) as AdminUsersService;
    Object.assign(svc, { prisma: { user: { findMany } }, audit: { record } });
    const logout = jest
      .spyOn(svc, 'revokeSessions')
      .mockResolvedValue({} as never);
    const owner = { ...(admin as object), adminRole: 'super_admin' } as never;
    const out = await svc.bulk(owner, {
      action: 'logout',
      filter: {},
      reason: '',
    } as never);
    expect(out.done).toHaveLength(total);
    expect(logout).toHaveBeenCalledTimes(total);
    expect(
      findMany.mock.calls.every(
        ([a]: [{ take: number }]) => a.take <= BULK_PREVIEW_CAP,
      ),
    ).toBe(true);
    expect(record.mock.calls[0][0].after).toMatchObject({
      matched: total,
      capped: false,
      processed: total,
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

  it('previews the bounded number without running anything', async () => {
    const { svc, logout } = build(42);
    expect(await svc.bulkPreview({ status: 'suspended' })).toEqual({
      matched: 42,
      capped: false,
      cap: BULK_PREVIEW_CAP,
    });
    expect(logout).not.toHaveBeenCalled();
  });

  it('previews «capped» when more than the cap match', async () => {
    const { svc, findMany } = build(BULK_PREVIEW_CAP + 1);
    expect(await svc.bulkPreview({ role: 'attorney' })).toEqual({
      matched: BULK_PREVIEW_CAP,
      capped: true,
      cap: BULK_PREVIEW_CAP,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

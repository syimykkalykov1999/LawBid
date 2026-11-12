import { BadRequestException } from '@nestjs/common';
import { AdminUsersService, USERS_BULK_MAX } from './admin-users.service';

/** Owner 2026-11-12: an explicit id list has no cap for the owner. */
describe('AdminUsersService.bulk with ids', () => {
  function build() {
    const svc = Object.create(AdminUsersService.prototype) as AdminUsersService;
    Object.assign(svc, { audit: { record: jest.fn() } });
    const logout = jest
      .spyOn(svc, 'revokeSessions')
      .mockResolvedValue({} as never);
    return { svc, logout };
  }
  const ids = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `00000000-0000-4000-8000-${`${i}`.padStart(12, '0')}`,
    );

  it('the owner acts on more ids than the staff cap', async () => {
    const { svc, logout } = build();
    const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
    const out = await svc.bulk(owner, {
      action: 'logout',
      ids: ids(USERS_BULK_MAX * 2 + 1),
      reason: '',
    } as never);
    expect(out.done).toHaveLength(USERS_BULK_MAX * 2 + 1);
    expect(logout).toHaveBeenCalledTimes(USERS_BULK_MAX * 2 + 1);
  });

  it('staff keep the cap of 500', async () => {
    const { svc, logout } = build();
    const staff = { id: 's', ip: null, adminRole: 'support' } as never;
    await expect(
      svc.bulk(staff, {
        action: 'logout',
        ids: ids(USERS_BULK_MAX + 1),
        reason: '',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(logout).not.toHaveBeenCalled();
    const ok = await svc.bulk(staff, {
      action: 'logout',
      ids: ids(USERS_BULK_MAX),
      reason: '',
    } as never);
    expect(ok.done).toHaveLength(USERS_BULK_MAX);
  });
});

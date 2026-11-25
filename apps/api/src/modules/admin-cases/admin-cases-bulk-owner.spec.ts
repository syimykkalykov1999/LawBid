import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { AdminCaseManagementController } from './admin-case-management.controller';

/** Owner 2026-11-12: the owner acts on any number of cases at once. */
describe('admin cases bulk without a cap for the owner', () => {
  function build() {
    const act = jest.fn().mockResolvedValue(undefined);
    const ctl = Object.create(
      AdminCaseManagementController.prototype,
    ) as AdminCaseManagementController;
    // Round 4 (С5): the bulk action asks a fresh 2FA code (given here).
    const auth = { assertStepUp: jest.fn().mockResolvedValue(undefined) };
    Object.assign(ctl, { cases: { act }, auth });
    return { ctl, act };
  }
  const ids = (n: number) => Array.from({ length: n }, () => randomUUID());

  it('the owner hides 1 000 cases', async () => {
    const { ctl, act } = build();
    const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
    const out = await ctl.bulkAdminCases(owner, {
      action: 'hide',
      ids: ids(1000),
      reason: 'reason!!',
    } as never);
    expect(out.done).toHaveLength(1000);
    expect(act).toHaveBeenCalledTimes(1000);
  });

  it('staff keep 500', async () => {
    const { ctl, act } = build();
    const staff = { id: 's', ip: null, adminRole: 'support' } as never;
    await expect(async () =>
      ctl.bulkAdminCases(staff, {
        action: 'hide',
        ids: ids(501),
        reason: 'reason!!',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(act).not.toHaveBeenCalled();
  });
});

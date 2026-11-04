import { ForbiddenException } from '@nestjs/common';
import { CaseCommentsService } from './case-comments.service';

/** Owner 2026-11-03 (R-366): a case is private, it is never shared. */
describe('case share is closed', () => {
  it('answers 403 (no role is checked, it is closed for all) and stores / counts nothing', async () => {
    const prisma = { caseShare: { create: jest.fn() } };
    const counters = { bump: jest.fn() };
    const limits = { consume: jest.fn() };
    const svc = new CaseCommentsService(
      prisma as never,
      { assertCanView: jest.fn() } as never,
      limits as never,
      counters as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      { check: jest.fn() },
    );
    await expect(svc.shareCase('case1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.caseShare.create).not.toHaveBeenCalled();
    expect(counters.bump).not.toHaveBeenCalled();
  });
});

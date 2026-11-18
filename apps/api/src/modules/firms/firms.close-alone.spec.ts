/* eslint-disable @typescript-eslint/require-await */
import { FirmsService } from './firms.service';

/**
 * Final pass 18.11 (FO6): the owner leaves while alone, so the firm closes.
 * The "alone?" check took the firm row lock in its own short transaction
 * and deleted the firm after that commit: an invitation accepted in between
 * (accepts take the same lock) still lost its new member. The check, the
 * reads and the delete now share one transaction under the lock.
 */
describe('FirmsService closeFirm (alone): check and delete under one lock', () => {
  function client() {
    return {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      firmMember: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([{ attorney_id: 'owner' }]),
      },
      firmInvitation: { findMany: jest.fn().mockResolvedValue([]) },
      firm: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it('FO6: the firm is deleted inside the locked transaction', async () => {
    const tx = client();
    const outer = {
      ...client(),
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const svc = new FirmsService(outer as never);
    await (
      svc as unknown as {
        closeFirm: (f: string, a: string, alone: boolean) => Promise<void>;
      }
    ).closeFirm('f1', 'owner', true);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.firm.deleteMany).toHaveBeenCalledWith({ where: { id: 'f1' } });
    expect(outer.firm.deleteMany).not.toHaveBeenCalled();
  });

  it('a lawyer who joined meanwhile keeps the firm (409, nothing deleted)', async () => {
    const tx = client();
    tx.firmMember.count.mockResolvedValue(1);
    const outer = {
      ...client(),
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const svc = new FirmsService(outer as never);
    await expect(
      (
        svc as unknown as {
          closeFirm: (f: string, a: string, alone: boolean) => Promise<void>;
        }
      ).closeFirm('f1', 'owner', true),
    ).rejects.toMatchObject({
      response: { code: 'FIRM_OWNER_MUST_TRANSFER' },
    });
    expect(tx.firm.deleteMany).not.toHaveBeenCalled();
    expect(outer.firm.deleteMany).not.toHaveBeenCalled();
  });
});

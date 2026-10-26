import { AttorneyTrustService } from './attorney-trust.service';

/**
 * Owner 2026-10-05 06:07: an attorney who loses the badge because the rules
 * got stricter is told once. recomputeAll() must judge "lost the badge" by
 * what the recompute itself replaced, not by its own batch read: a long
 * background run (a preset saved a minute earlier) reaches the attorney
 * after the row changed, and the stale read hid the change — nobody told
 * the attorney (CI flake on owner-attorney-trust, 2026-10-22).
 */
describe('AttorneyTrustService.recomputeAll — rule-change notice', () => {
  const ID = '00000000-0000-4000-8000-000000000001';

  function make(found: { level: number; badge: boolean }) {
    const emit = jest.fn().mockResolvedValue({ id: 'n1' });
    const prisma = {
      attorneyProfile: {
        // The batch was read before the attorney got the badge.
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { user_id: ID, trust_level: 1, trust_badge: false },
          ])
          .mockResolvedValue([]),
      },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new AttorneyTrustService(
      prisma as never,
      {} as never,
      { emit } as never,
      {} as never,
      {} as never,
      {} as never,
      { warn: jest.fn(), info: jest.fn() } as never,
    );
    jest
      .spyOn(svc, 'recompute')
      .mockImplementation((_id, _actor, _tx, seen) => {
        if (seen) {
          seen.level = found.level;
          seen.badge = found.badge;
        }
        return Promise.resolve({
          level: 1,
          badge: false,
          missing: ['registry', 'identity'],
        } as never);
      });
    return { svc, emit };
  }

  it('tells the attorney whose badge this run dropped, even when the batch read was stale', async () => {
    const { svc, emit } = make({ level: 1, badge: true });
    const res = await svc.recomputeAll(200, { notifyNewlyRequired: true });
    expect(res).toEqual({ attorneys: 1, changed: 1 });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'verification_update',
        recipientId: ID,
        payload: expect.objectContaining({
          kind: 'trust_requirements_changed',
          missing: ['registry', 'identity'],
        }),
      }),
    );
  });

  it('says nothing when another run already dropped the badge (that run told them)', async () => {
    const { svc, emit } = make({ level: 1, badge: false });
    const res = await svc.recomputeAll(200, { notifyNewlyRequired: true });
    expect(res).toEqual({ attorneys: 1, changed: 0 });
    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing without notifyNewlyRequired (the nightly safety net)', async () => {
    const { svc, emit } = make({ level: 1, badge: true });
    await svc.recomputeAll(200);
    expect(emit).not.toHaveBeenCalled();
  });
});

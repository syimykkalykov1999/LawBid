import { AttorneyTrustService } from './attorney-trust.service';

/**
 * Verify batch 13 (X11): the nightly "recompute everyone" reads a page of
 * attorneys at once and only runs recompute() (a read + a transaction each)
 * for an attorney whose level or badge would change — or whose row changed
 * since the page was read. Unchanged attorneys get the daily stamp in one
 * statement.
 */
describe('AttorneyTrustService.recomputeAll — one read per page', () => {
  const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const day = 24 * 3600 * 1000;
  /** Level 0, no badge: nothing confirmed (what evaluate() computes). */
  const profile = (n: number, over: Record<string, unknown> = {}) => ({
    user_id: id(n),
    verification_status: 'pending',
    name_mismatch: false,
    trust_level: 0,
    trust_badge: false,
    user: { first_name: 'A', last_name: 'B', country_code: 'US' },
    licenses: [],
    verification_requests: [],
    trust: {
      attorney_id: id(n),
      level: 0,
      license_confirmed_at: null,
      documents_verified_at: null,
      stripe_kyc_at: null,
      stripe_charges_enabled: false,
      name_check: 'unknown',
      firm_link_status: 'none',
      staff_cleared_at: null,
      computed_at: new Date(Date.now() - 2 * day),
    },
    ...over,
  });

  function make(page: unknown[], current: unknown[]) {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce(page) // the page
      .mockResolvedValueOnce(current) // the stale-read check
      .mockResolvedValue([]);
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      attorneyProfile: { findMany },
      attorneyTrust: { updateMany },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const settings = {
      boolean: jest.fn((k: string) => Promise.resolve(k === 'trust.enabled')),
    };
    const svc = new AttorneyTrustService(
      prisma as never,
      settings as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      { warn: jest.fn(), info: jest.fn() } as never,
    );
    const recompute = jest
      .spyOn(svc, 'recompute')
      .mockResolvedValue({ level: 1, badge: false, missing: [] } as never);
    return { svc, findMany, updateMany, recompute };
  }

  it('200 unchanged attorneys: no per-attorney recompute, one stamp statement', async () => {
    const page = Array.from({ length: 50 }, (_, i) => profile(i + 1));
    const current = page.map((p) => ({
      user_id: p.user_id,
      trust_level: 0,
      trust_badge: false,
    }));
    const { svc, recompute, updateMany } = make(page, current);
    const res = await svc.recomputeAll(200);
    expect(res).toEqual({ attorneys: 50, changed: 0 });
    expect(recompute).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0] as {
      where: { attorney_id: { in: string[] } };
    };
    expect(arg.where.attorney_id.in).toHaveLength(50);
  });

  it('only the attorney whose level changes, and the one changed since the read, are recomputed', async () => {
    const page = [
      profile(1),
      // The stored level is stale: evaluate() says 0.
      profile(2, { trust_level: 2 }),
      profile(3),
    ];
    const current = [
      { user_id: id(1), trust_level: 0, trust_badge: false },
      // Another recompute gave the badge after the page was read.
      { user_id: id(3), trust_level: 1, trust_badge: true },
    ];
    const { svc, recompute } = make(page, current);
    await svc.recomputeAll(200);
    expect(recompute.mock.calls.map((c) => c[0])).toEqual([id(2), id(3)]);
  });
});

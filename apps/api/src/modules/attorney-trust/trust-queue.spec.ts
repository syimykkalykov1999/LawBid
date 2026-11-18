import { AdminTrustService } from './admin-trust.service';
import { AttorneyTrustService } from './attorney-trust.service';

/**
 * Verify 17.11 (batch 9): the staff queue («Борьба с мошенниками») is
 * documented as oldest first, but it read the 2000 lowest ids of each fact
 * and cut the union to 2000 by id — an attorney with a high id never got in
 * past 2000 candidates, however long they had waited.
 */
describe('AttorneyTrustService.queue — every candidate, oldest first', () => {
  const N = 2_100;
  const id = (i: number) =>
    `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  // The longest wait belongs to the attorney with the HIGHEST id.
  const waitedSince = (i: number) =>
    new Date(Date.UTC(2026, 0, 1) + (N - i) * 60_000);

  function setup() {
    const all = Array.from({ length: N }, (_, i) => ({ user_id: id(i) }));
    const findMany = jest.fn(
      (args: {
        where: { user_id?: { in: string[] }; AND?: Record<string, unknown>[] };
        take?: number;
      }) => {
        if (args.where.user_id?.in) {
          return Promise.resolve(
            args.where.user_id.in.map((u) => ({
              user_id: u,
              verification_requests: [],
            })),
          );
        }
        const gt = (args.where.AND ?? [])
          .map((c) => (c.user_id as { gt?: string } | undefined)?.gt)
          .find(Boolean);
        const rows = all.filter((r) => !gt || r.user_id > gt);
        return Promise.resolve(rows.slice(0, args.take ?? rows.length));
      },
    );
    const svc = Object.create(
      AttorneyTrustService.prototype,
    ) as AttorneyTrustService;
    Object.assign(svc, { prisma: { attorneyProfile: { findMany } } });
    (
      svc as unknown as {
        snapshotOf: (r: { user_id: string }) => Promise<unknown>;
      }
    ).snapshotOf = (r) => {
      const i = Number(r.user_id.slice(-12));
      return Promise.resolve({
        attorneyId: r.user_id,
        staffStatus: 'needs_staff',
        queueReasons: ['name_mismatch'],
        holds: { paymentsAt: waitedSince(i), bidsAt: null },
        firmLink: { at: null },
        documentsRequestedAt: null,
      });
    };
    return svc;
  }

  it('the attorney waiting longest comes first, even with the highest id past 2000', async () => {
    const out = await setup().queue({ limit: 3 });
    expect(out.map((s) => s.attorneyId)).toEqual([
      id(N - 1),
      id(N - 2),
      id(N - 3),
    ]);
  });
});

/**
 * Verify 17.11 (batch 9): «Пересчитать всех» ran one serializable
 * recompute per attorney inside the HTTP request. It is a background job.
 */
describe('AdminTrustService.recomputeAll — handed to the worker', () => {
  function setup(queued: boolean) {
    const add = jest.fn().mockResolvedValue(queued);
    const recomputeAll = jest
      .fn()
      .mockResolvedValue({ attorneys: 3, changed: 1 });
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = Object.create(AdminTrustService.prototype) as AdminTrustService;
    Object.assign(svc, {
      trust: { recomputeAll },
      audit: { record },
      oneOff: { add },
    });
    return { svc, add, recomputeAll };
  }
  const admin = { id: 'adm-1', ip: '127.0.0.1' } as never;

  it('queues one job (fixed id) and does not recompute in the request', async () => {
    const h = setup(true);
    await expect(h.svc.recomputeAll(admin)).resolves.toMatchObject({
      queued: true,
    });
    expect(h.add).toHaveBeenCalledWith(
      'trust.recompute-all',
      {},
      'trust-recompute-all',
      0,
    );
    expect(h.recomputeAll).not.toHaveBeenCalled();
  });

  it('without Redis it runs here as before', async () => {
    const h = setup(false);
    await expect(h.svc.recomputeAll(admin)).resolves.toEqual({
      attorneys: 3,
      changed: 1,
      queued: false,
    });
  });
});

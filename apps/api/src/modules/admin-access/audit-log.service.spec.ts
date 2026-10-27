import type { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { TOTALS_BUTTON_COOLDOWN_MS } from '../admin/dashboard.service';
import { AUDIT_CHAIN_SUMMARY_KEY, AuditLogService } from './audit-log.service';

const CHECK = { checked: 3, brokenAtSeq: null, headHash: 'h3', headSeq: 3 };
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function make(stored: { data: unknown; computedAt: string } | null) {
  const queryRaw = jest.fn().mockResolvedValue([]);
  const prisma = {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: jest.fn(),
        $queryRaw: queryRaw,
        auditLog: {
          findFirst: jest.fn().mockResolvedValue({ seq: 3n, row_hash: 'h3' }),
          count: jest.fn().mockResolvedValue(3),
        },
      }),
  };
  const summary = {
    peek: jest.fn().mockResolvedValue(stored),
    refresh: jest.fn(async (_k: string, c: () => Promise<unknown>) => ({
      data: await c(),
      computedAt: new Date().toISOString(),
    })),
  };
  const svc = new AuditLogService(
    prisma as unknown as PrismaService,
    summary as unknown as AdminSummaryService,
  );
  return { svc, summary, queryRaw, prisma };
}

describe('AuditLogService.verifyChain (stored snapshot)', () => {
  it('answers from the stored check inside the 10-minute cooldown', async () => {
    const { svc, summary, queryRaw } = make({
      data: CHECK,
      computedAt: ago(TOTALS_BUTTON_COOLDOWN_MS - 60_000),
    });
    expect(await svc.verifyChain()).toEqual(CHECK);
    expect(summary.refresh).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('re-checks after the cooldown and when nothing is stored', async () => {
    const stale = make({
      data: CHECK,
      computedAt: ago(TOTALS_BUTTON_COOLDOWN_MS + 60_000),
    });
    expect(await stale.svc.verifyChain()).toEqual(CHECK);
    expect(stale.summary.refresh).toHaveBeenCalledWith(
      AUDIT_CHAIN_SUMMARY_KEY,
      expect.any(Function),
      true,
    );
    const cold = make(null);
    await cold.svc.verifyChain();
    expect(cold.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('the nightly export always re-checks and stores the result', async () => {
    const { svc, summary, queryRaw } = make({
      data: CHECK,
      computedAt: ago(1_000),
    });
    await svc.verifyChain({ fresh: true });
    expect(summary.refresh).toHaveBeenCalledWith(
      AUDIT_CHAIN_SUMMARY_KEY,
      expect.any(Function),
      false,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('without the summary store it checks directly', async () => {
    const svc = new AuditLogService(
      make(null).prisma as unknown as PrismaService,
    );
    expect(await svc.verifyChain()).toEqual(CHECK);
  });
});

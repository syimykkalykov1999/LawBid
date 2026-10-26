import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { CaseBidsService } from './case-bids.service';

/** Owner 2026-10-22 (delta audit D-P4): GET /cases/:id/bids?updatedSince
 * answers only the bids changed since, no paging, meta.syncedAt moves on. */
describe('CaseBidsService delta (updatedSince)', () => {
  const since = new Date(Date.now() - 3_600_000);
  const at = (m: number) => new Date(since.getTime() + m * 60_000);
  const client = { sub: 'client-1', role: 'client' } as RequestUser;

  const bidRow = (id: string, updated: Date) => ({
    id,
    case_id: 'case-1',
    attorney_id: 'a1',
    status: 'active',
    fee_type: 'fixed',
    amount_cents: 5000,
    percent_bps: null,
    message: null,
    start_availability: 'immediately',
    start_date: null,
    estimated_duration_days: null,
    round_count: 1,
    version: 1,
    turn: 'client',
    outside_practice: false,
    outside_licensed_states: [],
    decided_at: null,
    created_at: at(-10),
    updated_at: updated,
    attorney: {
      first_name: 'A',
      last_name: 'B',
      avatar_file_id: null,
      attorney_profile: null,
    },
  });

  function setup(rows: unknown[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = {
      bid: { findMany },
      case: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const access = {
      decide: jest.fn().mockResolvedValue({ kind: 'owner' }),
    };
    const files = {
      avatarUrls: jest.fn().mockResolvedValue({ url256: null }),
    };
    const service = new CaseBidsService(
      prisma as never,
      access as never,
      files as never,
    );
    return { service, findMany };
  }

  it('returns only the changed bids, newest change first, in one query', async () => {
    const { service, findMany } = setup([
      bidRow('b2', at(7)),
      bidRow('b1', at(2)),
    ]);
    const out = await service.list(client, 'case-1', {
      updatedSince: since.toISOString(),
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      case_id: 'case-1',
      updated_at: { gte: since },
    });
    expect(out.items.map((b) => b.id)).toEqual(['b2', 'b1']);
    expect(out.nextCursor).toBeNull();
    expect(out.deletedIds).toEqual([]);
    expect(out.syncedAt).toBe(at(7).toISOString());
  });

  it('nothing changed: empty answer, syncedAt stays at since', async () => {
    const { service } = setup([]);
    const out = await service.list(client, 'case-1', {
      updatedSince: since.toISOString(),
    });
    expect(out).toEqual({
      items: [],
      nextCursor: null,
      deletedIds: [],
      syncedAt: since.toISOString(),
    });
  });

  it('older than 7 days is 409 SYNC_TOO_OLD', async () => {
    const { service } = setup([]);
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await expect(
      service.list(client, 'case-1', { updatedSince: old }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('without updatedSince it is the paged list as before', async () => {
    const { service, findMany } = setup([bidRow('b1', at(1))]);
    const out = await service.list(client, 'case-1', {});
    expect(findMany.mock.calls[0][0].take).toBe(21);
    expect(out.deletedIds).toBeUndefined();
    expect(out.syncedAt).toBeUndefined();
  });
});

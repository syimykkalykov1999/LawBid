import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
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

  // The light price list (select, no include) feeds the best-price and
  // low-offer flags; the bid rows themselves come from the include query.
  const isRowsQuery = (a: { include?: unknown }) => a.include !== undefined;

  function setup(rows: unknown[]) {
    const findMany = jest.fn((a: { include?: unknown }) =>
      Promise.resolve(isRowsQuery(a) ? rows : []),
    );
    const rowCalls = () =>
      findMany.mock.calls
        .map((c) => c[0])
        .filter((a: { include?: unknown }) => isRowsQuery(a)) as Array<{
        where: unknown;
        take: number;
      }>;
    const setting = (k: string) =>
      Promise.resolve(APP_SETTINGS[k as keyof typeof APP_SETTINGS]);
    const settings = { number: setting, string: setting, boolean: setting };
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
      settings as never,
    );
    return { service, rowCalls };
  }

  it('returns only the changed bids, newest change first, in one rows query', async () => {
    const { service, rowCalls } = setup([
      bidRow('b2', at(7)),
      bidRow('b1', at(2)),
    ]);
    const out = await service.list(client, 'case-1', {
      updatedSince: since.toISOString(),
    });
    expect(rowCalls()).toHaveLength(1);
    const arg = rowCalls()[0];
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
    const { service, rowCalls } = setup([bidRow('b1', at(1))]);
    const out = await service.list(client, 'case-1', {});
    expect(rowCalls()[0].take).toBe(21);
    expect(out.deletedIds).toBeUndefined();
    expect(out.syncedAt).toBeUndefined();
  });
});

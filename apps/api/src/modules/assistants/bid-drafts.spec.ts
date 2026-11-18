import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BidDraftsService } from './bid-drafts';

/**
 * Verify 17.11, batch 6 (A5): "the assistant prepared a bid" is sent once
 * per draft. The decision came from a read before the upsert, so two
 * parallel saves both saw "no draft yet" and both notified. It now comes
 * from the write itself (the INSERT that created the row).
 */
describe('BidDraftsService.put — the attorney hears once per draft', () => {
  const assistant = {
    sub: 'atty-1',
    role: 'attorney',
    assistant: {
      userId: 'asst-1',
      membershipId: 'm1',
      name: 'Pat',
      duties: ['bid_drafts'],
    },
  } as unknown as RequestUser;

  function setup() {
    const drafts = new Map<string, Record<string, unknown>>();
    const keyOf = (w: {
      attorney_id_case_id: { attorney_id: string; case_id: string };
    }) =>
      `${w.attorney_id_case_id.attorney_id}:${w.attorney_id_case_id.case_id}`;
    const now = new Date();
    const bidDraft = {
      findUnique: jest.fn(
        (args: {
          where: {
            attorney_id_case_id: { attorney_id: string; case_id: string };
          };
        }) => Promise.resolve(drafts.get(keyOf(args.where)) ?? null),
      ),
      upsert: jest.fn(
        (args: {
          where: {
            attorney_id_case_id: { attorney_id: string; case_id: string };
          };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const k = keyOf(args.where);
          const prev = drafts.get(k);
          drafts.set(
            k,
            prev
              ? { ...prev, ...args.update }
              : { ...args.create, updated_at: now },
          );
          return Promise.resolve(drafts.get(k));
        },
      ),
      createMany: jest.fn(
        (args: {
          data: { attorney_id: string; case_id: string }[];
          skipDuplicates?: boolean;
        }) => {
          let count = 0;
          for (const d of args.data) {
            const k = `${d.attorney_id}:${d.case_id}`;
            if (drafts.has(k)) continue;
            drafts.set(k, { ...d, updated_at: now });
            count++;
          }
          return Promise.resolve({ count });
        },
      ),
    };
    const prisma = {
      case: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'case-1',
          status: 'open',
          deleted_at: null,
        }),
      },
      bid: { findUnique: jest.fn().mockResolvedValue(null) },
      bidDraft,
    };
    const notifications = { emit: jest.fn().mockResolvedValue({ id: 'n1' }) };
    const service = new BidDraftsService(
      prisma as never,
      notifications as never,
    );
    return { service, notifications, drafts };
  }

  it('two parallel first saves: one notification', async () => {
    const { service, notifications, drafts } = setup();
    await Promise.all([
      service.put(assistant, 'case-1', { amountCents: 100 }),
      service.put(assistant, 'case-1', { amountCents: 200 }),
    ]);
    expect(drafts.size).toBe(1);
    expect(notifications.emit).toHaveBeenCalledTimes(1);
  });

  it('a later save of the same draft is quiet; the payload is updated', async () => {
    const { service, notifications, drafts } = setup();
    await service.put(assistant, 'case-1', { amountCents: 100 });
    await service.put(assistant, 'case-1', { amountCents: 300 });
    expect(notifications.emit).toHaveBeenCalledTimes(1);
    expect(drafts.get('atty-1:case-1')).toMatchObject({
      payload: { amountCents: 300 },
    });
  });
});

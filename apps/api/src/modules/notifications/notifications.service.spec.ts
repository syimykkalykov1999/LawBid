import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_IMPORTANT,
  NotificationsService,
  notificationTypesOf,
} from './notifications.service';

describe('NotificationsService.emit (docs/05 §9.3 seam)', () => {
  function db() {
    const create = jest.fn(() => Promise.resolve({ id: 'n1' }));
    return { create, client: { notification: { create } } };
  }

  it('persists a row with the §9.2 category, through the caller transaction when given', async () => {
    const root = db();
    const tx = db();
    const service = new NotificationsService(
      root.client as unknown as PrismaService,
    );

    await expect(
      service.emit(
        {
          type: 'review_received',
          recipientId: 'u1',
          payload: { reviewId: 'r1' },
        },
        tx.client as unknown as Prisma.TransactionClient,
      ),
    ).resolves.toEqual({ id: 'n1' });

    expect(root.create).not.toHaveBeenCalled();
    expect(tx.create).toHaveBeenCalledWith({
      data: {
        user_id: 'u1',
        type: 'review_received',
        category: 'cases',
        payload: { reviewId: 'r1' },
      },
      select: { id: true },
    });
  });

  it('never stores new_message (push-only type)', async () => {
    const root = db();
    const service = new NotificationsService(
      root.client as unknown as PrismaService,
    );
    await expect(
      service.emit({ type: 'new_message', recipientId: 'u1', payload: {} }),
    ).resolves.toBeNull();
    expect(root.create).not.toHaveBeenCalled();
  });

  it('maps review types to the cases category (docs/05 §9.2)', () => {
    expect(NOTIFICATION_CATEGORY.review_requested).toBe('cases');
    expect(NOTIFICATION_CATEGORY.review_received).toBe('cases');
    expect(NOTIFICATION_CATEGORY.verification_update).toBe('system');
  });

  it('maps case_updated (docs/04 §14) to the cases category (docs/05 §9.2)', () => {
    expect(NOTIFICATION_CATEGORY.case_updated).toBe('cases');
  });
});

describe('Bell tabs (owner 2026-10-06)', () => {
  it('a hire is important; likes, follows and logins are not', () => {
    expect(NOTIFICATION_IMPORTANT.bid_accepted).toBe(true);
    expect(NOTIFICATION_IMPORTANT.offer_accepted).toBe(true);
    for (const t of [
      'post_like',
      'new_follower',
      'followed_post',
      'security_new_device',
    ] as const) {
      expect(NOTIFICATION_IMPORTANT[t]).toBe(false);
    }
    const important = notificationTypesOf(true);
    const other = notificationTypesOf(false);
    expect(important).toContain('bid_accepted');
    expect(other).toContain('post_like');
    expect(important.filter((t) => other.includes(t))).toEqual([]);
  });
});

/** Row 63 (like spike 12.11): a like's notification does not repeat the
 * block check the like itself just made; every other caller keeps it. */
describe('NotificationsService.emit block check (row 63)', () => {
  const AUTHOR = '0b7c2a4e-1d3f-4a5b-8c6d-7e8f9a0b1c2d';
  function setup(blocked: boolean) {
    const findFirst = jest.fn(() =>
      Promise.resolve(blocked ? { blocker_id: 'author' } : null),
    );
    const queryRaw = jest.fn(() => Promise.resolve([{ id: 'n1', n: 1 }]));
    const prisma = { userBlock: { findFirst }, $queryRaw: queryRaw };
    const push = { enqueue: jest.fn(() => Promise.resolve()) };
    const badges = {
      invalidateNotifications: jest.fn(() => Promise.resolve()),
    };
    const redis = { set: jest.fn(() => Promise.resolve<string | null>('OK')) };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
      push as never,
      badges as never,
      redis as never,
    );
    return { service, findFirst, queryRaw, push, badges, redis };
  }
  const like = {
    type: 'post_like' as const,
    recipientId: AUTHOR,
    payload: { postId: 'p1', actorId: 'me' },
  };

  it('a like that already checked the pair: no second user_blocks read, the row and push still go out', async () => {
    const { service, findFirst, queryRaw, push, badges } = setup(false);
    await expect(
      service.emit({ ...like, actorBlockChecked: true }),
    ).resolves.toEqual({ id: 'n1' });
    expect(findFirst).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(badges.invalidateNotifications).toHaveBeenCalledWith(AUTHOR);
    expect(push.enqueue).toHaveBeenCalledWith('n1', 'post_like', 1, AUTHOR);
  });

  it('without the flag the block check stays and a block stops the row', async () => {
    const { service, findFirst, queryRaw, push } = setup(true);
    await expect(service.emit(like)).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(push.enqueue).not.toHaveBeenCalled();
  });

  it('the flag is never written into the stored payload', async () => {
    const { service, queryRaw } = setup(false);
    await service.emit({ ...like, actorBlockChecked: true });
    const values = (queryRaw.mock.calls[0] as unknown[]).slice(1);
    expect(JSON.stringify(values)).not.toContain('actorBlockChecked');
  });

  it('a repeat like the same day (like, unlike, like) stores nothing', async () => {
    const { service, redis, queryRaw } = setup(false);
    redis.set.mockResolvedValueOnce(null);
    await expect(
      service.emit({ ...like, actorBlockChecked: true }),
    ).resolves.toBeNull();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
